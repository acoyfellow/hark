import { Agent, type Connection, type ConnectionContext, type WSMessage } from 'agents';
import { type TextSource, type VoiceTurnContext, WorkersAIFluxSTT, withVoice } from 'agents/voice';
import {
  BRAINS,
  type Beat,
  isGatewayBrain,
  type Brain,
  type ClientFrame,
  DEFAULT_BRAIN,
  FALLBACK_BRAIN,
  DEFAULT_ENGINE,
  DEFAULT_VOICE,
  decodeClientFrame,
  encodeServerFrame,
  type McpServer,
  type ServerFrame,
  type Settings,
  type SpeechEngine,
  SPEECH_SAMPLE_RATE,
  VOICES,
  type Voice,
  voicesFor,
} from '../shared/protocol';
import { refreshedToken, TOKEN_REFRESH_MARGIN_MS } from './auth/refresh';
import { DIRECTORY_NAME, type Grant } from './directory';
import { type Env, LOCAL_HEADER, TRACE_HEADER, LOCAL_OWNER, OWNER_HEADER } from './env';
import { systemPrompt } from './prompt';
import { type ReplyPorts, type ReplyResult, reply } from './reply';
import { speakable } from './sentences';
import { UserSpeech } from './speech';
import { parseArguments, runTool, type ToolHost, toolLabel, toolSchemas, TOOLS } from './tools';
import type { ChatMessage } from './chat';
import { CLOUDFLARE_ORIGINS, type Credentials, type Origins, type Upstream, UpstreamFailed, upstream } from './upstream';
import { userAI } from './user-ai';
import type { McpPort } from './tools';
import { checkServerUrl, checkToken, MAX_MCP_SERVERS, MCP_CALLBACK_PATH, serverName } from './mcp-servers';

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
import { COMPUTER_IMAGE, type Computer, sandboxComputer } from './computer';
import { pageText, pageTitle } from './page-text';
import { parseResults, searchCommand } from './web-results';
import { MAX_FILE_BYTES, runOnBench } from './workbench';
import { EchoGatedTranscriber, SpokenRecord } from './echo-gate';

const HISTORY_KEEP = 24;

const SNAP_TIMEOUT_MS = 6_000;

const EAGER_EOT_THRESHOLD = 0.5;

const VoiceAgent = withVoice(Agent, {
  audioFormat: 'pcm16',
  sampleRate: SPEECH_SAMPLE_RATE,
  historyLimit: HISTORY_KEEP,
  speculativeTurns: true,
});

type Caller = { owner: string; local: boolean; traced: boolean; timeZone: string; locale: string; camera: boolean; firstTurn: boolean };

const isBrain = (value: string): value is Brain => BRAINS.some((brain) => brain.id === value);

const isVoice = (value: string): value is Voice => VOICES.some((voice) => voice === value);

const engineOf = (value: string): SpeechEngine => (value === 'aura-2' ? 'aura-2' : DEFAULT_ENGINE);

const fitVoice = (voice: Voice, engine: SpeechEngine): Voice =>
  voicesFor(engine).includes(voice) ? voice : engine === 'aura-1' ? DEFAULT_VOICE : 'luna';

const NOT_ALLOWED = /not allowed to access|5018|No such model|not found/iu;

const isBrainRefused = (cause: unknown, brain: Brain) =>
  cause instanceof UpstreamFailed &&
  (isGatewayBrain(brain) ? cause.status >= 400 && cause.status !== 401 : cause.status === 403 || cause.status === 404 || (cause.status === 400 && NOT_ALLOWED.test(cause.message)));

const THINKS_BEFORE_TOOLS: readonly Brain[] = ['@cf/moonshotai/kimi-k3'];

const thinkingOptions = (brain: Brain): Record<string, unknown> =>
  isGatewayBrain(brain)
    ? {}
    : brain.startsWith('@cf/openai/gpt-oss')
    ? { reasoning_effort: 'low' }
    : THINKS_BEFORE_TOOLS.includes(brain)
      ? {}
      : { chat_template_kwargs: { enable_thinking: false } };

const SIGNED_OUT = /sign-in expired/u;

const replyTokenBudget = (brain: Brain) => (isGatewayBrain(brain) ? 4000 : THINKS_BEFORE_TOOLS.includes(brain) ? 2400 : 2000);

export class Hark extends VoiceAgent<Env> {
  private callers = new Map<string, Caller>();

  private origin: string | null = null;

  private live: Upstream | null = null;

  private readonly spokenRecord = new SpokenRecord();

  private gateTraced = false;

  private grant: Grant | null = null;

  private readonly refusedBrains = new Set<Brain>();

  private brainInUse(): Brain {
    const { brain } = this.settings();

    return this.refusedBrains.has(brain) ? FALLBACK_BRAIN : brain;
  }

  private snaps = new Map<string, (src: string | null) => void>();

  override tts = new UserSpeech(
    () => this.live,
    () => this.settings(),
  );

  override async onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS missed (label TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, content TEXT NOT NULL, at INTEGER NOT NULL)`;
  }

  override onConnect(connection: Connection, context: ConnectionContext) {
    const headers = context.request.headers;

    this.origin = new URL(context.request.url).origin;

    this.callers.set(connection.id, {
      owner: headers.get(OWNER_HEADER) ?? '',
      local: headers.get(LOCAL_HEADER) === '1',
      traced: headers.get(TRACE_HEADER) === '1',
      timeZone: 'UTC',
      locale: 'en-US',
      camera: false,
      firstTurn: true,
    });
  }

  override onClose(connection: Connection) {
    this.callers.delete(connection.id);

    for (const resolve of this.snaps.values()) resolve(null);

    this.snaps.clear();
  }

  override onMessage(connection: Connection, message: WSMessage) {
    if (typeof message !== 'string') return;

    const decoded = decodeClientFrame(message);

    if (decoded._tag === 'Some') this.onFrame(connection, decoded.value);
  }

  private caller(connection: Connection): Caller {
    const found = this.callers.get(connection.id);

    if (found !== undefined) return found;

    const fresh: Caller = { owner: '', local: false, traced: false, timeZone: 'UTC', locale: 'en-US', camera: false, firstTurn: true };

    this.callers.set(connection.id, fresh);

    return fresh;
  }

  private send(connection: Connection, frame: ServerFrame) {
    try {
      connection.send(encodeServerFrame(frame));
    } catch {}
  }

  private onFrame(connection: Connection, frame: ClientFrame) {
    const caller = this.caller(connection);

    switch (frame._tag) {
      case 'Hello':
        caller.timeZone = frame.timeZone;
        caller.locale = frame.locale;
        caller.camera = frame.camera;
        return;
      case 'Snapped':
        this.snaps.get(frame.id)?.(frame.src);
        this.snaps.delete(frame.id);
        return;
      case 'Configure':
        this.saveSettings(frame.settings);
        return;
      case 'Camera':
        caller.camera = frame.on;
        return;
      case 'Played':
      case 'Hush':
        return;
      case 'ListServers':
        this.send(connection, { _tag: 'Servers', servers: this.serverList() });
        return;
      case 'AddServer':
        void this.addServer(frame.name, frame.url, frame.token, this.origin).then((outcome) => this.send(connection, { _tag: 'ServerNote', note: outcome.note, authUrl: outcome.authUrl }));
        return;
      case 'RemoveServer':
        void this.removeServer(frame.id).then((note) => this.send(connection, { _tag: 'ServerNote', note, authUrl: null }));
        return;
    }
  }

  settings(): Settings {
    const rows = this.sql<{ key: string; value: string }>`SELECT key, value FROM settings`;
    const voice = rows.find((row) => row.key === 'voice')?.value ?? '';
    const brain = rows.find((row) => row.key === 'brain')?.value ?? '';
    const engine = engineOf(rows.find((row) => row.key === 'engine')?.value ?? '');

    return { voice: fitVoice(isVoice(voice) ? voice : DEFAULT_VOICE, engine), brain: isBrain(brain) ? brain : DEFAULT_BRAIN, engine };
  }

  private saveSettings(settings: Settings) {
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('voice', ${fitVoice(settings.voice, settings.engine)})`;
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('brain', ${settings.brain})`;
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('engine', ${settings.engine})`;
  }

  private memories(): string[] {
    return this.sql<{ text: string }>`SELECT text FROM memories ORDER BY id`.map((row) => row.text);
  }

  private origins(caller: Caller): Origins {
    const fake = this.env.HARK_FAKE_ORIGIN ?? '';

    return caller.local && fake !== '' ? { api: fake } : CLOUDFLARE_ORIGINS;
  }

  private async grantFor(caller: Caller): Promise<Grant | null> {
    if (caller.local)
      return {
        owner: LOCAL_OWNER,
        email: null,
        accountId: this.env.LOCAL_CF_ACCOUNT ?? 'local',
        accountName: 'Local account',
        accessToken: this.env.LOCAL_CF_TOKEN ?? 'local',
        refreshToken: null,
        expiresAt: Number.MAX_SAFE_INTEGER,
        scope: '',
      };

    this.grant = await this.env.DIRECTORY.getByName(DIRECTORY_NAME).grantFor(caller.owner);

    return this.grant;
  }

  private credentials(caller: Caller, grant: Grant): Credentials {
    const refresh = async () => {
      const directory = this.env.DIRECTORY.getByName(DIRECTORY_NAME);
      const token = await refreshedToken(this.env, this.grant ?? grant, directory);

      this.grant = await directory.grantFor(caller.owner);

      return token;
    };

    return {
      accountId: grant.accountId,
      token: async () => {
        const current = this.grant ?? grant;

        if (caller.local || current.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return current.accessToken;

        return refresh();
      },
      refresh: async () => {
        if (caller.local) throw new Error('local tokens do not refresh');

        return refresh();
      },
      signedOut: () => this.signOutEveryone(),
    };
  }

  async thinkProbe(owner: string, input: { brain: Brain; say: string }) {
    const caller: Caller = { owner, local: owner === LOCAL_OWNER, traced: false, timeZone: 'UTC', locale: 'en-US', camera: false, firstTurn: false };
    const grant = await this.grantFor(caller);

    if (grant === null) return { error: 'not signed in' };

    const live = upstream(this.credentials(caller, grant), this.origins(caller));
    const started = Date.now();
    const messages = [
      { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'UTC', locale: 'en-US', memories: [], camera: false, firstTurn: false }) },
      { role: 'user', content: input.say },
    ];

    try {
      const stream = await live.chat({ model: input.brain, messages, tools: toolSchemas(), stream: true, max_tokens: replyTokenBudget(input.brain), temperature: 0.7, ...thinkingOptions(input.brain) }, AbortSignal.timeout(90_000));
      const raw = await new Response(stream).text();
      const argumentText = [...raw.matchAll(/"arguments"\s*:\s*"((?:[^"\\]|\\.)*)"/gu)].map((match) => JSON.parse(`"${match[1] ?? ''}"`) as string).join('');
      const said = [...raw.matchAll(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/gu)].map((match) => JSON.parse(`"${match[1] ?? ''}"`) as string).join('');

      return { brain: input.brain, ms: Date.now() - started, finish: [...raw.matchAll(/"finish_reason"\s*:\s*"([a-z_]+)"/gu)].map((match) => match[1]), said: said.slice(0, 300), tools: [...raw.matchAll(/"name"\s*:\s*"([a-z_]+)"/gu)].map((match) => match[1]), arguments: argumentText };
    } catch (cause) {
      return { brain: input.brain, ms: Date.now() - started, error: cause instanceof Error ? cause.message.slice(0, 400) : String(cause) };
    }
  }

  async toolProbe(name: string, args: Record<string, unknown>) {
    const connection = [...this.getConnections()][0];

    if (connection === undefined) return { error: 'no open page' };

    const tool = TOOLS.find((each) => each.name === name);

    if (tool === undefined) return { error: `no tool ${name}` };

    const result = await tool.run(args, this.toolHost(connection, this.caller(connection)));

    if (result.visual !== undefined) this.send(connection, { _tag: 'Show', visual: result.visual });

    return { content: result.content };
  }

  async benchProbe(code: string) {
    return runOnBench(this.env, this.name, code);
  }

  private async liveForBench(): Promise<Upstream> {
    if (this.live !== null) return this.live;

    const local = this.name === LOCAL_OWNER;
    const caller: Caller = { owner: this.name, local, traced: false, timeZone: 'UTC', locale: 'en-US', camera: false, firstTurn: false };
    const grant = await this.grantFor(caller);

    if (grant === null) throw new Error('hark is not signed in to a Cloudflare account');

    this.live = upstream(this.credentials(caller, grant), this.origins(caller));

    return this.live;
  }

  async benchCall(name: string, input: unknown): Promise<unknown> {
    const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
    const text = (key: string) => (typeof args[key] === 'string' ? args[key] : '');
    const port = this.mcpPort();

    if (name === 'read_file') return this.sql<{ content: string }>`SELECT content FROM files WHERE path = ${text('path')}`[0]?.content ?? null;

    if (name === 'write_file') {
      const content = text('content');

      if (content.length > MAX_FILE_BYTES) throw new Error(`files are limited to ${MAX_FILE_BYTES} characters`);

      this.sql`INSERT INTO files (path, content, at) VALUES (${text('path')}, ${content}, ${Date.now()}) ON CONFLICT(path) DO UPDATE SET content = excluded.content, at = excluded.at`;

      return { written: text('path'), bytes: content.length };
    }

    if (name === 'list_files') return this.sql<{ path: string; at: number }>`SELECT path, at FROM files ORDER BY path`;

    if (name === 'delete_file') {
      this.sql`DELETE FROM files WHERE path = ${text('path')}`;

      return { deleted: text('path') };
    }

    if (name === 'imagine') return (await this.liveForBench()).imagine(text('prompt'), AbortSignal.timeout(45_000));

    if (name === 'mcp_connect') return port.connect(text('name'), text('url'), text('token'));

    if (name === 'mcp_tools') return port.tools();

    if (name === 'mcp_call') return port.call(text('server'), text('tool'), typeof args.args === 'object' && args.args !== null ? (args.args as Record<string, unknown>) : {});

    throw new Error(`no capability ${name}`);
  }

  private async bootedComputer(): Promise<Computer> {
    const container = this.ctx.container;

    if (container === undefined) throw new Error('This hark has no computer attached');

    const computer = sandboxComputer(container, container.images[COMPUTER_IMAGE] ?? COMPUTER_IMAGE);

    await computer.boot({});

    return computer;
  }

  private idleBeats(): Beat[] {
    const raw = this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'idle'`[0]?.value ?? '[]';

    try {
      const parsed: unknown = JSON.parse(raw);

      return Array.isArray(parsed) ? (parsed as Beat[]) : [];
    } catch {
      return [];
    }
  }

  private serverFor(wanted: string): string | null {
    const servers = Object.entries(this.getMcpServers().servers);
    const match = servers.find(([id, server]) => id === wanted || server.name.toLowerCase() === wanted.toLowerCase()) ?? (servers.length === 1 ? servers[0] : undefined);

    return match?.[0] ?? null;
  }

  private serverList(): McpServer[] {
    const state = this.getMcpServers();

    return Object.entries(state.servers).map(([id, server]) => ({
      id,
      name: server.name,
      host: hostOf(server.server_url),
      state: server.state,
      tools: state.tools.filter((tool) => tool.serverId === id).length,
      error: server.error ?? null,
      authUrl: server.state === 'authenticating' ? (server.auth_url ?? null) : null,
    }));
  }

  private announceServers() {
    const frame: ServerFrame = { _tag: 'Servers', servers: this.serverList() };

    for (const connection of this.getConnections()) this.send(connection, frame);
  }

  private async addServer(rawName: string, rawUrl: string, rawToken: string, origin: string | null): Promise<{ note: string; authUrl: string | null }> {
    const checked = checkServerUrl(rawUrl, this.name === LOCAL_OWNER);

    if (!checked.ok) return { note: checked.reason, authUrl: null };

    const token = checkToken(rawToken);

    if (token === null) return { note: 'That token has spaces or control characters in it.', authUrl: null };

    const name = serverName(rawName, checked.url);
    const existing = this.serverFor(name);

    if (existing === null && Object.keys(this.getMcpServers().servers).length >= MAX_MCP_SERVERS) return { note: `You can connect up to ${MAX_MCP_SERVERS} servers. Remove one first.`, authUrl: null };

    if (existing !== null) await this.removeMcpServer(existing);

    try {
      const added = await this.addMcpServer(name, checked.url, {
        ...(origin === null ? {} : { callbackHost: origin, callbackPath: MCP_CALLBACK_PATH }),
        transport: token === '' ? {} : { headers: { authorization: `Bearer ${token}` } },
      });

      this.announceServers();

      if (added.state === 'authenticating') return { note: `${name} needs you to sign in. Open the sign-in link.`, authUrl: added.authUrl };

      const tools = this.getMcpServers().tools.filter((tool) => tool.serverId === added.id).length;

      return { note: `${name} is connected with ${tools} tool${tools === 1 ? '' : 's'}.`, authUrl: null };
    } catch (cause) {
      this.announceServers();

      return { note: `Could not connect ${name}: ${cause instanceof Error ? cause.message.slice(0, 200) : String(cause)}`, authUrl: null };
    }
  }

  private async removeServer(wanted: string): Promise<string> {
    const id = this.serverFor(wanted);

    if (id === null) return `No connected server called ${wanted}.`;

    const name = this.getMcpServers().servers[id]?.name ?? wanted;

    await this.removeMcpServer(id);
    this.announceServers();

    return `${name} is disconnected.`;
  }

  async finishServerSignIn(request: Request): Promise<Response> {
    const handled = await this.mcp.onRequest({ request } as Parameters<typeof this.mcp.onRequest>[0]);

    this.announceServers();

    return handled ?? new Response('This sign-in link has expired. Add the server again from Settings.', { status: 400 });
  }

  private mcpPort(): McpPort {
    return {
      servers: () => this.serverList().map((server) => ({ id: server.id, name: server.name, state: server.state })),
      tools: () => {
        const names = this.getMcpServers().servers;

        return this.mcp.listTools().map((tool) => ({ server: names[tool.serverId]?.name ?? tool.serverId, name: tool.name, description: tool.description ?? '', schema: tool.inputSchema }));
      },
      connect: async (name, url, token) => {
        const outcome = await this.addServer(name, url, token, this.origin);

        return outcome.authUrl === null ? outcome.note : `${outcome.note} The link is in Settings, Your MCP servers.`;
      },
      remove: (server) => this.removeServer(server),
      call: async (server, tool, args) => {
        const serverId = this.serverFor(server);

        if (serverId === null) return `No connected server called ${server}.`;

        const result = await this.mcp.callTool({ serverId, name: tool, arguments: args });
        const parts = Array.isArray(result.content) ? result.content : [];

        return parts.map((part) => (part.type === 'text' ? part.text : `[${part.type}]`)).join('\n') || JSON.stringify(result.structuredContent ?? result);
      },
    };
  }

  private signOutEveryone() {
    for (const connection of this.getConnections()) {
      this.send(connection, { _tag: 'Fault', reason: 'Your Cloudflare sign-in has run out. Sign in again to keep talking.', fatal: true });
      connection.close(4401, 'signed out');
    }
  }

  override async beforeCallStart(connection: Connection): Promise<boolean> {
    const caller = this.caller(connection);

    try {
      const grant = await this.grantFor(caller);

      if (grant === null) {
        this.send(connection, { _tag: 'Fault', reason: 'Your Cloudflare sign-in is gone. Sign in again.', fatal: true });
        connection.close(4401, 'signed out');

        return false;
      }

      this.live = upstream(this.credentials(caller, grant), this.origins(caller));
      this.send(connection, {
        _tag: 'Ready',
        settings: this.settings(),
        account: grant.accountName,
        memories: this.memories().length,
      });
      this.send(connection, { _tag: 'Idle', beats: this.idleBeats() });

      return true;
    } catch (cause) {
      this.send(connection, { _tag: 'Fault', reason: cause instanceof Error ? cause.message : String(cause), fatal: true });

      return false;
    }
  }

  override async onCallStart(connection: Connection) {
    const missed = this.sql<{ label: string }>`SELECT label FROM missed ORDER BY at`;

    if (missed.length === 0) return;

    this.sql`DELETE FROM missed`;
    await this.speak(
      connection,
      `While you were away, your ${missed.map((row) => row.label).join(' and ')} timer${missed.length > 1 ? 's' : ''} finished.`,
    );
  }

  override onInterrupt() {
    this.spokenRecord.silenced();
  }

  override createTranscriber() {
    const flux = new WorkersAIFluxSTT(
      userAI(() => {
        if (this.live === null) throw new Error('hark is not connected to your Cloudflare account');

        return this.live;
      }),
      { keyterms: ['hark'], eotThreshold: 0.75, eagerEotThreshold: EAGER_EOT_THRESHOLD, eotTimeoutMs: 3500 },
    );

    return new EchoGatedTranscriber(flux, this.spokenRecord, (event, heard) => {
      if (this.gateTraced) console.info(JSON.stringify({ trace: event, heard }));
    });
  }

  override async beforeSynthesize(text: string): Promise<string | null> {
    const spoken = speakable(text);

    if (spoken !== '') this.spokenRecord.spoke(spoken);

    return spoken === '' ? null : spoken;
  }

  async timerDone(payload: { label: string }) {
    const inCall = [...this.getConnections()].length > 0;

    if (!inCall) {
      this.sql`INSERT INTO missed (label, at) VALUES (${payload.label}, ${Date.now()})`;
      return;
    }

    await this.speakAll(`Your ${payload.label} timer is done.`);
  }

  private toolHost(connection: Connection, caller: Caller): ToolHost {
    return {
      timeZone: caller.timeZone,
      remember: (fact) => {
        this.sql`INSERT INTO memories (text, at) VALUES (${fact}, ${Date.now()})`;

        return this.memories().length;
      },
      forget: (fact) => {
        const words = fact
          .toLowerCase()
          .split(/\s+/u)
          .filter((word) => word.length > 2);
        const doomed = this.sql<{ id: number; text: string }>`SELECT id, text FROM memories`.filter(
          (row) => words.length > 0 && words.every((word) => row.text.toLowerCase().includes(word)),
        );

        for (const row of doomed) this.sql`DELETE FROM memories WHERE id = ${row.id}`;

        return doomed.length;
      },
      setTimer: (seconds, label) => {
        void this.schedule(seconds, 'timerDone', { label });

        return Date.now() + seconds * 1000;
      },
      cancelTimer: (label) => {
        const doomed = this.getSchedules<{ label: string }>().filter((each) => each.callback === 'timerDone' && each.payload?.label === label);

        for (const each of doomed) void this.cancelSchedule(each.id);

        return doomed.length;
      },
      look: () =>
        new Promise((resolve) => {
          if (!caller.camera) {
            resolve(null);
            return;
          }

          const id = crypto.randomUUID();
          const timer = setTimeout(() => {
            this.snaps.delete(id);
            resolve(null);
          }, SNAP_TIMEOUT_MS);

          this.snaps.set(id, (src) => {
            clearTimeout(timer);
            resolve(src);
          });
          this.send(connection, { _tag: 'Snap', id });
        }),
      see: (image, question) => this.requireLive().see(image, question, AbortSignal.timeout(20_000)),
      imagine: (prompt) => this.requireLive().imagine(prompt, AbortSignal.timeout(45_000)),
      mcp: this.mcpPort(),
      runCode: async (code) => JSON.stringify(await runOnBench(this.env, this.name, code)),
      terminal: async (command) => {
        const computer = await this.bootedComputer();

        return computer.shell(command);
      },
      files: async (action, path, content) => {
        const computer = await this.bootedComputer();

        if (action === 'read') return computer.readFile(path);

        if (action === 'write') {
          await computer.writeFile(path, content);

          return `Wrote ${content.length} characters to ${path}.`;
        }

        return (await computer.list(path)).map((entry) => `${entry.type === 'directory' ? 'd' : '-'} ${entry.name}`).join('\n') || '(empty)';
      },
      cloudflare: (method, path, body) => this.requireLive().api(method, path, body, AbortSignal.timeout(30_000)),
      webSearch: async (query) => {
        const found = await this.env.WEBSEARCH?.search({ query }).catch(() => null);

        if (found !== undefined && found !== null && found.items.length > 0) return found.items.slice(0, 8).map((item) => ({ title: item.title, url: item.url, note: item.description ?? '' }));

        const page = await (await this.bootedComputer()).shell(searchCommand(query));

        return parseResults(page.stdout, 8);
      },
      screenshot: async (url) => {
        const rendered = await this.requireLive()
          .screenshot(url, AbortSignal.timeout(45_000))
          .catch(() => null);

        if (rendered !== null) return rendered;

        const page = await (await this.bootedComputer()).shell(`curl -sL --max-time 20 ${JSON.stringify(url)} | head -c 400000`);

        return { image: '', title: pageTitle(page.stdout, url), text: pageText(page.stdout, 6000) };
      },
      setIdle: (beats) => {
        this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('idle', ${JSON.stringify(beats)})`;
        this.send(connection, { _tag: 'Idle', beats: this.idleBeats() });
      },
      setVoice: (voice) => {
        const current = this.settings();
        const engine = voicesFor(current.engine).includes(voice) ? current.engine : current.engine === 'aura-1' ? 'aura-2' : 'aura-1';

        this.saveSettings({ ...current, voice, engine });
      },
      fetch: (input, init) => fetch(input, init),
      id: () => crypto.randomUUID(),
    };
  }

  private requireLive(): Upstream {
    if (this.live === null) throw new Error('hark is not connected to your Cloudflare account');

    return this.live;
  }

  override async onTurn(transcript: string, context: VoiceTurnContext): Promise<TextSource> {
    const connection = context.connection;
    const caller = this.caller(connection);
    const live = this.requireLive();
    const host = this.toolHost(connection, caller);
    const startedAt = Date.now();
    const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    const history: ChatMessage[] = [
      {
        role: 'system',
        content: systemPrompt({
          now: new Date(),
          timeZone: caller.timeZone,
          locale: caller.locale,
          memories: this.memories(),
          camera: caller.camera,
          firstTurn: caller.firstTurn,
        }),
      },
      ...context.messages.map((message): ChatMessage => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
      { role: 'user', content: transcript },
    ];

    caller.firstTurn = false;
    this.gateTraced = caller.traced;

    const trace = (event: string, detail: Record<string, unknown>) => {
      if (caller.traced) console.info(JSON.stringify({ trace: event, at: Date.now() - startedAt, ...detail }));
    };

    trace('heard', { transcript, speculative: context.speculative, brain: this.brainInUse() });

    const ports: ReplyPorts = {
      chat: async (messages, signal) => {
        const ask = (brain: Brain) =>
          live.chat({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: replyTokenBudget(brain), temperature: 0.7, ...thinkingOptions(brain) }, signal);
        const chosen = this.brainInUse();

        try {
          return await ask(chosen);
        } catch (cause) {
          if (chosen === FALLBACK_BRAIN || !isBrainRefused(cause, chosen)) throw cause;

          this.refusedBrains.add(chosen);
          trace('brain-refused', { brain: chosen, reason: cause instanceof Error ? cause.message.slice(0, 200) : String(cause) });

          return ask(FALLBACK_BRAIN);
        }
      },
      label: (call) => toolLabel(call.name, parseArguments(call.arguments)),
      tool: async (call) => {
        trace('tool', { name: call.name, arguments: call.arguments.slice(0, 600) });

        const outcome = (await context.confirmed) ? await runTool(call.name, parseArguments(call.arguments), host) : { content: 'The person kept talking, so this was not done.' };

        trace('tool-result', { name: call.name, content: outcome.content.slice(0, 300), visual: outcome.visual?._tag ?? null });

        return outcome;
      },
      doing: (label) => this.send(connection, { _tag: 'Doing', label }),
      show: (visual) => this.send(connection, { _tag: 'Show', visual }),
      fail: (reason) => {
        trace('fault', { reason });
        if (SIGNED_OUT.test(reason)) {
          this.signOutEveryone();
          return;
        }

        this.send(connection, { _tag: 'Fault', reason, fatal: false });
      },
    };
    const finish = () => {
      const { engine } = this.settings();
      const brain = this.brainInUse();

      console.info(
        JSON.stringify({
          event: 'hark.turn',
          outcome: context.signal.aborted ? 'interrupted' : result.error === null ? 'spoke' : 'failed',
          speculative: context.speculative,
          brain,
          engine,
          tools: result.tools,
          thinkMs: result.firstTextAt === null ? null : result.firstTextAt - startedAt,
          routes: live.routes(),
          error: result.error,
        }),
      );

      if (result.sleep && !context.signal.aborted) this.send(connection, { _tag: 'Sleep', reason: 'Said goodbye.' });
    };

    const record = this.spokenRecord;

    async function* spoken() {
      let said = '';

      record.turnStarted();

      try {
        for await (const piece of reply(ports, history, context.signal, result)) {
          said += piece;
          yield piece;
        }
      } finally {
        record.turnEnded();
        trace('said', { text: said.slice(0, 1200), aborted: context.signal.aborted, tools: result.tools, error: result.error });
        finish();
      }
    }

    return spoken();
  }
}

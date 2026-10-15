import { Agent, type Connection, type ConnectionContext, type WSMessage } from 'agents';
import { type TextSource, type VoiceTurnContext, WorkersAIFluxSTT, withVoice } from 'agents/voice';
import {
  BRAINS,
  type Brain,
  type ClientFrame,
  DEFAULT_BRAIN,
  FALLBACK_BRAIN,
  DEFAULT_ENGINE,
  DEFAULT_VOICE,
  decodeClientFrame,
  encodeServerFrame,
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
import { type Env, LOCAL_HEADER, LOCAL_OWNER, OWNER_HEADER } from './env';
import { systemPrompt } from './prompt';
import { type ReplyPorts, type ReplyResult, reply } from './reply';
import { speakable } from './sentences';
import { UserSpeech } from './speech';
import { parseArguments, runTool, type ToolHost, toolLabel, toolSchemas } from './tools';
import type { ChatMessage } from './chat';
import { CLOUDFLARE_ORIGINS, type Credentials, type Origins, type Upstream, UpstreamFailed, upstream } from './upstream';
import { userAI } from './user-ai';

const HISTORY_KEEP = 24;

const SNAP_TIMEOUT_MS = 6_000;

const EAGER_EOT_THRESHOLD = 0.5;

const VoiceAgent = withVoice(Agent, {
  audioFormat: 'pcm16',
  sampleRate: SPEECH_SAMPLE_RATE,
  historyLimit: HISTORY_KEEP,
  speculativeTurns: true,
});

type Caller = { owner: string; local: boolean; timeZone: string; locale: string; camera: boolean; firstTurn: boolean };

const isBrain = (value: string): value is Brain => BRAINS.some((brain) => brain.id === value);

const isVoice = (value: string): value is Voice => VOICES.some((voice) => voice === value);

const engineOf = (value: string): SpeechEngine => (value === 'aura-2' ? 'aura-2' : DEFAULT_ENGINE);

const fitVoice = (voice: Voice, engine: SpeechEngine): Voice =>
  voicesFor(engine).includes(voice) ? voice : engine === 'aura-1' ? DEFAULT_VOICE : 'luna';

const isBrainRefused = (cause: unknown) =>
  cause instanceof UpstreamFailed && (cause.status === 403 || cause.status === 400 || cause.status === 404);

const THINKS_BEFORE_TOOLS: readonly Brain[] = ['@cf/moonshotai/kimi-k3'];

const thinkingOptions = (brain: Brain): Record<string, unknown> =>
  brain.startsWith('@cf/openai/gpt-oss')
    ? { reasoning_effort: 'low' }
    : THINKS_BEFORE_TOOLS.includes(brain)
      ? {}
      : { chat_template_kwargs: { enable_thinking: false } };

const SIGNED_OUT = /sign-in expired/u;

export class Hark extends VoiceAgent<Env> {
  private callers = new Map<string, Caller>();

  private live: Upstream | null = null;

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
  }

  override onConnect(connection: Connection, context: ConnectionContext) {
    const headers = context.request.headers;

    this.callers.set(connection.id, {
      owner: headers.get(OWNER_HEADER) ?? '',
      local: headers.get(LOCAL_HEADER) === '1',
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

    const fresh: Caller = { owner: '', local: false, timeZone: 'UTC', locale: 'en-US', camera: false, firstTurn: true };

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
    return {
      accountId: grant.accountId,
      token: async () => {
        const current = this.grant ?? grant;

        if (caller.local || current.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return current.accessToken;

        const directory = this.env.DIRECTORY.getByName(DIRECTORY_NAME);
        const token = await refreshedToken(this.env, current, directory);

        this.grant = await directory.grantFor(caller.owner);

        return token;
      },
    };
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

  override createTranscriber() {
    return new WorkersAIFluxSTT(
      userAI(() => {
        if (this.live === null) throw new Error('hark is not connected to your Cloudflare account');

        return this.live;
      }),
      { keyterms: ['hark'], eotThreshold: 0.75, eagerEotThreshold: EAGER_EOT_THRESHOLD, eotTimeoutMs: 3500 },
    );
  }

  override async beforeSynthesize(text: string): Promise<string | null> {
    const spoken = speakable(text);

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

    const ports: ReplyPorts = {
      chat: async (messages, signal) => {
        const ask = (brain: Brain) =>
          live.chat({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: 600, temperature: 0.7, ...thinkingOptions(brain) }, signal);
        const chosen = this.brainInUse();

        try {
          return await ask(chosen);
        } catch (cause) {
          if (chosen === FALLBACK_BRAIN || !isBrainRefused(cause)) throw cause;

          this.refusedBrains.add(chosen);

          return ask(FALLBACK_BRAIN);
        }
      },
      label: (call) => toolLabel(call.name, parseArguments(call.arguments)),
      tool: async (call) => ((await context.confirmed) ? runTool(call.name, parseArguments(call.arguments), host) : { content: 'The person kept talking, so this was not done.' }),
      doing: (label) => this.send(connection, { _tag: 'Doing', label }),
      show: (visual) => this.send(connection, { _tag: 'Show', visual }),
      fail: (reason) => {
        if (SIGNED_OUT.test(reason)) {
          this.send(connection, { _tag: 'Fault', reason: 'Your Cloudflare sign-in has run out. Sign in again to keep talking.', fatal: true });
          connection.close(4401, 'signed out');
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

    async function* spoken() {
      try {
        yield* reply(ports, history, context.signal, result);
      } finally {
        finish();
      }
    }

    return spoken();
  }
}

import { shapeToolCall } from './tool-call-shape';
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
  MAX_INSTRUCTIONS,
  type TranscriptLine,
  Panel,
  type ServerFrame,
  type Settings,
  type SpeechEngine,
  SPEECH_SAMPLE_RATE,
  VOICES,
  type Visual,
  type Voice,
  voicesFor,
} from '../shared/protocol';
import { refreshedToken, TOKEN_REFRESH_MARGIN_MS } from './auth/refresh';
import { DIRECTORY_NAME, type Grant } from './directory';
import { type Env, LOCAL_HEADER, TRACE_HEADER, LOCAL_OWNER, OWNER_HEADER } from './env';
import { added as withPanel, changed, keepsAPanel, listed as panelList, type PanelChange } from './panels';
import { instructionsReminder, systemPrompt } from './prompt';
import { dailyCron, describeRoutine, MAX_ROUTINES, MAX_RUNS, MIN_EVERY_SECONDS, type Routine, ROUTINE_PROMPT, ROUTINE_SAFE_TOOLS, zoneOffsetMinutes } from './routines';
import { makeVapidKeys, type PushNote, type PushSubscriptionKeys, sendPush, type VapidKeys } from './web-push';
import { Approvals, APPROVAL_SECONDS, callChallenge, randomChallenge, type StoredPasskey, verifyAssertion, verifyRegistration } from './passkey';

const MAX_LINES = 120;

const refuse = (message: string, status = 403) => ({ status, body: JSON.stringify({ success: false, errors: [{ code: status, message }] }) });

const remindOf = (instructions: string): ChatMessage[] => {
  const reminder = instructionsReminder(instructions);
  return reminder === null ? [] : [{ role: 'system', content: reminder }];
};
import { Schema } from 'effect';
import { type ReplyPorts, type ReplyResult, reply } from './reply';
import { speakable } from './sentences';
import { UserSpeech } from './speech';
import { parseArguments, runTool, type ToolHost, toolLabel, toolSchemas, TOOLS } from './tools';
import type { ChatMessage } from './chat';
import { CLOUDFLARE_ORIGINS, type Credentials, type Origins, type Upstream, UpstreamFailed, upstream } from './upstream';
import { userAI } from './user-ai';
import type { McpPort } from './tools';
import { checkServerUrl, checkToken, MAX_MCP_SERVERS, serverName } from './mcp-servers';
import { mcpCallbackPath, ResourceAwareOAuthProvider, saveResource } from './mcp-oauth';

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
import { COMPUTER_IMAGE, type Computer, sandboxComputer, WORKSPACE } from './computer';
import { attachCommand, bridgeTerminal, TERMINAL_ENV, TERMINAL_PATH, type TerminalSize, terminalSize } from './terminal';
import { pageText, pageTitle } from './page-text';
import { parseResults, searchCommand } from './web-results';
import { CLOUDFLARE_PROXY_HOST, egressFor, MAX_FILE_BYTES, runOnBench } from './workbench';
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

const isBrainHiccup = (cause: unknown) => cause instanceof UpstreamFailed && cause.status >= 500;

const WORKSPACE_CHUNK = 900_000;

const isLostComputer = (cause: unknown) => ['not running', 'Network connection lost', 'not been started'].some((sign) => String(cause).includes(sign));

const THINKS_BEFORE_TOOLS: readonly Brain[] = ['@cf/moonshotai/kimi-k3'];

const thinkingOptions = (brain: Brain): Record<string, unknown> =>
  isGatewayBrain(brain)
    ? {}
    : brain.startsWith('@cf/openai/gpt-oss')
    ? { reasoning_effort: 'low' }
    : THINKS_BEFORE_TOOLS.includes(brain)
      ? {}
      : { chat_template_kwargs: { enable_thinking: false } };

const STEADY_BRAINS: readonly Brain[] = ['@cf/daily-co/phonellm-mini-alpha-2'];

const temperatureFor = (brain: Brain) => (STEADY_BRAINS.includes(brain) ? 0 : 0.7);

const spokenFault = (reason: string) =>
  /\((5\d\d)\)/u.test(reason) ? 'Workers AI hiccuped on that one. Say it again.' : reason.replace(/:\s*\{[\s\S]*$/u, '.');

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

  private approvals = new Approvals();

  private signed = new Map<string, (refused: string | null) => void>();

  override tts = new UserSpeech(
    () => this.live,
    () => this.settings(),
  );

  override async onStart() {
    this.ensureVoiceHistory();
    this.sql`CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS missed (label TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS lines (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS push_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, title TEXT NOT NULL, status INTEGER NOT NULL, sent INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS files (path TEXT PRIMARY KEY, content TEXT NOT NULL, at INTEGER NOT NULL)`;
    this.sql`CREATE TABLE IF NOT EXISTS workspace_chunks (part INTEGER PRIMARY KEY, data TEXT NOT NULL)`;
  }

  async pushKey(): Promise<string> {
    return (await this.vapid()).publicKey;
  }

  private async vapid(): Promise<VapidKeys> {
    const raw = this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'vapid'`[0]?.value;
    if (raw !== undefined) return JSON.parse(raw) as VapidKeys;
    const made = await makeVapidKeys();
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid', ${JSON.stringify(made)})`;
    return made;
  }

  async notify(note: PushNote): Promise<{ readonly sent: number; readonly failed: number }> {
    const keys = await this.vapid();
    const subs = this.sql<PushSubscriptionKeys>`SELECT endpoint, p256dh, auth FROM push_subs`;
    let sent = 0;
    let failed = 0;
    for (const sub of subs) {
      const result = await sendPush(sub, keys, note, 'mailto:hark@users.noreply.github.com').catch(() => ({ status: 0, gone: false }));
      if (result.gone) this.sql`DELETE FROM push_subs WHERE endpoint = ${sub.endpoint}`;
      if (result.status >= 200 && result.status < 300) sent += 1;
      else failed += 1;
      this.sql`INSERT INTO push_log (at, title, status, sent) VALUES (${Date.now()}, ${note.title.slice(0, 120)}, ${result.status}, ${result.status >= 200 && result.status < 300 ? 1 : 0})`;
    }
    return { sent, failed };
  }

  async routinesProbe(input: { readonly run?: string; readonly subscribe?: PushSubscriptionKeys; readonly add?: { readonly task: string; readonly every: number; readonly times: number }; readonly clear?: boolean }) {
    if (input.clear === true) await this.removeRoutine('all');
    const added = input.add === undefined ? null : await this.addRoutine(input.add.task, { every: input.add.every, at: null }, input.add.times, 'UTC');
    if (input.subscribe !== undefined) this.sql`INSERT OR REPLACE INTO push_subs (endpoint, p256dh, auth, at) VALUES (${input.subscribe.endpoint}, ${input.subscribe.p256dh}, ${input.subscribe.auth}, ${Date.now()})`;
    if (input.run !== undefined) {
      const routine = this.routines().find((each, index) => each.id === input.run || String(index + 1) === input.run);
      if (routine !== undefined) await this.routineRun({ id: routine.id });
    }
    return { added, routines: this.routines(), schedules: this.getSchedules().filter((each) => each.callback === 'routineRun').map((each) => ({ id: each.id, type: each.type, time: each.time })) };
  }

  private line(kind: TranscriptLine['kind'], text: string) {
    const trimmed = text.trim().slice(0, 1200);
    if (trimmed === '') return;
    const last = this.sql<{ kind: string; text: string }>`SELECT kind, text FROM lines ORDER BY id DESC LIMIT 1`[0];
    if (last?.kind === kind && last.text === trimmed) return;
    const at = Date.now();
    this.sql`INSERT INTO lines (at, kind, text) VALUES (${at}, ${kind}, ${trimmed})`;
    this.sql`DELETE FROM lines WHERE id NOT IN (SELECT id FROM lines ORDER BY id DESC LIMIT ${MAX_LINES})`;
    for (const each of this.getConnections()) this.send(each, { _tag: 'Line', line: { at, kind, text: trimmed } });
  }

  private recentLines(): TranscriptLine[] {
    return this.sql<TranscriptLine>`SELECT at, kind, text FROM lines ORDER BY id DESC LIMIT ${MAX_LINES}`.toReversed();
  }

  async resetForTests() {
    for (const each of this.getSchedules()) await this.cancelSchedule(each.id);
    this.ensureVoiceHistory();
    this.sql`DELETE FROM memories`;
    this.sql`DELETE FROM lines`;
    this.sql`DELETE FROM cf_voice_messages`;
    this.sql`DELETE FROM settings WHERE key = 'instructions'`;
    this.sessionStartsAfter = 0;
    return { reset: true };
  }

  transcript(limit = 200) {
    this.ensureVoiceHistory();
    return {
      lines: this.recentLines().map((line) => ({ ...line, time: new Date(line.at).toISOString() })),
      messages: this.sql<{ role: string; text: string; timestamp: number }>`SELECT role, text, timestamp FROM cf_voice_messages ORDER BY id DESC LIMIT ${limit}`.toReversed(),
    };
  }

  pushLog() {
    return this.sql<{ at: number; title: string; status: number; sent: number }>`SELECT at, title, status, sent FROM push_log ORDER BY id DESC LIMIT 20`;
  }

  private routines(): Routine[] {
    const raw = this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'routines'`[0]?.value;
    return raw === undefined ? [] : (JSON.parse(raw) as Routine[]);
  }

  private saveRoutines(routines: readonly Routine[]) {
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('routines', ${JSON.stringify(routines)})`;
  }

  private listRoutines() {
    const all = this.routines();
    return all.length === 0 ? 'No routines yet.' : all.map((routine, index) => `${index + 1}. ${describeRoutine(routine)}`).join('\n');
  }

  private async addRoutine(task: string, when: { readonly every: number | null; readonly at: string | null }, limit: number | null, timeZone: string) {
    const all = this.routines();
    if (all.length >= MAX_ROUTINES) return `Not set: they already have ${MAX_ROUTINES} routines. Remove one first.`;
    const id = crypto.randomUUID();
    const every = when.every === null ? null : Math.max(MIN_EVERY_SECONDS, when.every);
    const cron = every === null && when.at !== null ? dailyCron(when.at, zoneOffsetMinutes(timeZone)) : null;
    if (every === null && cron === null) return `Not set: I could not read the time ${when.at ?? ''}.`;
    const scheduled = every === null ? await this.schedule(cron ?? '0 8 * * *', 'routineRun', { id }) : await this.scheduleEvery(every, 'routineRun', { id });
    this.saveRoutines([...all, { id, task: task.slice(0, 500), every, at: every === null ? when.at : null, made: Date.now(), runs: 0, limit: limit === null ? null : Math.min(MAX_RUNS, limit), schedule: scheduled.id }]);
    const subs = this.sql<{ n: number }>`SELECT COUNT(*) AS n FROM push_subs`[0]?.n ?? 0;
    return `Set. ${every === null ? `Every day at ${when.at ?? ''}` : `Every ${every >= 3600 ? `${every / 3600} hours` : `${Math.round(every / 60)} minutes`}`}${limit === null ? '' : `, ${limit} times`}. ${subs > 0 ? 'Each result is pushed to their phone.' : 'Push is not on yet: tell them to turn on notifications in Settings, Account.'}`;
  }

  private async removeRoutine(which: string) {
    const all = this.routines();
    const lowered = which.toLowerCase().trim();
    const number = Number(lowered);
    const doomed = lowered === 'all' ? all : all.filter((routine, index) => index + 1 === number || (lowered.length > 2 && routine.task.toLowerCase().includes(lowered)));
    if (doomed.length === 0) return `No routine matches ${which}. ${this.listRoutines()}`;
    for (const routine of doomed) await this.cancelSchedule(routine.schedule);
    this.saveRoutines(all.filter((routine) => !doomed.includes(routine)));
    return `Stopped ${doomed.length === 1 ? doomed[0]!.task : `${doomed.length} routines`}.`;
  }

  async routineRun(payload: { id: string }) {
    const all = this.routines();
    const routine = all.find((each) => each.id === payload.id);
    if (routine === undefined) return;
    const done = routine.runs + 1;
    const finished = routine.limit !== null && done >= routine.limit;
    this.saveRoutines(all.map((each) => (each.id === routine.id ? { ...each, runs: done } : each)));
    if (finished) await this.cancelSchedule(routine.schedule);
    const said = await this.headlessTurn(ROUTINE_PROMPT(routine.task, routine.runs)).catch((cause: unknown) => `The routine could not run: ${cause instanceof Error ? cause.message.slice(0, 160) : String(cause)}`);
    const id = crypto.randomUUID();
    const visual: Visual = { _tag: 'Widget', id, widget: { id, kind: 'report', tone: 'neutral', title: routine.task.slice(0, 80), body: said.slice(0, 1200), stats: [{ label: 'run', value: routine.limit === null ? String(done) : `${done} of ${routine.limit}`, tone: 'neutral' }], columns: [], rows: [], series: [], code: '', image: null, links: [] } };
    this.savePanels(null, withPanel(this.panels(), visual, Date.now()));
    for (const each of this.getConnections()) this.send(each, { _tag: 'Show', visual });
    if (finished) this.saveRoutines(this.routines().filter((each) => each.id !== routine.id));
    await this.notify({ title: routine.task.slice(0, 60), body: said.slice(0, 180), href: `/?panel=${id}` });
  }

  private async headlessTurn(prompt: string): Promise<string> {
    const live = await this.liveForBench();
    const connection = { id: 'routine', send: () => undefined, close: () => undefined } as unknown as Connection;
    const caller: Caller = { owner: this.name, local: this.name === LOCAL_OWNER, traced: false, timeZone: 'UTC', locale: 'en-US', camera: false, firstTurn: false };
    const host: ToolHost = { ...this.toolHost(connection, caller), approve: async () => 'a routine cannot change anything', signal: AbortSignal.timeout(120_000) };
    const result: ReplyResult = { sleep: false, tools: [], firstTextAt: null, error: null };
    const brain = this.brainInUse();
    const ports: ReplyPorts = {
      chat: (messages, signal) => live.chat({ model: brain, messages, tools: toolSchemas().filter((schema) => ROUTINE_SAFE_TOOLS.has(schema.function.name)), stream: true, max_tokens: replyTokenBudget(brain), temperature: temperatureFor(brain), ...thinkingOptions(brain) }, signal),
      label: (call) => toolLabel(call.name, parseArguments(call.arguments)),
      tool: (call) => (ROUTINE_SAFE_TOOLS.has(call.name) ? runTool(call.name, parseArguments(call.arguments), host) : Promise.resolve({ content: 'Not available in a routine.' })),
      doing: () => undefined,
      show: () => undefined,
      fail: () => undefined,
    };
    const history: ChatMessage[] = [
      { role: 'system', content: systemPrompt({ now: new Date(), timeZone: 'UTC', locale: 'en-US', memories: this.memories(), camera: false, firstTurn: false, instructions: this.instructions() }) },
      { role: 'user', content: prompt },
    ];
    let said = '';
    for await (const piece of reply(ports, history, AbortSignal.timeout(120_000), result)) said += piece;
    return said.trim() === '' ? 'Done, with nothing to report.' : said.trim();
  }

  private passkey(): StoredPasskey | null {
    const raw = this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'passkey'`[0]?.value;
    return raw === undefined ? null : (JSON.parse(raw) as StoredPasskey);
  }

  private guardOn() {
    return this.passkey() !== null;
  }

  private rpId() {
    return new URL(this.origin ?? "http://localhost").hostname;
  }

  private settle(connection: Connection, id: string, refused: string | null) {
    this.approvals.drop(id);
    this.signed.get(id)?.(refused);
    this.signed.delete(id);
    this.send(connection, { _tag: 'PasskeyDone', id, ok: refused === null, reason: refused ?? '' });
  }

  private broadcastGuard() {
    for (const each of this.getConnections()) this.send(each, { _tag: 'Guard', on: this.guardOn() });
  }

  private async setGuard(connection: Connection, on: boolean) {
    if (on === this.guardOn()) return this.send(connection, { _tag: 'Guard', on });
    if (!on) {
      const refused = await this.guarded(connection, { tool: 'guard', args: { on: false } }, 'turn off biometrics for changes');
      if (refused === null) this.sql`DELETE FROM settings WHERE key = 'passkey'`;
      return this.broadcastGuard();
    }
    const id = crypto.randomUUID();
    const challenge = randomChallenge();
    this.approvals.begin(id, { purpose: 'register', challenge, expires: Date.now() + APPROVAL_SECONDS * 1000, summary: 'register' });
    this.send(connection, { _tag: 'PasskeyCreate', id, challenge, rpId: this.rpId(), user: this.name });
  }

  private finishRegistration(connection: Connection, frame: { readonly id: string; readonly credential: string; readonly publicKey: string; readonly clientData: string }) {
    const claim = this.approvals.claim(frame.id, Date.now());
    if (!claim.ok || claim.pending.purpose !== 'register') return this.send(connection, { _tag: 'PasskeyDone', id: frame.id, ok: false, reason: 'that sign-up expired' });
    const verdict = verifyRegistration({ clientData: frame.clientData, challenge: claim.pending.challenge, origin: this.origin ?? "", publicKey: frame.publicKey });
    if (!verdict.ok) return this.send(connection, { _tag: 'PasskeyDone', id: frame.id, ok: false, reason: verdict.problem });
    const stored: StoredPasskey = { credential: frame.credential, publicKey: frame.publicKey, counter: 0 };
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('passkey', ${JSON.stringify(stored)})`;
    this.send(connection, { _tag: 'PasskeyDone', id: frame.id, ok: true, reason: '' });
    this.broadcastGuard();
  }

  private async finishApproval(connection: Connection, frame: { readonly id: string; readonly clientData: string; readonly authenticator: string; readonly signature: string }) {
    const stored = this.passkey();
    const claim = this.approvals.claim(frame.id, Date.now());
    if (stored === null || !claim.ok) return this.settle(connection, frame.id, claim.ok ? 'no passkey is set up' : `the approval was ${claim.problem === 'expired' ? 'too late, over a minute' : 'already used or cancelled'}`);
    const verdict = await verifyAssertion({ ...frame, challenge: claim.pending.challenge, origin: this.origin ?? "", rpId: this.rpId(), stored });
    if (verdict.ok) this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('passkey', ${JSON.stringify({ ...stored, counter: verdict.counter })})`;
    this.settle(connection, frame.id, verdict.ok ? null : verdict.problem);
  }

  private async guarded(connection: Connection, call: { readonly tool: string; readonly args: Record<string, unknown> }, summary: string, signal?: AbortSignal): Promise<string | null> {
    const stored = this.passkey();
    if (stored === null) return null;
    const id = crypto.randomUUID();
    const challenge = await callChallenge(call, id);
    this.approvals.begin(id, { purpose: 'approve', challenge, expires: Date.now() + APPROVAL_SECONDS * 1000, summary });
    this.send(connection, { _tag: 'PasskeyAsk', id, challenge, rpId: this.rpId(), credential: stored.credential, summary, seconds: APPROVAL_SECONDS });
    return await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => this.settle(connection, id, 'the passkey was not used within a minute'), APPROVAL_SECONDS * 1000 + 2000);
      const stop = () => this.settle(connection, id, 'they talked over it, so it was cancelled');
      signal?.addEventListener('abort', stop, { once: true });
      this.signed.set(id, (refused) => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        resolve(refused);
      });
    });
  }

  private instructions(): string {
    return this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'instructions'`[0]?.value ?? '';
  }

  private saveInstructions(text: string) {
    const trimmed = text.trim().slice(0, MAX_INSTRUCTIONS);
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('instructions', ${trimmed})`;
    for (const each of this.getConnections()) this.send(each, { _tag: 'Instructions', text: trimmed });
    return trimmed;
  }

  private panels(): Panel[] {
    const raw = this.sql<{ value: string }>`SELECT value FROM settings WHERE key = 'panels'`[0]?.value ?? '[]';
    const decoded = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Panel)))(raw);
    return decoded._tag === 'Some' ? [...decoded.value] : [];
  }

  private savePanels(connection: Connection | null, panels: readonly Panel[], drawer?: boolean) {
    this.sql`INSERT OR REPLACE INTO settings (key, value) VALUES ('panels', ${JSON.stringify(panels)})`;
    const frame: ServerFrame = drawer === undefined ? { _tag: 'Panels', panels } : { _tag: 'Panels', panels, drawer };
    if (connection === null) for (const each of this.getConnections()) this.send(each, frame);
    else this.send(connection, frame);
  }

  private show(connection: Connection, visual: Visual) {
    this.send(connection, { _tag: 'Show', visual });
    if (keepsAPanel(visual)) this.savePanels(connection, withPanel(this.panels(), visual, Date.now()));
  }

  private changePanels(connection: Connection, change: PanelChange, drawer?: boolean) {
    const outcome = changed(this.panels(), change);
    this.savePanels(connection, outcome.panels, drawer);
    return outcome.note;
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

    for (const [id, resolve] of this.signed) {
      this.approvals.drop(id);
      resolve('the page closed');
    }

    this.signed.clear();
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
    if (frame._tag !== 'Hello' && frame._tag !== 'Played') console.info(JSON.stringify({ trace: 'frame-in', tag: frame._tag }));

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
        void this.reviveEmptyServers().then(() => this.send(connection, { _tag: 'Servers', servers: this.serverList() }));
        return;
      case 'AddServer':
        void this.addServer(frame.name, frame.url, frame.token, this.origin, frame.resource ?? '').then((outcome) => this.send(connection, { _tag: 'ServerNote', note: outcome.note, authUrl: outcome.authUrl }));
        return;
      case 'SetInstructions':
        void this.guarded(connection, { tool: 'instructions', args: { action: 'set', text: frame.text } }, 'change your instructions').then((refused) => (refused === null ? this.saveInstructions(frame.text) : this.send(connection, { _tag: 'Instructions', text: this.instructions() })));
        return;
      case 'Subscribe':
        this.sql`INSERT OR REPLACE INTO push_subs (endpoint, p256dh, auth, at) VALUES (${frame.endpoint.slice(0, 1000)}, ${frame.p256dh.slice(0, 200)}, ${frame.auth.slice(0, 100)}, ${Date.now()})`;
        return;
      case 'SetGuard':
        void this.setGuard(connection, frame.on);
        return;
      case 'PasskeyCreated':
        this.finishRegistration(connection, frame);
        return;
      case 'PasskeySigned':
        void this.finishApproval(connection, frame);
        return;
      case 'PasskeyDeclined':
        this.settle(connection, frame.id, frame.reason === undefined || frame.reason.startsWith('NotAllowedError') ? `they cancelled the passkey${frame.reason === undefined ? '' : ` (${frame.reason.slice(0, 120)})`}` : `the passkey failed (${frame.reason.slice(0, 60)})`);
        return;
      case 'Panel':
        this.changePanels(connection, { action: frame.action, which: frame.id });
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

  async toolProbe(calledName: string, calledArgs: Record<string, unknown>) {
    const connection = [...this.getConnections()][0];

    if (connection === undefined) return { error: 'no open page' };

    const { name, args } = shapeToolCall(calledName, calledArgs, TOOLS.map((each) => each.name));
    const tool = TOOLS.find((each) => each.name === name);

    if (tool === undefined) return { error: `no tool ${name}` };

    const result = await runTool(name, args, this.toolHost(connection, this.caller(connection)));

    if (result.visual !== undefined) this.show(connection, result.visual);

    return { content: result.content };
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

  async computerCloudflare(method: string, path: string, body: unknown): Promise<{ readonly status: number; readonly body: string }> {
    const verb = method.toUpperCase();
    if (!path.startsWith('/')) return refuse('path must start with /', 400);
    if (verb !== 'GET') {
      const connection = [...this.getConnections()][0];
      if (!this.guardOn()) return refuse('hark: the computer may only read your account. Turn on Biometrics for changes to let it write, one passkey per call.');
      if (connection === undefined) return refuse('hark: open hark to approve this change with your passkey.');
      const refused = await this.guarded(connection, { tool: 'cloudflare', args: { method: verb, path, body } }, `computer: ${verb} ${path.slice(0, 80)}`, this.turnSignal ?? undefined);
      if (refused !== null) return refuse(`hark: not done, ${refused}.`);
    }
    const live = this.live ?? (await this.liveForBench());
    return live.api(verb, path, body, AbortSignal.timeout(30_000));
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

    if (name === 'mcp_tools') return port.servers().map((server) => ({ server: server.name, state: server.state, tools: port.tools().filter((tool) => tool.server === server.name).map((tool) => tool.name) }));

    if (name === 'mcp_describe') return port.tools().find((tool) => tool.name === text('tool') && (text('server') === '' || tool.server === text('server'))) ?? null;

    if (name === 'mcp_call') {
      this.stopIfInterrupted();

      return port.call(text('server'), text('tool'), typeof args.args === 'object' && args.args !== null ? (args.args as Record<string, unknown>) : {}, this.turnSignal ?? undefined);
    }

    throw new Error(`no capability ${name}`);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === TERMINAL_PATH) return this.openTerminal(terminalSize(url));

    return super.fetch(request);
  }

  private async openTerminal({ cols, rows }: TerminalSize): Promise<Response> {
    const container = this.ctx.container;

    if (container === undefined) return new Response('This hark has no computer attached', { status: 500 });

    await this.bootedComputer();

    const abort = new AbortController();
    const process = await container.exec(attachCommand(), { pty: { cols, rows }, env: TERMINAL_ENV, cwd: WORKSPACE, signal: abort.signal });
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];

    server.binaryType = 'arraybuffer';
    server.accept();
    bridgeTerminal(server, process, abort);

    return new Response(null, { status: 101, webSocket: client });
  }

  async workspaceTree(): Promise<readonly { readonly path: string; readonly type: 'file' | 'dir' }[]> {
    const computer = await this.bootedComputer();
    const listed = await computer.shell(`cd ${WORKSPACE} && find . -mindepth 1 -maxdepth 4 \\( -name node_modules -o -name .git \\) -prune -o -printf '%y %P\\n' | sort -k2 | head -400`);

    return listed.stdout
      .split('\n')
      .filter((line) => line.length > 2)
      .map((line) => ({ path: line.slice(2), type: line.startsWith('d') ? 'dir' : 'file' }));
  }

  async workspaceFile(path: string): Promise<string> {
    return (await this.bootedComputer()).readFile(path);
  }

  private async bootedComputer(fresh = false): Promise<Computer> {
    const container = this.ctx.container;

    if (container === undefined) throw new Error('This hark has no computer attached');

    const computer = sandboxComputer(container, container.images[COMPUTER_IMAGE] ?? COMPUTER_IMAGE);
    const wasRunning = !fresh && computer.running();

    await computer.boot({}, fresh, { host: CLOUDFLARE_PROXY_HOST, binding: egressFor(this.name) });

    if (!wasRunning) {
      const saved = this.savedWorkspace();

      if (saved !== null) await computer.restore(saved).catch(() => undefined);
    }

    return computer;
  }

  private savedWorkspace(): string | null {
    const parts = this.sql<{ data: string }>`SELECT data FROM workspace_chunks ORDER BY part`;

    return parts.length === 0 ? null : parts.map((part) => part.data).join('');
  }

  private async saveWorkspace(computer: Computer) {
    const archive = await computer.snapshot().catch(() => null);

    if (archive === null) return;

    this.sql`DELETE FROM workspace_chunks`;

    for (let index = 0; index * WORKSPACE_CHUNK < archive.length; index += 1)
      this.sql`INSERT INTO workspace_chunks (part, data) VALUES (${index}, ${archive.slice(index * WORKSPACE_CHUNK, (index + 1) * WORKSPACE_CHUNK)})`;
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

  override createMcpOAuthProvider(callbackUrl: string) {
    return new ResourceAwareOAuthProvider(this.ctx.storage, this.name, callbackUrl);
  }

  private async addServer(rawName: string, rawUrl: string, rawToken: string, origin: string | null, rawResource = ''): Promise<{ note: string; authUrl: string | null }> {
    const checked = checkServerUrl(rawUrl, this.name === LOCAL_OWNER);

    if (!checked.ok) return { note: checked.reason, authUrl: null };

    const token = checkToken(rawToken);

    if (token === null) return { note: 'That token has spaces or control characters in it.', authUrl: null };

    const name = serverName(rawName, checked.url);
    const existing = this.serverFor(name);

    if (existing === null && Object.keys(this.getMcpServers().servers).length >= MAX_MCP_SERVERS) return { note: `You can connect up to ${MAX_MCP_SERVERS} servers. Remove one first.`, authUrl: null };

    if (existing !== null) await this.removeMcpServer(existing);

    try {
      const id = crypto.randomUUID().slice(0, 8);
      const resource = rawResource.trim() === '' ? null : rawResource.trim();

      await saveResource(this.ctx.storage, id, resource);

      const added = await this.addMcpServer(name, checked.url, {
        id,
        ...(origin === null ? {} : { callbackHost: origin, callbackPath: mcpCallbackPath(origin) }),
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

  private async callFailed(serverId: string, cause: unknown): Promise<string> {
    const reason = cause instanceof Error ? cause.message : String(cause);

    if (!/401|unauthori[sz]ed|invalid_token|expired/iu.test(reason)) return `That call failed: ${reason.slice(0, 200)}`;

    const authUrl = await this.reauthorize(serverId);

    return authUrl === null ? 'That server signed me out. Add it again in Settings.' : 'That server needs you to sign in again. The link is in Settings, Your MCP servers.';
  }

  private async reauthorize(serverId: string): Promise<string | null> {
    const server = this.getMcpServers().servers[serverId];

    if (server === undefined || this.origin === null) return null;

    await this.removeMcpServer(serverId);

    const again = await this.addMcpServer(server.name, server.server_url, { id: serverId, callbackHost: this.origin, callbackPath: mcpCallbackPath(this.origin) }).catch(() => null);

    this.announceServers();

    return again !== null && again.state === 'authenticating' ? again.authUrl : null;
  }

  private async reviveEmptyServers() {
    const state = this.getMcpServers();

    for (const [id, server] of Object.entries(state.servers)) {
      const empty = server.state === 'ready' && !state.tools.some((tool) => tool.serverId === id);

      if (empty) await this.reauthorize(id);
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
      call: async (server, tool, args, signal) => {
        const serverId = this.serverFor(server);

        if (serverId === null) return `No connected server called ${server}.`;

        if (signal?.aborted === true) return 'The person interrupted, so this call was not made.';

        const result = await this.mcp.callTool({ serverId, name: tool, arguments: args }, { ...(signal === undefined ? {} : { signal }), timeout: 60_000 }).catch((cause: unknown) => this.callFailed(serverId, cause));

        if (typeof result === 'string') return result;
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
      this.send(connection, { _tag: 'Panels', panels: this.panels() });
      this.send(connection, { _tag: 'Instructions', text: this.instructions() });
      this.send(connection, { _tag: 'Guard', on: this.guardOn() });
      this.send(connection, { _tag: 'Lines', lines: this.recentLines() });

      return true;
    } catch (cause) {
      this.send(connection, { _tag: 'Fault', reason: cause instanceof Error ? cause.message : String(cause), fatal: true });

      return false;
    }
  }

  private sessionStartsAfter = 0;

  private turnSignal: AbortSignal | null = null;

  private stopIfInterrupted() {
    if (this.turnSignal?.aborted === true) throw new Error('The person interrupted, so this call was stopped.');
  }

  private ensureVoiceHistory() {
    this.sql`CREATE TABLE IF NOT EXISTS cf_voice_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, role TEXT NOT NULL, text TEXT NOT NULL, timestamp INTEGER NOT NULL)`;
  }

  override saveMessage(role: 'user' | 'assistant', text: string) {
    this.ensureVoiceHistory();
    super.saveMessage(role, text);
    if (role === 'assistant') this.line('said', text);
  }

  override getConversationHistory(limit?: number) {
    this.ensureVoiceHistory();

    const inThisSession = this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM cf_voice_messages WHERE id > ${this.sessionStartsAfter}`[0]?.count ?? 0;
    const recent = super.getConversationHistory(limit);

    return inThisSession === 0 ? [] : recent.slice(-inThisSession);
  }

  private startFreshSession() {
    this.ensureVoiceHistory();
    this.sessionStartsAfter = this.sql<{ last: number | null }>`SELECT MAX(id) AS last FROM cf_voice_messages`[0]?.last ?? 0;
  }

  override async onCallStart(connection: Connection) {
    this.startFreshSession();

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
        const result = await computer.shell(command).catch(async (cause: unknown) => {
          if (!isLostComputer(cause)) throw cause;

          return (await this.bootedComputer(true)).shell(command);
        });

        this.ctx.waitUntil(this.saveWorkspace(computer));

        return result;
      },
      files: async (action, path, content) => {
        const computer = await this.bootedComputer();

        if (action === 'read') return computer.readFile(path);

        if (action === 'write') {
          await computer.writeFile(path, content);
          this.ctx.waitUntil(this.saveWorkspace(computer));

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
      openWorkspace: (path) => this.send(connection, { _tag: 'OpenWorkspace', path }),
      showTools: () => this.send(connection, { _tag: 'ShowTools' }),
      routines: { list: () => this.listRoutines(), add: (task, when, limit) => this.addRoutine(task, when, limit, caller.timeZone), remove: (which) => this.removeRoutine(which) },
      approve: (call, summary) => this.guarded(connection, call, summary),
      instructions: { get: () => this.instructions(), set: (text) => this.saveInstructions(text) },
      panels: {
        list: () => {
          this.savePanels(connection, this.panels(), true);
          return panelList(this.panels());
        },
        change: (change) => this.changePanels(connection, change),
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
    const host = { ...this.toolHost(connection, caller), signal: context.signal };
    this.turnSignal = context.signal;
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
          instructions: this.instructions(),
        }),
      },
      ...context.messages.map((message): ChatMessage => ({ role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content })),
      ...remindOf(this.instructions()),
      { role: 'user', content: transcript },
    ];

    caller.firstTurn = false;
    this.gateTraced = caller.traced;

    const trace = (event: string, detail: Record<string, unknown>) => {
      if (caller.traced) console.info(JSON.stringify({ trace: event, at: Date.now() - startedAt, ...detail }));
    };

    trace('heard', { transcript, speculative: context.speculative, brain: this.brainInUse() });
    this.line('heard', transcript);

    const ports: ReplyPorts = {
      chat: async (messages, signal) => {
        const ask = (brain: Brain) =>
          live.chat({ model: brain, messages, tools: toolSchemas(), stream: true, max_tokens: replyTokenBudget(brain), temperature: temperatureFor(brain), ...thinkingOptions(brain) }, signal);
        const chosen = this.brainInUse();

        try {
          return await ask(chosen);
        } catch (cause) {
          if (chosen === FALLBACK_BRAIN) throw cause;

          if (isBrainHiccup(cause)) {
            trace('brain-hiccup', { brain: chosen, reason: cause instanceof Error ? cause.message.slice(0, 200) : String(cause) });

            return ask(FALLBACK_BRAIN);
          }

          if (!isBrainRefused(cause, chosen)) throw cause;

          this.refusedBrains.add(chosen);
          trace('brain-refused', { brain: chosen, reason: cause instanceof Error ? cause.message.slice(0, 200) : String(cause) });

          return ask(FALLBACK_BRAIN);
        }
      },
      label: (call) => toolLabel(call.name, parseArguments(call.arguments)),
      tool: async (call) => {
        trace('tool', { name: call.name, arguments: call.arguments.slice(0, 600) });
        const shaped = shapeToolCall(call.name, parseArguments(call.arguments), TOOLS.map((each) => each.name));
        this.line('tool', `${shaped.name} ${JSON.stringify(shaped.args).slice(0, 300)}`);

        const outcome = (await context.confirmed) ? await runTool(call.name, parseArguments(call.arguments), host) : { content: 'The person kept talking, so this was not done.' };

        trace('tool-result', { name: call.name, content: outcome.content.slice(0, 300), visual: outcome.visual?._tag ?? null });
        this.line(outcome.content.startsWith('Not done') || outcome.content.startsWith('That did not work') ? 'error' : 'result', `${shaped.name}: ${outcome.content.slice(0, 300)}`);

        return outcome;
      },
      doing: (label) => this.send(connection, { _tag: 'Doing', label }),
      show: (visual) => this.show(connection, visual),
      fail: (reason) => {
        trace('fault', { reason });
        this.line('error', reason);
        if (SIGNED_OUT.test(reason)) {
          this.signOutEveryone();
          return;
        }

        this.send(connection, { _tag: 'Fault', reason: spokenFault(reason), fatal: false });
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

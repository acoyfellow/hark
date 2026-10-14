import { DurableObject } from 'cloudflare:workers';
import { Cause, Deferred, Effect, Exit, Fiber } from 'effect';
import {
  BRAINS,
  type Brain,
  type ClientFrame,
  DEFAULT_BRAIN,
  DEFAULT_VOICE,
  decodeClientFrame,
  encodeServerFrame,
  type Presence,
  type ServerFrame,
  type Settings,
  speechPacket,
  VOICES,
  type Voice,
} from '../shared/protocol';
import { refreshedToken, SignedOut, TOKEN_REFRESH_MARGIN_MS } from './auth/refresh';
import { DIRECTORY_NAME, type Grant } from './directory';
import { type Env, LOCAL_HEADER, LOCAL_OWNER, OWNER_HEADER } from './env';
import { systemPrompt } from './prompt';
import { sameWords } from './sentences';
import { parseArguments, runTool, type ToolHost, toolLabel, toolSchemas } from './tools';
import { type ChatMessage, type Progress, runTurn } from './turn';
import { CLOUDFLARE_ORIGINS, type Credentials, type Origins, type Upstream, upstream } from './upstream';

const HISTORY_KEEP = 24;

const IDLE_SLEEP_MS = 2 * 60 * 1000;

const SNAP_TIMEOUT_MS = 6_000;

const BARGE_MIN_CHARS = 6;

type FluxEvent = {
  readonly event: string;
  readonly transcript: string;
};

type Running = {
  readonly turn: number;
  readonly transcript: string;
  readonly fiber: Fiber.Fiber<unknown, unknown>;
  readonly release: Deferred.Deferred<void>;
  readonly progress: Progress;
  readonly startedAt: number;
  readonly eager: boolean;
  confirmed: boolean;
  doing: string | null;
  endOfSpeechAt: number;
};

type Session = {
  readonly client: WebSocket;
  readonly owner: string;
  readonly origins: Origins;
  readonly local: boolean;
  timeZone: string;
  locale: string;
  camera: boolean;
  flux: WebSocket | null;
  upstream: Upstream | null;
  running: Running | null;
  playing: number | null;
  bargeIn: boolean;
  ducked: boolean;
  firstTurn: boolean;
  lastHeardAt: number;
  idle: ReturnType<typeof setInterval> | null;
};

const fluxEventOf = (data: unknown): FluxEvent | null => {
  if (typeof data !== 'string') return null;

  try {
    const parsed: unknown = JSON.parse(data);

    if (typeof parsed !== 'object' || parsed === null) return null;

    const record = parsed as Record<string, unknown>;
    const event = typeof record.event === 'string' ? record.event : typeof record.type === 'string' ? record.type : '';

    return event === ''
      ? null
      : { event, transcript: typeof record.transcript === 'string' ? record.transcript.trim() : '' };
  } catch {
    return null;
  }
};

const isBrain = (value: string): value is Brain => BRAINS.some((brain) => brain.id === value);

const isVoice = (value: string): value is Voice => VOICES.some((voice) => voice === value);

const thinkingOptions = (brain: Brain): Record<string, unknown> =>
  brain === '@cf/zai-org/glm-5.3-flash'
    ? { reasoning_effort: 'low' }
    : { chat_template_kwargs: { enable_thinking: false } };

export class Hark extends DurableObject<Env> {
  private session: Session | null = null;

  private turns = 0;

  private snaps = new Map<string, (src: string | null) => void>();

  private grant: Grant | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;

    sql.exec('CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, at INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT NOT NULL, at INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS timers (label TEXT PRIMARY KEY, ends_at INTEGER NOT NULL, announced INTEGER NOT NULL DEFAULT 0)');
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
      return new Response('Expected a WebSocket upgrade', { status: 426 });

    const owner = request.headers.get(OWNER_HEADER) ?? '';
    const local = request.headers.get(LOCAL_HEADER) === '1';
    const pair = new WebSocketPair();
    const [browser, client] = [pair[0], pair[1]];

    client.accept();
    client.binaryType = 'arraybuffer';
    this.replace({
      client,
      owner,
      local,
      origins:
        local && (this.env.HARK_FAKE_ORIGIN ?? '') !== ''
          ? { api: this.env.HARK_FAKE_ORIGIN ?? '', gateway: this.env.HARK_FAKE_ORIGIN ?? '' }
          : CLOUDFLARE_ORIGINS,
      timeZone: 'UTC',
      locale: 'en-US',
      camera: false,
      flux: null,
      upstream: null,
      running: null,
      playing: null,
      bargeIn: false,
      ducked: false,
      firstTurn: true,
      lastHeardAt: Date.now(),
      idle: null,
    });

    return new Response(null, { status: 101, webSocket: browser });
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.ctx.storage.sql
      .exec<{ label: string }>('SELECT label FROM timers WHERE ends_at <= ? AND announced = 0', now + 500)
      .toArray();

    this.ctx.storage.sql.exec('UPDATE timers SET announced = 1 WHERE ends_at <= ?', now + 500);

    if (due.length > 0 && this.session?.upstream != null)
      this.announce(
        `(System note, not from the person: the timer${due.length > 1 ? 's' : ''} ${due.map((timer) => `"${timer.label}"`).join(', ')} just finished. Tell them now, in one short sentence.)`,
      );

    this.ctx.storage.sql.exec('DELETE FROM timers WHERE announced = 1 AND ends_at < ?', now - 60 * 60 * 1000);
    await this.scheduleAlarm();
  }

  private async scheduleAlarm() {
    const next = this.ctx.storage.sql
      .exec<{ at: number | null }>('SELECT MIN(ends_at) AS at FROM timers WHERE announced = 0')
      .toArray()[0]?.at;

    if (typeof next === 'number') await this.ctx.storage.setAlarm(next);
    else await this.ctx.storage.deleteAlarm();
  }

  private replace(session: Session) {
    if (this.session !== null) this.close(this.session, 4000, 'Opened somewhere else');

    this.session = session;
    session.client.addEventListener('message', (event) => this.fromClient(session, event.data));
    session.client.addEventListener('close', () => this.close(session, 1000, 'closed'));
    session.client.addEventListener('error', () => this.close(session, 1011, 'error'));
  }

  private send(session: Session, frame: ServerFrame) {
    if (this.session !== session) return;

    try {
      session.client.send(encodeServerFrame(frame));
    } catch {
      this.close(session, 1011, 'send failed');
    }
  }

  private presence(session: Session, presence: Presence) {
    this.send(session, { _tag: 'Presence', presence });
  }

  private close(session: Session, code: number, reason: string) {
    if (session.idle !== null) clearInterval(session.idle);

    session.idle = null;
    this.cancel(session);

    try {
      session.flux?.close(1000, 'bye');
    } catch {}

    session.flux = null;

    try {
      session.client.close(code, reason);
    } catch {}

    for (const resolve of this.snaps.values()) resolve(null);

    this.snaps.clear();

    if (this.session === session) this.session = null;
  }

  private fromClient(session: Session, data: unknown) {
    if (data instanceof ArrayBuffer) {
      if (session.flux !== null) {
        try {
          session.flux.send(data);
        } catch {}
      }

      return;
    }

    const decoded = decodeClientFrame(data);

    if (decoded._tag === 'None') return;

    this.onFrame(session, decoded.value);
  }

  private onFrame(session: Session, frame: ClientFrame) {
    switch (frame._tag) {
      case 'Hello':
        session.timeZone = frame.timeZone;
        session.locale = frame.locale;
        session.camera = frame.camera;
        void this.wake(session);
        return;
      case 'Played':
        if (session.playing === frame.turn) session.playing = null;

        if (session.running === null && session.playing === null) {
          this.unduck(session);
          this.presence(session, 'listening');
        }

        return;
      case 'Snapped':
        this.snaps.get(frame.id)?.(frame.src);
        this.snaps.delete(frame.id);
        return;
      case 'Configure':
        this.saveSettings(frame.settings);
        return;
      case 'Camera':
        session.camera = frame.on;
        return;
      case 'Hush':
        this.interrupt(session);
        this.presence(session, 'listening');
        return;
    }
  }

  private settings(): Settings {
    const rows = this.ctx.storage.sql.exec<{ key: string; value: string }>('SELECT key, value FROM settings').toArray();
    const voice = rows.find((row) => row.key === 'voice')?.value ?? '';
    const brain = rows.find((row) => row.key === 'brain')?.value ?? '';

    return {
      voice: isVoice(voice) ? voice : DEFAULT_VOICE,
      brain: isBrain(brain) ? brain : DEFAULT_BRAIN,
    };
  }

  private saveSettings(settings: Settings) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('voice', ?), ('brain', ?)", settings.voice, settings.brain);
  }

  private memories(): string[] {
    return this.ctx.storage.sql
      .exec<{ text: string }>('SELECT text FROM memories ORDER BY id')
      .toArray()
      .map((row) => row.text);
  }

  private history(): ChatMessage[] {
    return this.ctx.storage.sql
      .exec<{ message: string }>('SELECT message FROM (SELECT id, message FROM history ORDER BY id DESC LIMIT ?) ORDER BY id', HISTORY_KEEP)
      .toArray()
      .flatMap((row) => {
        try {
          return [JSON.parse(row.message) as ChatMessage];
        } catch {
          return [];
        }
      })
      .filter((message, index, all) => index > 0 || message.role === 'user' || all.length === 1);
  }

  private record(messages: readonly ChatMessage[]) {
    const now = Date.now();

    for (const message of messages) {
      const stored =
        message.role === 'user' && typeof message.content !== 'string'
          ? { role: 'user', content: '(showed you a camera frame)' }
          : message;

      this.ctx.storage.sql.exec('INSERT INTO history (message, at) VALUES (?, ?)', JSON.stringify(stored), now);
    }

    this.ctx.storage.sql.exec('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?)', HISTORY_KEEP * 2);
  }

  private async currentGrant(session: Session): Promise<Grant | null> {
    if (session.local) {
      const token = this.env.LOCAL_CF_TOKEN ?? 'local';

      return {
        owner: LOCAL_OWNER,
        email: null,
        accountId: this.env.LOCAL_CF_ACCOUNT ?? 'local',
        accountName: 'Local account',
        gateway: this.env.LOCAL_CF_GATEWAY ?? 'default',
        accessToken: token,
        refreshToken: null,
        expiresAt: Number.MAX_SAFE_INTEGER,
        scope: '',
      };
    }

    this.grant = await this.env.DIRECTORY.getByName(DIRECTORY_NAME).grantFor(session.owner);

    return this.grant;
  }

  private credentials(session: Session, grant: Grant): Credentials {
    return {
      accountId: grant.accountId,
      gateway: grant.gateway,
      token: async () => {
        const current = this.grant ?? grant;

        if (session.local || current.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now()) return current.accessToken;

        const directory = this.env.DIRECTORY.getByName(DIRECTORY_NAME);
        const token = await refreshedToken(this.env, current, directory);

        this.grant = await directory.grantFor(session.owner);

        return token;
      },
    };
  }

  private async wake(session: Session) {
    this.presence(session, 'waking');

    try {
      const grant = await this.currentGrant(session);

      if (grant === null) {
        this.send(session, { _tag: 'Fault', reason: 'Your Cloudflare sign-in is gone. Sign in again.', fatal: true });
        this.close(session, 4401, 'signed out');
        return;
      }

      session.upstream = upstream(this.credentials(session, grant), session.origins);
      await this.openFlux(session);

      if (this.session !== session) return;

      this.send(session, {
        _tag: 'Ready',
        settings: this.settings(),
        account: grant.accountName,
        gateway: grant.gateway,
        memories: this.memories().length,
      });
      this.presence(session, 'listening');
      session.lastHeardAt = Date.now();
      session.idle = setInterval(() => this.checkIdle(session), 5_000);
      this.announceMissed();
    } catch (cause) {
      const reason = cause instanceof SignedOut ? cause.message : cause instanceof Error ? cause.message : String(cause);

      this.send(session, { _tag: 'Fault', reason, fatal: true });
      this.close(session, cause instanceof SignedOut ? 4401 : 1011, 'wake failed');
    }
  }

  private announceMissed() {
    const missed = this.ctx.storage.sql
      .exec<{ label: string }>('SELECT label FROM timers WHERE announced = 1 AND ends_at > ?', Date.now() - 60 * 60 * 1000)
      .toArray();

    if (missed.length === 0) return;

    this.ctx.storage.sql.exec('DELETE FROM timers WHERE announced = 1');
    this.announce(
      `(System note, not from the person: while you were asleep, the timer${missed.length > 1 ? 's' : ''} ${missed.map((timer) => `"${timer.label}"`).join(', ')} finished. Tell them in one short sentence.)`,
    );
  }

  private async openFlux(session: Session) {
    if (session.upstream === null) return;

    const flux = await session.upstream.listen({ keyterms: ['hark'] });

    if (this.session !== session) {
      flux.close(1000, 'gone');
      return;
    }

    session.flux = flux;
    flux.addEventListener('message', (event) => {
      const parsed = fluxEventOf(event.data);

      if (parsed !== null) this.onFlux(session, parsed);
    });
    flux.addEventListener('close', () => {
      if (session.flux !== flux || this.session !== session) return;

      session.flux = null;
      void this.openFlux(session).catch((cause: unknown) => {
        this.send(session, { _tag: 'Fault', reason: `Lost the ears: ${cause instanceof Error ? cause.message : String(cause)}`, fatal: true });
        this.close(session, 1011, 'flux lost');
      });
    });
  }

  private checkIdle(session: Session) {
    if (this.session !== session) return;

    const busy = session.running !== null || session.playing !== null;

    if (!busy && Date.now() - session.lastHeardAt > IDLE_SLEEP_MS) this.sleep(session, 'Fell asleep after two quiet minutes.');
  }

  private sleep(session: Session, reason: string) {
    this.send(session, { _tag: 'Sleep', reason });
    this.close(session, 1000, 'asleep');
  }

  private speaking(session: Session) {
    return session.running !== null || session.playing !== null;
  }

  private onFlux(session: Session, flux: FluxEvent) {
    session.lastHeardAt = Date.now();

    switch (flux.event) {
      case 'StartOfTurn':
        if (this.speaking(session) && session.running?.confirmed !== false) {
          session.bargeIn = true;
          this.duck(session);
        } else this.presence(session, 'hearing');

        return;
      case 'Update':
        if (session.bargeIn && flux.transcript.length >= BARGE_MIN_CHARS) {
          session.bargeIn = false;
          this.interrupt(session);
          this.presence(session, 'hearing');
        }

        return;
      case 'EagerEndOfTurn':
        if (session.bargeIn || flux.transcript === '') return;

        if (session.running !== null && sameWords(session.running.transcript, flux.transcript)) return;

        this.cancel(session);
        this.start(session, flux.transcript, true);
        return;
      case 'TurnResumed':
        if (session.running !== null && !session.running.confirmed) {
          this.cancel(session);
          this.presence(session, 'hearing');
        }

        return;
      case 'EndOfTurn':
        this.endOfTurn(session, flux.transcript);
        return;
    }
  }

  private endOfTurn(session: Session, transcript: string) {
    const wasBargeIn = session.bargeIn;

    session.bargeIn = false;

    if (transcript === '') {
      if (wasBargeIn) this.unduck(session);

      if (!this.speaking(session)) this.presence(session, 'listening');

      return;
    }

    if (wasBargeIn) this.interrupt(session);

    const running = session.running;

    if (running !== null && !running.confirmed && sameWords(running.transcript, transcript)) {
      running.confirmed = true;
      running.endOfSpeechAt = Date.now();
      Effect.runFork(Deferred.succeed(running.release, undefined));

      if (running.progress.firstAudioAt === null) {
        this.presence(session, 'thinking');

        if (running.doing !== null) this.send(session, { _tag: 'Doing', label: running.doing });
      }

      return;
    }

    this.cancel(session);
    this.start(session, transcript, false);
  }

  private duck(session: Session) {
    if (session.ducked) return;

    session.ducked = true;
    this.send(session, { _tag: 'Duck', ducked: true });
  }

  private unduck(session: Session) {
    if (!session.ducked) return;

    session.ducked = false;
    this.send(session, { _tag: 'Duck', ducked: false });
  }

  private interrupt(session: Session) {
    const running = session.running;
    const turn = running?.turn ?? session.playing;

    if (running !== null && running.confirmed && running.progress.firstAudioAt !== null) {
      this.record([
        { role: 'user', content: running.transcript },
        { role: 'assistant', content: `${running.progress.spoken.join(' ')} [interrupted]` },
      ]);
    }

    this.cancel(session);
    session.playing = null;
    session.ducked = false;

    if (turn !== null && turn !== undefined) this.send(session, { _tag: 'Interrupt', turn });
  }

  private cancel(session: Session) {
    const running = session.running;

    if (running === null) return;

    session.running = null;
    Effect.runFork(Fiber.interrupt(running.fiber));
  }

  private announce(note: string) {
    const session = this.session;

    if (session === null || session.upstream === null) return;

    this.cancel(session);
    this.start(session, note, false, true);
  }

  private toolHost(session: Session): ToolHost {
    return {
      timeZone: session.timeZone,
      remember: (fact) => {
        this.ctx.storage.sql.exec('INSERT INTO memories (text, at) VALUES (?, ?)', fact, Date.now());

        return this.memories().length;
      },
      forget: (fact) => {
        const words = fact
          .toLowerCase()
          .split(/\s+/u)
          .filter((word) => word.length > 2);
        const doomed = this.ctx.storage.sql
          .exec<{ id: number; text: string }>('SELECT id, text FROM memories')
          .toArray()
          .filter((row) => words.length > 0 && words.every((word) => row.text.toLowerCase().includes(word)));

        for (const row of doomed) this.ctx.storage.sql.exec('DELETE FROM memories WHERE id = ?', row.id);

        return doomed.length;
      },
      setTimer: (seconds, label) => {
        const endsAt = Date.now() + seconds * 1000;

        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO timers (label, ends_at, announced) VALUES (?, ?, 0)', label, endsAt);
        void this.scheduleAlarm();

        return endsAt;
      },
      cancelTimer: (label) => {
        const removed = this.ctx.storage.sql.exec('DELETE FROM timers WHERE label = ? AND announced = 0', label).rowsWritten;

        void this.scheduleAlarm();

        return removed;
      },
      look: () =>
        new Promise((resolve) => {
          if (!session.camera) {
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
          this.send(session, { _tag: 'Snap', id });
        }),
      imagine: (prompt) => {
        if (session.upstream === null) return Promise.reject(new Error('not awake'));

        return session.upstream.imagine(prompt, AbortSignal.timeout(45_000));
      },
      setVoice: (voice) => this.saveSettings({ ...this.settings(), voice }),
      fetch: (input, init) => fetch(input, init),
      id: () => crypto.randomUUID(),
    };
  }

  private start(session: Session, transcript: string, eager: boolean, system = false) {
    const live = session.upstream;

    if (live === null) return;

    this.turns += 1;

    const turn = this.turns;
    const release = Effect.runSync(Deferred.make<void>());
    const progress: Progress = { spoken: [], firstAudioAt: null, firstTokenAt: null };
    const host = this.toolHost(session);
    let heard = false;
    const prompt = systemPrompt({
      now: new Date(),
      timeZone: session.timeZone,
      locale: session.locale,
      memories: this.memories(),
      camera: session.camera,
      firstTurn: session.firstTurn,
    });
    const userMessage: ChatMessage = { role: 'user', content: transcript };
    const history: ChatMessage[] = [{ role: 'system', content: prompt }, ...this.history(), userMessage];

    if (!eager) Effect.runSync(Deferred.succeed(release, undefined));

    const effect = runTurn(
      {
        chat: (messages, signal) => {
          const { brain } = this.settings();

          return live.chat(
            {
              model: brain,
              messages,
              tools: toolSchemas(),
              stream: true,
              max_tokens: 600,
              temperature: 0.7,
              ...thinkingOptions(brain),
            },
            signal,
          );
        },
        speak: (text, signal) => live.speak(text, this.settings().voice, signal),
        label: (call) => toolLabel(call.name, parseArguments(call.arguments)),
        tool: (call) => runTool(call.name, parseArguments(call.arguments), host),
        doing: (label) => {
          if (session.running?.turn !== turn) return;

          session.running.doing = label;

          if (session.running.confirmed) this.send(session, { _tag: 'Doing', label });
        },
        show: (visual) => this.send(session, { _tag: 'Show', visual }),
        audio: (pcm) => {
          if (session.running?.turn !== turn) return;

          if (!heard) {
            heard = true;
            this.presence(session, 'speaking');
            this.measure(session, session.running);
          }

          session.playing = turn;

          try {
            session.client.send(speechPacket(turn, pcm));
          } catch {}
        },
      },
      history,
      Deferred.await(release),
      progress,
    );

    const fiber = Effect.runFork(effect);
    const running: Running = {
      turn,
      transcript,
      fiber,
      release,
      progress,
      startedAt: Date.now(),
      eager,
      confirmed: !eager,
      doing: null,
      endOfSpeechAt: Date.now(),
    };

    session.running = running;
    session.firstTurn = false;

    if (!eager) this.presence(session, 'thinking');

    fiber.addObserver((exit) => {
      if (session.running !== running) return;

      session.running = null;

      if (Exit.isSuccess(exit)) {
        this.record(system ? exit.value.appended : [userMessage, ...exit.value.appended]);

        if (heard) this.send(session, { _tag: 'SpeechEnd', turn });
        else {
          session.playing = null;
          this.presence(session, 'listening');
        }

        if (exit.value.sleep) this.sleep(session, 'Said goodbye.');

        return;
      }

      if (Cause.hasInterrupts(exit.cause)) return;

      const failure = Cause.squash(exit.cause);
      const reason =
        typeof failure === 'object' && failure !== null && 'reason' in failure && typeof failure.reason === 'string'
          ? failure.reason
          : failure instanceof Error
            ? failure.message
            : 'Something went wrong.';

      this.send(session, { _tag: 'Fault', reason, fatal: false });
      this.presence(session, 'listening');
    });
  }

  private measure(session: Session, running: Running | null) {
    if (running === null) return;

    const now = Date.now();
    const firstToken = running.progress.firstTokenAt ?? now;

    this.send(session, {
      _tag: 'Measured',
      latency: {
        total: Math.max(0, now - running.endOfSpeechAt),
        model: Math.max(0, firstToken - running.startedAt),
        speech: Math.max(0, now - firstToken),
        eager: running.eager,
      },
    });
  }
}

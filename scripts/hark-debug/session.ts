import WebSocket from 'ws';

export type ToolStep = { name: string; args: string; result?: string };

export type TurnReport = {
  said: string;
  heard: string;
  tools: ToolStep[];
  reply: string;
  errors: string[];
  doing: string[];
  shown: string[];
  passkeyAsked: boolean;
  slept: boolean;
  latency: Record<string, unknown> | null;
  firstReplyMs: number | null;
  totalMs: number;
};

type Frame = { type?: string; _tag?: string; [key: string]: unknown };

const TOOL_LINE = /^(\S+) ([\s\S]*)$/u;

const RESULT_LINE = /^(\S+?): ([\s\S]*)$/u;

export const PCM_RATE = 16_000;

const KEEP_ALIVE_MS = 100;

export class HarkSession {
  private socket: WebSocket | null = null;
  private frames: Frame[] = [];
  private waiters: (() => void)[] = [];
  private keepAlive: ReturnType<typeof setInterval> | null = null;
  private speaking = false;

  constructor(private readonly base: string) {}

  async open() {
    const url = `${this.base.replace(/^http/u, 'ws')}/agents/hark/me`;
    const socket = new WebSocket(url, { headers: { origin: this.base } });
    socket.on('error', () => undefined);
    socket.on('message', (data, binary) => {
      if (binary) return;
      try {
        this.frames.push(JSON.parse(String(data)) as Frame);
      } catch {
        return;
      }
      for (const wake of this.waiters.splice(0)) wake();
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    this.socket = socket;
    this.send({ type: 'hello', protocol_version: 1 });
    this.send({ _tag: 'Hello', timeZone: 'America/New_York', locale: 'en-US', camera: false });
    this.send({ type: 'start_call', preferred_format: 'pcm16' });
    await this.until((frame) => frame.type === 'status' && frame.status === 'listening', 20_000);
    const quiet = new Int16Array((PCM_RATE * KEEP_ALIVE_MS) / 1000);
    this.keepAlive = setInterval(() => {
      if (!this.speaking) this.sendAudio(quiet);
    }, KEEP_ALIVE_MS);
  }

  async speak(stream: () => Promise<void>) {
    this.speaking = true;
    try {
      await stream();
    } finally {
      this.speaking = false;
    }
  }

  send(frame: Record<string, unknown>) {
    this.socket?.send(JSON.stringify(frame));
  }

  sendAudio(pcm: Int16Array) {
    this.socket?.send(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  }

  private async until(match: (frame: Frame) => boolean, timeoutMs: number, from = 0): Promise<Frame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.frames.slice(from).find(match);
      if (found !== undefined) return found;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`timed out after ${timeoutMs} ms`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(left, 500));
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  mark() {
    return this.frames.length;
  }

  async turn(said: string, deliver: () => Promise<void>, timeoutMs = 60_000): Promise<TurnReport> {
    const from = this.mark();
    const started = Date.now();
    await deliver();
    const ended = await this.until((frame) => frame.type === 'transcript_end' || frame._tag === 'Sleep' || (frame._tag === 'Fault' && frame.fatal === true), timeoutMs, from).catch(() => null);
    await new Promise((resolve) => setTimeout(resolve, 600));
    const frames = this.frames.slice(from);
    if (ended === null && process.env.HARK_DEBUG_FRAMES === '1') console.error(frames.map((frame) => frame.type ?? frame._tag).join(' '));
    return report(said, frames, started, ended === null ? 'timed out waiting for the reply to end' : null);
  }

  async waitIdle(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  close() {
    if (this.keepAlive !== null) clearInterval(this.keepAlive);
    this.send({ type: 'end_call' });
    this.socket?.close();
  }
}

const textOf = (frame: Frame) => (typeof frame.text === 'string' ? frame.text : '');

const report = (said: string, frames: Frame[], started: number, timeout: string | null): TurnReport => {
  const lines = frames.filter((frame) => frame._tag === 'Line').map((frame) => frame.line as { kind: string; text: string; at: number });
  const tools: ToolStep[] = [];
  for (const line of lines) {
    if (line.kind === 'tool') {
      const match = TOOL_LINE.exec(line.text);
      tools.push({ name: match?.[1] ?? line.text, args: match?.[2] ?? '' });
    }
    if (line.kind === 'result' || line.kind === 'error') {
      const match = RESULT_LINE.exec(line.text);
      const open = tools.findLast((step) => step.name === match?.[1] && step.result === undefined);
      if (open !== undefined) open.result = match?.[2] ?? line.text;
    }
  }
  const heard = frames.filter((frame) => frame.type === 'transcript' && frame.role === 'user').map(textOf).join(' ');
  const reply = frames.filter((frame) => frame.type === 'transcript_end').map(textOf).join(' ').trim() || frames.filter((frame) => frame.type === 'transcript_delta').map(textOf).join('');
  const firstDelta = lines.find((line) => line.kind === 'said');
  const errors = [
    ...lines.filter((line) => line.kind === 'error').map((line) => line.text),
    ...frames.filter((frame) => frame._tag === 'Fault').map((frame) => String(frame.reason)),
    ...frames.filter((frame) => frame.type === 'error').map((frame) => String(frame.message ?? JSON.stringify(frame))),
    ...(timeout === null ? [] : [timeout]),
  ];
  const measured = frames.findLast((frame) => frame._tag === 'Measured');
  return {
    said,
    heard,
    tools,
    reply,
    errors,
    doing: frames.filter((frame) => frame._tag === 'Doing').map((frame) => String(frame.label)),
    shown: frames.filter((frame) => frame._tag === 'Show').map((frame) => String((frame.visual as { _tag?: string })._tag)),
    passkeyAsked: frames.some((frame) => frame._tag === 'PasskeyAsk' || frame._tag === 'PasskeyCreate'),
    slept: frames.some((frame) => frame._tag === 'Sleep'),
    latency: measured === undefined ? null : (measured.latency as Record<string, unknown>),
    firstReplyMs: firstDelta === undefined ? null : firstDelta.at - started,
    totalMs: Date.now() - started,
  };
};

export const printTurn = (turn: TurnReport) => {
  const out: string[] = [];
  out.push(`● you: ${turn.said}`);
  if (turn.heard !== '' && turn.heard.trim().toLowerCase() !== turn.said.trim().toLowerCase()) out.push(`  heard: ${turn.heard}`);
  for (const step of turn.tools) {
    out.push(`  ● tool: ${step.name}(${step.args.slice(0, 300)})`);
    if (step.result !== undefined) out.push(`    ↳ ${step.result.slice(0, 300)}`);
  }
  if (turn.passkeyAsked) out.push('  ● passkey asked');
  if (turn.shown.length > 0) out.push(`  ● shown: ${turn.shown.join(', ')}`);
  out.push(`● hark: ${turn.reply === '' ? '(silent)' : turn.reply}`);
  for (const error of turn.errors) out.push(`  ✗ ${error}`);
  out.push(`  ⏱ first words ${turn.firstReplyMs ?? '-'} ms · turn ${turn.totalMs} ms${turn.latency === null ? '' : ` · measured ${JSON.stringify(turn.latency)}`}${turn.slept ? ' · slept' : ''}`);
  return out.join('\n');
};

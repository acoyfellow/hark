import type { SpeechEngine, Voice } from '../shared/protocol';
import type { Upstream } from './upstream';

export type SpeechSettings = () => { readonly voice: Voice; readonly engine: SpeechEngine };

const aligner = () => {
  let carry: number | null = null;

  return (part: Uint8Array): Uint8Array => {
    const joined = carry === null ? part : new Uint8Array([carry, ...part]);
    const even = joined.byteLength - (joined.byteLength % 2);

    carry = even < joined.byteLength ? (joined[even] ?? null) : null;

    return joined.subarray(0, even);
  };
};

const copy = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

export class UserSpeech {
  constructor(
    private readonly upstream: () => Upstream | null,
    private readonly settings: SpeechSettings,
  ) {}

  private live(): Upstream {
    const live = this.upstream();

    if (live === null) throw new Error('hark is not connected to your Cloudflare account');

    return live;
  }

  async *synthesizeStream(text: string, signal?: AbortSignal): AsyncGenerator<ArrayBuffer> {
    const { voice, engine } = this.settings();
    const body = await this.live().speak(text, voice, engine, signal ?? new AbortController().signal);
    const align = aligner();

    for await (const part of body) {
      const even = align(part);

      if (even.byteLength > 0) yield copy(even);
    }
  }

  async synthesize(text: string, signal?: AbortSignal): Promise<ArrayBuffer | null> {
    const parts: Uint8Array[] = [];

    for await (const part of this.synthesizeStream(text, signal)) parts.push(new Uint8Array(part));

    const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
    const all = new Uint8Array(size);
    let at = 0;

    for (const part of parts) {
      all.set(part, at);
      at += part.byteLength;
    }

    return size === 0 ? null : all.buffer;
  }
}

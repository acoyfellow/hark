import { PCM_RATE, type HarkSession } from './session';

const CHUNK_MS = 20;
const TRAILING_SILENCE_MS = 1500;
const SPEAKER = 'asteria';

export const speakToPcm = async (text: string, live: { account: string; token: string }): Promise<Int16Array> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${live.account}/ai/run/@cf/deepgram/aura-1`, {
    method: 'POST',
    headers: { authorization: `Bearer ${live.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text, speaker: SPEAKER, encoding: 'linear16', container: 'none', sample_rate: PCM_RATE }),
  });
  if (!response.ok) throw new Error(`Aura ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
};

export const withNoise = (pcm: Int16Array, level: number): Int16Array => pcm.map((sample) => Math.max(-32_768, Math.min(32_767, sample + Math.round((Math.random() * 2 - 1) * level))));

export const streamPcm = async (session: HarkSession, pcm: Int16Array) => {
  const step = (PCM_RATE * CHUNK_MS) / 1000;
  const silence = new Int16Array((PCM_RATE * TRAILING_SILENCE_MS) / 1000);
  const all = new Int16Array(pcm.length + silence.length);
  all.set(pcm);
  const started = Date.now();
  for (let at = 0, index = 0; at < all.length; at += step, index += 1) {
    session.sendAudio(all.subarray(at, at + step));
    const due = started + (index + 1) * CHUNK_MS;
    const wait = due - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
};

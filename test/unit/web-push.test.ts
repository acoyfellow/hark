import { describe, expect, it } from 'vitest';
import { toBase64Url } from '../../src/passkey';
import { decryptPush, encryptPush, makeVapidKeys, sendPush } from '../../src/web-push';

const browser = async () => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = toBase64Url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer));
  return { pair, auth, subscription: { endpoint: 'https://push.example/abc', p256dh, auth: toBase64Url(auth) } };
};

describe('web push', () => {
  it('encrypts so only the browser that subscribed can read it', async () => {
    const device = await browser();
    const sealed = await encryptPush(device.subscription, '{"title":"hi"}');
    expect(await decryptPush(sealed, device.pair, device.auth)).toBe('{"title":"hi"}');
    const other = await browser();
    await expect(decryptPush(sealed, other.pair, other.auth)).rejects.toThrow();
  });

  it('signs a VAPID token for the push service origin and sends aes128gcm', async () => {
    const device = await browser();
    const keys = await makeVapidKeys();
    let seen: { url: string; headers: Record<string, string>; body: Uint8Array } | null = null;
    const send = (async (url: string, init: RequestInit) => {
      seen = { url, headers: init.headers as Record<string, string>, body: init.body as Uint8Array };
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const result = await sendPush(device.subscription, keys, { title: 't', body: 'b', href: '/?panel=1' }, 'mailto:hark@example.com', send);
    expect(result).toEqual({ status: 201, gone: false });
    const got = seen as unknown as { url: string; headers: Record<string, string>; body: Uint8Array };
    expect(got.headers['content-encoding']).toBe('aes128gcm');
    const [, token] = /t=([^,]+)/u.exec(got.headers.authorization ?? '') ?? [];
    const claims = JSON.parse(atob((token ?? '').split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/'))) as { aud: string };
    expect(claims.aud).toBe('https://push.example');
    expect(JSON.parse(await decryptPush(got.body, device.pair, device.auth))).toEqual({ title: 't', body: 'b', href: '/?panel=1' });
  });
});

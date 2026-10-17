import { fromBase64Url, toBase64Url } from './passkey';

export type PushSubscriptionKeys = { readonly endpoint: string; readonly p256dh: string; readonly auth: string };

export type VapidKeys = { readonly publicKey: string; readonly privateJwk: JsonWebKey };

const RECORD_SIZE = 4096;

const utf8 = (text: string) => new TextEncoder().encode(text);

const joined = (...parts: readonly Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

const hmac = async (key: Uint8Array, data: Uint8Array) => {
  const imported = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, data));
};

const ONE = new Uint8Array([1]);

export const makeVapidKeys = async (): Promise<VapidKeys> => {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  return { publicKey: toBase64Url(raw), privateJwk: (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey };
};

const vapidHeader = async (endpoint: string, keys: VapidKeys, subject: string) => {
  const header = toBase64Url(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = toBase64Url(utf8(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', keys.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
};

const derive = async (auth: Uint8Array, shared: Uint8Array, receiver: Uint8Array, sender: Uint8Array, salt: Uint8Array) => {
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, joined(utf8('WebPush: info\0'), receiver, sender, ONE));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, joined(utf8('Content-Encoding: aes128gcm\0'), ONE))).slice(0, 16);
  const nonce = (await hmac(prk, joined(utf8('Content-Encoding: nonce\0'), ONE))).slice(0, 12);
  return { cek, nonce };
};

export const encryptPush = async (subscription: PushSubscriptionKeys, payload: string, senderPair?: CryptoKeyPair, fixedSalt?: Uint8Array) => {
  const receiver = fromBase64Url(subscription.p256dh);
  const auth = fromBase64Url(subscription.auth);
  const pair = senderPair ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const sender = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const receiverKey = await crypto.subtle.importKey('raw', receiver, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, pair.privateKey, 256));
  const salt = fixedSalt ?? crypto.getRandomValues(new Uint8Array(16));
  const { cek, nonce } = await derive(auth, shared, receiver, sender, salt);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, joined(utf8(payload), new Uint8Array([2]))));
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, RECORD_SIZE);
  return joined(salt, size, new Uint8Array([sender.length]), sender, sealed);
};

export const decryptPush = async (body: Uint8Array, receiverPair: CryptoKeyPair, auth: Uint8Array) => {
  const salt = body.slice(0, 16);
  const idLength = body[20] ?? 0;
  const sender = body.slice(21, 21 + idLength);
  const sealed = body.slice(21 + idLength);
  const receiver = new Uint8Array((await crypto.subtle.exportKey('raw', receiverPair.publicKey)) as ArrayBuffer);
  const senderKey = await crypto.subtle.importKey('raw', sender, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: senderKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, receiverPair.privateKey, 256));
  const { cek, nonce } = await derive(auth, shared, receiver, sender, salt);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, sealed));
  const end = plain.lastIndexOf(2);
  return new TextDecoder().decode(plain.slice(0, end));
};

export type PushNote = { readonly title: string; readonly body: string; readonly href: string };

export const sendPush = async (subscription: PushSubscriptionKeys, keys: VapidKeys, note: PushNote, subject: string, send: typeof fetch = fetch) => {
  const body = await encryptPush(subscription, JSON.stringify(note));
  const response = await send(subscription.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '86400', urgency: 'normal', authorization: await vapidHeader(subscription.endpoint, keys, subject) },
    body,
  });
  return { status: response.status, gone: response.status === 404 || response.status === 410 };
};

export const APPROVAL_SECONDS = 60;

export type PasskeyPurpose = 'register' | 'approve' | 'disable';

export type StoredPasskey = { readonly credential: string; readonly publicKey: string; readonly counter: number };

export type PendingApproval = { readonly purpose: PasskeyPurpose; readonly challenge: string; readonly expires: number; readonly summary: string };

export type Claim = { readonly ok: true; readonly pending: PendingApproval } | { readonly ok: false; readonly problem: 'missing' | 'expired' };

export type Verdict = { readonly ok: true; readonly counter: number } | { readonly ok: false; readonly problem: string };

const UP = 0x01;
const UV = 0x04;

export const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');

export const fromBase64Url = (text: string) => {
  const padded = text.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0);
};

const sha256 = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const utf8 = (text: string) => new TextEncoder().encode(text);

export const randomChallenge = () => toBase64Url(crypto.getRandomValues(new Uint8Array(32)));

export const callChallenge = async (call: unknown, nonce: string) => toBase64Url(await sha256(utf8(JSON.stringify([call, nonce]))));

const sameBytes = (left: Uint8Array, right: Uint8Array) => left.length === right.length && left.every((byte, index) => byte === right[index]);

const unsignedInteger = (bytes: Uint8Array) => {
  const trimmed = bytes[0] === 0 ? bytes.slice(1) : bytes;
  const out = new Uint8Array(32);
  out.set(trimmed.slice(-32), 32 - Math.min(32, trimmed.length));
  return out;
};

export const derToRaw = (der: Uint8Array) => {
  if (der.length === 64) return der;
  const rLength = der[3] ?? 0;
  const r = der.slice(4, 4 + rLength);
  const sLength = der[5 + rLength] ?? 0;
  const s = der.slice(6 + rLength, 6 + rLength + sLength);
  const raw = new Uint8Array(64);
  raw.set(unsignedInteger(r), 0);
  raw.set(unsignedInteger(s), 32);
  return raw;
};

type ClientData = { readonly type?: string; readonly challenge?: string; readonly origin?: string };

const readClientData = (clientData: string): ClientData | null => {
  try {
    return JSON.parse(new TextDecoder().decode(fromBase64Url(clientData))) as ClientData;
  } catch {
    return null;
  }
};

const checkClientData = (clientData: string, type: string, challenge: string, origin: string): string | null => {
  const parsed = readClientData(clientData);
  if (parsed === null) return 'client data is not JSON';
  if (parsed.type !== type) return `client data type is ${String(parsed.type)}`;
  if (parsed.challenge !== challenge) return 'signature is for a different call';
  if (parsed.origin !== origin) return `origin ${String(parsed.origin)} is not ${origin}`;
  return null;
};

export const verifyRegistration = (input: { readonly clientData: string; readonly challenge: string; readonly origin: string; readonly publicKey: string }): Verdict => {
  const problem = checkClientData(input.clientData, 'webauthn.create', input.challenge, input.origin);
  if (problem !== null) return { ok: false, problem };
  if (fromBase64Url(input.publicKey).length < 60) return { ok: false, problem: 'no public key' };
  return { ok: true, counter: 0 };
};

export const verifyAssertion = async (input: {
  readonly clientData: string;
  readonly authenticator: string;
  readonly signature: string;
  readonly challenge: string;
  readonly origin: string;
  readonly rpId: string;
  readonly stored: StoredPasskey;
}): Promise<Verdict> => {
  const problem = checkClientData(input.clientData, 'webauthn.get', input.challenge, input.origin);
  if (problem !== null) return { ok: false, problem };
  const authenticator = fromBase64Url(input.authenticator);
  if (authenticator.length < 37) return { ok: false, problem: 'authenticator data is short' };
  if (!sameBytes(authenticator.slice(0, 32), await sha256(utf8(input.rpId)))) return { ok: false, problem: 'signed for a different site' };
  const flags = authenticator[32] ?? 0;
  if ((flags & UP) === 0 || (flags & UV) === 0) return { ok: false, problem: 'the person was not verified' };
  const counter = new DataView(authenticator.buffer, authenticator.byteOffset + 33, 4).getUint32(0);
  if ((counter !== 0 || input.stored.counter !== 0) && counter <= input.stored.counter) return { ok: false, problem: 'the passkey counter went backwards' };
  const key = await crypto.subtle.importKey('spki', fromBase64Url(input.stored.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const clientHash = await sha256(fromBase64Url(input.clientData));
  const signed = new Uint8Array(authenticator.length + clientHash.length);
  signed.set(authenticator, 0);
  signed.set(clientHash, authenticator.length);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(fromBase64Url(input.signature)), signed);
  return valid ? { ok: true, counter } : { ok: false, problem: 'the signature does not match' };
};

export class Approvals {
  private readonly open = new Map<string, PendingApproval>();

  begin(id: string, pending: PendingApproval) {
    this.open.set(id, pending);
  }

  claim(id: string, now: number): Claim {
    const pending = this.open.get(id);
    this.open.delete(id);
    if (pending === undefined) return { ok: false, problem: 'missing' };
    if (now > pending.expires) return { ok: false, problem: 'expired' };
    return { ok: true, pending };
  }

  drop(id: string) {
    return this.open.delete(id);
  }
}

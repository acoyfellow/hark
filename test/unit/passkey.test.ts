import { describe, expect, it } from 'vitest';
import { Approvals, callChallenge, fromBase64Url, toBase64Url, verifyAssertion, verifyRegistration } from '../../src/passkey';
import { needsPasskey } from '../../src/tools';

const ORIGIN = 'https://hark.example';
const RP = 'hark.example';

const sha = async (bytes: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));

const device = async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = toBase64Url(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  let counter = 0;
  const sign = async (challenge: string, options: { origin?: string; rp?: string; flags?: number } = {}) => {
    counter += 1;
    const clientBytes = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get', challenge, origin: options.origin ?? ORIGIN }));
    const authenticator = new Uint8Array(37);
    authenticator.set(await sha(new TextEncoder().encode(options.rp ?? RP)), 0);
    authenticator[32] = options.flags ?? 0x05;
    new DataView(authenticator.buffer).setUint32(33, counter);
    const signed = new Uint8Array([...authenticator, ...(await sha(clientBytes))]);
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, signed));
    return { clientData: toBase64Url(clientBytes), authenticator: toBase64Url(authenticator), signature: toBase64Url(signature) };
  };
  return { publicKey, sign };
};

const CALL = { tool: 'cloudflare', args: { method: 'DELETE', path: '/accounts/a/workers/scripts/old' } };

describe('passkey approvals', () => {
  it('accept the signature for the exact call, once', async () => {
    const key = await device();
    const stored = { credential: 'c', publicKey: key.publicKey, counter: 0 };
    const approvals = new Approvals();
    const challenge = await callChallenge(CALL, 'n1');
    approvals.begin('n1', { purpose: 'approve', challenge, expires: Date.now() + 60_000, summary: 'delete' });
    const signed = await key.sign(challenge);
    const claim = approvals.claim('n1', Date.now());
    expect(claim.ok).toBe(true);
    expect(await verifyAssertion({ ...signed, challenge, origin: ORIGIN, rpId: RP, stored })).toEqual({ ok: true, counter: 1 });
    expect(approvals.claim('n1', Date.now())).toEqual({ ok: false, problem: 'missing' });
  });

  it('reject a replay of an old signature by its counter', async () => {
    const key = await device();
    const challenge = await callChallenge(CALL, 'n2');
    const signed = await key.sign(challenge);
    const verdict = await verifyAssertion({ ...signed, challenge, origin: ORIGIN, rpId: RP, stored: { credential: 'c', publicKey: key.publicKey, counter: 1 } });
    expect(verdict.ok).toBe(false);
  });

  it('reject a signature that came after the minute', () => {
    const approvals = new Approvals();
    approvals.begin('n3', { purpose: 'approve', challenge: 'x', expires: 1000, summary: 'delete' });
    expect(approvals.claim('n3', 61_001)).toEqual({ ok: false, problem: 'expired' });
  });

  it('reject a signature made for a different call', async () => {
    const key = await device();
    const stored = { credential: 'c', publicKey: key.publicKey, counter: 0 };
    const asked = await callChallenge(CALL, 'n4');
    const other = await callChallenge({ ...CALL, args: { ...CALL.args, path: '/accounts/a/workers/scripts/prod' } }, 'n4');
    const signed = await key.sign(other);
    expect(await verifyAssertion({ ...signed, challenge: asked, origin: ORIGIN, rpId: RP, stored })).toEqual({ ok: false, problem: 'signature is for a different call' });
  });

  it('reject a signature from another site or without user verification', async () => {
    const key = await device();
    const stored = { credential: 'c', publicKey: key.publicKey, counter: 0 };
    const challenge = await callChallenge(CALL, 'n5');
    expect((await verifyAssertion({ ...(await key.sign(challenge, { origin: 'https://evil.example' })), challenge, origin: ORIGIN, rpId: RP, stored })).ok).toBe(false);
    expect((await verifyAssertion({ ...(await key.sign(challenge, { rp: 'evil.example' })), challenge, origin: ORIGIN, rpId: RP, stored })).ok).toBe(false);
    expect((await verifyAssertion({ ...(await key.sign(challenge, { flags: 0x01 })), challenge, origin: ORIGIN, rpId: RP, stored })).ok).toBe(false);
  });

  it('register only for the right challenge and origin', () => {
    const clientData = toBase64Url(new TextEncoder().encode(JSON.stringify({ type: 'webauthn.create', challenge: 'abc', origin: ORIGIN })));
    const publicKey = toBase64Url(new Uint8Array(91));
    expect(verifyRegistration({ clientData, challenge: 'abc', origin: ORIGIN, publicKey }).ok).toBe(true);
    expect(verifyRegistration({ clientData, challenge: 'abd', origin: ORIGIN, publicKey }).ok).toBe(false);
    expect(fromBase64Url(toBase64Url(new Uint8Array([250, 251, 252])))).toEqual(new Uint8Array([250, 251, 252]));
  });
});

describe('what needs the passkey', () => {
  it('covers writes and leaves reads alone', () => {
    expect(needsPasskey('cloudflare', { method: 'GET', path: '/x' })).toBeNull();
    expect(needsPasskey('cloudflare', { method: 'DELETE', path: '/x' })).toBe('DELETE /x');
    expect(needsPasskey('terminal', { command: 'ls' })).not.toBeNull();
    expect(needsPasskey('files', { action: 'read', path: 'a' })).toBeNull();
    expect(needsPasskey('files', { action: 'write', path: 'a' })).not.toBeNull();
    expect(needsPasskey('run_code', { code: 'return 1+1' })).toBeNull();
    expect(needsPasskey('mcp', { action: 'list' })).toBeNull();
    expect(needsPasskey('mcp', { action: 'call', server: 's', tool: 't' })).not.toBeNull();
    expect(needsPasskey('instructions', { action: 'get' })).toBeNull();
    expect(needsPasskey('instructions', { action: 'add', text: 'x' })).not.toBeNull();
    expect(needsPasskey('panels', { action: 'close_all' })).toBeNull();
    expect(needsPasskey('panels', { action: 'delete', which: '1' })).not.toBeNull();
  });
});

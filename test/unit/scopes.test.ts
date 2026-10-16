import { describe, expect, it } from 'vitest';
import { extraScopesFrom, hasRequiredScopes, REQUIRED_SCOPES, requestedScopes, SCOPES } from '../../src/auth/oauth';

const client = { clientId: 'c', clientSecret: 's', redirectUri: 'https://hark.example/oauth/callback' };

describe('sign-in asks for everything the client allows, and needs only Workers AI', () => {
  it('always asks for the Workers AI scopes', () => {
    for (const scope of REQUIRED_SCOPES) expect(SCOPES).toContain(scope);
  });

  it('adds every extra scope the deployment opts into, once each', () => {
    const scopes = requestedScopes({ ...client, extraScopes: extraScopesFrom('workers_scripts.write, zone.read ai.read  browser.write') });

    expect(scopes).toContain('workers_scripts.write');
    expect(scopes).toContain('zone.read');
    expect(scopes).toContain('browser.write');
    expect(scopes.filter((scope) => scope === 'ai.read')).toHaveLength(1);
  });

  it('drops anything that is not a scope name', () => {
    expect(extraScopesFrom('ok.read <script> a b;c')).toEqual(['ok.read', 'a']);
  });

  it('accepts a grant that has Workers AI and refuses one that does not', () => {
    expect(hasRequiredScopes('offline_access ai.read ai.write zone.read')).toBe(true);
    expect(hasRequiredScopes('offline_access zone.read')).toBe(false);
  });
});

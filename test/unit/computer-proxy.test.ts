import { describe, expect, it } from 'vitest';
import { CLOUDFLARE_PROXY, SHELL_ENV } from '../../src/shell-env';
import { accountPath } from '../../src/upstream';

describe('the computer reaches Cloudflare only through hark', () => {
  it('has a proxy URL and a placeholder, never a token', () => {
    expect(SHELL_ENV.CF_API).toBe(CLOUDFLARE_PROXY);
    expect(SHELL_ENV.CLOUDFLARE_API_TOKEN).toBe('hark-proxy-adds-the-real-token');
    expect(Object.values(SHELL_ENV).join(' ')).not.toMatch(/[A-Za-z0-9_-]{40}/u);
  });

  it('turns the ACCOUNT_ID placeholder into the real account', () => {
    expect(accountPath(`/accounts/${SHELL_ENV.CF_ACCOUNT}/workers/scripts`, 'abc123')).toBe('/accounts/abc123/workers/scripts');
  });
});

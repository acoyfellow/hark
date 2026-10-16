import { describe, expect, test } from 'vitest';
import { checkServerUrl, checkToken, serverName } from '../../src/mcp-servers';

describe('checkServerUrl', () => {
  test('accepts public https servers', () => {
    expect(checkServerUrl('https://docs.mcp.cloudflare.com/mcp', false)).toEqual({ ok: true, url: 'https://docs.mcp.cloudflare.com/mcp' });
  });

  test('refuses plain http on the public internet', () => {
    expect(checkServerUrl('http://example.com/mcp', false).ok).toBe(false);
  });

  test.each([
    'https://localhost/mcp',
    'https://127.0.0.1/mcp',
    'https://10.0.0.5/mcp',
    'https://192.168.1.10/mcp',
    'https://172.20.0.1/mcp',
    'https://169.254.169.254/latest',
    'https://100.100.1.1/mcp',
    'https://[::1]/mcp',
    'https://printer.local/mcp',
    'https://intranet/mcp',
    'https://svc.internal/mcp',
  ])('refuses private address %s', (url) => {
    expect(checkServerUrl(url, false).ok).toBe(false);
  });

  test('refuses credentials in the URL', () => {
    expect(checkServerUrl('https://user:secret@example.com/mcp', false)).toEqual({ ok: false, reason: 'Put the token in the token field, not in the URL.' });
  });

  test('allows a loopback server only in local dev', () => {
    expect(checkServerUrl('http://127.0.0.1:8799/mcp', true).ok).toBe(true);
    expect(checkServerUrl('http://127.0.0.1:8799/mcp', false).ok).toBe(false);
  });

  test('refuses things that are not URLs', () => {
    expect(checkServerUrl('not a url', false).ok).toBe(false);
    expect(checkServerUrl('javascript:alert(1)', false).ok).toBe(false);
  });
});

describe('serverName and checkToken', () => {
  test('a blank name falls back to the host', () => {
    expect(serverName('  ', 'https://docs.mcp.cloudflare.com/mcp')).toBe('docs.mcp.cloudflare.com');
  });

  test('names lose markup and are bounded', () => {
    expect(serverName('<b>Docs</b>', 'https://x.example.com')).toBe('bDocsb');
    expect(serverName('a'.repeat(100), 'https://x.example.com')).toHaveLength(40);
  });

  test('a pasted Bearer prefix is dropped and whitespace refused', () => {
    expect(checkToken('Bearer abc123')).toBe('abc123');
    expect(checkToken('abc def')).toBeNull();
    expect(checkToken('')).toBe('');
  });
});

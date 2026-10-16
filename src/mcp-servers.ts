export const MAX_MCP_SERVERS = 12;

const MAX_NAME_LENGTH = 40;

const MAX_TOKEN_LENGTH = 4096;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const PRIVATE_SUFFIXES = ['.local', '.localhost', '.internal', '.lan', '.home', '.corp'];

const isPrivateIpv4 = (host: string) => {
  const parts = host.split('.').map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;

  const [a, b] = parts as [number, number, number, number];

  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
};

const isIpv6Literal = (host: string) => host.startsWith('[');

export type ServerUrlCheck = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly reason: string };

export const checkServerUrl = (raw: string, allowLoopback: boolean): ServerUrlCheck => {
  let url: URL;

  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: 'That is not a URL.' };
  }

  const host = url.hostname.toLowerCase();
  const loopback = LOOPBACK_HOSTS.has(host);

  if (url.username !== '' || url.password !== '') return { ok: false, reason: 'Put the token in the token field, not in the URL.' };

  if (loopback && allowLoopback && (url.protocol === 'http:' || url.protocol === 'https:')) return { ok: true, url: url.toString() };

  if (url.protocol !== 'https:') return { ok: false, reason: 'MCP servers must use https.' };

  if (loopback || isPrivateIpv4(host) || isIpv6Literal(host) || !host.includes('.') || PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix)))
    return { ok: false, reason: 'MCP servers must be on the public internet.' };

  return { ok: true, url: url.toString() };
};

export const serverName = (raw: string, url: string) => {
  const cleaned = raw.trim().replace(/[^\p{L}\p{N} ._-]/gu, '').slice(0, MAX_NAME_LENGTH);

  return cleaned === '' ? new URL(url).hostname : cleaned;
};

export const checkToken = (raw: string): string | null => {
  const token = raw.trim().replace(/^bearer\s+/iu, '');

  if (token.length > MAX_TOKEN_LENGTH || [...token].some((char) => char.trim() === '' || char.charCodeAt(0) < 32)) return null;

  return token;
};

export const CLOUDFLARE_PROXY = 'http://cloudflare.hark.internal/client/v4';

export const SHELL_ENV: Record<string, string> = {
  PATH: '/usr/local/bin:/usr/bin:/bin',
  CF_API: CLOUDFLARE_PROXY,
  CF_ACCOUNT: 'ACCOUNT_ID',
  CLOUDFLARE_API_BASE_URL: CLOUDFLARE_PROXY,
  CLOUDFLARE_API_TOKEN: 'hark-proxy-adds-the-real-token',
  HOME: '/root',
  GIT_AUTHOR_NAME: 'hark',
  GIT_AUTHOR_EMAIL: 'hark@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'hark',
  GIT_COMMITTER_EMAIL: 'hark@users.noreply.github.com',
};

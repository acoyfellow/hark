export type SignInPage = { readonly origin: string; readonly error?: string };
export const signInPage = ({ error }: SignInPage) => `<!doctype html><title>hark</title><a href="/oauth/login">Sign in with Cloudflare</a>${error ?? ''}`;

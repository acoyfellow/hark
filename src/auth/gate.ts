import { type CloudflareAuthEnv, cloudflareAuth } from './cloudflare';
import type { Identity } from './types';

export type GateResult =
  | { readonly kind: 'response'; readonly response: Response }
  | { readonly kind: 'admitted'; readonly identity: Identity };

export const gate = async (
  request: Request,
  env: CloudflareAuthEnv,
  send: typeof fetch = fetch,
): Promise<GateResult> => {
  const auth = cloudflareAuth(env, send);
  const own = await auth.routes(request);

  if (own !== null) return { kind: 'response', response: own };

  const admission = await auth.admit(request);

  return 'refused' in admission
    ? { kind: 'response', response: admission.refused }
    : { kind: 'admitted', identity: admission.identity };
};

export type Identity = { readonly who: string };

type Admission = { readonly identity: Identity } | { readonly refused: Response };

export type Auth = {
  readonly admit: (request: Request) => Promise<Admission>;
  readonly routes: (request: Request) => Promise<Response | null>;
};

export const CLOUDFLARE_OWNER_PREFIX = 'cf:';


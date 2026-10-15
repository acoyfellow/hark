import type { Directory } from './directory';
import type { Hark } from './hark';

export type Env = {
  readonly ASSETS: Fetcher;
  readonly DIRECTORY: DurableObjectNamespace<Directory>;
  readonly HARK: DurableObjectNamespace<Hark>;
  readonly OAUTH_CLIENT_ID?: string;
  readonly OAUTH_CLIENT_SECRET?: string;
  readonly SESSION_SECRET?: string;
  readonly LOCAL_DEV_WITHOUT_AUTH?: string;
  readonly HARK_FAKE_ORIGIN?: string;
  readonly LOCAL_CF_TOKEN?: string;
  readonly LOCAL_CF_ACCOUNT?: string;
};

export const LOCAL_OWNER = 'local';

export const LOCAL_HEADER = 'x-hark-local';

export const OWNER_HEADER = 'x-hark-owner';

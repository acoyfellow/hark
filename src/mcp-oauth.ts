import { DurableObjectOAuthClientProvider } from 'agents/mcp/do-oauth-client-provider';

const LOOPBACK_CALLBACK_PATH = '/callback';

const HOSTED_CALLBACK_PATH = '/mcp/callback';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const MCP_CALLBACK_PATHS = [LOOPBACK_CALLBACK_PATH, HOSTED_CALLBACK_PATH] as const;

export const mcpCallbackPath = (origin: string) => (LOOPBACK_HOSTS.has(new URL(origin).hostname) ? LOOPBACK_CALLBACK_PATH : HOSTED_CALLBACK_PATH);

export const originResource = (advertised: string | undefined, serverUrl: string): string | undefined => {
  if (advertised === undefined) return undefined;

  const resource = new URL(advertised);

  return resource.origin === new URL(serverUrl).origin ? resource.origin : advertised;
};

const resourceKey = (serverId: string) => `/hark/mcp/resource/${serverId}`;

export const saveResource = (storage: DurableObjectStorage, serverId: string, resource: string | null) =>
  resource === null ? storage.delete(resourceKey(serverId)) : storage.put(resourceKey(serverId), resource);

export class ResourceAwareOAuthProvider extends DurableObjectOAuthClientProvider {
  async validateResourceURL(serverUrl: string | URL, advertised?: string): Promise<URL | undefined> {
    const pinned = await this.storage.get<string>(resourceKey(this.serverId));

    if (typeof pinned === 'string') return new URL(pinned);

    const resource = originResource(advertised, String(serverUrl));

    return resource === undefined ? undefined : new URL(resource);
  }
}

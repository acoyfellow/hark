import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.FAKE_AX_PORT ?? 8798);

const ORIGIN = `http://127.0.0.1:${PORT}`;

const RESOURCE = process.env.FAKE_AX_RESOURCE ?? ORIGIN;

const ALLOWED_REDIRECT = /^http:\/\/127\.0\.0\.1:[0-9]{4,5}\/(oauth\/)?callback$/u;

const TOOLS = [
  { name: 'jira_get_issue', description: 'Read one Jira issue by key.', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
  { name: 'request_person', description: 'Look up a person by name.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
];

const clients = new Map();
const codes = new Map();
const tokens = new Map();
const log = [];

const body = async (request) => {
  const chunks = [];

  for await (const chunk of request) chunks.push(chunk);

  return Buffer.concat(chunks).toString('utf8');
};

const json = (response, status, value, headers = {}) => {
  response.writeHead(status, { 'content-type': 'application/json', ...headers });
  response.end(JSON.stringify(value));
};

const challenge = (verifier) => createHash('sha256').update(verifier).digest('base64url');

const bearer = (request) => (request.headers.authorization ?? '').replace(/^Bearer\s+/iu, '');

const unauthorized = (response) =>
  json(response, 401, { error: 'invalid_token' }, { 'www-authenticate': `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/mcp"` });

const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });

const handleMcp = async (request, response) => {
  const token = tokens.get(bearer(request));

  if (token === undefined) return unauthorized(response);

  if (token.resource !== RESOURCE) {
    log.push({ kind: 'wrong-resource', resource: token.resource });

    return unauthorized(response);
  }

  if (request.method !== 'POST') {
    response.writeHead(405);
    response.end();

    return;
  }

  const message = JSON.parse(await body(request));

  if (message.id === undefined) {
    response.writeHead(202);
    response.end();

    return;
  }

  if (message.method === 'initialize')
    return json(response, 200, rpc(message.id, { protocolVersion: message.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-ax-mcp', version: '1.0.0' } }));

  if (message.method === 'tools/list') return json(response, 200, rpc(message.id, { tools: TOOLS }));

  if (message.method === 'tools/call') {
    log.push({ kind: 'tools/call', tool: message.params?.name, authorized: true, at: Date.now() });
    await new Promise((resolve) => setTimeout(resolve, Number(message.params?.arguments?.delayMs ?? 0)));

    return json(response, 200, rpc(message.id, { content: [{ type: 'text', text: `${message.params?.name} ok: ${JSON.stringify(message.params?.arguments ?? {})}` }] }));
  }

  return json(response, 200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } });
};

const authorize = (url, response) => {
  const client = clients.get(url.searchParams.get('client_id'));
  const redirect = url.searchParams.get('redirect_uri') ?? '';

  if (client === undefined || !client.redirect_uris.includes(redirect) || !ALLOWED_REDIRECT.test(redirect)) {
    log.push({ kind: 'redirect-refused', redirect });
    response.writeHead(400, { 'content-type': 'text/plain' });
    response.end('redirect_uri is not on the allowlist');

    return;
  }

  if (url.searchParams.get('code_challenge_method') !== 'S256') {
    response.writeHead(400);
    response.end('PKCE S256 is required');

    return;
  }

  const code = randomBytes(16).toString('hex');

  codes.set(code, { challenge: url.searchParams.get('code_challenge'), resource: url.searchParams.get('resource'), redirect });
  log.push({ kind: 'authorize', resource: url.searchParams.get('resource'), redirect });

  const back = new URL(redirect);

  back.searchParams.set('code', code);
  back.searchParams.set('state', url.searchParams.get('state') ?? '');
  response.writeHead(302, { location: back.toString() });
  response.end();
};

const exchange = async (request, response) => {
  const form = new URLSearchParams(await body(request));
  const grant = codes.get(form.get('code'));

  if (grant === undefined || challenge(form.get('code_verifier') ?? '') !== grant.challenge) return json(response, 400, { error: 'invalid_grant' });

  codes.delete(form.get('code'));

  const token = randomBytes(24).toString('hex');

  tokens.set(token, { resource: form.get('resource') ?? grant.resource });

  return json(response, 200, { access_token: token, token_type: 'Bearer', expires_in: 3600 });
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', ORIGIN);
  const path = url.pathname;

  if (path === '/__log') return json(response, 200, log);

  if (path === '/__expire') {
    tokens.clear();

    return json(response, 200, { expired: true });
  }

  if (path.startsWith('/.well-known/oauth-protected-resource')) return json(response, 200, { resource: `${ORIGIN}/mcp`, authorization_servers: [ORIGIN] });

  if (path.startsWith('/.well-known/oauth-authorization-server') || path.startsWith('/.well-known/openid-configuration'))
    return json(response, 200, {
      issuer: ORIGIN,
      authorization_endpoint: `${ORIGIN}/authorize`,
      token_endpoint: `${ORIGIN}/token`,
      registration_endpoint: `${ORIGIN}/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    });

  if (path === '/register' && request.method === 'POST') {
    const metadata = JSON.parse(await body(request));
    const id = randomBytes(8).toString('hex');

    clients.set(id, { redirect_uris: metadata.redirect_uris ?? [] });

    return json(response, 201, { ...metadata, client_id: id, token_endpoint_auth_method: 'none' });
  }

  if (path === '/authorize') return authorize(url, response);

  if (path === '/token' && request.method === 'POST') return exchange(request, response);

  if (path === '/mcp') return handleMcp(request, response);

  response.writeHead(404);
  response.end();
});

server.listen(PORT, '127.0.0.1', () => console.log(`fake ax-mcp on ${ORIGIN}/mcp`));

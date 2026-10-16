import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync('wrangler.jsonc', 'utf8');
const plainHttp = process.env.APK_PLAIN_HTTP ?? '1';
const local = source.replace('"dockerfile": "./computer/Dockerfile" }', `"dockerfile": "./computer/Dockerfile", "build_vars": { "APK_PLAIN_HTTP": ${JSON.stringify(plainHttp)}, "TRUST_LOCAL_CERTS": "1" } }`);

if (local === source) {
  console.error('wrangler.jsonc has no computer image');
  process.exit(2);
}

writeFileSync('wrangler.local.jsonc', local);

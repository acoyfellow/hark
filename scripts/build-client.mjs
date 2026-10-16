import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

execFileSync('npx', ['vite', 'build', '--config', 'client/vite.config.ts', '--logLevel', 'warn'], {
  stdio: 'inherit',
});

const manifest = JSON.parse(readFileSync('public/app/.vite/manifest.json', 'utf8'));
const entryNamed = (name) => Object.values(manifest).find((chunk) => chunk.isEntry && chunk.name === name);
const entry = entryNamed('entry');
const welcome = entryNamed('welcome');

if (!entry || !welcome) throw new Error('vite did not produce both the app and welcome entries');

const css = entry.css?.[0];
const site = Object.values(manifest).find((chunk) => chunk.isEntry && chunk.src?.endsWith('site.css'));

if (!site) throw new Error('vite produced no site stylesheet');

if (!css) throw new Error('vite produced no stylesheet');

writeFileSync(
  'src/ui/app.generated.ts',
  `export const APP_ENTRY = ${JSON.stringify(`/app/${entry.file}`)};\nexport const APP_CSS = ${JSON.stringify(`/app/${css}`)};\nexport const WELCOME_ENTRY = ${JSON.stringify(`/app/${welcome.file}`)};\nexport const SITE_CSS = ${JSON.stringify(`/app/${site.file}`)};\n`,
);
console.log(`client /app/${entry.file} /app/${css}`);

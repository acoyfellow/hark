import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const LANES = { L1: ['bun', ['scripts/v6/l1-keep-word.ts']] };
const lane = process.argv[process.argv.indexOf('--lane') + 1] ?? '';
const entry = LANES[lane];
if (entry === undefined) {
  console.error(`no live check for lane ${lane}; known: ${Object.keys(LANES).join(', ')}`);
  process.exit(2);
}
const commit = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const out = `receipts/v6/${lane}.json`;
mkdirSync('receipts/v6', { recursive: true });
try {
  execFileSync(entry[0], entry[1], { stdio: 'inherit', env: { ...process.env, OUT: `${out}.raw` } });
} catch {
  writeFileSync(out, JSON.stringify({ lane, commit, at: new Date().toISOString(), pass: false }, null, 2));
  process.exit(1);
}
writeFileSync(out, JSON.stringify({ lane, commit, at: new Date().toISOString(), pass: true, raw: `${out}.raw` }, null, 2));

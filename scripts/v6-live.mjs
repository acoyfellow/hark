import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const LANES = { L1: ['bun', ['scripts/v6/l1-keep-word.ts']], L2: ['bun', ['scripts/v6/l2-steps.ts']], L3: ['bun', ['scripts/v6/l3-still.ts']], L4: ['bun', ['scripts/v6/l4-panels.ts']], L5: ['bun', ['scripts/v6/l5-capabilities.ts']], L6: ['bun', ['scripts/v6/l6-instructions.ts']], L7: ['bun', ['scripts/v6/l7-passkey.ts']], L8: ['bun', ['scripts/v6/l8-computer.ts']], L9: ['bun', ['scripts/v6/l9-models.ts']] };
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

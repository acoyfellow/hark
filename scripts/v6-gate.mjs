import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LANES = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'];
const run = (command) => execSync(command, { stdio: 'inherit' });
run('bun run check');
run('bun run e2e');
run('node scripts/probe.mjs');
const missing = LANES.filter((lane) => {
  const path = `receipts/v6/${lane}.json`;
  if (!existsSync(path)) return true;
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  const reachable = (() => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', receipt.commit, 'HEAD']);
      return true;
    } catch {
      return false;
    }
  })();
  return receipt.pass !== true || !reachable;
});
for (const lane of LANES.filter((each) => !missing.includes(each))) run(`node scripts/v6-live.mjs --lane ${lane}`);
if (missing.length > 0) {
  console.error(`lanes without a passing receipt: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('v6 gate passed');

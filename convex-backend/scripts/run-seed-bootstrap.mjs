import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = JSON.stringify(
  JSON.parse(readFileSync(join(root, 'scripts/seed-bootstrap.args.json'), 'utf8')),
);
const convexBin = join(root, 'node_modules', 'convex', 'bin', 'main.js');

execFileSync(process.execPath, [convexBin, 'run', 'seed:bootstrap', args], {
  cwd: root,
  stdio: 'inherit',
});

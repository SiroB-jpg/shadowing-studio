/** Runs every suite and reports a single verdict. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const suites = [
  ['Library, Study and Verb drill', 'test-study.mjs'],
  ['Generate and the relay client', 'test-generate.mjs'],
  ['Relay worker', 'test-worker.mjs']
];
let failed = 0, total = 0;
for (const [name, file] of suites) {
  const r = spawnSync('node', [path.join(here, file)], { encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  const pass = (out.match(/^PASS \((\d+)\)/m) || [])[1];
  const fail = (out.match(/^FAIL \((\d+)\)/m) || [])[1];
  total += Number(pass || 0);
  if (r.status !== 0 || fail) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(out.split('\n').filter(l => l.includes('✗') || l.startsWith('FAIL')).join('\n'));
    if (!pass && !fail) console.log(out.slice(-1200));
  } else {
    console.log(`ok    ${name} — ${pass} checks`);
  }
}
console.log(failed ? `\n${failed} suite(s) failing` : `\nAll suites pass — ${total} checks`);
process.exit(failed ? 1 : 0);

/** Runs every suite and reports a single verdict. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const suites = [
  ['Release integrity', 'test-release.mjs'],
  ['Library, Study and Verb drill', 'test-study.mjs'],
  ['Generate and the relay client', 'test-generate.mjs'],
  ['Relay worker', 'test-worker.mjs'],
  ['Accessibility and keyboard interaction', 'test-accessibility.mjs'],
  ['Media-session ownership', 'test-media-session.mjs'],
  ['Backup, restore and destructive safeguards', 'test-backup.mjs'],
  ['Service worker, updates and offline reloads', 'test-service-worker.mjs'],
  ['Responsive layout and visual flows', 'test-responsive.mjs'],
  ['Pause, premium fallback and readiness', 'test-playback-pause.mjs']
];
let failed = 0, total = 0;
for (const [name, file] of suites) {
  const r = spawnSync('node', [path.join(here, file)], { encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  const pass = Number((out.match(/^PASS \((\d+)\)/m) || [])[1] || 0);
  const fail = Number((out.match(/^FAIL \((\d+)\)/m) || [])[1] || 0);
  total += pass;
  if (r.status !== 0 || fail > 0 || pass === 0) {
    failed++;
    console.log(`FAIL  ${name}`);
    console.log(out.split('\n').filter(l => l.includes('✗') || l.startsWith('FAIL')).join('\n'));
    if (!pass && !fail) console.log(out.slice(-1600));
  } else {
    console.log(`ok    ${name} — ${pass} checks`);
  }
}
console.log(failed ? `\n${failed} suite(s) failing` : `\nAll suites pass — ${total} checks`);
process.exit(failed ? 1 : 0);

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const js = read('app.js');
const css = read('styles.css');
const sw = read('sw.js');
const boot = read('boot.js');
const headers = read('_headers');
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

let passed = 0;
let failed = 0;
function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}
function capture(text, pattern) {
  return (text.match(pattern) || [])[1] || null;
}

const versions = {
  html: capture(html, /<meta name="app-version" content="([^"]+)">/),
  title: capture(html, /<title>Italian Shadowing Studio — v([^<]+)<\/title>/),
  header: capture(html, /<p class="header-sub">v(\d+\.\d+\.\d+)/),
  js: capture(js, /VERSION:"(\d+\.\d+\.\d+)"/),
  css: capture(css, /--css-version:"(\d+\.\d+\.\d+)"/),
  worker: capture(sw, /italian-shadowing-studio-v(\d+-\d+-\d+)/)?.replaceAll('-', '.') || null,
  package: pkg.version || null,
  lock: lock.version || null,
  lockRoot: lock.packages?.['']?.version || null
};

for (const [location, version] of Object.entries(versions)) {
  check(Boolean(version), `${location} exposes a release version`);
}
const unique = new Set(Object.values(versions));
check(unique.size === 1, `all release markers agree (${Object.entries(versions).map(([k,v]) => `${k}=${v}`).join(', ')})`);
check(/^\d+\.\d+\.\d+$/.test(versions.html || ''), `release uses semantic versioning (${versions.html})`);

const combined = `${html}\n${js}\n${css}`;
const cachedAssets=(sw.match(/const ASSETS = \[([\s\S]*?)\];/)||[])[1]||'';
for(const asset of ['./index.html','./boot.js','./app.js','./styles.css','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png']){
  check(cachedAssets.includes(`'${asset}'`)||cachedAssets.includes(`"${asset}"`),`service worker pre-caches ${asset}`);
}
check(/addEventListener\(['"]message/.test(sw)&&/SKIP_WAITING/.test(sw),'service worker waits for an explicit update message');
const installHandler=(sw.match(/addEventListener\(['"]install['"][\s\S]*?\n\}\);/)||[])[0]||'';
check(Boolean(installHandler)&&!/skipWaiting\(\)/.test(installHandler),'service worker does not force-update during install');
check(/registration\.waiting/.test(boot)&&/controllerchange/.test(boot),'bootstrap exposes and applies waiting updates');
check(/Content-Security-Policy/.test(html)&&!/script-src[^;]*unsafe-inline/.test(html),'HTML fallback CSP blocks inline scripts');
check(/Content-Security-Policy/.test(headers)&&/frame-ancestors 'none'/.test(headers),'deployable headers include CSP and frame protection');
check(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html),'HTML contains no inline script blocks');
check(!/api\.elevenlabs\.io/i.test(`${html}\n${js}`),'browser bundle contains no direct ElevenLabs endpoint');
check(!/id=["']apiKey["']/.test(html),'browser contains no provider API-key field');
check(!/localStorage\.setItem\(["']v08relayToken["']/.test(js),'relay passphrase is never persisted to localStorage');
check(/id=["']backupJson["']/.test(html)&&/id=["']restoreJson["']/.test(html),'complete backup and restore controls are present');
check(/id=["']clearConfirm["']/.test(html)&&/DELETE ALL/.test(html),'destructive clear requires an explicit phrase');
for (const marker of ['pronPanel', 'pronMode', 'pronColour', 'pronDemo', 'pronLegend', 'const Pron=', '.pron-mark']) {
  check(!combined.includes(marker), `pronunciation preview marker removed: ${marker}`);
}

console.log(`\n${failed ? 'FAIL' : 'PASS'} (${passed})`);
if(failed)console.log(`${failed} failed`);
process.exit(failed ? 1 : 0);

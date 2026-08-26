/* Pause must mean silence.
   Regression cover for three faults reported against v1.10.2:
     1. a paused premium clip timing out into the system voice
     2. a provider failure during a pause starting the system voice
     3. premium speech falling back silently when the relay passphrase is absent
*/
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(8946, r));

const chromiumPath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(fs.existsSync(chromiumPath) ? {headless:true, executablePath:chromiumPath, args:['--no-sandbox']} : {headless:true});
const page = await browser.newPage();
await page.goto('http://127.0.0.1:8946/');
await page.waitForTimeout(300);

const checks = [];
const check = (name, pass, detail='') => checks.push({name, pass: Boolean(pass), detail});

/* ── 1. The suspended flag tracks the engine ─────────────────────────────── */
const flag = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  await Storage.addMany([{book:'1',chapter:'1',order:1,italian:'Credo che tu sia pronto.',english:'I think you are ready.',bookmarked:false,difficult:false,notes:''}]);
  await Library.refresh();
  window.__realSpeak = Speech.speak;
  Speech.speak = () => new Promise(r => setTimeout(r, 900));
  document.getElementById('playMode').value = 'loop-current';

  const seen = {};
  SentenceController.toggle(); await wait(60);
  seen.playing = App.audioSuspended;
  SentenceController.toggle(); await wait(30);
  seen.paused = App.audioSuspended;
  SentenceController.toggle(); await wait(30);
  seen.resumed = App.audioSuspended;
  MainPlayer.stop(); await wait(30);
  seen.stopped = App.audioSuspended;
  return seen;
});
check('Playing does not suspend audio', flag.playing === false, String(flag.playing));
check('Pause suspends audio', flag.paused === true, String(flag.paused));
check('Resume unsuspends audio', flag.resumed === false, String(flag.resumed));
check('Stop unsuspends audio', flag.stopped === false, String(flag.stopped));

/* ── 2. A premium failure during a pause stays silent ────────────────────── */
const fallback = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  MainPlayer.stop(); await wait(50);

  let systemCalls = 0;
  const realSystem = Speech.system, realEleven = Speech.eleven;
  Speech.speak = window.__realSpeak;          // undo the stub test 1 installed
  Speech.system = function(t){ systemCalls++; return Promise.resolve(); };

  let rejectPremium;
  Speech.eleven = () => new Promise((_, rej) => { rejectPremium = rej; });
  document.getElementById('voiceMode').value = 'eleven';
  document.getElementById('voiceId').value = 'test-voice-id';
  document.getElementById('playMode').value = 'loop-current';

  SentenceController.toggle();              // start — premium request is in flight
  await wait(80);
  SentenceController.toggle();              // learner pauses
  await wait(40);
  const buttonWhilePaused = document.getElementById('mainToggle').textContent;
  rejectPremium(new Error('Audio playback timed out'));   // the watchdog, as it used to fire
  await wait(200);

  const out = {
    systemCalls,
    buttonWhilePaused,
    buttonAfterFailure: document.getElementById('mainToggle').textContent,
    stillPaused: MainPlayer.paused
  };
  MainPlayer.stop(); await wait(30);
  Speech.system = realSystem; Speech.eleven = realEleven;
  document.getElementById('voiceMode').value = 'system';
  return out;
});
check('Paused session stays silent when premium fails', fallback.systemCalls === 0, `system() called ${fallback.systemCalls}×`);
check('Button reads Resume while paused', fallback.buttonWhilePaused === 'Resume', fallback.buttonWhilePaused);
check('Button still reads Resume after the failure', fallback.buttonAfterFailure === 'Resume', fallback.buttonAfterFailure);
check('Engine remains paused after the failure', fallback.stillPaused === true, String(fallback.stillPaused));

/* ── 3. A paused clip is not judged timed out ────────────────────────────── */
/* This is the reported fault, reproduced. A clip is playing, the learner
   pauses, and the total watchdog elapses. Before the fix that rejection was
   read as a provider failure and the system voice began speaking. The
   durations are shortened so the suite does not wait 45 seconds. */
const watchdog = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* Three seconds of silence as a real WAV, so the element genuinely plays
     and nothing fails for the uninteresting reason of a bad codec. */
  const rate = 8000, secs = 3, n = rate * secs;
  const buf = new ArrayBuffer(44 + n), view = new DataView(buf);
  const ascii = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + n, true); ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  ascii(36, 'data'); view.setUint32(40, n, true);
  for (let i = 0; i < n; i++) view.setUint8(44 + i, 128);   // 8-bit silence
  const silence = new Blob([buf], { type: 'audio/wav' });

  if (!Speech.WATCHDOG) return { unsupported: true };
  const realWatchdog = { ...Speech.WATCHDOG };
  Speech.WATCHDOG.start = 1500;
  Speech.WATCHDOG.total = 400;

  App.audioSuspended = false;
  let settled = 'pending';
  Speech.playBlob(silence).then(() => { settled = 'resolved'; }, () => { settled = 'rejected'; });
  /* Wait for real playback rather than a fixed delay — on a loaded machine the
     blob can take longer than a guessed pause to start, and pausing before it
     has begun tests nothing. */
  let startedPlaying = false;
  for (let i = 0; i < 60 && settled === 'pending'; i++) {
    if (App.currentAudio && App.currentAudio.currentTime > 0 && !App.currentAudio.paused) { startedPlaying = true; break; }
    await wait(50);
  }

  /* The learner presses Pause. */
  App.audioSuspended = true;
  if (App.currentAudio) App.currentAudio.pause();

  await wait(900);                       // well past the 400ms total watchdog
  const whilePaused = settled;

  App.audioSuspended = false;            // Resume — the watchdog may count again
  await wait(700);
  const afterResume = settled;

  Speech.stopAudioOnly();
  Object.assign(Speech.WATCHDOG, realWatchdog);
  return { startedPlaying, whilePaused, afterResume };
});
check('Watchdog durations are addressable', !watchdog.unsupported, watchdog.unsupported ? 'Speech.WATCHDOG absent' : '');
check('Clip actually started before the pause', watchdog.startedPlaying, String(watchdog.startedPlaying));
check('Paused clip is not judged timed out', watchdog.whilePaused === 'pending', watchdog.whilePaused);
check('Watchdog counts again once resumed', watchdog.afterResume !== 'pending', watchdog.afterResume);

/* ── 4. Premium speech says when it has no passphrase ────────────────────── */
const notice = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const el = document.getElementById('premiumNotice');
  if (!el) return { missing: true };
  const relay = document.getElementById('relayToken');
  const mode = document.getElementById('voiceMode');

  SecureConfig.set && SecureConfig.set('relayToken', '');
  try { sessionStorage.removeItem('v08relayToken'); } catch (e) {}
  relay.value = '';
  mode.value = 'system'; mode.dispatchEvent(new Event('change')); await wait(30);
  const onSystemVoice = el.classList.contains('hidden');

  mode.value = 'eleven'; mode.dispatchEvent(new Event('change')); await wait(30);
  const onPremiumNoPass = !el.classList.contains('hidden');
  const wording = el.textContent;

  relay.value = 'a-passphrase'; relay.dispatchEvent(new Event('input')); await wait(30);
  const afterTyping = el.classList.contains('hidden');

  relay.value = ''; relay.dispatchEvent(new Event('input')); await wait(30);
  const afterClearing = !el.classList.contains('hidden');

  mode.value = 'system'; mode.dispatchEvent(new Event('change'));
  return { onSystemVoice, onPremiumNoPass, wording, afterTyping, afterClearing };
});
check('Settings carries a premium-readiness notice', !notice.missing, notice.missing ? '#premiumNotice absent' : '');
check('No notice while on the system voice', notice.onSystemVoice);
check('Notice appears for premium without a passphrase', notice.onPremiumNoPass);
check('Notice names the shared passphrase', /premium speech and Generate/i.test(notice.wording || ''), (notice.wording || '').slice(0, 90));
check('Notice clears once a passphrase is entered', notice.afterTyping);
check('Notice returns if the passphrase is removed', notice.afterClearing);

await browser.close();
server.close();

const failures = checks.filter(c => !c.pass);
console.log(`${failures.length ? 'FAIL' : 'PASS'} (${checks.length})`);
for (const f of failures) console.log(`  ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
if (failures.length) process.exitCode = 1;

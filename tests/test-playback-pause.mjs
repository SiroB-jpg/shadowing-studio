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

/* ── v1.11.4 — the relay connection is one shared credential ──────────────── */
const relay = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const state = document.getElementById('relayState');
  const url = document.getElementById('relayUrl');
  const token = document.getElementById('relayToken');
  const remember = document.getElementById('rememberToken');
  const saveBtn = document.getElementById('saveAiBtn');
  if (!state || !remember || !saveBtn) return { missing: true };

  SecureConfig.clear('relayToken');
  url.value = ''; token.value = ''; remember.checked = false;
  token.dispatchEvent(new Event('input')); await wait(30);
  const emptyWording = state.textContent;

  url.value = 'https://example.workers.dev';
  token.value = 'a-passphrase';
  remember.checked = false;
  saveBtn.click(); await wait(40);
  const sessionOnlyWording = state.textContent;
  const notPersisted = !localStorage.getItem('iss-device-relayToken');

  remember.checked = true;
  saveBtn.click(); await wait(40);
  const rememberedWording = state.textContent;
  const persisted = localStorage.getItem('iss-device-relayToken') === 'a-passphrase';

  /* A new session must still find it. */
  sessionStorage.removeItem('iss-session-relayToken');
  const survivesNewSession = SecureConfig.get('relayToken') === 'a-passphrase';

  document.getElementById('clearAiBtn').click(); await wait(30);
  const clearedEverywhere = !localStorage.getItem('iss-device-relayToken')
    && !sessionStorage.getItem('iss-session-relayToken')
    && SecureConfig.get('relayToken') === '';

  return { emptyWording, sessionOnlyWording, rememberedWording, notPersisted,
           persisted, survivesNewSession, clearedEverywhere,
           saveLabel: saveBtn.textContent.trim(),
           hasTest: !!document.getElementById('testRelayBtn') };
});
check('Settings carries a relay connection state line', !relay.missing, relay.missing ? '#relayState or #rememberToken absent' : '');
check('Save button says Save', relay.saveLabel === 'Save', relay.saveLabel);
check('A Test connection button exists', relay.hasTest);
check('Empty state names both dependants', /ElevenLabs|Generate/i.test(relay.emptyWording || ''), (relay.emptyWording || '').slice(0, 90));
check('Unticked box keeps the passphrase out of device storage', relay.notPersisted);
check('Unticked state says it lasts for this session only', /session only/i.test(relay.sessionOnlyWording || ''), (relay.sessionOnlyWording || '').slice(0, 90));
check('Ticked box stores the passphrase on the device', relay.persisted);
check('Remembered state says so', /remembered on this device/i.test(relay.rememberedWording || ''), (relay.rememberedWording || '').slice(0, 90));
check('A remembered passphrase survives a new session', relay.survivesNewSession);
check('Clear removes it from session and device alike', relay.clearedEverywhere);


/* ── v1.11.5 — the relay's own explanation, and standing down on a settings fault ── */
const premium = await page.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const realFetch = window.fetch;
  const reply = (status, body) => () => Promise.resolve(new Response(
    JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

  document.getElementById('relayUrl').value = 'https://example.workers.dev';
  SecureConfig.set('relayToken', 'a-passphrase', false);
  document.getElementById('voiceId').value = 'a-voice-id-1234';

  const grab = async () => { try { await Speech.fetchPremium('ciao', 'a-voice-id-1234'); return null; }
                             catch (e) { return { message: e.message, fatal: !!e.fatal, rateLimited: !!e.rateLimited }; } };

  window.fetch = reply(400, { error: 'Voice ID is not approved for this relay.' });
  const badVoice = await grab();

  window.fetch = reply(429, { error: 'Too many speech requests. Wait a minute and try again.' });
  const limited = await grab();

  window.fetch = reply(401, { error: 'Wrong or missing passphrase.' });
  const badPass = await grab();

  /* Three settings faults in a row and premium speech stands down. */
  Speech.breaker.reset();
  window.fetch = reply(400, { error: 'Voice ID is not approved for this relay.' });
  for (let i = 0; i < 3; i++) Speech.breaker.record(await grab());
  await wait(30);
  const notice = document.getElementById('speechNotice');
  const trippedAt3 = Speech.breaker.tripped;
  const noticeShown = !notice.classList.contains('hidden');
  const noticeNamesReason = /not approved for this relay/i.test(notice.textContent);
  const hasRetry = !!document.getElementById('retryPremium');

  /* A rate limit is weather, not a settings fault — it must not trip it. */
  Speech.breaker.reset();
  window.fetch = reply(429, { error: 'Too many speech requests.' });
  for (let i = 0; i < 5; i++) Speech.breaker.record(await grab());
  const rateLimitNeverTrips = !Speech.breaker.tripped;

  Speech.breaker.reset();
  const resetClearsNotice = notice.classList.contains('hidden');

  window.fetch = realFetch;
  SecureConfig.clear('relayToken');
  document.getElementById('relayUrl').value = '';
  document.getElementById('voiceId').value = '';
  return { badVoice, limited, badPass, trippedAt3, noticeShown, noticeNamesReason,
           hasRetry, rateLimitNeverTrips, resetClearsNotice };
});
check('A rejected Voice ID is reported in the relay\'s own words',
  /not approved for this relay/i.test(premium.badVoice?.message || ''), premium.badVoice?.message);
check('A settings fault is marked fatal', premium.badVoice?.fatal === true);
check('A rejected passphrase is reported in words too',
  /wrong or missing passphrase/i.test(premium.badPass?.message || ''), premium.badPass?.message);
check('A rate limit is not treated as a settings fault',
  premium.limited?.rateLimited === true && premium.limited?.fatal === false);
check('Three settings faults stand premium speech down', premium.trippedAt3);
check('Standing down raises a notice that does not scroll away', premium.noticeShown);
check('The notice names the relay\'s reason', premium.noticeNamesReason, 'reason absent');
check('The notice offers a way to try again', premium.hasRetry);
check('Rate limits never trip the breaker', premium.rateLimitNeverTrips);
check('Resetting clears the notice', premium.resetClearsNotice);


/* ── v1.11.6 — an unresponsive relay must not read as "playback is broken" ── */
const silence = await page.evaluate(async () => {
  const log = [];
  const realSystem = Speech.system, realBlob = Speech.playBlob, realFetch = window.fetch;
  Speech.system = () => { log.push('SYSTEM'); return Promise.resolve(); };
  Speech.playBlob = () => { log.push('PREMIUM'); return Promise.resolve(); };
  Speech.RELAY_TIMEOUT = { first: 250, settled: 500 };   // same shape, test speed

  document.getElementById('relayUrl').value = 'https://example.workers.dev';
  SecureConfig.set('relayToken', 'p', false);
  document.getElementById('voiceId').value = 'a-voice-id-1234';
  document.getElementById('voiceMode').value = 'eleven';
  Speech.breaker.reset();

  /* A relay that never answers, honouring abort the way real fetch does. */
  window.fetch = (u, o) => new Promise((_, rej) => {
    const sig = o && o.signal;
    if (sig) sig.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
  });

  const engine = { stopped: false, paused: false };
  const waits = [];
  for (let i = 0; i < 4; i++) {
    const t = Date.now();
    await Speech.speak('Sentence number ' + i, engine);
    waits.push(Date.now() - t);
  }
  const notice = document.getElementById('speechNotice');
  const result = {
    everySentenceSpoke: log.length === 4 && log.every(v => v === 'SYSTEM'),
    firstWait: waits[0], lastWait: waits[3],
    tripped: Speech.breaker.tripped,
    noticeVisible: !notice.classList.contains('hidden'),
    noticeNamesWait: /did not answer/i.test(notice.textContent)
  };
  Speech.system = realSystem; Speech.playBlob = realBlob; window.fetch = realFetch;
  Speech.RELAY_TIMEOUT = { first: 5000, settled: 12000 };
  Speech.breaker.reset(); SecureConfig.clear('relayToken');
  document.getElementById('relayUrl').value = ''; document.getElementById('voiceId').value = '';
  document.getElementById('voiceMode').value = 'system';
  return result;
});
check('An unresponsive relay never leaves a sentence silent', silence.everySentenceSpoke, JSON.stringify(silence));
check('First contact gives up quickly rather than hanging', silence.firstWait < 1500, silence.firstWait + 'ms');
check('Two silent waits stand premium speech down', silence.tripped);
check('Once stood down, sentences start at once', silence.lastWait < 100, silence.lastWait + 'ms');
check('The notice explains the silence', silence.noticeVisible && silence.noticeNamesWait);


await browser.close();
server.close();

const failures = checks.filter(c => !c.pass);
console.log(`${failures.length ? 'FAIL' : 'PASS'} (${checks.length})`);
for (const f of failures) console.log(`  ✗ ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
if (failures.length) process.exitCode = 1;

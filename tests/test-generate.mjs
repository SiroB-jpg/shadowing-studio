import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {};
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8931,r));
const b=await chromium.launch(launchOpts);
const page=await b.newPage();
const errors=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));

const RELAY='https://relay.test/gen';
let calls=[];
async function stubRelay(){
  await page.unroute('https://relay.test/**').catch(()=>{});
  await page.route('https://relay.test/**', async route=>{
    const body=JSON.parse(route.request().postData());
    calls.push({body,headers:route.request().headers()});
    const sentences=Array.from({length:body.count},(_,i)=>({
      italian:`Non credo che ce la faccia da solo numero ${calls.length}-${i+1}.`,
      english:`I don't think he can manage alone, number ${calls.length}-${i+1}.`}));
    await route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({sentences,model:'gemini-3.6-flash'})});
  });
}
await stubRelay();
await page.goto('http://localhost:8931/index.html'); await page.waitForTimeout(600);

const ok=[],fail=[]; const check=(n,c,x='')=>(c?ok:fail).push(n+(x?' — '+x:''));

// guards
await page.click('.desktop-tabs [data-panel="generate"]');
check('Generate tab opens', await page.isVisible('#generate'));
await page.fill('#genWord','farcela'); await page.click('#genBtn'); await page.waitForTimeout(200);
let st=await page.textContent('#genStatus');
check('Blocks without relay settings', /generator address and passphrase/i.test(st), st);

// settings
await page.click('.desktop-tabs [data-panel="settings"]');
check('No OpenAI key field remains', (await page.$$('#aiKey')).length===0);
await page.fill('#relayUrl', RELAY+'/'); await page.fill('#relayToken','pass123');
await page.selectOption('#saveAi','yes'); await page.click('#saveAiBtn');
check('Relay settings persist', await page.evaluate(()=>localStorage.getItem('v08relayUrl')&&localStorage.getItem('v08relayToken')==='pass123'));

// generate
await page.click('.desktop-tabs [data-panel="generate"]');
await page.selectOption('#genCount','20'); await page.selectOption('#genTense','congiuntivo presente');
await page.selectOption('#genRegister','colloquial');
await page.click('#genBtn');
await page.waitForFunction(()=>/sentences ready/.test(document.getElementById('genStatus').textContent),null,{timeout:20000});
st=await page.textContent('#genStatus');
check('Generates requested count', /^20 sentences ready/.test(st), st);
check('Batched 15 + 5', calls.length===2&&calls[0].body.count===15&&calls[1].body.count===5, 'calls='+calls.length);
check('Passphrase sent as a header', calls[0].headers['x-app-token']==='pass123');
check('Trailing slash on address tolerated', calls[0].body!==undefined);
check('No key or prompt sent from the browser',
  !JSON.stringify(calls[0].body).toLowerCase().includes('you write italian') && !('key' in calls[0].body));
check('Structured parameters sent instead of a prompt',
  calls[0].body.word==='farcela'&&calls[0].body.tense==='congiuntivo presente'&&calls[0].body.register==='colloquial');
check('Avoid list sent on later batches', Array.isArray(calls[1].body.avoid)&&calls[1].body.avoid.length>0);

// template
const tpl=await page.evaluate(()=>({header:Generator.csv.split('\n')[0],rows:Generator.rows.length,
  id:Generator.rows[0].ID, groups:[...new Set(Generator.rows.map(r=>r.Group))],
  source:Generator.rows[0].SourceFile}));
check('CSV header unchanged from the corpus template',
  tpl.header==='ID,Book,Chapter,ChapterTitle,Group,Item,Italian,English,AudioText,TranslationStatus,SourceFile,Notes',tpl.header);
check('Rows built', tpl.rows===20, String(tpl.rows));
check('IDs still follow the corpus pattern', /^GEN-FARCELA-01-01$/.test(tpl.id), tpl.id);
check('Groups of ten', JSON.stringify(tpl.groups)==='[1,2]', JSON.stringify(tpl.groups));
check('Model recorded in SourceFile', /gemini-3\.6-flash/.test(tpl.source), tpl.source);

// save + playback
await page.click('#genSave');
await page.waitForFunction(()=>/Saved 20 sentences/.test(document.getElementById('genStatus').textContent),null,{timeout:8000});
const lib=await page.evaluate(()=>({total:App.sentences.length,book:App.sentences[0].book,
  chapter:App.sentences[0].chapter,orders:App.sentences.map(s=>s.order),
  groups:[...new Set(App.sentences.map(s=>Util.gnum(s)))]}));
check('Saved to library', lib.total===20&&lib.book==='Generated'&&lib.chapter==='farcela', JSON.stringify(lib).slice(0,80));
check('Set stays on screen after saving', (await page.$$eval('#genCards .card',c=>c.length))===20);
check('Save button reports saved and disables', await page.evaluate(()=>{const b=document.getElementById('genSave');return b.disabled&&/Saved/.test(b.textContent);}));
check('Order 1..20 after round-trip', JSON.stringify(lib.orders)===JSON.stringify(Array.from({length:20},(_,i)=>i+1)));
check('Groups derived correctly', JSON.stringify(lib.groups)==='[1,2]');

await page.click('.desktop-tabs [data-panel="settings"]'); await page.selectOption('#voiceMode','system');
await page.click('.desktop-tabs [data-panel="study"]'); await page.waitForTimeout(300);
check('Study renders the group', (await page.$$eval('#viewer .card',c=>c.length))===10);
await page.click('#mainToggle'); await page.waitForTimeout(700);
check('Playback runs on generated sentences', await page.evaluate(()=>MainPlayer.playing===true));
await page.click('#hardReset');

// ── in-tab playback ─────────────────────────────────────────────────────────
await page.click('.desktop-tabs [data-panel="generate"]'); await page.waitForTimeout(200);
check('Playback controls appear once a set exists', await page.isVisible('#genPlayback'));
check('Cards rendered for every sentence', (await page.$$eval('#genCards .card',c=>c.length))===20);
check('First card starts active', await page.evaluate(()=>document.querySelectorAll('#genCards .card')[0].classList.contains('active')));

// Headless Chromium has no speech voices, so utterances resolve instantly.
// A long pause and high repeat keep the engine alive long enough to observe.
await page.selectOption('#genRepeat','5');
await page.selectOption('#genRate','0.8');
await page.selectOption('#genPause','5000');
await page.selectOption('#genPlayMode','set');
await page.evaluate(()=>{Generator.index=0;});
await page.click('#genToggle');
await page.waitForTimeout(600);
check('Generate tab plays its own set', await page.evaluate(()=>GenPlayer.playing===true));
check('Playback context switches to gen', await page.evaluate(()=>App.playbackContext==='gen'));
check('Gen speed control is the one in use', await page.evaluate(()=>{App.playbackContext='gen';return PlaybackControls.rate()===0.8&&PlaybackControls.repeat()===5;}));
check('Study controls untouched by the gen set', await page.evaluate(()=>{App.playbackContext='main';return PlaybackControls.rate()===1;}));
await page.evaluate(()=>{App.playbackContext='gen';});
check('Start button becomes Pause while playing', /Pause/.test(await page.textContent('#genToggle')));
await page.click('#genToggle'); await page.waitForTimeout(200);
check('Pause works', await page.evaluate(()=>GenPlayer.paused===true));
await page.click('#genToggle'); await page.waitForTimeout(200);
check('Resume works', await page.evaluate(()=>GenPlayer.paused===false));
await page.click('#genStopAudio'); await page.waitForTimeout(200);
check('Reset audio stops the gen player', await page.evaluate(()=>GenPlayer.playing===false));

// navigation
await page.evaluate(()=>{Generator.index=0;Generator.renderCards();});
await page.click('#genNext'); await page.waitForTimeout(150);
check('Next sentence advances', await page.evaluate(()=>Generator.index===1));
await page.click('#genPrev'); await page.click('#genPrev'); await page.waitForTimeout(150);
check('Previous wraps to the end', await page.evaluate(()=>Generator.index===19));
await page.$$eval('#genCards .card',c=>c[4].click()); await page.waitForTimeout(150);
check('Tapping a card jumps to it', await page.evaluate(()=>Generator.index===4));
check('Active highlight follows the jump', await page.evaluate(()=>document.querySelectorAll('#genCards .card')[4].classList.contains('active')));

// loop mode keeps going past the end
await page.selectOption('#genPlayMode','loop-set');
check('Loop mode provider never runs out', await page.evaluate(()=>{
  const p=GenController.provider(); let n=0;
  for(let i=0;i<45;i++){ if(!p.next()) return false; n++; }
  return n===45;
}));
await page.selectOption('#genPlayMode','set');
check('Non-loop mode stops at the end', await page.evaluate(()=>{
  Generator.index=0; const p=GenController.provider(); let n=0;
  while(p.next()) { n++; if(n>60) break; }
  return n===20;
}));
await page.selectOption('#genPlayMode','group');
check('Group mode covers the second ten', await page.evaluate(()=>{
  Generator.index=10; const p=GenController.provider(); let n=0;
  while(p.next()){ n++; if(n>30) break; }
  return n===10;
}));
check('Group mode resumes from the current sentence, as Study does', await page.evaluate(()=>{
  Generator.index=12; const p=GenController.provider(); let n=0;
  while(p.next()){ n++; if(n>30) break; }
  return n===8;
}));
await page.selectOption('#genPlayMode','set');

// dropping a sentence
await page.evaluate(()=>{Generator.index=0;});
const before=await page.evaluate(()=>Generator.items[3].italian);
await page.$$eval('#genCards .card',c=>c[3].querySelector('[data-a="drop"]').click());
await page.waitForTimeout(200);
check('Drop removes the sentence', await page.evaluate(b=>Generator.items.length===19&&Generator.items[3].italian!==b, before));
check('Cards re-render after a drop', (await page.$$eval('#genCards .card',c=>c.length))===19);
check('Template rows renumber after a drop', await page.evaluate(()=>Generator.rows.length===19&&Generator.rows[18].Item===9));
check('Dropping re-enables saving', await page.evaluate(()=>document.getElementById('genSave').disabled===false));

// leaving the tab stops playback
await page.click('#genToggle'); await page.waitForTimeout(400);
await page.click('.desktop-tabs [data-panel="study"]'); await page.waitForTimeout(300);
check('Leaving Generate stops its playback', await page.evaluate(()=>GenPlayer.playing===false));
await page.click('.desktop-tabs [data-panel="generate"]'); await page.waitForTimeout(200);

// append
await page.click('.desktop-tabs [data-panel="generate"]');
await page.fill('#genWord','farcela'); await page.selectOption('#genCount','10'); await page.click('#genBtn');
await page.waitForFunction(()=>/sentences ready/.test(document.getElementById('genStatus').textContent),null,{timeout:20000});
check('Re-generating continues numbering', await page.evaluate(()=>Generator.rows[0].Group===3&&Generator.rows[0].Item===1));

// relay error paths, in the app's own words
for(const [status,payload,expect,label] of [
  [401,{error:'Wrong or missing passphrase.'},/passphrase in Settings does not match/i,'401 wrong passphrase'],
  [403,{error:'This relay does not serve that address.'},/different web address/i,'403 wrong origin'],
  [429,{error:"Google's free allowance is used up for now. Try again later."},/free allowance/i,'429 quota'],
  [500,{error:'Relay is missing its GEMINI_API_KEY setting.'},/missing one of its settings|GEMINI_API_KEY/i,'500 misconfigured'],
  [502,{error:'Could not reach Google: network down'},/could not reach google/i,'502 upstream down'],
]){
  await page.unroute('https://relay.test/**');
  await page.route('https://relay.test/**',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)}));
  await page.fill('#genWord','magari'); await page.click('#genBtn');
  await page.waitForFunction(()=>/dangertxt/.test(document.getElementById('genStatus').className),null,{timeout:15000});
  const msg=await page.textContent('#genStatus');
  check('Explains '+label+' in plain language', expect.test(msg), msg);
}

check('A failed generation leaves the previous set intact',
  await page.evaluate(()=>Generator.items.length>0));

// unreachable relay
await page.unroute('https://relay.test/**');
await page.route('https://relay.test/**',r=>r.abort('connectionrefused'));
await page.fill('#genWord','dunque'); await page.click('#genBtn');
await page.waitForFunction(()=>/dangertxt/.test(document.getElementById('genStatus').className),null,{timeout:15000});
check('Explains an unreachable generator', /Could not reach your generator/i.test(await page.textContent('#genStatus')));

// regression: CSV importer untouched
const corpus=`ID,Book,Chapter,ChapterTitle,Group,Item,Italian,English,AudioText,TranslationStatus,SourceFile,Notes
B1-01-01-01,1,1,"Opinions",1,1,Credo che tu sia pronto.,I think you're ready.,x,translated,f.docx,n
B1-01-02-01,1,1,"Opinions",2,1,Penso che abbia ragione.,I think they're right.,x,translated,f.docx,n`;
const parsed=await page.evaluate(c=>Library.parseCSV(c,{book:'X',chapter:'Y'}),corpus);
check('Corpus CSV still imports with correct groups', parsed.length===2&&parsed[0].order===1&&parsed[1].order===11);
const legacy=`book,chapter,order,italian,english\nBk,Ch,1,Ciao a tutti.,Hi everyone.\nBk,Ch,2,Come stai?,How are you?`;
const lp=await page.evaluate(c=>Library.parseCSV(c,{book:'X',chapter:'Y'}),legacy);
check('Legacy CSV still imports', lp.length===2&&lp[1].italian==='Come stai?');

// mobile
await page.setViewportSize({width:390,height:780}); await page.waitForTimeout(200);
check('Mobile nav has 5 buttons', (await page.$$eval('.mobile-nav-btn',x=>x.length))===5);
await page.click('.mobile-nav-btn[data-screen="generate"]'); await page.waitForTimeout(200);
check('Mobile generate screen visible', await page.isVisible('#generate'));
await page.setViewportSize({width:1400,height:950});
await page.click('.desktop-tabs [data-panel="settings"]'); await page.waitForTimeout(300);
await page.screenshot({path:'/home/claude/settings-v130.png'});

console.log('PASS ('+ok.length+')'); ok.forEach(t=>console.log('  ✓ '+t));
if(fail.length){console.log('\nFAIL ('+fail.length+')'); fail.forEach(t=>console.log('  ✗ '+t));}
const real=errors.filter(e=>!/favicon|manifest|sw\.js|ServiceWorker|tabler|jsdelivr|Failed to load resource/i.test(e));
console.log('\nConsole errors: '+(real.length?'\n  '+real.join('\n  '):'none'));
await b.close(); srv.close(); process.exit(fail.length?1:0);

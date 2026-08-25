import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8944,r));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath}:{headless:true});
const page=await browser.newPage();
await page.addInitScript(()=>{
  const handlers={};
  Object.defineProperty(navigator,'mediaSession',{configurable:true,value:{handlers,metadata:null,playbackState:'none',setActionHandler(name,fn){handlers[name]=fn;}}});
  globalThis.MediaMetadata=class{constructor(v){Object.assign(this,v);}};
});
await page.goto('http://127.0.0.1:8944/');
await page.waitForTimeout(250);
const result=await page.evaluate(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const snapshot=()=>({main:[MainPlayer.playing,MainPlayer.paused],verb:[VerbPlayer.playing,VerbPlayer.paused],gen:[GenPlayer.playing,GenPlayer.paused],context:App.playbackContext,state:navigator.mediaSession.playbackState});
  await Storage.addMany([{book:'1',chapter:'1',order:1,italian:'Credo che tu sia pronto.',english:'I think you are ready.',bookmarked:false,difficult:false,notes:''}]);
  await Library.refresh();
  Speech.speak=()=>new Promise(r=>setTimeout(r,700));
  document.getElementById('playMode').value='loop-current';

  SentenceController.toggle();await wait(50);SentenceController.toggle();await wait(20);
  const studyPaused=snapshot();navigator.mediaSession.handlers.play();await wait(30);const studyResumed=snapshot();navigator.mediaSession.handlers.stop();await wait(20);const studyStopped=snapshot();

  document.getElementById('verbsTab').click();navigator.mediaSession.handlers.play();await wait(40);const verbStarted=snapshot();navigator.mediaSession.handlers.pause();await wait(20);const verbPaused=snapshot();navigator.mediaSession.handlers.stop();await wait(20);const verbStopped=snapshot();

  Generator.items=[{italian:'Parlo italiano.',english:'I speak Italian.'}];Generator.index=0;document.getElementById('generateTab').click();navigator.mediaSession.handlers.play();await wait(40);const genStarted=snapshot();navigator.mediaSession.handlers.pause();await wait(20);const genPaused=snapshot();navigator.mediaSession.handlers.play();await wait(20);const genResumed=snapshot();navigator.mediaSession.handlers.stop();await wait(20);const genStopped=snapshot();

  return {registered:Object.keys(navigator.mediaSession.handlers),studyPaused,studyResumed,studyStopped,verbStarted,verbPaused,verbStopped,genStarted,genPaused,genResumed,genStopped};
});
const pass={
  handlers:['play','pause','stop'].every(k=>result.registered.includes(k)),
  studyResume:result.studyPaused.main[1]&&result.studyResumed.main[0]&&!result.studyResumed.main[1]&&!result.studyResumed.verb[0],
  studyStop:!result.studyStopped.main[0],
  verbStart:result.verbStarted.verb[0]&&!result.verbStarted.main[0]&&!result.verbStarted.gen[0]&&result.verbStarted.context==='verb',
  verbPause:result.verbPaused.verb[0]&&result.verbPaused.verb[1],
  verbStop:!result.verbStopped.verb[0],
  genStart:result.genStarted.gen[0]&&!result.genStarted.main[0]&&!result.genStarted.verb[0]&&result.genStarted.context==='gen',
  genPause:result.genPaused.gen[0]&&result.genPaused.gen[1],
  genResume:result.genResumed.gen[0]&&!result.genResumed.gen[1],
  genStop:!result.genStopped.gen[0]
};
const output={pass,result};
fs.writeFileSync(path.join(here,'media-session-results.json'),JSON.stringify(output,null,2));
const failed=Object.entries(pass).filter(([,value])=>!value);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
console.log(JSON.stringify(output,null,2));
await browser.close();server.close();
if(failed.length)process.exitCode=1;

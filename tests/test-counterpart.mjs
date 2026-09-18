/** The counterpart lane, from 1.17.0: counterpart rows import, keep their role,
    show a speaker tag, and play in the other voice — premium and system. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8952,r));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath,args:['--no-sandbox']}:{headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:8952/');await page.waitForTimeout(250);

/* Real header shapes, read from Drive on 18 September 2026. */
const travel=`book,booktitle,chapter,chaptertitle,group,item,italian,english,order,sentence_id,lane,group_id,speaker_role,speaker_label,response_type,audio_speed,voice_lane,exclude_from_canonical_shuffle
Travel Italian,Travel Italian — Unified Module v1.1,1,Arriving,1,1,Un biglietto per Roma.,A ticket to Rome.,1,TRAV-TR1.1-01,canonical,TR1.1,learner,,,learner_default,learner,
Travel Italian,Travel Italian — Unified Module v1.1,1,Arriving,1,2,Quanto costa?,How much is it?,2,TRAV-TR1.1-02,canonical,TR1.1,learner,,,learner_default,learner,
Travel Italian,Travel Italian — Unified Module v1.1,1,Arriving,7,1,Il treno è in ritardo di venti minuti.,Ticket clerk: The train is running twenty minutes late.,61,TRAV-TR1.7-01,counterpart,TR1.7,counterpart,ticket_clerk,acknowledgement,natural,counterpart,yes
Travel Italian,Travel Italian — Unified Module v1.1,1,Arriving,7,2,Binario tre.,Ticket clerk: Platform three.,62,TRAV-TR1.7-02,counterpart,TR1.7,counterpart,ticket_clerk,physical_action,natural,counterpart,yes`;
/* Health: 36 columns, capitalised, counterpart in a distinct Book. */
const health=`ID,Book,BookTitle,Chapter,ChapterTitle,Group,Item,Italian,English,speaker_role,speaker_label,response_type
HBW-C01-G01-I01,Italian Health,Italian for Health,1,At the doctor,1,1,Ho mal di testa.,I have a headache.,learner,,
HBW-C03-CP-I01,Italian Health — Counterpart,Italian for Health,3,At the doctor — counterpart,1,1,Da quanto tempo?,Doctor: For how long?,counterpart,doctor,verbal`;
/* The recommended shape: record_type=counterpart in the one file. */
const bundle=`record_type,sentence_id,book,chapter_id,group_id,sequence,italian,english,speaker_label
sentence,X-1.1-01,Demo,1,1.1,1,Buongiorno.,Good morning.,
counterpart,X-1.1-02,Demo,1,1.1,2,Buongiorno! Desidera?,Barista: Good morning! What would you like?,barista
sentence,X-1.1-03,Demo,1,1.1,3,Un caffè per favore.,A coffee please.,
recognition,X-1.1-04,Demo,1,1.1,4,Ecco a lei.,Here you are.,`;
/* Arts and Culture staging: item_type carries the kind. */
const arts=`book,chapter,group,item,italian,english,item_type,speaker_label
Italian for Arts and Culture,1,6,1,La mostra apre alle dieci.,Information staff: The exhibition opens at ten.,counterpart,information_staff`;

const r=await page.evaluate(async({travel,health,bundle,arts})=>{
  const out={};
  const defs={book:'Default',chapter:'1'};
  const t=Library.parseCSV(travel,defs);
  out.travel={count:t.length,held:Library.lastReport.rowsHeldBack,roles:t.map(s=>s.speakerRole||'learner'),labels:t.map(s=>s.speakerLabel||''),orders:t.map(s=>s.order),groupIds:t.map(s=>s.groupId)};
  const h=Library.parseCSV(health,defs);
  out.health={count:h.length,books:h.map(s=>s.book),roles:h.map(s=>s.speakerRole||'learner'),label:h[1]?.speakerLabel};
  const b=Library.parseCSV(bundle,defs);
  out.bundle={count:b.length,held:Library.lastReport.rowsHeldBack,roles:b.map(s=>s.speakerRole||'learner'),label:b[1]?.speakerLabel};
  const a=Library.parseCSV(arts,defs);
  out.arts={count:a.length,role:a[0]?.speakerRole,label:a[0]?.speakerLabel};

  /* Put the bundle in the library and look at the screen. */
  await Storage.addMany(b.map(s=>({...s})));
  App.cur={book:'',chapter:'',group:1,index:0};
  await Library.refresh();
  out.stats=document.getElementById('stats').textContent;
  const rows=[...document.querySelectorAll('#viewer .srow, #viewer [class*="srow"]')];
  out.roleTags=[...document.querySelectorAll('#viewer .role')].map(e=>e.textContent);

  /* Import preview names the counterpart lines. */
  Importer.preview(Library.parseCSV(travel,defs),travel,null,[]);
  out.preview=document.getElementById('importSummary').textContent;

  /* Re-import: a changed label updates in place, nothing duplicates. */
  const again=Library.parseCSV(bundle.replace(',barista',',barista_at_the_bar'),defs);
  const split=Importer.split(again);
  out.reimport={fresh:split.fresh.length,dupes:split.dupes.length,changed:split.changed.length,label:split.changed[0]?.speakerLabel};

  /* Voice choice. */
  document.getElementById('voiceId').value='LEARNER-VOICE';
  document.getElementById('counterpartVoiceId').value='';
  out.voiceNoCounterpart={learner:Speech.voiceFor('learner'),counterpart:Speech.voiceFor('counterpart')};
  document.getElementById('counterpartVoiceId').value='QITiGyM4owEZrBEf0QV8';
  out.voiceWithCounterpart={learner:Speech.voiceFor(undefined),counterpart:Speech.voiceFor('counterpart'),keyDiffers:Speech.key('Ciao',Speech.voiceFor('counterpart'))!==Speech.key('Ciao',Speech.voiceFor('learner'))};

  /* System voices: a second Italian voice is chosen for the counterpart. */
  speechSynthesis.getVoices=()=>[{name:'Alice',lang:'it-IT'},{name:'Luca',lang:'it-IT'},{name:'Samantha',lang:'en-US'}];
  Speech.loadVoices();
  out.systemVoices={alice:App.alice?.name,counterpart:App.counterpartVoice?.name};
  speechSynthesis.getVoices=()=>[{name:'Alice',lang:'it-IT'}];
  Speech.loadVoices();
  out.systemVoicesOne={alice:App.alice?.name,counterpart:App.counterpartVoice};

  /* Playback: each line reaches Speech.speak with its lane. */
  const spoken=[];
  const realSystem=Speech.system;
  Speech.system=(text,lane)=>{spoken.push({text,lane:lane||'learner'});return Promise.resolve();};
  document.getElementById('voiceMode').value='system';
  document.getElementById('playMode').value='group';
  App.cur={book:'Demo',chapter:'1',group:1,index:0};UI.renderAll();
  await new Promise(res=>{const p=SentenceController.provider();(async()=>{let it;while((it=p.next())){await Speech.speak(it.text,null,it.lane);}res();})();});
  Speech.system=realSystem;
  out.spoken=spoken;

  /* Settings persist and clear. */
  document.getElementById('saveElevenBtn').click();
  out.saved={learner:localStorage.getItem('v08voice'),counterpart:localStorage.getItem('v08counterpartVoice'),listed:Preferences.keys.includes('v08counterpartVoice')};
  document.getElementById('clearElevenBtn').click();
  out.cleared={counterpart:localStorage.getItem('v08counterpartVoice'),field:document.getElementById('counterpartVoiceId').value};

  /* Backup round trip keeps the lane and the corpus columns. */
  const backup=Backup.create();
  const cp=backup.sentences.find(s=>s.speakerRole==='counterpart');
  const validated=Backup.validate(JSON.parse(JSON.stringify(backup)));
  const vcp=validated.sentences.find(s=>s.speakerRole==='counterpart');
  out.backup={role:cp?.speakerRole,label:cp?.speakerLabel,groupId:cp?.groupId,sentenceId:cp?.sentenceId,validatedRole:vcp?.speakerRole,validatedGroupId:vcp?.groupId};
  return out;
},{travel,health,bundle,arts});

const pass={
  travelKeepsCounterpartRows:r.travel.count===4&&r.travel.held===0,
  travelRoles:JSON.stringify(r.travel.roles)==='["learner","learner","counterpart","counterpart"]',
  travelLabels:r.travel.labels[2]==='ticket_clerk',
  travelPositionUntouched:JSON.stringify(r.travel.orders)==='[1,2,61,62]'&&r.travel.groupIds[2]==='TR1.7',
  healthDistinctBooks:r.health.count===2&&r.health.books[1]==='Italian Health — Counterpart'&&r.health.roles[1]==='counterpart'&&r.health.label==='doctor',
  bundleRecordType:r.bundle.count===3&&r.bundle.held===1&&JSON.stringify(r.bundle.roles)==='["learner","counterpart","learner"]'&&r.bundle.label==='barista',
  artsItemType:r.arts.count===1&&r.arts.role==='counterpart'&&r.arts.label==='information_staff',
  statsCountCounterpart:/3 sentences \(1 counterpart\)/.test(r.stats),
  roleTagOnRow:JSON.stringify(r.roleTags)==='["Barista"]',
  previewNamesCounterpart:/2 of them are counterpart lines/.test(r.preview),
  reimportUpdatesInPlace:r.reimport.fresh===0&&r.reimport.dupes===2&&r.reimport.changed===1&&r.reimport.label==='barista_at_the_bar',
  voiceFallsBackToLearner:r.voiceNoCounterpart.counterpart==='LEARNER-VOICE',
  voiceUsesCounterpart:r.voiceWithCounterpart.counterpart==='QITiGyM4owEZrBEf0QV8'&&r.voiceWithCounterpart.learner==='LEARNER-VOICE'&&r.voiceWithCounterpart.keyDiffers,
  systemSecondVoice:r.systemVoices.alice==='Alice'&&r.systemVoices.counterpart==='Luca',
  systemSingleVoiceShares:r.systemVoicesOne.alice==='Alice'&&r.systemVoicesOne.counterpart===null,
  playbackCarriesLane:JSON.stringify(r.spoken.map(s=>s.lane))==='["learner","counterpart","learner"]',
  settingsPersist:r.saved.counterpart==='QITiGyM4owEZrBEf0QV8'&&r.saved.listed,
  settingsClear:r.cleared.counterpart===null&&r.cleared.field==='',
  backupKeepsLane:r.backup.role==='counterpart'&&r.backup.label==='barista'&&r.backup.groupId==='1.1'&&r.backup.sentenceId==='X-1.1-02'&&r.backup.validatedRole==='counterpart'&&r.backup.validatedGroupId==='1.1',
  noPageErrors:errors.length===0
};
const failed=Object.entries(pass).filter(([,v])=>!v);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
for(const [k,v] of Object.entries(pass))console.log(`${v?'✓':'✗'} ${k}`);
if(failed.length)console.log(JSON.stringify({r,errors},null,2));
await browser.close();server.close();if(failed.length)process.exitCode=1;

/** The gender lane, from 1.18.0: "I am" in Settings, the learner's own form of
    a line where the file carries both, and four voices chosen by part and gender. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8953,r));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath,args:['--no-sandbox']}:{headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:8953/');await page.waitForTimeout(250);

const csv=`record_type,sentence_id,book,chapter,group_id,sequence,italian,english,speaker_gender,italian_alt,alt_controller,speaker_label
sentence,G-1.1-01,Demo,1,1.1,1,Sono stanco.,I am tired.,m,Sono stanca.,speaker,
sentence,G-1.1-02,Demo,1,1.1,2,Sono studentessa.,I am a student.,f,Sono studente.,,
sentence,G-1.1-03,Demo,1,1.1,3,Sono pronta.,I am ready.,f,,,
sentence,G-1.1-04,Demo,1,1.1,4,Ho fame.,I am hungry.,,,,
sentence,G-1.1-05,Demo,1,1.1,5,Sei stanco?,Are you tired?,m,Sei stanca?,addressee,
counterpart,G-1.1-06,Demo,1,1.1,6,Sono stanca anch'io.,Barista: I am tired too.,female,Sono stanco anch'io.,speaker,barista
counterpart,G-1.1-07,Demo,1,1.1,7,Prego.,Waiter: You're welcome.,M,,,waiter
counterpart,G-1.1-08,Demo,1,1.1,8,Arrivederci.,Clerk: Goodbye.,,,,clerk`;

const r=await page.evaluate(async(csv)=>{
  const out={};
  const rows=Library.parseCSV(csv,{book:'x',chapter:'1'});
  out.parsed=rows.map(s=>({g:s.speakerGender||'',alt:s.italianAlt||'',ac:s.altController||'',role:s.speakerRole||'learner'}));
  await Storage.addMany(rows.map(s=>({...s})));
  App.cur={book:'',chapter:'',group:1,index:0};await Library.refresh();
  const said=()=>App.sentences.map(s=>Lines.italian(s));
  const voices=()=>App.sentences.map(s=>{let v=Lines.voice(s);return v.lane[0]+(v.gender||'-');});
  const tags=()=>App.sentences.map(s=>Lines.tag(s));

  /* Not chosen: everything as written. */
  localStorage.removeItem('v08learnerGender');
  out.none={said:said(),voices:voices(),tags:tags()};
  /* Male learner. */
  localStorage.setItem('v08learnerGender','m');
  out.male={said:said(),voices:voices(),tags:tags()};
  /* Female learner. */
  localStorage.setItem('v08learnerGender','f');
  out.female={said:said(),voices:voices(),tags:tags()};
  UI.renderAll();
  out.screen={italian:[...document.querySelectorAll('#viewer .italian')].map(e=>e.textContent),gtags:[...document.querySelectorAll('#viewer .gtag')].map(e=>e.textContent),roles:[...document.querySelectorAll('#viewer .role')].map(e=>e.textContent)};

  /* Voice choice with four boxes. */
  const set=(id,v)=>{document.getElementById(id).value=v;};
  set('voiceId','LM');set('learnerFemaleVoiceId','LF');set('counterpartMaleVoiceId','CM');set('counterpartVoiceId','CF');
  const pick=(lane,gender)=>Speech.voiceFor({lane,gender});
  out.four={lm:pick('learner','m'),lf:pick('learner','f'),l0:pick('learner',''),cm:pick('counterpart','m'),cf:pick('counterpart','f'),c0:pick('counterpart',''),legacy:Speech.voiceFor('counterpart')};
  set('learnerFemaleVoiceId','');set('counterpartMaleVoiceId','');
  out.two={lf:pick('learner','f'),cm:pick('counterpart','m'),cf:pick('counterpart','f'),c0:pick('counterpart','')};
  set('counterpartVoiceId','');
  out.one={cf:pick('counterpart','f'),lf:pick('learner','f')};

  /* System voices by gender. */
  speechSynthesis.getVoices=()=>[{name:'Alice',lang:'it-IT'},{name:'Luca',lang:'it-IT'},{name:'Federica',lang:'it-IT'}];
  Speech.loadVoices();
  out.system={m:Speech.systemVoice({lane:'learner',gender:'m'}).name,f:Speech.systemVoice({lane:'counterpart',gender:'f'}).name,c0:Speech.systemVoice({lane:'counterpart',gender:''}).name,l0:Speech.systemVoice({lane:'learner',gender:''}).name};

  /* Playback carries text and voice per line, as the female learner. */
  const spoken=[];const real=Speech.system;
  Speech.system=(text,spec)=>{spoken.push(text+'|'+spec.lane[0]+(spec.gender||'-'));return Promise.resolve();};
  document.getElementById('voiceMode').value='system';document.getElementById('playMode').value='group';
  App.cur={book:'Demo',chapter:'1',group:1,index:0};UI.renderAll();
  const p=SentenceController.provider();let it;while((it=p.next())){await Speech.speak(it.text,null,it.lane);}
  Speech.system=real;out.spoken=spoken;

  /* Settings: the select persists and re-renders; save/clear cover the new boxes. */
  const sel=document.getElementById('learnerGender');sel.value='m';sel.dispatchEvent(new Event('change'));
  out.select={stored:localStorage.getItem('v08learnerGender'),firstRow:document.querySelector('#viewer .italian')?.textContent,keys:['v08learnerGender','v08learnerFemaleVoice','v08counterpartMaleVoice'].every(k=>Preferences.keys.includes(k))};
  set('voiceId','LM');set('learnerFemaleVoiceId','LF');set('counterpartMaleVoiceId','CM');set('counterpartVoiceId','CF');
  document.getElementById('saveElevenBtn').click();
  out.saved=['v08voice','v08learnerFemaleVoice','v08counterpartMaleVoice','v08counterpartVoice'].map(k=>localStorage.getItem(k));
  document.getElementById('clearElevenBtn').click();
  out.cleared=['v08learnerFemaleVoice','v08counterpartMaleVoice'].map(k=>localStorage.getItem(k)).concat([document.getElementById('learnerFemaleVoiceId').value]);

  /* Re-import updates the alternate in place; backup keeps it. */
  const again=Library.parseCSV(csv.replace('Sono stanca.','Sono stanchissima.'),{book:'x',chapter:'1'});
  const split=Importer.split(again);
  out.reimport={fresh:split.fresh.length,dupes:split.dupes.length,changed:split.changed.length,alt:split.changed[0]?.italianAlt};
  const b=Backup.validate(JSON.parse(JSON.stringify(Backup.create())));
  const first=b.sentences.find(s=>s.sentenceId==='G-1.1-01');
  out.backup={g:first?.speakerGender,alt:first?.italianAlt,ac:first?.altController};
  return out;
},csv);

const J=x=>JSON.stringify(x);
const pass={
  parsesGenderAndAlternate:J(r.parsed.map(x=>x.g))===J(['m','f','f','','m','f','m',''])&&r.parsed[0].alt==='Sono stanca.'&&r.parsed[4].ac==='addressee'&&r.parsed[5].role==='counterpart',
  notChosenAsWritten:J(r.none.said)===J(['Sono stanco.','Sono studentessa.','Sono pronta.','Ho fame.','Sei stanco?',"Sono stanca anch'io.",'Prego.','Arrivederci.'])&&r.none.tags.every(t=>t===''),
  notChosenVoices:J(r.none.voices)===J(['lm','lf','lf','l-','lm','cf','cm','c-']),
  maleLearnerForms:J(r.male.said)===J(['Sono stanco.','Sono studente.','Sono pronta.','Ho fame.','Sei stanco?',"Sono stanca anch'io.",'Prego.','Arrivederci.']),
  maleLearnerVoicesAndTags:J(r.male.voices)===J(['lm','lm','lf','lm','lm','cf','cm','c-'])&&J(r.male.tags)===J(['','','(f)','','','','','']),
  femaleLearnerForms:J(r.female.said)===J(['Sono stanca.','Sono studentessa.','Sono pronta.','Ho fame.','Sei stanco?',"Sono stanca anch'io.",'Prego.','Arrivederci.']),
  femaleLearnerVoicesAndTags:J(r.female.voices)===J(['lf','lf','lf','lf','lm','cf','cm','c-'])&&J(r.female.tags)===J(['','','','','(m)','','','']),
  addresseeAlternateNotUsed:r.female.said[4]==='Sei stanco?',
  counterpartKeepsOwnForm:r.male.said[5]==="Sono stanca anch'io.",
  screenShowsLearnerForm:r.screen.italian[0]==='Sono stanca.'&&J(r.screen.gtags)===J(['(m)'])&&J(r.screen.roles)===J(['Barista','Waiter','Clerk']),
  fourVoices:J(r.four)===J({lm:'LM',lf:'LF',l0:'LM',cm:'CM',cf:'CF',c0:'CM',legacy:'CM'}),
  twoVoicesFallBack:J(r.two)===J({lf:'LM',cm:'CF',cf:'CF',c0:'CF'}),
  oneVoiceFallsBackToLearner:J(r.one)===J({cf:'LM',lf:'LM'}),
  systemVoicesByGender:J(r.system)===J({m:'Luca',f:'Alice',c0:'Luca',l0:'Alice'}),
  playbackPerLine:J(r.spoken)===J(['Sono stanca.|lf','Sono studentessa.|lf','Sono pronta.|lf','Ho fame.|lf','Sei stanco?|lm',"Sono stanca anch'io.|cf",'Prego.|cm','Arrivederci.|c-']),
  selectPersistsAndRerenders:r.select.stored==='m'&&r.select.firstRow==='Sono stanco.'&&r.select.keys,
  saveAndClearNewBoxes:J(r.saved)===J(['LM','LF','CM','CF'])&&J(r.cleared)===J([null,null,'']),
  reimportUpdatesAlternate:r.reimport.fresh===0&&r.reimport.changed===1&&r.reimport.dupes===7&&r.reimport.alt==='Sono stanchissima.',
  backupKeepsGenderLane:J(r.backup)===J({g:'m',alt:'Sono stanca.',ac:'speaker'}),
  noPageErrors:errors.length===0
};
const failed=Object.entries(pass).filter(([,v])=>!v);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
for(const [k,v] of Object.entries(pass))console.log(`${v?'✓':'✗'} ${k}`);
if(failed.length)console.log(JSON.stringify({r,errors},null,2));
await browser.close();server.close();if(failed.length)process.exitCode=1;

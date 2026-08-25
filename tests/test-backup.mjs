import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8945,r));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath}:{headless:true});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:8945/');await page.waitForTimeout(250);
const result=await page.evaluate(async()=>{
  await Storage.addMany([{book:'1',chapter:'2',order:1,italian:'Credo che sia pronto.',english:'I think he is ready.',bookmarked:true,difficult:true,notes:'Review weekly'}]);
  Titles.books={'1':'Subjunctive'};Titles.chapters={'1|2':'Opinions'};Titles.save();
  localStorage.setItem('v08theme','dark');localStorage.setItem('v08rate','0.7');localStorage.setItem('v08relayUrl','https://example.workers.dev');
  localStorage.setItem('v08relayToken','legacy-secret');sessionStorage.setItem('iss-session-relayToken','session-secret');
  await Library.refresh();
  const backup=Backup.create(),serialized=JSON.stringify(backup);
  const exported={sentenceCount:backup.sentences.length,bookmark:backup.sentences[0].bookmarked,note:backup.sentences[0].notes,bookTitle:backup.titles.books['1'],theme:backup.preferences.v08theme,hasRelayUrl:backup.preferences.v08relayUrl==='https://example.workers.dev',hasLegacySecret:serialized.includes('legacy-secret'),hasSessionSecret:serialized.includes('session-secret'),hasPron:Object.keys(backup.sentences[0]).some(k=>k.toLowerCase().includes('pron'))};

  await Storage.replaceSentences([{book:'9',chapter:'9',order:9,italian:'Temporary',english:'',bookmarked:false,difficult:false,notes:''}]);Titles.books={};Titles.chapters={};Titles.save();localStorage.setItem('v08theme','sage');
  window.confirm=()=>true;
  const file=new File([JSON.stringify(backup)],'backup.json',{type:'application/json'});
  await Backup.restoreFile(file);
  const restoredRows=await Storage.all(SS);
  const restored={count:restoredRows.length,italian:restoredRows[0]?.italian,bookmark:restoredRows[0]?.bookmarked,note:restoredRows[0]?.notes,bookTitle:Titles.books['1'],chapterTitle:Titles.chapters['1|2'],theme:localStorage.getItem('v08theme'),relayUrl:localStorage.getItem('v08relayUrl'),relayToken:sessionStorage.getItem('iss-session-relayToken')};

  let invalidBoolean=false,duplicateId=false,unknownPreferenceExcluded=false;
  try{Backup.validate({...backup,sentences:[{...backup.sentences[0],bookmarked:'true'}]});}catch{invalidBoolean=true;}
  try{Backup.validate({...backup,sentences:[{...backup.sentences[0],id:7},{...backup.sentences[0],id:7,order:2}]});}catch{duplicateId=true;}
  const validated=Backup.validate({...backup,preferences:{v08theme:'dark',v08relayToken:'must-not-restore',apiKey:'must-not-restore'}});unknownPreferenceExcluded=!('v08relayToken'in validated.preferences)&&!('apiKey'in validated.preferences);

  document.getElementById('openManage').click();const clear=document.getElementById('clearAll'),field=document.getElementById('clearConfirm');const initiallyDisabled=clear.disabled;field.value='delete all';field.dispatchEvent(new Event('input',{bubbles:true}));const wrongCaseDisabled=clear.disabled;field.value='DELETE ALL';field.dispatchEvent(new Event('input',{bubbles:true}));const exactEnabled=!clear.disabled;
  return{exported,restored,validation:{invalidBoolean,duplicateId,unknownPreferenceExcluded},gating:{initiallyDisabled,wrongCaseDisabled,exactEnabled}};
});
const pass={
  complete:result.exported.sentenceCount===1&&result.exported.bookmark&&result.exported.note==='Review weekly'&&result.exported.bookTitle==='Subjunctive'&&result.exported.theme==='dark'&&result.exported.hasRelayUrl,
  secretFree:!result.exported.hasLegacySecret&&!result.exported.hasSessionSecret&&!result.exported.hasPron,
  restored:result.restored.count===1&&result.restored.italian==='Credo che sia pronto.'&&result.restored.bookmark&&result.restored.note==='Review weekly'&&result.restored.bookTitle==='Subjunctive'&&result.restored.chapterTitle==='Opinions'&&result.restored.theme==='dark'&&result.restored.relayUrl==='https://example.workers.dev',
  sessionSecretNotImported:result.restored.relayToken==='session-secret',
  validation:Object.values(result.validation).every(Boolean),
  typedDeletion:Object.values(result.gating).every(Boolean)
};
const output={pass,result};fs.writeFileSync(path.join(here,'backup-results.json'),JSON.stringify(output,null,2));
const failed=Object.entries(pass).filter(([,value])=>!value);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);console.log(JSON.stringify(output,null,2));
await browser.close();server.close();if(failed.length)process.exitCode=1;

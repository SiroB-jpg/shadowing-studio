/** Groups of more than ten items, from 1.19.0 (Linear SIR-118).
    A group owns a hundred positions: (group − 1) × 100 + item. Checks the
    issue's "done when" list: a 15-item group then a 10-item group import and
    play in order; an existing ten-item library survives the upgrade and a
    re-import with its marks intact; backup and restore still work. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8954,r));
const BASE='http://127.0.0.1:8954';
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath,args:['--no-sandbox']}:{headless:true});
const errors=[];

/* A module CSV in the shape the corpora use: group 1 has 15 items, group 2 has 10. */
const head='sentence_id,book,chapter,group_id,group,item,italian,english';
const row=(g,i)=>`T-1.${g}-${String(i).padStart(2,'0')},Travel,TR1,TR1.${g},${g},${i},Frase ${g}-${i},Sentence ${g}-${i}`;
const big=[head,...Array.from({length:15},(_,i)=>row(1,i+1)),...Array.from({length:10},(_,i)=>row(2,i+1))].join('\n');
/* An existing ten-item module: two full groups and a short third. */
const tenHead='book,chapter,group,item,italian,english';
const tenRow=(g,i)=>`Core,1,${g},${i},Vecchia ${g}-${i},Old ${g}-${i}`;
const ten=[tenHead,...[1,2].flatMap(g=>Array.from({length:10},(_,i)=>tenRow(g,i+1))),...Array.from({length:4},(_,i)=>tenRow(3,i+1))].join('\n');

const importCsv=async(page,csv)=>page.evaluate(async csv=>{
  Importer.open();document.getElementById('pasteCsv').value=csv;document.getElementById('analysePaste').click();
  await new Promise(r=>setTimeout(r,200));
  const summary=document.getElementById('importSummary').textContent,disabled=document.getElementById('importPreviewed').disabled;
  if(!disabled)await Importer.import();
  Importer.close&&Importer.close();
  return {summary,disabled};
},csv);

const r={};

/* ── 1. A library saved by 1.18.0 (database version 4, ten per group) ───────── */
{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE+'/not-the-app');
  await page.evaluate(()=>new Promise((res,rej)=>{
    const q=indexedDB.open('ISS_V08',4);
    q.onupgradeneeded=e=>{const d=e.target.result;const ss=d.createObjectStore('sentences',{keyPath:'id',autoIncrement:true});ss.createIndex('sentenceId','sentenceId',{unique:false});d.createObjectStore('audioCache',{keyPath:'key'});d.createObjectStore('explainers',{keyPath:'groupId'});d.createObjectStore('glossary',{keyPath:'term'});};
    q.onsuccess=e=>{const d=e.target.result,t=d.transaction('sentences','readwrite'),s=t.objectStore('sentences');
      for(let g=1;g<=3;g++)for(let i=1;i<=(g<3?10:4);i++)s.add({book:'Core',chapter:'1',order:(g-1)*10+i,italian:`Vecchia ${g}-${i}`,english:`Old ${g}-${i}`,bookmarked:g===2&&i===3,difficult:g===3&&i===4,notes:g===1&&i===10?'my note':''});
      t.oncomplete=()=>{d.close();res();};t.onerror=()=>rej(t.error);};
    q.onerror=()=>rej(q.error);
  }));
  await page.goto(BASE+'/');await page.waitForTimeout(400);
  r.upgrade=await page.evaluate(()=>{
    const ss=App.sentences.filter(s=>s.book==='Core');
    const at=(g,i)=>ss.find(s=>s.italian===`Vecchia ${g}-${i}`);
    return {count:ss.length,dbVersion:App.db.version,
      orders:ss.map(s=>s.order),
      groups:Util.uniq(ss.map(Util.gnum)),
      g2i3:{g:Util.gnum(at(2,3)),i:Util.item(at(2,3)),bm:at(2,3).bookmarked},
      g3i4:{g:Util.gnum(at(3,4)),difficult:at(3,4).difficult},
      g1i10:{g:Util.gnum(at(1,10)),notes:at(1,10).notes},
      nums:ss.map(Util.snum)};
  });
  /* Re-import the same module: nothing new, nothing changed, marks kept. */
  r.reimport=await importCsv(page,ten);
  r.afterReimport=await page.evaluate(()=>{const ss=App.sentences.filter(s=>s.book==='Core');const at=(g,i)=>ss.find(s=>s.italian===`Vecchia ${g}-${i}`);
    return {count:ss.length,bm:at(2,3).bookmarked,difficult:at(3,4).difficult,notes:at(1,10).notes};});
  /* Reload: the upgrade must not run twice. */
  await page.reload();await page.waitForTimeout(400);
  r.afterReload=await page.evaluate(()=>App.sentences.filter(s=>s.book==='Core').map(s=>s.order));
  await page.close();
}

/* ── 2. A 15-item group then a 10-item group, fresh ──────────────────────── */
{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE+'/');await page.waitForTimeout(300);
  r.parsed=await page.evaluate(csv=>Library.parseCSV(csv,{book:'X',chapter:'Y'}).map(s=>s.order),big);
  r.bigImport=await importCsv(page,big);
  r.big=await page.evaluate(async()=>{
    App.cur={book:'Travel',chapter:'TR1',group:1,index:0};UI.renderAll();
    const g1=Library.group().map(s=>s.italian);
    const rows=[...document.querySelectorAll('#viewer .srow-num')].map(e=>e.textContent);
    /* What playback would say, in order: group 1 then the next group. */
    const p1=SentenceController.sequenceProvider('group',false),said1=[];let x;while((x=p1.next()))said1.push(x.text);
    Nav.nextGroup(true);
    const g2=Library.group().map(s=>s.italian);
    const rows2=[...document.querySelectorAll('#viewer .srow-num')].map(e=>e.textContent);
    App.cur.index=0;const p2=SentenceController.sequenceProvider('group',false),said2=[];while((x=p2.next()))said2.push(x.text);
    const pc=SentenceController.sequenceProvider('chapter',false),saidC=[];App.cur={book:'Travel',chapter:'TR1',group:1,index:0};
    const pc2=SentenceController.sequenceProvider('chapter',false);while((x=pc2.next()))saidC.push(x.text);
    const groups=Util.uniq(Library.chapter().map(Util.gnum));
    return {g1,g2,rows,rows2,said1,said2,saidC,groups,stats:document.getElementById('stats').textContent.replace(/\s+/g,' ')};
  });
  /* Backup round trip, and an old (version 1) backup. */
  r.backup=await page.evaluate(()=>{
    const b=Backup.create();const v=Backup.validate(JSON.parse(JSON.stringify(b)));
    const old={...b,schemaVersion:1,sentences:[{book:'Old',chapter:'1',order:13,italian:'Tredici',english:'',bookmarked:true,difficult:false,notes:''}]};
    const o=Backup.validate(old);
    let future=false;try{Backup.validate({...b,schemaVersion:3});}catch{future=true;}
    return {version:b.schemaVersion,same:JSON.stringify(v.sentences.map(s=>s.order))===JSON.stringify(b.sentences.map(s=>s.order)),
      oldOrder:o.sentences[0].order,oldMark:o.sentences[0].bookmarked,futureRefused:future};
  });
  /* The CSV export carries group and item, and imports back to the same places. */
  r.export=await page.evaluate(()=>{const csv=toCSV();const back=Library.parseCSV(csv,{book:'X',chapter:'Y'});
    return {head:csv.split('\n')[0],same:JSON.stringify(back.map(s=>s.order).sort((a,b)=>a-b))===JSON.stringify(App.sentences.map(s=>s.order).sort((a,b)=>a-b))};});
  await page.close();
}

/* ── 3. Other file shapes ────────────────────────────────────────────────── */
{
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(BASE+'/');await page.waitForTimeout(300);
  r.shapes=await page.evaluate(()=>{
    const P=c=>Library.parseCSV(c,{book:'X',chapter:'Y'});
    /* Order column only: still grouped in tens. */
    const ord=P('book,chapter,order,italian,english\n'+Array.from({length:12},(_,i)=>`B,C,${i+1},Frase ${i+1},x`).join('\n'));
    /* Labelled groups with 12 items each (Italian Lei/lui grounding groups). */
    const lab=P('book,chapter,group,item,italian,english\n'+['A0.1.0','A0.1.1'].flatMap(g=>Array.from({length:12},(_,i)=>`B,C,${g},${i+1},${g} ${i+1},x`)).join('\n'));
    /* A plain group number with no item column: rows counted in file order. */
    const noItem=P('book,chapter,group,italian,english\n'+[1,1,1,2,2].map((g,i)=>`B,C,${g},F${i},x`).join('\n'));
    /* Item 100 would run into the next group. */
    const over=P('book,chapter,group,item,italian,english\nB,C,1,100,Troppo,x');const overRep=Library.lastReport.itemsOverLimit;
    const okRep=(P('book,chapter,group,item,italian,english\nB,C,1,99,Tanto,x'),Library.lastReport.itemsOverLimit);
    return {ord:ord.map(s=>s.order),ordGroups:ord.map(Util.gnum),
      lab:lab.map(s=>s.order),labGroups:Util.uniq(lab.map(Util.gnum)),
      noItem:noItem.map(s=>s.order),overRep,okRep,
      tens:[Util.fromTens(1),Util.fromTens(10),Util.fromTens(11),Util.fromTens(25)],
      back:[Util.toTens(1),Util.toTens(110),Util.toTens(205)]};
  });
  r.overImport=await importCsv(page,'book,chapter,group,item,italian,english\nB,C,1,100,Troppo,x');
  r.overStored=await page.evaluate(()=>App.sentences.length);
  /* Generated sets: the next free place after a saved chapter of 20. */
  r.gen=await page.evaluate(async()=>{
    const rows=CSVTemplate.rows(Array.from({length:20},(_,i)=>({italian:`G${i}`,english:''})),{book:GEN_BOOK,chapter:'parola',idPrefix:'GEN',startOrder:1});
    const parsed=Library.parseCSV(CSVTemplate.build(rows),{book:'X',chapter:'Y'});
    await Storage.addMany(parsed);await Library.refresh();
    const next=Generator.nextOrder('parola');
    const more=Library.parseCSV(CSVTemplate.build(CSVTemplate.rows([{italian:'G20',english:''}],{book:GEN_BOOK,chapter:'parola',idPrefix:'GEN',startOrder:next})),{book:'X',chapter:'Y'});
    return {next,moreOrder:more[0].order,moreGroup:Util.gnum(more[0])};
  });
  await page.close();
}

const seq=(n,f)=>Array.from({length:n},(_,i)=>f(i+1));
const pass={
  /* Upgrade of a library saved by 1.18.0 */
  upgradeRunsToVersion5:r.upgrade.dbVersion===5&&r.upgrade.count===24,
  upgradeKeepsGroups:JSON.stringify(r.upgrade.groups)==='[1,2,3]',
  upgradeRenumbers:JSON.stringify(r.upgrade.orders)===JSON.stringify([...seq(10,i=>i),...seq(10,i=>100+i),...seq(4,i=>200+i)]),
  upgradeKeepsMarks:r.upgrade.g2i3.g===2&&r.upgrade.g2i3.i===3&&r.upgrade.g2i3.bm===true&&r.upgrade.g3i4.g===3&&r.upgrade.g3i4.difficult===true&&r.upgrade.g1i10.g===1&&r.upgrade.g1i10.notes==='my note',
  upgradeNumbersUnchanged:JSON.stringify(r.upgrade.nums)===JSON.stringify(seq(24,i=>i)),
  reimportChangesNothing:/Detected 24 sentences/.test(r.reimport.summary)&&r.reimport.disabled===true&&r.afterReimport.count===24,
  reimportKeepsMarks:r.afterReimport.bm===true&&r.afterReimport.difficult===true&&r.afterReimport.notes==='my note',
  upgradeRunsOnce:JSON.stringify(r.afterReload)===JSON.stringify(r.upgrade.orders),
  /* 15 then 10 */
  fifteenThenTenParse:JSON.stringify(r.parsed)===JSON.stringify([...seq(15,i=>i),...seq(10,i=>100+i)]),
  fifteenThenTenImport:/Detected 25 sentences/.test(r.bigImport.summary)&&JSON.stringify(r.big.groups)==='[1,2]',
  groupOneHoldsFifteen:JSON.stringify(r.big.g1)===JSON.stringify(seq(15,i=>`Frase 1-${i}`)),
  groupTwoHoldsTen:JSON.stringify(r.big.g2)===JSON.stringify(seq(10,i=>`Frase 2-${i}`)),
  groupPlaybackInOrder:JSON.stringify(r.big.said1)===JSON.stringify(r.big.g1)&&JSON.stringify(r.big.said2)===JSON.stringify(r.big.g2),
  chapterPlaybackInOrder:JSON.stringify(r.big.saidC)===JSON.stringify([...r.big.g1,...r.big.g2]),
  rowNumbersRunOn:JSON.stringify(r.big.rows)===JSON.stringify(seq(15,i=>String(i)))&&JSON.stringify(r.big.rows2)===JSON.stringify(seq(10,i=>String(15+i))),
  statsCountTwoGroups:/25 sentences/.test(r.big.stats)&&/2 group\(s\)/.test(r.big.stats),
  /* Backup and export */
  backupRoundTrip:r.backup.version===2&&r.backup.same,
  oldBackupConverted:r.backup.oldOrder===103&&r.backup.oldMark===true,
  unknownBackupRefused:r.backup.futureRefused,
  exportCarriesGroupItem:r.export.head==='book,chapter,group,item,italian,english,bookmarked,difficult,notes'&&r.export.same,
  /* Other shapes */
  orderOnlyStillTens:JSON.stringify(r.shapes.ordGroups)==='[1,1,1,1,1,1,1,1,1,1,2,2]'&&r.shapes.ord[10]===101,
  labelledTwelve:JSON.stringify(r.shapes.lab)===JSON.stringify([...seq(12,i=>i),...seq(12,i=>100+i)])&&JSON.stringify(r.shapes.labGroups)==='[1,2]',
  plainGroupNoItem:JSON.stringify(r.shapes.noItem)==='[1,2,3,101,102]',
  conversionHelpers:JSON.stringify(r.shapes.tens)==='[1,10,101,205]'&&JSON.stringify(r.shapes.back)==='[1,20,25]',
  itemNinetyNineAllowed:r.shapes.okRep===0,
  itemHundredRefused:r.shapes.overRep===1&&r.overImport.disabled===true&&/up to 99 items/.test(r.overImport.summary)&&r.overStored===0,
  generatorNextPlace:r.gen.next===21&&r.gen.moreOrder===201&&r.gen.moreGroup===3,
  noPageErrors:errors.length===0
};
const failed=Object.entries(pass).filter(([,v])=>!v);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
for(const [k,v] of Object.entries(pass))console.log(`${v?'✓':'✗'} ${k}`);
if(failed.length)console.log(JSON.stringify({r,errors},null,2));
await browser.close();server.close();if(failed.length)process.exitCode=1;

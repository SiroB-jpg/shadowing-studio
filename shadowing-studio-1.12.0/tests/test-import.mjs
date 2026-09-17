/* CSV import — placement and identity.
   Every fixture in tests/fixtures/ is a slice of a real module file, header row
   untouched. The point of this suite is that each one lands in the right book,
   chapter and position, and that the files which imported correctly before this
   change still import identically. */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests', 'fixtures');
const CHROMIUM = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const launchOpts = fs.existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {};
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json','.csv':'text/csv'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}
  r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));});
await new Promise(r=>srv.listen(8937,r));
const b=await chromium.launch(launchOpts);
const page=await b.newPage();
const errors=[]; page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
await page.goto('http://localhost:8937/index.html'); await page.waitForTimeout(600);

const ok=[],fail=[]; const check=(n,c,x='')=>(c?ok:fail).push(n+(x?' — '+x:''));
const read=n=>fs.readFileSync(path.join(FIX,n),'utf8');
const parse=async (name,defs={book:'DefBook',chapter:'DefCh'})=>{
  const text=read(name);
  return await page.evaluate(([t,d])=>{
    const rows=Library.parseCSV(t,d);
    return {rows,report:Library.lastReport};
  },[text,defs]);
};
const places=r=>[...new Set(r.map(s=>s.book+' / '+s.chapter))];

/* ---------- 1. Essential Spoken Italian: book_number / chapter_number / group_number "1.1" ---------- */
{
  const {rows,report}=await parse('esi.csv');
  check('ESI — header recognised', report.headerFound);
  check('ESI — placement columns found', report.placementFound);
  check('ESI — chapter explainer row held back', report.rowsHeldBack===1, 'held '+report.rowsHeldBack);
  check('ESI — 30 sentences imported', rows.length===30, 'got '+rows.length);
  const p=places(rows);
  check('ESI — lands in 2 chapters, not 1', p.length===2, p.join(' | '));
  const ch1=rows.filter(s=>s.chapter==='1');
  check('ESI — chapter 1 holds 20', ch1.length===20, 'got '+ch1.length);
  const orders=ch1.map(s=>s.order).sort((a,c)=>a-c);
  check('ESI — group 1.1 occupies positions 1-10', orders.slice(0,10).join()==='1,2,3,4,5,6,7,8,9,10', orders.slice(0,10).join());
  check('ESI — group 1.2 occupies positions 11-20', orders.slice(10).join()==='11,12,13,14,15,16,17,18,19,20', orders.slice(10).join());
  const ch2=rows.filter(s=>s.chapter==='2');
  check('ESI — chapter 2 restarts at position 1', Math.min(...ch2.map(s=>s.order))===1);
  check('ESI — book taken from book_number', rows.every(s=>s.book==='1'||s.book==='2'), rows[0].book);
}

/* ---------- 2. Travel Italian: chapter_id TR1 / group_id TR1.1 / sequence ---------- */
{
  const {rows,report}=await parse('travel.csv');
  check('Travel — placement columns found', report.placementFound);
  check('Travel — 30 sentences imported', rows.length===30, 'got '+rows.length);
  const p=places(rows);
  check('Travel — lands in more than one chapter', p.length>1, p.join(' | '));
  check('Travel — chapter taken from chapter_id', rows.some(s=>s.chapter==='TR1'), rows[0].chapter);
  const tr11=rows.filter(s=>s.chapter==='TR1').map(s=>s.order).sort((a,c)=>a-c);
  check('Travel — TR1 starts at position 1', tr11[0]===1, String(tr11[0]));
  check('Travel — TR1 positions are contiguous', tr11.every((o,i)=>o===i+1), tr11.join());
}

/* ---------- 3. Core corpus export: chapter_id A0.1 / group_id A0.1.1 and the .0 grounding group ---------- */
{
  const {rows,report}=await parse('core.csv');
  check('Core — placement columns found', report.placementFound);
  check('Core — 40 sentences imported', rows.length===40, 'got '+rows.length);
  const a01=rows.filter(s=>s.chapter==='A0.1').map(s=>s.order).sort((a,c)=>a-c);
  check('Core — A0.1 fills positions 1-20', a01.join()==='1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20', a01.join());
  const a22=rows.filter(s=>s.chapter==='A2.2').map(s=>s.order).sort((a,c)=>a-c);
  check('Core — grounding group A2.2.0 is placed, not dropped', a22.length===20, 'got '+a22.length);
  check('Core — A2.2.0 takes positions 1-10', a22.slice(0,10).join()==='1,2,3,4,5,6,7,8,9,10', a22.slice(0,10).join());
  check('Core — sentence_id captured', rows.every(s=>/^ITA-/.test(s.sentenceId||'')), rows[0].sentenceId);
  check('Core — chapters are separate', places(rows).length===2, places(rows).join(' | '));
}

/* ---------- 4. Files that already worked must not change ---------- */
{
  const {rows}=await parse('verbfoundations.csv');
  check('Verb Foundations — still imports', rows.length===20, 'got '+rows.length);
  const o=rows.map(s=>s.order).sort((a,c)=>a-c);
  check('Verb Foundations — numeric group arithmetic unchanged', o.join()==='1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20', o.join());
  check('Verb Foundations — book and chapter read from file', rows[0].book!=='DefBook' && rows[0].chapter!=='DefCh', rows[0].book+'/'+rows[0].chapter);
}
{
  const {rows}=await parse('pronouns.csv');
  check('Pronouns — still imports', rows.length===20, 'got '+rows.length);
  const o=rows.map(s=>s.order).sort((a,c)=>a-c);
  check('Pronouns — positions unchanged', o.join()==='1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20', o.join());
  check('Pronouns — ID column becomes sentence_id', !!rows[0].sentenceId, rows[0].sentenceId);
}
{
  const {rows,report}=await parse('noheader.csv');
  check('No header — column-position fallback unchanged', rows.length===2 && rows[0].italian==='Buongiorno.', JSON.stringify(rows[0]));
  check('No header — defaults applied', rows[0].book==='DefBook' && rows[0].chapter==='DefCh');
  check('No header — reported as having no header', report.headerFound===false);
}

/* ---------- 5. The warning path ---------- */
{
  const text='italian,english\nBuongiorno.,Good morning.\nCiao!,Hi!\n';
  const r=await page.evaluate(t=>{Library.parseCSV(t,{book:'B',chapter:'C'});return Library.lastReport;},text);
  check('Unplaceable file is flagged', r.headerFound===true && r.placementFound===false, JSON.stringify(r));
}

/* ---------- 6. Identity: a repair that moves an item updates that item ---------- */
{
  const r=await page.evaluate(()=>{
    const before=App.sentences;
    App.sentences=[
      {id:1,sentenceId:'ITA-A2.1.1-04',book:'Core',chapter:'A2.1',order:4,italian:'Vecchia.',english:'Old.',bookmarked:true,difficult:false,notes:'mine'},
      {id:2,sentenceId:'ITA-A2.1.1-05',book:'Core',chapter:'A2.1',order:5,italian:'Cinque.',english:'Five.',bookmarked:false,difficult:false,notes:''}
    ];
    const incoming=[
      {sentenceId:'ITA-A2.1.1-04',book:'Core',chapter:'A2.1',order:5,italian:'Nuova.',english:'New.',bookmarked:false,difficult:false,notes:''},
      {sentenceId:'ITA-A2.1.1-05',book:'Core',chapter:'A2.1',order:6,italian:'Cinque.',english:'Five.',bookmarked:false,difficult:false,notes:''}
    ];
    const out=Importer.split(incoming);
    App.sentences=before;
    return {changed:out.changed,fresh:out.fresh.length,dupes:out.dupes.length};
  });
  const moved=r.changed.find(s=>s.sentenceId==='ITA-A2.1.1-04');
  check('Moved item is matched by name, not by slot', !!moved, JSON.stringify(r.changed.map(c=>c.sentenceId)));
  check('Moved item keeps the learner bookmark', moved&&moved.bookmarked===true);
  check('Moved item keeps the learner note', moved&&moved.notes==='mine');
  check('Moved item takes its new text', moved&&moved.italian==='Nuova.');
  check('Moved item takes its new position', moved&&moved.order===5, String(moved&&moved.order));
  check('A renumbered but unchanged item is not treated as new', r.fresh===0, 'fresh '+r.fresh);
}

/* ---------- 7. A library with no ids still matches a file that has them ---------- */
{
  const r=await page.evaluate(()=>{
    const before=App.sentences;
    App.sentences=[{id:9,book:'Core',chapter:'A2.1',order:1,italian:'Vecchia.',english:'Old.',bookmarked:true,difficult:false,notes:'keep'}];
    const out=Importer.split([{sentenceId:'ITA-A2.1.1-01',book:'Core',chapter:'A2.1',order:1,italian:'Nuova.',english:'New.',bookmarked:false,difficult:false,notes:''}]);
    App.sentences=before;
    return out;
  });
  check('Pre-id library matched by position', r.changed.length===1 && r.fresh.length===0, JSON.stringify({c:r.changed.length,f:r.fresh.length}));
  check('Pre-id sentence gains its id', r.changed[0]&&r.changed[0].sentenceId==='ITA-A2.1.1-01');
  check('Pre-id sentence keeps its note', r.changed[0]&&r.changed[0].notes==='keep');
}

/* ---------- 8. Database upgraded to version 2 with a sentenceId index ---------- */
{
  const r=await page.evaluate(async()=>{
    const db=App.db;
    const tx=db.transaction('sentences','readonly');
    return {version:db.version,hasIndex:[...tx.objectStore('sentences').indexNames].includes('sentenceId')};
  }).catch(e=>({error:String(e)}));
  check('Database is at version 2', r.version===2, JSON.stringify(r));
  check('sentenceId index exists', r.hasIndex===true, JSON.stringify(r));
}

check('No console errors', errors.length===0, errors.slice(0,3).join(' | '));

console.log(ok.map(n=>'  ✓ '+n).join('\n'));
if(fail.length)console.log(fail.map(n=>'  ✗ '+n).join('\n'));
console.log(fail.length?`FAIL (${fail.length})  PASS (${ok.length})`:`PASS (${ok.length})`);
await b.close(); srv.close();
process.exit(fail.length?1:0);

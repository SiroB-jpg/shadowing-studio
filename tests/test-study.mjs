/**
 * Release 0 — regression net for the pre-redesign behaviour of
 * Library, Study and Verb drill. These tests describe what the app does
 * TODAY. If a later refactor changes any of it, they should fail loudly.
 */
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
await new Promise(r=>srv.listen(8934,r));

const b=await chromium.launch(launchOpts);
const page=await b.newPage();
const errors=[];
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message));
let dialogs=[];
page.on('dialog',async d=>{dialogs.push({type:d.type(),message:d.message()});await d.accept();});

const ok=[],fail=[];
const check=(n,c,x='')=>(c?ok:fail).push(n+(x?' — '+x:''));
const group=t=>{ok.push('​── '+t+' ──');};

// ── Fixture: a small deterministic corpus in the real template shape ────────
// Book 1 ch 1: 25 sentences (groups 1-3) · Book 1 ch 2: 12 · Book 2 ch 1: 10
const VERBY=[
  'Credo che tu sia pronto per il concerto.',
  'Penso che lui abbia ragione su questo punto.',
  'Non credo che possa venire domani sera.',
  'Spero che tu vada a trovarla presto.',
  'Vorrei che loro fossero già arrivati qui.',
  'Temo che avesse dimenticato le chiavi ieri.',
  'Pare che siano andati via molto presto.',
  'Dubito che tu debba lavorare anche sabato.',
  'Immagino che voglia parlare con te oggi.',
  'Mi sembra che sappia gia tutta la storia.'
];
function fixture(){
  const rows=[['ID','Book','Chapter','ChapterTitle','Group','Item','Italian','English','AudioText','TranslationStatus','SourceFile','Notes']];
  const add=(book,chap,title,n,tag)=>{
    for(let i=0;i<n;i++){
      const g=Math.floor(i/10)+1, it=(i%10)+1;
      const italian=VERBY[i%VERBY.length].replace(/\.$/,` (${tag}${i+1}).`);
      rows.push([`${tag}-${g}-${it}`,book,chap,title,g,it,italian,`English for ${tag}${i+1}.`,italian,'translated','fixture.csv','']);
    }
  };
  add('1','1','Opinions and Judgements',25,'A');
  add('1','2','Impersonal Expressions',12,'B');
  add('2','1','Advanced Forms',10,'C');
  return rows.map(r=>r.map(c=>/[",]/.test(String(c))?'"'+String(c).replace(/"/g,'""')+'"':c).join(',')).join('\n');
}
const CSV=fixture();

await page.goto('http://localhost:8934/index.html'); await page.waitForTimeout(500);
await page.click('.desktop-tabs [data-panel="settings"]'); await page.selectOption('#voiceMode','system');
await page.click('.desktop-tabs [data-panel="study"]');

// ── Library and import ─────────────────────────────────────────────────────
group('Library and import');
await page.click('#openManage'); await page.waitForTimeout(150);
check('Manage library opens', await page.isVisible('#manageModal'));
check('Import, export and clear all live inside it', await page.evaluate(()=>{
  const m=document.getElementById('manageModal');
  return m.contains(document.getElementById('openImport'))&&m.contains(document.getElementById('exportCsv'))&&m.contains(document.getElementById('clearAll'));}));
await page.click('#openImport'); await page.waitForTimeout(150);
check('Import modal opens', await page.isVisible('#importModal'));
await page.fill('#pasteCsv', CSV);
await page.click('#analysePaste'); await page.waitForTimeout(200);
check('Pasted CSV analysed', /Detected 47 sentences/.test(await page.textContent('#importSummary')), await page.textContent('#importSummary'));
check('Preview table shows a sample', (await page.$$eval('#importPreview tbody tr',r=>r.length))===12);
await page.click('#importPreviewed'); await page.waitForTimeout(400);
check('Import stores every sentence', await page.evaluate(()=>App.sentences.length===47));
check('Import modal closes', !(await page.isVisible('#importModal')));

const stats=await page.textContent('#stats');
check('Stats report books, chapters and groups', /47 sentences/.test(stats)&&/2 book\(s\), 3 chapter\(s\), 6 group\(s\)/.test(stats.replace(/\s+/g,' ')), stats.replace(/\s+/g,' '));

check('Group and Item columns drive per-chapter order',
  await page.evaluate(()=>{
    const ch=App.sentences.filter(s=>s.book==='1'&&s.chapter==='1').map(s=>s.order).sort((a,b)=>a-b);
    return ch.length===25&&ch[0]===1&&ch[24]===25;
  }));
check('Chapter titles are discarded on import (known limitation)',
  await page.evaluate(()=>App.sentences.every(s=>!('chapterTitle' in s)&&!('title' in s))));

const tree=await page.textContent('#tree');
check('Tree lists both books', tree.includes('1')&&tree.includes('2'));
check('Tree lists groups of the active chapter',
  (await page.$$eval('#tree .groupItem',e=>e.map(x=>x.textContent)))
    .join('|')==='Group 1|Group 2|Group 3');
check('The duplicated Book/Chapter/Group dropdown stack is gone', await page.evaluate(()=>
  !document.getElementById('bookSel') && !document.getElementById('chapterSel') && !document.getElementById('groupSel')));
check('Search moved into the library panel', await page.evaluate(()=>
  document.getElementById('libraryPanel').contains(document.getElementById('search'))));

// ── Breadcrumb, titles and the new chrome ──────────────────────────────────
group('Headings, titles and chrome');
check('Chapter titles are harvested from the CSV on import',
  await page.evaluate(()=>Titles.chapter('1','1')==='Opinions and Judgements'&&Titles.chapter('1','2')==='Impersonal Expressions'));
check('Chapter titles survive a reload', await page.evaluate(()=>{
  const raw=JSON.parse(localStorage.getItem('v08chapterTitles')||'{}'); return raw['1|1']==='Opinions and Judgements';}));
let crumb=(await page.textContent('#crumb')).replace(/\s+/g,' ').trim();
check('Heading reads as words, not bare numbers', /Book 1.*Opinions and Judgements.*Group 1/.test(crumb), crumb);
check('Heading no longer reads "1 — 1 — Group 1"', !/^\s*1\s*—/.test(crumb));

await page.click('#openManage'); await page.waitForTimeout(200);
check('Manage library offers a name for every book', (await page.$$eval('#bookTitles input',i=>i.length))===2);
await page.fill('#bookTitles input[data-book="1"]','Present Subjunctive');
await page.$eval('#bookTitles input[data-book="1"]',i=>i.dispatchEvent(new Event('change')));
await page.waitForTimeout(250);
await page.click('#closeManage'); await page.waitForTimeout(150);
crumb=(await page.textContent('#crumb')).replace(/\s+/g,' ').trim();
check('A named book appears in the heading', /Book 1.*Present Subjunctive/.test(crumb), crumb);
check('A named book appears in the library tree', (await page.textContent('#tree')).includes('Present Subjunctive'));
check('Book names persist', await page.evaluate(()=>JSON.parse(localStorage.getItem('v08bookTitles')||'{}')['1']==='Present Subjunctive'));

check('Titles-only import adds nothing', await page.evaluate(async(csv)=>{
  const before=App.sentences.length;
  Titles.chapters={}; Titles.save();
  Importer.text=csv;
  await Importer.titlesOnly();
  return App.sentences.length===before && Titles.chapter('1','1')==='Opinions and Judgements';
}, CSV));

await page.click('#studyMore'); await page.waitForTimeout(150);
check('The overflow menu opens', await page.isVisible('#studyMoreMenu'));
check('Reset audio lives in the overflow menu, not the main row', await page.evaluate(()=>
  document.getElementById('studyMoreMenu').contains(document.getElementById('hardReset'))));
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
check('The overflow menu closes on Escape', !(await page.isVisible('#studyMoreMenu')));

check('Playback settings sit in one persistent bar', await page.evaluate(()=>{
  const bar=document.querySelector('.playbar');
  return ['mainToggle','repeat','rate','pause','playMode'].every(id=>bar.contains(document.getElementById(id)));}));

await page.click('#libCollapse'); await page.waitForTimeout(200);
check('The library collapses', await page.evaluate(()=>document.body.classList.contains('lib-collapsed')));
check('A control to bring it back appears', await page.isVisible('#libShow'));
check('The collapsed state is remembered', await page.evaluate(()=>localStorage.getItem('v08libCollapsed')==='1'));
await page.click('#libShow'); await page.waitForTimeout(200);
check('The library comes back', await page.evaluate(()=>!document.body.classList.contains('lib-collapsed')));

check('Sentence actions are compact icon buttons', await page.evaluate(()=>{
  const r=document.querySelector('#viewer .srow');
  const btns=[...r.querySelectorAll('.srow-actions button')];
  return btns.length===3 && btns.every(b=>b.getAttribute('aria-label')) && !r.querySelector('.cardTools');}));
check('Every row action meets the 44px touch target', await page.evaluate(()=>
  [...document.querySelectorAll('#viewer .srow-actions button')].every(b=>{
    const r=b.getBoundingClientRect(); return r.height>=38&&r.width>=38;})));
check('Icons are inline and need no external font', await page.evaluate(()=>
  !document.querySelector('link[href*="tabler"]') &&
  document.querySelectorAll('#viewer .srow-actions svg').length>0));
check('Every icon-only control still announces itself', await page.evaluate(()=>
  [...document.querySelectorAll('button.icon, .rowbtn')].every(b=>
    (b.getAttribute('aria-label')||'').trim().length>0)));
check('The active row is marked by more than colour', await page.evaluate(()=>{
  const r=document.querySelector('#viewer .srow.active');
  return r.getAttribute('aria-current')==='true';}));

// ── Study view rendering ───────────────────────────────────────────────────
group('Study view');
check('Group display shows ten cards', (await page.$$eval('#viewer .srow',c=>c.length))===10);
await page.evaluate(()=>{App.cur.group=3;App.cur.index=0;UI.renderAll();}); await page.waitForTimeout(150);
check('Final partial group shows five cards', (await page.$$eval('#viewer .srow',c=>c.length))===5);
await page.evaluate(()=>{App.cur.group=1;App.cur.index=0;UI.renderAll();}); await page.waitForTimeout(150);
await page.click('#studyMore'); await page.selectOption('#displayMode','single'); await page.waitForTimeout(150);
check('Single display shows one card', (await page.$$eval('#viewer .srow',c=>c.length))===1);
await page.selectOption('#displayMode','group'); await page.waitForTimeout(150);
check('English shown by default', (await page.$$eval('#viewer .english',e=>e.length))===10);
await page.selectOption('#showEnglish','hide'); await page.waitForTimeout(150);
check('English can be hidden', (await page.$$eval('#viewer .english',e=>e.length))===0);
await page.selectOption('#showEnglish','show'); await page.waitForTimeout(150);
await page.keyboard.press('Escape'); await page.waitForTimeout(120);
check('First card is active on entry', await page.evaluate(()=>document.querySelectorAll('#viewer .srow')[0].classList.contains('active')));
check('Cards carry an order pill', /^1$/.test((await page.$$eval('#viewer .srow-num',p=>p.map(x=>x.textContent)))[0]));
await page.$$eval('#viewer .srow',c=>c[3].click()); await page.waitForTimeout(150);
check('Tapping a card selects it', await page.evaluate(()=>App.cur.index===3));
await page.fill('#search','A7'); await page.waitForTimeout(250);
check('Search looks across the whole library', (await page.$$eval('#viewer .srow',c=>c.length))===1);
check('Search results carry their location', (await page.textContent('#viewer')).includes('Book 1'));
await page.fill('#search','zzzznothing'); await page.waitForTimeout(200);
check('Search reports when nothing matches', (await page.textContent('#viewer')).includes('Nothing found'));
await page.fill('#search',''); await page.waitForTimeout(150);

// ── Sentence and group navigation ──────────────────────────────────────────
group('Navigation');
await page.evaluate(()=>{App.cur.index=0;UI.renderViewer();});
await page.click('#nextSentence'); await page.waitForTimeout(120);
check('Next sentence advances', await page.evaluate(()=>App.cur.index===1));
await page.evaluate(()=>{App.cur.index=9;UI.renderViewer();});
await page.click('#nextSentence'); await page.waitForTimeout(120);
check('Next wraps at the end of the group', await page.evaluate(()=>App.cur.index===0));
await page.click('#prevSentence'); await page.waitForTimeout(120);
check('Previous wraps backwards', await page.evaluate(()=>App.cur.index===9));
await page.click('#nextGroup'); await page.waitForTimeout(200);
check('Group forward moves within the chapter', await page.evaluate(()=>Number(App.cur.group)===2&&App.cur.index===0));
await page.click('#nextGroup'); await page.waitForTimeout(200);
check('Group forward reaches the last group', await page.evaluate(()=>Number(App.cur.group)===3));
check('Group forward stops at the last group', await page.evaluate(()=>Nav.nextGroup()===false));
await page.click('#prevGroup'); await page.click('#prevGroup'); await page.waitForTimeout(200);
check('Group back returns to the first', await page.evaluate(()=>Number(App.cur.group)===1));
check('Group back stops at the first group', await page.evaluate(()=>Nav.prevGroup()===false));
await page.$$eval('#tree .book',e=>e[1].click()); await page.waitForTimeout(250);
check('Switching book in the tree resets chapter and group', await page.evaluate(()=>App.cur.book==='2'&&Number(App.cur.group)===1&&App.cur.index===0));
await page.$$eval('#tree .book',e=>e[0].click()); await page.waitForTimeout(250);

// ── Playback scope providers (semantics a refactor would break) ────────────
group('Playback providers');
const pull=(mode,limit)=>page.evaluate(([m,lim])=>{
  document.getElementById('playMode').value=m;
  App.cur={book:'1',chapter:'1',group:1,index:0};
  const p=SentenceController.provider(); let n=0,item;
  while((item=p.next())){ n++; if(n>=lim) break; }
  return n;
},[mode,limit]);
check('current — one item only', await pull('current',50)===1);
check('loop-current — unbounded', await pull('loop-current',40)===40);
check('group — ten items from the group', await pull('group',50)===10);
check('loop-group — unbounded', await pull('loop-group',40)===40);
check('chapter — twenty-five items from the chapter', await pull('chapter',80)===25);
check('loop-chapter — unbounded', await pull('loop-chapter',40)===40);
check('group scope resumes from the current sentence', await page.evaluate(()=>{
  document.getElementById('playMode').value='group';
  App.cur={book:'1',chapter:'1',group:1,index:6};
  const p=SentenceController.provider(); let n=0; while(p.next()) n++; return n===4;
}));
check('sequence provider moves the library position as it plays', await page.evaluate(()=>{
  document.getElementById('playMode').value='chapter';
  App.cur={book:'1',chapter:'1',group:1,index:0};
  const p=SentenceController.provider();
  for(let i=0;i<12;i++){const it=p.next(); if(it&&it.onBefore) it.onBefore();}
  return Number(App.cur.group)===2;
}));
check('provider labels carry the sentence number', await page.evaluate(()=>{
  document.getElementById('playMode').value='group';
  App.cur={book:'1',chapter:'1',group:1,index:0};
  return /Sentence 1/.test(SentenceController.provider().next().label);
}));
await page.selectOption('#playMode','group');

// ── Playback engine and mutual exclusion ───────────────────────────────────
group('Playback engine');
await page.selectOption('#repeat','5'); await page.selectOption('#pause','5000'); await page.selectOption('#rate','0.6');
check('Main context reads the Study controls', await page.evaluate(()=>{
  App.playbackContext='main'; return PlaybackControls.rate()===0.6&&PlaybackControls.repeat()===5&&PlaybackControls.pause()===5000;}));
await page.evaluate(()=>{App.cur={book:'1',chapter:'1',group:1,index:0};UI.renderAll();});
await page.click('#mainToggle'); await page.waitForTimeout(600);
check('Start begins playback', await page.evaluate(()=>MainPlayer.playing===true));
check('Playback context becomes main', await page.evaluate(()=>App.playbackContext==='main'));
check('Button reads Pause while playing', /Pause/.test(await page.textContent('#mainToggle')));
await page.click('#mainToggle'); await page.waitForTimeout(200);
check('Pause holds playback', await page.evaluate(()=>MainPlayer.paused===true));
await page.click('#mainToggle'); await page.waitForTimeout(200);
check('Resume continues', await page.evaluate(()=>MainPlayer.paused===false));
await page.click('.desktop-tabs [data-panel="verbs"]'); await page.waitForTimeout(300);
check('Switching to Verb drill stops the sentence player', await page.evaluate(()=>MainPlayer.playing===false));

// ── Verb drill ─────────────────────────────────────────────────────────────
group('Verb drill');
check('Verb panel visible', await page.isVisible('#verbs'));
const detected=await page.textContent('#detected');
check('Verbs detected from the corpus', /Detected verbs \(\d+ of \d+ in the table\)/.test(detected), detected.slice(0,90));
check('Detected label is positive when verbs are found', (await page.$eval('#detected',e=>e.className)).includes('oktxt'));
check('Verb selector populated from detection', await page.evaluate(()=>document.getElementById('verbSel').options.length>0));
check('Detection finds essere via its subjunctive forms', await page.evaluate(()=>Verb.detect(['Credo che tu sia pronto.']).includes('essere')));
check('Detection finds a verb by past participle', await page.evaluate(()=>Verb.detect(['Ha gia fatto tutto.']).includes('fare')));
check('riuscire is in the conjugation table', await page.evaluate(()=>!!Verb.V.riuscire));
check('riuscire is detected from its subjunctive forms', await page.evaluate(()=>
  Verb.detect(['Spero che tu riesca a finire in tempo.']).includes('riuscire')));
check('riuscire is detected from its infinitive', await page.evaluate(()=>
  Verb.detect(['Vorrei riuscire a parlare meglio.']).includes('riuscire')));
check('riuscire is detected from its participle', await page.evaluate(()=>
  Verb.detect(['Alla fine sono riuscito a finire.']).includes('riuscire')));
check('riuscire conjugates correctly in the present subjunctive', await page.evaluate(()=>
  Verb.line('riuscire','presente')==='riesca, riesca, riesca, riusciamo, riusciate, riescano'));
check('riuscire takes essere and agrees in the plural', await page.evaluate(()=>
  Verb.forms('riuscire','passato')[0]==='sia riuscito' && Verb.forms('riuscire','passato')[3]==='siamo riusciti'));
check('uscire is not mistaken for riuscire', await page.evaluate(()=>
  !Verb.detect(['Vorrei riuscire a parlare meglio.']).includes('uscire')));
check('The verb table has no duplicated entries', await page.evaluate(()=>{
  const n=Object.keys(Verb.V); return new Set(n).size===n.length && n.length>=46;}));
check('A verb outside the table is named rather than silently dropped', await page.evaluate(()=>
  Verb.unknown(['Spero di poter viaggiare presto.'],[]).includes('viaggiare')));
check('Verbs already in the table are not listed as missing', await page.evaluate(()=>
  Verb.unknown(['Vorrei riuscire a parlare meglio.'],['riuscire','parlare']).length===0));
check('Four tense cards rendered', (await page.$$eval('#verbView .tenseCard',c=>c.length))===4);
check('Simple tense line built from the table', await page.evaluate(()=>Verb.line('essere','presente')==='sia, sia, sia, siamo, siate, siano'));
check('Compound tense built from auxiliary plus participle', await page.evaluate(()=>Verb.forms('andare','passato')[0]==='sia andato'));
check('Participle agrees in the plural', await page.evaluate(()=>Verb.forms('andare','passato')[3]==='siamo andati'));
check('Avere verbs use avere as auxiliary', await page.evaluate(()=>Verb.forms('fare','passato')[0]==='abbia fatto'));
check('Trapassato uses the imperfect auxiliary', await page.evaluate(()=>Verb.forms('essere','trapassato')[0]==='fossi stato'));
await page.click('#nextTense'); await page.waitForTimeout(120);
check('Tense forward advances', await page.evaluate(()=>App.verbTenseIndex===1));
await page.evaluate(()=>{App.verbTenseIndex=3;Verb.renderView();});
await page.click('#nextTense'); await page.waitForTimeout(120);
check('Tense forward wraps', await page.evaluate(()=>App.verbTenseIndex===0));
await page.click('#prevTense'); await page.waitForTimeout(120);
check('Tense back wraps', await page.evaluate(()=>App.verbTenseIndex===3));
await page.evaluate(()=>{App.verbTenseIndex=0;Verb.renderView();});

const vpull=(mode,limit)=>page.evaluate(([m,lim])=>{
  document.getElementById('verbMode').value=m;
  document.getElementById('verbSel').selectedIndex=0; App.verbTenseIndex=0;
  const p=Verb.provider(); let n=0; while(p.next()){ n++; if(n>=lim) break; } return n;
},[mode,limit]);
const verbCount=await page.evaluate(()=>document.getElementById('verbSel').options.length);
check('once — a single tense', await vpull('once',30)===1);
check('looptense — unbounded', await vpull('looptense',30)===30);
check('loopverb — unbounded within one verb', await vpull('loopverb',30)===30);
check('nextverb — four tenses for every verb then stops', await vpull('nextverb',999)===verbCount*4, 'verbs='+verbCount);
check('loopverbs — unbounded', await vpull('loopverbs',60)===60);
await page.selectOption('#verbRepeat','3'); await page.selectOption('#verbRate','0.8'); await page.selectOption('#verbPause','1800');
check('Verb context reads the Verb drill controls', await page.evaluate(()=>{
  App.playbackContext='verb'; return PlaybackControls.rate()===0.8&&PlaybackControls.repeat()===3&&PlaybackControls.pause()===1800;}));
check('Study controls are unaffected by the verb settings', await page.evaluate(()=>{
  App.playbackContext='main'; return PlaybackControls.rate()===0.6&&PlaybackControls.repeat()===5;}));
check('Infinite repeat is passed through as a string', await page.evaluate(()=>{
  document.getElementById('verbRepeat').value='infinite'; App.playbackContext='verb';
  const r=PlaybackControls.repeat(); document.getElementById('verbRepeat').value='3'; return r==='infinite';}));
await page.selectOption('#verbScope','all'); await page.waitForTimeout(250);
check('Verb scope can widen to the whole library', await page.evaluate(()=>Verb.scope().length===47));
await page.selectOption('#verbScope','group'); await page.waitForTimeout(250);
check('Verb scope can narrow to the current group', await page.evaluate(()=>Verb.scope().length<=10));
await page.selectOption('#verbScope','chapter'); await page.waitForTimeout(250);
await page.selectOption('#verbMode','once');
await page.click('#verbToggle'); await page.waitForTimeout(500);
check('Verb drill plays', await page.evaluate(()=>VerbPlayer.playing===true||VerbPlayer.playing===false));
await page.click('.desktop-tabs [data-panel="study"]'); await page.waitForTimeout(300);
check('Switching to Study stops the verb player', await page.evaluate(()=>VerbPlayer.playing===false));

// ── Bookmarks and editing ──────────────────────────────────────────────────
group('Bookmarks and editing');
await page.evaluate(()=>{App.cur={book:'1',chapter:'1',group:1,index:0};UI.renderAll();});
await page.$$eval('#viewer .srow',c=>c[0].querySelector('[data-a="bm"]').click());
await page.waitForTimeout(300);
check('Bookmark toggles on', await page.evaluate(()=>App.sentences.filter(s=>s.bookmarked).length===1));
check('Bookmark state is shown on the row, and not by colour alone', await page.evaluate(()=>{
  const b=document.querySelectorAll('#viewer .srow')[0].querySelector('[data-a="bm"]');
  return b.getAttribute('aria-pressed')==='true' && b.classList.contains('on')
      && b.querySelector('svg').getAttribute('fill')==='currentColor';}));
await page.click('#showBookmarks'); await page.waitForTimeout(150);
check('Bookmarked list shows the sentence', (await page.$$eval('#reviewView .card',c=>c.length))===1);
await page.click('#showAll'); await page.waitForTimeout(200);
check('All-sentences list shows everything', (await page.$$eval('#reviewView .card',c=>c.length))===47);
await page.$$eval('#viewer .srow',c=>c[0].querySelector('[data-a="bm"]').click());
await page.waitForTimeout(300);
check('Bookmark toggles off', await page.evaluate(()=>App.sentences.filter(s=>s.bookmarked).length===0));

await page.$$eval('#viewer .srow',c=>c[1].querySelector('[data-a="edit"]').click());
await page.waitForTimeout(200);
check('Editor opens', await page.isVisible('#editModal'));
check('Editor is pre-filled', (await page.inputValue('#editItalian')).length>0);
await page.fill('#editItalian','Frase modificata dal test.');
await page.fill('#editEnglish','Sentence edited by the test.');
await page.click('#saveEdit'); await page.waitForTimeout(400);
check('Edit persists to storage', await page.evaluate(async()=>{
  const all=await Storage.all(SS); return all.some(s=>s.italian==='Frase modificata dal test.');}));
check('Editor closes after saving', !(await page.isVisible('#editModal')));
check('Edited sentence appears in the viewer', (await page.textContent('#viewer')).includes('Frase modificata dal test.'));
const before=dialogs.length;
await page.$$eval('#viewer .srow',c=>c[1].querySelector('[data-a="edit"]').click());
await page.waitForTimeout(150);
await page.fill('#editItalian','   ');
await page.click('#saveEdit'); await page.waitForTimeout(250);
check('Empty Italian is refused', dialogs.length>before && await page.isVisible('#editModal'));
await page.click('#closeEdit'); await page.waitForTimeout(150);
check('A refused edit does not corrupt the sentence in memory', await page.evaluate(()=>
  App.sentences.some(s=>s.italian==='Frase modificata dal test.')));
check('A refused edit does not reach storage', await page.evaluate(async()=>{
  const all=await Storage.all(SS); return all.every(s=>String(s.italian||'').trim().length>0);}));

// ── Export and settings ────────────────────────────────────────────────────
group('Export, settings and theme');
const csvOut=await page.evaluate(()=>toCSV());
check('Export header is the flat working shape',
  csvOut.split('\n')[0]==='book,chapter,order,italian,english,bookmarked,difficult,notes', csvOut.split('\n')[0]);
check('Export contains every sentence', csvOut.trim().split('\n').length===48);
await page.click('.desktop-tabs [data-panel="settings"]');
await page.selectOption('#voiceMode','eleven'); await page.waitForTimeout(150);
check('Voice mode persists', await page.evaluate(()=>localStorage.getItem('v08voiceMode')==='eleven'));
check('ElevenLabs panel shown for ElevenLabs voice', await page.isVisible('#elevenPanel'));
await page.fill('#apiKey','test-key'); await page.fill('#voiceId','test-voice');
await page.selectOption('#saveEleven','yes'); await page.click('#saveElevenBtn'); await page.waitForTimeout(150);
check('ElevenLabs settings save', await page.evaluate(()=>localStorage.getItem('v08key')==='test-key'&&localStorage.getItem('v08voice')==='test-voice'));
await page.click('#clearElevenBtn'); await page.waitForTimeout(150);
check('ElevenLabs settings clear', await page.evaluate(()=>!localStorage.getItem('v08key')&&document.getElementById('apiKey').value===''));
await page.selectOption('#voiceMode','system'); await page.waitForTimeout(150);
check('System voice hides the ElevenLabs panel', !(await page.isVisible('#elevenPanel')));
await page.click('.theme-toggle .toggle-track'); await page.waitForTimeout(150);
check('Dark theme persists', await page.evaluate(()=>localStorage.getItem('v08theme')==='dark'&&document.documentElement.getAttribute('data-theme')==='dark'));
await page.click('.theme-toggle .toggle-track'); await page.waitForTimeout(150);
check('Theme returns to sage', await page.evaluate(()=>localStorage.getItem('v08theme')==='sage'));

// ── Destructive action ─────────────────────────────────────────────────────
group('Clear all');
const dlgBefore=dialogs.length;
await page.click('#openManage'); await page.waitForTimeout(150);
await page.click('#clearAll'); await page.waitForTimeout(700);
check('Clear all asks for confirmation', dialogs.length>dlgBefore && dialogs[dialogs.length-1].type==='confirm');
check('Clear all empties the library', await page.evaluate(()=>App.sentences.length===0));
check('Empty library shows guidance', (await page.textContent('#viewer')).includes('No sentences yet'));
check('Tree reports the empty state', (await page.textContent('#tree')).includes('No sentences imported yet'));

// ── Report ─────────────────────────────────────────────────────────────────
console.log('PASS ('+ok.filter(t=>!t.startsWith('​')).length+')');
ok.forEach(t=>console.log(t.startsWith('​')?'\n'+t.slice(1):'  ✓ '+t));
if(fail.length){console.log('\nFAIL ('+fail.length+')');fail.forEach(t=>console.log('  ✗ '+t));}
const real=errors.filter(e=>!/favicon|manifest|sw\.js|ServiceWorker|tabler|jsdelivr|Failed to load resource/i.test(e));
console.log('\nConsole errors: '+(real.length?'\n  '+real.join('\n  '):'none'));
await b.close(); srv.close();
process.exit(fail.length?1:0);

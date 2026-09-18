/** The chapter explainer panel, from 1.16.0: opens on the current group, offers
    the whole chapter opened at that group, and goes with its book when the book
    is removed. */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});
await new Promise(r=>server.listen(8951,r));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath,args:['--no-sandbox']}:{headless:true});
const page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.goto('http://127.0.0.1:8951/');await page.waitForTimeout(250);

const r=await page.evaluate(async()=>{
  /* Two chapters of a book with group_id, three groups each, plus a second book
     with no group ids and a chapter whose notes carry no book at all. */
  const rows=[];
  for(const ch of ['A0.1','A0.2'])for(let g=1;g<=3;g++)for(let i=1;i<=2;i++)
    rows.push({book:'Core A0-B2',chapter:ch,order:(g-1)*10+i,groupId:`${ch}.${g}`,sentenceId:`ITA-${ch}.${g}-0${i}`,italian:`Frase ${ch} ${g} ${i}`,english:`Sentence ${ch} ${g} ${i}`,bookmarked:false,difficult:false,notes:''});
  for(let g=1;g<=2;g++)for(let i=1;i<=2;i++)
    rows.push({book:'Old',chapter:'1',order:(g-1)*10+i,italian:`Vecchia ${g} ${i}`,english:'',bookmarked:false,difficult:false,notes:''});
  await Storage.addMany(rows);
  const secs=[];
  for(const ch of ['A0.1','A0.2'])for(let g=1;g<=3;g++)
    secs.push({groupId:`${ch}.${g}`,chapter:ch,book:'Core A0-B2',chapterTitle:ch==='A0.1'?'Entering Italian Speech':'Second chapter',order:g,heading:`Group ${g} — Heading ${ch} ${g}`,body:`Body for ${ch} group ${g}.\n\n| a | b |\n|---|---|\n| 1 | 2 |`,opening:g===1?`Inside this chapter ${ch}.`:'',closing:g===3?`Carry into practice ${ch}.`:''});
  /* The old book's notes: no book named, matched by chapter and position only. */
  secs.push({groupId:'old-1',chapter:'1',book:'',chapterTitle:'',order:1,heading:'Old one',body:'Old body one',opening:'',closing:''});
  secs.push({groupId:'old-2',chapter:'1',book:'',chapterTitle:'',order:2,heading:'Old two',body:'Old body two',opening:'',closing:''});
  for(const s of secs)await Storage.put(ES,s);
  App.cur={book:'',chapter:'',group:1,index:0};
  await Library.refresh();

  const out={};
  const text=id=>document.getElementById(id).textContent;
  const modal=()=>document.getElementById('explainerModal').style.display==='flex';

  /* 1. Middle group: only that section, no opening, no closing, prefix trimmed. */
  App.cur={book:'Core A0-B2',chapter:'A0.1',group:2,index:0};UI.renderAll();
  Explainer.open();
  out.g2={open:modal(),title:text('explainerTitle'),
    sections:document.querySelectorAll('#explainerBody .exp-sec').length,
    heading:document.querySelector('#explainerBody h3')?.textContent,
    hasOpening:!!document.querySelector('#explainerBody .exp-open'),
    hasClosing:!!document.querySelector('#explainerBody .exp-close'),
    table:!!document.querySelector('#explainerBody table'),
    switchLabel:document.getElementById('explainerWhole')?.textContent,
    onlyLink:!!document.getElementById('explainerOnly')};

  /* 2. The whole chapter, opened at group 2 and marked. */
  document.getElementById('explainerWhole').click();
  await new Promise(r=>setTimeout(r,250));
  const here=document.querySelector('#explainerBody .exp-sec.here');
  const body=document.getElementById('explainerBody');
  out.whole={open:modal(),title:text('explainerTitle'),
    sections:document.querySelectorAll('#explainerBody .exp-sec').length,
    marked:document.querySelectorAll('#explainerBody .exp-sec.here').length,
    markedGroup:here?.dataset.group,
    markedHeading:here?.querySelector('h3')?.textContent,
    hasOpening:!!document.querySelector('#explainerBody .exp-open'),
    hasClosing:!!document.querySelector('#explainerBody .exp-close'),
    scrolled:body.scrollTop>0||body.scrollHeight<=body.clientHeight,
    backLink:document.getElementById('explainerOnly')?.textContent};

  /* 3. Back to the group view. */
  document.getElementById('explainerOnly').click();
  out.back={sections:document.querySelectorAll('#explainerBody .exp-sec').length,title:text('explainerTitle')};
  Explainer.close();
  out.closed=!modal();

  /* 4. First group carries the opening; last group the closing. */
  App.cur={book:'Core A0-B2',chapter:'A0.2',group:1,index:0};UI.renderAll();Explainer.open();
  out.first={title:text('explainerTitle'),hasOpening:!!document.querySelector('#explainerBody .exp-open'),hasClosing:!!document.querySelector('#explainerBody .exp-close'),opening:document.querySelector('#explainerBody .exp-open')?.textContent};
  Explainer.close();
  App.cur={book:'Core A0-B2',chapter:'A0.2',group:3,index:1};UI.renderAll();Explainer.open();
  out.last={title:text('explainerTitle'),hasOpening:!!document.querySelector('#explainerBody .exp-open'),hasClosing:!!document.querySelector('#explainerBody .exp-close')};
  Explainer.close();

  /* 5. Binding is by group_id, not position: move the sentences' group_id and the panel follows. */
  const moved=(await Storage.all(SS)).filter(s=>s.groupId==='A0.1.2');
  for(const s of moved){s.groupId='A0.1.3';await Storage.put(SS,s);}
  await Library.refresh();
  App.cur={book:'Core A0-B2',chapter:'A0.1',group:2,index:0};UI.renderAll();Explainer.open();
  out.byId={heading:document.querySelector('#explainerBody h3')?.textContent,title:text('explainerTitle')};
  Explainer.close();
  for(const s of moved){s.groupId='A0.1.2';await Storage.put(SS,s);}
  await Library.refresh();

  /* 6. A library without group ids falls back to position. */
  App.cur={book:'Old',chapter:'1',group:2,index:0};UI.renderAll();Explainer.open();
  out.positional={heading:document.querySelector('#explainerBody h3')?.textContent,title:text('explainerTitle'),buttonShown:!document.getElementById('openExplainer').classList.contains('hidden')};
  Explainer.close();

  /* 7. Removing a book removes its notes — including notes that named no book. */
  document.getElementById('openManage').click();
  Manage.fillRemoveBook();
  const sel=document.getElementById('removeBook');
  sel.value='Old';Manage.previewRemoveBook();
  out.preview=document.getElementById('removeBookStatus').textContent;
  await Manage.removeBook();
  await new Promise(r=>setTimeout(r,100));
  const left=await Storage.all(ES);
  out.afterRemove={status:document.getElementById('removeBookStatus').textContent,notesLeft:left.length,oldLeft:left.filter(x=>String(x.groupId).startsWith('old')).length,coreLeft:left.filter(x=>x.book==='Core A0-B2').length,sentencesLeft:(await Storage.all(SS)).length};
  /* And removing Core takes its six with it, by book name. */
  Manage.fillRemoveBook();sel.value='Core A0-B2';Manage.previewRemoveBook();await Manage.removeBook();
  await new Promise(r=>setTimeout(r,100));
  out.afterCore={notesLeft:(await Storage.all(ES)).length,sentencesLeft:(await Storage.all(SS)).length};
  return out;
});

const pass={
  groupViewOpens:r.g2.open&&r.g2.sections===1,
  groupViewTitle:r.g2.title==='A0.1 — Entering Italian Speech · Group 2 of 3',
  groupViewHeadingTrimmed:r.g2.heading==='Heading A0.1 2',
  groupViewNoFrameMidChapter:!r.g2.hasOpening&&!r.g2.hasClosing,
  groupViewRendersTable:r.g2.table,
  groupViewOffersWholeChapter:r.g2.switchLabel==='Show the whole chapter'&&!r.g2.onlyLink,
  wholeChapterAllSections:r.whole.open&&r.whole.sections===3&&r.whole.title==='A0.1 — Entering Italian Speech',
  wholeChapterMarksCurrent:r.whole.marked===1&&r.whole.markedGroup==='A0.1.2'&&r.whole.markedHeading==='Group 2 — Heading A0.1 2',
  wholeChapterKeepsFrame:r.whole.hasOpening&&r.whole.hasClosing,
  wholeChapterScrolledToGroup:r.whole.scrolled,
  wholeChapterOffersGroupOnly:r.whole.backLink==='Show this group only',
  backToGroup:r.back.sections===1&&r.back.title.endsWith('Group 2 of 3'),
  closes:r.closed,
  firstGroupHasOpening:r.first.hasOpening&&!r.first.hasClosing&&r.first.opening==='Inside this chapter A0.2.'&&r.first.title.endsWith('Group 1 of 3'),
  lastGroupHasClosing:r.last.hasClosing&&!r.last.hasOpening&&r.last.title.endsWith('Group 3 of 3'),
  bindsByGroupId:r.byId.heading==='Heading A0.1 3'&&r.byId.title.endsWith('Group 3 of 3'),
  positionalFallback:r.positional.buttonShown&&r.positional.heading==='Old two'&&r.positional.title==='Chapter 1 · Group 2 of 2',
  previewNamesNotes:/2 chapter note section\(s\)/.test(r.preview),
  removeTakesOrphanNotes:r.afterRemove.oldLeft===0&&r.afterRemove.coreLeft===6&&r.afterRemove.notesLeft===6&&/2 chapter note section/.test(r.afterRemove.status),
  removeTakesNamedNotes:r.afterCore.notesLeft===0&&r.afterCore.sentencesLeft===0,
  noPageErrors:errors.length===0
};
const failed=Object.entries(pass).filter(([,v])=>!v);
console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
for(const [k,v] of Object.entries(pass))console.log(`${v?'✓':'✗'} ${k}`);
if(failed.length)console.log(JSON.stringify({r,errors},null,2));
await browser.close();server.close();if(failed.length)process.exitCode=1;

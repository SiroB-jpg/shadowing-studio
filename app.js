"use strict";
const $=id=>document.getElementById(id);
const DB="ISS_V08", SS="sentences", AS="audioCache";
const App={db:null,sentences:[],analysed:[],alice:null,currentAudio:null,currentAudioResolve:null,elevenAbort:null,playbackContext:"main",cur:{book:"",chapter:"",group:1,index:0},verbTenseIndex:0};

const Util={esc:s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])),clean:s=>String(s??"").replace(/^["']|["']$/g,"").trim(),uniq:a=>[...new Set(a)],nat:(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}),sleep:ms=>new Promise(r=>setTimeout(r,ms)),gnum:s=>Math.floor((Number(s.order)-1)/10)+1,sortS:(a,b)=>String(a.book).localeCompare(String(b.book))||String(a.chapter).localeCompare(String(b.chapter),undefined,{numeric:true,sensitivity:"base"})||Number(a.order)-Number(b.order),slug:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"set",pad:(n,w=2)=>String(n).padStart(w,"0"),norm:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()};

const Storage={open(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=e=>{let d=e.target.result;if(!d.objectStoreNames.contains(SS))d.createObjectStore(SS,{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains(AS))d.createObjectStore(AS,{keyPath:"key"});};r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);});},store(n,m="readonly"){return App.db.transaction(n,m).objectStore(n);},all(n){return new Promise((res,rej)=>{let r=this.store(n).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},get(n,k){return new Promise((res,rej)=>{let r=this.store(n).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},put(n,o){return new Promise((res,rej)=>{let t=App.db.transaction(n,"readwrite");t.objectStore(n).put(o);t.oncomplete=res;t.onerror=()=>rej(t.error);});},addMany(items){return new Promise((res,rej)=>{let t=App.db.transaction(SS,"readwrite"),s=t.objectStore(SS);items.forEach(x=>s.add(x));t.oncomplete=res;t.onerror=()=>rej(t.error);});},clear(n){return new Promise((res,rej)=>{let r=this.store(n,"readwrite").clear();r.onsuccess=res;r.onerror=()=>rej(r.error);});},putMany(items){return new Promise((res,rej)=>{let t=App.db.transaction(SS,"readwrite"),s=t.objectStore(SS);items.forEach(x=>s.put(x));t.oncomplete=res;t.onerror=()=>rej(t.error);});},deleteMany(ids){return new Promise((res,rej)=>{let t=App.db.transaction(SS,"readwrite"),s=t.objectStore(SS);ids.forEach(id=>s.delete(id));t.oncomplete=res;t.onerror=()=>rej(t.error);});}};


/* Book and chapter titles. Chapter titles come from the corpus CSV's
   ChapterTitle column, which the importer used to discard. Book titles have no
   column anywhere, so they are named by hand under Manage library. Both are
   held here rather than on every sentence, since they describe a level of the
   hierarchy, not a row. */
const Titles={
  books:{},chapters:{},
  load(){
    try{this.books=JSON.parse(localStorage.getItem("v08bookTitles")||"{}");}catch(e){this.books={};}
    try{this.chapters=JSON.parse(localStorage.getItem("v08chapterTitles")||"{}");}catch(e){this.chapters={};}
  },
  save(){
    localStorage.setItem("v08bookTitles",JSON.stringify(this.books));
    localStorage.setItem("v08chapterTitles",JSON.stringify(this.chapters));
  },
  key(book,chapter){return String(book)+"|"+String(chapter);},
  book(b){return (this.books[String(b)]||"").trim();},
  chapter(b,c){return (this.chapters[this.key(b,c)]||"").trim();},
  setBook(b,t){let v=String(t||"").trim();if(v)this.books[String(b)]=v;else delete this.books[String(b)];this.save();},
  setChapter(b,c,t){let v=String(t||"").trim();if(v)this.chapters[this.key(b,c)]=v;else delete this.chapters[this.key(b,c)];this.save();},
  /* Pull BookTitle / ChapterTitle out of raw CSV text without touching the
     sentence records. Returns how many chapter titles were learned. */
  harvest(text,defs){
    let rows=Library.rows(text);
    if(rows.length<2)return 0;
    let heads=rows[0].map(x=>x.trim().toLowerCase()),
        idx=n=>heads.indexOf(n),
        bi=idx("book"),ci=idx("chapter"),bt=idx("booktitle"),ct=idx("chaptertitle");
    if(ct<0&&bt<0)return 0;
    let learned=0;
    rows.slice(1).forEach(r=>{
      let b=Util.clean(bi>=0?r[bi]:(defs&&defs.book)||""),c=Util.clean(ci>=0?r[ci]:(defs&&defs.chapter)||"");
      if(bt>=0&&b){let t=Util.clean(r[bt]);if(t&&this.books[b]!==t){this.books[b]=t;learned++;}}
      if(ct>=0&&b&&c){let t=Util.clean(r[ct]);if(t&&this.chapters[this.key(b,c)]!==t){this.chapters[this.key(b,c)]=t;learned++;}}
    });
    if(learned)this.save();
    return learned;
  },
  /* "Book 1 · Present Subjunctive › Chapter 4 · Opinions … › Group 16" */
  crumb(book,chapter,group){
    let parts=[];
    if(book!==""&&book!=null){
      let bt=this.book(book);
      parts.push({label:/^\d+$/.test(String(book))?"Book "+book:String(book),title:bt});
    }
    if(chapter!==""&&chapter!=null){
      let ct=this.chapter(book,chapter);
      parts.push({label:/^\d+$/.test(String(chapter))?"Chapter "+chapter:String(chapter),title:ct});
    }
    if(group!=null)parts.push({label:"Group "+group,title:""});
    return parts;
  }
};

const Library={rows(text){text=String(text||"").replace(/^﻿/,"");let rows=[],row=[],f="",q=false;for(let i=0;i<text.length;i++){let c=text[i],n=text[i+1];if(c=='"'&&q&&n=='"'){f+='"';i++;}else if(c=='"')q=!q;else if(c==","&&!q){row.push(f);f="";}else if((c=="\n"||c=="\r")&&!q){if(c=="\r"&&n=="\n")i++;row.push(f);f="";if(row.some(x=>x.trim()))rows.push(row);row=[];}else f+=c;}row.push(f);if(row.some(x=>x.trim()))rows.push(row);return rows;},parseCSV(text,defs){let rows=this.rows(text);if(!rows.length)return[];let heads=rows[0].map(x=>x.trim().toLowerCase()),has=heads.includes("italian")||heads.includes("sentence")||heads.includes("english"),data=has?rows.slice(1):rows,idx=names=>{for(let n of names){let i=heads.indexOf(n);if(i>=0)return i;}return -1;},bi=idx(["book"]),ci=idx(["chapter","lesson","unit"]),oi=idx(["order","number","no","#"]),gi=idx(["group"]),ti=idx(["item"]),ii=idx(["italian","sentence","text","it","italiano"]),ei=idx(["english","translation","meaning","en"]);const ord=(r,i)=>{if(has&&gi>=0&&ti>=0){let g=Number(Util.clean(r[gi])),it=Number(Util.clean(r[ti]));if(g>0&&it>0)return(g-1)*10+it;}return Number(Util.clean(has&&oi>=0?r[oi]:i+1))||i+1;};return data.map((r,i)=>{let italian="",english="";if(has){italian=ii>=0?r[ii]:"";english=ei>=0?r[ei]:"";}else if(r.length>=5){italian=r[3];english=r[4];}else if(r.length>=2){italian=r[0];english=r[1];}else italian=r[0];return{book:Util.clean(has&&bi>=0?r[bi]:defs.book),chapter:Util.clean(has&&ci>=0?r[ci]:defs.chapter),order:ord(r,i),italian:Util.clean(italian),english:Util.clean(english),bookmarked:false,difficult:false,notes:""};}).filter(x=>x.italian);},chapter(){return App.sentences.filter(s=>s.book==App.cur.book&&s.chapter==App.cur.chapter).sort(Util.sortS);},group(){return this.chapter().filter(s=>Util.gnum(s)==Number(App.cur.group));},groupOf(s){return App.sentences.filter(x=>x.book==s.book&&x.chapter==s.chapter&&Util.gnum(x)==Util.gnum(s)).sort(Util.sortS);},current(){let g=this.group();if(!g.length)return null;App.cur.index=Math.max(0,Math.min(App.cur.index,g.length-1));return g[App.cur.index];},async refresh(){App.sentences=(await Storage.all(SS)).sort(Util.sortS);if(App.sentences.length&&!App.cur.book){let s=App.sentences[0];App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:0};}UI.normalise();UI.renderAll();}};

/* One sentence row, shared by Study and Generate. */
/* One sentence row, shared by Study and Generate.
   Icons are inline SVG rather than a web font: the app is meant to work
   offline, and an icon-only button with no glyph is an unusable blank. */
const SVG={
  play:'<path d="M8 5.2v13.6L19 12z"/>|solid',
  bm:'<path d="M6.5 4h11v16.2l-5.5-3.9-5.5 3.9z"/>',
  bmOn:'<path d="M6.5 4h11v16.2l-5.5-3.9-5.5 3.9z"/>|solid',
  edit:'<path d="M4.2 19.8h4L18.6 9.4a2 2 0 000-2.8l-1.2-1.2a2 2 0 00-2.8 0L4.2 15.8z"/><path d="M13.6 6.6l3.8 3.8"/>',
  drop:'<path d="M6.4 6.4l11.2 11.2M17.6 6.4L6.4 17.6"/>',
  volume:'<path d="M5 9.5h3l4-3.2v11.4l-4-3.2H5z"/><path d="M15.8 9.6a3.4 3.4 0 010 4.8"/>',
  pause:'<rect x="7" y="5" width="3.4" height="14" rx="1"/><rect x="13.6" y="5" width="3.4" height="14" rx="1"/>|solid'
};
function icon(name,size){
  let raw=SVG[name]||"",solid=raw.endsWith("|solid"),d=solid?raw.slice(0,-6):raw;
  return `<svg class="ic" viewBox="0 0 24 24" width="${size||18}" height="${size||18}" fill="${solid?"currentColor":"none"}" `+
         `stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}

const SentenceRow={
  LABEL:{play:"Play this sentence",bm:"Bookmark",edit:"Edit",drop:"Remove from the set"},
  /* o = {number, italian, english, showEnglish, active, playing, bookmarked,
          context, actions:[...], on:{select,play,bm,edit,drop}} */
  build(o){
    let d=document.createElement("div");
    d.className="srow"+(o.active?" active":"")+(o.playing?" playing":"");
    if(o.active)d.setAttribute("aria-current","true");
    let acts=(o.actions||[]).map(k=>{
      let on=k==="bm"&&o.bookmarked;
      return `<button class="rowbtn${on?" on":""}" data-a="${k}" title="${SentenceRow.LABEL[k]}" aria-label="${SentenceRow.LABEL[k]}"`+
             (k==="bm"?` aria-pressed="${on?"true":"false"}"`:"")+`>`+
             icon(on?"bmOn":k)+`</button>`;
    }).join("");
    d.innerHTML=
      `<span class="srow-num">${Util.esc(String(o.number))}</span>`+
      `<div class="srow-text">`+
        (o.context?`<div class="srow-context">${Util.esc(o.context)}</div>`:"")+
        `<div class="italian">${Util.esc(o.italian)}</div>`+
        (o.showEnglish&&o.english?`<div class="english">${Util.esc(o.english)}</div>`:"")+
      `</div>`+
      `<div class="srow-actions">${acts}</div>`+
      (o.playing?`<span class="srow-playing" aria-label="Playing">${icon("volume",14)}</span>`:"");
    const select=()=>{if(o.on&&o.on.select)o.on.select();};
    d.onclick=select;
    d.addEventListener("touchend",e=>{if(e.target.closest("button"))return;e.preventDefault();select();},{passive:false});
    (o.actions||[]).forEach(k=>{
      let btn=d.querySelector(`[data-a="${k}"]`);
      if(btn&&o.on&&o.on[k])btn.onclick=e=>{e.stopPropagation();o.on[k]();};
    });
    return d;
  }
};


/* Focus mode — the same playback, shown as one sentence and nothing else.
   It drives whichever controller is already in charge (Study or Generate), so
   there is no second playback path to keep in step. */
const Focus={
  open:false, origin:null, scrollY:0,
  el(id){return $(id);},
  isOpen(){return this.open;},
  player(){return this.origin==="generate"?GenPlayer:MainPlayer;},
  controller(){return this.origin==="generate"?GenController:SentenceController;},

  enter(origin){
    if(this.open)return;
    this.origin=origin||(document.querySelector(".desktop-tabs [data-panel='generate']")&&!$("generate").classList.contains("hidden")?"generate":"study");
    if(this.origin==="generate"&&!Generator.items.length){Generator.status("Generate a set first.","warntxt");return;}
    if(this.origin==="study"&&!App.sentences.length){UI.status("Import some sentences first.","warntxt");return;}
    this.scrollY=window.scrollY;
    this.open=true;
    /* Inherit the settings from the screen that launched it. */
    $("focusRate").value=$("rate").value;
    $("focusPause").value=$("pause").value;
    $("focusRepeat").value=$("repeat").value;
    $("focusEnglishMode").value=$("showEnglish").value;
    $("focus").classList.remove("hidden");
    document.body.classList.add("focus-open");
    this.sync();
    setTimeout(()=>$("focusToggle").focus(),40);
  },

  leave(){
    if(!this.open)return;
    this.player().stop("Left focus mode.");
    this.open=false;
    $("focus").classList.add("hidden");
    document.body.classList.remove("focus-open");
    window.scrollTo(0,this.scrollY);
    if(this.origin==="generate")Generator.renderCards(); else UI.renderAll();
    let back=this.origin==="generate"?$("genBtn"):$("mainToggle");
    if(back)back.focus();
  },

  current(){
    if(this.origin==="generate"){
      let it=Generator.items[Generator.index];
      return it?{italian:it.italian,english:it.english,
        number:Generator.index+1,of:Generator.items.length,
        parts:Generator.meta?["Generated",Generator.meta.word]:["Generated"]}:null;
    }
    let s=Library.current(); if(!s)return null;
    let g=Library.group();
    return {italian:s.italian,english:s.english,
      number:App.cur.index+1,of:g.length,
      parts:Titles.crumb(App.cur.book,App.cur.chapter,App.cur.group)
        .map(p=>p.title?p.label+" · "+p.title:p.label)};
  },

  sync(){
    if(!this.open)return;
    let c=this.current();
    if(!c){this.leave();return;}
    /* Each step is its own element so a narrow screen can drop the outer ones
       and keep the part that actually locates you — the chapter and group. */
    $("focusCrumb").innerHTML=(c.parts||[]).map(t=>`<span class="cpart">${Util.esc(t)}</span>`).join('<span class="csep">›</span>');
    $("focusPos").textContent=`${c.number} of ${c.of}`;
    $("focusNum").textContent="";
    $("focusItalian").textContent=c.italian;
    let showEn=$("focusEnglishMode").value==="show";
    $("focusEnglish").textContent=showEn&&c.english?c.english:"";
    $("focusEnglish").classList.toggle("hidden",!(showEn&&c.english));
    let playing=this.player().playing&&!this.player().paused;
    $("focusToggle").setAttribute("aria-label",playing?"Pause":"Play");
    $("focusToggle").innerHTML=playing
      ? icon("pause",40)
      : icon("play",40);
    if(!this.player().playing)this.repeat(0,Number($("focusRepeat").value)||1);
  },

  /* Called once per repetition by the playback engine. */
  repeat(n,total){
    if(!this.open)return;
    let t=total==="infinite"?0:Number(total)||1,
        label=total==="infinite"?(n?`Repetition ${n}`:"Looping")
             :(n?`Repetition ${n} of ${t}`:`${t} repetition${t===1?"":"s"} each`);
    $("focusRepLabel").textContent=label;
    let dots="";
    if(t){for(let i=1;i<=t;i++)dots+=`<span class="dot${i<n?" done":i===n?" now":""}"></span>`;}
    else dots='<span class="dot now"></span>';
    $("focusDots").innerHTML=dots;
  },

  toggle(){this.controller().toggle();setTimeout(()=>this.sync(),60);},
  next(){this.controller().next();this.sync();},
  prev(){this.controller().prev();this.sync();}
};

/* ── Logo and book illustration ──────────────────────────────────────────────
   Both of these are Siro's own artwork, lifted from his iPad mockup, not
   drawings of mine: the Ionic capital with its olive branch, and the watercolour
   of the villa. They are embedded here as data rather than kept as separate
   files, so there is nothing extra to upload, nothing that can 404, and nothing
   for the service worker to fail on — the app keeps making no third-party
   requests and keeps working offline. Together they cost about 22 KB.

   The handover's section 07 asked for architectural and typographic motifs and
   warned off hills and cypresses as reading like stock imagery. Siro chose this
   image; it is his application and his taste governs. The rules that still hold
   are the ones about placement: one image on screen at a time, never behind
   text, and marked decorative so screen readers skip it. */
const Art={
  LOGO:"data:image/png;base64,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",
  LAND:"data:image/jpeg;base64,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",

  ARCH:"data:image/jpeg;base64,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",

  /* One illustration, used wherever a book needs a face. */
  plate(){
    return `<figure class="art-plate"><img class="art-img" src="${this.LAND}" alt="" aria-hidden="true" draggable="false"></figure>`;
  },

  /* Generate gets a face of its own — the cypresses seen through the arcade —
     so the tab that invents new material does not look like the library. */
  archPlate(){
    return `<figure class="art-plate art-arch"><img class="art-img" src="${this.ARCH}" alt="" aria-hidden="true" draggable="false"></figure>`;
  },

  /* The identity mark in the application header. */
  mark(){
    return `<img class="art-mark" src="${this.LOGO}" alt="" aria-hidden="true" draggable="false">`;
  }
};

const UI={
  fill(sel,vals,val,label=x=>x){sel.innerHTML="";if(!vals.length){sel.innerHTML="<option>—</option>";return;}vals.forEach(v=>{let o=document.createElement("option");o.value=v;o.textContent=label(v);if(String(v)==String(val))o.selected=true;sel.appendChild(o);});},
  renderAll(){this.renderCrumb();this.renderSideArt();this.renderTree();this.renderViewer();Verb.render();this.stats();},

  /* Book 1 · Present Subjunctive › Chapter 4 · Opinions… › Group 16 */
  renderCrumb(){
    let el=$("crumb");if(!el)return;
    if(!App.sentences.length){el.innerHTML='<span class="crumb-empty">Nothing imported yet</span>';return;}
    let parts=Titles.crumb(App.cur.book,App.cur.chapter,App.cur.group);
    el.innerHTML=parts.map((p,i)=>
      `<span class="crumb-part${i===parts.length-1?" here":""}">`+
        `<span class="crumb-label">${Util.esc(p.label)}</span>`+
        (p.title?`<span class="crumb-title">${Util.esc(p.title)}</span>`:"")+
      `</span>`).join('<span class="crumb-sep" aria-hidden="true">›</span>');
  },

  /* One illustration, for the book you are in. The handover allows a motif in
     the library at book level and in empty states, and asks that no more than
     one be visible at once — so when the library is empty this one goes away
     and the empty state carries the only drawing on screen. */
  renderSideArt(){
    let el=$("sideArt");if(!el)return;
    let onGenerate=$("generate")&&!$("generate").classList.contains("hidden");
    if(onGenerate||!App.sentences.length||!App.cur.book){el.innerHTML="";el.classList.add("hidden");return;}
    el.classList.remove("hidden");
    /* No caption: the breadcrumb and the tree already name the book twice, and
       a third naming would be noise. The drawing is decoration, not a label. */
    el.innerHTML=Art.plate();
  },

  renderTree(){
    let t=$("tree");t.innerHTML="";
    if(!App.sentences.length){t.innerHTML='<p class="small">No sentences imported yet.</p>';return;}
    Util.uniq(App.sentences.map(s=>s.book)).sort(Util.nat).forEach(b=>{
      let bd=document.createElement("div");
      bd.className="book "+(App.cur.book==b?"active":"");
      let bt=Titles.book(b);
      bd.innerHTML=`<span>${Util.esc(/^\d+$/.test(String(b))?"Book "+b:String(b))}</span>`+(bt?`<span class="tree-title">${Util.esc(bt)}</span>`:"");
      bd.onclick=()=>{App.cur.book=b;App.cur.chapter="";App.cur.group=1;App.cur.index=0;UI.normalise();UI.renderAll();};
      t.appendChild(bd);
      Util.uniq(App.sentences.filter(s=>s.book==b).map(s=>s.chapter)).sort(Util.nat).forEach(c=>{
        let cd=document.createElement("div");
        cd.className="chapter "+(App.cur.book==b&&App.cur.chapter==c?"active":"");
        let ct=Titles.chapter(b,c);
        cd.innerHTML=`<span>${Util.esc(/^\d+$/.test(String(c))?"Chapter "+c:String(c))}</span>`+(ct?`<span class="tree-title">${Util.esc(ct)}</span>`:"");
        cd.onclick=()=>{App.cur.book=b;App.cur.chapter=c;App.cur.group=1;App.cur.index=0;UI.renderAll();};
        t.appendChild(cd);
        if(App.cur.book==b&&App.cur.chapter==c)
          Util.uniq(App.sentences.filter(s=>s.book==b&&s.chapter==c).map(Util.gnum)).sort((a,b)=>a-b).forEach(g=>{
            let gd=document.createElement("div");
            gd.className="groupItem "+(Number(App.cur.group)==g?"active":"");
            gd.textContent="Group "+g;
            gd.onclick=()=>{App.cur.group=g;App.cur.index=0;UI.renderAll();};
            t.appendChild(gd);
          });
      });
    });
  },

  /* Keep App.cur pointing at something that exists. */
  normalise(){
    let books=Util.uniq(App.sentences.map(s=>s.book)).sort(Util.nat);
    if(!books.includes(App.cur.book)&&books[0])App.cur.book=books[0];
    let ch=Util.uniq(App.sentences.filter(s=>s.book==App.cur.book).map(s=>s.chapter)).sort(Util.nat);
    if(!ch.includes(App.cur.chapter)&&ch[0])App.cur.chapter=ch[0];
    let gs=Util.uniq(App.sentences.filter(s=>s.book==App.cur.book&&s.chapter==App.cur.chapter).map(Util.gnum)).sort((a,b)=>a-b);
    if(!gs.includes(Number(App.cur.group))&&gs[0])App.cur.group=gs[0];
  },

  rowFor(s,i,list){
    return SentenceRow.build({
      number:s.order,italian:s.italian,english:s.english,
      showEnglish:$("showEnglish").value=="show",
      active:i===App.cur.index,
      playing:MainPlayer.playing&&i===App.cur.index,
      bookmarked:!!s.bookmarked,
      actions:["play","bm","edit"],
      on:{
        select:()=>SentenceController.jumpToIndex(i),
        play:async()=>{await Speech.speak(s.italian);},
        bm:async()=>{s.bookmarked=!s.bookmarked;await Storage.put(SS,s);await Library.refresh();},
        edit:()=>Editor.open(s)
      }
    });
  },

  /* A search term looks across the whole library; otherwise the current group. */
  searchResults(q){
    let n=Util.norm(q);
    return App.sentences.filter(s=>Util.norm(s.italian+" "+s.english).includes(n)).slice(0,60);
  },

  renderViewer(){
    let v=$("viewer");v.innerHTML="";
    if(!App.sentences.length){
      v.innerHTML='<div class="empty">'+Art.plate()+'<h3>No sentences yet</h3><p>Open <strong>Manage library</strong> to import a CSV, or use the <strong>Generate</strong> tab.</p><p class=\"small\">A library belongs to the device it was imported on. If your sentences are on another device, export them there and import the file here.</p></div>';
      return;
    }
    let q=($("search")?$("search").value:"").trim();
    if(q){
      let hits=this.searchResults(q);
      if(!hits.length){v.innerHTML=`<div class="empty"><h3>Nothing found</h3><p>No sentence contains “${Util.esc(q)}”.</p></div>`;return;}
      let head=document.createElement("div");
      head.className="listnote";
      head.textContent=`${hits.length} match${hits.length===1?"":"es"} across the library${hits.length===60?" (showing the first 60)":""}. Tap one to open its group.`;
      v.appendChild(head);
      hits.forEach(s=>v.appendChild(SentenceRow.build({
        number:s.order,italian:s.italian,english:s.english,
        showEnglish:$("showEnglish").value=="show",
        bookmarked:!!s.bookmarked,
        context:Titles.crumb(s.book,s.chapter,Util.gnum(s)).map(p=>p.label).join(" · "),
        actions:["play","bm"],
        on:{
          select:()=>{$("search").value="";App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:Math.max(0,Library.groupOf(s).findIndex(x=>x.id===s.id))};UI.renderAll();},
          play:async()=>{await Speech.speak(s.italian);},
          bm:async()=>{s.bookmarked=!s.bookmarked;await Storage.put(SS,s);await Library.refresh();}
        }
      })));
      return;
    }
    let g=Library.group();
    if($("displayMode").value=="single"){
      let s=Library.current();
      if(s)v.appendChild(this.rowFor(s,App.cur.index,g));
      return;
    }
    g.forEach((s,i)=>v.appendChild(this.rowFor(s,i,g)));
    Focus.sync();
    setTimeout(()=>{let a=$("viewer").querySelector(".srow.active");if(a)a.scrollIntoView({behavior:"smooth",block:"nearest"});},80);
  },

  stats(){
    let books=Util.uniq(App.sentences.map(s=>s.book)).length,
        ch=Util.uniq(App.sentences.map(s=>s.book+"|"+s.chapter)).length,
        gs=Util.uniq(App.sentences.map(s=>s.book+"|"+s.chapter+"|"+Util.gnum(s))).length;
    $("stats").innerHTML=`${App.sentences.length} sentences<br>${books} book(s), ${ch} chapter(s), ${gs} group(s)`;
  },
  status(msg,cls=""){$("status").textContent=msg;$("status").className="status "+cls;}
};

const PlaybackControls={
  /* Study and Generate share one bar, so both read the same repeat, speed and
     pause. Only the verb drill keeps a set of its own. */
  _id(base){
    let pre=App.playbackContext==="verb"?"verb":"";
    let id=pre?pre+base[0].toUpperCase()+base.slice(1):base;
    return $(id)?id:base;
  },
  rate(){return Number($(this._id("rate")).value)||1;},
  pause(){return Number($(this._id("pause")).value)||0;},
  repeat(){let v=$(this._id("repeat")).value;return v==="infinite"?"infinite":Number(v)||1;}
};

const Speech={
  loadVoices(){let vs=speechSynthesis.getVoices();App.alice=vs.find(v=>v.name=="Alice")||vs.find(v=>/alice/i.test(v.name))||vs.find(v=>v.lang&&v.lang.toLowerCase().startsWith("it"))||null;},
  stopAudioOnly(){
    if(App.elevenAbort){try{App.elevenAbort.abort();}catch(e){}App.elevenAbort=null;}
    if(App.currentAudio){
      try{App.currentAudio.pause();App.currentAudio.removeAttribute("src");App.currentAudio.load();}catch(e){}
      App.currentAudio=null;
    }
    if(App.currentAudioResolve){try{App.currentAudioResolve();}catch(e){}App.currentAudioResolve=null;}
  },
  stop(){speechSynthesis.cancel();this.stopAudioOnly();},
  system(text){return new Promise(res=>{speechSynthesis.cancel();let done=false,timer=null;const finish=()=>{if(done)return;done=true;if(timer)clearTimeout(timer);res();};let u=new SpeechSynthesisUtterance(text);u.lang="it-IT";u.rate=PlaybackControls.rate();if(App.alice)u.voice=App.alice;u.onend=finish;u.onerror=finish;timer=setTimeout(finish,25000);speechSynthesis.speak(u);});},
  playBlob(blob){return new Promise((res,rej)=>{
    this.stopAudioOnly();
    let url=URL.createObjectURL(blob),a=new Audio(),settled=false,started=false,startTimer=null,totalTimer=null;
    App.currentAudio=a;
    const cleanup=()=>{if(startTimer)clearTimeout(startTimer);if(totalTimer)clearTimeout(totalTimer);try{URL.revokeObjectURL(url);}catch(e){}App.currentAudioResolve=null;if(App.currentAudio===a)App.currentAudio=null;};
    const finish=()=>{if(settled)return;settled=true;cleanup();res();};
    const fail=err=>{if(settled)return;settled=true;cleanup();try{a.pause();}catch(e){}rej(err||new Error("Audio playback failed"));};
    App.currentAudioResolve=finish;
    a.preload="auto";
    a.playsInline=true;
    /* Loading a clip resets playbackRate to defaultPlaybackRate, so a rate set
       before src is assigned is thrown away. That is why choosing a speed never
       affected the ElevenLabs voice on any platform. Set the default, which the
       load preserves, and reassert the rate once the clip is actually there. */
    let rate=this.audioRate();
    a.defaultPlaybackRate=rate;
    a.playbackRate=rate;
    /* Slow it down without dropping the pitch — a half-speed voice an octave
       lower is no use for shadowing. On by default in current browsers, but
       older WebKit needs telling, and saying so explicitly costs nothing. */
    ["preservesPitch","webkitPreservesPitch","mozPreservesPitch"].forEach(k=>{try{if(k in a)a[k]=true;}catch(e){}});
    const applyRate=()=>{try{if(a.playbackRate!==rate)a.playbackRate=rate;}catch(e){}};
    a.onloadedmetadata=applyRate;
    a.oncanplay=applyRate;
    a.onplaying=()=>{started=true;applyRate();if(startTimer)clearTimeout(startTimer);};
    a.onended=finish;
    a.onerror=()=>fail(new Error("Audio playback error"));
    a.onstalled=()=>{if(!started)fail(new Error("Audio playback stalled"));};
    a.src=url;
    startTimer=setTimeout(()=>{if(!started)fail(new Error("Audio did not start"));},9000);
    totalTimer=setTimeout(()=>fail(new Error("Audio playback timed out")),45000);
    let p=a.play();
    if(p&&p.catch)p.catch(err=>fail(err));
  });},
  /* One place to decide how fast a recorded clip is played, so the rule is
     visible rather than buried in the player. Recordings are cached by voice
     and text only: the speed is applied on the way out, so changing it does not
     invalidate the cache or cost another ElevenLabs request. */
  audioRate(){let r=Number(PlaybackControls.rate());return isFinite(r)&&r>0?r:1;},
  key(text){return `${$("voiceId").value}|${$("model").value}|${text}`;},
  async prefetch(text){
    let api=$("apiKey").value.trim(),vid=$("voiceId").value.trim();
    if(!api||!vid)throw new Error("No API key or Voice ID");
    let key=this.key(text),cached=await Storage.get(AS,key);
    if(cached?.blob)return"cached";
    const controller=new AbortController();
    App.elevenAbort=controller;
    let timer=setTimeout(()=>controller.abort(),15000),r;
    try{r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}`,{method:"POST",headers:{"Accept":"audio/mpeg","Content-Type":"application/json","xi-api-key":api},body:JSON.stringify({text,model_id:$("model").value,voice_settings:{stability:.5,similarity_boost:.75}}),signal:controller.signal});}
    catch(e){if(e&&e.name==="AbortError"){if(App.elevenAbort!==controller)return"cancelled";throw new Error("ElevenLabs timed out");}throw e;}
    finally{clearTimeout(timer);if(App.elevenAbort===controller)App.elevenAbort=null;}
    if(r.status===429)throw new Error("Rate limited");
    if(!r.ok)throw new Error("ElevenLabs error "+r.status);
    let blob=await r.blob();
    if(!blob||!blob.size)throw new Error("Empty audio");
    await Storage.put(AS,{key,blob,createdAt:Date.now()});
    return"fetched";
  },
  async eleven(text){
    let api=$("apiKey").value.trim(),vid=$("voiceId").value.trim();
    if(!api||!vid){UI.status("Missing ElevenLabs key or Voice ID. Using system voice.","warntxt");return this.system(text);}
    let key=this.key(text),cached=await Storage.get(AS,key),blob;
    if(cached?.blob)blob=cached.blob;
    else{
      UI.status("Contacting ElevenLabs…");
      const controller=new AbortController();
      App.elevenAbort=controller;
      let timer=setTimeout(()=>controller.abort(),15000),r;
      try{r=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(vid)}`,{method:"POST",headers:{"Accept":"audio/mpeg","Content-Type":"application/json","xi-api-key":api},body:JSON.stringify({text,model_id:$("model").value,voice_settings:{stability:.5,similarity_boost:.75}}),signal:controller.signal});}
      catch(e){if(e&&e.name==="AbortError"){if(App.elevenAbort!==controller)return;throw new Error("ElevenLabs connection timed out");}throw e;}
      finally{clearTimeout(timer);if(App.elevenAbort===controller)App.elevenAbort=null;}
      if(!r.ok)throw new Error("ElevenLabs error "+r.status);
      blob=await r.blob();
      if(!blob||!blob.size)throw new Error("ElevenLabs returned empty audio");
      await Storage.put(AS,{key,blob,createdAt:Date.now()});
    }
    return this.playBlob(blob);
  },
  async speak(text){
    if($("voiceMode").value=="eleven"){
      try{return await this.eleven(text);}
      catch(e){UI.status((e&&e.message?e.message:"ElevenLabs unavailable")+". Using system voice.","warntxt");return this.system(text);}
    }
    return this.system(text);
  }
};

class PlaybackEngine{constructor(name,button,statusPrefix=""){this.name=name;this.button=button;this.statusPrefix=statusPrefix;this.run=0;this.playing=false;this.paused=false;this.stopped=false;this.provider=null;}setButton(){if(this.button)this.button.textContent=this.playing?(this.paused?"Resume":"Pause"):"Start";}async wait(run){while(this.paused&&!this.stopped&&run===this.run)await Util.sleep(120);}toggle(providerFactory){if(!this.playing){this.start(providerFactory);return;}if(!this.paused){this.paused=true;speechSynthesis.pause();if(App.currentAudio)App.currentAudio.pause();UI.status((this.statusPrefix||"Playback")+" paused.","warntxt");this.setButton();MediaSessionMgr.paused();return;}this.paused=false;speechSynthesis.resume();if(App.currentAudio)App.currentAudio.play().catch(()=>{});UI.status("Playing…");this.setButton();MediaSessionMgr.playing();}stop(msg="Stopped."){this.run++;this.stopped=true;this.playing=false;this.paused=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status(msg,"warntxt");if(!MainPlayer.playing&&!VerbPlayer.playing&&!GenPlayer.playing){WakeLock.release();MediaSessionMgr.none();}}restart(providerFactory,delay=140){this.stop("Restarting…");setTimeout(()=>this.start(providerFactory),delay);}async start(providerFactory){if(this.playing)return;this.run++;let run=this.run;this.playing=true;this.paused=false;this.stopped=false;this.setButton();this.provider=providerFactory();App.playbackContext=this.name;UI.status("Playing…");WakeLock.request();MediaSessionMgr.playing();try{while(run===this.run&&!this.stopped){let item=this.provider.next();if(!item)break;if(item.onBefore)item.onBefore();if(item.label){UI.status(item.label);MediaSessionMgr.update(item.label,App.cur.book||"");}let reps=item.repeat??1;if(reps==="infinite"){let rn=0;while(run===this.run&&!this.stopped){await this.wait(run);if(run!==this.run||this.stopped)break;if(item.onRepeat)item.onRepeat(++rn,"infinite");await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}else{for(let i=0;i<Number(reps)&&run===this.run&&!this.stopped;i++){await this.wait(run);if(run!==this.run||this.stopped)break;if(item.onRepeat)item.onRepeat(i+1,Number(reps));await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}}}catch(e){UI.status("Playback error: "+(e&&e.message?e.message:e),"dangertxt");}finally{if(run===this.run){this.playing=false;this.paused=false;this.stopped=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status("Finished.","oktxt");WakeLock.release();MediaSessionMgr.none();}}}}

const MainPlayer=new PlaybackEngine("main",null,"Sentence playback");
const VerbPlayer=new PlaybackEngine("verb",null,"Verb drill");
const GenPlayer=new PlaybackEngine("gen",null,"Generated sentences");

function withProgress(p){
  return {next:()=>{
    let item=p.next();
    if(item){
      let before=item.onBefore;
      item.onBefore=()=>{if(before)before();Focus.sync();};
      item.onRepeat=(n,total)=>Focus.repeat(n,total);
    }
    return item;
  }};
}

const SentenceController={repeat(){return PlaybackControls.repeat();},provider(){let mode=$("playMode").value||"group";if(mode==="current")return this.currentProvider(false);if(mode==="loop-current")return this.currentProvider(true);if(mode==="chapter")return this.sequenceProvider("chapter",false);if(mode==="loop-chapter")return this.sequenceProvider("chapter",true);if(mode==="loop-group")return this.sequenceProvider("group",true);return this.sequenceProvider("group",false);},currentProvider(loop){let done=false;return{next:()=>{let s=Library.current();if(!s)return null;if(done&&!loop)return null;done=true;return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping sentence ":"Sentence ")+s.order,onBefore:()=>UI.renderViewer()};}};},itemsForScope(scope){if(scope==="group")return Library.group();if(scope==="chapter")return Library.chapter();return Library.group();},sequenceProvider(scope,loop){let items=this.itemsForScope(scope),idx=0;if(scope==="group")idx=Math.max(0,Math.min(App.cur.index,items.length-1));else{let cur=Library.current();let pos=items.findIndex(x=>x.id===cur?.id);idx=Math.max(0,pos);}return{next:()=>{if(!items.length)return null;if(idx>=items.length){if(!loop)return null;idx=0;}let s=items[idx++];return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping "+scope+" — ":"")+"Sentence "+s.order,onBefore:()=>{App.cur.book=s.book;App.cur.chapter=s.chapter;App.cur.group=Util.gnum(s);App.cur.index=Library.group().findIndex(x=>x.id===s.id);if(App.cur.index<0)App.cur.index=0;UI.renderAll();}};}};},toggle(){MainPlayer.toggle(()=>withProgress(this.provider()));},reset(){MainPlayer.stop("Audio engine reset. Press Start to continue.");},restart(){if(MainPlayer.playing)MainPlayer.restart(()=>withProgress(this.provider()));},jumpToIndex(i){App.cur.index=i;UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},next(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index<g.length-1)?App.cur.index+1:0;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},prev(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index>0)?App.cur.index-1:g.length-1;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());}};

const Verb={
  tenseOrder:["presente","passato","imperfetto","trapassato"],
  names:{presente:"congiuntivo presente",passato:"congiuntivo passato",imperfetto:"congiuntivo imperfetto",trapassato:"congiuntivo trapassato"},
  /* 112 verbs. The 46 originals are reproduced exactly; the rest were
     generated by rule from the corpus and validated against those 46.
     aux may be a pair where the verb genuinely takes both auxiliaries.
     pf = participle agreement [m.sg, f.sg, m.pl, f.pl], used with essere only.
     refl = the presente/imperfetto forms already carry their clitic. */
  V:{
    accorgersi:{en:"to notice, to realise",presente:["mi accorga","ti accorga","si accorga","ci accorgiamo","vi accorgiate","si accorgano"],imperfetto:["mi accorgessi","ti accorgessi","si accorgesse","ci accorgessimo","vi accorgeste","si accorgessero"],aux:"essere",part:"accorto",pf:["accorto","accorta","accorti","accorte"],refl:1},
    aggiungere:{en:"to add",presente:["aggiunga","aggiunga","aggiunga","aggiungiamo","aggiungiate","aggiungano"],imperfetto:["aggiungessi","aggiungessi","aggiungesse","aggiungessimo","aggiungeste","aggiungessero"],aux:"avere",part:"aggiunto",pf:["aggiunto","aggiunta","aggiunti","aggiunte"]},
    andare:{en:"to go",presente:["vada","vada","vada","andiamo","andiate","vadano"],imperfetto:["andassi","andassi","andasse","andassimo","andaste","andassero"],aux:"essere",part:"andato",pf:["andato","andata","andati","andate"]},
    aprire:{en:"to open",presente:["apra","apra","apra","apriamo","apriate","aprano"],imperfetto:["aprissi","aprissi","aprisse","aprissimo","apriste","aprissero"],aux:"avere",part:"aperto",pf:["aperto","aperta","aperti","aperte"]},
    avere:{en:"to have",presente:["abbia","abbia","abbia","abbiamo","abbiate","abbiano"],imperfetto:["avessi","avessi","avesse","avessimo","aveste","avessero"],aux:"avere",part:"avuto",pf:["avuto","avuta","avuti","avute"]},
    chiedere:{en:"to ask",presente:["chieda","chieda","chieda","chiediamo","chiediate","chiedano"],imperfetto:["chiedessi","chiedessi","chiedesse","chiedessimo","chiedeste","chiedessero"],aux:"avere",part:"chiesto",pf:["chiesto","chiesta","chiesti","chieste"]},
    conoscere:{en:"to know (person/place)",presente:["conosca","conosca","conosca","conosciamo","conosciate","conoscano"],imperfetto:["conoscessi","conoscessi","conoscesse","conoscessimo","conosceste","conoscessero"],aux:"avere",part:"conosciuto",pf:["conosciuto","conosciuta","conosciuti","conosciute"]},
    coprire:{en:"to cover",presente:["copra","copra","copra","copriamo","copriate","coprano"],imperfetto:["coprissi","coprissi","coprisse","coprissimo","copriste","coprissero"],aux:"avere",part:"coperto",pf:["coperto","coperta","coperti","coperte"]},
    dare:{en:"to give",presente:["dia","dia","dia","diamo","diate","diano"],imperfetto:["dessi","dessi","desse","dessimo","deste","dessero"],aux:"avere",part:"dato",pf:["dato","data","dati","date"]},
    decidere:{en:"to decide",presente:["decida","decida","decida","decidiamo","decidiate","decidano"],imperfetto:["decidessi","decidessi","decidesse","decidessimo","decideste","decidessero"],aux:"avere",part:"deciso",pf:["deciso","decisa","decisi","decise"]},
    dire:{en:"to say",presente:["dica","dica","dica","diciamo","diciate","dicano"],imperfetto:["dicessi","dicessi","dicesse","dicessimo","diceste","dicessero"],aux:"avere",part:"detto",pf:["detto","detta","detti","dette"]},
    discutere:{en:"to discuss",presente:["discuta","discuta","discuta","discutiamo","discutiate","discutano"],imperfetto:["discutessi","discutessi","discutesse","discutessimo","discuteste","discutessero"],aux:"avere",part:"discusso",pf:["discusso","discussa","discussi","discusse"]},
    dovere:{en:"to have to",presente:["debba","debba","debba","dobbiamo","dobbiate","debbano"],imperfetto:["dovessi","dovessi","dovesse","dovessimo","doveste","dovessero"],aux:"avere",part:"dovuto",pf:["dovuto","dovuta","dovuti","dovute"]},
    essere:{en:"to be",presente:["sia","sia","sia","siamo","siate","siano"],imperfetto:["fossi","fossi","fosse","fossimo","foste","fossero"],aux:"essere",part:"stato",pf:["stato","stata","stati","state"]},
    evolversi:{en:"to evolve",presente:["mi evolva","ti evolva","si evolva","ci evolviamo","vi evolviate","si evolvano"],imperfetto:["mi evolvessi","ti evolvessi","si evolvesse","ci evolvessimo","vi evolveste","si evolvessero"],aux:"essere",part:"evoluto",pf:["evoluto","evoluta","evoluti","evolute"],refl:1},
    fare:{en:"to do / make",presente:["faccia","faccia","faccia","facciamo","facciate","facciano"],imperfetto:["facessi","facessi","facesse","facessimo","faceste","facessero"],aux:"avere",part:"fatto",pf:["fatto","fatta","fatti","fatte"]},
    imporre:{en:"to impose",presente:["imponga","imponga","imponga","imponiamo","imponiate","impongano"],imperfetto:["imponessi","imponessi","imponesse","imponessimo","imponeste","imponessero"],aux:"avere",part:"imposto",pf:["imposto","imposta","imposti","imposte"]},
    interrompere:{en:"to interrupt",presente:["interrompa","interrompa","interrompa","interrompiamo","interrompiate","interrompano"],imperfetto:["interrompessi","interrompessi","interrompesse","interrompessimo","interrompeste","interrompessero"],aux:"avere",part:"interrotto",pf:["interrotto","interrotta","interrotti","interrotte"]},
    intervenire:{en:"to intervene, to step in",presente:["intervenga","intervenga","intervenga","interveniamo","interveniate","intervengano"],imperfetto:["intervenissi","intervenissi","intervenisse","intervenissimo","interveniste","intervenissero"],aux:"essere",part:"intervenuto",pf:["intervenuto","intervenuta","intervenuti","intervenute"]},
    leggere:{en:"to read",presente:["legga","legga","legga","leggiamo","leggiate","leggano"],imperfetto:["leggessi","leggessi","leggesse","leggessimo","leggeste","leggessero"],aux:"avere",part:"letto",pf:["letto","letta","letti","lette"]},
    mettere:{en:"to put",presente:["metta","metta","metta","mettiamo","mettiate","mettano"],imperfetto:["mettessi","mettessi","mettesse","mettessimo","metteste","mettessero"],aux:"avere",part:"messo",pf:["messo","messa","messi","messe"]},
    offendere:{en:"to offend",presente:["offenda","offenda","offenda","offendiamo","offendiate","offendano"],imperfetto:["offendessi","offendessi","offendesse","offendessimo","offendeste","offendessero"],aux:"avere",part:"offeso",pf:["offeso","offesa","offesi","offese"]},
    piacere:{en:"to be pleasing, to like",presente:["piaccia","piaccia","piaccia","piacciamo","piacciate","piacciano"],imperfetto:["piacessi","piacessi","piacesse","piacessimo","piaceste","piacessero"],aux:"essere",part:"piaciuto",pf:["piaciuto","piaciuta","piaciuti","piaciute"]},
    potere:{en:"to be able to",presente:["possa","possa","possa","possiamo","possiate","possano"],imperfetto:["potessi","potessi","potesse","potessimo","poteste","potessero"],aux:"avere",part:"potuto",pf:["potuto","potuta","potuti","potute"]},
    prendere:{en:"to take",presente:["prenda","prenda","prenda","prendiamo","prendiate","prendano"],imperfetto:["prendessi","prendessi","prendesse","prendessimo","prendeste","prendessero"],aux:"avere",part:"preso",pf:["preso","presa","presi","prese"]},
    rimanere:{en:"to remain",presente:["rimanga","rimanga","rimanga","rimaniamo","rimaniate","rimangano"],imperfetto:["rimanessi","rimanessi","rimanesse","rimanessimo","rimaneste","rimanessero"],aux:"essere",part:"rimasto",pf:["rimasto","rimasta","rimasti","rimaste"]},
    risolvere:{en:"to solve, to resolve",presente:["risolva","risolva","risolva","risolviamo","risolviate","risolvano"],imperfetto:["risolvessi","risolvessi","risolvesse","risolvessimo","risolveste","risolvessero"],aux:"avere",part:"risolto",pf:["risolto","risolta","risolti","risolte"]},
    rispondere:{en:"to answer",presente:["risponda","risponda","risponda","rispondiamo","rispondiate","rispondano"],imperfetto:["rispondessi","rispondessi","rispondesse","rispondessimo","rispondeste","rispondessero"],aux:"avere",part:"risposto",pf:["risposto","risposta","risposti","risposte"]},
    riuscire:{en:"to manage, to succeed",presente:["riesca","riesca","riesca","riusciamo","riusciate","riescano"],imperfetto:["riuscissi","riuscissi","riuscisse","riuscissimo","riusciste","riuscissero"],aux:"essere",part:"riuscito",pf:["riuscito","riuscita","riusciti","riuscite"]},
    sapere:{en:"to know",presente:["sappia","sappia","sappia","sappiamo","sappiate","sappiano"],imperfetto:["sapessi","sapessi","sapesse","sapessimo","sapeste","sapessero"],aux:"avere",part:"saputo",pf:["saputo","saputa","saputi","sapute"]},
    scegliere:{en:"to choose",presente:["scelga","scelga","scelga","scegliamo","scegliate","scelgano"],imperfetto:["scegliessi","scegliessi","scegliesse","scegliessimo","sceglieste","scegliessero"],aux:"avere",part:"scelto",pf:["scelto","scelta","scelti","scelte"]},
    scrivere:{en:"to write",presente:["scriva","scriva","scriva","scriviamo","scriviate","scrivano"],imperfetto:["scrivessi","scrivessi","scrivesse","scrivessimo","scriveste","scrivessero"],aux:"avere",part:"scritto",pf:["scritto","scritta","scritti","scritte"]},
    spingere:{en:"to push",presente:["spinga","spinga","spinga","spingiamo","spingiate","spingano"],imperfetto:["spingessi","spingessi","spingesse","spingessimo","spingeste","spingessero"],aux:"avere",part:"spinto",pf:["spinto","spinta","spinti","spinte"]},
    stare:{en:"to stay / be",presente:["stia","stia","stia","stiamo","stiate","stiano"],imperfetto:["stessi","stessi","stesse","stessimo","steste","stessero"],aux:"essere",part:"stato",pf:["stato","stata","stati","state"]},
    tenere:{en:"to hold, to keep",presente:["tenga","tenga","tenga","teniamo","teniate","tengano"],imperfetto:["tenessi","tenessi","tenesse","tenessimo","teneste","tenessero"],aux:"avere",part:"tenuto",pf:["tenuto","tenuta","tenuti","tenute"]},
    uscire:{en:"to go out",presente:["esca","esca","esca","usciamo","usciate","escano"],imperfetto:["uscissi","uscissi","uscisse","uscissimo","usciste","uscissero"],aux:"essere",part:"uscito",pf:["uscito","uscita","usciti","uscite"]},
    vedere:{en:"to see",presente:["veda","veda","veda","vediamo","vediate","vedano"],imperfetto:["vedessi","vedessi","vedesse","vedessimo","vedeste","vedessero"],aux:"avere",part:"visto",pf:["visto","vista","visti","viste"]},
    venire:{en:"to come",presente:["venga","venga","venga","veniamo","veniate","vengano"],imperfetto:["venissi","venissi","venisse","venissimo","veniste","venissero"],aux:"essere",part:"venuto",pf:["venuto","venuta","venuti","venute"]},
    vivere:{en:"to live",presente:["viva","viva","viva","viviamo","viviate","vivano"],imperfetto:["vivessi","vivessi","vivesse","vivessimo","viveste","vivessero"],aux:["avere","essere"],part:"vissuto",pf:["vissuto","vissuta","vissuti","vissute"]},
    volere:{en:"to want",presente:["voglia","voglia","voglia","vogliamo","vogliate","vogliano"],imperfetto:["volessi","volessi","volesse","volessimo","voleste","volessero"],aux:"avere",part:"voluto",pf:["voluto","voluta","voluti","volute"]},
    accentuare:{en:"to accentuate, to emphasise",presente:["accentui","accentui","accentui","accentuiamo","accentuiate","accentuino"],imperfetto:["accentuassi","accentuassi","accentuasse","accentuassimo","accentuaste","accentuassero"],aux:"avere",part:"accentuato",pf:["accentuato","accentuata","accentuati","accentuate"]},
    accettare:{en:"to accept",presente:["accetti","accetti","accetti","accettiamo","accettiate","accettino"],imperfetto:["accettassi","accettassi","accettasse","accettassimo","accettaste","accettassero"],aux:"avere",part:"accettato",pf:["accettato","accettata","accettati","accettate"]},
    adattarsi:{en:"to adapt (oneself)",presente:["mi adatti","ti adatti","si adatti","ci adattiamo","vi adattiate","si adattino"],imperfetto:["mi adattassi","ti adattassi","si adattasse","ci adattassimo","vi adattaste","si adattassero"],aux:"essere",part:"adattato",pf:["adattato","adattata","adattati","adattate"],refl:1},
    aiutare:{en:"to help",presente:["aiuti","aiuti","aiuti","aiutiamo","aiutiate","aiutino"],imperfetto:["aiutassi","aiutassi","aiutasse","aiutassimo","aiutaste","aiutassero"],aux:"avere",part:"aiutato",pf:["aiutato","aiutata","aiutati","aiutate"]},
    amare:{en:"to love",presente:["ami","ami","ami","amiamo","amiate","amino"],imperfetto:["amassi","amassi","amasse","amassimo","amaste","amassero"],aux:"avere",part:"amato",pf:["amato","amata","amati","amate"]},
    arrivare:{en:"to arrive",presente:["arrivi","arrivi","arrivi","arriviamo","arriviate","arrivino"],imperfetto:["arrivassi","arrivassi","arrivasse","arrivassimo","arrivaste","arrivassero"],aux:"essere",part:"arrivato",pf:["arrivato","arrivata","arrivati","arrivate"]},
    ascoltare:{en:"to listen (to)",presente:["ascolti","ascolti","ascolti","ascoltiamo","ascoltiate","ascoltino"],imperfetto:["ascoltassi","ascoltassi","ascoltasse","ascoltassimo","ascoltaste","ascoltassero"],aux:"avere",part:"ascoltato",pf:["ascoltato","ascoltata","ascoltati","ascoltate"]},
    ascoltarsi:{en:"to listen to oneself / to each other",presente:["mi ascolti","ti ascolti","si ascolti","ci ascoltiamo","vi ascoltiate","si ascoltino"],imperfetto:["mi ascoltassi","ti ascoltassi","si ascoltasse","ci ascoltassimo","vi ascoltaste","si ascoltassero"],aux:"essere",part:"ascoltato",pf:["ascoltato","ascoltata","ascoltati","ascoltate"],refl:1},
    aspettare:{en:"to wait",presente:["aspetti","aspetti","aspetti","aspettiamo","aspettiate","aspettino"],imperfetto:["aspettassi","aspettassi","aspettasse","aspettassimo","aspettaste","aspettassero"],aux:"avere",part:"aspettato",pf:["aspettato","aspettata","aspettati","aspettate"]},
    aumentare:{en:"to increase",presente:["aumenti","aumenti","aumenti","aumentiamo","aumentiate","aumentino"],imperfetto:["aumentassi","aumentassi","aumentasse","aumentassimo","aumentaste","aumentassero"],aux:["essere","avere"],part:"aumentato",pf:["aumentato","aumentata","aumentati","aumentate"]},
    avvisare:{en:"to warn, to notify",presente:["avvisi","avvisi","avvisi","avvisiamo","avvisiate","avvisino"],imperfetto:["avvisassi","avvisassi","avvisasse","avvisassimo","avvisaste","avvisassero"],aux:"avere",part:"avvisato",pf:["avvisato","avvisata","avvisati","avvisate"]},
    cambiare:{en:"to change",presente:["cambi","cambi","cambi","cambiamo","cambiate","cambino"],imperfetto:["cambiassi","cambiassi","cambiasse","cambiassimo","cambiaste","cambiassero"],aux:["avere","essere"],part:"cambiato",pf:["cambiato","cambiata","cambiati","cambiate"]},
    cantare:{en:"to sing",presente:["canti","canti","canti","cantiamo","cantiate","cantino"],imperfetto:["cantassi","cantassi","cantasse","cantassimo","cantaste","cantassero"],aux:"avere",part:"cantato",pf:["cantato","cantata","cantati","cantate"]},
    capire:{en:"to understand",presente:["capisca","capisca","capisca","capiamo","capiate","capiscano"],imperfetto:["capissi","capissi","capisse","capissimo","capiste","capissero"],aux:"avere",part:"capito",pf:["capito","capita","capiti","capite"]},
    chiamare:{en:"to call",presente:["chiami","chiami","chiami","chiamiamo","chiamiate","chiamino"],imperfetto:["chiamassi","chiamassi","chiamasse","chiamassimo","chiamaste","chiamassero"],aux:"avere",part:"chiamato",pf:["chiamato","chiamata","chiamati","chiamate"]},
    chiarire:{en:"to clarify",presente:["chiarisca","chiarisca","chiarisca","chiariamo","chiariate","chiariscano"],imperfetto:["chiarissi","chiarissi","chiarisse","chiarissimo","chiariste","chiarissero"],aux:"avere",part:"chiarito",pf:["chiarito","chiarita","chiariti","chiarite"]},
    cominciare:{en:"to begin",presente:["cominci","cominci","cominci","cominciamo","cominciate","comincino"],imperfetto:["cominciassi","cominciassi","cominciasse","cominciassimo","cominciaste","cominciassero"],aux:["avere","essere"],part:"cominciato",pf:["cominciato","cominciata","cominciati","cominciate"]},
    comportarsi:{en:"to behave",presente:["mi comporti","ti comporti","si comporti","ci comportiamo","vi comportiate","si comportino"],imperfetto:["mi comportassi","ti comportassi","si comportasse","ci comportassimo","vi comportaste","si comportassero"],aux:"essere",part:"comportato",pf:["comportato","comportata","comportati","comportate"],refl:1},
    comprare:{en:"to buy",presente:["compri","compri","compri","compriamo","compriate","comprino"],imperfetto:["comprassi","comprassi","comprasse","comprassimo","compraste","comprassero"],aux:"avere",part:"comprato",pf:["comprato","comprata","comprati","comprate"]},
    continuare:{en:"to continue",presente:["continui","continui","continui","continuiamo","continuiate","continuino"],imperfetto:["continuassi","continuassi","continuasse","continuassimo","continuaste","continuassero"],aux:["avere","essere"],part:"continuato",pf:["continuato","continuata","continuati","continuate"]},
    controllare:{en:"to check, to control",presente:["controlli","controlli","controlli","controlliamo","controlliate","controllino"],imperfetto:["controllassi","controllassi","controllasse","controllassimo","controllaste","controllassero"],aux:"avere",part:"controllato",pf:["controllato","controllata","controllati","controllate"]},
    credere:{en:"to believe",presente:["creda","creda","creda","crediamo","crediate","credano"],imperfetto:["credessi","credessi","credesse","credessimo","credeste","credessero"],aux:"avere",part:"creduto",pf:["creduto","creduta","creduti","credute"]},
    dormire:{en:"to sleep",presente:["dorma","dorma","dorma","dormiamo","dormiate","dormano"],imperfetto:["dormissi","dormissi","dormisse","dormissimo","dormiste","dormissero"],aux:"avere",part:"dormito",pf:["dormito","dormita","dormiti","dormite"]},
    entrare:{en:"to enter, to go in",presente:["entri","entri","entri","entriamo","entriate","entrino"],imperfetto:["entrassi","entrassi","entrasse","entrassimo","entraste","entrassero"],aux:"essere",part:"entrato",pf:["entrato","entrata","entrati","entrate"]},
    fermarsi:{en:"to stop (oneself)",presente:["mi fermi","ti fermi","si fermi","ci fermiamo","vi fermiate","si fermino"],imperfetto:["mi fermassi","ti fermassi","si fermasse","ci fermassimo","vi fermaste","si fermassero"],aux:"essere",part:"fermato",pf:["fermato","fermata","fermati","fermate"],refl:1},
    finire:{en:"to finish",presente:["finisca","finisca","finisca","finiamo","finiate","finiscano"],imperfetto:["finissi","finissi","finisse","finissimo","finiste","finissero"],aux:["avere","essere"],part:"finito",pf:["finito","finita","finiti","finite"]},
    firmare:{en:"to sign",presente:["firmi","firmi","firmi","firmiamo","firmiate","firmino"],imperfetto:["firmassi","firmassi","firmasse","firmassimo","firmaste","firmassero"],aux:"avere",part:"firmato",pf:["firmato","firmata","firmati","firmate"]},
    funzionare:{en:"to work, to function",presente:["funzioni","funzioni","funzioni","funzioniamo","funzioniate","funzionino"],imperfetto:["funzionassi","funzionassi","funzionasse","funzionassimo","funzionaste","funzionassero"],aux:"avere",part:"funzionato",pf:["funzionato","funzionata","funzionati","funzionate"]},
    giudicare:{en:"to judge",presente:["giudichi","giudichi","giudichi","giudichiamo","giudichiate","giudichino"],imperfetto:["giudicassi","giudicassi","giudicasse","giudicassimo","giudicaste","giudicassero"],aux:"avere",part:"giudicato",pf:["giudicato","giudicata","giudicati","giudicate"]},
    guardare:{en:"to watch / look",presente:["guardi","guardi","guardi","guardiamo","guardiate","guardino"],imperfetto:["guardassi","guardassi","guardasse","guardassimo","guardaste","guardassero"],aux:"avere",part:"guardato",pf:["guardato","guardata","guardati","guardate"]},
    imparare:{en:"to learn",presente:["impari","impari","impari","impariamo","impariate","imparino"],imperfetto:["imparassi","imparassi","imparasse","imparassimo","imparaste","imparassero"],aux:"avere",part:"imparato",pf:["imparato","imparata","imparati","imparate"]},
    influenzare:{en:"to influence",presente:["influenzi","influenzi","influenzi","influenziamo","influenziate","influenzino"],imperfetto:["influenzassi","influenzassi","influenzasse","influenzassimo","influenzaste","influenzassero"],aux:"avere",part:"influenzato",pf:["influenzato","influenzata","influenzati","influenzate"]},
    irrigidirsi:{en:"to stiffen, to tense up",presente:["mi irrigidisca","ti irrigidisca","si irrigidisca","ci irrigidiamo","vi irrigidiate","si irrigidiscano"],imperfetto:["mi irrigidissi","ti irrigidissi","si irrigidisse","ci irrigidissimo","vi irrigidiste","si irrigidissero"],aux:"essere",part:"irrigidito",pf:["irrigidito","irrigidita","irrigiditi","irrigidite"],refl:1},
    lavorare:{en:"to work",presente:["lavori","lavori","lavori","lavoriamo","lavoriate","lavorino"],imperfetto:["lavorassi","lavorassi","lavorasse","lavorassimo","lavoraste","lavorassero"],aux:"avere",part:"lavorato",pf:["lavorato","lavorata","lavorati","lavorate"]},
    mandare:{en:"to send",presente:["mandi","mandi","mandi","mandiamo","mandiate","mandino"],imperfetto:["mandassi","mandassi","mandasse","mandassimo","mandaste","mandassero"],aux:"avere",part:"mandato",pf:["mandato","mandata","mandati","mandate"]},
    mangiare:{en:"to eat",presente:["mangi","mangi","mangi","mangiamo","mangiate","mangino"],imperfetto:["mangiassi","mangiassi","mangiasse","mangiassimo","mangiaste","mangiassero"],aux:"avere",part:"mangiato",pf:["mangiato","mangiata","mangiati","mangiate"]},
    modificare:{en:"to modify",presente:["modifichi","modifichi","modifichi","modifichiamo","modifichiate","modifichino"],imperfetto:["modificassi","modificassi","modificasse","modificassimo","modificaste","modificassero"],aux:"avere",part:"modificato",pf:["modificato","modificata","modificati","modificate"]},
    organizzarsi:{en:"to get organised",presente:["mi organizzi","ti organizzi","si organizzi","ci organizziamo","vi organizziate","si organizzino"],imperfetto:["mi organizzassi","ti organizzassi","si organizzasse","ci organizzassimo","vi organizzaste","si organizzassero"],aux:"essere",part:"organizzato",pf:["organizzato","organizzata","organizzati","organizzate"],refl:1},
    parlare:{en:"to speak",presente:["parli","parli","parli","parliamo","parliate","parlino"],imperfetto:["parlassi","parlassi","parlasse","parlassimo","parlaste","parlassero"],aux:"avere",part:"parlato",pf:["parlato","parlata","parlati","parlate"]},
    partecipare:{en:"to take part, to participate",presente:["partecipi","partecipi","partecipi","partecipiamo","partecipiate","partecipino"],imperfetto:["partecipassi","partecipassi","partecipasse","partecipassimo","partecipaste","partecipassero"],aux:"avere",part:"partecipato",pf:["partecipato","partecipata","partecipati","partecipate"]},
    partire:{en:"to leave",presente:["parta","parta","parta","partiamo","partiate","partano"],imperfetto:["partissi","partissi","partisse","partissimo","partiste","partissero"],aux:"essere",part:"partito",pf:["partito","partita","partiti","partite"]},
    pensare:{en:"to think",presente:["pensi","pensi","pensi","pensiamo","pensiate","pensino"],imperfetto:["pensassi","pensassi","pensasse","pensassimo","pensaste","pensassero"],aux:"avere",part:"pensato",pf:["pensato","pensata","pensati","pensate"]},
    portare:{en:"to bring / carry",presente:["porti","porti","porti","portiamo","portiate","portino"],imperfetto:["portassi","portassi","portasse","portassimo","portaste","portassero"],aux:"avere",part:"portato",pf:["portato","portata","portati","portate"]},
    prepararsi:{en:"to get ready",presente:["mi prepari","ti prepari","si prepari","ci prepariamo","vi prepariate","si preparino"],imperfetto:["mi preparassi","ti preparassi","si preparasse","ci preparassimo","vi preparaste","si preparassero"],aux:"essere",part:"preparato",pf:["preparato","preparata","preparati","preparate"],refl:1},
    provare:{en:"to try",presente:["provi","provi","provi","proviamo","proviate","provino"],imperfetto:["provassi","provassi","provasse","provassimo","provaste","provassero"],aux:"avere",part:"provato",pf:["provato","provata","provati","provate"]},
    raccontare:{en:"to tell, to recount",presente:["racconti","racconti","racconti","raccontiamo","raccontiate","raccontino"],imperfetto:["raccontassi","raccontassi","raccontasse","raccontassimo","raccontaste","raccontassero"],aux:"avere",part:"raccontato",pf:["raccontato","raccontata","raccontati","raccontate"]},
    rallentare:{en:"to slow down",presente:["rallenti","rallenti","rallenti","rallentiamo","rallentiate","rallentino"],imperfetto:["rallentassi","rallentassi","rallentasse","rallentassimo","rallentaste","rallentassero"],aux:"avere",part:"rallentato",pf:["rallentato","rallentata","rallentati","rallentate"]},
    reagire:{en:"to react",presente:["reagisca","reagisca","reagisca","reagiamo","reagiate","reagiscano"],imperfetto:["reagissi","reagissi","reagisse","reagissimo","reagiste","reagissero"],aux:"avere",part:"reagito",pf:["reagito","reagita","reagiti","reagite"]},
    regolare:{en:"to regulate, to adjust",presente:["regoli","regoli","regoli","regoliamo","regoliate","regolino"],imperfetto:["regolassi","regolassi","regolasse","regolassimo","regolaste","regolassero"],aux:"avere",part:"regolato",pf:["regolato","regolata","regolati","regolate"]},
    respirare:{en:"to breathe",presente:["respiri","respiri","respiri","respiriamo","respiriate","respirino"],imperfetto:["respirassi","respirassi","respirasse","respirassimo","respiraste","respirassero"],aux:"avere",part:"respirato",pf:["respirato","respirata","respirati","respirate"]},
    restare:{en:"to stay, to remain",presente:["resti","resti","resti","restiamo","restiate","restino"],imperfetto:["restassi","restassi","restasse","restassimo","restaste","restassero"],aux:"essere",part:"restato",pf:["restato","restata","restati","restate"]},
    ricominciare:{en:"to start again",presente:["ricominci","ricominci","ricominci","ricominciamo","ricominciate","ricomincino"],imperfetto:["ricominciassi","ricominciassi","ricominciasse","ricominciassimo","ricominciaste","ricominciassero"],aux:["avere","essere"],part:"ricominciato",pf:["ricominciato","ricominciata","ricominciati","ricominciate"]},
    rinunciare:{en:"to give up, to renounce",presente:["rinunci","rinunci","rinunci","rinunciamo","rinunciate","rinuncino"],imperfetto:["rinunciassi","rinunciassi","rinunciasse","rinunciassimo","rinunciaste","rinunciassero"],aux:"avere",part:"rinunciato",pf:["rinunciato","rinunciata","rinunciati","rinunciate"]},
    ripartire:{en:"to set off again, to leave again",presente:["riparta","riparta","riparta","ripartiamo","ripartiate","ripartano"],imperfetto:["ripartissi","ripartissi","ripartisse","ripartissimo","ripartiste","ripartissero"],aux:"essere",part:"ripartito",pf:["ripartito","ripartita","ripartiti","ripartite"]},
    ripetere:{en:"to repeat",presente:["ripeta","ripeta","ripeta","ripetiamo","ripetiate","ripetano"],imperfetto:["ripetessi","ripetessi","ripetesse","ripetessimo","ripeteste","ripetessero"],aux:"avere",part:"ripetuto",pf:["ripetuto","ripetuta","ripetuti","ripetute"]},
    riposare:{en:"to rest",presente:["riposi","riposi","riposi","riposiamo","riposiate","riposino"],imperfetto:["riposassi","riposassi","riposasse","riposassimo","riposaste","riposassero"],aux:"avere",part:"riposato",pf:["riposato","riposata","riposati","riposate"]},
    risparmiare:{en:"to save (money, effort)",presente:["risparmi","risparmi","risparmi","risparmiamo","risparmiate","risparmino"],imperfetto:["risparmiassi","risparmiassi","risparmiasse","risparmiassimo","risparmiaste","risparmiassero"],aux:"avere",part:"risparmiato",pf:["risparmiato","risparmiata","risparmiati","risparmiate"]},
    rispettare:{en:"to respect",presente:["rispetti","rispetti","rispetti","rispettiamo","rispettiate","rispettino"],imperfetto:["rispettassi","rispettassi","rispettasse","rispettassimo","rispettaste","rispettassero"],aux:"avere",part:"rispettato",pf:["rispettato","rispettata","rispettati","rispettate"]},
    salutare:{en:"to greet, to say hello",presente:["saluti","saluti","saluti","salutiamo","salutiate","salutino"],imperfetto:["salutassi","salutassi","salutasse","salutassimo","salutaste","salutassero"],aux:"avere",part:"salutato",pf:["salutato","salutata","salutati","salutate"]},
    salvare:{en:"to save, to rescue",presente:["salvi","salvi","salvi","salviamo","salviate","salvino"],imperfetto:["salvassi","salvassi","salvasse","salvassimo","salvaste","salvassero"],aux:"avere",part:"salvato",pf:["salvato","salvata","salvati","salvate"]},
    seguire:{en:"to follow",presente:["segua","segua","segua","seguiamo","seguiate","seguano"],imperfetto:["seguissi","seguissi","seguisse","seguissimo","seguiste","seguissero"],aux:"avere",part:"seguito",pf:["seguito","seguita","seguiti","seguite"]},
    sembrare:{en:"to seem",presente:["sembri","sembri","sembri","sembriamo","sembriate","sembrino"],imperfetto:["sembrassi","sembrassi","sembrasse","sembrassimo","sembraste","sembrassero"],aux:"essere",part:"sembrato",pf:["sembrato","sembrata","sembrati","sembrate"]},
    sentire:{en:"to feel / hear",presente:["senta","senta","senta","sentiamo","sentiate","sentano"],imperfetto:["sentissi","sentissi","sentisse","sentissimo","sentiste","sentissero"],aux:"avere",part:"sentito",pf:["sentito","sentita","sentiti","sentite"]},
    sentirsi:{en:"to feel",presente:["mi senta","ti senta","si senta","ci sentiamo","vi sentiate","si sentano"],imperfetto:["mi sentissi","ti sentissi","si sentisse","ci sentissimo","vi sentiste","si sentissero"],aux:"essere",part:"sentito",pf:["sentito","sentita","sentiti","sentite"],refl:1},
    sopportare:{en:"to bear, to put up with",presente:["sopporti","sopporti","sopporti","sopportiamo","sopportiate","sopportino"],imperfetto:["sopportassi","sopportassi","sopportasse","sopportassimo","sopportaste","sopportassero"],aux:"avere",part:"sopportato",pf:["sopportato","sopportata","sopportati","sopportate"]},
    sperare:{en:"to hope",presente:["speri","speri","speri","speriamo","speriate","sperino"],imperfetto:["sperassi","sperassi","sperasse","sperassimo","speraste","sperassero"],aux:"avere",part:"sperato",pf:["sperato","sperata","sperati","sperate"]},
    sperimentare:{en:"to experiment, to try out",presente:["sperimenti","sperimenti","sperimenti","sperimentiamo","sperimentiate","sperimentino"],imperfetto:["sperimentassi","sperimentassi","sperimentasse","sperimentassimo","sperimentaste","sperimentassero"],aux:"avere",part:"sperimentato",pf:["sperimentato","sperimentata","sperimentati","sperimentate"]},
    spiegare:{en:"to explain",presente:["spieghi","spieghi","spieghi","spieghiamo","spieghiate","spieghino"],imperfetto:["spiegassi","spiegassi","spiegasse","spiegassimo","spiegaste","spiegassero"],aux:"avere",part:"spiegato",pf:["spiegato","spiegata","spiegati","spiegate"]},
    studiare:{en:"to study",presente:["studi","studi","studi","studiamo","studiate","studino"],imperfetto:["studiassi","studiassi","studiasse","studiassimo","studiaste","studiassero"],aux:"avere",part:"studiato",pf:["studiato","studiata","studiati","studiate"]},
    telefonare:{en:"to phone",presente:["telefoni","telefoni","telefoni","telefoniamo","telefoniate","telefonino"],imperfetto:["telefonassi","telefonassi","telefonasse","telefonassimo","telefonaste","telefonassero"],aux:"avere",part:"telefonato",pf:["telefonato","telefonata","telefonati","telefonate"]},
    tornare:{en:"to return, to go back",presente:["torni","torni","torni","torniamo","torniate","tornino"],imperfetto:["tornassi","tornassi","tornasse","tornassimo","tornaste","tornassero"],aux:"essere",part:"tornato",pf:["tornato","tornata","tornati","tornate"]},
    trovare:{en:"to find",presente:["trovi","trovi","trovi","troviamo","troviate","trovino"],imperfetto:["trovassi","trovassi","trovasse","trovassimo","trovaste","trovassero"],aux:"avere",part:"trovato",pf:["trovato","trovata","trovati","trovate"]},
  },
  AUX:{
    avere:{presente:["abbia","abbia","abbia","abbiamo","abbiate","abbiano"],
           imperfetto:["avessi","avessi","avesse","avessimo","aveste","avessero"]},
    essere:{presente:["sia","sia","sia","siamo","siate","siano"],
            imperfetto:["fossi","fossi","fosse","fossimo","foste","fossero"]}
  },
  PRON:["mi","ti","si","ci","vi","si"],
  /* Compound tenses are built at playback time rather than stored: auxiliary
     plus participle, the participle agreeing only when the auxiliary is essere.
     "display" shows both genders and both auxiliaries where they exist;
     "speech" picks one of each, because "riuscito slash a" is not a sentence. */
  build(v,t,mode){
    let d=this.V[v];
    if(!d)return[];
    if(t==="presente"||t==="imperfetto")return d[t];
    let slot=t==="passato"?"presente":"imperfetto",
        auxes=Array.isArray(d.aux)?d.aux:[d.aux],
        use=mode==="speech"?auxes.slice(0,1):auxes;
    return [0,1,2,3,4,5].map(i=>use.map(a=>{
      let pp;
      if(a==="avere")pp=d.part;
      else if(mode==="speech")pp=i<3?d.pf[0]:d.pf[2];
      else pp=(i<3?d.pf[0]+"/"+d.pf[1].slice(-1):d.pf[2]+"/"+d.pf[3].slice(-1));
      return (d.refl?this.PRON[i]+" ":"")+this.AUX[a][slot][i]+" "+pp;
    }).join(" / "));
  },
  forms(v,t){return this.build(v,t,"display");},
  spoken(v,t){return this.build(v,t,"speech").join(", ");},
  line(v,t){return this.forms(v,t).join(", ");},
  scope(){let s=$("verbScope").value;if(s==="group")return Library.group();if(s==="chapter")return Library.chapter();if(s==="book")return App.sentences.filter(x=>x.book==App.cur.book);return App.sentences;},
  detect(texts){
    let all=texts.join(" ").toLowerCase(),found=new Set();
    Object.keys(this.V).forEach(v=>{
      let d=this.V[v];
      // Check infinitive
      if(new RegExp("\\b"+v+"\\b","i").test(all))found.add(v);
      // Check past participle (catches compound tenses in the corpus)
      if(new RegExp("\\b"+d.part+"\\b","i").test(all))found.add(v);
      // Check subjunctive presente and imperfetto forms
      [...this.forms(v,"presente"),...this.forms(v,"imperfetto")].forEach(f=>{
        let simple=f.split(" ")[0];
        if(new RegExp("\\b"+simple+"\\b","i").test(all))found.add(v);
      });
    });
    return[...found].sort(Util.nat);
  },
  selectedTense(){return this.tenseOrder[App.verbTenseIndex]||this.tenseOrder[0];},
  /* Infinitive-shaped words in view that the table cannot conjugate. A rough
     heuristic, so it is reported as "possibly", never as fact. */
  STOP:new Set(["carattere","genere","mestiere","bicchiere","cameriere","celebre","sincere"]),
  unknown(texts,detected){
    let all=" "+texts.join(" ").toLowerCase()+" ",known=new Set(Object.keys(this.V)),seen=new Set(detected),out=[];
    let re=/[a-zà-ùéìòù]{5,}(?:are|ere|ire)/g,m;
    while((m=re.exec(all))){
      let w=m[0];
      if(known.has(w)||seen.has(w)||this.STOP.has(w)||out.includes(w))continue;
      out.push(w);
      if(out.length>=6)break;
    }
    return out;
  },
  render(){
    if(!$("verbSel"))return;
    let old=$("verbSel").value,detected=this.detect(this.scope().map(s=>s.italian));
    let verbs=detected.length?detected:Object.keys(this.V).sort(Util.nat);
    UI.fill($("verbSel"),verbs,verbs.includes(old)?old:verbs[0]);
    let texts=this.scope().map(x=>x.italian),
        missing=this.unknown(texts,detected),
        total=Object.keys(this.V).length,
        note=missing.length
          ? `<div class="small mt">Possibly also here, but not in the ${total}-verb conjugation table: `+
            missing.map(v=>`<em>${Util.esc(v)}</em>`).join(", ")+`. The drill can only conjugate verbs it holds tables for.</div>`
          : "";
    if(detected.length){
      $("detected").innerHTML=`Detected in ${this.scopeName()} — ${detected.length} of the ${total} verbs the table holds: `
        +detected.map(v=>`<span class="pill">${v}</span>`).join(" ")+note;
      $("detected").className="status oktxt";
    }else{
      $("detected").innerHTML=`No verbs detected in ${this.scopeName()} — showing all ${verbs.length} available.`+note;
      $("detected").className="status warntxt";
    }
    this.renderCrumb();
    this.renderView();
  },
  /* Which sentences the detection looked at, in words rather than a code. */
  scopeName(){
    let sc=$("verbScope")?$("verbScope").value:"chapter",
        parts=Titles.crumb(App.cur.book,App.cur.chapter,App.cur.group),
        name=p=>p.title?p.label+" · "+p.title:p.label;
    if(sc==="all")return "the whole library";
    if(sc==="book")return parts[0]?name(parts[0]):"this book";
    if(sc==="chapter")return parts[1]?name(parts[1]):"this chapter";
    return parts[2]?name(parts[2]):"this group";
  },

  /* "Verb drill" told you nothing. This says what you are actually drilling. */
  renderCrumb(){
    let el=$("verbCrumb");if(!el)return;
    let v=$("verbSel")?$("verbSel").value:"",d=this.V[v];
    if(!d){el.innerHTML='<span class="crumb-empty">Nothing to drill yet</span>';return;}
    el.innerHTML=
      `<span class="crumb-part"><span class="crumb-label">Verb drill</span></span>`+
      `<span class="crumb-sep" aria-hidden="true">›</span>`+
      `<span class="crumb-part here"><span class="crumb-label">${Util.esc(v)}</span>`+
      `<span class="crumb-title">${Util.esc(d.en)}</span></span>`+
      `<span class="crumb-sep" aria-hidden="true">›</span>`+
      `<span class="crumb-part"><span class="crumb-label">${Util.esc(this.names[this.selectedTense()])}</span></span>`;
  },

  renderView(){let v=$("verbSel").value,d=this.V[v];if(!d){$("verbView").innerHTML="";return;}$("verbView").innerHTML=`<p class="verb-ref">Reference form <strong>${Util.esc(this.forms(v,"presente")[0])}</strong></p><div class="tenseGrid">${this.tenseOrder.map(t=>`<div class="tenseCard" id="tense_${t}"><h3>${this.names[t]}</h3><div class="formsLine">${Util.esc(this.line(v,t))}</div></div>`).join("")}</div>`;this.highlight();},
  highlight(){document.querySelectorAll(".tenseCard").forEach(x=>x.classList.remove("active"));let c=$("tense_"+this.selectedTense());if(c)c.classList.add("active");this.renderCrumb();},
  provider(){let mode=$("verbMode").value,verbs=[...$("verbSel").options].map(o=>o.value),vi=$("verbSel").selectedIndex<0?0:$("verbSel").selectedIndex,ti=App.verbTenseIndex;if(mode==="once")return this.tenseProvider(verbs,vi,ti,false);if(mode==="looptense")return this.tenseProvider(verbs,vi,ti,true);if(mode==="loopverb")return this.verbProvider(verbs,vi,ti,true,false);if(mode==="nextverb")return this.verbProvider(verbs,vi,ti,false,false);if(mode==="loopverbs")return this.verbProvider(verbs,vi,ti,false,true);return this.tenseProvider(verbs,vi,ti,false);},
  tenseProvider(verbs,vi,ti,loop){let done=false;return{next:()=>{if(done&&!loop)return null;done=true;let v=verbs[vi],t=this.tenseOrder[ti];return{text:this.spoken(v,t),repeat:PlaybackControls.repeat(),label:`${v} — ${this.names[t]}`,onBefore:()=>{$("verbSel").selectedIndex=vi;App.verbTenseIndex=ti;this.renderView();}};}};},
  verbProvider(verbs,vi,ti,loopVerb,loopVerbs){let curV=vi,curT=ti;return{next:()=>{if(curV>=verbs.length){if(loopVerbs)curV=0;else return null;}let v=verbs[curV],t=this.tenseOrder[curT];let snapV=curV,snapT=curT;let item={text:this.spoken(v,t),repeat:PlaybackControls.repeat(),label:`${v} — ${this.names[t]}`,onBefore:()=>{$("verbSel").selectedIndex=snapV;App.verbTenseIndex=snapT;this.renderView();}};curT++;if(curT>=this.tenseOrder.length){curT=0;if(!loopVerb)curV++;}return item;}};},
  toggle(){VerbPlayer.toggle(()=>this.provider());},
  restart(){if(VerbPlayer.playing)VerbPlayer.restart(()=>this.provider());},
  moveTense(delta){App.verbTenseIndex+=delta;if(App.verbTenseIndex<0)App.verbTenseIndex=this.tenseOrder.length-1;if(App.verbTenseIndex>=this.tenseOrder.length)App.verbTenseIndex=0;this.renderView();if(VerbPlayer.playing)this.restart();}
};

const Editor={sentence:null,open(s){this.sentence=s;$("editItalian").value=s.italian||"";$("editEnglish").value=s.english||"";$("editModal").style.display="flex";setTimeout(()=>$("editItalian").focus(),50);},close(){$("editModal").style.display="none";this.sentence=null;},async save(){let s=this.sentence;if(!s)return;let it=$("editItalian").value.trim(),en=$("editEnglish").value.trim();if(!it){alert("Italian sentence cannot be empty.");return;}s.italian=it;s.english=en;await Storage.put(SS,s);this.close();await Library.refresh();UI.status("Sentence updated.","oktxt");}};

const Importer={
  text:"",
  /* A sentence's place in the corpus — book, chapter and position — is its
     identity. Same place and same words is the same sentence, and importing it
     again must not give you two. Same place, different words is a correction:
     it belongs in that slot, replacing what is there, not beside it. */
  slot(s){return [String(s.book),String(s.chapter),String(s.order)].join("|");},
  words(s){return String(s.italian||"").trim().replace(/\s+/g," ").toLowerCase();},
  split(items){
    let held=new Map();App.sentences.forEach(s=>held.set(this.slot(s),s));
    let seen=new Set(),fresh=[],dupes=[],changed=[];
    items.forEach(s=>{
      let k=this.slot(s);
      if(seen.has(k)){dupes.push(s);return;}
      seen.add(k);
      let was=held.get(k);
      if(!was){fresh.push(s);return;}
      if(this.words(was)===this.words(s)&&
         String(was.english||"").trim()===String(s.english||"").trim()){dupes.push(s);return;}
      /* Keep the learner's own marks; only the corpus columns are replaced. */
      changed.push({...was,italian:s.italian,english:s.english,
        audioText:s.audioText!==undefined?s.audioText:was.audioText});
    });
    return {fresh,dupes,changed};},
  open(){App.analysed=[];this.text="";$("importSummary").textContent="No CSV analysed yet.";$("importSummary").className="status";$("importPreview").innerHTML="";$("importPreviewed").disabled=false;$("importPreviewed").textContent="Import";$("importModal").style.display="flex";},
  defs(){return{book:$("defaultBook").value,chapter:$("defaultChapter").value};},
  async fileText(){let f=$("csvFile").files[0];return f?await f.text():"";},
  preview(items,text){
    App.analysed=items;this.text=text||"";
    let {fresh,dupes,changed}=this.split(items);
    let msg,cls;
    if(!items.length){msg="No sentences detected.";cls="dangertxt";}
    else if(!dupes.length&&!changed.length){msg=`Detected ${items.length} sentences.`;cls="oktxt";}
    else{
      let parts=[`Detected ${items.length} sentences.`];
      if(dupes.length)parts.push(`${dupes.length} ${dupes.length===1?"is":"are"} already in your library, word for word, and will be skipped.`);
      if(changed.length)parts.push(`${changed.length} ${changed.length===1?"has":"have"} changed since you imported them and will be updated in place.`);
      parts.push(fresh.length?`${fresh.length} ${fresh.length===1?"is":"are"} new and will be added.`:"Nothing new will be added.");
      msg=parts.join(" ");cls=fresh.length||changed.length?"warntxt":"warntxt";
    }
    $("importSummary").textContent=msg;
    $("importSummary").className="status "+cls;
    $("importPreviewed").disabled=!(fresh.length||changed.length);
    $("importPreviewed").textContent=
      !fresh.length&&changed.length?`Update the ${changed.length} changed one(s)`
      :fresh.length&&(dupes.length||changed.length)?`Import the ${fresh.length} new one(s)`
      :"Import";
    let sm=items.slice(0,12);
    $("importPreview").innerHTML=items.length?`<table><thead><tr><th>Book</th><th>Chapter</th><th>#</th><th>Italian</th><th>English</th></tr></thead><tbody>${sm.map(s=>`<tr><td>${Util.esc(s.book)}</td><td>${Util.esc(s.chapter)}</td><td>${s.order}</td><td>${Util.esc(s.italian)}</td><td>${Util.esc(s.english)}</td></tr>`).join("")}</tbody></table>`:"";
  },
  async import(){
    if(!App.analysed.length){alert("Analyse first.");return;}
    let {fresh,dupes,changed}=this.split(App.analysed);
    let learned=this.text?Titles.harvest(this.text,this.defs()):0;
    if(!fresh.length&&!changed.length){
      $("importSummary").textContent="Nothing added — every sentence in that file is already in your library, word for word."
        +(learned?` ${learned} book and chapter name(s) were picked up.`:"");
      $("importSummary").className="status warntxt";
      await Library.refresh();
      return;
    }
    if(changed.length)await Storage.putMany(changed);
    if(fresh.length)await Storage.addMany(fresh);
    let s=fresh[0]||changed[0];
    App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:0};
    App.analysed=[];this.text="";
    $("importModal").style.display="none";
    await Library.refresh();
    UI.status([fresh.length?`Imported ${fresh.length} sentence(s).`:"",
      changed.length?`Updated ${changed.length} that had changed.`:"",
      dupes.length?`Skipped ${dupes.length} already in your library.`:"",
      learned?`${learned} book and chapter name(s) picked up.`:""]
      .filter(Boolean).join(" "),"oktxt");
  },
  /* Clearing up a library that was imported twice.

     Two kinds of duplicate exist, and the second is the reason this had to be
     widened. The first is the same sentence in the same place: two imports of
     the same file. The second is the same sentence in the same chapter at a
     DIFFERENT place — which happens when two files number their Group column
     differently, one running on across the book (11, 12, 13…) and one
     restarting at 1 in every chapter. Keyed on position, the second kind is
     invisible: every sentence is there twice under two numbering schemes, so
     the chapter quietly holds twice as many groups as it should. */
  async dedupe(){
    let bySlot=new Set(), byText=new Map(), kill=[], slotDupes=0, textDupes=0;
    /* Earliest position wins, so the surviving numbering is the lower one. */
    let ordered=App.sentences.slice().sort((a,b)=>(a.order||0)-(b.order||0));
    for(let s of ordered){
      let slotKey=this.slot(s)+"|"+this.words(s);
      if(bySlot.has(slotKey)){kill.push(s);slotDupes++;continue;}
      bySlot.add(slotKey);
      let textKey=[String(s.book),String(s.chapter),this.words(s)].join("|");
      if(byText.has(textKey)){kill.push(s);textDupes++;continue;}
      byText.set(textKey,s);
    }
    if(!kill.length){UI.status("No duplicated sentences found.","oktxt");return 0;}
    let what=[];
    if(slotDupes)what.push(`${slotDupes} in the same place`);
    if(textDupes)what.push(`${textDupes} the same words in a different group — two files numbering their groups differently`);
    if(!confirm(`Found ${kill.length} duplicated sentence(s): ${what.join("; ")}.\n\n`
      +`Remove them? The earliest copy of each is kept, along with any bookmark or note from the copy being removed.`))return 0;
    /* Do not lose a bookmark or a note just because it was put on the copy
       being removed. */
    let keep=new Map();
    byText.forEach((s,k)=>keep.set(k,s));
    let updates=[];
    for(let s of kill){
      let k=[String(s.book),String(s.chapter),this.words(s)].join("|"),
          survivor=keep.get(k);
      if(!survivor)continue;
      let changed=false;
      if(s.bookmarked&&!survivor.bookmarked){survivor.bookmarked=true;changed=true;}
      if(s.difficult&&!survivor.difficult){survivor.difficult=true;changed=true;}
      if(s.notes&&!String(survivor.notes||"").trim()){survivor.notes=s.notes;changed=true;}
      if(changed&&!updates.includes(survivor))updates.push(survivor);
    }
    if(updates.length)await Storage.putMany(updates);
    await Storage.deleteMany(kill.map(s=>s.id));
    await Library.refresh();
    UI.status(`Removed ${kill.length} duplicated sentence(s).`
      +(textDupes?` ${textDupes} of them were the same sentence filed under a different group number.`:""),"oktxt");
    return kill.length;
  },
  /* Read only BookTitle / ChapterTitle and apply them to sentences already held. */
  async titlesOnly(){
    let text=this.text||await this.fileText()||$("pasteCsv").value;
    if(!String(text).trim()){UI.status("Choose a CSV file or paste one first.","warntxt");
      $("importSummary").textContent="Choose a CSV file or paste one first.";$("importSummary").className="status warntxt";return;}
    let learned=Titles.harvest(text,this.defs());
    $("importSummary").textContent=learned
      ? `Picked up ${learned} book and chapter name(s). Nothing was added or duplicated.`
      : "No BookTitle or ChapterTitle columns found in that file.";
    $("importSummary").className="status "+(learned?"oktxt":"warntxt");
    if(learned){$("importModal").style.display="none";UI.renderAll();UI.status(`Updated ${learned} name(s).`,"oktxt");}
  }
};

/* Manage library — import, export, naming and the destructive action. */
const Manage={
  render(){
    let host=$("bookTitles");if(!host)return;
    let books=Util.uniq(App.sentences.map(s=>s.book)).sort(Util.nat);
    if(!books.length){host.innerHTML='<p class="small">No books yet.</p>';return;}
    host.innerHTML="";
    books.forEach(b=>{
      let chapters=Util.uniq(App.sentences.filter(s=>s.book==b).map(s=>s.chapter)).length;
      let named=Util.uniq(App.sentences.filter(s=>s.book==b).map(s=>s.chapter)).filter(c=>Titles.chapter(b,c)).length;
      let wrap=document.createElement("div");
      wrap.className="bookrow";
      wrap.innerHTML=`<label>${Util.esc(/^\d+$/.test(String(b))?"Book "+b:String(b))}</label>`+
        `<input type="text" value="${Util.esc(Titles.book(b))}" placeholder="e.g. Present Subjunctive" data-book="${Util.esc(b)}">`+
        `<span class="small">${named} of ${chapters} chapter name(s) known</span>`;
      let input=wrap.querySelector("input");
      input.onchange=()=>{Titles.setBook(b,input.value);UI.renderAll();};
      host.appendChild(wrap);
    });
  }
};

const Nav={nextGroup(render=true){let gs=Util.uniq(Library.chapter().map(Util.gnum)).sort((a,b)=>a-b),i=gs.indexOf(Number(App.cur.group));if(i>=0&&i<gs.length-1){App.cur.group=gs[i+1];App.cur.index=0;if(render)UI.renderAll();if(MainPlayer.playing)SentenceController.restart();return true;}return false;},prevGroup(last=false){let gs=Util.uniq(Library.chapter().map(Util.gnum)).sort((a,b)=>a-b),i=gs.indexOf(Number(App.cur.group));if(i>0){App.cur.group=gs[i-1];App.cur.index=last?Library.group().length-1:0;UI.renderAll();if(MainPlayer.playing)SentenceController.restart();return true;}return false;}};

const Preloader={
  running:false,cancelled:false,
  sentences(){
    let s=$("preloadScope").value;
    if(s==="group")return Library.group();
    if(s==="chapter")return Library.chapter();
    if(s==="book")return App.sentences.filter(x=>x.book===App.cur.book);
    return App.sentences;
  },
  _setAllPreloadBtns(disabled){
    ["preloadBtn","verbPreloadBtn"].forEach(id=>{let el=$(id);if(el)el.disabled=disabled;});
  },
  async _runLoop(items,labelFn,cancelBtnId){
    let total=items.length,done=0,fetched=0,skipped=0,failed=0;
    for(let item of items){
      if(this.cancelled)break;
      UI.status(labelFn(done+1,total));
      try{
        let result=await Speech.prefetch(item);
        if(result==="cached")skipped++;
        else if(result==="fetched")fetched++;
      }catch(e){
        if(this.cancelled)break;
        failed++;
      }
      done++;
      if(!this.cancelled&&done<total)await Util.sleep(400);
    }
    this.running=false;
    this._setAllPreloadBtns(false);
    if($(cancelBtnId))$(cancelBtnId).classList.add("hidden");
    if(this.cancelled){UI.status(`Cancelled. ${fetched} downloaded, ${skipped} already cached.`,"warntxt");}
    else{UI.status(`Done: ${fetched} downloaded, ${skipped} already cached${failed?", "+failed+" failed":""}.`,"oktxt");}
  },
  async start(){
    if(this.running)return;
    if($("voiceMode").value!=="eleven"){UI.status("Switch voice to ElevenLabs to pre-download audio.","warntxt");return;}
    let api=$("apiKey").value.trim(),vid=$("voiceId").value.trim();
    if(!api||!vid){UI.status("Enter ElevenLabs API key and Voice ID first.","warntxt");return;}
    this.running=true;this.cancelled=false;
    this._setAllPreloadBtns(true);
    $("preloadCancel").classList.remove("hidden");
    let texts=this.sentences().map(s=>s.italian);
    await this._runLoop(texts,(n,t)=>`Pre-downloading sentence ${n} of ${t}…`,"preloadCancel");
  },
  async startVerbs(){
    if(this.running)return;
    if($("voiceMode").value!=="eleven"){UI.status("Switch voice to ElevenLabs to pre-download audio.","warntxt");return;}
    let api=$("apiKey").value.trim(),vid=$("voiceId").value.trim();
    if(!api||!vid){UI.status("Enter ElevenLabs API key and Voice ID first.","warntxt");return;}
    let verbs=[...$("verbSel").options].map(o=>o.value);
    let texts=[];
    verbs.forEach(v=>Verb.tenseOrder.forEach(t=>{let line=Verb.spoken(v,t);if(line.trim())texts.push(line);}));
    if(!texts.length){UI.status("No verb audio to download.","warntxt");return;}
    this.running=true;this.cancelled=false;
    this._setAllPreloadBtns(true);
    $("verbPreloadCancel").classList.remove("hidden");
    await this._runLoop(texts,(n,t)=>`Pre-downloading verb audio ${n} of ${t}…`,"verbPreloadCancel");
  },
  cancel(){
    this.cancelled=true;
    if(App.elevenAbort){try{App.elevenAbort.abort();}catch(e){}App.elevenAbort=null;}
  }
};

function toCSV(){let h=["book","chapter","order","italian","english","bookmarked","difficult","notes"];return h.join(",")+"\n"+App.sentences.map(s=>h.map(k=>`"${String(s[k]??"").replace(/"/g,'""')}"`).join(",")).join("\n");}
function download(name,text,type){let b=new Blob([text],{type}),a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href);}


const WakeLock={
  lock:null,
  async request(){
    if(!('wakeLock' in navigator))return;
    try{this.lock=await navigator.wakeLock.request('screen');this.lock.addEventListener('release',()=>{this.lock=null;});}catch(e){}
  },
  release(){if(this.lock){try{this.lock.release();}catch(e){}this.lock=null;}},
  async reacquire(){if(!this.lock&&(MainPlayer.playing||VerbPlayer.playing||GenPlayer.playing))await this.request();}
};

const MediaSessionMgr={
  init(){
    if(!('mediaSession' in navigator))return;
    navigator.mediaSession.setActionHandler('play',()=>{if(!MainPlayer.playing&&App.playbackContext!=='verb')SentenceController.toggle();else if(!VerbPlayer.playing)Verb.toggle();});
    navigator.mediaSession.setActionHandler('pause',()=>{if(MainPlayer.playing)SentenceController.toggle();else if(VerbPlayer.playing)Verb.toggle();});
    navigator.mediaSession.setActionHandler('stop',()=>{MainPlayer.stop('Stopped.');VerbPlayer.stop('Stopped.');});
  },
  update(title,sub){
    if(!('mediaSession' in navigator))return;
    try{navigator.mediaSession.metadata=new MediaMetadata({title:title||'Italian Shadowing Studio',artist:sub||''});}catch(e){}
  },
  playing(){if('mediaSession' in navigator)try{navigator.mediaSession.playbackState='playing';}catch(e){}},
  paused(){if('mediaSession' in navigator)try{navigator.mediaSession.playbackState='paused';}catch(e){}},
  none(){if('mediaSession' in navigator)try{navigator.mediaSession.playbackState='none';}catch(e){}}
};

/* ── Canonical corpus CSV template ───────────────────────────────────────────
   Same column set as the Italian Subjunctive Master Corpus exports, so that
   anything generated inside the app is written into the identical shape and
   then read back through the ordinary CSV import path.                        */
const CSVTemplate={
  columns:["ID","Book","Chapter","ChapterTitle","Group","Item","Italian","English","AudioText","TranslationStatus","SourceFile","Notes"],
  cell(v){let s=String(v??"");return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;},
  build(rows){return this.columns.join(",")+"\n"+rows.map(r=>this.columns.map(c=>this.cell(r[c])).join(",")).join("\n")+"\n";},
  /* list: [{italian,english}] — opts: {book,chapter,chapterTitle,idPrefix,startOrder,sourceFile,notes} */
  rows(list,opts){
    let start=Number(opts.startOrder)||1;
    return list.map((s,i)=>{
      let order=start+i,group=Math.floor((order-1)/10)+1,item=((order-1)%10)+1;
      return{
        ID:`${opts.idPrefix}-${Util.pad(group)}-${Util.pad(item)}`,
        Book:opts.book,Chapter:opts.chapter,ChapterTitle:opts.chapterTitle||opts.chapter,
        Group:group,Item:item,
        Italian:s.italian,English:s.english||"",AudioText:s.italian,
        TranslationStatus:s.english?"translated":"untranslated",
        SourceFile:opts.sourceFile||"",Notes:opts.notes||""
      };
    });
  }
};

const GEN_BOOK="Generated";

const Generator={
  running:false,cancelled:false,abort:null,
  items:[],rows:[],csv:"",meta:null,lastModel:"",index:0,saved:false,
  relayUrl(){return ($("relayUrl")?$("relayUrl").value:"").trim().replace(/\/+$/,"");},
  token(){return ($("relayToken")?$("relayToken").value:"").trim();},
  status(msg,cls=""){let el=$("genStatus");if(el){el.textContent=msg;el.className="status "+cls;}},
  setBusy(b){
    ["genBtn","genSave","genDownload"].forEach(id=>{let el=$(id);if(el)el.disabled=b;});
    let c=$("genCancel");if(c)c.classList.toggle("hidden",!b);
    if(!b)this.setOutputButtons(this.items.length>0);
  },
  setOutputButtons(on){
    let save=$("genSave");
    if(save){save.disabled=!on||this.saved;save.textContent=this.saved?"Saved ✓":"Save to library";}
    let dl=$("genDownload");if(dl)dl.disabled=!on;
    let panel=$("genPlayback");if(panel)panel.classList.toggle("hidden",!on);
  },

  /* The relay builds the prompt and holds the Google key; the app only asks. */
  async batch(o){
    const controller=new AbortController();
    this.abort=controller;
    let timer=setTimeout(()=>controller.abort(),90000),r;
    try{
      r=await fetch(this.relayUrl(),{
        method:"POST",
        headers:{"Content-Type":"application/json","X-App-Token":this.token()},
        body:JSON.stringify({word:o.word,count:o.batch,tense:o.tense,register:o.register,english:o.english,avoid:o.avoid}),
        signal:controller.signal
      });
    }catch(e){
      if(e&&e.name==="AbortError"){if(this.cancelled)return[];throw new Error("The generator took too long to answer.");}
      throw new Error("Could not reach your generator. Check the address in Settings, and your internet connection.");
    }finally{clearTimeout(timer);if(this.abort===controller)this.abort=null;}

    let data=null;
    try{data=await r.json();}catch(e){}
    if(!r.ok){
      if(r.status===401)throw new Error("The passphrase in Settings does not match the one on your generator.");
      if(r.status===403)throw new Error("Your generator is set up for a different web address than this one.");
      if(r.status===429)throw new Error(data?.error||"Today's free allowance is used up. Try again later.");
      if(r.status===500)throw new Error(data?.error||"Your generator is missing one of its settings.");
      throw new Error(data?.error||("The generator returned an error ("+r.status+")."));
    }
    if(data?.model)this.lastModel=data.model;
    return Array.isArray(data?.sentences)?data.sentences.filter(x=>x&&x.italian):[];
  },

  async start(){
    if(this.running)return;
    let word=($("genWord").value||"").trim();
    if(!word){this.status("Enter the word or expression you want to shadow.","warntxt");return;}
    if(!this.relayUrl()||!this.token()){this.status("Add your generator address and passphrase in Settings first.","warntxt");return;}
    let total=Number($("genCount").value)||20,
        tense=$("genTense").value,
        register=$("genRegister").value,
        english=$("genEnglish").value!=="no",
        chapter=($("genChapter").value||"").trim()||word;

    /* Keep any existing set on screen until a new one actually arrives, so a
       failed generation does not wipe sentences you were part way through. */
    GenPlayer.stop("Generating a new set.");
    this.running=true;this.cancelled=false;
    this.setBusy(true);

    let collected=[],seen=new Set(),rounds=0,maxRounds=Math.ceil(total/15)+2;
    try{
      while(collected.length<total&&rounds<maxRounds&&!this.cancelled){
        rounds++;
        let need=Math.min(15,total-collected.length);
        this.status(`Writing sentences… ${collected.length} of ${total} so far.`);
        let got=await this.batch({word,batch:need,tense,register,english,avoid:collected.map(s=>s.italian)});
        if(this.cancelled)break;
        for(let s of got){
          let k=Util.norm(s.italian);
          if(!k||seen.has(k))continue;
          seen.add(k);collected.push({italian:String(s.italian||"").trim(),english:String(s.english||"").trim()});
          if(collected.length>=total)break;
        }
        if(!got.length)break;
      }
    }catch(e){
      this.running=false;this.setBusy(false);
      this.status(e&&e.message?e.message:"Something went wrong.","dangertxt");
      return;
    }

    this.running=false;
    if(this.cancelled&&!collected.length){this.setBusy(false);this.status("Cancelled.","warntxt");return;}
    if(!collected.length){this.setBusy(false);this.status("No sentences came back. Try again in a moment.","dangertxt");return;}

    this.meta={word,chapter,tense,register,total};
    this.items=collected;
    this.index=0;
    this.saved=false;
    this.rebuild();
    this.report();
    this.setBusy(false);
  },

  /* Rebuild the CSV template rows from the current sentence list. Called after
     generating and after dropping a sentence, so numbering always stays tidy. */
  rebuild(){
    if(!this.meta||!this.items.length){this.rows=[];this.csv="";this.renderCards();return;}
    let startOrder=this.nextOrder(this.meta.chapter);
    this.rows=CSVTemplate.rows(this.items,{
      book:GEN_BOOK,chapter:this.meta.chapter,
      chapterTitle:this.meta.tense==="mixed"?`${this.meta.word} — mixed tenses`:`${this.meta.word} — ${this.meta.tense}`,
      idPrefix:"GEN-"+Util.slug(this.meta.word).toUpperCase(),
      startOrder,
      sourceFile:"Generated in app"+(this.lastModel?" ("+this.lastModel+")":""),
      notes:"Generated from target expression \""+this.meta.word+"\"; "+(this.meta.tense==="mixed"?"mixed tenses":this.meta.tense)+"; "+this.meta.register+" register. Not reviewed."
    });
    this.csv=CSVTemplate.build(this.rows);
    this.renderCards();
  },

  nextOrder(chapter){
    let existing=App.sentences.filter(s=>s.book===GEN_BOOK&&String(s.chapter)===String(chapter));
    if(!existing.length)return 1;
    return Math.max(...existing.map(s=>Number(s.order)||0))+1;
  },

  report(){
    let count=this.items.length,
        target=Util.norm(this.meta.word),
        exact=this.items.filter(s=>Util.norm(s.italian).includes(target)).length,
        head=`${count} sentence${count===1?"":"s"} ready for "${this.meta.word}".`,
        detail=exact===count
          ? " Every one carries the expression unchanged."
          : exact===0
            ? " None carry it unchanged — expected for pronominal and idiomatic expressions, which split or conjugate."
            : ` ${exact} of ${count} carry it unchanged; the rest should be inflected or split forms.`,
        tail=this.saved?" Saved to your library." : " Shadow them below, then save the ones worth keeping.";
    this.status(head+detail+tail+(this.cancelled?" Stopped early.":""),"oktxt");
    UI.status("Ready.");
  },

  renderCards(){
    let host=$("genCards");
    if(!host)return;
    if(!this.items.length){host.innerHTML="";this.setOutputButtons(false);return;}
    /* Two different questions: genEnglish asked the relay for translations,
       showEnglish (on the shared bar) decides whether to show what we have. */
    let asked=$("genEnglish")?$("genEnglish").value!=="no":true,
        shown=$("showEnglish")?$("showEnglish").value!=="hide":true,
        showEnglish=asked&&shown;
    host.innerHTML="";
    this.items.forEach((s,i)=>host.appendChild(SentenceRow.build({
      number:i+1,italian:s.italian,english:s.english,showEnglish,
      active:i===this.index,
      playing:GenPlayer.playing&&i===this.index,
      actions:["play","drop"],
      on:{
        select:()=>GenController.jump(i),
        play:async()=>{this.index=i;this.renderCards();await Speech.speak(s.italian);},
        drop:()=>this.drop(i)
      }
    })));
    setTimeout(()=>{let a=host.querySelector(".srow.active");if(a)a.scrollIntoView({behavior:"smooth",block:"nearest"});},80);
    Focus.sync();
    this.setOutputButtons(true);
  },

  drop(i){
    if(i<0||i>=this.items.length)return;
    this.items.splice(i,1);
    if(this.index>=this.items.length)this.index=Math.max(0,this.items.length-1);
    this.saved=false;
    this.rebuild();
    if(!this.items.length){GenPlayer.stop("Set is empty.");this.status("All sentences dropped. Generate another set.","warntxt");return;}
    this.report();
    GenController.restart();
  },

  cancel(){
    this.cancelled=true;
    if(this.abort){try{this.abort.abort();}catch(e){}this.abort=null;}
    this.status("Cancelling…","warntxt");
  },

  /* Round-trip through the template: the CSV built above is parsed back with the
     same importer used for hand-made corpus files, so nothing is special-cased.
     The set stays on screen and keeps playing after saving. */
  async save(){
    if(!this.csv||!this.rows.length){this.status("Generate some sentences first.","warntxt");return;}
    if(this.saved){this.status("This set is already saved.","warntxt");return;}
    let items=Library.parseCSV(this.csv,{book:GEN_BOOK,chapter:this.meta.chapter});
    if(!items.length){this.status("The generated set could not be read back from the template.","dangertxt");return;}
    await Storage.addMany(items);
    await Library.refresh();
    this.saved=true;
    this.setOutputButtons(true);
    this.status(`Saved ${items.length} sentences to ${GEN_BOOK} → ${this.meta.chapter}. They stay here for shadowing, and are in your library for next time.`,"oktxt");
    UI.status(`Added ${items.length} generated sentences.`,"oktxt");
  },

  downloadCsv(){
    if(!this.csv){this.status("Generate some sentences first.","warntxt");return;}
    download(`generated-${Util.slug(this.meta.word)}.csv`,this.csv,"text/csv;charset=utf-8");
  }
};

/* Playback over the freshly generated set, mirroring the Study tab. */
const GenController={
  items(){return Generator.items||[];},
  scope(mode){
    let all=this.items();
    if(mode.indexOf("group")>=0){let g=Math.floor(Generator.index/10);return{list:all.slice(g*10,g*10+10),offset:g*10};}
    return{list:all,offset:0};
  },
  /* The shared bar speaks of groups and chapters, because that is what a
     library holds. A generated set is one flat run of 10-50 sentences saved as
     a single chapter, so the chapter scope is the whole set. The three scopes
     Generate has always had survive unchanged:
       current  -> the current sentence          (this sentence)
       group    -> the current group of ten      (this group)
       chapter  -> the whole generated set       (this whole set)
     each with its loop variant. */
  MODE:{chapter:"set","loop-chapter":"loop-set"},
  mode(){
    let v=$("playMode")?$("playMode").value:"chapter";
    return this.MODE[v]||v;
  },
  provider(){
    let mode=this.mode();
    if(mode==="current"||mode==="loop-current"){
      let loop=mode==="loop-current",done=false;
      return{next:()=>{
        let s=this.items()[Generator.index];
        if(!s)return null;
        if(done&&!loop)return null;
        done=true;
        return{text:s.italian,repeat:PlaybackControls.repeat(),
          label:(loop?"Looping sentence ":"Sentence ")+(Generator.index+1),
          onBefore:()=>Generator.renderCards()};
      }};
    }
    let loop=mode.indexOf("loop-")===0,{list,offset}=this.scope(mode),i=Math.max(0,Generator.index-offset);
    if(i>=list.length)i=0;
    return{next:()=>{
      if(!list.length)return null;
      if(i>=list.length){if(!loop)return null;i=0;}
      let s=list[i],idx=offset+i;i++;
      return{text:s.italian,repeat:PlaybackControls.repeat(),
        label:"Sentence "+(idx+1)+" of "+this.items().length,
        onBefore:()=>{Generator.index=idx;Generator.renderCards();}};
    }};
  },
  toggle(){if(!this.items().length){Generator.status("Generate a set first.","warntxt");return;}GenPlayer.toggle(()=>withProgress(this.provider()));},
  restart(){if(GenPlayer.playing)GenPlayer.restart(()=>withProgress(this.provider()));},
  jump(i){Generator.index=i;Generator.renderCards();this.restart();},
  next(){let n=this.items().length;if(n)Generator.index=(Generator.index+1)%n;Generator.renderCards();this.restart();},
  prev(){let n=this.items().length;if(n)Generator.index=(Generator.index-1+n)%n;Generator.renderCards();this.restart();}
};

/* ── The shared playback bar ────────────────────────────────────────────────
   Study and Generate meet the learner with one bar, one appearance and one set
   of settings. There is a single .playbar node in the document; switching tab
   moves it into the panel on screen and points its buttons at that panel's
   controller. Both controllers answer the same four calls, so the bar itself
   knows nothing about either. */

/* ── Which files am I actually made of? ──────────────────────────────────────
   The six files are uploaded by hand into a repository, from one folder among
   dozens carrying the same six names. Take app.js from the wrong folder and the
   markup and the code disagree: the app half-works, or does not start, and
   nothing on screen says why. Each file now carries its version, and this
   compares them at startup so a mismatched set announces itself. */
const Build={
  VERSION:"1.10.0",
  html(){let m=document.querySelector('meta[name="app-version"]');
    return m?m.getAttribute("content").trim():null;},
  css(){let v=getComputedStyle(document.documentElement).getPropertyValue("--css-version");
    return v?v.trim().replace(/^["']|["']$/g,""):null;},
  async worker(){
    try{
      if(!window.caches)return null;
      let names=await caches.keys(),
          m=names.map(n=>/^italian-shadowing-studio-v([\d-]+)$/.exec(n)).filter(Boolean);
      if(!m.length)return null;
      /* Newest cache wins; older ones are deleted on activation anyway. */
      return m.map(x=>x[1].replace(/-/g,".")).sort(Util.nat).pop();
    }catch(e){return null;}
  },
  async check(){
    let el=$("versionWarning");if(!el)return [];
    let html=this.html(), css=this.css(), sw=await this.worker(), stale=[];
    if(html&&html!==this.VERSION)stale.push(["index.html",html]);
    if(css&&css!==this.VERSION)stale.push(["styles.css",css]);
    /* A service worker one version behind is normal for a moment after an
       update — it activates on the next load. Only shout if it is further off. */
    if(sw&&sw!==this.VERSION&&!this._adjacent(sw,this.VERSION))stale.push(["sw.js",sw]);
    if(!stale.length){el.classList.add("hidden");el.innerHTML="";return [];}
    el.classList.remove("hidden");
    el.innerHTML=`<strong>These files are from different versions.</strong> `
      +`app.js is v${this.VERSION}, but `
      +stale.map(([f,v])=>`<code>${f}</code> is v${v}`).join(" and ")
      +`. Upload all six files again from the same folder — the app will not behave correctly until they match.`;
    return stale;
  },
  /* 1.9.1 vs 1.9.2 counts as adjacent; 1.8.2 vs 1.9.2 does not. */
  _adjacent(a,b){
    let pa=String(a).split("."),pb=String(b).split(".");
    if(pa[0]!==pb[0]||pa[1]!==pb[1])return false;
    return Math.abs(Number(pa[2]||0)-Number(pb[2]||0))<=1;
  }
};


/* ── Pronunciation help (preview) ────────────────────────────────────────────
   The handover's data model, in miniature. Canonical text is never altered:
   the marks live in separate metadata, addressed by word and by character
   within that word, and the renderer combines the two at display time. Change
   the notation or the colour and nothing about the stored sentence changes.

   Every mark below was placed by hand and checked one word at a time. That is
   the point of the preview, not a shortcut: Italian stress and vowel aperture
   are lexical, not derivable from spelling, and my own first attempt at writing
   these examples freehand got four of them wrong. In the real feature they come
   from a lexicon, and a word the lexicon does not cover stays unmarked. */
const Pron={
  /* [wordIndex, charWithinWord, type] */
  DEMO:[
    {t:"È bene che tu sia rilassato.",
     m:[[1,1,"open_e"]],
     n:"Only bène is marked. The stress in rilassato falls on -sa-, and a double s is always voiceless."},
    {t:"Conviene che tu abbia tutto il necessario.",
     m:[[0,5,"open_e"]],
     n:"necessario is stressed on -sa-, so its e's are unstressed and take no mark."},
    {t:"È opportuno che tutti siano presenti.",
     m:[[5,3,"voiced_s"],[5,4,"open_e"]],
     n:"presenti carries both: the s between vowels is voiced, and the stressed e is open."},
    {t:"Non è necessario che tu abbia fretta.",
     m:[[6,2,"closed_e"]],
     n:"fretta has a closed e — shown only in the two notations that mark closed vowels."},
    {t:"Conviene che il pianista abbia una copia dello spartito.",
     m:[[0,5,"open_e"],[6,1,"open_o"],[7,1,"closed_e"]],
     n:"Three marks, two of them open, one closed."},
    {t:"È opportuno che il coro sia già in sala.",
     m:[[4,1,"open_o"]],
     n:"opportuno is stressed on -tu-, so only coro is marked."},
    {t:"Vorrei vedere questo spettacolo.",
     m:[[0,4,"open_e"],[1,3,"closed_e"],[2,2,"closed_e"]],
     n:"vedere takes its accent on the second e, and spettacolo on -ta-, so its e is bare."},
    {t:"Questa casa è troppo grande.",
     m:[[0,2,"closed_e"],[1,2,"voiced_s"],[3,2,"open_o"]],
     n:"casa: a single s between vowels is voiced."},
    {t:"Mezzo litro di zucchero.",
     m:[[0,1,"open_e"],[0,2,"voiced_z"],[0,3,"voiced_z"]],
     n:"mezzo has voiced zz; zucchero has voiceless z and is left alone."},
    {t:"Zero problemi.",
     m:[[0,0,"voiced_z"],[0,1,"open_e"],[1,5,"open_e"]],
     n:"Both words carry an open stressed e."}
  ],

  GLYPH:{
    both:{open_e:"è",closed_e:"é",open_o:"ò",closed_o:"ó"},
    open:{open_e:"è",open_o:"ò"},                  /* closed vowels left bare */
    ipa: {open_e:"ɛ",closed_e:"e",open_o:"ɔ",closed_o:"o"}
  },
  CONS:{voiced_s:"ṡ",voiced_z:"ż"},

  mode(){return $("pronMode")?$("pronMode").value:"both";},

  /* Canonical text in, display markup out. The canonical string is untouched. */
  render(text,marks,mode){
    let words=text.split(" "),
        byWord={};
    (marks||[]).forEach(([w,c,type])=>{(byWord[w]=byWord[w]||[]).push([c,type]);});
    return words.map((word,wi)=>{
      let ms=byWord[wi];
      if(!ms)return Util.esc(word);
      let out="";
      for(let i=0;i<word.length;i++){
        let hit=ms.find(x=>x[0]===i);
        if(!hit){out+=Util.esc(word[i]);continue;}
        let type=hit[1],
            g=this.CONS[type]||(this.GLYPH[mode]||{})[type];
        if(!g){out+=Util.esc(word[i]);continue;}   /* not shown in this notation */
        out+=`<span class="pron-mark">${Util.esc(g)}</span>`;
      }
      return out;
    }).join(" ");
  },

  legend(mode){
    if(mode==="ipa")return "ɛ open e · e closed e · ɔ open o · o closed o · ṡ voiced s · ż voiced z. "
      +"Only vowels in stressed position are marked.";
    if(mode==="open")return "è open e · ò open o · ṡ voiced s · ż voiced z. "
      +"Closed vowels are left unmarked, so a bare stressed e or o means either closed or not yet known.";
    return "è open e · é closed e · ò open o · ó closed o · ṡ voiced s · ż voiced z. "
      +"Every stressed e and o is marked, so a bare one means the word is not yet in the lexicon.";
  },

  draw(){
    let host=$("pronDemo");if(!host)return;
    let mode=this.mode();
    document.documentElement.setAttribute("data-pron-colour",
      $("pronColour")?$("pronColour").value:"terracotta");
    host.innerHTML=this.DEMO.map(d=>
      `<div class="pron-row"><p class="italian pron-line">${this.render(d.t,d.m,mode)}</p>`
      +`<p class="pron-note">${Util.esc(d.n)}</p></div>`).join("");
    if($("pronLegend"))$("pronLegend").textContent=this.legend(mode);
  }
};

const Playbar={
  tab:"study",
  controller(){return this.tab==="generate"?GenController:SentenceController;},
  attach(tab){
    this.tab=(tab==="generate")?"generate":"study";
    let bar=$("playbar"),host=$(this.tab==="generate"?"generate":"study");
    if(bar&&host&&bar.parentNode!==host)host.appendChild(bar);
    this.relabel();
  },
  /* A generated set has no chapters, so the chapter scope is named for what it
     actually plays there. The values never change — only the wording. */
  relabel(){
    let gen=this.tab==="generate",m=$("playMode");
    if(m){
      let c=m.querySelector('option[value="chapter"]'),
          l=m.querySelector('option[value="loop-chapter"]');
      if(c)c.textContent=gen?"this whole set":"this chapter";
      if(l)l.textContent=gen?"loop whole set":"loop chapter";
    }
    /* Group / single display belongs to the Study viewer alone. */
    let d=$("displayModeField");if(d)d.classList.toggle("hidden",gen);
  },
  toggle(){this.controller().toggle();},
  next(){this.controller().next();},
  prev(){this.controller().prev();},
  restart(){this.controller().restart();}
};

function bind(){
  /* One bar, so one Start/Pause button. Only one player may run at a time,
     which is what makes a single button honest. */
  MainPlayer.button=$("mainToggle");GenPlayer.button=$("mainToggle");VerbPlayer.button=$("verbToggle");
  function activatePanel(p){if(Focus.isOpen())Focus.leave();setTimeout(()=>UI.renderSideArt(),0);document.querySelectorAll(".desktop-tabs [data-panel]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));let tb=document.querySelector(".desktop-tabs [data-panel='"+p+"']");if(tb)tb.classList.add("active");$(p).classList.remove("hidden");if(p==="verbs"){if(MainPlayer.playing)MainPlayer.stop("Switched to Verb Drill.");if(GenPlayer.playing)GenPlayer.stop("Switched to Verb Drill.");Verb.render();}else if(p==="study"&&VerbPlayer.playing)VerbPlayer.stop("Switched to Study.");else if(p==="settings"||p==="generate"){let lbl=p==="generate"?"Switched to Generate.":"Switched to Settings.";if(MainPlayer.playing)MainPlayer.stop(lbl);if(VerbPlayer.playing)VerbPlayer.stop(lbl);if(p==="settings"&&GenPlayer.playing)GenPlayer.stop(lbl);}if(p!=="generate"&&GenPlayer.playing)GenPlayer.stop("Left the Generate tab.");Playbar.attach(p);}document.querySelectorAll(".desktop-tabs [data-panel]").forEach(b=>b.onclick=()=>activatePanel(b.dataset.panel));function activateScreen(s){document.body.setAttribute("data-screen",s);document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===s));if(s!=="library")activatePanel(s);}document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.onclick=()=>activateScreen(b.dataset.screen));if($("goToSettings"))$("goToSettings").onclick=()=>activateScreen("settings");
  /* Library management now lives in its own screen. */
  const openManage=()=>{Manage.render();$("manageModal").style.display="flex";};
  $("openManage").onclick=openManage;
  $("closeManage").onclick=()=>$("manageModal").style.display="none";
  $("manageModal").onclick=e=>{if(e.target===$("manageModal"))$("manageModal").style.display="none";};
  $("openImport").onclick=()=>{$("manageModal").style.display="none";Importer.open();};
  $("titlesOnly").onclick=()=>Importer.titlesOnly();

  /* Collapsing the library gives the sentences the full width. */
  const setLib=collapsed=>{
    document.body.classList.toggle("lib-collapsed",collapsed);
    $("libShow").classList.toggle("hidden",!collapsed);
    localStorage.setItem("v08libCollapsed",collapsed?"1":"0");
  };
  /* Focus mode */
  $("openFocus").onclick=()=>Focus.enter($("generate").classList.contains("hidden")?"study":"generate");
  $("closeFocus").onclick=()=>Focus.leave();
  $("focusToggle").onclick=()=>Focus.toggle();
  $("focusNext").onclick=()=>Focus.next();
  $("focusPrev").onclick=()=>Focus.prev();
  $("focusRate").onchange=()=>{$("rate").value=$("focusRate").value;Focus.controller().restart();};
  $("focusPause").onchange=()=>{$("pause").value=$("focusPause").value;Focus.controller().restart();};
  $("focusRepeat").onchange=()=>{$("repeat").value=$("focusRepeat").value;Focus.repeat(0,Number($("focusRepeat").value)||1);Focus.controller().restart();};
  $("focusEnglishMode").onchange=()=>{$("showEnglish").value=$("focusEnglishMode").value;Focus.sync();};
  document.addEventListener("keydown",e=>{
    if(!Focus.isOpen())return;
    if(e.key==="Escape"){e.preventDefault();Focus.leave();}
    else if(e.key===" "){e.preventDefault();Focus.toggle();}
    else if(e.key==="ArrowRight"){e.preventDefault();Focus.next();}
    else if(e.key==="ArrowLeft"){e.preventDefault();Focus.prev();}
  });

  $("libCollapse").onclick=()=>setLib(true);
  $("libShow").onclick=()=>setLib(false);

  /* The overflow menu holds the settings that are rarely touched. */
  /* One behaviour, used by both overflow menus, rather than a second copy. */
  const menus=[["studyMoreMenu","studyMore"],["verbMoreMenu","verbMore"]]
    .map(([m,b])=>[$(m),$(b)]).filter(([m,b])=>m&&b);
  const closeAllMenus=()=>menus.forEach(([m,b])=>{m.classList.add("hidden");b.setAttribute("aria-expanded","false");});
  menus.forEach(([menu,btn])=>{
    btn.onclick=e=>{
      e.stopPropagation();
      let wasOpen=!menu.classList.contains("hidden");
      closeAllMenus();
      if(!wasOpen){menu.classList.remove("hidden");btn.setAttribute("aria-expanded","true");}
    };
    document.addEventListener("click",e=>{
      if(!menu.contains(e.target)&&e.target!==btn&&!btn.contains(e.target)){
        menu.classList.add("hidden");btn.setAttribute("aria-expanded","false");}
    });
  });
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeAllMenus();});

  $("closeImport").onclick=()=>$("importModal").style.display="none";
  $("analyseFile").onclick=async()=>{let f=$("csvFile").files[0];if(!f){alert("Choose a CSV first.");return;}let t=await f.text();Importer.preview(Library.parseCSV(t,Importer.defs()),t);};
  $("analysePaste").onclick=()=>{let t=$("pasteCsv").value;Importer.preview(Library.parseCSV(t,Importer.defs()),t);};
  $("importPreviewed").onclick=()=>Importer.import();
  $("dedupe").onclick=()=>Importer.dedupe();
  $("exportCsv").onclick=()=>download("italian-shadowing-library-v103.csv",toCSV(),"text/csv;charset=utf-8");
  $("clearAll").onclick=async()=>{if(confirm("Delete whole local library and audio cache?")){await Storage.clear(SS);await Storage.clear(AS);App.sentences=[];App.cur={book:"",chapter:"",group:1,index:0};UI.renderAll();}};
  $("prevGroup").onclick=()=>Nav.prevGroup();
  $("nextGroup").onclick=()=>Nav.nextGroup();
  $("prevSentence").onclick=()=>Playbar.prev();
  $("nextSentence").onclick=()=>Playbar.next();
  $("mainToggle").onclick=()=>Playbar.toggle();
  $("hardReset").onclick=()=>{MainPlayer.stop("Audio reset.");VerbPlayer.stop("Audio reset.");GenPlayer.stop("Audio reset.");closeAllMenus();};
  $("displayMode").onchange=()=>UI.renderViewer();
  $("showEnglish").onchange=()=>{UI.renderViewer();if(Generator.items.length)Generator.renderCards();};
  $("playMode").onchange=()=>Playbar.restart();
  $("search").oninput=()=>UI.renderViewer();
  $("search").onsearch=()=>UI.renderViewer();
  $("closeEdit").onclick=()=>Editor.close();
  $("closeEditBottom").onclick=()=>Editor.close();
  $("saveEdit").onclick=()=>Editor.save();
  $("editModal").onclick=e=>{if(e.target===$("editModal"))Editor.close();};
  ["repeat","rate","pause","verbRepeat","verbRate","verbPause"].forEach(id=>{if($(id))$(id).onchange=()=>{if(MainPlayer.playing)SentenceController.restart();if(VerbPlayer.playing)Verb.restart();if(GenPlayer.playing)GenController.restart();};});
  $("voiceMode").onchange=()=>{let _m=$("voiceMode").value;localStorage.setItem("v08voiceMode",_m);$("elevenPanel").classList.toggle("hidden",_m!=="eleven");if($("voiceChipLabel"))$("voiceChipLabel").textContent=_m==="eleven"?"ElevenLabs":"System (Alice)";};
  $("saveElevenBtn").onclick=()=>{if($("saveEleven").value==="yes"){localStorage.setItem("v08key",$("apiKey").value);localStorage.setItem("v08voice",$("voiceId").value);localStorage.setItem("v08model",$("model").value);localStorage.setItem("v08voiceMode","eleven");$("voiceMode").value="eleven";$("elevenPanel").classList.remove("hidden");UI.status("ElevenLabs settings saved.","oktxt");}else{UI.status("Settings not saved — change 'Save locally' to save on this browser.","warntxt");}};
  $("clearElevenBtn").onclick=()=>{["v08key","v08voice","v08model"].forEach(k=>localStorage.removeItem(k));$("apiKey").value="";$("voiceId").value="";UI.status("ElevenLabs settings cleared.","warntxt");};
  $("preloadBtn").onclick=()=>Preloader.start();
  $("preloadCancel").onclick=()=>Preloader.cancel();
  $("saveAiBtn").onclick=()=>{if($("saveAi").value==="yes"){localStorage.setItem("v08relayUrl",$("relayUrl").value);localStorage.setItem("v08relayToken",$("relayToken").value);UI.status("Generator settings saved on this browser.","oktxt");}else{UI.status("Not saved — change 'Save locally' to keep these on this browser.","warntxt");}};
  $("clearAiBtn").onclick=()=>{["v08relayUrl","v08relayToken"].forEach(k=>localStorage.removeItem(k));$("relayUrl").value="";$("relayToken").value="";UI.status("Generator settings cleared.","warntxt");};
  $("genBtn").onclick=()=>Generator.start();
  $("genCancel").onclick=()=>Generator.cancel();
  $("genSave").onclick=()=>Generator.save();
  $("genDownload").onclick=()=>Generator.downloadCsv();
  $("genWord").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();Generator.start();}};
  $("genEnglish").onchange=()=>Generator.renderCards();
  Generator.setOutputButtons(false);
  $("verbScope").onchange=()=>Verb.render();
  if($("pronMode"))$("pronMode").onchange=()=>Pron.draw();
  if($("pronColour"))$("pronColour").onchange=()=>Pron.draw();
  $("verbPreloadBtn").addEventListener("click",()=>closeAllMenus());
  $("verbSel").onchange=()=>{App.verbTenseIndex=0;Verb.renderView();Verb.restart();};
  $("verbMode").onchange=()=>Verb.restart();
  $("verbToggle").onclick=()=>Verb.toggle();
  $("prevTense").onclick=()=>Verb.moveTense(-1);
  $("nextTense").onclick=()=>Verb.moveTense(1);
  $("verbPreloadBtn").onclick=()=>Preloader.startVerbs();
  $("verbPreloadCancel").onclick=()=>Preloader.cancel();
  $("showBookmarks").onclick=()=>{$("reviewView").innerHTML=App.sentences.filter(s=>s.bookmarked).map(s=>`<div class="card"><div class="italian">${Util.esc(s.italian)}</div><div class="english">${Util.esc(s.english)}</div></div>`).join("")||"<p>No bookmarked sentences.</p>";};
  $("showAll").onclick=()=>{$("reviewView").innerHTML=App.sentences.map(s=>`<div class="card"><span class="pill">${Util.esc(s.book)} / ${Util.esc(s.chapter)} / ${s.order}</span><div class="italian">${Util.esc(s.italian)}</div><div class="english">${Util.esc(s.english)}</div></div>`).join("");};;if($("themeToggle")){$("themeToggle").onchange=()=>{let d=$("themeToggle").checked;document.documentElement.setAttribute("data-theme",d?"dark":"sage");localStorage.setItem("v08theme",d?"dark":"sage");};}}

window.speechSynthesis.onvoiceschanged=()=>Speech.loadVoices();
(async function init(){let _th=localStorage.getItem("v08theme")||"sage";document.documentElement.setAttribute("data-theme",_th);if($("themeToggle"))$("themeToggle").checked=_th==="dark";App.db=await Storage.open();Titles.load();bind();Build.check();Pron.draw();if($("headerMark"))$("headerMark").innerHTML=Art.mark();if($("genArt"))$("genArt").innerHTML=Art.archPlate();document.querySelectorAll(".panel-art").forEach(el=>{el.innerHTML=Art.plate();});document.documentElement.style.setProperty("--backdrop",`url("${Art.LAND}")`);MediaSessionMgr.init();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")WakeLock.reacquire();});window.addEventListener("orientationchange",()=>{setTimeout(()=>{if((MainPlayer.playing&&!MainPlayer.paused)||(VerbPlayer.playing&&!VerbPlayer.paused)){if(!speechSynthesis.speaking&&!App.currentAudio){if(MainPlayer.playing)SentenceController.restart();else if(VerbPlayer.playing)Verb.restart();}}},600);});Speech.loadVoices();$("apiKey").value=localStorage.getItem("v08key")||"";$("voiceId").value=localStorage.getItem("v08voice")||"";$("model").value=localStorage.getItem("v08model")||"eleven_multilingual_v2";$("relayUrl").value=localStorage.getItem("v08relayUrl")||"";$("relayToken").value=localStorage.getItem("v08relayToken")||"";if(localStorage.getItem("v08relayUrl"))$("saveAi").value="yes";$("voiceMode").value=localStorage.getItem("v08voiceMode")||"eleven";$("elevenPanel").classList.toggle("hidden",$("voiceMode").value!=="eleven");if($("voiceChipLabel"))$("voiceChipLabel").textContent=$("voiceMode").value==="eleven"?"ElevenLabs":"System (Alice)";if(localStorage.getItem("v08libCollapsed")==="1"){document.body.classList.add("lib-collapsed");$("libShow").classList.remove("hidden");}await Library.refresh();Playbar.attach("study");MainPlayer.setButton();VerbPlayer.setButton();})();

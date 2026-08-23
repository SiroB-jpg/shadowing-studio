"use strict";
const $=id=>document.getElementById(id);
const DB="ISS_V08", SS="sentences", AS="audioCache";
const App={db:null,sentences:[],analysed:[],alice:null,currentAudio:null,currentAudioResolve:null,elevenAbort:null,playbackContext:"main",cur:{book:"",chapter:"",group:1,index:0},verbTenseIndex:0};

const Util={esc:s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])),clean:s=>String(s??"").replace(/^["']|["']$/g,"").trim(),uniq:a=>[...new Set(a)],nat:(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}),sleep:ms=>new Promise(r=>setTimeout(r,ms)),gnum:s=>Math.floor((Number(s.order)-1)/10)+1,sortS:(a,b)=>String(a.book).localeCompare(String(b.book))||String(a.chapter).localeCompare(String(b.chapter),undefined,{numeric:true,sensitivity:"base"})||Number(a.order)-Number(b.order),slug:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"set",pad:(n,w=2)=>String(n).padStart(w,"0"),norm:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()};

const Storage={open(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=e=>{let d=e.target.result;if(!d.objectStoreNames.contains(SS))d.createObjectStore(SS,{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains(AS))d.createObjectStore(AS,{keyPath:"key"});};r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);});},store(n,m="readonly"){return App.db.transaction(n,m).objectStore(n);},all(n){return new Promise((res,rej)=>{let r=this.store(n).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},get(n,k){return new Promise((res,rej)=>{let r=this.store(n).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},put(n,o){return new Promise((res,rej)=>{let t=App.db.transaction(n,"readwrite");t.objectStore(n).put(o);t.oncomplete=res;t.onerror=()=>rej(t.error);});},addMany(items){return new Promise((res,rej)=>{let t=App.db.transaction(SS,"readwrite"),s=t.objectStore(SS);items.forEach(x=>s.add(x));t.oncomplete=res;t.onerror=()=>rej(t.error);});},clear(n){return new Promise((res,rej)=>{let r=this.store(n,"readwrite").clear();r.onsuccess=res;r.onerror=()=>rej(r.error);});}};


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
  volume:'<path d="M5 9.5h3l4-3.2v11.4l-4-3.2H5z"/><path d="M15.8 9.6a3.4 3.4 0 010 4.8"/>'
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

const UI={
  fill(sel,vals,val,label=x=>x){sel.innerHTML="";if(!vals.length){sel.innerHTML="<option>—</option>";return;}vals.forEach(v=>{let o=document.createElement("option");o.value=v;o.textContent=label(v);if(String(v)==String(val))o.selected=true;sel.appendChild(o);});},
  renderAll(){this.renderCrumb();this.renderTree();this.renderViewer();Verb.render();this.stats();},

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
      v.innerHTML='<div class="empty"><h3>No sentences yet</h3><p>Open <strong>Manage library</strong> to import a CSV, or use the <strong>Generate</strong> tab.</p><p class=\"small\">A library belongs to the device it was imported on. If your sentences are on another device, export them there and import the file here.</p></div>';
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
    a.playbackRate=PlaybackControls.rate();
    a.onplaying=()=>{started=true;if(startTimer)clearTimeout(startTimer);};
    a.onended=finish;
    a.onerror=()=>fail(new Error("Audio playback error"));
    a.onstalled=()=>{if(!started)fail(new Error("Audio playback stalled"));};
    a.src=url;
    startTimer=setTimeout(()=>{if(!started)fail(new Error("Audio did not start"));},9000);
    totalTimer=setTimeout(()=>fail(new Error("Audio playback timed out")),45000);
    let p=a.play();
    if(p&&p.catch)p.catch(err=>fail(err));
  });},
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

class PlaybackEngine{constructor(name,button,statusPrefix=""){this.name=name;this.button=button;this.statusPrefix=statusPrefix;this.run=0;this.playing=false;this.paused=false;this.stopped=false;this.provider=null;}setButton(){if(this.button)this.button.textContent=this.playing?(this.paused?"Resume":"Pause"):"Start";}async wait(run){while(this.paused&&!this.stopped&&run===this.run)await Util.sleep(120);}toggle(providerFactory){if(!this.playing){this.start(providerFactory);return;}if(!this.paused){this.paused=true;speechSynthesis.pause();if(App.currentAudio)App.currentAudio.pause();UI.status((this.statusPrefix||"Playback")+" paused.","warntxt");this.setButton();MediaSessionMgr.paused();return;}this.paused=false;speechSynthesis.resume();if(App.currentAudio)App.currentAudio.play().catch(()=>{});UI.status("Playing…");this.setButton();MediaSessionMgr.playing();}stop(msg="Stopped."){this.run++;this.stopped=true;this.playing=false;this.paused=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status(msg,"warntxt");if(!MainPlayer.playing&&!VerbPlayer.playing&&!GenPlayer.playing){WakeLock.release();MediaSessionMgr.none();}}restart(providerFactory,delay=140){this.stop("Restarting…");setTimeout(()=>this.start(providerFactory),delay);}async start(providerFactory){if(this.playing)return;this.run++;let run=this.run;this.playing=true;this.paused=false;this.stopped=false;this.setButton();this.provider=providerFactory();App.playbackContext=this.name;UI.status("Playing…");WakeLock.request();MediaSessionMgr.playing();try{while(run===this.run&&!this.stopped){let item=this.provider.next();if(!item)break;if(item.onBefore)item.onBefore();if(item.label){UI.status(item.label);MediaSessionMgr.update(item.label,App.cur.book||"");}let reps=item.repeat??1;if(reps==="infinite"){while(run===this.run&&!this.stopped){await this.wait(run);if(run!==this.run||this.stopped)break;await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}else{for(let i=0;i<Number(reps)&&run===this.run&&!this.stopped;i++){await this.wait(run);if(run!==this.run||this.stopped)break;await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}}}catch(e){UI.status("Playback error: "+(e&&e.message?e.message:e),"dangertxt");}finally{if(run===this.run){this.playing=false;this.paused=false;this.stopped=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status("Finished.","oktxt");WakeLock.release();MediaSessionMgr.none();}}}}

const MainPlayer=new PlaybackEngine("main",null,"Sentence playback");
const VerbPlayer=new PlaybackEngine("verb",null,"Verb drill");
const GenPlayer=new PlaybackEngine("gen",null,"Generated sentences");

const SentenceController={repeat(){return PlaybackControls.repeat();},provider(){let mode=$("playMode").value||"group";if(mode==="current")return this.currentProvider(false);if(mode==="loop-current")return this.currentProvider(true);if(mode==="chapter")return this.sequenceProvider("chapter",false);if(mode==="loop-chapter")return this.sequenceProvider("chapter",true);if(mode==="loop-group")return this.sequenceProvider("group",true);return this.sequenceProvider("group",false);},currentProvider(loop){let done=false;return{next:()=>{let s=Library.current();if(!s)return null;if(done&&!loop)return null;done=true;return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping sentence ":"Sentence ")+s.order,onBefore:()=>UI.renderViewer()};}};},itemsForScope(scope){if(scope==="group")return Library.group();if(scope==="chapter")return Library.chapter();return Library.group();},sequenceProvider(scope,loop){let items=this.itemsForScope(scope),idx=0;if(scope==="group")idx=Math.max(0,Math.min(App.cur.index,items.length-1));else{let cur=Library.current();let pos=items.findIndex(x=>x.id===cur?.id);idx=Math.max(0,pos);}return{next:()=>{if(!items.length)return null;if(idx>=items.length){if(!loop)return null;idx=0;}let s=items[idx++];return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping "+scope+" — ":"")+"Sentence "+s.order,onBefore:()=>{App.cur.book=s.book;App.cur.chapter=s.chapter;App.cur.group=Util.gnum(s);App.cur.index=Library.group().findIndex(x=>x.id===s.id);if(App.cur.index<0)App.cur.index=0;UI.renderAll();}};}};},toggle(){MainPlayer.toggle(()=>this.provider());},reset(){MainPlayer.stop("Audio engine reset. Press Start to continue.");},restart(){if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},jumpToIndex(i){App.cur.index=i;UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},next(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index<g.length-1)?App.cur.index+1:0;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},prev(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index>0)?App.cur.index-1:g.length-1;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());}};

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
      $("detected").innerHTML=`Detected verbs (${detected.length} of ${total} in the table): `+detected.map(v=>`<span class="pill">${v}</span>`).join(" ")+note;
      $("detected").className="status oktxt";
    }else{
      $("detected").innerHTML=`No verbs detected in this scope — showing all ${verbs.length} available.`+note;
      $("detected").className="status warntxt";
    }
    this.renderView();
  },
  renderView(){let v=$("verbSel").value,d=this.V[v];if(!d){$("verbView").innerHTML="";return;}$("verbView").innerHTML=`<div class="verbRef"><strong>${v}</strong> = ${Util.esc(d.en)} · reference: <strong>${Util.esc(this.forms(v,"presente")[0])}</strong></div><div class="tenseGrid">${this.tenseOrder.map(t=>`<div class="tenseCard" id="tense_${t}"><h3>${this.names[t]}</h3><div class="formsLine">${Util.esc(this.line(v,t))}</div></div>`).join("")}</div>`;this.highlight();},
  highlight(){document.querySelectorAll(".tenseCard").forEach(x=>x.classList.remove("active"));let c=$("tense_"+this.selectedTense());if(c)c.classList.add("active");},
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
  open(){App.analysed=[];this.text="";$("importSummary").textContent="No CSV analysed yet.";$("importPreview").innerHTML="";$("importModal").style.display="flex";},
  defs(){return{book:$("defaultBook").value,chapter:$("defaultChapter").value};},
  async fileText(){let f=$("csvFile").files[0];return f?await f.text():"";},
  preview(items,text){
    App.analysed=items;this.text=text||"";
    $("importSummary").textContent=items.length?`Detected ${items.length} sentences.`:"No sentences detected.";
    $("importSummary").className="status "+(items.length?"oktxt":"dangertxt");
    let sm=items.slice(0,12);
    $("importPreview").innerHTML=items.length?`<table><thead><tr><th>Book</th><th>Chapter</th><th>#</th><th>Italian</th><th>English</th></tr></thead><tbody>${sm.map(s=>`<tr><td>${Util.esc(s.book)}</td><td>${Util.esc(s.chapter)}</td><td>${s.order}</td><td>${Util.esc(s.italian)}</td><td>${Util.esc(s.english)}</td></tr>`).join("")}</tbody></table>`:"";
  },
  async import(){
    if(!App.analysed.length){alert("Analyse first.");return;}
    let learned=this.text?Titles.harvest(this.text,this.defs()):0;
    await Storage.addMany(App.analysed);
    let s=App.analysed[0];
    App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:0};
    App.analysed=[];this.text="";
    $("importModal").style.display="none";
    await Library.refresh();
    UI.status("Imported successfully."+(learned?` ${learned} book and chapter name(s) picked up.`:""),"oktxt");
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
  toggle(){if(!this.items().length){Generator.status("Generate a set first.","warntxt");return;}GenPlayer.toggle(()=>this.provider());},
  restart(){if(GenPlayer.playing)GenPlayer.restart(()=>this.provider());},
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
  function activatePanel(p){document.querySelectorAll(".desktop-tabs [data-panel]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));let tb=document.querySelector(".desktop-tabs [data-panel='"+p+"']");if(tb)tb.classList.add("active");$(p).classList.remove("hidden");if(p==="verbs"){if(MainPlayer.playing)MainPlayer.stop("Switched to Verb Drill.");if(GenPlayer.playing)GenPlayer.stop("Switched to Verb Drill.");Verb.render();}else if(p==="study"&&VerbPlayer.playing)VerbPlayer.stop("Switched to Study.");else if(p==="settings"||p==="generate"){let lbl=p==="generate"?"Switched to Generate.":"Switched to Settings.";if(MainPlayer.playing)MainPlayer.stop(lbl);if(VerbPlayer.playing)VerbPlayer.stop(lbl);if(p==="settings"&&GenPlayer.playing)GenPlayer.stop(lbl);}if(p!=="generate"&&GenPlayer.playing)GenPlayer.stop("Left the Generate tab.");Playbar.attach(p);}document.querySelectorAll(".desktop-tabs [data-panel]").forEach(b=>b.onclick=()=>activatePanel(b.dataset.panel));function activateScreen(s){document.body.setAttribute("data-screen",s);document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===s));if(s!=="library")activatePanel(s);}document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.onclick=()=>activateScreen(b.dataset.screen));if($("goToSettings"))$("goToSettings").onclick=()=>activateScreen("settings");
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
  $("libCollapse").onclick=()=>setLib(true);
  $("libShow").onclick=()=>setLib(false);

  /* The overflow menu holds the settings that are rarely touched. */
  const moreMenu=$("studyMoreMenu"),moreBtn=$("studyMore");
  const closeMore=()=>{moreMenu.classList.add("hidden");moreBtn.setAttribute("aria-expanded","false");};
  moreBtn.onclick=e=>{
    e.stopPropagation();
    let open=moreMenu.classList.toggle("hidden");
    moreBtn.setAttribute("aria-expanded",open?"false":"true");
  };
  document.addEventListener("click",e=>{if(!moreMenu.contains(e.target)&&e.target!==moreBtn&&!moreBtn.contains(e.target))closeMore();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape")closeMore();});

  $("closeImport").onclick=()=>$("importModal").style.display="none";
  $("analyseFile").onclick=async()=>{let f=$("csvFile").files[0];if(!f){alert("Choose a CSV first.");return;}let t=await f.text();Importer.preview(Library.parseCSV(t,Importer.defs()),t);};
  $("analysePaste").onclick=()=>{let t=$("pasteCsv").value;Importer.preview(Library.parseCSV(t,Importer.defs()),t);};
  $("importPreviewed").onclick=()=>Importer.import();
  $("exportCsv").onclick=()=>download("italian-shadowing-library-v103.csv",toCSV(),"text/csv;charset=utf-8");
  $("clearAll").onclick=async()=>{if(confirm("Delete whole local library and audio cache?")){await Storage.clear(SS);await Storage.clear(AS);App.sentences=[];App.cur={book:"",chapter:"",group:1,index:0};UI.renderAll();}};
  $("prevGroup").onclick=()=>Nav.prevGroup();
  $("nextGroup").onclick=()=>Nav.nextGroup();
  $("prevSentence").onclick=()=>Playbar.prev();
  $("nextSentence").onclick=()=>Playbar.next();
  $("mainToggle").onclick=()=>Playbar.toggle();
  $("hardReset").onclick=()=>{MainPlayer.stop("Audio reset.");VerbPlayer.stop("Audio reset.");GenPlayer.stop("Audio reset.");closeMore();};
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
(async function init(){let _th=localStorage.getItem("v08theme")||"sage";document.documentElement.setAttribute("data-theme",_th);if($("themeToggle"))$("themeToggle").checked=_th==="dark";App.db=await Storage.open();Titles.load();bind();MediaSessionMgr.init();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")WakeLock.reacquire();});window.addEventListener("orientationchange",()=>{setTimeout(()=>{if((MainPlayer.playing&&!MainPlayer.paused)||(VerbPlayer.playing&&!VerbPlayer.paused)){if(!speechSynthesis.speaking&&!App.currentAudio){if(MainPlayer.playing)SentenceController.restart();else if(VerbPlayer.playing)Verb.restart();}}},600);});Speech.loadVoices();$("apiKey").value=localStorage.getItem("v08key")||"";$("voiceId").value=localStorage.getItem("v08voice")||"";$("model").value=localStorage.getItem("v08model")||"eleven_multilingual_v2";$("relayUrl").value=localStorage.getItem("v08relayUrl")||"";$("relayToken").value=localStorage.getItem("v08relayToken")||"";if(localStorage.getItem("v08relayUrl"))$("saveAi").value="yes";$("voiceMode").value=localStorage.getItem("v08voiceMode")||"eleven";$("elevenPanel").classList.toggle("hidden",$("voiceMode").value!=="eleven");if($("voiceChipLabel"))$("voiceChipLabel").textContent=$("voiceMode").value==="eleven"?"ElevenLabs":"System (Alice)";if(localStorage.getItem("v08libCollapsed")==="1"){document.body.classList.add("lib-collapsed");$("libShow").classList.remove("hidden");}await Library.refresh();Playbar.attach("study");MainPlayer.setButton();VerbPlayer.setButton();})();

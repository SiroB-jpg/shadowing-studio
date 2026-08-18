"use strict";
const $=id=>document.getElementById(id);
const DB="ISS_V08", SS="sentences", AS="audioCache";
const App={db:null,sentences:[],analysed:[],alice:null,currentAudio:null,currentAudioResolve:null,elevenAbort:null,playbackContext:"main",cur:{book:"",chapter:"",group:1,index:0},verbTenseIndex:0};

const Util={esc:s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])),clean:s=>String(s??"").replace(/^["']|["']$/g,"").trim(),uniq:a=>[...new Set(a)],nat:(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true,sensitivity:"base"}),sleep:ms=>new Promise(r=>setTimeout(r,ms)),gnum:s=>Math.floor((Number(s.order)-1)/10)+1,sortS:(a,b)=>String(a.book).localeCompare(String(b.book))||String(a.chapter).localeCompare(String(b.chapter),undefined,{numeric:true,sensitivity:"base"})||Number(a.order)-Number(b.order),slug:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40)||"set",pad:(n,w=2)=>String(n).padStart(w,"0"),norm:s=>String(s??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9 ]+/g," ").replace(/\s+/g," ").trim()};

const Storage={open(){return new Promise((res,rej)=>{let r=indexedDB.open(DB,1);r.onupgradeneeded=e=>{let d=e.target.result;if(!d.objectStoreNames.contains(SS))d.createObjectStore(SS,{keyPath:"id",autoIncrement:true});if(!d.objectStoreNames.contains(AS))d.createObjectStore(AS,{keyPath:"key"});};r.onsuccess=e=>res(e.target.result);r.onerror=e=>rej(e.target.error);});},store(n,m="readonly"){return App.db.transaction(n,m).objectStore(n);},all(n){return new Promise((res,rej)=>{let r=this.store(n).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},get(n,k){return new Promise((res,rej)=>{let r=this.store(n).get(k);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});},put(n,o){return new Promise((res,rej)=>{let t=App.db.transaction(n,"readwrite");t.objectStore(n).put(o);t.oncomplete=res;t.onerror=()=>rej(t.error);});},addMany(items){return new Promise((res,rej)=>{let t=App.db.transaction(SS,"readwrite"),s=t.objectStore(SS);items.forEach(x=>s.add(x));t.oncomplete=res;t.onerror=()=>rej(t.error);});},clear(n){return new Promise((res,rej)=>{let r=this.store(n,"readwrite").clear();r.onsuccess=res;r.onerror=()=>rej(r.error);});}};

const Library={parseCSV(text,defs){text=String(text||"").replace(/^﻿/,"");let rows=[],row=[],f="",q=false;for(let i=0;i<text.length;i++){let c=text[i],n=text[i+1];if(c=='"'&&q&&n=='"'){f+='"';i++;}else if(c=='"')q=!q;else if(c==","&&!q){row.push(f);f="";}else if((c=="\n"||c=="\r")&&!q){if(c=="\r"&&n=="\n")i++;row.push(f);f="";if(row.some(x=>x.trim()))rows.push(row);row=[];}else f+=c;}row.push(f);if(row.some(x=>x.trim()))rows.push(row);if(!rows.length)return[];let heads=rows[0].map(x=>x.trim().toLowerCase()),has=heads.includes("italian")||heads.includes("sentence")||heads.includes("english"),data=has?rows.slice(1):rows,idx=names=>{for(let n of names){let i=heads.indexOf(n);if(i>=0)return i;}return -1;},bi=idx(["book"]),ci=idx(["chapter","lesson","unit"]),oi=idx(["order","number","no","#"]),gi=idx(["group"]),ti=idx(["item"]),ii=idx(["italian","sentence","text","it","italiano"]),ei=idx(["english","translation","meaning","en"]);const ord=(r,i)=>{if(has&&gi>=0&&ti>=0){let g=Number(Util.clean(r[gi])),it=Number(Util.clean(r[ti]));if(g>0&&it>0)return(g-1)*10+it;}return Number(Util.clean(has&&oi>=0?r[oi]:i+1))||i+1;};return data.map((r,i)=>{let italian="",english="";if(has){italian=ii>=0?r[ii]:"";english=ei>=0?r[ei]:"";}else if(r.length>=5){italian=r[3];english=r[4];}else if(r.length>=2){italian=r[0];english=r[1];}else italian=r[0];return{book:Util.clean(has&&bi>=0?r[bi]:defs.book),chapter:Util.clean(has&&ci>=0?r[ci]:defs.chapter),order:ord(r,i),italian:Util.clean(italian),english:Util.clean(english),bookmarked:false,difficult:false,notes:""};}).filter(x=>x.italian);},chapter(){return App.sentences.filter(s=>s.book==App.cur.book&&s.chapter==App.cur.chapter).sort(Util.sortS);},group(){return this.chapter().filter(s=>Util.gnum(s)==Number(App.cur.group));},current(){let g=this.group();if(!g.length)return null;App.cur.index=Math.max(0,Math.min(App.cur.index,g.length-1));return g[App.cur.index];},async refresh(){App.sentences=(await Storage.all(SS)).sort(Util.sortS);if(App.sentences.length&&!App.cur.book){let s=App.sentences[0];App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:0};}UI.renderAll();}};

const UI={fill(sel,vals,val,label=x=>x){sel.innerHTML="";if(!vals.length){sel.innerHTML="<option>—</option>";return;}vals.forEach(v=>{let o=document.createElement("option");o.value=v;o.textContent=label(v);if(String(v)==String(val))o.selected=true;sel.appendChild(o);});},renderAll(){this.renderSelectors();this.renderTree();this.renderViewer();Verb.render();this.stats();},renderSelectors(){let books=Util.uniq(App.sentences.map(s=>s.book)).sort(Util.nat);if(!books.includes(App.cur.book)&&books[0])App.cur.book=books[0];let ch=Util.uniq(App.sentences.filter(s=>s.book==App.cur.book).map(s=>s.chapter)).sort(Util.nat);if(!ch.includes(App.cur.chapter)&&ch[0])App.cur.chapter=ch[0];let gs=Util.uniq(App.sentences.filter(s=>s.book==App.cur.book&&s.chapter==App.cur.chapter).map(Util.gnum)).sort((a,b)=>a-b);if(!gs.includes(Number(App.cur.group))&&gs[0])App.cur.group=gs[0];this.fill($("bookSel"),books,App.cur.book);this.fill($("chapterSel"),ch,App.cur.chapter);this.fill($("groupSel"),gs.map(String),String(App.cur.group),g=>"Group "+g);},renderTree(){let t=$("tree");t.innerHTML="";if(!App.sentences.length){t.innerHTML='<p class="small">No sentences imported yet.</p>';return;}Util.uniq(App.sentences.map(s=>s.book)).sort(Util.nat).forEach(b=>{let bd=document.createElement("div");bd.className="book "+(App.cur.book==b?"active":"");bd.textContent=b;bd.onclick=()=>{App.cur.book=b;App.cur.chapter="";App.cur.group=1;App.cur.index=0;UI.renderAll();};t.appendChild(bd);Util.uniq(App.sentences.filter(s=>s.book==b).map(s=>s.chapter)).sort(Util.nat).forEach(c=>{let cd=document.createElement("div");cd.className="chapter "+(App.cur.book==b&&App.cur.chapter==c?"active":"");cd.textContent=c;cd.onclick=()=>{App.cur.book=b;App.cur.chapter=c;App.cur.group=1;App.cur.index=0;UI.renderAll();};t.appendChild(cd);if(App.cur.book==b&&App.cur.chapter==c)Util.uniq(App.sentences.filter(s=>s.book==b&&s.chapter==c).map(Util.gnum)).sort((a,b)=>a-b).forEach(g=>{let gd=document.createElement("div");gd.className="groupItem "+(Number(App.cur.group)==g?"active":"");gd.textContent="Group "+g;gd.onclick=()=>{App.cur.group=g;App.cur.index=0;UI.renderAll();};t.appendChild(gd);});});});},card(s,active,i){let show=$("showEnglish").value=="show",d=document.createElement("div");d.className="card "+(active?"active":"");const selectCard=()=>{if(i!==undefined)SentenceController.jumpToIndex(i);};d.onclick=selectCard;d.addEventListener("touchend",e=>{if(e.target.closest("button"))return;e.preventDefault();selectCard();},{passive:false});d.innerHTML=`<span class="pill">${s.order}</span>${s.bookmarked?'<span class="pill">★ bookmarked</span>':""}<div class="italian">${Util.esc(s.italian)}</div>${show&&s.english?`<div class="english">${Util.esc(s.english)}</div>`:""}<div class="cardTools"><button class="mini light" data-a="play">Play</button><button class="mini light" data-a="bm">★ Bookmark</button><button class="mini light" data-a="edit">Edit</button></div>`;d.querySelector('[data-a="play"]').onclick=async e=>{e.stopPropagation();await Speech.speak(s.italian);};d.querySelector('[data-a="bm"]').onclick=async e=>{e.stopPropagation();s.bookmarked=!s.bookmarked;await Storage.put(SS,s);await Library.refresh();};d.querySelector('[data-a="edit"]').onclick=e=>{e.stopPropagation();Editor.open(s);};return d;},renderViewer(){let v=$("viewer");v.innerHTML="";if(!App.sentences.length){v.innerHTML='<div class="card"><h3>No sentences yet</h3><p>Import a CSV to begin.</p></div>';return;}v.innerHTML=`<h2>${Util.esc(App.cur.book)} — ${Util.esc(App.cur.chapter)} — Group ${App.cur.group}</h2>`;let g=Library.group(),q=$("search").value.trim().toLowerCase();if($("displayMode").value=="single"){let s=Library.current();if(s)v.appendChild(this.card(s,true));return;}g.filter(s=>!q||(s.italian+" "+s.english).toLowerCase().includes(q)).forEach((s,i)=>v.appendChild(this.card(s,i==App.cur.index,i)));setTimeout(()=>{let a=$("viewer").querySelector(".card.active");if(a)a.scrollIntoView({behavior:"smooth",block:"nearest"});},80);},stats(){let books=Util.uniq(App.sentences.map(s=>s.book)).length,ch=Util.uniq(App.sentences.map(s=>s.book+"|"+s.chapter)).length,gs=Util.uniq(App.sentences.map(s=>s.book+"|"+s.chapter+"|"+Util.gnum(s))).length;$("stats").innerHTML=`${App.sentences.length} sentences<br>${books} book(s), ${ch} chapter(s), ${gs} group(s)`;},status(msg,cls=""){$("status").textContent=msg;$("status").className="status "+cls;}};

const PlaybackControls={rate(){let id=App.playbackContext==="verb"&&$("verbRate")?"verbRate":"rate";return Number($(id).value)||1;},pause(){let id=App.playbackContext==="verb"&&$("verbPause")?"verbPause":"pause";return Number($(id).value)||0;},repeat(){let id=App.playbackContext==="verb"&&$("verbRepeat")?"verbRepeat":"repeat";let v=$(id).value;return v==="infinite"?"infinite":Number(v)||1;}};

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

class PlaybackEngine{constructor(name,button,statusPrefix=""){this.name=name;this.button=button;this.statusPrefix=statusPrefix;this.run=0;this.playing=false;this.paused=false;this.stopped=false;this.provider=null;}setButton(){if(this.button)this.button.textContent=this.playing?(this.paused?"Resume":"Pause"):"Start";}async wait(run){while(this.paused&&!this.stopped&&run===this.run)await Util.sleep(120);}toggle(providerFactory){if(!this.playing){this.start(providerFactory);return;}if(!this.paused){this.paused=true;speechSynthesis.pause();if(App.currentAudio)App.currentAudio.pause();UI.status((this.statusPrefix||"Playback")+" paused.","warntxt");this.setButton();MediaSessionMgr.paused();return;}this.paused=false;speechSynthesis.resume();if(App.currentAudio)App.currentAudio.play().catch(()=>{});UI.status("Playing…");this.setButton();MediaSessionMgr.playing();}stop(msg="Stopped."){this.run++;this.stopped=true;this.playing=false;this.paused=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status(msg,"warntxt");if(!MainPlayer.playing&&!VerbPlayer.playing){WakeLock.release();MediaSessionMgr.none();}}restart(providerFactory,delay=140){this.stop("Restarting…");setTimeout(()=>this.start(providerFactory),delay);}async start(providerFactory){if(this.playing)return;this.run++;let run=this.run;this.playing=true;this.paused=false;this.stopped=false;this.setButton();this.provider=providerFactory();App.playbackContext=this.name;UI.status("Playing…");WakeLock.request();MediaSessionMgr.playing();try{while(run===this.run&&!this.stopped){let item=this.provider.next();if(!item)break;if(item.onBefore)item.onBefore();if(item.label){UI.status(item.label);MediaSessionMgr.update(item.label,App.cur.book||"");}let reps=item.repeat??1;if(reps==="infinite"){while(run===this.run&&!this.stopped){await this.wait(run);if(run!==this.run||this.stopped)break;await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}else{for(let i=0;i<Number(reps)&&run===this.run&&!this.stopped;i++){await this.wait(run);if(run!==this.run||this.stopped)break;await Speech.speak(item.text);await this.wait(run);let pauseMs=PlaybackControls.pause();if(pauseMs>0)await Util.sleep(pauseMs);}}}}catch(e){UI.status("Playback error: "+(e&&e.message?e.message:e),"dangertxt");}finally{if(run===this.run){this.playing=false;this.paused=false;this.stopped=false;Speech.stop();App.playbackContext="main";this.setButton();UI.status("Finished.","oktxt");WakeLock.release();MediaSessionMgr.none();}}}}

const MainPlayer=new PlaybackEngine("main",null,"Sentence playback");
const VerbPlayer=new PlaybackEngine("verb",null,"Verb drill");

const SentenceController={repeat(){return PlaybackControls.repeat();},provider(){let mode=$("playMode").value||"group";if(mode==="current")return this.currentProvider(false);if(mode==="loop-current")return this.currentProvider(true);if(mode==="chapter")return this.sequenceProvider("chapter",false);if(mode==="loop-chapter")return this.sequenceProvider("chapter",true);if(mode==="loop-group")return this.sequenceProvider("group",true);return this.sequenceProvider("group",false);},currentProvider(loop){let done=false;return{next:()=>{let s=Library.current();if(!s)return null;if(done&&!loop)return null;done=true;return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping sentence ":"Sentence ")+s.order,onBefore:()=>UI.renderViewer()};}};},itemsForScope(scope){if(scope==="group")return Library.group();if(scope==="chapter")return Library.chapter();return Library.group();},sequenceProvider(scope,loop){let items=this.itemsForScope(scope),idx=0;if(scope==="group")idx=Math.max(0,Math.min(App.cur.index,items.length-1));else{let cur=Library.current();let pos=items.findIndex(x=>x.id===cur?.id);idx=Math.max(0,pos);}return{next:()=>{if(!items.length)return null;if(idx>=items.length){if(!loop)return null;idx=0;}let s=items[idx++];return{text:s.italian,repeat:this.repeat(),label:(loop?"Looping "+scope+" — ":"")+"Sentence "+s.order,onBefore:()=>{App.cur.book=s.book;App.cur.chapter=s.chapter;App.cur.group=Util.gnum(s);App.cur.index=Library.group().findIndex(x=>x.id===s.id);if(App.cur.index<0)App.cur.index=0;UI.renderAll();}};}};},toggle(){MainPlayer.toggle(()=>this.provider());},reset(){MainPlayer.stop("Audio engine reset. Press Start to continue.");},restart(){if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},jumpToIndex(i){App.cur.index=i;UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},next(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index<g.length-1)?App.cur.index+1:0;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());},prev(){let g=Library.group();if(g.length){App.cur.index=(App.cur.index>0)?App.cur.index-1:g.length-1;}UI.renderViewer();if(MainPlayer.playing)MainPlayer.restart(()=>this.provider());}};

const Verb={
  tenseOrder:["presente","passato","imperfetto","trapassato"],
  names:{presente:"congiuntivo presente",passato:"congiuntivo passato",imperfetto:"congiuntivo imperfetto",trapassato:"congiuntivo trapassato"},
  V:{
    /* — essere / avere — */
    essere:{en:"to be",presente:["sia","sia","sia","siamo","siate","siano"],imperfetto:["fossi","fossi","fosse","fossimo","foste","fossero"],aux:"essere",part:"stato"},
    avere:{en:"to have",presente:["abbia","abbia","abbia","abbiamo","abbiate","abbiano"],imperfetto:["avessi","avessi","avesse","avessimo","aveste","avessero"],aux:"avere",part:"avuto"},
    /* — modal / high-frequency — */
    potere:{en:"to be able to",presente:["possa","possa","possa","possiamo","possiate","possano"],imperfetto:["potessi","potessi","potesse","potessimo","poteste","potessero"],aux:"avere",part:"potuto"},
    volere:{en:"to want",presente:["voglia","voglia","voglia","vogliamo","vogliate","vogliano"],imperfetto:["volessi","volessi","volesse","volessimo","voleste","volessero"],aux:"avere",part:"voluto"},
    dovere:{en:"to have to",presente:["debba","debba","debba","dobbiamo","dobbiate","debbano"],imperfetto:["dovessi","dovessi","dovesse","dovessimo","doveste","dovessero"],aux:"avere",part:"dovuto"},
    sapere:{en:"to know",presente:["sappia","sappia","sappia","sappiamo","sappiate","sappiano"],imperfetto:["sapessi","sapessi","sapesse","sapessimo","sapeste","sapessero"],aux:"avere",part:"saputo"},
    /* — motion — */
    andare:{en:"to go",presente:["vada","vada","vada","andiamo","andiate","vadano"],imperfetto:["andassi","andassi","andasse","andassimo","andaste","andassero"],aux:"essere",part:"andato"},
    venire:{en:"to come",presente:["venga","venga","venga","veniamo","veniate","vengano"],imperfetto:["venissi","venissi","venisse","venissimo","veniste","venissero"],aux:"essere",part:"venuto"},
    partire:{en:"to leave",presente:["parta","parta","parta","partiamo","partiate","partano"],imperfetto:["partissi","partissi","partisse","partissimo","partiste","partissero"],aux:"essere",part:"partito"},
    arrivare:{en:"to arrive",presente:["arrivi","arrivi","arrivi","arriviamo","arriviate","arrivino"],imperfetto:["arrivassi","arrivassi","arrivasse","arrivassimo","arrivaste","arrivassero"],aux:"essere",part:"arrivato"},
    uscire:{en:"to go out",presente:["esca","esca","esca","usciamo","usciate","escano"],imperfetto:["uscissi","uscissi","uscisse","uscissimo","usciste","uscissero"],aux:"essere",part:"uscito"},
    /* — communication / cognition — */
    dire:{en:"to say",presente:["dica","dica","dica","diciamo","diciate","dicano"],imperfetto:["dicessi","dicessi","dicesse","dicessimo","diceste","dicessero"],aux:"avere",part:"detto"},
    parlare:{en:"to speak",presente:["parli","parli","parli","parliamo","parliate","parlino"],imperfetto:["parlassi","parlassi","parlasse","parlassimo","parlaste","parlassero"],aux:"avere",part:"parlato"},
    chiedere:{en:"to ask",presente:["chieda","chieda","chieda","chiediamo","chiediate","chiedano"],imperfetto:["chiedessi","chiedessi","chiedesse","chiedessimo","chiedeste","chiedessero"],aux:"avere",part:"chiesto"},
    rispondere:{en:"to answer",presente:["risponda","risponda","risponda","rispondiamo","rispondiate","rispondano"],imperfetto:["rispondessi","rispondessi","rispondesse","rispondessimo","rispondeste","rispondessero"],aux:"avere",part:"risposto"},
    capire:{en:"to understand",presente:["capisca","capisca","capisca","capiamo","capiate","capiscano"],imperfetto:["capissi","capissi","capisse","capissimo","capiste","capissero"],aux:"avere",part:"capito"},
    pensare:{en:"to think",presente:["pensi","pensi","pensi","pensiamo","pensiate","pensino"],imperfetto:["pensassi","pensassi","pensasse","pensassimo","pensaste","pensassero"],aux:"avere",part:"pensato"},
    credere:{en:"to believe",presente:["creda","creda","creda","crediamo","crediate","credano"],imperfetto:["credessi","credessi","credesse","credessimo","credeste","credessero"],aux:"avere",part:"creduto"},
    sperare:{en:"to hope",presente:["speri","speri","speri","speriamo","speriate","sperino"],imperfetto:["sperassi","sperassi","sperasse","sperassimo","speraste","sperassero"],aux:"avere",part:"sperato"},
    sapere:{en:"to know",presente:["sappia","sappia","sappia","sappiamo","sappiate","sappiano"],imperfetto:["sapessi","sapessi","sapesse","sapessimo","sapeste","sapessero"],aux:"avere",part:"saputo"},
    conoscere:{en:"to know (person/place)",presente:["conosca","conosca","conosca","conosciamo","conosciate","conoscano"],imperfetto:["conoscessi","conoscessi","conoscesse","conoscessimo","conosceste","conoscessero"],aux:"avere",part:"conosciuto"},
    /* — action — */
    fare:{en:"to do / make",presente:["faccia","faccia","faccia","facciamo","facciate","facciano"],imperfetto:["facessi","facessi","facesse","facessimo","faceste","facessero"],aux:"avere",part:"fatto"},
    dare:{en:"to give",presente:["dia","dia","dia","diamo","diate","diano"],imperfetto:["dessi","dessi","desse","dessimo","deste","dessero"],aux:"avere",part:"dato"},
    stare:{en:"to stay / be",presente:["stia","stia","stia","stiamo","stiate","stiano"],imperfetto:["stessi","stessi","stesse","stessimo","steste","stessero"],aux:"essere",part:"stato"},
    mettere:{en:"to put",presente:["metta","metta","metta","mettiamo","mettiate","mettano"],imperfetto:["mettessi","mettessi","mettesse","mettessimo","metteste","mettessero"],aux:"avere",part:"messo"},
    prendere:{en:"to take",presente:["prenda","prenda","prenda","prendiamo","prendiate","prendano"],imperfetto:["prendessi","prendessi","prendesse","prendessimo","prendeste","prendessero"],aux:"avere",part:"preso"},
    portare:{en:"to bring / carry",presente:["porti","porti","porti","portiamo","portiate","portino"],imperfetto:["portassi","portassi","portasse","portassimo","portaste","portassero"],aux:"avere",part:"portato"},
    trovare:{en:"to find",presente:["trovi","trovi","trovi","troviamo","troviate","trovino"],imperfetto:["trovassi","trovassi","trovasse","trovassimo","trovaste","trovassero"],aux:"avere",part:"trovato"},
    aprire:{en:"to open",presente:["apra","apra","apra","apriamo","apriate","aprano"],imperfetto:["aprissi","aprissi","aprisse","aprissimo","apriste","aprissero"],aux:"avere",part:"aperto"},
    /* — perception / state — */
    vedere:{en:"to see",presente:["veda","veda","veda","vediamo","vediate","vedano"],imperfetto:["vedessi","vedessi","vedesse","vedessimo","vedeste","vedessero"],aux:"avere",part:"visto"},
    sentire:{en:"to feel / hear",presente:["senta","senta","senta","sentiamo","sentiate","sentano"],imperfetto:["sentissi","sentissi","sentisse","sentissimo","sentiste","sentissero"],aux:"avere",part:"sentito"},
    leggere:{en:"to read",presente:["legga","legga","legga","leggiamo","leggiate","leggano"],imperfetto:["leggessi","leggessi","leggesse","leggessimo","leggeste","leggessero"],aux:"avere",part:"letto"},
    scrivere:{en:"to write",presente:["scriva","scriva","scriva","scriviamo","scriviate","scrivano"],imperfetto:["scrivessi","scrivessi","scrivesse","scrivessimo","scriveste","scrivessero"],aux:"avere",part:"scritto"},
    vivere:{en:"to live",presente:["viva","viva","viva","viviamo","viviate","vivano"],imperfetto:["vivessi","vivessi","vivesse","vivessimo","viveste","vivessero"],aux:"avere",part:"vissuto"},
    finire:{en:"to finish",presente:["finisca","finisca","finisca","finiamo","finiate","finiscano"],imperfetto:["finissi","finissi","finisse","finissimo","finiste","finissero"],aux:"avere",part:"finito"},
    dormire:{en:"to sleep",presente:["dorma","dorma","dorma","dormiamo","dormiate","dormano"],imperfetto:["dormissi","dormissi","dormisse","dormissimo","dormiste","dormissero"],aux:"avere",part:"dormito"},
    lavorare:{en:"to work",presente:["lavori","lavori","lavori","lavoriamo","lavoriate","lavorino"],imperfetto:["lavorassi","lavorassi","lavorasse","lavorassimo","lavoraste","lavorassero"],aux:"avere",part:"lavorato"},
    aspettare:{en:"to wait",presente:["aspetti","aspetti","aspetti","aspettiamo","aspettiate","aspettino"],imperfetto:["aspettassi","aspettassi","aspettasse","aspettassimo","aspettaste","aspettassero"],aux:"avere",part:"aspettato"},
    amare:{en:"to love",presente:["ami","ami","ami","amiamo","amiate","amino"],imperfetto:["amassi","amassi","amasse","amassimo","amaste","amassero"],aux:"avere",part:"amato"},
    mangiare:{en:"to eat",presente:["mangi","mangi","mangi","mangiamo","mangiate","mangino"],imperfetto:["mangiassi","mangiassi","mangiasse","mangiassimo","mangiaste","mangiassero"],aux:"avere",part:"mangiato"},
    chiamare:{en:"to call",presente:["chiami","chiami","chiami","chiamiamo","chiamiate","chiamino"],imperfetto:["chiamassi","chiamassi","chiamasse","chiamassimo","chiamaste","chiamassero"],aux:"avere",part:"chiamato"},
    guardare:{en:"to watch / look",presente:["guardi","guardi","guardi","guardiamo","guardiate","guardino"],imperfetto:["guardassi","guardassi","guardasse","guardassimo","guardaste","guardassero"],aux:"avere",part:"guardato"}
  },
  part(part,i){
    const plural={
      stato:"stati",andato:"andati",venuto:"venuti",partito:"partiti",
      arrivato:"arrivati",uscito:"usciti",vissuto:"vissuti"
    };
    return i>=3?(plural[part]||part):part;
  },
  forms(v,t){let d=this.V[v];if(!d)return[];if(t==="presente"||t==="imperfetto")return d[t];let aux=this.V[d.aux][t==="passato"?"presente":"imperfetto"];return aux.map((x,i)=>x+" "+this.part(d.part,i));},
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
  render(){
    if(!$("verbSel"))return;
    let old=$("verbSel").value,detected=this.detect(this.scope().map(s=>s.italian));
    let verbs=detected.length?detected:Object.keys(this.V).sort(Util.nat);
    UI.fill($("verbSel"),verbs,verbs.includes(old)?old:verbs[0]);
    if(detected.length){
      $("detected").innerHTML=`Detected verbs (${detected.length}): `+detected.map(v=>`<span class="pill">${v}</span>`).join(" ");
      $("detected").className="status oktxt";
    }else{
      $("detected").innerHTML=`No verbs detected in this scope — showing all ${verbs.length} available.`;
      $("detected").className="status warntxt";
    }
    this.renderView();
  },
  renderView(){let v=$("verbSel").value,d=this.V[v];if(!d){$("verbView").innerHTML="";return;}$("verbView").innerHTML=`<div class="verbRef"><strong>${v}</strong> = ${Util.esc(d.en)} · reference: <strong>${Util.esc(this.forms(v,"presente")[0])}</strong></div><div class="tenseGrid">${this.tenseOrder.map(t=>`<div class="tenseCard" id="tense_${t}"><h3>${this.names[t]}</h3><div class="formsLine">${Util.esc(this.line(v,t))}</div></div>`).join("")}</div>`;this.highlight();},
  highlight(){document.querySelectorAll(".tenseCard").forEach(x=>x.classList.remove("active"));let c=$("tense_"+this.selectedTense());if(c)c.classList.add("active");},
  provider(){let mode=$("verbMode").value,verbs=[...$("verbSel").options].map(o=>o.value),vi=$("verbSel").selectedIndex<0?0:$("verbSel").selectedIndex,ti=App.verbTenseIndex;if(mode==="once")return this.tenseProvider(verbs,vi,ti,false);if(mode==="looptense")return this.tenseProvider(verbs,vi,ti,true);if(mode==="loopverb")return this.verbProvider(verbs,vi,ti,true,false);if(mode==="nextverb")return this.verbProvider(verbs,vi,ti,false,false);if(mode==="loopverbs")return this.verbProvider(verbs,vi,ti,false,true);return this.tenseProvider(verbs,vi,ti,false);},
  tenseProvider(verbs,vi,ti,loop){let done=false;return{next:()=>{if(done&&!loop)return null;done=true;let v=verbs[vi],t=this.tenseOrder[ti];return{text:this.line(v,t),repeat:PlaybackControls.repeat(),label:`${v} — ${this.names[t]}`,onBefore:()=>{$("verbSel").selectedIndex=vi;App.verbTenseIndex=ti;this.renderView();}};}};},
  verbProvider(verbs,vi,ti,loopVerb,loopVerbs){let curV=vi,curT=ti;return{next:()=>{if(curV>=verbs.length){if(loopVerbs)curV=0;else return null;}let v=verbs[curV],t=this.tenseOrder[curT];let snapV=curV,snapT=curT;let item={text:this.line(v,t),repeat:PlaybackControls.repeat(),label:`${v} — ${this.names[t]}`,onBefore:()=>{$("verbSel").selectedIndex=snapV;App.verbTenseIndex=snapT;this.renderView();}};curT++;if(curT>=this.tenseOrder.length){curT=0;if(!loopVerb)curV++;}return item;}};},
  toggle(){VerbPlayer.toggle(()=>this.provider());},
  restart(){if(VerbPlayer.playing)VerbPlayer.restart(()=>this.provider());},
  moveTense(delta){App.verbTenseIndex+=delta;if(App.verbTenseIndex<0)App.verbTenseIndex=this.tenseOrder.length-1;if(App.verbTenseIndex>=this.tenseOrder.length)App.verbTenseIndex=0;this.renderView();if(VerbPlayer.playing)this.restart();}
};

const Editor={sentence:null,open(s){this.sentence=s;$("editItalian").value=s.italian||"";$("editEnglish").value=s.english||"";$("editModal").style.display="flex";setTimeout(()=>$("editItalian").focus(),50);},close(){$("editModal").style.display="none";this.sentence=null;},async save(){let s=this.sentence;if(!s)return;s.italian=$("editItalian").value.trim();s.english=$("editEnglish").value.trim();if(!s.italian){alert("Italian sentence cannot be empty.");return;}await Storage.put(SS,s);this.close();await Library.refresh();UI.status("Sentence updated.","oktxt");}};

const Importer={open(){App.analysed=[];$("importSummary").textContent="No CSV analysed yet.";$("importPreview").innerHTML="";$("importModal").style.display="flex";},preview(items){App.analysed=items;$("importSummary").textContent=items.length?`Detected ${items.length} sentences.`:"No sentences detected.";$("importSummary").className="status "+(items.length?"oktxt":"dangertxt");let sm=items.slice(0,12);$("importPreview").innerHTML=items.length?`<table><thead><tr><th>Book</th><th>Chapter</th><th>#</th><th>Italian</th><th>English</th></tr></thead><tbody>${sm.map(s=>`<tr><td>${Util.esc(s.book)}</td><td>${Util.esc(s.chapter)}</td><td>${s.order}</td><td>${Util.esc(s.italian)}</td><td>${Util.esc(s.english)}</td></tr>`).join("")}</tbody></table>`:"";},async import(){if(!App.analysed.length){alert("Analyse first.");return;}await Storage.addMany(App.analysed);let s=App.analysed[0];App.cur={book:s.book,chapter:s.chapter,group:Util.gnum(s),index:0};App.analysed=[];$("importModal").style.display="none";await Library.refresh();UI.status("Imported successfully.","oktxt");}};

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
    verbs.forEach(v=>Verb.tenseOrder.forEach(t=>{let line=Verb.line(v,t);if(line.trim())texts.push(line);}));
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
  async reacquire(){if(!this.lock&&(MainPlayer.playing||VerbPlayer.playing))await this.request();}
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
  running:false,cancelled:false,abort:null,rows:[],csv:"",meta:null,
  key(){return ($("aiKey")?$("aiKey").value:"").trim();},
  model(){return (($("aiModel")?$("aiModel").value:"").trim())||"gpt-4o-mini";},
  status(msg,cls=""){let el=$("genStatus");if(el){el.textContent=msg;el.className="status "+cls;}},
  setBusy(b){
    ["genBtn","genSave","genDownload"].forEach(id=>{let el=$(id);if(el)el.disabled=b;});
    let c=$("genCancel");if(c)c.classList.toggle("hidden",!b);
    if(!b)this.setOutputButtons(this.rows.length>0);
  },
  setOutputButtons(on){["genSave","genDownload"].forEach(id=>{let el=$(id);if(el)el.disabled=!on;});},
  setPreview(html){let el=$("genPreview");if(!el)return;el.innerHTML=html;el.classList.toggle("hidden",!html);},

  instructions(o){
    let tense=o.tense==="mixed"
      ? "Spread the sentences naturally across a range of tenses and moods that a real speaker would use with this word; do not confine them to one tense."
      : `Every sentence must place the target expression in the ${o.tense}. Where the target word itself cannot carry that tense (for example a noun or an adverb), the main verb of the sentence must be in the ${o.tense}.`;
    let register={
      neutral:"Use neutral, everyday contemporary Italian.",
      formal:"Use a formal, professional register suitable for work or study contexts.",
      colloquial:"Use relaxed, colloquial spoken Italian of the kind heard between friends.",
      literary:"Use a careful written register of the kind found in essays and quality journalism."
    }[o.register]||"Use neutral, everyday contemporary Italian.";
    return [
      "You write Italian shadowing material for an English-speaking adult learner.",
      "",
      `Target expression: "${o.word}".`,
      `Write exactly ${o.batch} sentences.`,
      "",
      "Rules:",
      "1. Every sentence must contain the target expression, correctly inflected for the grammar of that sentence. Pronominal and idiomatic expressions may appear in their split or conjugated forms.",
      "2. Each sentence must be sayable in one breath: roughly 6 to 14 words.",
      "3. Vary the grammatical person, the situation and the sentence shape across the set. Do not reuse the same opening twice.",
      "4. The Italian must be idiomatic and natural. Never produce a translation of an English sentence.",
      "5. " + tense,
      "6. " + register,
      o.english
        ? "7. Give an idiomatic English translation of each sentence — natural English, not word-for-word glossing."
        : "7. Leave every English field as an empty string.",
      "8. No numbering, no bullets, no surrounding quotation marks, no commentary.",
      o.avoid.length?`9. Do not repeat any of these sentences already produced: ${o.avoid.slice(-40).map(s=>'"'+s+'"').join("; ")}`:"",
      "",
      'Reply with JSON only, in this exact shape: {"sentences":[{"italian":"...","english":"..."}]}'
    ].filter(Boolean).join("\n");
  },

  async call(body){
    const controller=new AbortController();
    this.abort=controller;
    let timer=setTimeout(()=>controller.abort(),90000),r;
    try{
      r=await fetch("https://api.openai.com/v1/chat/completions",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+this.key()},
        body:JSON.stringify(body),
        signal:controller.signal
      });
    }catch(e){
      if(e&&e.name==="AbortError"){if(this.cancelled)return null;throw new Error("OpenAI request timed out");}
      throw new Error("Could not reach OpenAI: "+(e&&e.message?e.message:e));
    }finally{clearTimeout(timer);if(this.abort===controller)this.abort=null;}
    if(r.status===401)throw new Error("OpenAI rejected the API key (401).");
    if(r.status===429)throw new Error("OpenAI rate limit or quota reached (429).");
    if(!r.ok){
      let detail="";try{let j=await r.json();detail=j?.error?.message||"";}catch(e){}
      let err=new Error("OpenAI error "+r.status+(detail?": "+detail:""));err.status=r.status;err.detail=detail;throw err;
    }
    return r.json();
  },

  /* Some models reject temperature or JSON mode; retry progressively plainer. */
  async batch(o){
    let base={model:this.model(),messages:[{role:"user",content:this.instructions(o)}]};
    let attempts=[
      {...base,temperature:.85,response_format:{type:"json_object"}},
      {...base,response_format:{type:"json_object"}},
      base
    ];
    let lastErr=null;
    for(let body of attempts){
      try{
        let j=await this.call(body);
        if(j===null)return[];
        let text=j?.choices?.[0]?.message?.content||"";
        let out=this.parse(text);
        if(out.length)return out;
        lastErr=new Error("OpenAI returned no usable sentences.");
      }catch(e){
        lastErr=e;
        if(e.status!==400)throw e;
      }
    }
    throw lastErr||new Error("Generation failed.");
  },

  parse(text){
    let obj=null;
    try{obj=JSON.parse(text);}
    catch(e){let m=text.match(/\{[\s\S]*\}/);if(m){try{obj=JSON.parse(m[0]);}catch(e2){}}}
    if(!obj)return[];
    let list=Array.isArray(obj)?obj:(obj.sentences||obj.items||obj.data||[]);
    if(!Array.isArray(list))return[];
    return list.map(x=>{
      if(typeof x==="string")return{italian:Util.clean(x),english:""};
      return{italian:Util.clean(x.italian||x.it||x.sentence||""),english:Util.clean(x.english||x.en||x.translation||"")};
    }).filter(x=>x.italian);
  },

  async start(){
    if(this.running)return;
    let word=($("genWord").value||"").trim();
    if(!word){this.status("Enter the word or expression you want to shadow.","warntxt");return;}
    if(!this.key()){this.status("Add your OpenAI API key in Settings first.","warntxt");return;}
    let total=Number($("genCount").value)||20,
        tense=$("genTense").value,
        register=$("genRegister").value,
        english=$("genEnglish").value!=="no",
        chapter=($("genChapter").value||"").trim()||word;

    this.running=true;this.cancelled=false;this.rows=[];this.csv="";
    this.setBusy(true);
    this.setPreview("");

    let collected=[],seen=new Set(),rounds=0,maxRounds=Math.ceil(total/15)+2;
    try{
      while(collected.length<total&&rounds<maxRounds&&!this.cancelled){
        rounds++;
        let need=Math.min(15,total-collected.length);
        this.status(`Generating… ${collected.length} of ${total} sentences so far.`);
        let got=await this.batch({word,batch:need,tense,register,english,avoid:collected.map(s=>s.italian)});
        if(this.cancelled)break;
        for(let s of got){
          let k=Util.norm(s.italian);
          if(!k||seen.has(k))continue;
          seen.add(k);collected.push(s);
          if(collected.length>=total)break;
        }
      }
    }catch(e){
      this.running=false;this.setBusy(false);
      this.status(e&&e.message?e.message:"Generation failed.","dangertxt");
      return;
    }

    this.running=false;
    if(this.cancelled&&!collected.length){this.setBusy(false);this.status("Cancelled.","warntxt");return;}
    if(!collected.length){this.setBusy(false);this.status("No sentences were produced. Try again, or check the model name in Settings.","dangertxt");return;}

    this.meta={word,chapter,tense,register,total};
    let startOrder=this.nextOrder(chapter);
    this.rows=CSVTemplate.rows(collected,{
      book:GEN_BOOK,chapter,
      chapterTitle:tense==="mixed"?`${word} — mixed tenses`:`${word} — ${tense}`,
      idPrefix:"GEN-"+Util.slug(word).toUpperCase(),
      startOrder,
      sourceFile:"AI generated in app ("+this.model()+")",
      notes:"Generated from target expression \""+word+"\"; "+(tense==="mixed"?"mixed tenses":tense)+"; "+register+" register. Not reviewed."
    });
    this.csv=CSVTemplate.build(this.rows);
    this.render(collected.length,startOrder);
    this.setBusy(false);
  },

  nextOrder(chapter){
    let existing=App.sentences.filter(s=>s.book===GEN_BOOK&&String(s.chapter)===String(chapter));
    if(!existing.length)return 1;
    return Math.max(...existing.map(s=>Number(s.order)||0))+1;
  },

  render(count,startOrder){
    let target=Util.norm(this.meta.word),
        exact=this.rows.filter(r=>Util.norm(r.Italian).includes(target)).length,
        groups=Util.uniq(this.rows.map(r=>r.Group)).length,
        head=`${count} sentences ready for "${this.meta.word}" — ${groups} group(s), numbered from ${startOrder}.`,
        detail=exact===count
          ? " Every sentence carries the expression unchanged."
          : ` ${exact} of ${count} carry it unchanged; the rest should be inflected or split forms, so read through before drilling.`;
    this.status(head+detail+(this.cancelled?" Stopped early.":""),"oktxt");
    this.setPreview(`<table><thead><tr><th>ID</th><th>Group</th><th>#</th><th>Italian</th><th>English</th></tr></thead><tbody>${
      this.rows.map(r=>`<tr><td>${Util.esc(r.ID)}</td><td>${r.Group}</td><td>${r.Item}</td><td>${Util.esc(r.Italian)}</td><td>${Util.esc(r.English)}</td></tr>`).join("")
    }</tbody></table>`);
  },

  cancel(){
    this.cancelled=true;
    if(this.abort){try{this.abort.abort();}catch(e){}this.abort=null;}
    this.status("Cancelling…","warntxt");
  },

  /* Round-trip through the template: the CSV built above is parsed back with the
     same importer used for hand-made corpus files, so nothing is special-cased. */
  async save(){
    if(!this.csv||!this.rows.length){this.status("Generate some sentences first.","warntxt");return;}
    let items=Library.parseCSV(this.csv,{book:GEN_BOOK,chapter:this.meta.chapter});
    if(!items.length){this.status("The generated set could not be read back from the template.","dangertxt");return;}
    await Storage.addMany(items);
    let first=items[0];
    App.cur={book:first.book,chapter:first.chapter,group:Util.gnum(first),index:0};
    await Library.refresh();
    this.status(`Saved ${items.length} sentences to ${GEN_BOOK} → ${this.meta.chapter}. Open Study to shadow them.`,"oktxt");
    UI.status(`Added ${items.length} generated sentences.`,"oktxt");
    this.rows=[];this.csv="";
    this.setPreview("");
    this.setOutputButtons(false);
  },

  downloadCsv(){
    if(!this.csv){this.status("Generate some sentences first.","warntxt");return;}
    download(`generated-${Util.slug(this.meta.word)}.csv`,this.csv,"text/csv;charset=utf-8");
  }
};

function bind(){
  MainPlayer.button=$("mainToggle");VerbPlayer.button=$("verbToggle");
  function activatePanel(p){document.querySelectorAll(".desktop-tabs [data-panel]").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".panel").forEach(x=>x.classList.add("hidden"));let tb=document.querySelector(".desktop-tabs [data-panel='"+p+"']");if(tb)tb.classList.add("active");$(p).classList.remove("hidden");if(p==="verbs"){if(MainPlayer.playing)MainPlayer.stop("Switched to Verb Drill.");Verb.render();}else if(p==="study"&&VerbPlayer.playing)VerbPlayer.stop("Switched to Study.");else if(p==="settings"||p==="generate"){let lbl=p==="generate"?"Switched to Generate.":"Switched to Settings.";if(MainPlayer.playing)MainPlayer.stop(lbl);if(VerbPlayer.playing)VerbPlayer.stop(lbl);}}document.querySelectorAll(".desktop-tabs [data-panel]").forEach(b=>b.onclick=()=>activatePanel(b.dataset.panel));function activateScreen(s){document.body.setAttribute("data-screen",s);document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.screen===s));if(s!=="library")activatePanel(s);}document.querySelectorAll(".mobile-nav-btn").forEach(b=>b.onclick=()=>activateScreen(b.dataset.screen));if($("goToSettings"))$("goToSettings").onclick=()=>activateScreen("settings");
  $("openImport").onclick=()=>Importer.open();
  $("closeImport").onclick=()=>$("importModal").style.display="none";
  $("analyseFile").onclick=async()=>{let f=$("csvFile").files[0];if(!f){alert("Choose a CSV first.");return;}Importer.preview(Library.parseCSV(await f.text(),{book:$("defaultBook").value,chapter:$("defaultChapter").value}));};
  $("analysePaste").onclick=()=>Importer.preview(Library.parseCSV($("pasteCsv").value,{book:$("defaultBook").value,chapter:$("defaultChapter").value}));
  $("importPreviewed").onclick=()=>Importer.import();
  $("exportCsv").onclick=()=>download("italian-shadowing-library-v103.csv",toCSV(),"text/csv;charset=utf-8");
  $("clearAll").onclick=async()=>{if(confirm("Delete whole local library and audio cache?")){await Storage.clear(SS);await Storage.clear(AS);App.sentences=[];App.cur={book:"",chapter:"",group:1,index:0};UI.renderAll();}};
  $("bookSel").onchange=e=>{App.cur.book=e.target.value;App.cur.chapter="";App.cur.group=1;App.cur.index=0;UI.renderAll();};
  $("chapterSel").onchange=e=>{App.cur.chapter=e.target.value;App.cur.group=1;App.cur.index=0;UI.renderAll();};
  $("groupSel").onchange=e=>{App.cur.group=Number(e.target.value);App.cur.index=0;UI.renderAll();};
  $("prevGroup").onclick=()=>Nav.prevGroup();
  $("nextGroup").onclick=()=>Nav.nextGroup();
  $("prevSentence").onclick=()=>SentenceController.prev();
  $("nextSentence").onclick=()=>SentenceController.next();
  $("mainToggle").onclick=()=>SentenceController.toggle();
  $("hardReset").onclick=()=>{MainPlayer.stop("Audio reset.");VerbPlayer.stop("Audio reset.");};
  ["displayMode","showEnglish"].forEach(id=>$(id).onchange=()=>UI.renderViewer());
  $("playMode").onchange=()=>SentenceController.restart();
  $("search").oninput=()=>UI.renderViewer();
  $("closeEdit").onclick=()=>Editor.close();
  $("closeEditBottom").onclick=()=>Editor.close();
  $("saveEdit").onclick=()=>Editor.save();
  $("editModal").onclick=e=>{if(e.target===$("editModal"))Editor.close();};
  ["repeat","rate","pause","verbRepeat","verbRate","verbPause"].forEach(id=>{if($(id))$(id).onchange=()=>{if(MainPlayer.playing)SentenceController.restart();if(VerbPlayer.playing)Verb.restart();};});
  $("voiceMode").onchange=()=>{let _m=$("voiceMode").value;localStorage.setItem("v08voiceMode",_m);$("elevenPanel").classList.toggle("hidden",_m!=="eleven");if($("voiceChipLabel"))$("voiceChipLabel").textContent=_m==="eleven"?"ElevenLabs":"System (Alice)";};
  $("saveElevenBtn").onclick=()=>{if($("saveEleven").value==="yes"){localStorage.setItem("v08key",$("apiKey").value);localStorage.setItem("v08voice",$("voiceId").value);localStorage.setItem("v08model",$("model").value);localStorage.setItem("v08voiceMode","eleven");$("voiceMode").value="eleven";$("elevenPanel").classList.remove("hidden");UI.status("ElevenLabs settings saved.","oktxt");}else{UI.status("Settings not saved — change 'Save locally' to save on this browser.","warntxt");}};
  $("clearElevenBtn").onclick=()=>{["v08key","v08voice","v08model"].forEach(k=>localStorage.removeItem(k));$("apiKey").value="";$("voiceId").value="";UI.status("ElevenLabs settings cleared.","warntxt");};
  $("preloadBtn").onclick=()=>Preloader.start();
  $("preloadCancel").onclick=()=>Preloader.cancel();
  $("saveAiBtn").onclick=()=>{if($("saveAi").value==="yes"){localStorage.setItem("v08aiKey",$("aiKey").value);localStorage.setItem("v08aiModel",$("aiModel").value);UI.status("AI settings saved on this browser.","oktxt");}else{UI.status("AI settings not saved — change 'Save locally' to save on this browser.","warntxt");}};
  $("clearAiBtn").onclick=()=>{["v08aiKey","v08aiModel"].forEach(k=>localStorage.removeItem(k));$("aiKey").value="";$("aiModel").value="gpt-4o-mini";UI.status("AI settings cleared.","warntxt");};
  $("genBtn").onclick=()=>Generator.start();
  $("genCancel").onclick=()=>Generator.cancel();
  $("genSave").onclick=()=>Generator.save();
  $("genDownload").onclick=()=>Generator.downloadCsv();
  $("genWord").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();Generator.start();}};
  Generator.setOutputButtons(false);
  Generator.setPreview("");
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
(async function init(){let _th=localStorage.getItem("v08theme")||"sage";document.documentElement.setAttribute("data-theme",_th);if($("themeToggle"))$("themeToggle").checked=_th==="dark";App.db=await Storage.open();bind();MediaSessionMgr.init();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")WakeLock.reacquire();});window.addEventListener("orientationchange",()=>{setTimeout(()=>{if((MainPlayer.playing&&!MainPlayer.paused)||(VerbPlayer.playing&&!VerbPlayer.paused)){if(!speechSynthesis.speaking&&!App.currentAudio){if(MainPlayer.playing)SentenceController.restart();else if(VerbPlayer.playing)Verb.restart();}}},600);});Speech.loadVoices();$("apiKey").value=localStorage.getItem("v08key")||"";$("voiceId").value=localStorage.getItem("v08voice")||"";$("model").value=localStorage.getItem("v08model")||"eleven_multilingual_v2";$("aiKey").value=localStorage.getItem("v08aiKey")||"";$("aiModel").value=localStorage.getItem("v08aiModel")||"gpt-4o-mini";if(localStorage.getItem("v08aiKey"))$("saveAi").value="yes";$("voiceMode").value=localStorage.getItem("v08voiceMode")||"eleven";$("elevenPanel").classList.toggle("hidden",$("voiceMode").value!=="eleven");if($("voiceChipLabel"))$("voiceChipLabel").textContent=$("voiceMode").value==="eleven"?"ElevenLabs":"System (Alice)";await Library.refresh();MainPlayer.setButton();VerbPlayer.setButton();})();

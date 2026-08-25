import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const worker = (await import(path.join(here, '..', 'worker.js'))).default;

const ENV={GEMINI_API_KEY:'SECRET-KEY-12345',APP_TOKEN:'pass123',ALLOWED_ORIGIN:'https://sirob-jpg.github.io'};
const ok=[],fail=[];
const check=(n,c,x='')=>(c?ok:fail).push(n+(x?' — '+x:''));

let lastUpstream=null;
let j;
function stub(status,payload){
  globalThis.fetch=async(url,opts)=>{ lastUpstream={url,body:JSON.parse(opts.body)};
    return new Response(typeof payload==='string'?payload:JSON.stringify(payload),{status}); };
}
const req=(body,{token='pass123',origin='https://sirob-jpg.github.io',method='POST',path='/',contentType='application/json'}={})=>{
  const h={};
  if(contentType!==null) h['Content-Type']=contentType;
  if(token!==null) h['X-App-Token']=token;
  if(origin!==null) h['Origin']=origin;
  return new Request(`https://relay.example.com${path}`,{method,headers:h,body:method==='POST'?JSON.stringify(body):undefined});
};
const ttsReq=(body,options={})=>req(body,{...options,path:'/tts'});
const good={candidates:[{content:{parts:[{text:JSON.stringify({sentences:[
  {italian:'Ce la faccio da solo, tranquillo.',english:'I can manage alone, don\'t worry.'},
  {italian:'Non ce la faremo mai in tempo.',english:'We will never make it in time.'}]})}]}}]};

// preflight
let r=await worker.fetch(req({},{method:'OPTIONS'}),ENV);
check('OPTIONS preflight answered',r.status===204,String(r.status));
check('Preflight allows only the app origin',r.headers.get('Access-Control-Allow-Origin')==='https://sirob-jpg.github.io');
check('Preflight permits the token header',/X-App-Token/i.test(r.headers.get('Access-Control-Allow-Headers')||''));

// auth
stub(200,good);
r=await worker.fetch(req({word:'farcela'},{token:'wrong'}),ENV);
check('Wrong passphrase rejected',r.status===401,String(r.status));
r=await worker.fetch(req({word:'farcela'},{token:null}),ENV);
check('Missing passphrase rejected',r.status===401,String(r.status));
r=await worker.fetch(req({word:'farcela'},{origin:'https://evil.example.com'}),ENV);
check('Foreign origin rejected',r.status===403,String(r.status));

// validation
r=await worker.fetch(req({}),ENV);
check('Missing word rejected',r.status===400,String(r.status));
r=await worker.fetch(req({word:'x'.repeat(200)}),ENV);
check('Over-long expression rejected',r.status===400,String(r.status));
r=await worker.fetch(req({word:'ciao',unexpected:true}),ENV); j=await r.json();
check('Unknown generation field rejected',r.status===400&&/Unknown request field/.test(j.error),`${r.status} ${j.error}`);
r=await worker.fetch(req({word:'ciao'},{contentType:'text/plain'}),ENV);
check('Non-JSON content type rejected',r.status===415,String(r.status));
const hugeReq=new Request('https://relay.example.com/',{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':'pass123','Origin':'https://sirob-jpg.github.io'},body:JSON.stringify({word:'ciao',avoid:['x'.repeat(40_000)]})});
r=await worker.fetch(hugeReq,ENV);
check('Oversized request body rejected',r.status===413,String(r.status));

// happy path
r=await worker.fetch(req({word:'farcela',count:2,tense:'congiuntivo presente',register:'colloquial',english:true}),ENV);
j=await r.json();
check('Valid request succeeds',r.status===200,String(r.status));
check('Sentences returned',j.sentences?.length===2,JSON.stringify(j).slice(0,80));
check('Model reported back',typeof j.model==='string'&&j.model.length>0,j.model);
check('Prompt built server-side carries the word',/Target expression: "farcela"/.test(lastUpstream.body.contents[0].parts[0].text));
check('Prompt carries the tense',/congiuntivo presente/.test(lastUpstream.body.contents[0].parts[0].text));
check('Prompt carries the register',/colloquial spoken Italian/.test(lastUpstream.body.contents[0].parts[0].text));
check('JSON response mode requested',lastUpstream.body.generationConfig.responseMimeType==='application/json');

// count validation is fail-closed
r=await worker.fetch(req({word:'a',count:9999}),ENV); j=await r.json();
check('Count above the maximum is rejected',r.status===400&&/count/i.test(j.error),`${r.status} ${j.error}`);
r=await worker.fetch(req({word:'a',count:-4}),ENV); j=await r.json();
check('Negative count is rejected',r.status===400&&/count/i.test(j.error),`${r.status} ${j.error}`);

// avoid list
await worker.fetch(req({word:'a',count:3,avoid:['Uno.','Due.']}),ENV);
check('Avoid list forwarded',/Do not repeat.*"Uno\."/.test(lastUpstream.body.contents[0].parts[0].text));

// upstream failures
stub(429,{error:{message:'quota'}});
r=await worker.fetch(req({word:'a'}),ENV); j=await r.json();
check('Quota exhaustion reported plainly',r.status===429&&/allowance/i.test(j.error),j.error);

stub(400,{error:{message:'API key not valid: SECRET-KEY-12345'}});
r=await worker.fetch(req({word:'a'}),ENV); j=await r.json();
check('Upstream error mapped to 502',r.status===502,String(r.status));
check('API key never echoed to the browser',!JSON.stringify(j).includes('SECRET-KEY-12345'),JSON.stringify(j));

stub(200,{candidates:[{content:{parts:[{text:'not json at all'}]}}]});
r=await worker.fetch(req({word:'a'}),ENV); j=await r.json();
check('Unparseable model output handled',r.status===502&&/no usable sentences/i.test(j.error),j.error);

globalThis.fetch=async()=>{throw new Error('network down');};
r=await worker.fetch(req({word:'a'}),ENV); j=await r.json();
check('Network failure handled',r.status===502&&/Could not reach Google/.test(j.error),j.error);

// misconfiguration
stub(200,good);
r=await worker.fetch(req({word:'a'}),{...ENV,GEMINI_API_KEY:undefined});
check('Missing key reported as a setup problem',r.status===500,String(r.status));
r=await worker.fetch(req({word:'a'}),{...ENV,APP_TOKEN:undefined});
check('Missing token setting reported',r.status===500,String(r.status));

// abuse controls and emergency switch
r=await worker.fetch(req({word:'a'}),{...ENV,GENERATION_DISABLED:'true'});
check('Generation kill switch returns a retryable outage',r.status===503&&r.headers.get('Retry-After')==='3600',String(r.status));
r=await worker.fetch(req({word:'a'}),{...ENV,RATE_LIMITER:{limit:async()=>({success:false})}}); j=await r.json();
check('Native rate-limit rejection is enforced',r.status===429&&r.headers.get('Retry-After')==='60'&&/Too many generation requests/.test(j.error),`${r.status} ${j.error}`);

// premium speech route
const TTS_ENV={...ENV,ELEVENLABS_API_KEY:'ELEVEN-SECRET-987',ELEVENLABS_VOICE_IDS:'voiceABC123'};
let lastTts=null;
globalThis.fetch=async(url,opts)=>{lastTts={url,headers:opts.headers,body:JSON.parse(opts.body)};return new Response(new Uint8Array([1,2,3,4]),{status:200,headers:{'Content-Type':'audio/mpeg'}});};
r=await worker.fetch(ttsReq({text:'Ciao mondo',voiceId:'voiceABC123',model:'eleven_multilingual_v2'}),TTS_ENV);
check('Approved premium-speech request succeeds',r.status===200&&r.headers.get('Content-Type')==='audio/mpeg',String(r.status));
check('Speech provider key stays server-side',lastTts.headers['xi-api-key']==='ELEVEN-SECRET-987'&&!Array.from(r.headers.values()).some(value=>value.includes('ELEVEN-SECRET-987')));
check('Speech request uses fixed provider settings',lastTts.body.voice_settings?.stability===0.5&&lastTts.body.voice_settings?.similarity_boost===0.75);
r=await worker.fetch(ttsReq({text:'Ciao',voiceId:'unapproved999',model:'eleven_multilingual_v2'}),TTS_ENV); j=await r.json();
check('Unapproved premium voice is rejected',r.status===400&&/not approved/.test(j.error),`${r.status} ${j.error}`);
r=await worker.fetch(ttsReq({text:'Ciao',voiceId:'voiceABC123',model:'unknown-model'}),TTS_ENV);
check('Unapproved premium model is rejected',r.status===400,String(r.status));
r=await worker.fetch(ttsReq({text:'Ciao',voiceId:'voiceABC123',model:'eleven_multilingual_v2',extra:true}),TTS_ENV);
check('Unknown premium-speech field is rejected',r.status===400,String(r.status));
r=await worker.fetch(ttsReq({text:'Ciao',voiceId:'voiceABC123',model:'eleven_multilingual_v2'}),{...TTS_ENV,TTS_DISABLED:'true'});
check('Premium-speech kill switch returns a retryable outage',r.status===503&&r.headers.get('Retry-After')==='3600',String(r.status));

console.log('PASS ('+ok.length+')'); ok.forEach(t=>console.log('  ✓ '+t));
if(fail.length){console.log('\nFAIL ('+fail.length+')');fail.forEach(t=>console.log('  ✗ '+t));}
process.exit(fail.length?1:0);

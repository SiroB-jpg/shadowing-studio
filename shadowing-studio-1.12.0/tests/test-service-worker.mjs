import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/')pathname='/index.html';
  const file=path.join(root,pathname);
  if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(8946,'127.0.0.1',resolve));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath}:{headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const origin='http://127.0.0.1:8946';
const pass={};
try{
  await page.goto(origin+'/',{waitUntil:'load'});
  await page.evaluate(async()=>{if('serviceWorker'in navigator)await navigator.serviceWorker.ready;});
  await page.reload({waitUntil:'load'});
  await page.waitForTimeout(250);
  const state=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.getRegistration();
    const keys=await caches.keys();
    const entries=[];
    for(const key of keys){for(const request of await (await caches.open(key)).keys())entries.push(new URL(request.url).pathname);}
    return{registered:Boolean(registration),controlled:Boolean(navigator.serviceWorker.controller),cacheKeys:keys,entries:[...new Set(entries)].sort()};
  });
  const expected=['/app.js','/boot.js','/icons/icon-192.png','/icons/icon-512.png','/index.html','/manifest.webmanifest','/styles.css'];
  pass.registered=state.registered;
  pass.controlled=state.controlled;
  pass.singleVersionedCache=state.cacheKeys.length===1&&/^italian-shadowing-studio-v\d+-\d+-\d+$/.test(state.cacheKeys[0]);
  pass.completeShell=expected.every(asset=>state.entries.includes(asset));

  await context.setOffline(true);
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:15000});
  pass.rootOffline=(await page.title()).includes('Italian Shadowing Studio')&&(await page.locator('#study').count())===1;
  await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded',timeout:15000});
  pass.indexOffline=(await page.title()).includes('Italian Shadowing Studio')&&(await page.locator('#settings').count())===1;
  await context.setOffline(false);

  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const boot=fs.readFileSync(path.join(root,'boot.js'),'utf8');
  const installHandler=(sw.match(/addEventListener\(['"]install['"][\s\S]*?\n\}\);/)||[])[0]||'';
  pass.controlledUpdate=/SKIP_WAITING/.test(sw)&&/addEventListener\(['"]message/.test(sw)&&Boolean(installHandler)&&!/skipWaiting\(\)/.test(installHandler)&&/registration\.waiting/.test(boot)&&/controllerchange/.test(boot)&&/applyingUpdate/.test(boot);
  const failed=Object.entries(pass).filter(([,value])=>!value);
  const output={pass,state};
  fs.writeFileSync(path.join(here,'service-worker-results.json'),JSON.stringify(output,null,2));
  console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);
  console.log(JSON.stringify(output,null,2));
  if(failed.length)process.exitCode=1;
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const out=path.join(root,'test-results','final-visual');
fs.mkdirSync(out,{recursive:true});
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/')pathname='/index.html';const file=path.join(root,pathname);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end('not found');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(8947,'127.0.0.1',resolve));
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const browser=await chromium.launch(fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath}:{headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const pass={};
const noOverflow=async()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1);
try{
  await page.goto('http://127.0.0.1:8947/',{waitUntil:'load'});await page.waitForTimeout(250);
  await page.evaluate(async()=>{const rows=Array.from({length:12},(_,index)=>({book:'1',chapter:'1',order:index+1,italian:`Credo che la frase numero ${index+1} sia utile per esercitarsi.`,english:`I think sentence number ${index+1} is useful for practice.`,bookmarked:index===2,difficult:false,notes:''}));await Storage.addMany(rows);Titles.books={'1':'Present Subjunctive'};Titles.chapters={'1|1':'Opinions and Judgements'};Titles.save();await Library.refresh();});
  pass.desktopRows=await page.locator('#viewer .srow').count()===10;
  pass.desktopNoOverflow=await noOverflow();
  await page.screenshot({path:path.join(out,'desktop-study.png'),fullPage:true});

  await page.click('#settingsTab');await page.evaluate(()=>{const toggle=document.getElementById('themeToggle');toggle.checked=true;toggle.dispatchEvent(new Event('change',{bubbles:true}));});await page.waitForTimeout(100);
  await page.screenshot({path:path.join(out,'desktop-settings-dark.png'),fullPage:true});
  pass.darkSettingsVisible=await page.isVisible('#settings');

  await page.setViewportSize({width:390,height:844});await page.click('[data-screen="study"]');await page.waitForTimeout(150);
  pass.mobileNoOverflow=await noOverflow();
  pass.mobileNavVisible=await page.isVisible('.mobile-nav');
  const navTargets=await page.locator('.mobile-nav button:visible').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return box.width>=44&&box.height>=44;}));
  pass.mobileNavTargets=navTargets.every(Boolean);
  await page.screenshot({path:path.join(out,'phone-study.png'),fullPage:true});

  await page.click('.mobile-nav-btn[data-screen="library"]');await page.waitForTimeout(100);
  await page.click('#openManage');await page.waitForTimeout(100);
  const modalFit=await page.locator('#manageModal .modal').evaluate(element=>{const box=element.getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight+1;});
  pass.mobileManageFits=modalFit;
  pass.mobileManageFocus=(await page.evaluate(()=>document.activeElement?.id))==='manageTitle';
  await page.screenshot({path:path.join(out,'phone-manage.png')});
  await page.keyboard.press('Escape');
  await page.click('[data-screen="study"]');await page.waitForTimeout(100);

  await page.click('#openFocus');await page.waitForTimeout(100);
  pass.mobileFocusVisible=await page.isVisible('#focus');
  pass.mobileFocusNoOverflow=await noOverflow();
  await page.screenshot({path:path.join(out,'phone-focus.png')});
  await page.keyboard.press('Escape');

  await page.evaluate(()=>document.documentElement.style.fontSize='200%');await page.waitForTimeout(150);
  pass.text200NoHorizontalOverflow=await noOverflow();
  await page.evaluate(()=>document.documentElement.style.fontSize='');

  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(150);
  pass.landscapeNoOverflow=await noOverflow();
  pass.noRuntimeErrors=errors.length===0;
  const failed=Object.entries(pass).filter(([,value])=>!value);
  const output={pass,errors,screenshots:fs.readdirSync(out).sort()};
  fs.writeFileSync(path.join(here,'responsive-results.json'),JSON.stringify(output,null,2));
  console.log(`${failed.length?'FAIL':'PASS'} (${Object.keys(pass).length})`);console.log(JSON.stringify(output,null,2));
  if(failed.length)process.exitCode=1;
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

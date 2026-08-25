import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const appUrl=pathToFileURL(path.join(root,'index.html')).href;
const axePath=fileURLToPath(import.meta.resolve('axe-core/axe.min.js'));
const axeSource=fs.readFileSync(axePath,'utf8');
const chromiumPath=process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium';
const launchOpts=fs.existsSync(chromiumPath)?{headless:true,executablePath:chromiumPath,args:['--no-sandbox']}:{headless:true};
const browser=await chromium.launch(launchOpts);
const results = { checks: [], axe: {} };
const check = (name, pass, detail = '') => results.checks.push({ name, pass: Boolean(pass), detail });

async function axe(page, name) {
  await page.addScriptTag({ content: axeSource });
  const report = await page.evaluate(async () => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa'] } }));
  results.axe[name] = report.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) }));
}

const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await desktopContext.newPage();
await page.goto(appUrl);
await page.waitForTimeout(300);

await axe(page, 'empty-light');

await page.click('#openManage');
check('Manage dialog is exposed', await page.getAttribute('#manageModal', 'aria-hidden') === 'false');
check('Manage initial focus', (await page.evaluate(() => document.activeElement?.id)) === 'manageTitle', await page.evaluate(() => document.activeElement?.id || ''));
await page.keyboard.press('Escape');
check('Escape closes Manage', await page.getAttribute('#manageModal', 'aria-hidden') === 'true');
check('Manage restores focus', (await page.evaluate(() => document.activeElement?.id)) === 'openManage', await page.evaluate(() => document.activeElement?.id || ''));

await page.click('#openManage');
await page.click('#openImport');
await page.fill('#pasteCsv', 'book,chapter,order,italian,english\n1,1,1,Ciao mondo,Hello world\n1,1,2,Studio ogni giorno,I study every day');
await page.click('#analysePaste');
await page.click('#importPreviewed');
await page.waitForTimeout(150);
check('Sentence rows use native selection buttons', await page.locator('.srow-select').count() === 2);
check('Library hierarchy uses native buttons', await page.locator('#tree button').count() >= 3);
await page.locator('.srow-select').first().focus();
await page.keyboard.press('Enter');
check('Sentence button keyboard selection', (await page.getAttribute('.srow-select', 'aria-current')) === 'true');

await page.locator('#studyTab').focus();
await page.keyboard.press('ArrowRight');
check('Arrow key activates next tab', await page.getAttribute('#verbsTab', 'aria-selected') === 'true');
check('Arrow key focuses next tab', (await page.evaluate(() => document.activeElement?.id)) === 'verbsTab');

await page.click('#settingsTab');
await page.evaluate(() => { const input = document.querySelector('#themeToggle'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
await axe(page, 'settings-dark');

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, bypassCSP: true });
const mobile = await mobileContext.newPage();
await mobile.goto(appUrl);
await mobile.waitForTimeout(250);
await mobile.click('[data-screen="settings"]');
await axe(mobile, 'mobile-settings-light');
const undersized = await mobile.locator('button:visible').evaluateAll(buttons => buttons.map(b => {
  const r = b.getBoundingClientRect();
  return { id: b.id || b.getAttribute('aria-label') || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
}).filter(x => x.w < 44 || x.h < 44));
check('Visible mobile buttons meet 44px target', undersized.length === 0, JSON.stringify(undersized));

await browser.close();
fs.writeFileSync(path.join(here,'a11y-results.json'), JSON.stringify(results, null, 2));
const failures = results.checks.filter(c => !c.pass);
const violations = Object.entries(results.axe).flatMap(([state, list]) => list.map(v => ({ state, ...v })));
const total=results.checks.length+Object.keys(results.axe).length;
console.log(`${failures.length||violations.length?'FAIL':'PASS'} (${total})`);
console.log(JSON.stringify({ checks: results.checks.length, auditedStates:Object.keys(results.axe).length, failures, violations }, null, 2));
if (failures.length || violations.length) process.exitCode = 1;

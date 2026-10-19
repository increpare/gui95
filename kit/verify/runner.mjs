import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const defaultScales = Object.freeze([1, 1.25, 1.5, 2]);
const nativeChecks = [
  ['desktop-window-controls', 'Run in the intended Electron/native host: caption drag, minimize, maximize, close, and modal caption access.'],
  ['display-text-rasterization', 'Inspect normal GPU rendering and text fringes at OS display scales 100%, 125%, 150%, and 200%; headless device scale is different.'],
  ['desktop-startup-and-packaging', 'Launch the installed shortcut and associated file; verify startup, native dialogs, saved window bounds, and unpacked delivery.'],
  ['assistive-technology', 'Verify naming, focus order, announcements, and operability with the target platform screen reader.']
].map(([name, instruction]) => ({ name, status: 'not-run', instruction }));

/** Verify an explicitly selected running URL. This function never starts a server or executes app code on Node. */
export async function runVerification({ url, output, scales = defaultScales } = {}) {
  let target;
  try { target = new URL(url); } catch { throw new TypeError('Provide an explicit http:// or https:// URL'); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new TypeError('URL must use HTTP(S) without embedded credentials');
  if (typeof output !== 'string' || !output.trim()) throw new TypeError('Provide an output directory');
  if (!Array.isArray(scales) || !scales.length || scales.length > 4 || scales.some(scale => !defaultScales.includes(scale)) || new Set(scales).size !== scales.length) throw new TypeError('scales must be a unique subset of [1, 1.25, 1.5, 2]');
  const directory = resolve(output);
  await mkdir(directory, { recursive: true });
  const report = { schemaVersion: 1, kitVersion: '1.0.0', checkedAt: new Date().toISOString(), url: target.href, runtime: { node: process.version, browser: '', mode: 'headless Chromium', platform: process.platform }, scope: 'Browser assertions and review screenshots only; deviceScaleFactor is not OS display scaling or native-host verification.', scales: [...scales], assertions: [], screenshots: [], failures: [], nativeChecks };
  let browser;
  const record = (name, passed, details, scale, viewport = 'wide') => {
    const item = { name, scale, viewport, status: passed ? 'passed' : 'failed', details };
    report.assertions.push(item);
    if (!passed) report.failures.push(item);
  };
  try {
    browser = await chromium.launch({ headless: true });
    report.runtime.browser = browser.version();
    for (const scale of scales) {
      const context = await browser.newContext({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: scale });
      const page = await context.newPage();
      const pageErrors = [];
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => pageErrors.push(error.message));
      try {
        const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        record('page-loads', !!response?.ok(), { status: response?.status() ?? null }, scale);
        await page.evaluate(async () => { await Promise.race([document.fonts.ready, new Promise(done => setTimeout(done, 3000))]); await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))); });
        const inspection = await inspectPage(page);
        record('controls-have-accessible-names', inspection.unnamed.length === 0, { unnamed: inspection.unnamed, limitation: 'DOM label checks cover common controls; this is not an accessibility audit.' }, scale);
        record('gui95-relationships', inspection.relationships.length === 0, { issues: inspection.relationships }, scale);
        record('numeric-bounds', inspection.numbers.length === 0, { issues: inspection.numbers }, scale);
        record('tree-expansion-state', inspection.trees.length === 0, { issues: inspection.trees }, scale);
        record('splitter-bounds', inspection.splitters.length === 0, { issues: inspection.splitters }, scale);
        await probeMenus(page, (name,passed,details)=>record(name,passed,details,scale));
        record('uncaught-browser-errors', pageErrors.length === 0, { errors: pageErrors }, scale);
        for (const [viewport, width] of [['wide',1100],['narrow',480]]) {
          await page.setViewportSize({ width, height: 800 });
          await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
          const overflow = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth }));
          record('document-fits-viewport', overflow.content <= overflow.viewport + 1, overflow, scale, viewport);
          const path = `scale-${String(scale).replace('.','_')}-${viewport}.png`;
          await page.screenshot({ path: join(directory,path), fullPage: true, animations: 'disabled', timeout: 10000 });
          report.screenshots.push({ path, scale, viewport, status: 'needs-review', instruction: 'Inspect bevels, glyphs, text, clipping, scrollbars, control states, and labels; capture alone does not establish fidelity.' });
        }
      } catch (error) {
        record('verification-completed', false, { message: error.message }, scale);
      } finally { await context.close(); }
    }
  } catch (error) {
    report.failures.push({ name: 'browser-launch', status: 'failed', details: { message: error.message } });
  } finally {
    await browser?.close();
    report.status = report.failures.length ? 'failed' : 'assertions-passed-review-required';
    await writeFile(join(directory,'report.json'), JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
async function inspectPage(page) {
  return page.evaluate(() => {
    const visible = element => !!(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const identity = element => element.id || element.getAttribute('name') || element.outerHTML.slice(0,140);
    const name = element => element.getAttribute('aria-label')?.trim() || element.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent||'').join(' ').trim() || [...(element.labels||[])].map(label=>label.textContent).join(' ').trim() || (element.matches('button,a,summary,option') ? element.textContent.trim() : '') || (element.matches('input[type=button],input[type=submit]') ? element.value : '') || element.getAttribute('title')?.trim();
    const unnamed=[...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible).filter(element=>!name(element)).map(identity);
    const relationships=[];
    for(const trigger of document.querySelectorAll('[data-gui95-menu]')){const popup=document.getElementById(trigger.dataset.gui95Menu);if(!popup||popup.getAttribute('role')!=='menu')relationships.push({element:identity(trigger),issue:'Menu target must resolve to role=menu'});if(trigger.getAttribute('aria-controls')!==popup?.id||trigger.getAttribute('aria-haspopup')!=='menu')relationships.push({element:identity(trigger),issue:'Enhancement ARIA relationship is missing'});}
    for(const dialog of document.querySelectorAll('dialog[data-gui95-dialog]'))if(!name(dialog))relationships.push({element:identity(dialog),issue:'Dialog needs aria-label or aria-labelledby'});
    const numbers=[...document.querySelectorAll('input[data-gui95-number]')].filter(visible).filter(element=>element.value!==''&&!element.validity.valid).map(element=>({element:identity(element),value:element.value,issue:'Current value fails native range/step validity'}));
    const trees=[];
    for(const item of document.querySelectorAll('[data-gui95-tree] [role=treeitem]')){const group=[...item.children].find(child=>child.getAttribute('role')==='group');if(group&&group.hidden===(item.getAttribute('aria-expanded')==='true'))trees.push({element:identity(item),issue:'Owned child visibility disagrees with aria-expanded'});}
    const splitters=[];
    for(const bar of document.querySelectorAll('[data-gui95-splitter]')){const value=Number(bar.getAttribute('aria-valuenow')),min=Number(bar.getAttribute('aria-valuemin')),max=Number(bar.getAttribute('aria-valuemax'));if(!bar.hasAttribute('aria-valuenow')||!Number.isFinite(value)||value<min||value>max||bar.getAttribute('role')!=='separator')splitters.push({element:identity(bar),issue:'Separator role or bounded value missing'});}
    return{unnamed,relationships,numbers,trees,splitters};
  });
}
async function probeMenus(page, record) {
  const trigger=page.locator('[data-gui95-menubar] [data-gui95-menu]:not(:disabled)').first();
  if(!await trigger.count()){record('menu-keyboard-open-close',true,{applicable:false,reason:'No GUI95 menubar present'});return;}
  const id=await trigger.getAttribute('data-gui95-menu');
  const previous=await page.evaluate(()=>{const node=document.activeElement;return node?.id||null});
  await trigger.focus();
  await page.keyboard.press('Enter');
  const state=await page.evaluate(id=>{const popup=document.getElementById(id);return{open:!!popup&&!popup.hidden,focusInside:!!popup?.contains(document.activeElement)}},id);
  await page.keyboard.press('Escape');
  record('menu-keyboard-open-close',state.open&&state.focusInside&&await trigger.getAttribute('aria-expanded')==='false',state);
  if(previous)await page.evaluate(id=>document.getElementById(id)?.focus(),previous);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [url,output]=process.argv.slice(2);
  if(!url||!output){process.stderr.write('Usage: node kit/verify/runner.mjs URL OUTPUT_DIRECTORY\n');process.exitCode=2;}
  else try{const report=await runVerification({url,output});process.stdout.write(JSON.stringify({status:report.status,assertions:report.assertions.length,failures:report.failures.length,screenshots:report.screenshots.length,report:resolve(output,'report.json')})+'\n');if(report.failures.length)process.exitCode=1;}catch(error){process.stderr.write(error.message+'\n');process.exitCode=2;}
}

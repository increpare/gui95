import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const kitRoot = fileURLToPath(new URL('../', import.meta.url));
let lintPage, runPeriodLint, RULES;
try { ({ lintPage, runPeriodLint, RULES } = await import('../verify/period-lint.mjs')); } catch {}
let server, browser, base;
const pages = new Map();
const html = body => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Lint fixture</title></head><body>${body}</body></html>`;
const bevel = 'box-shadow:inset 1px 1px #fff,inset -1px -1px #000,inset 2px 2px #dfdfdf,inset -2px -2px #808080';
pages.set('/clean', html(`<div class="gui95" style="background:#c0c0c0;color:#000;font:11px Tahoma,Arial,sans-serif;padding:8px"><button style="border:0;border-radius:0;background:#c0c0c0;${bevel};cursor:default">OK</button><button disabled style="border:0;background:#c0c0c0;${bevel};color:#808080;text-shadow:1px 1px #fff">Unavailable</button><p>Plain text</p></div>`));
const tell = (id, style, tag = 'div', extra = '') => `<${tag} id="${id}" ${extra} style="${style}">${tag === 'input' ? '' : id}${tag === 'input' ? '' : `</${tag}>`}`;
pages.set('/tells', html(`<div class="gui95" style="background:#c0c0c0;font:11px Tahoma,sans-serif">
${tell('rounded', 'border-radius:4px;background:#c0c0c0')}
${tell('soft', 'box-shadow:0 2px 8px #000')}
${tell('glow', 'text-shadow:0 0 3px #fff')}
${tell('alpha', 'background:rgba(0,0,0,.25)')}
${tell('faded', 'opacity:.6')}
${tell('animated', 'transition:background .2s')}
${tell('hand', 'cursor:pointer')}
${tell('keyword', 'border:2px outset #ddd')}
${tell('modern-font', 'font-family:system-ui,sans-serif')}
${tell('frosted', 'backdrop-filter:blur(4px)')}
<label>Native <input id="native" type="checkbox"></label>
<a id="link" href="#help">Help topic <b id="link-child">index</b></a>
<dialog id="dimmed" aria-label="Dimmed"><p>Dialog</p></dialog><style>#dimmed::backdrop{background:rgba(0,0,0,.4)}</style>
<div id="allowed" data-gui95-lint-ignore="rounded-corner" style="border-radius:4px">Deliberate</div>
<div id="hidden-tell" hidden style="border-radius:9px">Hidden</div>
</div><div id="outside" style="border-radius:12px">Outside the GUI95 scope</div>`));
pages.set('/unscoped', html('<main><button style="border-radius:6px">Rounded</button></main>'));
before(async () => {
  server = createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (pages.has(path)) { res.setHeader('content-type', 'text/html'); res.end(pages.get(path)); return; }
    if (!/^\/components\/[a-zA-Z0-9./-]+$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
    try { res.setHeader('content-type', path.endsWith('.mjs') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html'); res.end(await readFile(kitRoot + path)); } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
const lint = async path => {
  assert.equal(typeof lintPage, 'function', 'period-lint exports lintPage');
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  try { await page.goto(base + path); return await lintPage(page); } finally { await page.close(); }
};
const rulesFor = (report, id) => report.violations.filter(item => item.element === '#' + id).map(item => item.rule);

test('a hard-bevel gray interface has no period violations', async () => {
  const report = await lint('/clean');
  assert.deepEqual(report.violations, []);
  assert.equal(report.status, 'passed');
  assert.ok(report.checked >= 4, 'visible elements were inspected');
});
test('each modern styling tell is reported against its own element', async () => {
  const report = await lint('/tells');
  const expected = { rounded: 'rounded-corner', soft: 'soft-shadow', glow: 'soft-shadow', alpha: 'translucency', faded: 'translucency', animated: 'animation', hand: 'pointer-cursor', keyword: 'keyword-bevel', 'modern-font': 'modern-font', frosted: 'filter-effect', native: 'native-control', dimmed: 'dimmed-backdrop' };
  for (const [id, rule] of Object.entries(expected)) assert.ok(rulesFor(report, id).includes(rule), `#${id} reports ${rule}; got ${JSON.stringify(rulesFor(report, id))}`);
  assert.equal(report.status, 'failed');
  for (const item of report.violations) assert.ok(RULES[item.rule], `${item.rule} is a documented rule`);
});
test('an explicit ignore attribute is honoured and counted, not hidden', async () => {
  const report = await lint('/tells');
  assert.deepEqual(rulesFor(report, 'allowed'), []);
  assert.deepEqual(report.ignored, [{ element: '#allowed', rule: 'rounded-corner' }]);
});
test('hidden elements and content outside the GUI95 scope are not judged', async () => {
  const report = await lint('/tells');
  assert.deepEqual(rulesFor(report, 'hidden-tell'), []);
  assert.deepEqual(rulesFor(report, 'outside'), []);
  assert.equal(report.scope, '.gui95, [data-gui95]');
});
test('a hyperlink keeps its hand cursor without being reported', async () => {
  const report = await lint('/tells');
  assert.deepEqual([...rulesFor(report, 'link'), ...rulesFor(report, 'link-child')], []);
});
test('a page without a GUI95 scope is linted as a whole and says so', async () => {
  const report = await lint('/unscoped');
  assert.equal(report.scope, 'body (no .gui95 or [data-gui95] scope found)');
  assert.ok(report.violations.some(item => item.rule === 'rounded-corner'));
});
test('runPeriodLint opens an explicit URL and rejects anything else', async () => {
  assert.equal(typeof runPeriodLint, 'function', 'period-lint exports runPeriodLint');
  const report = await runPeriodLint({ url: base + '/clean' });
  assert.equal(report.status, 'passed');
  assert.equal(report.url, base + '/clean');
  await assert.rejects(runPeriodLint({ url: 'file:///etc/passwd' }), /http/);
});
test('the kit gallery passes its own period lint', async () => {
  const report = await lint('/components/gallery.html');
  assert.deepEqual(report.violations.map(item => `${item.rule} ${item.element}`), []);
});

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BASELINE, BASELINES, DENSITIES, VIEWPORT, checkAtlas, compareImages, describeFailure, openAtlas, renderAtlas } from '../verify/atlas.mjs';
import { lintPage } from '../verify/period-lint.mjs';

// A component bundle carries both baselines from 1.2.0; an older bundle has the comfortable one only, so the period check skips there. kit/test/density.test.mjs, which is not in the bundle, requires both in the repository.
const periodBaseline = existsSync(BASELINES.period) ? false : 'this copy of the kit has no period baseline';
let browser;
before(async () => { browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] }); });
after(async () => { await browser?.close(); });

test('the rendered state atlas equals the stored baseline', async () => {
  const report = await checkAtlas({ browser });
  assert.equal(report.different, 0, describeFailure(report));
});

test('the state atlas in the period density equals its own baseline', { skip: periodBaseline }, async () => {
  assert.deepEqual(DENSITIES, ['comfortable', 'period']);
  assert.equal(BASELINES.comfortable, BASELINE, 'the default atlas is the comfortable one');
  const report = await checkAtlas({ browser, density: 'period' });
  assert.equal(report.different, 0, describeFailure(report));
});

test('the two densities draw different atlases, and an unknown density is refused', async () => {
  const [comfortable, stated, period] = [await renderAtlas({ browser }), await renderAtlas({ browser, density: 'comfortable' }), await renderAtlas({ browser, density: 'period' })];
  assert.equal(compareImages(comfortable, stated).different, 0, 'stating the default changes nothing');
  const result = compareImages(comfortable, period);
  assert.ok(result.different > 0 && result.sameSize, 'the period atlas differs on the same grid');
  await assert.rejects(renderAtlas({ browser, density: 'compact' }), /Unknown density/);
});

test('a one-level change to the raised bevel white edge is detected', async () => {
  const css = await readFile(fileURLToPath(new URL('../components/gui95.css', import.meta.url)), 'utf8');
  const altered = css.replace('--gui95-raised:inset -1px -1px #000,inset 1px 1px #fff,', '--gui95-raised:inset -1px -1px #000,inset 1px 1px #fefefe,');
  assert.notEqual(altered, css, 'the raised bevel variable was found');
  const [normal, changed] = [await renderAtlas({ browser }), await renderAtlas({ browser, stylesheet: altered })];
  assert.equal(compareImages(normal, normal).different, 0);
  const result = compareImages(normal, changed);
  assert.ok(result.different > 0, 'a #fefefe highlight instead of #fff is reported');
  assert.equal(result.sameSize, true);
});

for (const density of DENSITIES) test(`the ${density} atlas fills its fixed viewport on whole pixels and renders no text`, async () => {
  const { page, close } = await openAtlas({ browser, density });
  try {
    assert.equal(await page.evaluate(() => document.body.getAttribute('data-gui95-density')), density === 'comfortable' ? null : density);
    const layout = await page.evaluate(() => {
      const atlas = document.querySelector('#atlas').getBoundingClientRect();
      // The stylesheet itself centres the 11px disclosure box in a 16px tree row (2.5px); Chromium snaps it the same way everywhere.
      const fractional = [...document.querySelectorAll('#atlas *:not([data-gui95-disclosure])')].filter(el => el.getClientRects().length).filter(el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].some(v => !Number.isInteger(v)); }).map(el => el.outerHTML.slice(0, 80));
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), text = [];
      while (walker.nextNode()) if (walker.currentNode.parentElement.closest('#atlas') && walker.currentNode.textContent.trim()) text.push(walker.currentNode.textContent.trim());
      const glyphs = [...document.querySelectorAll('#atlas *')].flatMap(el => ['::before', '::after'].map(pseudo => getComputedStyle(el, pseudo).content)).filter(content => !['none', 'normal', '""', '"" / ""'].includes(content));
      return { size: [atlas.width, atlas.height], fractional, text, glyphs, scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] };
    });
    assert.deepEqual(layout.size, [VIEWPORT.width, VIEWPORT.height], 'the atlas grid is exactly the captured viewport');
    assert.deepEqual(layout.scroll, [VIEWPORT.width, VIEWPORT.height], 'nothing overflows the viewport');
    assert.deepEqual(layout.fractional, [], 'every box is on whole pixels');
    assert.deepEqual(layout.text, [], 'no text nodes');
    assert.deepEqual(layout.glyphs, [], 'no generated text glyphs');
  } finally { await close(); }
});

for (const density of DENSITIES) test(`the ${density} atlas page passes the period lint`, async () => {
  const { page, close } = await openAtlas({ browser, density });
  try {
    const report = await lintPage(page);
    assert.deepEqual(report.violations.map(item => `${item.rule} ${item.element}`), []);
  } finally { await close(); }
});

test('each baseline is a device-scale-1 PNG of the fixed viewport', async () => {
  for (const density of DENSITIES.filter(density => density === 'comfortable' || !periodBaseline)) {
    const png = await readFile(BASELINES[density]);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [VIEWPORT.width, VIEWPORT.height], density);
  }
});

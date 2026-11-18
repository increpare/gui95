import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { BASELINE, VIEWPORT, checkAtlas, compareImages, describeFailure, openAtlas, renderAtlas } from '../verify/atlas.mjs';
import { lintPage } from '../verify/period-lint.mjs';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, args: ['--force-color-profile=srgb'] }); });
after(async () => { await browser?.close(); });

test('the rendered state atlas equals the stored baseline', async () => {
  const report = await checkAtlas({ browser });
  assert.equal(report.different, 0, describeFailure(report));
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

test('the atlas fills its fixed viewport on whole pixels and renders no text', async () => {
  const { page, close } = await openAtlas({ browser });
  try {
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

test('the atlas page passes the period lint', async () => {
  const { page, close } = await openAtlas({ browser });
  try {
    const report = await lintPage(page);
    assert.deepEqual(report.violations.map(item => `${item.rule} ${item.element}`), []);
  } finally { await close(); }
});

test('the baseline is a device-scale-1 PNG of the fixed viewport', async () => {
  const png = await readFile(BASELINE);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [VIEWPORT.width, VIEWPORT.height]);
});

#!/usr/bin/env node
// Runs the example audit's comparisons: for each example in specs.mjs, its rendering at the period density against
// the real Windows 95 capture, the recorded real behaviour replayed against it in Chromium, and both lints.
//   node tools/example-audit/run.mjs [--only id,id] [--images DIR]
// Needs Playwright (kit/node_modules, or GUI95_PLAYWRIGHT_ROOT) and, for pixel comparisons, the ignored screen dumps in
// tools/win95-reference/out/. Writes tools/example-audit/results.json: what was compared and what differed, nothing more.
// It is a record of one run on one host; text widths and native controls depend on that host, so no test asserts on it.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from '../win95-reference/lib/png.mjs';
import { colourRuns, comparePair, exampleRect, inkBox, loadReal, metric, openExample, realRect, replay, root, sideBySide } from './engine.mjs';
import { lintPage as lintWording } from '../../kit/verify/wording-lint.mjs';
import { lintPage as lintLayout } from '../../kit/verify/layout-lint.mjs';
import specs from './specs.mjs';

const require = createRequire(import.meta.url);
const playwright = require(process.env.GUI95_PLAYWRIGHT_ROOT || path.join(root, 'kit', 'node_modules', 'playwright'));
const args = process.argv.slice(2), option = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
const only = option('only')?.split(','), imageDir = option('images') ?? path.join(root, '.codex_tmp', 'example-audit');
const resultsFile = path.join(root, 'tools', 'example-audit', 'results.json');
await mkdir(imageDir, { recursive: true });

const real = await loadReal();
// Headless Chromium hides scroll bars unless told not to; the kit draws them, so they are wanted here.
const browser = await playwright.chromium.launch({ headless: true, ignoreDefaultArgs: ['--hide-scrollbars'], ...(process.env.GUI95_BROWSER_EXECUTABLE ? { executablePath: process.env.GUI95_BROWSER_EXECUTABLE } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
await context.route(/^https?:/, route => route.abort());
const results = only ? JSON.parse(await readFile(resultsFile, 'utf8').catch(() => '{"examples":{}}')) : { examples: {} };
results.description = 'Raw output of tools/example-audit/run.mjs: each example compared with real Windows 95 (rendering pairs, layout numbers, replayed behaviour) and both lints. One run on one host; see docs/example-audit.md for what it means.';
results.host = { platform: process.platform, chromium: browser.version(), playwright: require(path.join(root, 'kit', 'node_modules', 'playwright', 'package.json')).version, viewport: '1280 x 900 at scale 1', density: 'period' };
results.real = { guest: real.measurements.guest.name, files: real.measurements.guest.files, comdlg32: real.measurements.guest.comdlg32 };

const lintStates = async (page, id, extra = []) => {
  // As loaded; with each menu shown; with each dialog open. Findings are keyed by rule and text, so a state adds only what it newly shows.
  const found = { wording: new Map(), layout: new Map() };
  const collect = async state => {
    for (const [kind, lint] of [['wording', lintWording], ['layout', lintLayout]]) {
      const report = await lint(page);
      for (const v of report.violations) { const key = `${v.rule}|${v.value}`; if (!found[kind].has(key)) found[kind].set(key, { rule: v.rule, value: v.value, element: v.element, state }); }
    }
  };
  await openExample(page, id, { density: null }); await collect('loaded');
  const menus = await page.locator('[role=menu]').count();
  for (let i = 0; i < menus; i++) { await openExample(page, id, { density: null }); await page.evaluate(n => { document.querySelectorAll('[role=menu]')[n].hidden = false; }, i); await collect('menu shown'); }
  const dialogs = await page.locator('dialog').count();
  for (let i = 0; i < dialogs; i++) { await openExample(page, id, { density: null }); await page.evaluate(n => { const d = document.querySelectorAll('dialog')[n]; if (!d.open) d.showModal(); }, i); await collect('dialog open'); }
  for (const state of extra) { await openExample(page, id, { density: null }); await state.setup(page); await collect(state.name); }
  return { wording: [...found.wording.values()], layout: [...found.layout.values()] };
};

for (const spec of specs) {
  if (only && !only.includes(spec.id)) continue;
  process.stdout.write(`${spec.id}\n`);
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const out = { visual: { pairs: [], metrics: [] }, behaviour: [], checks: [], lint: null };
  // (a) rendering
  for (const group of spec.visual ?? []) {
    await openExample(page, spec.id);
    if (group.setup) await group.setup(page);
    await page.waitForTimeout(150);
    const shot = decodePng(await page.screenshot({ fullPage: true }));
    const rects = {};
    for (const pair of group.pairs ?? []) {
      const realSide = await realRect(real, pair.real), exampleSide = await exampleRect(page, pair.sel, pair.inset);
      const entry = { name: pair.name, group: group.name ?? null, real: pair.real, example: pair.sel, ...(pair.note ? { note: pair.note } : {}) };
      if (!realSide) { out.visual.pairs.push({ ...entry, result: 'no real rectangle: the capture or control is missing' }); continue; }
      if (!exampleSide) { out.visual.pairs.push({ ...entry, result: 'no example rectangle: the selector matched nothing rendered' }); continue; }
      rects[pair.name] = { real: realSide.rect, example: exampleSide };
      if (pair.layoutOnly) { out.visual.pairs.push({ ...entry, drawnBy: realSide.drawnBy, result: { real: { w: realSide.rect.w, h: realSide.rect.h }, example: { w: exampleSide.w, h: exampleSide.h }, sameSize: realSide.rect.w === exampleSide.w && realSide.rect.h === exampleSide.h, pixels: 'layout only' } }); continue; }
      const result = comparePair(realSide.image, realSide.rect, shot, exampleSide, { ring: pair.ring ?? 4, depth: pair.depth ?? 3, sides: pair.sides });
      if (pair.ink && realSide.image) result.ink = { real: inkBox(realSide.image, realSide.rect), example: inkBox(shot, exampleSide) };
      if (pair.runs && realSide.image) result.runs = { colour: pair.runs, real: colourRuns(realSide.image, realSide.rect, pair.runs).slice(0, 6), example: colourRuns(shot, exampleSide, pair.runs).slice(0, 6) };
      out.visual.pairs.push({ ...entry, drawnBy: realSide.drawnBy, result });
      if (realSide.image) await writeFile(path.join(imageDir, `${spec.id}--${pair.name.replace(/[^a-z0-9]+/gi, '-')}.png`), sideBySide(realSide.image, realSide.rect, shot, exampleSide));
    }
    for (const [name, kind, a, b] of group.metrics ?? []) {
      const ra = rects[a], rb = b ? rects[b] : null;
      if (!ra || (b && !rb)) { out.visual.metrics.push({ name, kind, of: [a, b].filter(Boolean), result: 'not measured: a rectangle is missing' }); continue; }
      const realValue = metric(kind, ra.real, rb?.real), exampleValue = metric(kind, ra.example, rb?.example);
      out.visual.metrics.push({ name, kind, of: [a, b].filter(Boolean), group: group.name ?? null, real: realValue, example: exampleValue, same: realValue === exampleValue });
    }
  }
  // (b) behaviour
  for (const behaviour of spec.behaviour ?? []) {
    await openExample(page, spec.id);
    try { if (behaviour.setup) await behaviour.setup(page); out.behaviour.push({ name: behaviour.name ?? behaviour.script, ...(await replay(page, real, behaviour)) }); }
    catch (error) { out.behaviour.push({ name: behaviour.name ?? behaviour.script, script: behaviour.script, error: error.message.split('\n')[0] }); }
    await page.keyboard.up('Shift').catch(() => {}); await page.mouse.up().catch(() => {});
  }
  // Single measurements that are not a step-by-step replay (a delay, a repeat rate): each returns [{ what, real, example, agree, note }].
  for (const check of spec.checks ?? []) {
    await openExample(page, spec.id);
    try { out.checks.push(...await check(page, real)); } catch (error) { out.checks.push({ what: check.name || 'check', error: error.message.split('\n')[0] }); }
  }
  // (c) lints
  out.lint = await lintStates(page, spec.id, spec.lintStates);
  if (errors.length) out.pageErrors = errors;
  results.examples[spec.id] = out;
  const pairs = out.visual.pairs.filter(p => typeof p.result === 'object');
  process.stdout.write(`  rendering: ${pairs.length} pairs (${pairs.filter(p => p.result.pixels === 'identical').length} identical, ${pairs.filter(p => p.result.pixels === 'frame-identical').length} frame identical, ${pairs.filter(p => p.result.pixels === 'same-edges').length} same edges, ${pairs.filter(p => /differ/.test(p.result.pixels)).length} differ); layout numbers ${out.visual.metrics.filter(m => m.same).length}/${out.visual.metrics.length} equal\n`);
  for (const b of out.behaviour) process.stdout.write(`  behaviour ${b.name}: ${b.error ? 'ERROR ' + b.error : `${b.agreed}/${b.compared} steps agree, ${b.skipped.length} skipped`}\n`);
  if (out.checks.length) process.stdout.write(`  checks: ${out.checks.filter(c => c.agree).length}/${out.checks.length} agree\n`);
  process.stdout.write(`  lint: ${out.lint.wording.length} wording, ${out.lint.layout.length} layout\n`);
  await page.close();
}
await browser.close();
const ordered = { ...results, examples: Object.fromEntries(specs.map(s => s.id).filter(id => results.examples[id]).map(id => [id, results.examples[id]])) };
await writeFile(resultsFile, JSON.stringify(ordered, null, 1) + '\n');
process.stdout.write(`Results written to ${path.relative(root, resultsFile)}; side-by-side images in ${imageDir}.\n`);

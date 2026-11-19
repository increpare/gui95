import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build, buildRecord, disagreements, eraOf } from '../build-example-audit.mjs';

const read = async name => readFile(fileURLToPath(new URL(`../../${name}`, import.meta.url)), 'utf8');

test('the example audit and its doc are up to date with the results and the decisions', async () => {
  const outputs = await build();
  for (const [name, text] of Object.entries(outputs)) assert.equal(await read(name), text, `${name} is out of date; run node tools/build-example-audit.mjs`);
});

test('every example has a record, and no verdict claims more than was compared', async () => {
  const audit = JSON.parse(await read('examples/widgets/audit.json')), manifest = JSON.parse(await read('demo/dist/widgets/manifest.json'));
  assert.deepEqual(audit.examples.map(r => r.id), manifest.examples.map(e => e.id));
  for (const r of audit.examples) {
    const pixels = r.rendering.pairs.some(p => p.result && !/layout only|not compared|^no /.test(p.result)), behaviour = r.behaviour.replays.some(b => b.compared > 0) || r.behaviour.checks.some(c => c.real !== null && c.example !== null);
    if (r.verdict === 'verified' || r.verdict === 'open') assert.ok(pixels && behaviour, `${r.id} is called verified without both a rendering and a behaviour comparison`);
    if (r.verdict === 'verified') assert.equal(r.differences.filter(d => d.status === 'open').length, 0, `${r.id} is called verified with open differences`);
    if (r.verdict !== 'verified') assert.ok(r.notChecked.length > 0 || r.differences.some(d => d.status === 'open'), `${r.id}: a lesser verdict must say why`);
    for (const d of r.differences) { assert.ok(['fixed', 'open', 'deliberate', 'host limit'].includes(d.status)); assert.ok(['high', 'medium', 'low'].includes(d.severity)); }
    if (pixels || behaviour) assert.ok(r.counterpart.era.length > 0, `${r.id}: compared evidence must name its era`);
  }
});

test('a disagreement nobody has judged stops the build', () => {
  const example = { id: 'x', title: 'X', family: 'F' };
  const result = { visual: { pairs: [{ name: 'box', real: { capture: 'form' }, drawnBy: 'user32', result: { real: { w: 13, h: 13 }, example: { w: 13, h: 13 }, pixels: 'frame-differs' } }], metrics: [{ name: 'gap', real: 6, example: 8, same: false }] }, behaviour: [{ name: 'keys', script: 's', drawnBy: 'user32', compared: 2, agreed: 1, steps: [{ index: 3, step: { key: 'up' }, agree: false, differences: [{ where: 'sel', real: 1, example: 0 }] }, { index: 4, step: { key: 'down' }, agree: true }], skipped: [] }], checks: [], lint: { wording: [{ rule: 'r', value: 'v', state: 'loaded' }], layout: [] } };
  assert.deepEqual(disagreements(result).map(d => `${d.kind}:${d.key}`), ['pairs:box', 'metrics:gap', 'steps:keys#3']);
  assert.throws(() => buildRecord(example, result, { differences: [] }, {}), /no decision covers pairs "box"/);
  const difference = { id: 'a', kind: 'rendering', summary: 's', severity: 'low', status: 'open', covers: { pairs: ['box'], metrics: ['gap'], steps: ['keys#*'] } };
  assert.throws(() => buildRecord(example, result, { differences: [difference] }, {}), /lint finding not triaged/);
  const record = buildRecord(example, result, { differences: [difference], lint: { 'r|v': { triage: 'real' } } }, {});
  assert.equal(record.verdict, 'open');
  assert.throws(() => buildRecord(example, result, { differences: [difference], lint: { 'r|v': { triage: 'real' } }, verdict: 'verified' }, {}), /claims more than was compared/);
  assert.throws(() => buildRecord(example, result, { differences: [{ ...difference, status: 'done' }], lint: { 'r|v': { triage: 'real' } } }, {}), /status "done"/);
});

test('the era of evidence follows the library that drew it', () => {
  assert.match(eraOf('user32 4.0.0.950 (the window manager of the 1995 release)')[0], /1995 release/);
  assert.match(eraOf('comctl32 4.70 (the 1996 common controls shipped with OSR2 and Internet Explorer 3)')[0], /1996/);
  assert.equal(eraOf('comctl32 4.70; the page contents: user32 4.0.0.950').length, 2);
});

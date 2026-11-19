import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { lintPage, runLayoutLint, summarize, main, RULES, SEVERITY, UNITS } from '../verify/layout-lint.mjs';
import { html, startFixture, rulesFor } from './lint-fixture.mjs';
const pages = new Map();
const dialog = (id, body, extra = '') => `<dialog open id="${id}" ${extra}><div class="title-bar">Fixture</div><div class="body">${body}</div></dialog>`;
const actions = '<div class="actions"><button class="default">OK</button><button>Cancel</button></div>';
pages.set('/clean', html(`<div class="gui95">
<nav data-gui95-menubar><button data-gui95-mnemonic="f"><u>F</u>ile</button><button data-gui95-mnemonic="e"><u>E</u>dit</button></nav>
${dialog('clean', `<div style="display:flex;align-items:center;gap:7px"><label for="name"><u>N</u>ame:</label><input id="name"></div>
<div style="display:grid;gap:8px;margin-top:8px;justify-items:start"><label><input type="checkbox"> <u>R</u>ead only</label><label><input type="checkbox"> <u>H</u>idden</label><label><input type="checkbox"> Ar<u>c</u>hive</label></div>
<div style="display:flex;margin-top:8px"><input aria-label="Copies" style="width:40px"><button data-gui95-step aria-label="More" style="width:16px"></button></div>
<div class="actions"><button class="default">OK</button><button>Cancel</button><button><u>A</u>pply</button><button style="width:140px">Advanced <u>O</u>ptions...</button></div>`)}
</div>`));
pages.set('/tells', html(`<div class="gui95">
<div class="window"><div style="display:grid;justify-items:start"><input id="gap-a" aria-label="A"><input id="gap-b" aria-label="B" style="margin-top:2px"><input id="gap-c" aria-label="C" style="margin-top:9px"></div></div>
<div class="window"><div id="uneven-row" style="display:flex"><button>One</button><button style="margin-left:8px">Two</button><button style="margin-left:10px">Three</button></div>
<div id="grouped-row" style="display:flex;margin-top:12px"><button>One</button><button style="margin-left:8px">Two</button><button style="margin-left:24px">Three</button></div></div>
<div class="window"><div style="display:grid;gap:10px;justify-items:start"><input id="edge-a" aria-label="A"><input id="edge-b" aria-label="B" style="margin-left:2px"><input id="edge-c" aria-label="C" style="margin-left:40px"></div></div>
<div class="window"><div style="display:flex;align-items:flex-start;gap:7px"><label id="base-label" for="base-field" style="padding-top:3px">Name:</label><input id="base-field"></div>
<div style="display:flex;align-items:flex-start;gap:7px;margin-top:12px"><label id="top-label" for="top-field" style="padding-top:14px">Name:</label><input id="top-field"></div></div>
<div class="window"><div id="heights-row" style="display:flex;gap:6px"><button>Yes</button><button style="height:26px">No</button></div>
<div id="widths-row" style="display:flex;gap:6px;margin-top:12px"><button>OK</button><button style="width:90px">Cancel</button></div>
<div id="near-row" style="display:flex;gap:6px;margin-top:12px"><button>Find Next</button><button style="width:78px">Replace</button></div>
<div id="column" style="display:grid;gap:7px;margin-top:12px;justify-items:start"><button>Add</button><button style="width:77px">Edit</button></div>
<div id="long-row" style="display:flex;gap:6px;margin-top:12px"><button>Find Next</button><button style="width:140px">Advanced Options...</button></div></div>
${dialog('nodefault', '<p>Save changes to Document 1?</p><div class="actions"><button>Yes</button><button>No</button></div>')}
${dialog('multiline', '<textarea aria-label="Notes" style="display:block"></textarea><div class="actions"><button>OK</button><button>Cancel</button></div>')}
${dialog('allowed', '<div class="actions"><button>Close</button></div>', 'data-gui95-lint-ignore="no-default-button"')}
${dialog('destructive', '<p>Delete the selected file?</p><div class="actions"><button class="default" id="del">Delete</button><button>Cancel</button></div>')}
${dialog('replace', '<div class="actions"><button data-gui95-default id="replace-all">Replace All</button><button>Cancel</button></div>')}
${dialog('keys', `<div class="actions" style="flex-wrap:wrap"><button class="default" id="okkey"><u>O</u>K</button><button id="cancelkey" accesskey="c">Cancel</button><button id="save"><u>S</u>ave</button><button id="dup"><u>S</u>kip</button><button id="applykey">A<u>p</u>ply</button></div>`)}
${dialog('reserved', '<label id="takes-a"><input type="checkbox"> <u>A</u>rchive</label><div class="actions"><button class="default">OK</button><button id="plain-apply">Apply</button></div>')}
<div role="menu" id="menu"><button role="menuitem" data-gui95-mnemonic="s"><u>S</u>ave</button><button role="menuitem" id="menudup" data-gui95-mnemonic="s"><u>S</u>end</button></div>
${dialog('margin', `<p>Short margins.</p>${actions}`).replace('class="body"', 'class="body" style="padding:4px"')}
${dialog('large', `<p>Wide.</p>${actions}`, 'style="width:500px"')}
${dialog('tall', `<p style="height:440px;margin:0">Tall.</p>${actions}`)}
</div>`));
let fixture;
before(async () => { fixture = await startFixture(pages); });
after(async () => { await fixture?.close(); });

test('a dialog laid out on the dialog-unit grid has no findings', async () => {
  const report = await fixture.lint(lintPage, '/clean');
  assert.deepEqual(report.violations, []);
  assert.equal(report.status, 'passed');
  assert.equal(report.lint, 'layout');
  assert.equal(report.containers, 1);
  assert.ok(report.checked >= 8, 'controls were measured');
  assert.deepEqual(report.units, UNITS);
});
test('each layout tell is reported against its own element', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  const expected = { 'gap-b': 'control-gap', 'uneven-row': 'uneven-gap', 'edge-b': 'edge-near-miss', 'base-label': 'baseline-near-miss', 'heights-row': 'button-height-mismatch', 'widths-row': 'button-width-mismatch', 'near-row': 'button-width-mismatch', column: 'button-width-mismatch', nodefault: 'no-default-button', del: 'destructive-default', 'replace-all': 'destructive-default', okkey: 'ok-cancel-access-key', cancelkey: 'ok-cancel-access-key', dup: 'duplicate-access-key', menudup: 'duplicate-access-key', applykey: 'apply-access-key', 'takes-a': 'apply-access-key', margin: 'dialog-margin', large: 'window-too-large', tall: 'window-too-large' };
  for (const [id, rule] of Object.entries(expected)) assert.ok(rulesFor(report, id).includes(rule), `#${id} reports ${rule}; got ${JSON.stringify(rulesFor(report, id))}`);
  assert.deepEqual(Object.keys(RULES).filter(rule => !Object.values(expected).includes(rule)), [], 'every rule has a tell on this page');
  for (const found of report.violations) { assert.ok(RULES[found.rule], `${found.rule} is a documented rule`); assert.equal(found.severity, 'warn'); }
  assert.match(report.violations.find(found => found.element === '#gap-b').value, /^2px below #gap-a; minimum 6\.5px \(4 dialog units\)$/);
  assert.match(report.violations.find(found => found.element === '#uneven-row').value, /^row gaps 8, 10px/);
  assert.match(report.violations.find(found => found.element === '#large').value, /333 by \d+ dialog units; limit 263 by 263/);
});
test('clearly different positions and sizes are taken as intended', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  for (const id of ['gap-c', 'grouped-row', 'edge-c', 'top-label', 'long-row', 'save', 'plain-apply', 'multiline', 'destructive', 'keys']) assert.deepEqual(rulesFor(report, id).filter(rule => !['dialog-margin'].includes(rule)), [], `#${id} is not reported`);
  assert.ok(!rulesFor(report, 'heights-row').includes('button-width-mismatch'));
  assert.ok(!rulesFor(report, 'large').includes('dialog-margin'), 'a 12px margin meets the 7-unit minimum');
});
test('findings warn by default, fail under strict, and can be skipped or ignored', async () => {
  const report = await fixture.lint(lintPage, '/tells');
  assert.equal(report.status, 'warnings');
  assert.deepEqual(report.ignored, [{ element: '#allowed', rule: 'no-default-button' }]);
  assert.equal((await fixture.lint(lintPage, '/tells', { strict: true })).status, 'failed');
  const skipped = await fixture.lint(lintPage, '/tells', { skip: ['dialog-margin', 'window-too-large'] });
  assert.ok(!skipped.violations.some(found => ['dialog-margin', 'window-too-large'].includes(found.rule)));
  await assert.rejects(fixture.lint(lintPage, '/tells', { skip: ['menu-title-caps'] }), /Unknown layout lint rule/);
  assert.deepEqual(Object.keys(SEVERITY), Object.keys(RULES));
  assert.match(summarize(report), /Layout lint warnings: \d+ finding\(s\)/);
  assert.match(summarize(report), /assumed dialog-unit conversion/);
});
test('the command exits 0 on warnings, 1 under --strict and 2 without a URL', async () => {
  const quiet = { write() {}, fail() {} };
  assert.equal(await main([fixture.base + '/tells'], quiet), 0);
  assert.equal(await main([fixture.base + '/tells', '--strict'], quiet), 1);
  assert.equal(await main([fixture.base + '/clean', '--strict'], quiet), 0);
  assert.equal(await main([], quiet), 2);
  assert.equal((await runLayoutLint({ url: fixture.base + '/clean' })).url, fixture.base + '/clean');
});
test('thresholds are stated in dialog units in one place, and every rule names its source', () => {
  assert.deepEqual([UNITS.horizontalPx, UNITS.verticalPx, UNITS.minGap, UNITS.margin, UNITS.maxWindow], [1.5, 1.625, 4, 7, 263]);
  for (const [rule, advice] of Object.entries(RULES)) assert.match(advice, /Windows Interface Guidelines, final 1995/, `${rule} names its source`);
  assert.match(RULES['control-gap'], /6px across and 6\.5px down under the assumed conversion/);
});

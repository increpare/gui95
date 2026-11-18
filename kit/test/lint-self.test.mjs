import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import * as wording from '../verify/wording-lint.mjs';
import * as layout from '../verify/layout-lint.mjs';
import { startFixture, widgetRoot } from './lint-fixture.mjs';
let fixture;
before(async () => { fixture = await startFixture(new Map()); });
after(async () => { await fixture?.close(); });
const widgets = (await readdir(widgetRoot)).filter(name => name.endsWith('.html') && name !== 'index.html').sort();

/** Lint a page as loaded and again with each of its dialogs open. The test opens them; the lints change nothing. */
async function survey(path) {
  const page = await fixture.open(path), reports = [];
  try {
    const both = async () => { for (const lint of [wording, layout]) reports.push(await lint.lintPage(page)); };
    await both();
    const count = await page.evaluate(() => document.querySelectorAll('dialog').length);
    for (let index = 0; index < count; index++) {
      await page.evaluate(index => { const dialog = document.querySelectorAll('dialog')[index]; if (!dialog.open) dialog.showModal(); }, index);
      await both();
      await page.evaluate(index => document.querySelectorAll('dialog')[index].close(), index);
    }
  } finally { await page.close(); }
  return reports;
}
function wellFormed(reports, path) {
  for (const report of reports) {
    const rules = report.lint === 'wording' ? wording.RULES : layout.RULES;
    assert.equal(report.scoped, true, `${path} has a GUI95 scope`);
    assert.ok(['passed', 'warnings'].includes(report.status), `${path}: findings are warnings, never a failure, without strict`);
    assert.equal(report.status === 'passed', report.violations.length === 0);
    for (const found of report.violations) { assert.ok(rules[found.rule], `${path}: ${found.rule} is a documented ${report.lint} rule`); assert.equal(found.severity, 'warn'); assert.ok(found.element && found.value); }
  }
}
const tally = reports => { const counts = {}; for (const report of reports) for (const found of report.violations) counts[found.rule] = (counts[found.rule] || 0) + 1; return Object.entries(counts).map(([rule, count]) => `${rule} ${count}`).join(', ') || 'none'; };

// These pages are not required to be clean: the findings are the kit's own report card and are not asserted, only that both lints run and report in the documented shape.
test('the kit gallery runs through the wording and layout lints', async t => {
  const reports = await survey('/components/gallery.html');
  wellFormed(reports, 'gallery.html');
  assert.ok(reports.length >= 8, 'linted as loaded and with each of its three dialogs open');
  assert.ok(reports.filter(report => report.lint === 'layout').some(report => report.checked > 20), 'gallery controls were measured');
  t.diagnostic('gallery findings (repeated across dialog states): ' + tally(reports));
});
test('every widget example runs through the wording and layout lints', async t => {
  assert.ok(widgets.length >= 38, `found ${widgets.length} widget pages`);
  const all = [];
  for (const name of widgets) { const reports = await survey('/widgets/' + name); wellFormed(reports, name); all.push(...reports); }
  assert.ok(all.some(report => report.lint === 'wording' && report.checked > 0));
  t.diagnostic(`${widgets.length} widget pages; findings (repeated across dialog states): ` + tally(all));
});

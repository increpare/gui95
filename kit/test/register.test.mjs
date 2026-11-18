import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRules, getRule, summarizeRegister, allRules, ERAS, KIT_STATUSES, CONFIDENCE_LEVELS, EVIDENCE_TYPES, SOURCE_KINDS, VISIBILITY } from '../evidence/register.mjs';
import { renderRegisterDoc, DOC_URL } from '../evidence/build-register-doc.mjs';

const root = new URL('../../', import.meta.url);
const rules = allRules();

test('every register record is complete, with a checkable source and a dated kit status', () => {
  assert.ok(rules.length >= 150);
  const ids = new Set();
  for (const rule of rules) {
    assert.match(rule.id, /^[a-z0-9]+(?:-[a-z0-9]+)+$/, rule.id);
    assert.ok(!ids.has(rule.id), 'duplicate ' + rule.id); ids.add(rule.id);
    assert.ok(rule.title.length > 10 && rule.title.length <= 120, rule.id);
    assert.ok(rule.rule.length > 40 && rule.rule.length <= 450, rule.id);
    assert.match(rule.topic, /^[a-z]+(?:-[a-z]+)*$/, rule.id);
    assert.match(rule.control, /^[a-z]+(?:-[a-z]+)*$/, rule.id);
    assert.ok(Object.hasOwn(ERAS, rule.era), rule.id);
    assert.ok(Object.hasOwn(EVIDENCE_TYPES, rule.evidence_type), rule.id);
    assert.ok(CONFIDENCE_LEVELS.includes(rule.confidence.level) && rule.confidence.reason.length > 15, rule.id);
    assert.ok(rule.sources.length > 0, rule.id);
    for (const source of rule.sources) {
      assert.ok(Object.hasOwn(SOURCE_KINDS, source.kind), rule.id);
      assert.ok(source.location.length > 5, rule.id);
      assert.ok(source.url === null || /^https:\/\//.test(source.url), rule.id);
      assert.ok(source.checked === null || /^\d{4}-\d{2}-\d{2}$/.test(source.checked), rule.id);
      if (source.kind === 'final-guidelines') assert.match(source.url, /^https:\/\/techshelps\.github\.io\/MSDN\/WINGUIDE\/S[0-9A-F]{5}\.htm$/, rule.id);
      if (['wine-source', 'reactos-source'].includes(source.kind)) assert.match(source.location, /\.c, lines? \d+/, rule.id);
    }
    assert.equal(rule.verification.commissioning_review, false, rule.id);
    assert.equal(rule.verification.sources_total, rule.sources.length, rule.id);
    assert.equal(rule.verification.sources_checked, rule.sources.filter((source) => source.checked).length, rule.id);
    assert.ok(Object.hasOwn(KIT_STATUSES, rule.kit.status), rule.id);
    assert.match(rule.kit.date, /^\d{4}-\d{2}-\d{2}$/, rule.id);
    assert.ok(['rendered', 'read', 'not-checked'].includes(rule.kit.method), rule.id);
    assert.ok(rule.kit.detail.length > 10, rule.id);
    assert.equal(typeof rule.notes, 'string', rule.id);
  }
});

test('a kit status of matches or differs always names what was looked at in the kit', () => {
  for (const rule of rules) {
    if (!['matches', 'differs-unintended', 'differs-deliberate'].includes(rule.kit.status)) continue;
    assert.notEqual(rule.kit.method, 'not-checked', rule.id);
    assert.ok(rule.kit.checked.length > 0, rule.id);
    for (const item of rule.kit.checked) {
      const file = item.split(' · ')[0];
      assert.ok(readFileSync(new URL(file, root)).length > 0, `${rule.id}: ${file}`);
    }
  }
  for (const rule of rules) {
    assert.equal(rule.kit.status === 'differs-unintended', VISIBILITY.includes(rule.visibility), rule.id + ' needs a visibility exactly when it is an unintended difference');
  }
});

test('draft statements point to the final rule that replaced them, and low confidence never claims a match by default', () => {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  for (const rule of rules) {
    if (rule.era === 'win95-draft') {
      assert.ok(rule.superseded_by, rule.id);
      assert.equal(byId.get(rule.superseded_by).supersedes, rule.id);
      assert.equal(byId.get(rule.superseded_by).era, 'win95-1995');
      assert.equal(rule.kit.status, 'not-applicable', rule.id);
      assert.ok(rule.sources.every((source) => source.kind === 'draft-guidelines'), rule.id);
    }
    if (rule.supersedes) assert.equal(byId.get(rule.supersedes).superseded_by, rule.id);
    if (rule.era !== 'win95-1995') assert.equal(rule.kit.status, 'not-applicable', rule.id + ': the kit is judged against Windows 95 rules only');
  }
  for (const id of ['edge-light-colour-value', 'title-bar-height', 'scroll-thumb-minimum', 'menu-bar-open-title']) {
    const rule = byId.get(id);
    assert.equal(rule.kit.status, 'unknown', id);
    assert.equal(rule.confidence.level, 'low', id);
    assert.match(rule.notes, /capture/, id);
  }
});

test('search filters by control, topic, era, kit status, confidence and text, and puts standing first', () => {
  const all = findRules();
  assert.equal(all.schema_version, 1);
  assert.equal(all.total, rules.length);
  assert.ok(all.items.length <= 20);
  assert.match(all.caveat, /not.*compared with a real Windows 95 system/);
  for (const item of findRules({ limit: 20, query: 'menu' }).items) {
    assert.deepEqual(Object.keys(item).slice(0, 4), ['id', 'title', 'standing', 'rule']);
    assert.deepEqual(Object.keys(item.standing), ['era', 'era_label', 'confidence', 'confidence_reason', 'may_state_as_windows_95', 'cite_as']);
    assert.ok(item.sources.every((source) => source.kind_label));
    assert.ok(item.kit.status_label);
  }
  const menus = findRules({ control: 'menu', kit_status: 'differs-unintended' });
  assert.ok(menus.total >= 4);
  assert.ok(menus.items.every((item) => item.control === 'menu' && item.kit.status === 'differs-unintended'));
  assert.ok(findRules({ topic: 'edges', confidence: 'high' }).items.every((item) => item.topic === 'edges' && item.standing.confidence === 'high'));
  assert.equal(findRules({ era: 'win3x' }).total, rules.filter((rule) => rule.era === 'win3x').length);
  assert.equal(findRules({ era: 'win98-ie4' }).total, 0);
  assert.equal(findRules({ query: 'SHORTCUT column' }).items[0].id, 'menu-shortcut-column');
  assert.deepEqual(findRules({ query: 'shortcut', limit: 2 }), findRules({ query: 'SHORTCUT', limit: 2 }));
  assert.equal(findRules({ query: 'notawordintheregisterzz' }).total, 0);
  assert.equal(findRules({ topic: 'no-such-topic' }).total, 0);
  const first = findRules({ limit: 1 }).items[0];
  first.rule = 'changed'; first.sources.length = 0;
  assert.notEqual(getRule(first.id).rule, 'changed');
  assert.ok(getRule(first.id).sources.length > 0);
  assert.equal(getRule('does-not-exist'), null);
});

test('standing cannot present a draft, another era or a low-confidence record as Windows 95', () => {
  for (const rule of rules) {
    const { standing } = getRule(rule.id);
    assert.equal(standing.era, rule.era);
    assert.equal(standing.confidence, rule.confidence.level);
    if (rule.era !== 'win95-1995' || rule.confidence.level === 'low') {
      assert.equal(standing.may_state_as_windows_95, 'no', rule.id);
      assert.match(standing.cite_as, /^(Not|Unsettled)/, rule.id);
    } else assert.equal(standing.may_state_as_windows_95, rule.confidence.level === 'high' ? 'yes' : 'with-caveat', rule.id);
    assert.match(standing.cite_as, rule.era === 'win95-1995' && rule.confidence.level !== 'low' ? /not yet compared with a real system/ : /Not|Unsettled/, rule.id);
  }
  assert.match(getRule('draft-control-spacing').standing.cite_as, /draft.*dialog-control-spacing/);
  assert.match(getRule('win31-bold-system-font').standing.cite_as, /Not Windows 95: Windows 3\.x/);
});

test('invalid register arguments fail with short errors', () => {
  for (const options of [null, [], 'x', { query: 4 }, { query: 'x'.repeat(201) }, { limit: 0 }, { limit: 21 }, { limit: 1.5 }, { topic: {} }, { control: 'x'.repeat(65) }, { era: 'win95' }, { kit_status: 'differs' }, { confidence: 'certain' }]) {
    assert.throws(() => findRules(options), (error) => error instanceof TypeError && error.message.length < 200);
  }
  assert.throws(() => getRule({}), TypeError);
});

test('the summary counts every record and orders the unintended differences by visibility', () => {
  const summary = summarizeRegister();
  for (const key of ['by_kit_status', 'by_confidence', 'by_era', 'by_topic']) assert.equal(Object.values(summary[key]).reduce((a, b) => a + b, 0), rules.length, key);
  assert.equal(summary.unintended_differences.length, summary.by_kit_status['differs-unintended']);
  const ranks = summary.unintended_differences.map((item) => VISIBILITY.indexOf(item.visibility));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(summary.open_questions.length, summary.by_kit_status.unknown);
  assert.ok(summary.controls.includes('menu') && summary.topics.includes('edges'));
});

test('the register reproduces no long passage: rules are paraphrases with at most short quoted phrases', () => {
  for (const rule of rules) for (const text of [rule.rule, rule.notes, rule.title]) {
    for (const quoted of text.match(/"[^"]*"/g) ?? []) assert.ok(quoted.split(/\s+/).length <= 9, `${rule.id}: ${quoted}`);
  }
});

test('docs/evidence-register.md is generated from the data and is up to date', () => {
  assert.equal(readFileSync(DOC_URL, 'utf8'), renderRegisterDoc(), 'Run: node kit/evidence/build-register-doc.mjs');
  const check = spawnSync(process.execPath, [fileURLToPath(new URL('../evidence/build-register-doc.mjs', import.meta.url)), '--check'], { encoding: 'utf8' });
  assert.equal(check.status, 0, check.stdout + check.stderr);
});

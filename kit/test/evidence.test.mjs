import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const catalogURL = new URL('../evidence/catalog.mjs', import.meta.url);
const api = existsSync(catalogURL) ? await import(catalogURL) : null;
const catalog = () => { assert.ok(api, 'The evidence catalog API is not implemented'); return api; };

test('evidence covers each control and host concern with precise source scope', () => {
  const { listEvidence } = catalog();
  for (const topic of ['menu', 'dialog', 'splitter', 'tree', 'toolbar', 'number-field', 'electron-shell', 'save-lifecycle', 'packaging', 'scaling']) {
    const result = listEvidence({ topic });
    assert.ok(result.total > 0, `Missing evidence for ${topic}`);
    assert.equal(result.schema_version, 1);
    for (const item of result.items) {
      assert.equal(item.topic, topic);
      assert.ok(item.claim.length > 20);
      assert.ok(item.source.kind && item.source.title && item.source.section);
      assert.match(item.source.checked, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(item.applicability.length > 15 && item.limitations.length > 15);
      assert.ok(Object.hasOwn(item.source, 'edition'));
      assert.ok(Object.hasOwn(item.source, 'version'));
      assert.ok(Object.hasOwn(item.source, 'pages'));
      if (item.source.kind === 'local-integration-guidance') {
        assert.equal(item.source.url, null);
        assert.ok(item.local_refs.length > 0);
      } else assert.match(item.source.url, /^https:\/\//);
    }
  }
});

test('evidence search is deterministic, case insensitive, bounded, and returns detached records', () => {
  const { listEvidence, getEvidence } = catalog();
  const first = listEvidence({ query: 'KEYBOARD', limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.total >= 2);
  assert.deepEqual(first, listEvidence({ query: 'keyboard', limit: 2 }));
  assert.ok(listEvidence().items.length <= 20);
  first.items[0].claim = 'changed';
  assert.notEqual(getEvidence(first.items[0].id).claim, 'changed');
  assert.equal(getEvidence('does-not-exist'), null);
  assert.deepEqual(listEvidence({ topic: 'no-such-topic' }).items, []);
  assert.deepEqual(listEvidence({ query: 'notawordincatalogzz' }).items, []);
});

test('invalid evidence and repair arguments fail with bounded errors', () => {
  const { listEvidence, getEvidence, findRepairs } = catalog();
  for (const options of [null, [], 'x', { query: 4 }, { query: 'x'.repeat(201) }, { limit: 0 }, { limit: null }, { limit: 21 }, { limit: 1.5 }, { topic: {} }]) {
    assert.throws(() => listEvidence(options), (error) => error instanceof TypeError && error.message.length < 180);
  }
  assert.throws(() => getEvidence({}), TypeError);
  for (const options of [null, { component: {} }, { version: '^1.0.0' }, { version: '1.0' }, { query: 'x'.repeat(201) }]) assert.throws(() => findRepairs(options), TypeError);
});

test('historical and modern evidence cannot be mistaken for the same edition', () => {
  const { getEvidence } = catalog();
  const history = getEvidence('historical-menu-access-keys');
  assert.equal(history.source.kind, 'historical-primary');
  assert.equal(history.source.edition, 'February 1995 preliminary draft');
  assert.deepEqual(history.source.pages, { system: 'pdf-viewer-one-based', values: [116] });
  assert.match(history.limitations, /preliminary/i);
  const splitter = getEvidence('splitter-web-keyboard');
  assert.equal(splitter.source.pages, null);
  assert.match(splitter.limitations, /not.*Windows 95|Windows 95.*not/i);
  assert.match(splitter.limitations, /incomplete|review|unfinished/i);
  assert.match(getEvidence('electron-renderer-isolation').limitations, /not.*Windows 95|Windows 95.*not/i);
});

test('preserved references identify local bytes and valid line ranges without upstream master guesses', () => {
  const { listEvidence } = catalog();
  const manifest = JSON.parse(readFileSync(new URL('../../references/snapshot-manifest.json', import.meta.url), 'utf8'));
  const byPath = new Map(manifest.files.map((file) => [file.path, file]));
  let preserved = 0;
  for (const item of listEvidence({ limit: 20 }).items) for (const ref of item.local_refs) {
    assert.ok(!ref.path.includes('..') && !ref.path.startsWith('/'));
    const bytes = readFileSync(new URL('../../' + ref.path, import.meta.url));
    assert.ok(Number.isInteger(ref.start_line) && ref.start_line >= 1);
    assert.ok(Number.isInteger(ref.end_line) && ref.end_line >= ref.start_line);
    assert.ok(ref.end_line <= bytes.toString('utf8').split('\n').length);
    assert.ok(ref.end_line - ref.start_line < 80);
    assert.ok(!JSON.stringify(ref).includes('/blob/master/'));
    if (byPath.has(ref.path)) {
      preserved++;
      assert.equal(ref.sha256, byPath.get(ref.path).sha256);
      assert.equal(ref.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
  }
  assert.ok(preserved >= 4, 'Expected source references to several preserved controls');
});

test('repairs describe symptoms, a minimal fix, version applicability, and honest regression status', () => {
  const { findRepairs, getEvidence } = catalog();
  for (const component of ['menu', 'dialog', 'splitter', 'tree', 'toolbar', 'number-field', 'electron-shell', 'save-lifecycle', 'packaging', 'scaling']) {
    const result = findRepairs({ component, version: '1.0.0' });
    assert.ok(result.total > 0, `Missing repair for ${component}`);
    assert.ok(result.items.length <= 20);
    for (const item of result.items) {
      assert.ok(item.components.includes(component));
      assert.equal(item.scope, 'integration-guidance');
      assert.ok(item.symptoms.length && item.cause.length > 15 && item.minimal_fix.length > 15);
      assert.ok(item.regression_cases.length > 0);
      for (const regression of item.regression_cases) {
        assert.ok(regression.name.length > 10);
        assert.ok(['available', 'consumer_required'].includes(regression.status));
        assert.notEqual(regression.status, 'passed');
        if (regression.status === 'available') assert.ok(regression.file);
      }
      for (const id of item.evidence_ids) assert.ok(getEvidence(id), `Unknown evidence: ${id}`);
    }
  }
  assert.ok(findRepairs({ query: 'stationary pointer' }).total > 0);
  assert.equal(findRepairs({ component: 'no-such-component' }).total, 0);
  assert.equal(findRepairs({ component: 'menu', version: '0.9.9' }).total, 0);
  assert.ok(findRepairs({ component: 'menu', version: '1.9.9' }).total > 0);
  assert.equal(findRepairs({ component: 'menu', version: '2.0.0' }).total, 0);
});

test('updates distinguish current, older, newer, unknown, and invalid versions without claiming compatibility', () => {
  const { checkUpdates } = catalog();
  const result = checkUpdates({ schema_version: 1, components: { menu: '1.0.0', dialog: '0.9.0', tree: '2.0.0', splitter: '^1.0.0', alien: '1.0.0' } });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.components.map((item) => item.id), ['alien', 'dialog', 'menu', 'splitter', 'tree']);
  const byId = Object.fromEntries(result.components.map((item) => [item.id, item]));
  assert.equal(byId.menu.status, 'current');
  assert.equal(byId.menu.compatibility, 'unverified');
  assert.equal(byId.dialog.status, 'update_available');
  assert.equal(byId.dialog.compatibility, 'unsupported');
  assert.equal(byId.tree.status, 'newer_than_catalog');
  assert.equal(byId.tree.compatibility, 'unverified');
  assert.equal(byId.alien.status, 'unknown_component');
  assert.equal(byId.alien.latest, null);
  assert.equal(byId.splitter.status, 'invalid_version');
  assert.deepEqual(result, checkUpdates({ schema_version: 1, components: { alien: '1.0.0', splitter: '^1.0.0', tree: '2.0.0', dialog: '0.9.0', menu: '1.0.0' } }));
});

test('available repair regressions name executable current-kit cases', () => {
  const { findRepairs } = catalog();
  for (const repair of findRepairs().items) for (const regression of repair.regression_cases) {
    if (regression.status !== 'available') continue;
    const content = readFileSync(new URL('../../' + regression.file, import.meta.url), 'utf8');
    assert.ok(content.includes(`test('${regression.name}',`) || content.includes(`test("${regression.name}",`), regression.name);
    assert.equal(regression.command, 'node --test ' + regression.file);
    assert.ok(!regression.file.startsWith('references/'));
  }
});

test('update manifests have bounded validation and never echo arbitrary nested input', () => {
  const { checkUpdates } = catalog();
  for (const manifest of [null, [], {}, { schema_version: 2, components: {} }, { schema_version: 1, components: [] }, { schema_version: 1, components: Object.fromEntries(Array.from({ length: 51 }, (_, i) => ['x' + i, '1.0.0'])) }]) {
    const result = checkUpdates(manifest);
    assert.equal(result.status, 'invalid_manifest');
    assert.ok(result.errors.length > 0 && result.errors.length <= 10);
    assert.equal(result.components.length, 0);
    assert.ok(JSON.stringify(result).length < 2000);
  }
  const bad = checkUpdates({ schema_version: 1, components: { menu: { secret: 'x'.repeat(10000) } } });
  assert.equal(bad.components[0].status, 'invalid_version');
  assert.equal(bad.components[0].installed, null);
  assert.ok(JSON.stringify(bad).length < 2000);
  assert.equal(checkUpdates({ schema_version: 1, components: {} }).status, 'ok');
});


test('packaging citation includes the desktop launch and packaging guidance', () => {
  const evidence = catalog().getEvidence('packaging-resource-layout');
  const ref = evidence.local_refs.find(ref => ref.path === 'docs/reuse.md');
  const lines = readFileSync(new URL('../../' + ref.path, import.meta.url), 'utf8').split('\n');
  assert.match(lines.slice(ref.start_line - 1, ref.end_line).join('\n'), /Desktop launch performance.*unpacked app/);
});

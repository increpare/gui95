import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KIT_VERSION, COMPONENTS } from '../distribution.mjs';
import { version as runtimeVersion } from '../components/gui95.mjs';

const kitFile = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const repoFile = (name) => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');

test('the kit states one release version everywhere it names it', () => {
  assert.equal(KIT_VERSION, '1.1.0');
  assert.equal(runtimeVersion, KIT_VERSION);
  assert.equal(JSON.parse(kitFile('package.json')).version, KIT_VERSION);
  assert.match(kitFile('components/gui95.css').split('\n')[0], new RegExp(`^/\\* GUI95 ${KIT_VERSION.replaceAll('.', '\\.')} `));
  const gallery = kitFile('components/gallery.html');
  assert.ok(gallery.includes(`version ${KIT_VERSION}</p>`));
  assert.ok(gallery.includes(`<span>${KIT_VERSION}</span>`));
  assert.ok(gallery.includes(`GUI95 build kit ${KIT_VERSION}`));
  assert.equal(kitFile('README.md').split('\n')[0], `# GUI95 build kit ${KIT_VERSION}`);
  assert.equal(kitFile('components/README.md').split('\n')[0], `# GUI95 components ${KIT_VERSION}`);
  assert.equal(JSON.parse(kitFile('verification.json')).kit_version, KIT_VERSION);
  assert.ok(repoFile('docs/build-kit.md').includes(`Version ${KIT_VERSION} supplies`));
});

test('every runtime component is cataloged at the kit version', () => {
  const releases = JSON.parse(kitFile('evidence/releases.json'));
  const controls = releases.filter((item) => item.kind === 'ui-control');
  assert.deepEqual(controls.map((item) => item.id).sort(), [...COMPONENTS].sort());
  for (const item of controls) {
    assert.equal(item.latest, KIT_VERSION, item.id);
    assert.equal(item.released_versions.at(-1), KIT_VERSION, item.id);
  }
});

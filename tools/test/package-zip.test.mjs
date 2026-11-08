import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { packageZip } from '../package-zip.mjs';

test('release ZIPs retain hidden manifests, portable paths and exact binary bytes', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'gui95-zip-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'gui95-plugin');
  await mkdir(path.join(root, '.codex-plugin'), { recursive: true });
  await mkdir(path.join(root, 'skills/gui95'), { recursive: true });
  const expected = new Map([
    ['gui95-plugin/.codex-plugin/plugin.json', Buffer.from('{"name":"gui95"}\n')],
    ['gui95-plugin/skills/gui95/SKILL.md', Buffer.from('# GUI95\n')],
    ['gui95-plugin/skills/gui95/asset.bin', Buffer.from([0, 255, 127, 13, 10])]
  ]);
  for (const [name, bytes] of expected) await writeFile(path.join(temp, name), bytes);
  const output = path.join(temp, 'plugin.zip');
  await packageZip(root, output);
  const zip = await readFile(output);
  let cursor = 0;
  const seen = new Set();
  while (zip.readUInt32LE(cursor) === 0x04034b50) {
    const length = zip.readUInt32LE(cursor + 18);
    const nameLength = zip.readUInt16LE(cursor + 26);
    const extraLength = zip.readUInt16LE(cursor + 28);
    const name = zip.subarray(cursor + 30, cursor + 30 + nameLength).toString('utf8');
    assert.ok(!name.includes('\\'));
    assert.ok(expected.has(name), 'Unexpected archive entry: ' + name);
    const start = cursor + 30 + nameLength + extraLength;
    assert.deepEqual(zip.subarray(start, start + length), expected.get(name));
    seen.add(name);
    cursor = start + length;
  }
  assert.equal(seen.size, expected.size);
  await assert.rejects(packageZip(root, output), { code: 'EEXIST' });
  assert.deepEqual(await readFile(output), zip);
});

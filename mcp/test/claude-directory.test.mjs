import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../claude-directory/', import.meta.url));

test('Claude directory edition contains permitted file types and a remote-only MCP connection', async () => {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'No symlinks in directory edition');
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path.relative(root, absolute).split(path.sep).join('/'));
    }
  }
  await walk(root);
  assert.deepEqual(files.sort(), [
    '.claude-plugin/icon.png', '.claude-plugin/plugin.json', '.mcp.json',
    'LICENSE', 'PRIVACY.md', 'README.md', 'skills/gui95/SKILL.md'
  ]);
  for (const name of files) {
    const bytes = await readFile(path.join(root, name));
    if (name.endsWith('.png')) {
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      continue;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    assert.ok(!bytes.includes(0), 'No NUL bytes: ' + name);
    assert.ok(!text.startsWith('#!'), 'No executable shebangs: ' + name);
    assert.ok(name === 'LICENSE' || /\.(md|json)$/.test(name), 'Permitted text type: ' + name);
  }
  const config = JSON.parse(await readFile(path.join(root, '.mcp.json'), 'utf8'));
  assert.deepEqual(config, { mcpServers: { gui95: { type: 'http', url: 'https://ded.increpare.com/gui95/mcp' } } });
  const manifest = JSON.parse(await readFile(path.join(root, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'gui95');
  assert.equal(manifest.mcpServers, './.mcp.json');
  assert.equal(manifest.skills, './skills/');
  assert.ok(!('hooks' in manifest) && !('userConfig' in manifest));
});

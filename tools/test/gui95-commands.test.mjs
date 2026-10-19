import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { lanAddresses, listen, serve } from '../gui95-serve.mjs';
import { assemble } from '../gui95-distro.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'gui95-commands-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
function request(port, name, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: name, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject); req.end();
  });
}

test('LAN addresses omit loopback and unusable link-local addresses', () => {
  assert.deepEqual(lanAddresses({ a: [{ family: 'IPv4', internal: false, address: '192.168.2.8' },
    { family: 'IPv4', internal: true, address: '127.0.0.1' }, { family: 'IPv4', internal: false, address: '169.254.1.2' },
    { family: 'IPv6', internal: false, address: '::1' }], b: [{ family: 'IPv4', internal: false, address: '192.168.2.8' }] }), ['192.168.2.8']);
});

test('preview binds LAN, falls back from an occupied port, serves WASM, and blocks private paths', async t => {
  const root = await fixture(t);
  for (const directory of ['.git', 'node_modules']) await mkdir(path.join(root, directory));
  await writeFile(path.join(root, 'index.html'), 'ready');
  await writeFile(path.join(root, 'engine.wasm'), 'wasm');
  await writeFile(path.join(root, '.git/config'), 'private');
  await writeFile(path.join(root, 'node_modules/private.js'), 'private');
  const occupied = http.createServer();
  await listen(occupied);
  t.after(() => close(occupied));
  const { server, urls } = await serve({ root, port: occupied.address().port, host: '0.0.0.0' });
  t.after(() => close(server));
  const port = server.address().port;
  assert.notEqual(port, occupied.address().port);
  assert.equal(server.address().address, '0.0.0.0');
  assert.equal((await request(port, '/')).body, 'ready');
  assert.equal((await request(port, '/engine.wasm')).headers['content-type'], 'application/wasm');
  assert.equal((await request(port, '/', 'HEAD')).body, '');
  assert.equal((await request(port, '/', 'POST')).status, 405);
  for (const name of ['/.git/config', '/node_modules/private.js', '/%2e%2e%5csecret', '/index.html:secret'])
    assert.equal((await request(port, name)).status, 403, name);
  for (const address of lanAddresses()) {
    assert.ok(urls.includes(`http://${address}:${port}/`));
    const response = await fetch(`http://${address}:${port}/`);
    assert.equal(await response.text(), 'ready');
  }
  const outside = await fixture(t);
  await writeFile(path.join(outside, 'secret.txt'), 'private');
  await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await request(port, '/escape/secret.txt')).status, 403);
  await writeFile(path.join(root, 'index.html'), 'updated');
  assert.equal((await request(port, '/')).body, 'updated');
});

test('a source preview serves only its public asset inventory', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'index.html'), 'page');
  await writeFile(path.join(root, 'src/app.js'), 'app');
  await writeFile(path.join(root, 'private-notes.txt'), 'private');
  await mkdir(path.join(root, 'private'));
  await writeFile(path.join(root, 'private/notes.txt'), 'private');
  await symlink(path.join(root, 'private'), path.join(root, 'src/linked-private'), process.platform === 'win32' ? 'junction' : 'dir');
  const { server } = await serve({ root, allowed: ['index.html', 'src/'], host: '127.0.0.1' });
  t.after(() => close(server));
  assert.equal((await request(server.address().port, '/src/app.js')).body, 'app');
  assert.equal((await request(server.address().port, '/private-notes.txt')).status, 403);
  assert.equal((await request(server.address().port, '/src/linked-private/notes.txt')).status, 403);
});

test('distro combines only current versions and records missing platforms', async t => {
  const root = await fixture(t), input = await fixture(t);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '2.0' }));
  await writeFile(path.join(root, 'gui95-app.json'), JSON.stringify({ apps: [{ id: 'example', name: 'Example', version: 'package.json', icon: 'icon.png', builds: {
    windows: { dir: 'build', exe: 'Example.exe' }, macos: { dir: 'build', bundle: 'Example.app' }, linux: { dir: 'build', exe: 'example' }
  } }] }));
  await mkdir(path.join(root, 'gui95-dist'));
  await writeFile(path.join(root, 'gui95-dist/Example-2.0-windows-x64.zip'), 'windows');
  await writeFile(path.join(input, 'Example-2.0-linux-arm64.tar.gz'), 'linux');
  await writeFile(path.join(input, 'Example-1.0-macos-arm64.zip'), 'stale');
  const result = await assemble(root, { input, log() {} });
  assert.deepEqual(result.packages.map(item => item.system), ['windows', 'linux']);
  assert.deepEqual(result.missing, ['Example: macos']);
  assert.equal(await readFile(path.join(root, 'gui95-dist/Example-2.0-linux-arm64.tar.gz'), 'utf8'), 'linux');
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'gui95-dist/index.json'), 'utf8')), result);
});

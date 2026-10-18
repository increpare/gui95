import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

let module;
try { module = await import('../kit.mjs'); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const need = () => { assert.ok(module, 'Build-kit distribution module must exist'); return module; };
const hash = value => createHash('sha256').update(value).digest('hex');

test('ZIP files carry real UTF-8 contents, CRC, and safe relative paths', () => {
  const {makeZip} = need();
  const zip = makeZip([{path:'index.html',text:'<p>Hello café</p>'},{path:'assets/icon.svg',text:'<svg/>'}]);
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  assert.equal(zip.readUInt16LE(6),0x800);
  assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);
  assert.equal(zip.readUInt16LE(zip.length-14),2);
  assert.ok(zip.includes(Buffer.from('Hello café')));
  for (const unsafe of ['../secret','/absolute','a\\b','a/../b','a//b','a/./b','C:/bad']) assert.throws(()=>makeZip([{path:unsafe,text:'no'}]),/path/i);
  assert.throws(()=>makeZip([{path:'same',text:'a'},{path:'same',text:'b'}]),/duplicate/i);
});

test('artifact store retains bounded generated output only, expires it, and hashes actual ZIP bytes', () => {
  const {createArtifactStore} = need();
  let now=100;
  const store=createArtifactStore({now:()=>now,ttlMs:100,maxBytes:3000,maxEntries:2});
  const first=store.put([{path:'one.txt',text:'first'}]);
  assert.equal(first.sha256,hash(store.get(first.id).bytes));
  assert.equal(store.put([{path:'one.txt',text:'first'}]).id,first.id);
  const second=store.put([{path:'two.txt',text:'second'}]);
  store.put([{path:'three.txt',text:'third'}]);
  assert.equal(store.get(first.id),null);
  assert.ok(store.get(second.id));
  now=201;
  assert.equal(store.get(second.id),null);
  assert.equal(store.get('../etc/passwd'),null);
  assert.throws(()=>store.put([{path:'large.txt',text:'a'.repeat(3001)}]),/limit|large/i);
});

test('file manifest hashes bytes and omits large inline sources without truncating downloads', () => {
  const {describeFiles} = need();
  const files=describeFiles([{path:'a.mjs',text:'export const a=1;'}],{inlineLimit:30});
  assert.equal(files[0].sha256,hash('export const a=1;'));
  assert.equal(files[0].text,'export const a=1;');
  const large=describeFiles([{path:'large.txt',text:'z'.repeat(31)}],{inlineLimit:30});
  assert.equal(large[0].bytes,31);
  assert.equal(large[0].text,undefined);
});

test('kit inventory and component downloads use a fixed file allowlist', async t => {
  const {createKit} = need();
  const root=await mkdtemp(path.join(os.tmpdir(),'gui95-kit-fixture-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  await mkdir(path.join(root,'components'));
  await writeFile(path.join(root,'components','gui95.mjs'),'export const enhance=()=>{};');
  await writeFile(path.join(root,'components','gui95.css'),'.gui95{color:black}');
  await writeFile(path.join(root,'components','README.md'),'# Integration\nUse enhance().');
  for(const name of ['components/gallery.html','test/components.test.mjs','test/components-runner.test.mjs','verify/runner.mjs','verify/README.md','package.json','package-lock.json']) {await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),'fixture');}
  const kit=createKit({root,publicURL:'https://example.test/gui95/'});
  assert.ok(kit.inventory().components.some(c=>c.id==='menu'));
  const result=await kit.component('menu');
  assert.equal(result.component,'menu');
  assert.ok(result.files.some(file=>file.path==='components/gui95.mjs'));
  assert.ok(result.files.some(file=>file.path==='test/components.test.mjs'),'Component kit includes its executable regression checks');
  assert.match(result.artifact.url,/https:\/\/example.test\/gui95\/artifacts\/[a-f0-9]{64}\.zip/);
  assert.ok(kit.artifacts.get(result.artifact.id).bytes);
  await assert.rejects(kit.component('../../.ssh'),/Unknown component/);
});

test('artifact bytes expire while idle and invalid cache limits cannot hang eviction',async()=>{
 const {createArtifactStore}=need();
 const store=createArtifactStore({ttlMs:10});
 store.put([{path:'private-label.txt',text:'temporary generated label'}]);
 await new Promise(resolve=>setTimeout(resolve,30));
 assert.deepEqual(store.stats(),{entries:0,bytes:0});
 for(const bad of [{maxEntries:0},{maxBytes:0},{ttlMs:0}])assert.throws(()=>createArtifactStore(bad),/limit/i);
 store.close();
});

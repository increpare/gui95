import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile,mkdir,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
test('deployment tar excludes host metadata and preserves a runnable standalone distribution',async t=>{
 const build=spawnSync(process.execPath,['mcp/package.mjs'],{cwd:root,encoding:'utf8'});
 assert.equal(build.status,0,build.stderr);
 const output=JSON.parse(build.stdout);
 assert.ok(output.kit,'Builder must emit a standalone kit ZIP');
 assert.ok(output.icons,'Builder must emit a ready-made CC0 icon ZIP');
 const dir=await mkdtemp(path.join(os.tmpdir(),'gui95-pack-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const extract=spawnSync('tar',['-xzf',output.deployment,'-C',dir],{encoding:'utf8',env:{...process.env,COPYFILE_DISABLE:'1'}});
 assert.equal(extract.status,0,extract.stderr);
 assert.ok(!extract.stderr.includes('LIBARCHIVE.xattr'),extract.stderr.slice(0,500));
 const service=path.join(dir,'gui95-mcp');
 const manifest=JSON.parse(await readFile(path.join(service,'RELEASE.json'),'utf8'));
 const {loadCatalog}=await import(pathToFileURL(path.join(service,'service/catalog.mjs')));
 const catalog=await loadCatalog(path.join(service,'content'));
 assert.equal(catalog.revision,manifest.content_revision);
 const {createApplication}=await import(pathToFileURL(path.join(service,'service/server.mjs')));
 const app=await createApplication({contentRoot:path.join(service,'content'),stateDir:path.join(dir,'state'),kitRoot:path.join(service,'kit')});
 try {assert.ok((await app.kit.fullKit()).files.some(file=>file.path==='references/snapshot-manifest.json'));} finally {await app.close();}
 const standalone=path.join(dir,'standalone');
 const zip=await readFile(output.kit);let cursor=0;
 while(zip.readUInt32LE(cursor)===0x04034b50) {
  const size=zip.readUInt32LE(cursor+18),nameLength=zip.readUInt16LE(cursor+26),extraLength=zip.readUInt16LE(cursor+28);
  const name=zip.subarray(cursor+30,cursor+30+nameLength).toString('utf8');
  assert.ok(!name.startsWith('/')&&!name.split('/').includes('..'));
  const start=cursor+30+nameLength+extraLength,target=path.join(standalone,name);
  await mkdir(path.dirname(target),{recursive:true});await writeFile(target,zip.subarray(start,start+size));cursor=start+size;
 }
 const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
 const evidence=spawnSync(process.execPath,['--test','kit/test/evidence.test.mjs'],{cwd:standalone,encoding:'utf8',env:childEnv});
 assert.equal(evidence.status,0,evidence.stdout+evidence.stderr);
 const cli=spawnSync(process.execPath,[path.join(service,'kit/cli.mjs'),'list'],{encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);
 assert.ok(JSON.parse(cli.stdout).components.some(c=>c.id==='dialog'));
});

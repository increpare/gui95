import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
test('local CLI verification reports a failing exit status for an unreachable app',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'gui95-cli-failure-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,[cli,'verify','http://127.0.0.1:1',dir],{encoding:'utf8',timeout:30000});
 const report=JSON.parse(await readFile(path.join(dir,'report.json'),'utf8'));
 assert.equal(report.status,'failed');
 assert.equal(report.kitVersion,(await import('../distribution.mjs')).KIT_VERSION);
 assert.equal(result.status,1,result.stdout+result.stderr);
});
test('a component bundle carries the period lint that its verifier imports',async t=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'gui95-cli-bundle-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const out=path.join(parent,'dialog');
 const result=spawnSync(process.execPath,[cli,'component','dialog',out],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(await readFile(path.join(out,'verify','period-lint.mjs'),'utf8'),/export async function lintPage/);
 assert.match(await readFile(path.join(out,'verify','runner.mjs'),'utf8'),/period-lint\.mjs/);
});
test('tabs and list box are runtime components that the update check recognizes',async t=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'gui95-cli-tabs-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const out=path.join(parent,'tabs');
 const result=spawnSync(process.execPath,[cli,'component','tabs',out],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 const manifest=JSON.parse(await readFile(path.join(out,'gui95-consumer.json'),'utf8'));
 assert.deepEqual(Object.keys(manifest.components).sort(),['dialog','listbox','menu','number-field','splitter','tabs','toolbar','tree']);
 const {checkUpdates}=await import('../evidence/catalog.mjs');
 assert.deepEqual(checkUpdates(manifest).components.filter(item=>item.status!=='current').map(item=>item.id),[]);
});
test('the lint command needs an explicit URL',()=>{
 const result=spawnSync(process.execPath,[cli,'lint'],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,1,result.stdout+result.stderr);
 assert.match(result.stderr+result.stdout,/http/);
});
test('a component bundle carries the state atlas check with its baseline image byte for byte',async t=>{
 const parent=await mkdtemp(path.join(os.tmpdir(),'gui95-cli-atlas-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const out=path.join(parent,'menu');
 const result=spawnSync(process.execPath,[cli,'component','menu',out],{encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 for(const name of ['components/atlas.html','verify/atlas.mjs','test/atlas.test.mjs'])assert.ok((await readFile(path.join(out,name),'utf8')).length,name);
 assert.deepEqual(await readFile(path.join(out,'test','baseline','state-atlas.png')),await readFile(fileURLToPath(new URL('../test/baseline/state-atlas.png',import.meta.url))));
});
test('the atlas command compares the state atlas with its baseline',()=>{
 const result=spawnSync(process.execPath,[cli,'atlas'],{encoding:'utf8',timeout:60000});
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(result.stdout,/matches/);
});
test('the wording and layout lint commands need an explicit URL and exit 2 without one',()=>{
 for(const command of ['lint-wording','lint-layout']){
  const result=spawnSync(process.execPath,[cli,command],{encoding:'utf8',timeout:30000});
  assert.equal(result.status,2,result.stdout+result.stderr);
  assert.match(result.stderr,new RegExp('node kit/cli\\.mjs '+command+' URL'));
 }
});

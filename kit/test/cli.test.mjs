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
 assert.equal(JSON.parse(await readFile(path.join(dir,'report.json'),'utf8')).status,'failed');
 assert.equal(result.status,1,result.stdout+result.stderr);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../../kit/cli.mjs',import.meta.url));
test('standalone kit CLI lists working capabilities and rejects unknown commands',()=>{
 const listed=spawnSync(process.execPath,[cli,'list'],{encoding:'utf8'});
 assert.equal(listed.status,0,listed.stderr);
 assert.ok(JSON.parse(listed.stdout).components.some(c=>c.id==='menu'));
 const unknown=spawnSync(process.execPath,[cli,'shell'],{encoding:'utf8'});
 assert.equal(unknown.status,1);assert.match(unknown.stderr,/Unknown command/);
});

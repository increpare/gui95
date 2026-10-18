import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let runVerification;
try { ({runVerification}=await import('../verify/runner.mjs')); } catch {}
test('local verification captures explicit scale evidence and separates native checks',async()=>{
  assert.equal(typeof runVerification,'function','runner exports runVerification');
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="en"><title>Verification fixture</title><body><main><h1>Fixture</h1><label for="name">Name</label><input id="name"><button>Save</button></main></body></html>')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const output=await mkdtemp(join(tmpdir(),'gui95-verify-'));
  try{
    const report=await runVerification({url:`http://127.0.0.1:${server.address().port}`,output,scales:[1,1.25,1.5,2]});
    assert.equal(report.scales.length,4);assert.equal(report.failures.length,0);
    assert.equal(report.screenshots.length,8);assert.ok(report.screenshots.every(item=>item.status==='needs-review'));
    assert.ok(report.nativeChecks.every(item=>item.status==='not-run'));
    assert.ok(report.assertions.some(item=>item.name==='controls-have-accessible-names'&&item.status==='passed'));
    assert.equal(JSON.parse(await readFile(join(output,'report.json'),'utf8')).url,report.url);
    for(const shot of report.screenshots){const bytes=await readFile(join(output,shot.path));assert.equal(bytes.subarray(1,4).toString(),'PNG')}
  }finally{await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true})}
});
test('local verification reports observed browser failures instead of treating screenshots as proof',async()=>{
  const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><button></button><div style="width:2000px">Overflow</div><script>throw new Error("verification fixture error")</script></body></html>')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const output=await mkdtemp(join(tmpdir(),'gui95-verify-failure-'));
  try{const report=await runVerification({url:`http://127.0.0.1:${server.address().port}`,output,scales:[1]});assert.equal(report.status,'failed');assert.ok(report.failures.some(item=>item.name==='controls-have-accessible-names'));assert.ok(report.failures.some(item=>item.name==='uncaught-browser-errors'));assert.ok(report.failures.some(item=>item.name==='document-fits-viewport'));assert.equal(report.screenshots.length,2)}finally{await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true})}
});
test('verification requires an explicit HTTP URL, output and supported scales',async()=>{for(const args of [{url:'file:///tmp/example.html',output:'/tmp/gui95-invalid'},{url:'http://user:pass@localhost',output:'/tmp/gui95-invalid'},{url:'http://localhost'},{url:'http://localhost',output:'/tmp/gui95-invalid',scales:[3]}])await assert.rejects(()=>runVerification(args),TypeError)});

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
const serveOnce=async body=>{const server=createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang="en"><title>Period fixture</title><body>${body}</body></html>`)});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server};
test('a GUI95-scoped page with modern styling fails verification through the period lint',async()=>{
  const server=await serveOnce('<main class="gui95"><button style="border:0;border-radius:6px;box-shadow:0 2px 6px #000">Save</button></main>');const output=await mkdtemp(join(tmpdir(),'gui95-verify-period-'));
  try{const report=await runVerification({url:`http://127.0.0.1:${server.address().port}`,output,scales:[1]});
    assert.equal(report.status,'failed');const failure=report.failures.find(item=>item.name==='period-lint');assert.ok(failure,'period-lint is a recorded failure');
    assert.deepEqual([...new Set(failure.details.violations.map(item=>item.rule))].sort(),['rounded-corner','soft-shadow']);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true})}
});
test('the menu probe stands aside while an application modal dialog is open',async()=>{
  const server=await serveOnce('<style>dialog::backdrop{background:transparent}button{border:0;background:#c0c0c0}</style><main class="gui95"><nav data-gui95-menubar aria-label="Application"><button data-gui95-menu="file-menu" aria-haspopup="menu" aria-controls="file-menu" aria-expanded="false">File</button></nav><div id="file-menu" role="menu" hidden><button role="menuitem">New</button></div><dialog id="welcome" aria-label="Welcome"><button>Start</button></dialog></main><script>const dialog=document.querySelector("#welcome");dialog.showModal();dialog.addEventListener("close",()=>{throw new Error("the application dialog was closed")});document.addEventListener("keydown",event=>{throw new Error("a key reached the page: "+event.key)},true)</script>');
  const output=await mkdtemp(join(tmpdir(),'gui95-verify-modal-'));
  try{const report=await runVerification({url:`http://127.0.0.1:${server.address().port}`,output,scales:[1]});
    assert.deepEqual(report.failures,[]);const probe=report.assertions.find(item=>item.name==='menu-keyboard-open-close');
    assert.equal(probe.status,'passed');assert.equal(probe.details.applicable,false);assert.match(probe.details.reason,/modal dialog/i);
  }finally{await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true})}
});
test('a page without a GUI95 scope gets period findings as information, not a failure',async()=>{
  const server=await serveOnce('<main><button style="border:0;border-radius:6px">Save</button></main>');const output=await mkdtemp(join(tmpdir(),'gui95-verify-unscoped-'));
  try{const report=await runVerification({url:`http://127.0.0.1:${server.address().port}`,output,scales:[1]});
    assert.equal(report.failures.length,0);const item=report.assertions.find(entry=>entry.name==='period-lint');assert.equal(item.status,'passed');assert.equal(item.details.applicable,false);assert.ok(item.details.violations.some(entry=>entry.rule==='rounded-corner'));
  }finally{await new Promise(resolve=>server.close(resolve));await rm(output,{recursive:true,force:true})}
});

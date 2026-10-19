import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateLayout } from '../generators/layout.mjs';
import { createCommandRegistry } from '../generators/commands.mjs';
import { generateStarter } from '../generators/starters.mjs';

// Node cannot directly spawn a .cmd launcher on Windows. Invoke npm's JS entry.
const npm = process.platform === 'win32' ? [process.execPath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')] : ['npm'];

const text = (result,name) => result.files.find(f=>f.path===name)?.text;
test('structured layout escapes labels and serialised values, links labels, and bounds requests',()=>{
  for(const type of ['properties','preferences','inspector','editor']) {
    const out=generateLayout({type,title:'A < B " test',groups:[{id:'general',label:'General',fields:[{id:'title',label:'Name <img>',value:'</script><img src=x>',type:'text'},{id:'count',label:'Count',type:'number',min:1,max:10,value:3}]}]});
    assert.match(text(out,'index.html'),/Name &lt;img&gt;/);
    assert.match(text(out,'index.html'),/for="title"/);
    assert.ok(!text(out,'app.mjs').includes('</script>'));
    assert.match(text(out,'index.html'),/data-gui95-number/);
  }
  assert.throws(()=>generateLayout({type:'unknown'}), /type/);
  assert.throws(()=>generateLayout({type:'properties',fields:[{id:'x',type:'number',min:10,max:1}]}),/min/);
  assert.throws(()=>generateLayout({type:'properties',fields:[{id:'a'},{id:'a'}]}),/Duplicate/);
  assert.throws(()=>generateLayout({type:'properties',width:2}),/width/);
});

test('shared command state, owner, repeats, and shortcut conflicts work at runtime',async()=>{
  const calls=[];
  const commands=createCommandRegistry([
    {id:'file.save',label:'Save',shortcut:'Ctrl+S',help:'Save document',run:ctx=>calls.push(ctx.owner),enabled:ctx=>ctx.dirty},
    {id:'view.grid',label:'Grid',shortcut:'Ctrl+G',checked:ctx=>ctx.grid,run:()=>calls.push('grid')},
    {id:'edit.step',label:'Step',shortcut:'ArrowRight',repeat:true,target:'document',run:()=>calls.push('step')}
  ],{context:{dirty:false,grid:true,owner:'document'}});
  assert.equal(commands.state('file.save').enabled,false);
  assert.equal(await commands.execute('file.save'),false);
  commands.setContext({dirty:true,grid:false,owner:'document'});
  assert.equal(await commands.execute('file.save'),true);
  assert.deepEqual(calls,['document']);
  assert.equal(commands.state('view.grid').checked,false);
  const event=(key,more={})=>({key,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,repeat:false,target:{tagName:'DIV',closest:()=>null},preventDefault(){this.prevented=true;},...more});
  const save=event('s',{ctrlKey:true});
  assert.equal(commands.handleKeydown(save),true);
  assert.equal(save.prevented,true);
  assert.equal(commands.handleKeydown(event('s',{ctrlKey:true,repeat:true})),false);
  assert.equal(commands.handleKeydown(event('ArrowRight',{repeat:true})),true);
  commands.setContext({owner:'dialog',dirty:true});
  assert.equal(commands.handleKeydown(event('ArrowRight')),false);
  assert.equal(commands.handleKeydown(event('s',{ctrlKey:true,target:{tagName:'INPUT',closest:()=>null}})),false);
  const conflicts=createCommandRegistry([{id:'a',shortcut:'Ctrl+S',mnemonic:'s',run(){}},{id:'b',shortcut:'Control+s',mnemonic:'S',run(){}}]).diagnostics();
  assert.ok(conflicts.some(x=>x.code==='shortcut-conflict'));
  assert.ok(conflicts.some(x=>x.code==='mnemonic-conflict'));
  assert.throws(()=>createCommandRegistry([{id:'a',run(){}},{id:'a',run(){}}]), /Duplicate/);
});

test('each starter is executable as a web bundle and carries validated delivery helpers',async()=>{
  for(const template of ['utility','editor','browser']) {
    const out=generateStarter({template,name:'Test App',id:'test-app'});
    const dir=await mkdtemp(path.join(tmpdir(),'gui95-starter-'));
    try {
      for(const file of out.files) { const target=path.join(dir,file.path); await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,file.text); }
      for(const file of out.files.filter(x=>/\.(?:mjs|cjs)$/.test(x.path))) {
        const run=spawnSync(process.execPath,['--check',path.join(dir,file.path)],{encoding:'utf8'});
        assert.equal(run.status,0,`${template}/${file.path}: ${run.stderr}`);
      }
      const manifest=JSON.parse(text(out,'gui95-app.json'));
      assert.equal(manifest.apps[0].id,'test-app');
      const pkg=JSON.parse(text(out,'package.json'));
      assert.equal(pkg.build.executableName,undefined,'global executableName must not rename the macOS display-name bundle');
      assert.equal(pkg.build.win.executableName,'test-app');
      assert.equal(pkg.build.linux.executableName,'test-app');
      assert.ok(Object.values(pkg.devDependencies).every(v=>/^\d+\.\d+\.\d+$/.test(v)));
      assert.equal(text(out,'scripts/gui95-app.mjs'),await readFile(new URL('../../tools/gui95-app.mjs',import.meta.url),'utf8'));
      assert.equal(text(out,'scripts/gui95-icons.mjs'),await readFile(new URL('../../tools/gui95-icons.mjs',import.meta.url),'utf8'));
      const testEnv={...process.env};delete testEnv.NODE_TEST_CONTEXT;
      const run=spawnSync(npm[0],[...npm.slice(1),'test'],{cwd:dir,encoding:'utf8',env:testEnv});
      assert.equal(run.status,0,run.stdout+run.stderr);
      assert.match(run.stdout,/tests 4/,'the independent generated npm test actually executes all four tests');
    } finally {await rm(dir,{recursive:true,force:true});}
  }
  assert.throws(()=>generateStarter({template:'utility',name:'Bad/name',id:'x'}),/name/);
  assert.throws(()=>generateStarter({template:'editor',name:'X',id:'../x'}),/id/);
});

test('DOM command owners survive execution and focused buttons keep native activation',async()=>{
  let runs=0;
  const registry=createCommandRegistry([{id:'dialog.accept',target:'dialog',shortcut:'Ctrl+Enter',run:()=>runs++},{id:'button.space',shortcut:'Space',run:()=>runs++}],{context:{owner:'document'}});
  const event={key:'Enter',ctrlKey:true,target:{tagName:'DIV',closest:selector=>selector==='[data-command-owner]'?{dataset:{commandOwner:'dialog'}}:null},preventDefault(){}};
  assert.equal(registry.handleKeydown(event),true);
  await Promise.resolve();
  assert.equal(runs,1);
  assert.equal(registry.handleKeydown({key:' ',target:{tagName:'BUTTON',closest:()=>null},preventDefault(){}}),false);
  assert.equal(runs,1);
});

test('menu activation dispatches a document command to the active document owner',async()=>{
  let owner;
  const registry=createCommandRegistry([{id:'document.save',target:'document',run:ctx=>{owner=ctx.owner;}}],{context:{owner:'document'}});
  const event={target:{closest:selector=>selector==='[role="menu"]'?{}:null}};
  assert.equal(await registry.execute('document.save',event),true);
  assert.equal(owner,'document');
});

test('clean npm install does not invoke the desktop installer lifecycle',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'gui95-install-'));
  try{
    const pkg=JSON.parse(text(generateStarter({template:'utility',name:'Install Test',id:'install-test'}),'package.json'));
    pkg.devDependencies={};
    await writeFile(path.join(directory,'package.json'),JSON.stringify(pkg));
    const run=spawnSync(npm[0],[...npm.slice(1),'install','--offline','--no-audit','--no-fund','--cache',path.join(directory,'cache')],{cwd:directory,encoding:'utf8'});
    assert.equal(run.status,0,run.stdout+run.stderr);
    assert.equal(pkg.scripts['install-app'],'node scripts/gui95-app.mjs install');
  }finally{await rm(directory,{recursive:true,force:true});}
});

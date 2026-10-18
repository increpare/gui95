import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,readFile,rm,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import http from 'node:http';
import {chromium} from 'playwright';
import {generateStarter} from '../generators/starters.mjs';
import {generateLayout} from '../generators/layout.mjs';
async function fixture(result,run){
  const directory=await mkdtemp(path.join(tmpdir(),'gui95-browser-'));
  let browser;let server;
  try{
    for(const file of result.files){const target=path.join(directory,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.text);}
    await mkdir(path.join(directory,'components'),{recursive:true});
    for(const file of ['gui95.css','gui95.mjs'])await copyFile(new URL('../components/'+file,import.meta.url),path.join(directory,'components',file));
    server=http.createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://localhost').pathname;const filename=path.join(directory,pathname==='/'?'index.html':pathname);const body=await readFile(filename);res.writeHead(200,{'Content-Type':filename.endsWith('.mjs')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html'}).end(body);}catch{res.writeHead(404).end();}});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await run(page,`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(errors,[],'generated app has no runtime errors');
  }finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());await rm(directory,{recursive:true,force:true});}
}
const documentState=page=>page.evaluate(async()=> (await import('./app.mjs')).model.read());
test('utility opens text, transforms, downloads, and preserves edits during an asynchronous desktop save',async()=>{
  await fixture(generateStarter({template:'utility',name:'Text Utility',id:'text-utility'}),async(page,url)=>{
    await page.goto(url);await page.locator('#document').fill('hello world');
    await page.locator('.utility-tools [data-command="edit.uppercase"]').click();
    assert.equal(await page.locator('#document').inputValue(),'HELLO WORLD');
    const download=page.waitForEvent('download');await page.locator('.toolbar [data-command="file.save"]').click();await download;
    assert.equal((await documentState(page)).dirty,false);
    const chooser=page.waitForEvent('filechooser');await page.locator('.toolbar [data-command="file.open"]').click();await (await chooser).setFiles({name:'input.txt',mimeType:'text/plain',buffer:Buffer.from('opened text')});
    await page.waitForFunction(()=>document.getElementById('document').value==='opened text');
    assert.equal((await documentState(page)).name,'input.txt');
    await page.evaluate(()=>{globalThis.gui95Desktop={getPreferences:async()=>({fontSize:13,wrap:true}),savePreferences:async()=>true,openText:async()=>null,saveText:data=>new Promise(resolve=>{globalThis.pendingSave={data,resolve};})};});
    // A new page lets the app capture the deliberately asynchronous desktop bridge at startup.
    await page.addInitScript(()=>{globalThis.gui95Desktop={getPreferences:async()=>({fontSize:13,wrap:true}),savePreferences:async()=>true,openText:async()=>null,saveText:data=>new Promise(resolve=>{globalThis.pendingSave={data,resolve};})};});
    await page.reload();await page.locator('#document').fill('captured');await page.locator('.toolbar [data-command="file.save"]').click();
    await page.waitForFunction(()=>Boolean(globalThis.pendingSave));await page.locator('#document').fill('new edit');
    await page.evaluate(()=>pendingSave.resolve({name:'saved.txt',handle:'chosen-file'}));
    await page.waitForFunction(()=>document.title.includes('saved.txt'));
    assert.equal((await documentState(page)).dirty,true);
    assert.equal((await documentState(page)).text,'new edit');
    await page.evaluate(async()=>{(await import('./app.mjs')).model.load();});
  });
});
test('editor preferences validate, cancel restores focus, and menu checked state stays shared',async()=>{
  await fixture(generateStarter({template:'editor',name:'Editor',id:'editor'}),async(page,url)=>{
    await page.goto(url);await page.locator('[data-gui95-menu="edit-menu"]').click();await page.locator('#edit-menu [data-command="app.preferences"]').click();
    assert.equal(await page.locator('#preferences').evaluate(dialog=>dialog.open),true);
    await page.locator('#font-size').fill('18');await page.locator('#wrap').uncheck();await page.locator('#preferences button[value="ok"]').click();
    assert.equal(await page.locator('#document').evaluate(node=>getComputedStyle(node).fontSize),'18px');
    assert.equal(await page.locator('#document').getAttribute('wrap'),'off');
    assert.equal(await page.locator('[data-command="view.wrap"]').getAttribute('aria-checked'),'false');
    await page.locator('[data-gui95-menu="edit-menu"]').click();await page.locator('#edit-menu [data-command="app.preferences"]').click();await page.locator('#font-size').fill('21');await page.keyboard.press('Escape');
    assert.equal(await page.locator('#document').evaluate(node=>getComputedStyle(node).fontSize),'18px');
    assert.equal(await page.locator('#preferences').evaluate(dialog=>dialog.open),false);
    await page.reload();assert.equal(await page.locator('#document').evaluate(node=>getComputedStyle(node).fontSize),'18px');
  });
});
test('collection browser filters records and switches documents',async()=>{
  await fixture(generateStarter({template:'browser',name:'Collection',id:'collection'}),async(page,url)=>{
    await page.goto(url);await page.locator('#search').fill('notes');assert.equal(await page.locator('#records button').count(),1);await page.locator('#records button').click();assert.equal((await documentState(page)).name,'Notes.txt');await page.locator('#search').fill('missing');assert.match(await page.locator('#records').textContent(),/No matching/);
  });
});
test('generated properties commit validated values and cancel restores the last commit',async()=>{
  await fixture(generateLayout({type:'properties',title:'Properties',fields:[{id:'name',label:'Name',value:'before',required:true},{id:'count',type:'number',label:'Count',value:3,min:1,max:10}],actions:[{id:'apply',label:'Apply',primary:true},{id:'cancel',label:'Cancel'}]}),async(page,url)=>{
    await page.goto(url);await page.evaluate(()=>document.addEventListener('gui95:commit',event=>globalThis.lastCommit=event.detail));
    await page.locator('#name').fill('after');await page.locator('[data-action="apply"]').click();assert.equal(await page.evaluate(()=>lastCommit.values.name),'after');
    await page.locator('#name').fill('draft');await page.locator('[data-action="cancel"]').click();assert.equal(await page.locator('#name').inputValue(),'after');
    await page.locator('#name').fill('');await page.locator('[data-action="apply"]').click();assert.equal(await page.evaluate(()=>lastCommit.values.name),'after');
  });
});

test('preferences opened from a keyboard menu restore focus to a visible menu heading',async()=>{
  await fixture(generateStarter({template:'editor',name:'Focus Editor',id:'focus-editor'}),async(page,url)=>{
    await page.goto(url);await page.locator('#document').focus();await page.keyboard.press('Alt+e');await page.locator('#edit-menu [data-command="app.preferences"]').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-gui95-menu="edit-menu"]').evaluate(node=>node===document.activeElement),true);
  });
});
test('editing during a pending native open can save the old document before accepting the new one',async()=>{
  await fixture(generateStarter({template:'editor',name:'Open Editor',id:'open-editor'}),async(page,url)=>{
    await page.addInitScript(()=>{globalThis.saved=[];globalThis.gui95Desktop={getPreferences:async()=>({fontSize:13,wrap:true}),savePreferences:async()=>true,openText:()=>new Promise(resolve=>{globalThis.finishOpen=resolve;}),saveText:async data=>{saved.push(data);return {name:'old.txt',handle:'old-handle'};}};});
    await page.goto(url);await page.locator('.toolbar [data-command="file.open"]').click();await page.waitForFunction(()=>Boolean(globalThis.finishOpen));await page.locator('#document').fill('edit while opening');await page.evaluate(()=>finishOpen({name:'new.txt',text:'new document',handle:'new-handle'}));await page.locator('#unsaved button[value="save"]').click();
    assert.equal(await page.evaluate(()=>saved.length),1);
    assert.equal(await page.evaluate(()=>saved[0].text),'edit while opening');
    await page.waitForFunction(()=>document.getElementById('document').value==='new document');assert.equal((await documentState(page)).name,'new.txt');
  });
});

test('collection quota failures keep only persisted records and report the failed addition',async()=>{
  await fixture(generateStarter({template:'browser',name:'Quota Collection',id:'quota-collection'}),async(page,url)=>{
    await page.goto(url);await page.locator('#document').fill('a'.repeat(3*1024*1024));
    await page.locator('[data-command="collection.add"]').click();assert.equal(await page.locator('#records button').count(),3);
    await page.locator('[data-command="collection.add"]').click();
    assert.equal(await page.locator('#records button').count(),3);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('gui95:records')).length),3);
    assert.match(await page.locator('#status').textContent(),/could not be stored/);
    await page.evaluate(async()=>{(await import('./app.mjs')).model.load();});
    await page.reload();assert.equal(await page.locator('#records button').count(),3);
  });
});

test('preferences layout retains the last commit after persistence fails',async()=>{
  await fixture(generateLayout({type:'preferences',title:'Failing Preferences',fields:[{id:'name',value:'before'}]}),async(page,url)=>{
    await page.goto(url);await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('storage unavailable');};});
    await page.locator('#name').fill('after');await page.locator('[data-action="apply"]').click();assert.match(await page.locator('#gui95-status').textContent(),/could not be saved/);
    await page.locator('#name').fill('draft');await page.locator('[data-action="cancel"]').click();assert.equal(await page.locator('#name').inputValue(),'before');
  });
});

test('collection switching reports native save failures and keeps the dirty document',async()=>{
  await fixture(generateStarter({template:'browser',name:'Error Collection',id:'error-collection'}),async(page,url)=>{
    await page.addInitScript(()=>{globalThis.gui95Desktop={getPreferences:async()=>({fontSize:13,wrap:true}),savePreferences:async()=>true,openText:async()=>null,saveText:async()=>{throw new Error('Permission denied');}};});
    await page.goto(url);await page.locator('#document').fill('keep this draft');await page.locator('#records button').nth(1).click();await page.locator('#unsaved button[value="save"]').click();
    await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Permission denied'));
    assert.equal(await page.locator('#document').inputValue(),'keep this draft');assert.equal((await documentState(page)).dirty,true);await page.evaluate(async()=>{(await import('./app.mjs')).model.load();});
  });
});

test('status help restores ordinary messages and preserves newer application errors',async()=>{
  await fixture(generateStarter({template:'utility',name:'Status Utility',id:'status-utility'}),async(page,url)=>{
    await page.goto(url);
    const states=await page.evaluate(async()=>{
      const {createCommandRegistry}=await import('./commands.mjs');const root=document.createElement('section');const button=document.createElement('button');button.dataset.command='test.help';button.textContent='Help target';const input=document.createElement('input');const output=document.createElement('output');output.textContent='Ready';root.append(button,input,output);document.body.append(root);
      const registry=createCommandRegistry([{id:'test.help',help:'Temporary help',run(){}}]);const dispose=registry.bind(root,{status:output});const results=[];
      button.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));results.push(output.textContent);
      button.focus();input.focus();results.push(output.textContent);
      button.focus();output.textContent='Permission denied';input.focus();results.push(output.textContent);
      dispose();root.remove();return results;
    });
    assert.deepEqual(states,['Temporary help','Ready','Permission denied']);
  });
});

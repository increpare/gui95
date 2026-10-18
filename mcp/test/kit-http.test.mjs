import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createApplication} from '../server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');

async function live(t) {
 const state=await mkdtemp(path.join(os.tmpdir(),'gui95-kit-http-'));
 const service=await createApplication({contentRoot:root,stateDir:state});
 const listener=service.app.listen(0,'127.0.0.1');
 await new Promise(resolve=>listener.once('listening',resolve));
 const base='http://127.0.0.1:'+listener.address().port+'/gui95';
 const client=new Client({name:'gui95-kit-test',version:'1.0.0'});
 t.after(async()=>{await client.close();listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await service.close();await rm(state,{recursive:true,force:true});});
 await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));
 return {client,base};
}

test('real MCP client discovers versioned build kits and rejects unrecognized artifact IDs',async t=>{
 const {client,base}=await live(t);
 const tools=await client.listTools();
 assert.ok(tools.tools.some(tool=>tool.name==='list_gui95_kits'),'MCP must expose build-kit discovery');
 for(const tool of tools.tools.filter(tool=>tool.name!=='submit_gui95_feedback')) assert.equal(tool.annotations.readOnlyHint,true);
 const result=await client.callTool({name:'list_gui95_kits',arguments:{}});
 assert.ok(result.structuredContent.components.some(component=>component.id==='menu'));
 assert.equal(result.structuredContent.kit_version,'1.0.0');
 assert.equal(result.structuredContent.icons.count,105);
 assert.equal((await fetch(base+'/artifacts/'+ 'a'.repeat(64)+'.zip')).status,404);
 assert.equal((await fetch(base+'/kit/../../mcp/store.mjs')).status,404);
});

test('all seven feature areas return usable artifacts through a real MCP client',async t=>{
 const {client,base}=await live(t);
 const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;};
 const component=await call('get_gui95_component',{component:'dialog'});
 const zip=await fetch(base+'/artifacts/'+component.artifact.id+'.zip');
 assert.equal(zip.status,200);const bytes=Buffer.from(await zip.arrayBuffer());
 const {createHash}=await import('node:crypto');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),component.artifact.sha256);
 assert.ok(component.files.some(file=>file.path==='components/gui95.css'));
 const icons=await call('get_gui95_icons',{query:'save',limit:5});assert.ok(icons.icons.length);
 const icon=await call('get_gui95_icons',{name:icons.icons[0].name,size:16,format:'svg'});assert.match(icon.svg,/<svg/);assert.equal(icon.icon.license,'CC0-1.0');
 const layout=await call('generate_gui95_layout',{type:'properties',title:'HTTP fixture',fields:[{id:'name',label:'Name',type:'text'}]});assert.ok(layout.files.some(file=>file.path.endsWith('.html')));
 const starter=await call('generate_gui95_starter',{template:'editor',name:'HTTP Fixture',id:'http-fixture'});assert.ok(starter.files.some(file=>file.path==='package.json'));
 const evidence=await call('get_gui95_evidence',{query:'dialog',limit:5});assert.ok(evidence.items.length);assert.ok(evidence.items.some(item=>item.source.url||item.local_refs?.some(ref=>ref.sha256)));
 const repairs=await call('get_gui95_repairs',{query:'pointer'});assert.ok(repairs.items.length);
 const updates=await call('check_gui95_updates',{manifest:{schema_version:1,components:{menu:'1.0.0'}}});assert.equal(updates.components[0].status,'current');
 assert.equal((await fetch(base+'/icons')).status,200);
 assert.equal((await fetch(base+'/icons/'+icons.icons[0].name+'.png?size=32')).headers.get('content-type'),'image/png');
 assert.equal((await fetch(base+'/kit/components/gui95.mjs')).status,200);
 assert.equal((await fetch(base+'/reference?path=docs/widgets.md&sha256=wrong')).status,409);
 const bad=await client.callTool({name:'generate_gui95_layout',arguments:{type:'properties',title:'Bad',fields:[{id:'../escape',label:'No'}]}});assert.equal(bad.isError,true);
});

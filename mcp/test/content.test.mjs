import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {loadCatalog} from '../catalog.mjs';
import {createApplication} from '../server.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const loaded=loadCatalog(root);
async function temporary(t){const directory=await mkdtemp(path.join(os.tmpdir(),'gui95-content-test-'));t.after(async()=>{if(!directory.startsWith(path.join(os.tmpdir(),'gui95-content-test-')))throw Error('Unsafe test cleanup');await rm(directory,{recursive:true,force:true});});return directory;}
async function fixture(t){const target=await temporary(t),catalog=await loaded;for(const [name,file]of catalog.files){await mkdir(path.dirname(path.join(target,name)),{recursive:true});await writeFile(path.join(target,name),file.bytes);}return target;}
async function service(t){const application=await createApplication({contentRoot:root,stateDir:await temporary(t)}),listener=application.app.listen(0,'127.0.0.1');await new Promise(resolve=>listener.once('listening',resolve));const base='http://127.0.0.1:'+listener.address().port+'/gui95',client=new Client({name:'gui95-content-test',version:'1.0.0'});t.after(async()=>{await client.close();listener.closeAllConnections();await new Promise(resolve=>listener.close(resolve));await application.close();});await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp')));return{application,base,client};}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

test('the public inventory covers every widget, source, tool, notice and binary asset',async()=>{
 const catalog=await loaded;assert.equal(catalog.widgets.size,38);
 for(const widget of catalog.widgets.values()){assert.ok(catalog.files.has(widget.path));assert.ok(catalog.files.has(widget.authoring_path));const result=catalog.widget(widget.id);assert.equal(sha(Buffer.from(result.template.code)),result.template.sha256);assert.ok(result.template.code.includes('MIT License'));assert.ok(result.states&&result.keyboard&&result.scope&&result.sources.length);}
 for(const name of ['docs/historical-audit-2026-10-18.md','docs/historical-sources.md','examples/widgets/QA.md','examples/widgets/check.mjs','demo/README.md','demo/QA.md','demo/serve.mjs','demo/dist/desktop.js','demo/dist/desktop.css','tools/gui95-app.mjs','tools/gui95-icons.mjs','tools/build-widget-examples.mjs','references/vector95/electron/main.cjs'])assert.ok(catalog.files.has(name),name);
 const snapshot=JSON.parse(await readFile(path.join(root,'references/snapshot-manifest.json'),'utf8'));for(const file of snapshot.files)assert.equal(catalog.files.get(file.path)?.sha256,file.sha256,file.path);
 for(const name of ['mcp/var/feedback.jsonl','.git/config','mcp/.env','.codex_tmp/private.md','node_modules/package.json'])assert.equal(catalog.files.has(name),false);
});

test('material browsing paginates the complete inventory and filters assets and templates',async()=>{
 const c=await loaded;let offset=0,names=[];do{const result=c.list({offset,limit:17});names.push(...result.materials.map(x=>x.path));offset=result.next_offset;}while(offset!==null);assert.equal(new Set(names).size,c.files.size);assert.equal(names.length,c.files.size);
 const widgets=c.list({kind:'widget',limit:100});assert.equal(widgets.total,38);assert.ok(widgets.materials.every(x=>x.widget_id));assert.equal(widgets.overview.widgets,38);assert.ok(widgets.overview.start_here.includes('docs/historical-audit-2026-10-18.md'));
 const fonts=c.list({kind:'asset',query:'woff2',limit:100});assert.ok(fonts.total>=6);assert.ok(fonts.materials.every(x=>x.mime_type==='font/woff2'));
 assert.throws(()=>c.list({kind:'private'}),/Invalid/);assert.throws(()=>c.widget('../server'),/Unknown/);assert.throws(()=>c.asset('SKILL.md'),/Unknown/);assert.throws(()=>c.read(fonts.materials[0].path),/Binary asset/);
});

test('search finds the requested independent control instead of repeated boilerplate',async()=>{
 const c=await loaded;
 for(const widget of c.widgets.values())assert.ok(c.search(widget.title,3).some(x=>x.widget_id===widget.id),widget.title);
 for(const [query,id]of [['editable combo box','combobox'],['tri-state checkbox','checkbox'],['radio buttons','radio'],['MRU recent files','menus'],['Apply Cancel','properties'],['treeview','tree'],['trackbar','slider'],['updown spinbutton','spinner'],['save file','save-file']])assert.equal(c.search(query,1)[0]?.widget_id,id,query);
 assert.ok(c.search('Electron startup font',5).some(x=>x.path==='docs/design-guide.md'));
 assert.ok(c.search('icon save',5).some(x=>x.path.endsWith('/icons/save.svg')));
 assert.ok(c.search('font license',5).some(x=>x.kind==='notice'));
 assert.throws(()=>c.search('anything',0),/Invalid/);
});

test('bounded reads reconstruct long minified lines without dropping characters or newlines',async(t)=>{
 const target=await fixture(t),text='A'.repeat(23999)+'😀\n'+'B'.repeat(55000)+'\nLast line\n';await writeFile(path.join(target,'tools/long-source.mjs'),text);const c=await loadCatalog(target);let cursor={line:1,column:0},parts=[],calls=0;
 while(cursor){const result=c.read('tools/long-source.mjs',cursor.line,2,cursor.column);assert.ok(result.text.length<=24000);parts.push(result.text);cursor=result.next_cursor;assert.ok(++calls<15);}
 assert.equal(parts.join(''),text);assert.ok(parts.every(part=>Buffer.from(part).toString()===part));assert.ok(calls>3);assert.throws(()=>c.read('tools/long-source.mjs',1,1,24002),/Invalid/);
});

test('all current icons, fonts and images can be retrieved byte-for-byte with notices',async()=>{
 const c=await loaded;for(const file of c.files.values()){if(file.kind!=='asset')continue;const asset=c.asset(file.path);assert.equal(asset.encoding,'base64');assert.equal(sha(Buffer.from(asset.data,'base64')),file.sha256);assert.equal(asset.notices_path,'THIRD-PARTY-NOTICES.md');if(asset.mime_type.startsWith('font/'))assert.ok(asset.license_note.includes('CC BY-SA'));}const metadata=c.asset('docs/gui95.png',{includeData:false});assert.equal(metadata.data,undefined);
});

test('future public docs are included while private directories and symlinks are not exposed',async(t)=>{
 const target=await fixture(t);await mkdir(path.join(target,'docs/nested'));await writeFile(path.join(target,'docs/nested/new-guide.md'),'# New guide\nUseful published guidance.');await mkdir(path.join(target,'examples/node_modules'));await writeFile(path.join(target,'examples/node_modules/private.md'),'not published');let c=await loadCatalog(target);assert.ok(c.files.has('docs/nested/new-guide.md'));assert.equal(c.files.has('examples/node_modules/private.md'),false);
 const privateDir=await temporary(t);await writeFile(path.join(privateDir,'private.md'),'private');await symlink(privateDir,path.join(target,'docs/alias'),process.platform==='win32'?'junction':'dir');await assert.rejects(loadCatalog(target),/Symlink/);
});

test('missing widget files and modified preserved bytes fail content loading',async(t)=>{
 const target=await fixture(t);await rm(path.join(target,'demo/dist/widgets/combobox.html'));await assert.rejects(loadCatalog(target),/Missing widget template/);await writeFile(path.join(target,'demo/dist/widgets/combobox.html'),(await loaded).files.get('demo/dist/widgets/combobox.html').bytes);await writeFile(path.join(target,'references/vector95/src/classic.css'),'changed');await assert.rejects(loadCatalog(target),/Snapshot hash mismatch/);
});

test('real MCP clients can browse, get complete widgets, read sources, and retrieve assets',async(t)=>{
 const{client,base,application}=await service(t);
 const list=await client.callTool({name:'list_gui95_materials',arguments:{kind:'widget',limit:100}});assert.equal(list.structuredContent.total,38);assert.equal(list.structuredContent.overview.widgets,38);assert.ok(list.structuredContent.gallery_url.endsWith('/preview/widgets/index.html'));
 const found=await client.callTool({name:'search_gui95',arguments:{query:'editable combo box'}});assert.equal(found.structuredContent.results[0].widget_id,'combobox');
 const widget=await client.callTool({name:'get_gui95_widget',arguments:{widget_id:'combobox'}});const template=widget.structuredContent.template;assert.ok(template.code.includes('aria-activedescendant'));assert.equal(sha(Buffer.from(template.code)),template.sha256);assert.ok(template.preview_url.endsWith('/preview/widgets/combobox.html'));
 const light=await client.callTool({name:'get_gui95_widget',arguments:{widget_id:'combobox',include_code:false}});assert.equal(light.structuredContent.template.code,undefined);
 const code=await client.callTool({name:'read_gui95_reference',arguments:{path:'tools/gui95-icons.mjs',line_count:20}});assert.ok(code.structuredContent.text.length);
 const fontPath=[...application.catalog.files.values()].find(x=>x.mime_type==='font/woff2').path;const font=await client.callTool({name:'get_gui95_asset',arguments:{path:fontPath}});assert.equal(sha(Buffer.from(font.structuredContent.data,'base64')),font.structuredContent.sha256);
 const image=await client.callTool({name:'get_gui95_asset',arguments:{path:'docs/gui95.png'}});const pixels=image.content.find(x=>x.type==='image');assert.equal(sha(Buffer.from(pixels.data,'base64')),image.structuredContent.sha256);assert.equal(image.structuredContent.data,undefined);
 const icon=await client.callTool({name:'get_gui95_asset',arguments:{path:'demo/dist/assets/icons/save.svg'}});assert.ok(Buffer.from(icon.structuredContent.data,'base64').toString().includes('<svg'));
 const download=await fetch(base+'/asset?path='+encodeURIComponent(template.path));assert.equal(sha(Buffer.from(await download.arrayBuffer())),template.sha256);assert.ok(download.headers.get('content-disposition').startsWith('attachment;'));assert.equal(download.headers.get('x-content-sha256'),template.sha256);
 const preview=await fetch(base+'/preview/widgets/combobox.html');assert.equal(preview.status,200);assert.ok((await preview.text()).includes('aria-activedescendant'));const csp=preview.headers.get('content-security-policy');assert.ok(csp.includes("connect-src 'none'"));assert.ok(csp.includes('sandbox'));assert.ok(!csp.includes('allow-same-origin'));
 const gallery=await fetch(base+'/preview/widgets/');assert.equal(gallery.status,200);
 assert.equal((await fetch(base+'/preview/assets/ms_sans_serif.woff2',{headers:{Origin:'null'}})).status,200);
 for(const route of ['/asset?path=../../.ssh/id_rsa','/preview/%2e%2e%2fmcp/var/feedback.jsonl','/preview/unknown.html'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await client.callTool({name:'get_gui95_asset',arguments:{path:'mcp/var/feedback.jsonl'}})).isError,true);
 assert.equal((await client.callTool({name:'get_gui95_widget',arguments:{widget_id:'../secret'}})).isError,true);
});

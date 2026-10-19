import { createHash } from 'node:crypto';
import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const KIT_VERSION = '1.0.0';
export const COMPONENTS = ['menu', 'dialog', 'splitter', 'tree', 'toolbar', 'number-field'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const mime = name => ({'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.md':'text/markdown','.zip':'application/zip'}[path.extname(name)] ?? 'text/plain');
const crcTable = Array.from({length:256}, (_, n) => { for(let i=0;i<8;i++) n = n&1 ? 0xedb88320^(n>>>1) : n>>>1; return n>>>0; });
const crc32 = bytes => { let crc=0xffffffff; for(const byte of bytes) crc=crcTable[(crc^byte)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; };

export function normalizedFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length>4096) throw new Error('File count exceeds the artifact limit.');
  const seen=new Set();
  return files.map(file => {
    const name=file.path;
    if (typeof name!=='string' || name.length>250 || !/^[A-Za-z0-9_.\-/]+$/.test(name) || name.startsWith('/') || name.split('/').some(p=>!p||p==='.'||p==='..') || name.includes(':')) throw new Error('Invalid artifact file path.');
    if (seen.has(name)) throw new Error('Duplicate artifact file path: '+name);
    seen.add(name);
    const bytes=Buffer.isBuffer(file.data) ? file.data : typeof file.text==='string' ? Buffer.from(file.text) : null;
    if (!bytes || bytes.length>4*1024*1024) throw new Error('File is missing bytes or exceeds the artifact limit.');
    return {path:name,bytes,mimeType:mime(name),text:typeof file.text==='string' ? file.text : undefined};
  }).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}

// Deterministic stored ZIP: fixed DOS date, UTF-8 names, real CRCs, no host metadata.
export function makeZip(files) {
  const normalized=normalizedFiles(files);
  if(normalized.reduce((sum,file)=>sum+file.bytes.length,0)>24*1024*1024) throw new Error('Artifact exceeds byte limit.');
  const locals=[],central=[];
  let offset=0;
  for(const file of normalized) {
    const name=Buffer.from(file.path),data=file.bytes,crc=crc32(data);
    const local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0x800,6); local.writeUInt16LE(33,12);
    local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(name.length,26);
    const entry=Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50,0); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt16LE(0x800,8); entry.writeUInt16LE(33,14);
    entry.writeUInt32LE(crc,16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42);
    locals.push(local,name,data); central.push(entry,name); offset+=local.length+name.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(normalized.length,8); end.writeUInt16LE(normalized.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}

export function describeFiles(files,{inlineLimit=16000}={}) {
  const normalized=normalizedFiles(files);
  const inline=normalized.reduce((sum,file)=>sum+file.bytes.length,0)<=inlineLimit;
  return normalized.map(file=>({path:file.path,bytes:file.bytes.length,mime_type:file.mimeType,sha256:hash(file.bytes),...(inline&&file.text!==undefined?{text:file.text}:{})}));
}

export function createArtifactStore({now=Date.now,ttlMs=15*60*1000,maxBytes=32*1024*1024,maxEntries=64}={}) {
  if(!Number.isInteger(ttlMs)||ttlMs<1||ttlMs>2147483647||!Number.isInteger(maxBytes)||maxBytes<1||!Number.isInteger(maxEntries)||maxEntries<1) throw new Error('Invalid artifact cache limit.');
  const entries=new Map();
  let total=0;
  const drop=id=>{const entry=entries.get(id); if(entry){clearTimeout(entry.timer);total-=entry.bytes.length;entries.delete(id);}};
  const prune=()=>{for(const [id,entry] of entries) if(entry.expiresAt<=now()) drop(id);};
  return {
    put(files) {
      prune();
      const normalized=normalizedFiles(files);
      if(normalized.reduce((sum,f)=>sum+f.bytes.length,0)>maxBytes) throw new Error('Artifact exceeds byte limit.');
      const bytes=makeZip(files);
      if(bytes.length>maxBytes) throw new Error('Artifact exceeds byte limit.');
      const id=hash(bytes);
      if(entries.has(id)) drop(id);
      while(entries.size>=maxEntries||total+bytes.length>maxBytes) drop(entries.keys().next().value);
      const expiresAt=now()+ttlMs;
      const timer=setTimeout(()=>drop(id),ttlMs);timer.unref?.();
      entries.set(id,{id,bytes,expiresAt,timer});total+=bytes.length;
      return {id,sha256:id,bytes:bytes.length,expires_at:new Date(expiresAt).toISOString()};
    },
    get(id) {prune(); return /^[a-f0-9]{64}$/.test(id??'') ? entries.get(id)??null:null;},
    stats() {return {entries:entries.size,bytes:total};},
    close() {for(const id of entries.keys())drop(id);}
  };
}

export function createKit({root=path.dirname(fileURLToPath(import.meta.url)),publicURL='https://ded.increpare.com/gui95/',catalog,contentRoot=path.join(root,'..'),artifactOptions}={}) {
  const artifacts=createArtifactStore(artifactOptions);
  const base=new URL(publicURL); base.pathname=base.pathname.replace(/\/?$/,'/');
  let iconPackFiles,iconSheetData,fullKitFiles;
  const module=name=>import(pathToFileURL(path.join(root,name)).href);
  async function read(name) {
    const resolved=await realpath(path.join(root,name));
    const boundary=await realpath(root);
    if(!resolved.startsWith(boundary+path.sep)) throw new Error('Kit file escapes root.');
    return {path:name,text:await readFile(resolved,'utf8')};
  }
  function bundle(files,metadata={}) {
    const artifact=artifacts.put(files);
    return {kit_version:KIT_VERSION,...metadata,files:describeFiles(files),artifact:{...artifact,url:new URL('artifacts/'+artifact.id+'.zip',base).href},delivery:'Download and verify the ZIP SHA-256. File text is inline only for small complete bundles; no source is truncated.'};
  }
  async function shared(files) {
    const existing=new Set(files.map(f=>f.path));
    for(const name of ['components/gui95.mjs','components/gui95.css','components/README.md']) if(!existing.has(name)) files.push(await read(name));
    if(!existing.has('LICENSE')) files.push({path:'LICENSE',text:await readFile(new URL('../LICENSE',import.meta.url),'utf8')});
    if(!existing.has('gui95-consumer.json')) files.push({path:'gui95-consumer.json',text:JSON.stringify({schema_version:1,components:Object.fromEntries(COMPONENTS.map(id=>[id,KIT_VERSION]))},null,2)+'\n'});
    return files;
  }
  const inventory=()=>({kit_version:KIT_VERSION,components:COMPONENTS.map(id=>({id,version:KIT_VERSION})),layouts:['properties','preferences','inspector','editor'],starters:['utility','editor','browser'],icons:{count:105,license:'CC0-1.0',sizes:[16,32],states:['normal','selected','disabled'],formats:['svg','png']},verification:{runner:'kit/verify/runner.mjs',execution:'local',scales:[1,1.25,1.5,2],native_host_checks:'Run separately in each intended OS/Electron host.'},consumer_manifest:{schema_version:1,components:{menu:KIT_VERSION,dialog:KIT_VERSION}},download_url:new URL('kit.zip',base).href,gallery_url:new URL('kit/components/gallery.html',base).href,icon_preview_url:new URL('icons',base).href});
  function enrich(record) {
    if(!record||!catalog) return record;
    return {...record,local_refs:record.local_refs?.map(ref=>{
      const start=Array.isArray(ref.lines)?ref.lines[0]:ref.start_line??1;
      const end=Array.isArray(ref.lines)?ref.lines[1]??start:ref.end_line??start+19;
      try {const file=catalog.read(ref.path,start,Math.min(200,Math.max(1,end-start+1)));return {...ref,sha256:file.sha256,start_line:file.start_line,end_line:file.end_line,url:new URL('reference?path='+encodeURIComponent(ref.path)+'&sha256='+file.sha256,base).href};}
      catch{return {...ref,verification:'unavailable in this content snapshot'};}
    })};
  }
  return {
    root,artifacts,inventory,bundle,
    async component(id) {
      if(!COMPONENTS.includes(id)) throw new Error('Unknown component.');
      const files=await shared([]);
      for(const name of ['components/gallery.html','test/components.test.mjs','test/components-runner.test.mjs','verify/runner.mjs','verify/README.md','package.json','package-lock.json']) files.push(await read(name));
      return bundle(files,{component:id,version:KIT_VERSION,usage:'Scope the interface with .gui95 and call enhance(root). The shared runtime contains all six components; see components/README.md for the selected API. Install pinned test dependencies with npm ci, install Chromium with npx playwright install chromium, and run npm run test:components. A working gallery and verifier are included.'});
    },
    async icons(options={}) {
      const icons=await module('icons/catalog.mjs');
      if(!options.name) return {kit_version:KIT_VERSION,icons:icons.listIcons({query:options.query??'',limit:options.limit??20})};
      const icon=icons.getIcon(options);
      const extension=options.format??'svg';
      const file={path:'icons/'+options.name+'-'+(options.size??16)+'-'+(options.state??'normal')+(options.document?'-document':'')+'.'+extension,...(Buffer.isBuffer(icon.data)?{data:icon.data}:{text:icon.data})};
      const {data,...metadata}=icon;
      return bundle([file,{path:'CC0.txt',text:await readFile(path.join(root,'icons/CC0.txt'),'utf8')}],{icon:metadata,...(extension==='svg'?{svg:icon.data}:{})});
    },
    async iconSheet() {return iconSheetData??=(await module('icons/pack.mjs')).getContactSheet();},
    async iconFile(options) {return (await module('icons/catalog.mjs')).getIcon(options);},
    async iconPack() {
      if(!iconPackFiles) {
        const source=await module('icons/catalog.mjs');
        const icons=source.listIcons({limit:500});
        const files=[];
        for(const icon of icons) for(const size of [16,32]) for(const state of ['normal','selected','disabled']) for(const format of ['svg','png']) {
          const exported=source.getIcon({name:icon.name,size,state,format});
          files.push({path:`icons/assets/${icon.name}/${size}-${state}.${format}`,...(Buffer.isBuffer(exported.data)?{data:exported.data}:{text:exported.data})});
        }
        files.push({path:'icons/manifest.json',text:JSON.stringify({version:KIT_VERSION,license:'CC0-1.0',icons,files:describeFiles(files,{inlineLimit:0})},null,2)+'\n'});
        const contact=iconSheetData??=(await module('icons/pack.mjs')).getContactSheet();
        files.push({path:'icons/contact-sheet.svg',text:contact.svg},{path:'icons/contact-sheet.png',data:contact.png},{path:'icons/index.html',text:contact.html});
        files.push({path:'icons/CC0.txt',text:await readFile(path.join(root,'icons/CC0.txt'),'utf8')});
        iconPackFiles=files;
      }
      return bundle(iconPackFiles,{type:'icon-pack',license:'CC0-1.0'});
    },
    async layout(spec) {const generated=(await module('generators/layout.mjs')).generateLayout(spec);return bundle(await shared([...generated.files]),{type:'layout',layout:spec.type,warnings:generated.warnings??[]});},
    async starter(spec) {const generated=(await module('generators/starters.mjs')).generateStarter(spec);return bundle(await shared([...generated.files]),{type:'starter',template:spec.template,warnings:generated.warnings??[]});},
    async evidence(options={}) {const source=await module('evidence/catalog.mjs');if(options.id) return {evidence:enrich(source.getEvidence(options.id))};const result=source.listEvidence(options);return {...result,items:result.items.map(enrich)};},
    async repairs(options={}) {return (await module('evidence/catalog.mjs')).findRepairs(options);},
    async updates(manifest) {return (await module('evidence/catalog.mjs')).checkUpdates(manifest);},
    async fullKit() {
      if(fullKitFiles) return bundle(fullKitFiles,{type:'full-kit'});
      const files=[];
      async function walk(directory,prefix) {
        for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
          if(entry.name.startsWith('.')||['node_modules','artifacts','test-results','playwright-report'].includes(entry.name)) continue;
          const relative=prefix+'/'+entry.name,absolute=path.join(directory,entry.name);
          if(entry.isDirectory()) await walk(absolute,relative);
          else if(entry.isFile()) files.push({path:relative,data:await readFile(absolute)});
        }
      }
      await walk(root,'kit');
      if(catalog) {
        // Keep downloads aligned with the same public inventory as reference tools.
        for(const [name,file] of catalog.files) files.push({path:name,data:file.bytes});
        fullKitFiles=files;
        return bundle(files,{type:'full-kit'});
      }
      for(const name of ['gui95-app.mjs','gui95-icons.mjs','gui95-serve.mjs','gui95-distro.mjs']) files.push({path:'tools/'+name,text:await readFile(path.join(root,'../tools',name),'utf8')});
      for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md']) files.push({path:name,text:await readFile(path.join(root,'..',name),'utf8')});
      const repository=contentRoot;
      const snapshot=JSON.parse(await readFile(path.join(repository,'references/snapshot-manifest.json'),'utf8'));
      for(const name of ['references/snapshot-manifest.json',...snapshot.files.map(file=>file.path)]) files.push({path:name,data:await readFile(path.join(repository,name))});
      for(const entry of await readdir(path.join(repository,'docs'),{withFileTypes:true})) if(entry.isFile()&&entry.name.endsWith('.md')) files.push({path:'docs/'+entry.name,text:await readFile(path.join(repository,'docs',entry.name),'utf8')});
      fullKitFiles=files;
      return bundle(files,{type:'full-kit'});
    },
    async publicFile(name) {
      if(!/^(?:components|generators|icons)\/[A-Za-z0-9_.\-/]+\.(?:mjs|css|html|svg|png|json)$/.test(name)||name.split('/').some(p=>p==='..'||p.startsWith('.'))) return null;
      try {const resolved=await realpath(path.join(root,name));if(!resolved.startsWith((await realpath(root))+path.sep)) return null;return {bytes:await readFile(resolved),mimeType:mime(name)};}catch{return null;}
    }
  };
}

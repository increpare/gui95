#!/usr/bin/env node
import {readFile,mkdir,mkdtemp,writeFile,rename,rm,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createKit,normalizedFiles,COMPONENTS} from './distribution.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),command=args.shift();
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const load=name=>import(pathToFileURL(path.join(root,name)).href);
const emit=value=>console.log(JSON.stringify(value,null,2));
async function componentFiles(){const files=await Promise.all(['gui95.mjs','gui95.css','README.md'].map(async name=>({path:'components/'+name,text:await readFile(path.join(root,'components',name),'utf8')})));files.push({path:'LICENSE',text:await readFile(path.join(root,'../LICENSE'),'utf8')},{path:'gui95-consumer.json',text:JSON.stringify({schema_version:1,components:Object.fromEntries(COMPONENTS.map(id=>[id,'1.0.0']))},null,2)+'\n'});return files;}
async function writeBundle(output,files) {
 if(!output||output.startsWith('--')) throw new Error('Pass a new output directory.');
 const normalized=normalizedFiles(files),destination=path.resolve(output);
 try{await lstat(destination);throw new Error('Output already exists; choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
 await mkdir(path.dirname(destination),{recursive:true});
 const stage=await mkdtemp(path.join(path.dirname(destination),'.gui95-stage-'));
 try {
  for(const file of normalized){const target=path.join(stage,file.path);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,file.bytes,{flag:'wx'});}
  // Check again immediately before rename, so an existing directory is never merged.
  try{await lstat(destination);throw new Error('Output appeared during generation; choose a new directory.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await rename(stage,destination);
 } catch(error){await rm(stage,{recursive:true,force:true});throw error;}
 emit({output:destination,files:normalized.length});
}
async function jsonFile(name){if(!name)throw new Error('Pass a JSON input file.');const bytes=await readFile(name);if(bytes.length>24000)throw new Error('JSON input exceeds 24 KB.');return JSON.parse(bytes);}
try {
 if(command==='list') emit(createKit().inventory());
 else if(command==='component') {const id=args[0];if(!COMPONENTS.includes(id))throw new Error('Unknown component.');const files=await componentFiles();for(const name of ['components/gallery.html','test/components.test.mjs','test/components-runner.test.mjs','verify/runner.mjs','verify/README.md','package.json','package-lock.json'])files.push({path:name,text:await readFile(path.join(root,name),'utf8')});await writeBundle(args[1],files);}
 else if(command==='gallery') {const files=await componentFiles();files.push({path:'components/gallery.html',text:await readFile(path.join(root,'components/gallery.html'),'utf8')});await writeBundle(args[0],files);}
 else if(command==='icons') emit((await load('icons/catalog.mjs')).listIcons({query:args[0]??'',limit:100}));
 else if(command==='icon') {const icon=(await load('icons/catalog.mjs')).getIcon({name:args[0],size:Number(option('size',16)),state:option('state','normal'),format:option('format','svg'),document:args.includes('--document')});await writeBundle(args[1],[{path:args[0]+'.'+icon.format,...(Buffer.isBuffer(icon.data)?{data:icon.data}:{text:icon.data})},{path:'CC0.txt',text:await readFile(path.join(root,'icons/CC0.txt'),'utf8')}]);}
 else if(command==='layout'||command==='starter') {
  const generated=command==='layout'?(await load('generators/layout.mjs')).generateLayout(await jsonFile(args[0])):(await load('generators/starters.mjs')).generateStarter({template:args[0],name:option('name','GUI95 Example'),id:option('id','gui95-example')});
  const files=[...generated.files];const names=new Set(files.map(file=>file.path));for(const file of await componentFiles())if(!names.has(file.path))files.push(file);
  await writeBundle(args[1],files);
 }
 else if(command==='evidence') emit((await load('evidence/catalog.mjs')).listEvidence({query:args.join(' '),limit:20}));
 else if(command==='repairs') emit((await load('evidence/catalog.mjs')).findRepairs({query:args.join(' ')}));
 else if(command==='updates') emit((await load('evidence/catalog.mjs')).checkUpdates(await jsonFile(args[0])));
 else if(command==='verify') {const report=await (await load('verify/runner.mjs')).runVerification({url:args[0],output:args[1]});emit(report);if(report.status==='failed')process.exitCode=1;}
 else throw new Error('Unknown command. Use list, component NAME OUT, gallery OUT, icons QUERY, icon NAME OUT, layout SPEC.json OUT, starter TYPE OUT --name NAME --id ID, evidence QUERY, repairs QUERY, updates MANIFEST.json, or verify URL OUT.');
} catch(error){console.error(error.message);process.exitCode=1;}

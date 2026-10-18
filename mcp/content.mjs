// One public-content inventory shared by retrieval and deployment packaging.
// Do not replace this with an unrestricted repository or filesystem crawl.
import { readFile, readdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const textTypes = new Map(Object.entries({
  '.md':'text/markdown', '.css':'text/css', '.js':'text/javascript', '.mjs':'text/javascript', '.cjs':'text/javascript',
  '.html':'text/html', '.svg':'image/svg+xml', '.json':'application/json', '.txt':'text/plain',
  '.ps1':'text/plain', '.sh':'text/plain', '.yml':'text/yaml', '.yaml':'text/yaml'
}));
const binaryTypes = new Map(Object.entries({
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf', '.ico':'image/x-icon'
}));
export const sourceURL = name => 'https://github.com/increpare/gui95/blob/master/' + name.split('/').map(encodeURIComponent).join('/');
const core = ['SKILL.md','README.md','LICENSE','THIRD-PARTY-NOTICES.md','PRIVACY.md','references/snapshot-manifest.json'];
const excluded = new Set(['node_modules','dist','out','coverage','var']);
export const safeName = name => typeof name==='string' && name.length>0 && !name.includes('\\') && !path.posix.isAbsolute(name) && !name.split('/').some(part=>part==='..'||part==='.'||part==='');

function kindFor(name, mime) {
  if (binaryTypes.has(path.posix.extname(name)) || mime==='image/svg+xml') return 'asset';
  if (/LICENSE|NOTICES|notices|(?:font|serif).*(?:readme|license)|palette-credits/i.test(name)) return 'notice';
  if (/(?:^|\/)(?:tests?|QA)(?:\/|\.)/.test(name) || name==='examples/widgets/check.mjs') return 'verification';
  if (name.startsWith('docs/')||name.endsWith('README.md')||name==='SKILL.md') return 'guide';
  if (name.startsWith('demo/dist/widgets/')&&name.endsWith('.html')&&!name.endsWith('/index.html')) return 'widget';
  if (name.startsWith('tools/')) return 'tool';
  if (name.startsWith('demo/')) return 'demo';
  return 'source';
}

export async function loadPublicContent(root) {
  const base=await realpath(root),names=new Set(core);
  const snapshot=JSON.parse(await readFile(path.join(base,'references/snapshot-manifest.json'),'utf8'));
  const snapshots=new Map(snapshot.files.map(file=>[file.path,file.sha256]));
  snapshot.files.forEach(file=>names.add(file.path));
  async function walk(relative) {
    const folder=path.join(base,relative);
    if ((await lstat(folder)).isSymbolicLink()) throw new Error('Symlink in public content: '+relative);
    for (const entry of await readdir(folder,{withFileTypes:true})) {
      if (entry.name.startsWith('.')||excluded.has(entry.name)) continue;
      const name=relative+'/'+entry.name;
      if (entry.isSymbolicLink()) throw new Error('Symlink in public content: '+name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()&&(textTypes.has(path.posix.extname(name))||binaryTypes.has(path.posix.extname(name)))) names.add(name);
    }
  }
  for (const folder of ['docs','examples','tools','demo/dist']) await walk(folder);
  for (const name of ['demo/README.md','demo/QA.md','demo/serve.mjs']) names.add(name);
  const files=new Map();
  for (const name of [...names].sort()) {
    if (!safeName(name)) throw new Error('Unsafe catalog path: '+name);
    const expected=path.resolve(base,name),resolved=await realpath(expected),relative=path.relative(base,resolved);
    if (!relative||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)||path.relative(expected,resolved)) throw new Error('Catalog file escapes its declared public path: '+name);
    const bytes=await readFile(resolved),extension=path.posix.extname(name);
    const mime_type=textTypes.get(extension)||binaryTypes.get(extension)||(name==='LICENSE'?'text/plain':null);
    if (!mime_type) throw new Error('Unsupported public content type: '+name);
    const isText=textTypes.has(extension)||name==='LICENSE';
    if (bytes.length>(isText?1024*1024:8*1024*1024)) throw new Error('Public reference exceeds size limit: '+name);
    const sha256=createHash('sha256').update(bytes).digest('hex');
    if (snapshots.has(name)&&snapshots.get(name)!==sha256) throw new Error('Snapshot hash mismatch: '+name);
    const text=isText?bytes.toString('utf8').replace(/\r\n/g,'\n'):null,lines=text?.split('\n');
    const title=(lines?.find(line=>/^# /.test(line))?.slice(2).trim())||text?.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/ — GUI95$/,'')||path.posix.basename(name);
    const font=mime_type.startsWith('font/'),recreation=/^ms_sans_serif(?:_bold)?\.woff2$/.test(path.posix.basename(name));
    files.set(name,{
      path:name,title,kind:kindFor(name,mime_type),mime_type,size_bytes:bytes.length,sha256,source_url:sourceURL(name),
      archived:snapshots.has(name),text,lines,bytes,
      notices_path:'THIRD-PARTY-NOTICES.md',
      license_note:font?(recreation?'MS Sans Serif recreation by lou: CC BY-SA 3.0. Retain the font readmes and license; see third-party notices.':'Retain this font’s specific license/readme and source notices; the root MIT grant does not automatically cover fonts.'):'Retain LICENSE and applicable third-party/source notices; see THIRD-PARTY-NOTICES.md.'
    });
  }
  return {base,files};
}

export function describe(file) {
  const {text,lines,bytes,...metadata}=file;
  return {...metadata,...(lines?{total_lines:lines.length}:{}),readable:!!lines};
}

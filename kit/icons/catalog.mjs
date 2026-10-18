import { createHash } from 'node:crypto';
import { rasterize, encodePng, documentSvg } from '../../tools/gui95-icons.mjs';
import { artwork } from './artwork.mjs';
const LICENSE='CC0-1.0';
const provenance='Original geometric artwork authored for the GUI95 build kit in 2026; no Microsoft icon artwork or archived application assets copied.';
const palette={ink:'#000000',paper:'#ffffff',gray:'#c0c0c0',accent:'#000080',yellow:'#ffff80',green:'#008000',red:'#c00000'};
const names=Object.keys(artwork).sort();
export function listIcons({query='',limit}={}) {
  if(typeof query!=='string' || query.length>200) throw new TypeError('query must be a string up to 200 characters');
  if(limit!==undefined && (!Number.isInteger(limit)||limit<0||limit>500)) throw new TypeError('limit must be an integer from 0 to 500');
  const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
  return names.filter(name=>terms.every(term=>`${name} ${artwork[name][0]}`.includes(term))).slice(0,limit).map(name=>({name,label:name.replaceAll('-',' '),category:artwork[name][0],sizes:[16,32],states:['normal','selected','disabled'],formats:['svg','png'],license:LICENSE,provenance}));
}
const cache=new Map();
export function getIcon({name,size=16,state='normal',format='svg',document=false}={}) {
  if(!Object.hasOwn(artwork,name)) throw new RangeError(`Unknown icon: ${String(name)}`);
  if(![16,32].includes(size)) throw new RangeError('size must be 16 or 32');
  if(!['normal','selected','disabled'].includes(state)) throw new RangeError('state must be normal, selected, or disabled');
  if(!['svg','png'].includes(format)) throw new RangeError('format must be svg or png');
  if(typeof document!=='boolean') throw new TypeError('document must be boolean');
  const key=[name,size,state,format,document].join(':');
  if(!cache.has(key)) {
    const [,small,detail]=artwork[name];
    const colors=state==='selected'?{...palette,ink:'#ffffff',paper:'#000080',gray:'#8080c0',accent:'#000080'}:palette;
    const paint=(source)=>source.replace(/\{(\w+)\}/g,(_,color)=>colors[color]);
    let body=size===16?paint(small):`<g transform="scale(2)">${paint(small)}</g><g stroke="#ffffff" stroke-width="1">${paint(detail)}</g>`;
    if(state==='disabled') {
      const gray=body.replace(/#[0-9a-f]{6}/gi,'#808080').replaceAll('fill="#808080"','fill="#c0c0c0"');
      const shadow=gray.replace(/#[0-9a-f]{6}/gi,'#ffffff');
      body=`<g transform="translate(1 1)" stroke="#ffffff">${shadow}</g>${gray}`;
    }
    let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" stroke="${state==='disabled'?'#808080':colors.ink}" stroke-width="1" stroke-linejoin="miter">${body}</svg>`;
    if(document) svg=documentSvg(svg).replace('<svg ',`<svg width="${size}" height="${size}" `);
    const data=format==='svg'?svg:encodePng(rasterize(svg,size,{style:'pixel'}));
    cache.set(key,{name,size,state,format,document,mimeType:format==='svg'?'image/svg+xml':'image/png',license:LICENSE,provenance,sha256:createHash('sha256').update(data).digest('hex'),data});
  }
  const result=cache.get(key);
  return {...result,data:Buffer.isBuffer(result.data)?Buffer.from(result.data):result.data};
}

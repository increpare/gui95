import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {listIcons,getIcon} from './catalog.mjs';
import {rasterize,encodePng} from '../../tools/gui95-icons.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const font={A:'010101111101101',B:'110101110101110',C:'011100100100011',D:'110101101101110',E:'111100110100111',F:'111100110100100',G:'011100101101011',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',M:'101111111101101',N:'101111111111101',O:'010101101101010',P:'110101110100100',Q:'010101101111011',R:'110101110101101',S:'011100010001110',T:'111010010010010',U:'101101101101111',V:'101101101101010',W:'101101111111101',X:'101101010101101',Y:'101101010010010',Z:'111001010100111','-':'000000111000000',' ':'000000000000000'};
export function getContactSheet(){
  const icons=listIcons();const columns=8,cellW=144,cellH=92,width=columns*cellW,height=Math.ceil(icons.length/columns)*cellH;
  const data=new Uint8Array(width*height*4);data.fill(255);
  const pixel=(x,y,color)=>data.set(color,(y*width+x)*4);
  const rectangle=(x,y,w,h,color)=>{for(let py=y;py<y+h;py++)for(let px=x;px<x+w;px++)pixel(px,py,color);};
  const svgParts=[];
  for(const [index,icon] of icons.entries()){
    const x=index%columns*cellW,y=Math.floor(index/columns)*cellH;
    rectangle(x+1,y+1,cellW-2,cellH-2,[192,192,192,255]);
    for(const [state,column] of [['normal',0],['selected',1],['disabled',2]]){
      const bg=state==='selected'?'#000080':'#c0c0c0';
      rectangle(x+6+column*44,y+5,40,64,state==='selected'?[0,0,128,255]:[192,192,192,255]);
      svgParts.push(`<rect x="${x+6+column*44}" y="${y+5}" width="40" height="64" fill="${bg}"/>`);
      for(const [size,offsetX,offsetY] of [[32,10,7],[16,18,45]]){
        const svg=getIcon({name:icon.name,size,state}).data;
        const image=rasterize(svg,size,{style:'pixel'});
        const ox=x+offsetX+column*44,oy=y+offsetY;
        for(let py=0;py<size;py++)for(let px=0;px<size;px++){
          const i=(py*size+px)*4;if(!image.data[i+3])continue;
          const alpha=image.data[i+3]/255;const out=((oy+py)*width+ox+px)*4;
          for(let channel=0;channel<3;channel++)data[out+channel]=Math.round(image.data[i+channel]*alpha+data[out+channel]*(1-alpha));
        }
        svgParts.push(svg.replace('<svg ',`<svg x="${ox}" y="${oy}" `));
      }
    }
    const label=icon.name.toUpperCase();
    for(const [letterIndex,letter] of [...label].entries()){
      const glyph=font[letter]??font[' '];for(let py=0;py<5;py++)for(let px=0;px<3;px++)if(glyph[py*3+px]==='1')pixel(x+6+letterIndex*4+px,y+76+py,[0,0,0,255]);
    }
    svgParts.push(`<text x="${x+6}" y="${y+82}" font-family="monospace" font-size="10" fill="#000000">${icon.name}</text>`);
  }
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#c0c0c0"/>${svgParts.join('')}</svg>`;
  const png=encodePng({width,height,data});
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>GUI95 original icon contact sheet</title><style>body{font:14px sans-serif;background:#c0c0c0}img{max-width:100%;image-rendering:pixelated}li{display:inline-block;margin:4px}</style><h1>GUI95 original geometric icons</h1><p>${icons.length} original CC0 symbols. Each cell shows normal, selected and disabled, at 32 and 16 px. Selected artwork is shown on navy.</p><img src="contact-sheet.png" width="${width}" height="${height}" alt="All ${icons.length} original icons and variants"><p><a href="CC0.txt">CC0 dedication</a> · <a href="manifest.json">Per-icon provenance and hashes</a></p><ul>${icons.map(icon=>`<li><a href="assets/${icon.name}/16-normal.svg">${icon.name}</a></li>`).join('')}</ul></html>`;
  return {svg,png,html,width,height};
}
export async function buildIconPack(directory){
  if(typeof directory!=='string'||!directory)throw new TypeError('directory must be a filesystem path');
  const entries=[];
  const write=async(relative,data)=>{const target=path.join(directory,relative);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,data);entries.push({path:relative,bytes:Buffer.byteLength(data),sha256:hash(data)});};
  for(const icon of listIcons())for(const size of [16,32])for(const state of ['normal','selected','disabled'])for(const format of ['svg','png']){
    const asset=getIcon({name:icon.name,size,state,format});await write(`assets/${icon.name}/${size}-${state}.${format}`,asset.data);
  }
  const contact=getContactSheet();
  await write('contact-sheet.svg',contact.svg);await write('contact-sheet.png',contact.png);await write('index.html',contact.html);
  await write('CC0.txt',await readFile(new URL('./CC0.txt',import.meta.url),'utf8'));
  const manifest={version:1,license:'CC0-1.0',icons:listIcons(),files:[...entries]};
  await write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  await write('SHA256SUMS',entries.map(entry=>`${entry.sha256}  ${entry.path}`).join('\n')+'\n');
  return {directory,icons:listIcons().length,files:entries};
}

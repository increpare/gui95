import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { listIcons, getIcon } from '../icons/catalog.mjs';
import { rasterize } from '../../tools/gui95-icons.mjs';

test('catalog exposes at least eighty independently drawn semantic assets with provenance', () => {
  const icons = listIcons();
  assert.ok(icons.length >= 80);
  assert.equal(new Set(icons.map(x => x.name)).size, icons.length);
  assert.ok(icons.every(x => x.license === 'CC0-1.0' && x.provenance.includes('Original')));
  assert.ok(listIcons({query:'save'}).some(x => x.name === 'save'));
  assert.equal(listIcons({limit:3}).length,3);
  assert.throws(() => listIcons({limit:-1}), /limit/);
});

test('all SVG masters and states rasterize, are distinct, and PNG dimensions are correct', () => {
  const normal = new Set();
  for (const item of listIcons()) {
    for (const size of [16,32]) for (const state of ['normal','selected','disabled']) {
      const icon = getIcon({name:item.name,size,state});
      assert.equal(typeof icon.data,'string');
      assert.equal(icon.sha256,createHash('sha256').update(icon.data).digest('hex'));
      const rgba = rasterize(icon.data,size,{style:'pixel'});
      assert.ok(rgba.data.some((x,i) => i % 4 === 3 && x > 0), item.name);
      if(size===16 && state==='normal') normal.add(icon.sha256);
    }
    const png = getIcon({name:item.name,size:32,format:'png'});
    assert.ok(Buffer.isBuffer(png.data));
    assert.equal(png.data.readUInt32BE(16),32);
    assert.equal(png.data.readUInt32BE(20),32);
    const doc = getIcon({name:item.name,document:true});
    assert.notEqual(doc.data,getIcon({name:item.name}).data);
    rasterize(doc.data,16,{style:'pixel'});
  }
  assert.equal(normal.size,listIcons().length,'every icon is visually authored separately');
});

test('catalog rejects unsupported names, sizes, states, and formats', () => {
  for(const options of [{name:'missing'},{name:'save',size:24},{name:'save',state:'pressed'},{name:'save',format:'exe'}]) assert.throws(()=>getIcon(options));
});

test('contact sheet contains each state and semantic label in a real PNG',async()=>{
  const {getContactSheet}=await import('../icons/pack.mjs');
  const sheet=getContactSheet();
  assert.equal(sheet.png.readUInt32BE(16),sheet.width);
  assert.equal(sheet.png.readUInt32BE(20),sheet.height);
  for(const icon of listIcons())assert.ok(sheet.svg.includes('>'+icon.name+'</text>'));
  assert.match(sheet.html,/CC0 dedication/);
});

test('selected and disabled filled icons retain semantic interior contrast',()=>{
  const colors=(name,state)=>{const image=rasterize(getIcon({name,state}).data,16,{style:'pixel'});const colors=new Set();for(let i=0;i<image.data.length;i+=4)if(image.data[i+3])colors.add(Buffer.from(image.data.subarray(i,i+3)).toString('hex'));return colors;};
  for(const name of ['save','help','information']){
    const selected=colors(name,'selected');assert.ok(selected.has('000080')&&selected.has('ffffff'),name+' selected glyph and negative space');
    const disabled=colors(name,'disabled');assert.ok(disabled.has('c0c0c0')&&disabled.has('808080'),name+' disabled foreground and interior');
  }
});

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {atomicWriteText}=require('../files.cjs');
test('native saves preserve private overwrite permissions and create private new documents',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'gui95-save-permissions-'));
  try{
    const existing=path.join(directory,'private.txt');await fs.writeFile(existing,'before',{mode:0o600});await atomicWriteText(existing,'after');
    assert.equal(await fs.readFile(existing,'utf8'),'after');
    if(process.platform!=='win32')assert.equal((await fs.stat(existing)).mode&0o777,0o600);
    const fresh=path.join(directory,'new.txt');await atomicWriteText(fresh,'new');
    if(process.platform!=='win32')assert.equal((await fs.stat(fresh)).mode&0o777,0o600);
    assert.deepEqual((await fs.readdir(directory)).sort(),['new.txt','private.txt']);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

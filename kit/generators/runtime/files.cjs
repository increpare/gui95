const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
async function atomicWriteText(file,text){
  let mode=0o600;
  try{mode=(await fs.stat(file)).mode&0o777;}catch(error){if(error.code!=='ENOENT')throw error;}
  const temporary=path.join(path.dirname(file),'.gui95-'+randomUUID()+'.tmp');
  try{await fs.writeFile(temporary,text,{encoding:'utf8',flag:'wx',mode});if(process.platform!=='win32')await fs.chmod(temporary,mode);await fs.rename(temporary,file);}finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
}
module.exports={atomicWriteText};

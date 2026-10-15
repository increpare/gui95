import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('./dist/',import.meta.url));
const port=Number(process.env.PORT||1995);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
    const relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end('Forbidden');return;}
    if(!(await stat(target)).isFile())throw Error('Not a file');
    res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(await readFile(target));
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1',()=>process.stdout.write(`Local: http://127.0.0.1:${port}\n`));

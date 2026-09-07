// Local integration preview, with temporary in-memory rooms. No cloud access.
// Run npm run build first. Binds only to loopback; NEVER used by Vercel.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { makeHandler } from '../server/handler.js';
import { memoryStore } from '../server/memory-store.js';
const root=path.resolve('dist');
const handler=makeHandler({store:memoryStore(),secret:'local-preview-only'});
const headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
http.createServer(async(req,res)=>{
  for(const {key,value} of headers)res.setHeader(key,value);
  const url=new URL(req.url,'http://127.0.0.1:4173');
  if(url.pathname==='/api/rooms') {
    let raw='';
    for await(const chunk of req) {raw+=chunk;if(raw.length>32768){res.writeHead(413);res.end();return;}}
    req.body=raw || undefined;req.query=Object.fromEntries(url.searchParams);
    res.status=n=>{res.statusCode=n;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
    await handler(req,res);return;
  }
  try {
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep))throw new Error('path');
    const body=await readFile(file);
    res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');
    res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(4173,'127.0.0.1',()=>process.stdout.write('Local multiplayer test: http://127.0.0.1:4173 (temporary data)\n'));

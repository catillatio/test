// Disposable TLS object-store fixture. Never copied into a production image.
// Tests register exact SDK-generated SigV4 URLs; unsigned grants, wrong methods,
// overwritten objects, bad hostnames and untrusted certificates are rejected.
import https from 'node:https';
import {readFileSync,writeFileSync,existsSync,mkdirSync,renameSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root='/fixture';mkdirSync(root+'/objects',{recursive:true});
const canonical=value=>{const url=new URL(value);url.searchParams.sort();return url.href;};
https.createServer({key:readFileSync(root+'/server.key'),cert:readFileSync(root+'/server.crt')},(request,response)=>{
 const url=canonical('https://recovery.test:8443'+request.url);
 const grant=JSON.parse(readFileSync(root+'/grants.json','utf8')).find(grant=>canonical(grant.url)===url&&grant.method===request.method);
 if(!grant){response.writeHead(403);response.end();return;}
 const file=root+'/objects/'+createHash('sha256').update(grant.key).digest('hex');
 if(request.method==='GET'){
  if(!existsSync(file)){response.writeHead(404);response.end();return;}
  let data=readFileSync(file);const corrupt=JSON.parse(readFileSync(root+'/corrupt.json','utf8'));
  if(corrupt.includes(grant.key)){data=Buffer.from(data);data[0]^=255;}
  response.writeHead(200,{'content-length':data.length});response.end(data);return;
 }
 const ignore=JSON.parse(readFileSync(root+'/ignore-conditional.json','utf8')).includes(grant.key);
 if(request.headers['if-none-match']!=='*'||existsSync(file)&&!ignore){response.writeHead(412);response.end();return;}
 let reservation;try{reservation=openSync(file+'.lock','wx');}catch{response.writeHead(409);response.end();return;}
 const chunks=[];let length=0;
 request.on('data',chunk=>{length+=chunk.length;if(length>10000000)request.destroy();else chunks.push(chunk);});
 request.on('end',()=>{
  writeFileSync(file+'.pending',Buffer.concat(chunks),{mode:0o600,flag:'wx'});renameSync(file+'.pending',file);closeSync(reservation);unlinkSync(file+'.lock');response.writeHead(200);response.end();
 });
}).listen(8443,'0.0.0.0');

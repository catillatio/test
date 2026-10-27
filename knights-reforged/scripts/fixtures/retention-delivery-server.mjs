// Disposable pinned-provider-contract/TLS fixture. NEVER in a production bundle.
import https from 'node:https';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const base='/fixture',read=n=>JSON.parse(readFileSync(base+'/'+n,'utf8'));
const canonical=v=>{const u=new URL(v);u.searchParams.sort();return u.href;};
https.createServer({key:readFileSync(base+'/server.key'),cert:readFileSync(base+'/server.crt')},async(req,res)=>{
 try{
  const host=req.headers.host,url='https://'+host+req.url,control=read('control.json');
  if(host==='api.github.com'){
   const path=new URL(url).pathname;
   if(path.endsWith('/approvals'))return send(control.reviewComment?[{state:'approved',comment:control.reviewComment,user:{login:'catillatio'},environments:[{name:'retention-signing'}]}]:[]);
   if(path.endsWith('/jobs'))return send({total_count:3,jobs:[{name:'owner-approval',status:'completed',conclusion:'success',run_attempt:1},{name:control.wrongJob?'release':'retire',status:control.status,run_attempt:1},{name:'sign-retirement',status:'in_progress',run_attempt:1}]});
   if(path.endsWith('/runs'))return send({total_count:0,workflow_runs:[]});
   const run=path.match(/\/runs\/([0-9]+)\/attempts\/1$/);if(run){
    const current=String(control.runId)===run[1];
    if(!current&&control.pauseBeforeDrop){writeFileSync(base+'/before-drop-reached','1');while(read('control.json').pauseBeforeDrop)await new Promise(r=>setTimeout(r,50));}
    return send({id:Number(run[1]),run_attempt:1,status:current?control.status:'completed',path:current?'.github/workflows/recovery-copy-retention.yml':'.github/workflows/production-release.yml',event:'workflow_dispatch',head_branch:current&&control.wrongBranch?'feature/untrusted':'release/production',head_repository:{full_name:'catillatio/test'},head_sha:current?control.sha:'a'.repeat(40)});
   }
   return fail(404);
  }
  if(host==='realm.fixture.invalid')return send({status:'ready',release:'phase4.7',commit:'f'.repeat(40)});
  if(host==='backboard.railway.com'){
   const q=JSON.parse(await body()),state=read('provider.json');
   if(q.query.includes('RetentionDeliveryPreflight'))return send({data:state.preflight});
   if(q.query.includes('RetentionDeliveryNetwork'))return send({data:{tcpProxies:[]}});
   if(q.query.includes('RetentionDeliveryStage')){
    if(!q.query.includes('skipDeploys:true')||Object.keys(q.variables.variables).join()!=='KINGDOM_RETENTION_JOB')return fail(400);
    const vars=read('variables.json');Object.assign(vars[q.variables.serviceId],q.variables.variables);atomic('variables.json',vars);return send({data:{variableCollectionUpsert:true}});
   }
   if(q.query.includes('RetentionDeliveryVariables'))return send({data:{variables:read('variables.json')[q.variables.serviceId]}});
   if(q.query.includes('RetentionDeliveryStop('))return send({data:{deploymentRemove:true}});
   if(q.query.includes('DeploymentIdentity')||q.query.includes('WorkerCompletion')||q.query.includes('StopIdentity'))return send({data:{deployment:state.deployments[q.variables.id]}});
   return fail(400);
  }
  if(host!=='objects.fixture.invalid')return fail(403);
  const grants=read('grants.json'),grant=grants.find(g=>canonical(g.url)===canonical(url)&&g.method===req.method);if(!grant)return fail(403);
  const file=base+'/objects/'+createHash('sha256').update(grant.key).digest('hex');
  if(req.method==='GET'){if(!existsSync(file))return fail(404);const b=readFileSync(file);res.writeHead(200,{'content-length':b.length});res.end(b);return;}
  if(req.method!=='PUT'||req.headers['if-none-match']!=='*')return fail(403);
  if(existsSync(file))return fail(412);const b=await body();writeFileSync(file,b,{mode:0o600,flag:'wx'});
  if(control.loseExecutorAck&&grant.key.endsWith('executor-result.json')){req.socket.destroy();return;}
  res.writeHead(200);res.end();
  function send(value){const b=JSON.stringify(value);res.writeHead(200,{'content-type':'application/json'});res.end(b);}
  function fail(n){res.writeHead(n);res.end();}
  function body(){return new Promise((resolve,reject)=>{let n=0;const b=[];req.on('data',c=>{n+=c.length;if(n>2000000){req.destroy();reject(Error('bounded'));}else b.push(c);});req.on('end',()=>resolve(Buffer.concat(b)));req.on('error',reject);});}
  function atomic(n,v){writeFileSync(base+'/'+n+'.next',JSON.stringify(v),{mode:0o600});renameSync(base+'/'+n+'.next',base+'/'+n);}
 }catch{if(!res.headersSent)res.writeHead(500);res.end();}
}).listen(443,'0.0.0.0');

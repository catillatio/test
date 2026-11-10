// Local container test only. Not bundled in the operator image or controller.
// Never contacts Railway. Production worker has no endpoint/test-mode override.
import {safeService} from '/fixture-data.mjs';
globalThis.fetch=async(url,options)=>{
 if(url!=='https://backboard.railway.com/graphql/v2'||process.env.FIXTURE_METADATA_FAIL==='1')throw new Error('Synthetic metadata denial');
 const query=JSON.parse(options.body).query;
 return {ok:true,json:async()=>({data:query.includes('OperatorPosture')?(process.env.FIXTURE_UNSAFE_POSTURE==='1'?{...safeService(process.env.RAILWAY_PROJECT_ID,process.env.RAILWAY_ENVIRONMENT_ID,process.env.RAILWAY_SERVICE_ID),tcpProxies:[{id:'synthetic'}]}:safeService(process.env.RAILWAY_PROJECT_ID,process.env.RAILWAY_ENVIRONMENT_ID,process.env.RAILWAY_SERVICE_ID)):query.includes('OperatorToken')?{projectToken:{projectId:process.env.RAILWAY_PROJECT_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID}}:
  {deployment:{id:process.env.RAILWAY_DEPLOYMENT_ID,projectId:process.env.RAILWAY_PROJECT_ID,environmentId:process.env.RAILWAY_ENVIRONMENT_ID,serviceId:process.env.RAILWAY_SERVICE_ID}}})};
};
await import('/app/deployment/operator/worker.mjs');

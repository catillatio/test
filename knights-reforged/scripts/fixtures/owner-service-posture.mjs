// Synthetic Railway metadata only; never included in a production bundle.
export function safeService(projectId,environmentId,serviceId){return {
 service:{id:serviceId,projectId,deletedAt:null,repoTriggers:{edges:[]}},
 serviceInstance:{serviceId,environmentId,builder:'DOCKERFILE',dockerfilePath:null,rootDirectory:null,railwayConfigFile:null,buildCommand:null,startCommand:null,preDeployCommand:null,restartPolicyType:'NEVER',restartPolicyMaxRetries:0,numReplicas:1,cronSchedule:null,healthcheckPath:null,sleepApplication:false,source:null,domains:{customDomains:[],serviceDomains:[]}},tcpProxies:[]
};}

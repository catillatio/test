// Owner-run pre-enablement inspection only; no job, registration, or cleanup.
import {parseArgs} from 'node:util';
import {preflightRegistrar} from './observation.mjs';
try{
 process.umask(0o077);
 const {values}=parseArgs({options:{'expected-host':{type:'string'}}});
 await preflightRegistrar(process.env,{expectedHost:values['expected-host']});
 console.log('REGISTRAR_PREFLIGHT: PASS');
 // No direct pg_control_system privilege is required. Do not broaden access.
 // Actual cluster equality remains enforced inside the installed guarded writer
 // against the genuinely verified report, never through a synthetic write probe.
 console.log('REGISTRAR_CLUSTER_CHECK: DEFERRED_TO_VERIFIED_WRITE');
}catch{console.error('REGISTRAR_PREFLIGHT: FAIL');process.exitCode=1;}

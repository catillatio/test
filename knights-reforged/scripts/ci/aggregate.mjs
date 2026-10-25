import {aggregate} from './plan.mjs';
let ok=false;
try {ok=aggregate(JSON.parse(process.env.CI_NEEDS));}catch{}
console.log('REQUIRED_CHECKS: '+(ok?'PASS':'FAIL'));
if(!ok)process.exitCode=1;

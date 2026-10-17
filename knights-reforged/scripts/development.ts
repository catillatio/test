import {loadConfig} from '../src/config.js';
import {createDatabase} from '../src/db.js';
import {assertInstalledRulesets} from '../src/migrate.js';
import {requireDevelopment,provisionBots,provisionDevelopmentAccount} from '../src/development.js';
import {authenticate} from '../src/auth.js';
import {getState} from '../src/game.js';

async function hiddenPassword():Promise<string>{
  if(process.env.KINGDOM_DEV_PASSWORD){const password=process.env.KINGDOM_DEV_PASSWORD;delete process.env.KINGDOM_DEV_PASSWORD;return password;}
  if(!process.stdin.isTTY)throw new Error('Use the hidden interactive password prompt or a KINGDOM_DEV_PASSWORD secret.');
  process.stdout.write('Development account password (hidden): ');
  const wasRaw=process.stdin.isRaw;process.stdin.setRawMode(true);process.stdin.resume();
  try{return await new Promise<string>((resolve,reject)=>{
    let password='';
    const done=(error?:Error)=>{process.stdin.off('data',data);error?reject(error):resolve(password);};
    const data=(chunk:Buffer)=>{for(const char of chunk.toString()){
      if(char==='\r'||char==='\n'){done();return;}
      if(char==='\u0003'){done(new Error('Provisioning canceled.'));return;}
      if(char==='\u007f'||char==='\b')password=password.slice(0,-1);else password+=char;
      if(password.length>128){done(new Error('Password exceeds the account limit.'));return;}
    }};process.stdin.on('data',data);
  });}finally{process.stdin.setRawMode(!!wasRaw);process.stdin.pause();process.stdout.write('\n');}
}
const permission={nodeEnv:process.env.NODE_ENV??'',allowProvisioning:process.env.ALLOW_DEV_PROVISIONING==='1'};
requireDevelopment(permission); // Before opening a DB or reading the credential.
const action=process.argv[2];
if(!['bots','account'].includes(action??''))throw new Error('Choose bots or account.');
const password=action==='account'?await hiddenPassword():'';
const config=loadConfig(),db=createDatabase(config.databaseUrl);
try{
  await assertInstalledRulesets(db);
  if(!(await db.query("SELECT 1 FROM schema_migrations WHERE name='014_economy_and_progression.sql'")).rows.length)throw new Error('Run npm run db:migrate before development provisioning.');
  let result;
  if(action==='bots')result=await provisionBots(db,permission,process.argv.includes('--disable'));
  else{
    const account=await provisionDevelopmentAccount(db,permission,password,process.argv.includes('--reset'));
    await authenticate(db,'dev',password);
    const state=await getState(db,account.accountId);
    result={...account,gold:state.gold,army:state.army.participants,level:state.level};
  }
  console.log(JSON.stringify({action,...result}));
}catch(error){console.error(error instanceof Error?error.message:'Development provisioning failed.');process.exitCode=1;}
finally{await db.end();}

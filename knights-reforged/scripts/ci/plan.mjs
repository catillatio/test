import {readdirSync, readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const manifest = JSON.parse(readFileSync(new URL('./test-manifest.json', import.meta.url)));
const artUnits = new Set(['coordinated-artwork','coordinated-final-artwork','coordinated-public-verification','regional-artwork','level100-beta-art','level100-launch-art','phase51b-art','fantasy-catalog','equipment-presentation']);
const uiUnits = new Set([...artUnits,'land-client','phase48-market-client','phase48-preferences-client','realm-client','status-client','request-origin','audio-assets']);
const uiDatabase = new Set(['rendering','phase51a-interface','phase51c-interface','phase51c-attention','phase51d-social','codespaces-origin','phase44-security','phase48-economy','equipment-presentation','phase491-reports']);
const artBrowser = new Set(['coordinated-art-browser','regional-art-browser','equipment-presentation-browser','phase51b-browser','level100-beta-browser']);
const uiBrowser = new Set([...artBrowser,'phase48-market-client','phase48-preferences-client','phase51a-browser','phase51c-browser','phase51d-browser','browser-phase47-test']);
// Reviewed non-executable public provenance read by asset tests, never catalog,
// policy, startup authorization or artwork-selection inputs. New registries and
// unknown metadata remain full until their dependencies are explicitly reviewed.
const artMetadata = new Set(['alpha','equipment-51b-current-1','fantasy-0.2','land-review','land-simple-0.1','level100-beta-1','properties-49','properties-51b-fullbleed-2','regional-weapon-land-1','regional-weapon-land-2','regional-weapon-land-3','remaster-ui'].map(p=>'knights-reforged/public/art/'+p+'/provenance.json'));
const name = file => file.split('/').at(-1).replace(/\.test\.(ts|mjs)$|\.ts$/g, '');

// Explicit inventory: a new test must be reviewed, never silently omitted.
export function validateManifest(entries = manifest.tests, actual = readdirSync(root+'tests').filter(f=>/\.test\.(ts|mjs)$/.test(f)).map(f=>'tests/'+f)) {
  const files = entries.map(e=>e.file);
  if (new Set(files).size !== files.length || entries.some(e=>!['unit','database','browser'].includes(e.lane) || !Number.isInteger(e.weight) || e.weight<1 || (e.exclusive!==undefined&&typeof e.exclusive!=='boolean') || (e.script!==undefined&&(e.script!==true||e.file!=='scripts/browser-phase47-test.ts')) || !/^(tests\/[a-z0-9-]+\.test\.(ts|mjs)|scripts\/browser-phase47-test\.ts)$/.test(e.file))) throw Error('Invalid CI inventory');
  if (JSON.stringify(files.filter(f=>f.startsWith('tests/')).sort()) !== JSON.stringify([...actual].sort()) || !files.includes('scripts/browser-phase47-test.ts')) throw Error('Unreviewed or missing test file');
}
export function selected(profile, entries = manifest.tests) {
  if (!['art','ui','gameplay','full'].includes(profile)) throw Error('Unknown test profile');
  return entries.filter(e=> profile==='full' || profile==='gameplay' || (e.lane==='unit' ? (profile==='art'?artUnits:uiUnits).has(name(e.file)) : e.lane==='database' ? (profile==='art'?e.file==='tests/equipment-presentation.test.ts':uiDatabase.has(name(e.file))) : (profile==='art'?artBrowser:uiBrowser).has(name(e.file))));
}
export function shard(entries, index, count) {
  if (!Number.isInteger(index)||!Number.isInteger(count)||count<1||count>8||index<1||index>count) throw Error('Invalid shard');
  const buckets=Array.from({length:count},()=>({weight:0,tests:[]}));
  for(const e of [...entries].sort((a,b)=>b.weight-a.weight||a.file.localeCompare(b.file,'en'))) {
    const bucket=buckets.reduce((a,b)=>b.weight<a.weight?b:a); bucket.tests.push(e);bucket.weight+=e.weight;
  }
  return buckets[index-1].tests;
}

// Rulesets, renderer code, all client JS, executables, renames and unknown files
// deliberately require broader validation. An extension alone is not authority.
export function classify(changes, {production=false}={}) {
  if(production || !changes.length) return 'full';
  const types=changes.map(c=> {
    if(!['A','M'].includes(c.status)||!['100644'].includes(c.mode)) return 'full';
    const p=c.path;
    if(/^knights-reforged\/public\/art\/[a-zA-Z0-9_./-]+\.(webp|png|jpg|jpeg)$/.test(p) && !p.split('/').includes('..')) return 'art';
    if(artMetadata.has(p)) return 'art';
    if(/^knights-reforged\/(public\/[a-z0-9-]+\.css|views\/[a-zA-Z0-9_/-]+\.ejs)$/.test(p)) return 'ui';
    if(/^knights-reforged\/src\/(combat|quests|army|progression|economy|game|equipment|land|bots|living-economy)\.ts$/.test(p)) return 'gameplay';
    return 'full';
  });
  return new Set(types).size===1 ? types[0] : 'full';
}
export function gitChanges(base, head, cwd=root) {
  if(!/^[a-f0-9]{40}$/.test(base)||!/^[a-f0-9]{40}$/.test(head)) throw Error('Exact Git identities required');
  const result=execFileSync('git',['diff','--raw','--no-abbrev','--no-renames','-z',base,head],{cwd,encoding:'utf8',maxBuffer:4*1024*1024});
  const fields=result.split('\0');const changes=[];
  for(let i=0;i<fields.length-1;i+=2){
    const match=/^:\d{6} (\d{6}) [a-f0-9]{40} [a-f0-9]{40} ([A-Z])$/.exec(fields[i]);
    if(!match||!fields[i+1]) throw Error('Unrecognized Git change');
    changes.push({mode:match[1],status:match[2],path:fields[i+1]});
  }
  return changes;
}
export function matrix(profile) {
  const entries=selected(profile), result=[];
  for(const lane of ['unit','database','browser']) {
    const count=lane==='database' && ['full','gameplay'].includes(profile)?3:lane==='browser'?2:1;
    if(entries.some(e=>e.lane===lane)) for(let i=1;i<=count;i++) result.push({lane,shard:i,shards:count,workers:lane==='browser'?1:2});
  }
  return {include:result};
}
export function aggregate(needs) {
  // Even intentionally omitted recovery is represented by a successful job
  // with an explicit conditional step. Missing/skipped/cancelled jobs fail.
  const required=['plan','validation','tests','recovery'];
  return Object.keys(needs).length===required.length && required.every(k=>needs[k]?.result==='success');
}

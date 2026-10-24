// Documentation assembly only: unaltered 390px local browser captures at native size.
import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {resolve} from 'node:path';
const root=resolve('.'),require=createRequire(resolve(root,'package.json')),{chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:828,height:1000},deviceScaleFactor:1});
for(const [name,title] of [['armory-bulk','Compact bulk trading'],['profile-preview','Inspect equipment on Profile'],['battle-victory','Recorded rewards and genuine level-up'],['tutorial-calling','Optional Calling introduction'],['personal-feed','Personal activity without global broadcasts'],['battle-rivals','Stamina and existing five-tab unread indicators']]){
 const images=['before','after'].map(stage=>`<div><h2>${stage==='before'?'Before · release/production da8e2ae':'After · Phase 5.1C'}</h2><img width="390" height="844" src="data:image/png;base64,${readFileSync('docs/phase51c/screenshots/'+stage+'/390-'+name+'.png').toString('base64')}"></div>`).join('');
 await page.setContent(`<!doctype html><html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:16px;background:#191612;color:#e6dac1;font:12px/1.45 Arial}h1{font:700 24px Georgia;margin:0 0 8px}h2{font:600 13px Arial;margin:0 0 8px}main{display:flex;gap:16px}img{display:block}p{margin:8px 0 0;color:#c2b498}</style><h1>${title}</h1><main>${images}</main><p>Actual synthetic local game routes at 390 × 844; independent fixtures use the same setup. Recorded combat variation can change damage. No production access, artwork editing or balance changes.</p></html>`);
 await page.screenshot({path:'docs/phase51c/screenshots/compare-390-'+name+'.png',fullPage:true});
}await browser.close();console.log('Six native-size before/after comparison boards saved.');

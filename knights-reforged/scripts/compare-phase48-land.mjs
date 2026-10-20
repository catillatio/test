// Compose unaltered reference/render screenshots at their native dimensions.
// Local-only review tooling; no application routes or provider credentials.
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';

const source='docs/phase48/ChatGPT Image Oct 20, 2026, 12_34_13 AM.png';
const render='test-results/phase48-land-only/after/1024-land.png';
const summary=JSON.parse(await readFile('test-results/phase48-land-only/after/summary.json','utf8'));
assert.equal(summary.passed,true);assert.equal(summary.baseline,false);assert.ok(summary.checks.length>=4);
const target=await readFile(source),actual=await readFile(render);
const dimensions=bytes=>[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
assert.deepEqual(dimensions(target),[1024,1536]);assert.deepEqual(dimensions(actual),[1024,1536]);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(target),'5eeab990681187eedd6eb89f13bd40c67a36d91052c2155778add17cdf5084e4');
const out='test-results/phase48-land-only/comparison';await mkdir(out,{recursive:true});
const html=(left,right)=>`<!doctype html><html lang="en"><meta charset="utf-8"><title>Land — reference and actual render</title><style>*{box-sizing:border-box}html,body{margin:0;background:#080909;color:#f4eee2;font:18px/1.3 Arial,sans-serif}.comparison{display:flex;width:2048px}figure{margin:0;flex:0 0 1024px}figcaption{height:52px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #77705c;background:#171917}img{display:block;width:1024px;height:1536px}</style><main class="comparison"><figure><figcaption>Owner's definitive mockup · unaltered 1024 × 1536</figcaption><img width="1024" height="1536" alt="Owner's definitive Land reference" src="${left}"></figure><figure><figcaption>Actual Land screen · 1024 × 1536 · synthetic test data</figcaption><img width="1024" height="1536" alt="Actual Land page rendered in Chromium" src="${right}"></figure></main></html>`;
const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:2048,height:1588},deviceScaleFactor:1});
 await page.route('**/*',route=>route.abort());
 await page.setContent(html('data:image/png;base64,'+target.toString('base64'),'data:image/png;base64,'+actual.toString('base64')));
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 await page.screenshot({path:out+'/comparison.png',fullPage:true});
 await writeFile(out+'/comparison.html',html('../ChatGPT%20Image%20Oct%2020%2C%202026%2C%2012_34_13%20AM.png','screenshots/1024-land.png'));
 await writeFile(out+'/sources.json',JSON.stringify({reference:{path:source,sha256:hash(target),dimensions:dimensions(target)},actual:{path:render,sha256:hash(actual),dimensions:dimensions(actual)},composition:{dimensions:[2048,1588],captionHeight:52,imageScaling:false,imageRetouching:false},productionContacted:false},null,2)+'\n');
 console.log('PASS: equal-size comparison; unmodified 1024 × 1536 inputs, captions outside the images, no scaling or retouching.');
}finally{await browser.close();}

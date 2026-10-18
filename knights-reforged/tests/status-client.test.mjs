import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../public/status.js',import.meta.url),'utf8');
function page(){
 const listeners=new Map(),health={textContent:'40'};
 const panels=['health','income','mana'].map(name=>{const handlers=new Map(),summaryHandlers=new Map(),summary={focused:false,focus(){this.focused=true;},addEventListener:(name,fn)=>summaryHandlers.set(name,fn)};return {name,open:false,handlers,summaryHandlers,summary,querySelector:()=>summary,addEventListener:(name,fn)=>handlers.set(name,fn)};});
 const root={dataset:{stateVersion:'5',serverTime:'2046-01-01T00:00:00Z'},contains:target=>target==='inside',querySelector:()=>null,
  querySelectorAll:selector=>selector==='.status-disclosure'?panels:selector==='[data-heal-current]'?[health]:[]};
 const document={querySelector:()=>root,addEventListener:(name,fn)=>listeners.set(name,fn)};
 runInNewContext(source,{document});return {panels,listeners,health};
}
test('activating a status summary closes sibling panels before the deferred native toggle event',()=>{
 const p=page(),[health,income]=p.panels;health.open=true;
 income.summaryHandlers.get('click')();assert.equal(health.open,false,'Health must close synchronously, not after a queued toggle.');
 income.open=true;income.handlers.get('toggle')();assert.equal(p.panels.filter(p=>p.open).length,1);
 p.listeners.get('keydown')({key:'Escape'});assert.equal(income.open,false);assert.equal(income.summary.focused,true);
 health.open=true;p.listeners.get('click')({target:'outside'});assert.equal(health.open,false);
});
test('out-of-order state reads cannot rewind the healing panel after a completed newer action',()=>{
 const p=page(),state=(version,health,time='2046-01-01T00:00:10Z')=>({stateVersion:version,serverTime:time,healing:{health,maxHealth:100,missing:100-health,unitCost:1,cost:100-health},payment:{gold:7,gross:8,propertyUpkeep:1,equipmentUpkeep:0,prepaidUpkeep:0,economicNet:7,retainedGold:'0'}});
 p.listeners.get('realm-state')({detail:state(6,100)});assert.equal(p.health.textContent,'100');
 p.listeners.get('realm-state')({detail:state(5,40)});assert.equal(p.health.textContent,'100');
 p.listeners.get('realm-state')({detail:state(6,80,'2046-01-01T00:00:09Z')});assert.equal(p.health.textContent,'100');
});

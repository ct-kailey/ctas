'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=import('../web/src/shared-view-state.mjs');

function browserAt(hash,blockedStorage=false){
 const stored=new Map(),replacements=[],reloads=[],listeners=new Map();
 const browser={location:{pathname:'/',search:'?project=selected',hash,reload:()=>reloads.push(browser.location.hash)},
 addEventListener:(type,handler)=>listeners.set(type,handler),removeEventListener:(type,handler)=>{if(listeners.get(type)===handler)listeners.delete(type);},sessionStorage:{
  getItem:key=>{if(blockedStorage)throw Error('Storage disabled');return stored.get(key)??null;},
  setItem:(key,value)=>{if(blockedStorage)throw Error('Storage disabled');stored.set(key,value);},
  removeItem:key=>{if(blockedStorage)throw Error('Storage disabled');stored.delete(key);},
 },history:{replaceState:(_state,_title,url)=>{replacements.push(url);browser.location.hash='';}}};
 return {browser,stored,replacements,reloads,listeners,changeHash:hash=>{browser.location.hash=hash;listeners.get('hashchange')?.();}};
}

test('shared entry removes the bearer secret from history and persists only mode intent',async()=>{
 const {consumeSharedViewLocation,hasSharedViewIntent,setSharedViewIntent}=await state;
 const secret='a'.repeat(64),fixture=browserAt('#share='+secret);
 assert.equal(consumeSharedViewLocation(fixture.browser),secret);
 assert.deepEqual(fixture.replacements,['/?project=selected']);
 assert.equal(hasSharedViewIntent(fixture.browser),true);
 assert.deepEqual([...fixture.stored.values()],['true']);
 assert.ok(!JSON.stringify([...fixture.stored]).includes(secret));
 assert.equal(consumeSharedViewLocation(fixture.browser),null);
 assert.equal(hasSharedViewIntent(fixture.browser),true,'reload must retain explicit shared mode');
 setSharedViewIntent(fixture.browser,false);
 assert.equal(hasSharedViewIntent(fixture.browser),false);
});

test('unrelated anchors are not consumed and an empty share token still marks shared entry',async()=>{
 const {consumeSharedViewLocation,hasSharedViewIntent}=await state;
 const ordinary=browserAt('#workspace');assert.equal(consumeSharedViewLocation(ordinary.browser),null);assert.equal(ordinary.replacements.length,0);assert.equal(ordinary.stored.size,0);
 const empty=browserAt('#share=');assert.equal(consumeSharedViewLocation(empty.browser),'');assert.equal(hasSharedViewIntent(empty.browser),true);assert.equal(empty.browser.location.hash,'');
 const blocked=browserAt('#share=bad-token',true);assert.equal(consumeSharedViewLocation(blocked.browser),'bad-token');assert.equal(blocked.browser.location.hash,'');
});

test('shared navigation permits project records but excludes configuration and external actions',async()=>{
 const {sharedViewTab}=await state;
 for(const tab of ['documents','context','commercial','implementation','questions','work-items'])assert.equal(sharedViewTab(tab,true),tab);
 for(const tab of ['settings','integrations','customers','github-delivery','members','unexpected-new-admin-page'])assert.equal(sharedViewTab(tab,true),'home');
 assert.equal(sharedViewTab('settings',false),'settings');
});

test('a shared link entered on an existing login page restarts the entry and preserves its token for exchange',async()=>{
 const {watchSharedViewLocation,consumeSharedViewLocation,hasSharedViewIntent}=await state;
 const fixture=browserAt(''),secret='b'.repeat(64),stop=watchSharedViewLocation(fixture.browser);
 fixture.changeHash('#workspace');assert.equal(fixture.reloads.length,0);
 fixture.changeHash('#share='+secret);
 assert.deepEqual(fixture.reloads,['#share='+secret]);
 assert.equal(fixture.browser.location.hash,'#share='+secret,'reload must retain the new link for bootstrap');
 assert.equal(fixture.stored.size,0,'the watcher must not persist the secret');
 fixture.listeners.get('hashchange')();assert.equal(fixture.reloads.length,1,'duplicate events must not schedule repeated reloads');
 stop();assert.equal(fixture.listeners.has('hashchange'),false);
 assert.equal(consumeSharedViewLocation(fixture.browser),secret);
 assert.equal(fixture.browser.location.hash,'');assert.equal(hasSharedViewIntent(fixture.browser),true);
});

test('an unavailable shared session can switch to a fresh link, including a link arriving before effect setup',async()=>{
 const {watchSharedViewLocation,consumeSharedViewLocation,setSharedViewIntent,hasSharedViewIntent}=await state;
 const fixture=browserAt(''),secret='c'.repeat(64);
 setSharedViewIntent(fixture.browser,true);
 const stop=watchSharedViewLocation(fixture.browser);fixture.changeHash('#share='+secret);stop();
 assert.equal(fixture.reloads.length,1);assert.equal(consumeSharedViewLocation(fixture.browser),secret);
 assert.equal(hasSharedViewIntent(fixture.browser),true,'switching links must not return to a normal account');
 const duringMount=browserAt('#share='+secret);const cleanup=watchSharedViewLocation(duringMount.browser);
 assert.deepEqual(duringMount.reloads,['#share='+secret]);cleanup();
 const invalid=browserAt('');const detach=watchSharedViewLocation(invalid.browser);invalid.changeHash('#share=');
 assert.deepEqual(invalid.reloads,['#share='],'empty links must reach the unavailable-link state, not leave the login screen');detach();
});

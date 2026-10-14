'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const state=import('../web/src/shared-view-state.mjs');

function browserAt(hash,blockedStorage=false){
 const stored=new Map(),replacements=[];
 const browser={location:{pathname:'/',search:'?project=selected',hash},sessionStorage:{
  getItem:key=>{if(blockedStorage)throw Error('Storage disabled');return stored.get(key)??null;},
  setItem:(key,value)=>{if(blockedStorage)throw Error('Storage disabled');stored.set(key,value);},
  removeItem:key=>{if(blockedStorage)throw Error('Storage disabled');stored.delete(key);},
 },history:{replaceState:(_state,_title,url)=>{replacements.push(url);browser.location.hash='';}}};
 return {browser,stored,replacements};
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
 for(const tab of ['settings','integrations','github-delivery','members','unexpected-new-admin-page'])assert.equal(sharedViewTab(tab,true),'home');
 assert.equal(sharedViewTab('settings',false),'settings');
});

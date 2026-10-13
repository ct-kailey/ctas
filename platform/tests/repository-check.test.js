'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {repositoryCoordinates,checkRepository}=require('../server/repository-check');
test('repository checks reject credentialed or arbitrary origins before fetching',()=>{
 for(const url of ['http://github.com/a/b','https://user:pass@github.com/a/b','https://github.com/a/b?token=x','https://localhost/a/b','https://github.com/a/../b'])assert.throws(()=>repositoryCoordinates(url));
 assert.equal(repositoryCoordinates('https://github.com/ct-kailey/nora-flow.git').repo,'nora-flow');
});
test('repository readiness requires a real branch commit and distinguishes empty/missing',async()=>{
 for(const [code,status] of [[200,'ready'],[409,'empty'],[404,'branch_missing'],[403,'inaccessible']]){
  const seen=[];const r=await checkRepository({repository_url:'https://github.com/example/repo.git',base_branch:'feature/example'},{fetchImpl:async(url,opts)=>{seen.push([url,opts]);return seen.length===1?{ok:true,json:async()=>({archived:false})}:{ok:code===200,status:code,json:async()=>({commit:{sha:'a'.repeat(40)}})}}});
  assert.equal(r.status,status);assert.equal(r.head_sha,status==='ready'?'a'.repeat(40):null);assert.ok(seen[1][0].endsWith('/branches/feature%2Fexample'));assert.equal(seen[0][1].redirect,'error');
 }
});
test('repository checks distinguish missing authentication, invalid tokens, access restrictions and rate limits without echoing GitHub text',async()=>{
 const settings={repository_url:'https://github.com/example/private.git',base_branch:'main'};
 for(const [status,token,headers,reason] of [[404,null,{},'AUTH_REQUIRED_OR_NOT_FOUND'],[404,'private-token',{},'ACCESS_DENIED'],[401,'expired-token',{},'AUTH_INVALID'],[403,'limited-token',{},'ACCESS_DENIED'],[403,'limited-token',{'x-ratelimit-remaining':'0'},'RATE_LIMITED'],[429,null,{},'RATE_LIMITED'],[503,null,{},'REPOSITORY_UNAVAILABLE']]){
  const result=await checkRepository(settings,{token,fetchImpl:async()=>Response.json({message:'Private upstream response must not escape'},{status,headers})});
  assert.equal(result.reason_code,reason);assert.equal(result.status,'inaccessible');assert.ok(!JSON.stringify(result).includes('Private upstream'));
 }
 const result=await checkRepository(settings,{token:'private-token',fetchImpl:async()=>{throw Error('private-token transport detail');}});
 assert.equal(result.reason_code,'NETWORK_ERROR');assert.ok(!JSON.stringify(result).includes('private-token'));
});

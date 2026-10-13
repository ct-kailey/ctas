'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {repositoryCoordinates,checkRepository}=require('../server/repository-check');
test('repository checks reject credentialed or arbitrary origins before fetching',()=>{
 for(const url of ['http://github.com/a/b','https://user:pass@github.com/a/b','https://github.com/a/b?token=x','https://localhost/a/b','https://github.com/a/../b'])assert.throws(()=>repositoryCoordinates(url));
 assert.equal(repositoryCoordinates('https://github.com/ct-kailey/nora-flow.git').repo,'nora-flow');
});
test('repository readiness requires a real branch commit and distinguishes empty/missing',async()=>{
 for(const [code,status] of [[200,'ready'],[409,'empty'],[404,'branch_missing'],[403,'inaccessible']]){
  const seen=[];const r=await checkRepository({repository_url:'https://github.com/example/repo.git',base_branch:'feature/example'},{fetchImpl:async(url,opts)=>{seen.push([url,opts]);return seen.length===1?{ok:true,json:async()=>({archived:false})}:{ok:code===200,status:code,json:async()=>({sha:'a'.repeat(40)})}}});
  assert.equal(r.status,status);assert.equal(r.head_sha,status==='ready'?'a'.repeat(40):null);assert.ok(seen[1][0].endsWith('feature%2Fexample'));assert.equal(seen[0][1].redirect,'error');
 }
});

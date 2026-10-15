const test=require('node:test'), assert=require('node:assert/strict');
const state=()=>import('../web/src/desktop-connection-state.mjs');
const native=()=>import('../web/src/desktop/connection-state.mjs');
const config=()=>import('../web/src/task-automation-state.mjs');
const id='f7db5dca-2361-4168-a96d-c1f2d9dcdefa';
test('desktop open URL contains only encoded project identity',async()=>{
 const {desktopOpenUrl}=await state();assert.equal(desktopOpenUrl('a/b?code=secret'),'ctas://open?project=a%2Fb%3Fcode%3Dsecret');assert.equal(desktopOpenUrl('\n'),null);assert.equal(desktopOpenUrl(null),null);
});
test('selectable desktop devices exclude revoked, expired and mismatched providers',async()=>{
 const {desktopDevices,desktopDeviceState}=await state();const valid={id,provider:'codex',online:false},expired={...valid,id:'expired',expires_at:'2020-01-01'};
 assert.deepEqual(desktopDevices({devices:[valid,expired,{...valid,id:'revoked',revoked_at:'x'},{...valid,id:'claude',provider:'claude-code'}]},'codex'),[valid]);
 assert.equal(desktopDeviceState(valid).label,'오프라인 · 수신 대기');assert.equal(desktopDeviceState(expired).label,'연결 만료');
});
test('desktop settings support first pairing without a device and preserve other modes',async()=>{
 const {automationSettingsDraft,automationSettingsPayload}=await config();const draft={...automationSettingsDraft({enabled:true}),execution_mode:'desktop',sdk_provider:'claude-code'};
 assert.equal(automationSettingsPayload(draft,1).desktop_device_id,null);
 assert.equal(automationSettingsPayload({...draft,desktop_device_id:id},1).desktop_device_id,id);
 assert.equal(automationSettingsDraft({execution_mode:'desktop',desktop_device_id:id}).execution_mode,'desktop');
 assert.throws(()=>automationSettingsPayload({...draft,sdk_provider:'unknown'},1),/개발 도구/);assert.throws(()=>automationSettingsPayload({...draft,desktop_device_id:'wrong'},1),/기기/);
});
test('queued and running device tasks never claim synchronized or approved results',async()=>{
 const {desktopTaskMessage}=await state();const context={execution_profile:{execution_mode:'desktop'}};
 assert.equal(desktopTaskMessage({execution_context:context,execution_status:'queued'}).title,'데스크톱 수신 대기');
 assert.equal(desktopTaskMessage({execution_context:context,execution_status:'running'}).title,'데스크톱에서 개발 중');
 assert.equal(desktopTaskMessage({execution_context:context,execution_status:'ready'}),null);
 assert.match(desktopTaskMessage({execution_context:context,execution_status:'ready',artifact:{diff:'x'}}).body,/자동으로 PR을 생성하거나 병합하지/);
 assert.equal(desktopTaskMessage({execution_context:{execution_profile:{execution_mode:'connector_api'}},execution_status:'queued'},{execution_mode:'desktop'}),null);
});
test('pairing alone does not mean automatic receiving or execution',async()=>{
 const {desktopConnectionState}=await native();assert.equal(desktopConnectionState(null).label,'연결 전');
 assert.equal(desktopConnectionState({paired:true,receiving:false}).label,'연결됨 · 수신 꺼짐');
 assert.equal(desktopConnectionState({paired:true,receiving:true}).label,'자동 수신 켜짐');
 assert.equal(desktopConnectionState({paired:true,receiving:true,pendingResultCount:2}).label,'결과 동기화 대기');
});
test('auto receiving requires profile, tool and repository agreement',async()=>{
 const {desktopCanReceive}=await native();const good={desktopConnection:{paired:true,projectId:'ctas',provider:'claude-code'},profile:{projectId:'ctas',provider:'claude-code',workingFolder:'/work'},diagnostics:{tools:{claude:{installed:true}},repository:{status:'ready',matchesProfile:true,workingFolder:'/work'}}};
 assert.equal(desktopCanReceive(good),true);assert.equal(desktopCanReceive({...good,desktopConnection:{...good.desktopConnection,projectId:'other'}}),false);assert.equal(desktopCanReceive({...good,diagnostics:{...good.diagnostics,tools:{codex:{installed:true}}}}),false);
});
test('pair code validation neither adds identity nor forwards multiline data',async()=>{
 const {desktopPairCode}=await native();assert.equal(desktopPairCode(' code '),'code');assert.throws(()=>desktopPairCode('a\nb'),/연결 코드/);assert.throws(()=>desktopPairCode(''),/연결 코드/);
});

test('local desktop patches cannot invoke unavailable remote artifact verification',async()=>{
 const {automationCanRefreshArtifact}=await config();
 const task={status:'qa',execution_status:'ready',artifact:{transport:'desktop',diff:'diff --git a/a b/a\n+a',evidence_status:'unverified',base_sha:'a'.repeat(40)}};
 assert.equal(automationCanRefreshArtifact(task,{canWrite:true}),false);
});

'use strict';
const express=require('express');
const {createHash}=require('node:crypto');
const {createDesktopExecution}=require('./desktop-execution');
const {fail}=require('./task-automation');
function mountDesktopExecutionNative(app,{pool}){
 const service=createDesktopExecution({pool}),router=express.Router();
 // These are native bearer endpoints. Cookies and browser requests never confer
 // transport authority, including browser requests holding a pairing code.
 router.use((req,_res,next)=>{if(req.headers.origin||req.headers.cookie||req.headers['sec-fetch-site'])return next(Object.assign(new Error('데스크톱 앱에서 연결하세요.'),{code:'DESKTOP_NATIVE_REQUIRED',status:403}));next();});
 router.use(express.json({limit:'4mb'}));
 router.use((req,_res,next)=>{if(!req.is('application/json'))return next(Object.assign(new Error('JSON 요청이 필요합니다.'),{code:'DESKTOP_JSON_REQUIRED',status:415}));next();});
 router.post('/pair',async(req,res)=>{
  const bucket='desktop-pair:'+createHash('sha256').update(req.ip||'unknown').digest('hex');
  const attempts=(await pool.query(`INSERT INTO auth_attempts(bucket,count,expires_at) VALUES($1,1,now()+interval '15 minutes')
   ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_attempts.expires_at<now() THEN 1 ELSE auth_attempts.count+1 END,
   expires_at=CASE WHEN auth_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.expires_at END RETURNING count`,[bucket])).rows[0];
  if(attempts.count>30)fail('DESKTOP_RATE_LIMITED','연결 요청이 많습니다. 15분 후 다시 시도하세요.',429);
  res.json(await service.pair(req.body));
 });
 router.post('/claim',async(req,res)=>res.json(await service.claim(req.headers.authorization,req.body)));
 router.post('/disconnect',async(req,res)=>res.json(await service.disconnect(req.headers.authorization,req.body)));
 router.post('/jobs/:id/heartbeat',async(req,res)=>res.json(await service.heartbeat(req.headers.authorization,req.params.id,req.body)));
 router.post('/jobs/:id/complete',async(req,res)=>res.json(await service.complete(req.headers.authorization,req.params.id,req.body)));
 app.use('/api/desktop',router);
 return service;
}
function mountDesktopExecutionProject(router,{pool,owner}){
 const service=createDesktopExecution({pool});
 router.post('/task-automation/desktop/pairings',owner,async(req,res)=>res.status(201).json(await service.createPairing(req.params.p,req.user.id,req.body)));
 router.get('/task-automation/desktop/devices',async(req,res)=>res.json(await service.devices(req.params.p,req.user.id)));
 router.delete('/task-automation/desktop/devices/:id',owner,async(req,res)=>res.json(await service.revoke(req.params.p,req.user.id,req.params.id)));
 return service;
}
module.exports={mountDesktopExecutionNative,mountDesktopExecutionProject};

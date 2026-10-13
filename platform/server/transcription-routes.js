'use strict';
const multer=require('multer');
const {createTranscriptionLedger}=require('./transcription-ledger');
const {MAX_AUDIO_BYTES}=require('./transcription-contract');
function mountTranscriptionRoutes(router,{pool,write,review,transcription={}}){
 const ledger=createTranscriptionLedger(pool,transcription),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_AUDIO_BYTES,files:1,fields:7,fieldSize:4096,parts:8}});let activeUploads=0;
 function capacity(req,res,next){if(activeUploads>=2)return next(Object.assign(new Error('다른 음성 파일을 업로드하고 있습니다. 잠시 후 다시 시도하세요.'),{status:429,code:'TRANSCRIPTION_UPLOAD_BUSY'}));activeUploads++;let released=false;const release=()=>{if(!released){released=true;activeUploads--;}};res.once('finish',release);res.once('close',release);next();}
 router.get('/transcriptions',async(req,res)=>res.json(await ledger.list(req.params.p,req.user.id)));
 router.post('/transcriptions',write,capacity,upload.single('audio'),async(req,res)=>res.status(201).json({job:await ledger.upload(req.params.p,req.user.id,req.body,req.file)}));
 router.get('/transcriptions/:id',async(req,res)=>res.json({job:await ledger.get(req.params.p,req.params.id,req.user.id)}));
 router.get('/transcriptions/:id/audio',async(req,res)=>{
  const job=await ledger.audio(req.params.p,req.params.id,req.user.id),total=job.audio.length;
  res.set('Content-Type',job.mime_type);res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','no-store');res.set('Accept-Ranges','bytes');res.set('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="recording"; filename*=UTF-8''${encodeURIComponent(job.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`);
  if(req.headers.range){const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);if(!match||(!match[1]&&!match[2])){res.set('Content-Range',`bytes */${total}`);return res.status(416).end();}let start=match[1]?Number(match[1]):Math.max(0,total-Number(match[2])),end=match[1]?(match[2]?Number(match[2]):total-1):total-1;if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=total||end<start){res.set('Content-Range',`bytes */${total}`);return res.status(416).end();}end=Math.min(end,total-1);res.set('Content-Range',`bytes ${start}-${end}/${total}`);res.set('Content-Length',String(end-start+1));return res.status(206).send(job.audio.subarray(start,end+1));}
  res.set('Content-Length',String(total));res.send(job.audio);
 });
 router.post('/transcriptions/:id/cancel',write,async(req,res)=>res.json({job:await ledger.cancel(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/transcriptions/:id/retry',write,async(req,res)=>res.json({job:await ledger.retry(req.params.p,req.params.id,req.user.id,req.body)}));
 router.post('/transcriptions/:id/review',review,async(req,res)=>res.status(201).json(await ledger.review(req.params.p,req.params.id,req.user.id,req.body)));
 return ledger;
}
module.exports={mountTranscriptionRoutes};

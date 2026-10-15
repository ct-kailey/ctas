'use strict';
const express = require('express');
const helmet = require('helmet');
const { createDashboardRouter } = require('./dashboard-static');
const { mountDashboardRoutes } = require('./dashboard');
const { mountProjectMemberRoutes } = require('./project-members');
const multer = require('multer');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createAuth, error } = require('./auth');
const { createSharedViews } = require('./shared-views');
const { createGoogleAuth } = require('./google-auth');
const { createLedger } = require('./ledger');
const { createRegistrationAssistant } = require('./registration-assistant');
const { createChannelLedger } = require('./channel-ledger');
const { createImplementationLedger } = require('./implementation-ledger');
const { createImplementationRunner } = require('./implementation-runner');
const { createWorkItemLedger } = require('./work-item-ledger');
const { mountCommercialRoutes } = require('./commercial-routes');
const { mountContextRoutes } = require('./context-routes');
const { mountContextAIRoutes, mountContextAIWebhook } = require('./context-ai-routes');
const { mountRepositoryAccessRoutes } = require('./repository-access');
const {createProviderSettings,mountProviderRoutes}=require('./provider-settings');
const {mountIntegrationRoutes,mountIntegrationBridge}=require('./integration-routes');
const {mountTranscriptionRoutes}=require('./transcription-routes');
const {createSemanticService}=require('./semantic-service');
const {mountSemanticRoutes}=require('./semantic-routes');
const {mountInsightRoutes}=require('./insights');
const {mountWorkGovernanceRoutes}=require('./work-governance');
const {mountWorkResultBridgeRoutes}=require('./work-result-bridge');
const {mountGitHubDeliveryRoutes}=require('./github-delivery');
const {mountQuestionRoutes}=require('./question-routes');
const {mountChannelWorkflowRoutes}=require('./channel-workflow-routes');
const {mountWorkAIRoutes,mountWorkAIWebhook}=require('./work-ai-routes');
const {mountExecutionQueueBridge,mountExecutionQueueRoutes}=require('./execution-queue');
const {kakaoWatcherScript}=require('./kakao-watcher-download');
const {mountProjectNoraRoutes}=require('./project-nora-routes');
const {mountTaskAutomationRoutes}=require('./task-automation-routes');
const {mountTaskDraftRoutes}=require('./task-draft-routes');
const {mountImplementationNoteRoutes}=require('./implementation-note-routes');
const {mountDomainGuideRoutes}=require('./domain-guide-routes');
const {mountProjectJourneyRoutes}=require('./project-journey-routes');

function createApp({ pool, appOrigin = 'http://127.0.0.1:3100', production = false, staticDir = path.resolve(__dirname, '../..', 'dist'), google = {}, googleClient, contextAI = {}, provider = {}, integration = {}, transcription = {}, semantic = {}, workAI = {}, questions = {}, governance = {}, githubDelivery = {}, repositoryAccess = {}, nora = {} }) {
  const sharedViews = createSharedViews(pool, { appOrigin, production });
  const app = express(), ledger = createLedger(pool, { automaticDocumentAnalysis: true, requireNoraWorkspace: true }), auth = createAuth(pool, { appOrigin, production, sharedViews });
  const registrationAssistant = createRegistrationAssistant({ pool });
  const channels = createChannelLedger(pool);
  if(production&&governance.enforce===false)throw new Error('GOVERNANCE_REQUIRED_IN_PRODUCTION');
  const enforcement={requireGovernance:governance.enforce!==false};
  const implementation = createImplementationLedger(pool,enforcement);
  const workItems = createWorkItemLedger(pool,enforcement);
  const runner = createImplementationRunner({pool,appOrigin,...enforcement});
  const providerSettings=createProviderSettings(pool,provider),resolveConfig=p=>providerSettings.getConfig(p);
  const semanticService=createSemanticService(pool,{resolveConfig,...semantic});
  const googleAuth = createGoogleAuth(pool, { auth, appOrigin, production, config: google, client: googleClient });
  app.disable('x-powered-by');
  app.set('trust proxy', production ? 1 : false);
  app.use(helmet({
    strictTransportSecurity: production ? undefined : false,
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], connectSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], frameAncestors: ["'none'"],
      upgradeInsecureRequests: production ? [] : null,
    } },
  }));
  app.use((req,res,next) => { res.set('X-Request-ID', randomUUID()); next(); });
  app.get('/healthz', async (_req,res) => { try { await pool.query('SELECT 1'); res.json({status:'ok'}); } catch { res.status(503).json({status:'unavailable'}); } });
  app.use('/api', (_req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  app.use('/api', sharedViews.earlyGuard);
  mountContextAIWebhook(app,{pool,contextAI});
  mountWorkAIWebhook(app,{pool,workAI});
  mountExecutionQueueBridge(app,{pool,appOrigin});
  mountIntegrationBridge(app,{pool,...integration});
  // One-request bearer credentials only. Browser cookies and project-wide access are not accepted here.
  const runnerRoutes=express.Router();
  runnerRoutes.use(express.json({limit:'2mb'}));
  runnerRoutes.post('/:id/claim',async(req,res)=>res.json(await runner.claim(req.params.id,req.headers.authorization)));
  runnerRoutes.post('/:id/heartbeat',async(req,res)=>res.json(await runner.heartbeat(req.params.id,req.headers.authorization,req.body)));
  runnerRoutes.post('/:id/complete',async(req,res)=>res.json(await runner.complete(req.params.id,req.headers.authorization,req.body)));
  app.use('/api/implementation-runner',runnerRoutes);
  app.use('/api', auth.checkOrigin, express.json({limit:'1mb'}));
  app.get('/api/auth/providers', (_req,res) => res.json({google:{enabled:googleAuth.enabled,signup_domains:googleAuth.signupDomains}}));
  app.get('/api/auth/google', googleAuth.start);
  app.get('/api/auth/google/callback', googleAuth.callback);
  app.post('/api/auth/login', auth.login);
  app.post('/api/auth/shared-view', async (req,res) => {
    try { res.json(await sharedViews.exchange(req,res,auth)); }
    catch (e) { sharedViews.markUnavailable(res); throw e; }
  });
  app.post('/api/auth/shared-view/exit', async (req,res) => { await sharedViews.exit(req,res); res.json({ok:true}); });
  app.use('/api', auth.authenticate, sharedViews.guard, auth.csrf);
  app.get('/api/nora/oauth/callback',async(req,res)=>{
    if(!nora.oauth)return res.redirect('/?nora_connection=failed');
    try{
      const result=await nora.oauth.callback(req.user.id,req.query);
      res.redirect('/?'+new URLSearchParams({project:result.project_id,tab:'settings',nora_connection:'connected'}));
    }catch{res.redirect('/?nora_connection=failed');}
  });
  app.get('/api/session', (req,res) => res.json({user:req.user,csrfToken:req.session.csrfToken,...(req.sharedView?{shared_view:req.sharedView}:{})}));
  app.post('/api/auth/logout', auth.logout);
  app.get('/api/shared-views', async (req,res) => res.json(await sharedViews.list(req.user.id)));
  app.post('/api/shared-views', async (req,res) => res.status(201).json(await sharedViews.create(req.user.id,req.body)));
  app.post('/api/shared-views/:id/revoke', async (req,res) => res.json(await sharedViews.revoke(req.user.id,req.params.id)));
  app.get('/api/projects', async (req,res) => res.json({projects:await ledger.listProjects(req.user.id)}));
  app.post('/api/projects', async (req,res) => res.status(201).json({project:await ledger.createProject(req.user.id,req.body)}));
  const project = express.Router({mergeParams:true});
  project.use(async (req,_res,next) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(req.params.p)) throw error('NOT_FOUND','프로젝트를 찾을 수 없습니다.',404);
    const {rows} = await pool.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2',[req.params.p,req.user.id]);
    if (!rows[0]) throw error('NOT_FOUND','프로젝트를 찾을 수 없습니다.',404);
    req.projectRole=rows[0].role; next();
  });
  function roles(...allowed) { return (req,_res,next) => allowed.includes(req.projectRole) ? next() : next(error('FORBIDDEN','이 작업을 수행할 권한이 없습니다.',403)); }
  const write=roles('owner','reviewer','member'), review=roles('owner','reviewer');
  mountProjectNoraRoutes(project,{pool,owner:roles('owner'),...nora});
  const taskAutomation=mountTaskAutomationRoutes(project,{pool,write,review,owner:roles('owner'),provider:nora.tasks});
  mountTaskDraftRoutes(project,{pool,write});
  mountImplementationNoteRoutes(project,{pool,write,review,taskAutomation});
  mountDomainGuideRoutes(project,{pool,write,review,owner:roles('owner'),provider:nora.guide});
  mountProjectJourneyRoutes(project,{pool,review});
  mountDashboardRoutes(project,{pool});
  mountProjectMemberRoutes(project,{pool});
  mountCommercialRoutes(project,{pool,write,review});
  mountContextRoutes(project,{pool,write,review});
  mountContextAIRoutes(project,{pool,write,review,contextAI});
  mountProviderRoutes(project,{providerSettings,owner:roles('owner')});
  mountIntegrationRoutes(project,{pool,review,...integration});
  project.get('/integrations/kakao-watcher',review,(_req,res)=>{res.attachment('watch-kakao-export.cjs');res.type('text/plain');res.send(kakaoWatcherScript());});
  mountTranscriptionRoutes(project,{pool,write,review,transcription:{resolveConfig,...transcription}});
  mountSemanticRoutes(project,{service:semanticService,review});
  mountInsightRoutes(project,{pool,write,review});
  mountWorkGovernanceRoutes(project,{pool,write,review});
  mountWorkResultBridgeRoutes(project,{pool,write,review});
  mountGitHubDeliveryRoutes(project,{pool,owner:roles('owner'),review,...githubDelivery});
  mountQuestionRoutes(project,{pool,write,review,...questions});
  mountChannelWorkflowRoutes(project,{pool,review});
  mountWorkAIRoutes(project,{pool,write,review,workAI});
  mountExecutionQueueRoutes(project,{pool,appOrigin,owner:roles('owner')});
  project.get('/execution-agent-script',roles('owner'),(_req,res)=>res.download(path.resolve(__dirname,'../../scripts/watch-execution-queue.cjs'),'watch-execution-queue.cjs'));
  let activeUploads=0;
  const userUploads=new Map();
  function uploadCapacity(req,res,next){
    const used=userUploads.get(req.user.id)||0;
    if(activeUploads>=4||used>=2)return next(error('UPLOAD_BUSY','문서 업로드가 진행 중입니다. 잠시 후 다시 시도해 주세요.',429));
    activeUploads++;userUploads.set(req.user.id,used+1);
    let released=false;
    const release=()=>{if(released)return;released=true;activeUploads--;const left=(userUploads.get(req.user.id)||1)-1;if(left)userUploads.set(req.user.id,left);else userUploads.delete(req.user.id);};
    res.once('finish',release);res.once('close',release);next();
  }
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024,files:1,fields:8,fieldSize:65536,parts:10}});
  project.get('/overview',async(req,res)=>res.json(await ledger.overview(req.params.p)));
  project.get('/settings',async(req,res)=>res.json({settings:await implementation.getSettings(req.params.p,req.user.id)}));
  project.patch('/settings',roles('owner'),async(req,res)=>res.json({settings:await implementation.saveSettings(req.params.p,req.user.id,req.body)}));
  mountRepositoryAccessRoutes(project,{pool,owner:roles('owner'),implementation,deliveryEncryptionKey:githubDelivery.encryptionKey,...repositoryAccess});
  project.get('/implementation-plans',async(req,res)=>res.json({plans:await implementation.listPlans(req.params.p,req.user.id)}));
  project.get('/work-items',async(req,res)=>res.json(await workItems.list(req.params.p,req.user.id)));
  project.get('/work-items/:id',async(req,res)=>res.json({item:await workItems.get(req.params.p,req.params.id,req.user.id)}));
  project.patch('/work-items/:id',write,async(req,res)=>res.json({item:await workItems.update(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/implementation-plans/:id/work-items',review,async(req,res)=>res.status(201).json(await workItems.importPlan(req.params.p,req.params.id,req.user.id,req.body)));
  project.post('/implementation-source-reviews',review,async(req,res)=>res.status(201).json({review:await implementation.reviewSource(req.params.p,req.user.id,req.body)}));
  project.post('/implementation-plan-preparations',write,async(req,res)=>res.status(201).json({preparation:await implementation.preparePlan(req.params.p,req.user.id,req.body)}));
  project.post('/implementation-plans',write,async(req,res)=>res.status(202).json({plan:await implementation.createPlan(req.params.p,req.user.id,req.body)}));
  project.get('/implementation-plans/:id',async(req,res)=>res.json({plan:await implementation.getPlan(req.params.p,req.params.id,req.user.id)}));
  project.post('/implementation-plans/:id/decision',review,async(req,res)=>res.json({plan:await implementation.decidePlan(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/implementation-plans/:id/execution-requests',review,async(req,res)=>res.status(202).json({request:await implementation.requestExecution(req.params.p,req.params.id,req.user.id,req.body)}));
  project.get('/implementation-requests',async(req,res)=>res.json({requests:await implementation.listRequests(req.params.p,req.user.id)}));
  project.get('/implementation-runner-script',roles('owner'),async(_req,res)=>res.download(path.resolve(__dirname,'../../scripts/run-implementation.js'),'ains-implementation-runner.cjs'));
  project.get('/implementation-requests/:id',async(req,res)=>res.json({request:await implementation.getRequest(req.params.p,req.params.id,req.user.id)}));
  project.get('/implementation-requests/:id/patch',async(req,res)=>{
    const result=await implementation.getRequest(req.params.p,req.params.id,req.user.id);
    if(result.status!=='patch_ready'||!result.result?.patch)throw error('PATCH_NOT_READY','코드 변경안이 아직 준비되지 않았습니다.',409);
    res.set('Content-Type','text/plain; charset=utf-8');res.set('Content-Disposition',`attachment; filename="ains-${result.id}.patch"`);res.send(result.result.patch);
  });
  project.post('/implementation-requests/:id/runner-ticket',roles('owner'),async(req,res)=>res.json(await runner.issue(req.params.p,req.params.id,req.user.id)));
  project.post('/implementation-requests/:id/revoke-runner-ticket',roles('owner'),async(req,res)=>res.json(await runner.revoke(req.params.p,req.params.id,req.user.id)));
  project.get('/domains',async(req,res)=>res.json({domains:await ledger.listDomains(req.params.p)}));
  project.post('/domains',review,async(req,res)=>res.status(201).json({domain:await ledger.createDomain(req.params.p,req.user.id,req.body)}));
  project.post('/registration-suggestions',write,async(req,res)=>res.json(await registrationAssistant.suggest(req.params.p,req.user.id,req.body)));
  project.get('/channel-sources',async(req,res)=>res.json({sources:await channels.listSources(req.params.p,req.user.id)}));
  project.post('/channel-sources',review,async(req,res)=>res.status(201).json({source:await channels.createSource(req.params.p,req.user.id,req.body)}));
  project.patch('/channel-sources/:id',review,async(req,res)=>res.json({source:await channels.updateSource(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/channel-sources/:id/ingest',write,async(req,res)=>{const inbox=await channels.ingest(req.params.p,req.params.id,req.user.id,req.body);res.status(202).json({inbox,replayed:inbox.replayed});});
  project.get('/channel-inbox',async(req,res)=>res.json({items:await channels.listInbox(req.params.p,req.user.id)}));
  project.get('/channel-inbox/:id',async(req,res)=>res.json({item:await channels.getInbox(req.params.p,req.params.id,req.user.id)}));
  project.post('/channel-inbox/:id/accept',review,async(req,res)=>res.json({item:await channels.accept(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/channel-inbox/:id/dismiss',review,async(req,res)=>res.json({item:await channels.dismiss(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/records',write,uploadCapacity,async(req,res)=>res.status(202).json(await ledger.createRecord(req.params.p,req.user.id,req.body)));
  project.get('/documents',async(req,res)=>res.json({documents:await ledger.listDocuments(req.params.p)}));
  project.post('/documents',write,uploadCapacity,upload.single('file'),async(req,res)=>{
    if(!req.file) throw error('FILE_REQUIRED','파일을 선택해 주세요.');
    res.status(202).json(await ledger.upload(req.params.p,req.user.id,{...req.body,filename:Buffer.from(req.file.originalname,'latin1').toString('utf8'),content:req.file.buffer}));
  });
  project.get('/revisions/:id',async(req,res)=>res.json({revision:await ledger.getRevision(req.params.p,req.params.id)}));
  project.get('/revisions/:id/original',async(req,res)=>{
    const revision=await ledger.getRevision(req.params.p,req.params.id,{includeContent:true});
    res.set('Content-Type','application/octet-stream');
    res.set('Content-Disposition',`attachment; filename="document"; filename*=UTF-8''${encodeURIComponent(revision.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`);
    res.set('Content-Security-Policy',"default-src 'none'; sandbox");
    res.send(revision.content);
  });
  project.post('/revisions/:id/publish-initial',review,async(req,res)=>res.json({baseline:await ledger.publishInitial(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/reviews',write,async(req,res)=>res.status(202).json(await ledger.createReview(req.params.p,req.user.id,req.body)));
  project.get('/reviews/:id',async(req,res)=>res.json({review:await ledger.getReview(req.params.p,req.params.id)}));
  project.post('/reviews/:id/answers',write,async(req,res)=>res.json({review:await ledger.answerReview(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/reviews/:id/decision',review,async(req,res)=>res.json({review:await ledger.decideReview(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/reviews/:id/publish',review,async(req,res)=>res.json({baseline:await ledger.publishReview(req.params.p,req.params.id,req.user.id,req.body)}));
  project.post('/jobs/:id/retry',write,async(req,res)=>res.json({job:await ledger.retryJob(req.params.p,req.params.id,req.user.id,req.body,req.projectRole)}));
  project.get('/feed',async(req,res)=>res.json({feed:await ledger.feed(req.params.p)}));
  app.use('/api/projects/:p',project);
  app.use('/api',(_req,_res,next)=>next(error('NOT_FOUND','요청을 찾을 수 없습니다.',404)));
  app.use('/dashboard',createDashboardRouter(path.join(staticDir,'dashboard'),{production}));
  app.use(express.static(staticDir,{index:false,maxAge:production?'1h':0}));
  app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:staticDir}));
  app.use((err,req,res,_next)=>{
    const mapped = err instanceof multer.MulterError ? error(err.code,'파일은 최대 20 MiB이며 한 번에 하나만 등록할 수 있습니다.',413)
      : err.type==='entity.too.large' ? error('BODY_TOO_LARGE','요청 크기가 제한을 초과했습니다.',413)
      : err.type==='entity.parse.failed' ? error('INVALID_JSON','JSON 형식을 확인해 주세요.')
      : err.code==='22P02' ? error('INVALID_ID','식별자 형식을 확인해 주세요.') : err;
    const status=Number.isInteger(mapped.status)&&mapped.status>=400&&mapped.status<600?mapped.status:500;
    if(status>=500) console.error(JSON.stringify({event:'request_failed',requestId:res.get('X-Request-ID'),code:/^[A-Z0-9_]+$/.test(mapped.code||'')?mapped.code:'INTERNAL_ERROR'}));
    res.status(status).json({error:{code:status===500?'INTERNAL_ERROR':mapped.code||'REQUEST_FAILED',message:status===500?'처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.':mapped.message}});
  });
  return app;
}
module.exports={createApp};

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createPool, migrate, transaction } = require('./db');
const { provisionUser } = require('./auth');
const { createApp } = require('./server');
const { createWorker } = require('./worker');
const { createChannelWorker } = require('./channel-worker');
const { createImplementationWorker } = require('./implementation-worker');
const { createCommercialWorker } = require('./commercial-worker');
const { createContextAIWorker } = require('./context-ai-worker');
const { createImplementationRunner } = require('./implementation-runner');
const { googleConfig } = require('./google-auth');
const {createProviderSettings}=require('./provider-settings');
const {createIntegrationWorker}=require('./integration-worker');
const {startTranscriptionWorker}=require('./transcription-worker');
const {createSemanticService}=require('./semantic-service');
const {startSemanticWorker}=require('./semantic-worker');
const {startInsightWorker}=require('./insights');
const {createWorkAIWorker}=require('./work-ai-worker');
const {startQuestionWorker}=require('./question-ledger');
const {createNoraOAuth}=require('./nora-oauth');
const {createNoraMcpProvider}=require('./nora-mcp');
const {createProjectNoraWorker}=require('./project-nora-worker');
const {createNoraGitHub}=require('./nora-github');
const {createNoraTaskProvider}=require('./nora-task-provider');
const {createTaskAutomationWorker}=require('./task-automation-worker');

function token(name, filename, production) {
  if (process.env[name]) return process.env[name];
  // Nora-bound projects use per-project OAuth. Legacy jobs report their own
  // missing credentials; they must not prevent OAuth-only installations booting.
  if (production) return undefined;
  const file = path.resolve(__dirname, '../../nora/.secrets', filename);
  if (!fs.existsSync(file)) return undefined;
  if ((fs.statSync(file).mode & 0o077) !== 0) throw new Error('INSECURE_LOCAL_TOKEN_FILE');
  const parsed = JSON.parse(fs.readFileSync(file,'utf8'));
  if (typeof parsed.token !== 'string' || !parsed.token) throw new Error('INVALID_LOCAL_TOKEN_FILE');
  return parsed.token;
}
async function bootstrap(pool) {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) return;
  if (!process.env.BOOTSTRAP_ADMIN_PASSWORD) throw new Error('BOOTSTRAP_PASSWORD_REQUIRED');
  let user = (await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0];
  if (!user) {
    try { user=await provisionUser(pool,{email,name:process.env.BOOTSTRAP_ADMIN_NAME||'AINS 관리자',password:process.env.BOOTSTRAP_ADMIN_PASSWORD}); }
    catch (err) { if(err.code!=='USER_EXISTS') throw err; user=(await pool.query('SELECT id FROM users WHERE email=$1',[email])).rows[0]; }
  }
  await transaction(pool,async db=>{
    // Create this default workspace once; never grant an existing project to a changed bootstrap identity.
    const inserted=await db.query("INSERT INTO projects(id,name) VALUES('ains-sism','AINS SI·SM') ON CONFLICT(id) DO NOTHING RETURNING id");
    if(inserted.rowCount) await db.query("INSERT INTO memberships(project_id,user_id,role) VALUES('ains-sism',$1,'owner')",[user.id]);
  });
}
async function main() {
  const production=process.env.NODE_ENV==='production', port=Number(process.env.PORT||3100);
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');
  if(production&&!process.env.APP_ORIGIN) throw new Error('APP_ORIGIN_REQUIRED');
  const appOrigin=process.env.APP_ORIGIN||`http://127.0.0.1:${port}`;
  if(production&&new URL(appOrigin).protocol!=='https:') throw new Error('HTTPS_ORIGIN_REQUIRED');
  const google = googleConfig({clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,signupDomains:process.env.GOOGLE_SIGNUP_ALLOWED_DOMAINS});
  const pipelineToken=token('NORA_PIPELINE_TOKEN','pipeline-secret.json',production),flowToken=token('NORA_FLOW_TOKEN','flow-secret.json',production);
  const pool=createPool();
  pool.on('error',()=>console.error(JSON.stringify({event:'database_connection_error'})));
  await migrate(pool); await bootstrap(pool);
  const noraOAuth=createNoraOAuth({pool,redirectUri:new URL('/api/nora/oauth/callback',appOrigin).href});
  const noraProvider=createNoraMcpProvider({oauth:noraOAuth});
  const noraGit=createNoraGitHub({pool,provider:noraProvider});
  const noraTasks=createNoraTaskProvider({pool,provider:createNoraMcpProvider({oauth:noraOAuth,timeoutMs:300000}),git:noraGit});
  const taskAutomationWorker=createTaskAutomationWorker({pool,provider:noraTasks,onError:()=>console.error(JSON.stringify({event:'task_automation_worker_error'}))});
  const noraWorker=createProjectNoraWorker({pool,provider:noraProvider,onError:()=>console.error(JSON.stringify({event:'nora_workspace_worker_error'}))});
  const providerSettings=createProviderSettings(pool),resolveConfig=p=>providerSettings.getConfig(p);
  let contextToken=process.env.NORA_CONTEXT_TOKEN, contextWebhookSecret=process.env.NORA_CONTEXT_WEBHOOK_SECRET;
  if(!production){const file=path.resolve(__dirname,'../../nora/.secrets/context-secret.json');if(fs.existsSync(file)&&(fs.statSync(file).mode&0o077)===0){const local=JSON.parse(fs.readFileSync(file,'utf8'));contextToken ||= local.token;contextWebhookSecret ||= local.webhookSecret;}}
  const contextAI={enabled:Boolean(contextToken&&contextWebhookSecret?.length>=32),webhookSecret:contextWebhookSecret};
  let workToken=process.env.NORA_WORK_REVIEW_TOKEN,workWebhookSecret=process.env.NORA_WORK_WEBHOOK_SECRET;
  if(!production){const file=path.resolve(__dirname,'../../nora/.secrets/work-review-secret.json');if(fs.existsSync(file)&&(fs.statSync(file).mode&0o077)===0){const local=JSON.parse(fs.readFileSync(file,'utf8'));workToken ||= local.token;workWebhookSecret ||= local.webhookSecret;}}
  const workAI={enabled:Boolean(workToken&&workWebhookSecret?.length>=32),webhookSecret:workWebhookSecret};
  const app=createApp({pool,appOrigin,production,google:google||{},contextAI,workAI,nora:{oauth:noraOAuth,provider:noraProvider,git:noraGit,tasks:noraTasks},repositoryAccess:{noraGit}});
  const workAIWorker=createWorkAIWorker({pool,token:workToken,enabled:workAI.enabled,onError:()=>console.error(JSON.stringify({event:'work_ai_error'}))});
  const contextWorker=createContextAIWorker({pool,token:contextToken,enabled:contextAI.enabled,onError:()=>console.error(JSON.stringify({event:'context_worker_error'}))});
  const worker=createWorker({pool,pipelineToken,flowToken,python:process.env.PYTHON_BIN||'python3',onError:()=>console.error(JSON.stringify({event:'worker_error'}))});
  let channelToken=process.env.NORA_CHANNEL_TRIAGE_TOKEN;
  if(!channelToken&&!production) {
    const file=path.resolve(__dirname,'../../nora/.secrets/channel-triage-secret.json');
    if(fs.existsSync(file)&&(fs.statSync(file).mode & 0o077)===0)channelToken=JSON.parse(fs.readFileSync(file,'utf8')).token;
  }
  const channelWorker=createChannelWorker({pool,token:channelToken,onError:()=>console.error(JSON.stringify({event:'channel_worker_error'}))});
  let implementationToken=process.env.NORA_IMPLEMENTATION_TOKEN;
  if(!implementationToken&&!production){
    const file=path.resolve(__dirname,'../../nora/.secrets/implementation-secret.json');
    if(fs.existsSync(file)&&(fs.statSync(file).mode & 0o077)===0)implementationToken=JSON.parse(fs.readFileSync(file,'utf8')).token;
  }
  const implementationWorker=createImplementationWorker({pool,token:implementationToken,onError:()=>console.error(JSON.stringify({event:'implementation_worker_error'}))});
  let commercialToken=process.env.NORA_COMMERCIAL_TOKEN;
  if(!commercialToken&&!production){
    const file=path.resolve(__dirname,'../../nora/.secrets/commercial-secret.json');
    if(fs.existsSync(file)&&(fs.statSync(file).mode & 0o077)===0)commercialToken=JSON.parse(fs.readFileSync(file,'utf8')).token;
  }
  const commercialWorker=createCommercialWorker({pool,token:commercialToken,onError:()=>console.error(JSON.stringify({event:'commercial_worker_error'}))});
  const implementationRunner=createImplementationRunner({pool,appOrigin});
  const server=app.listen(port,'0.0.0.0',()=>console.log(JSON.stringify({event:'listening',port})));
  server.requestTimeout=60000; server.headersTimeout=20000;
  await worker.start();
  await channelWorker.start();
  await implementationWorker.start();
  await commercialWorker.start();
  await contextWorker.start();
  await workAIWorker.start();
  await noraWorker.start();
  await taskAutomationWorker.start();
  const questionWorker=startQuestionWorker({pool,onError:()=>console.error(JSON.stringify({event:'question_worker_error'}))});
  const integrationWorker=createIntegrationWorker({pool,onError:()=>console.error(JSON.stringify({event:'integration_worker_error'}))});await integrationWorker.start();
  const transcriptionWorker=startTranscriptionWorker({pool,resolveConfig,onError:()=>console.error(JSON.stringify({event:'transcription_worker_error'}))});
  const semanticWorker=startSemanticWorker(createSemanticService(pool,{resolveConfig}),{onError:()=>console.error(JSON.stringify({event:'semantic_worker_error'}))});
  const insightWorker=startInsightWorker({pool,onError:()=>console.error(JSON.stringify({event:'insight_worker_error'}))});
  await implementationRunner.recoverExpired();
  const runnerRecovery=setInterval(()=>implementationRunner.recoverExpired().catch(()=>console.error(JSON.stringify({event:'runner_recovery_error'}))),30000);runnerRecovery.unref();
  const maintenance=setInterval(()=>Promise.all([
    pool.query('DELETE FROM sessions WHERE expires_at<now()'),
    pool.query('DELETE FROM google_oauth_attempts WHERE expires_at<now()'),
    pool.query('DELETE FROM project_nora_oauth_states WHERE expires_at<now()'),
    pool.query('DELETE FROM auth_attempts WHERE expires_at<now()'),
  ]).catch(()=>{}),3600000); maintenance.unref();
  let closing=false;
  async function stop() {
    if(closing)return; closing=true; clearInterval(maintenance);clearInterval(runnerRecovery);
    const timeout=setTimeout(()=>process.exit(1),280000);timeout.unref();
    await Promise.all([new Promise(resolve=>server.close(resolve)),worker.stop(),channelWorker.stop(),implementationWorker.stop(),commercialWorker.stop(),contextWorker.stop(),integrationWorker.stop(),transcriptionWorker.stop(),semanticWorker.stop(),insightWorker.stop(),workAIWorker.stop(),questionWorker.stop(),noraWorker.stop(),taskAutomationWorker.stop()]);
    await pool.end();clearTimeout(timeout);process.exit(0);
  }
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(require.main===module) main().catch(err=>{console.error(JSON.stringify({event:'startup_failed',code:/^[A-Z_]+$/.test(err.message)?err.message:'STARTUP_FAILED'}));process.exit(1);});
module.exports={main,bootstrap};

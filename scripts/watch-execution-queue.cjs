'use strict';
// Run on an operator-controlled machine. The queue contains only explicitly approved requests.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
function fail(code){throw Object.assign(Error(code),{code});}
function readConfig(file,origin){const full=path.resolve(file),stat=fs.lstatSync(full);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>10000)fail('INVALID_AGENT_CONFIG');fs.chmodSync(full,0o600);const c=JSON.parse(fs.readFileSync(full,'utf8'));if(c.schema_version!=='1.0'||!/^ains_queue_[a-f0-9]{64}$/.test(c.token||'')||!Number.isFinite(Date.parse(c.expires_at))||Date.parse(c.expires_at)<=Date.now()||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(c.project_id||''))fail('INVALID_AGENT_CONFIG');const u=new URL(origin);if(c.url!==origin||origin!==u.origin||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))fail('INVALID_AGENT_ORIGIN');return c;}
async function runTicket(ticket,origin,runner,{signal}={}){
 if(signal?.aborted)fail('EXECUTION_AGENT_STOPPED');
 const dir=await fsp.mkdtemp(path.join(os.tmpdir(),'ains-queue-ticket-'));await fsp.chmod(dir,0o700);const file=path.join(dir,'ticket.json');await fsp.writeFile(file,JSON.stringify(ticket),{mode:0o600});
 try{return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[runner,'--ticket',file,'--origin',origin],{stdio:'inherit'});let killTimer;
  // The one-shot runner handles SIGTERM by aborting its detached command group,
  // retaining local evidence, and reporting an interrupted result to the platform.
  const stop=()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),45000);killTimer.unref();};
  const cleanup=()=>{clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
  child.on('error',()=>{cleanup();reject(Object.assign(Error('RUNNER_START_FAILED'),{code:'RUNNER_START_FAILED'}));});
  child.on('close',code=>{cleanup();resolve(signal?.aborted?1:code);});
  if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
 });}finally{await fsp.rm(dir,{recursive:true,force:true});}
}
function waitForDelay(ms,signal){if(signal.aborted)return Promise.resolve();return new Promise(resolve=>{const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});});}
async function main(argv=process.argv.slice(2)){
 const args=new Map();for(let i=0;i<argv.length;i+=2){if(!['--config','--origin','--runner'].includes(argv[i])||!argv[i+1])fail('USAGE_CONFIG_ORIGIN_RUNNER');args.set(argv[i],argv[i+1]);}if(!args.has('--config'))fail('CONFIG_REQUIRED');const origin=args.get('--origin')||'https://ains-workspace-production.up.railway.app',config=readConfig(args.get('--config'),origin),runner=path.resolve(args.get('--runner')||path.join(__dirname,fs.existsSync(path.join(__dirname,'ains-implementation-runner.cjs'))?'ains-implementation-runner.cjs':'run-implementation.js'));
 if(!fs.statSync(runner).isFile())fail('RUNNER_FILE_REQUIRED');const abort=new AbortController();let stopped=false;const stop=()=>{stopped=true;abort.abort();};process.once('SIGINT',stop);process.once('SIGTERM',stop);console.log(JSON.stringify({status:'watching_approved_queue',project_id:config.project_id}));
 try{while(!stopped){let delay=30000;try{
  const response=await fetch(`${origin}/api/execution-agent/${encodeURIComponent(config.project_id)}/poll`,{method:'POST',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(20000),abort.signal]),headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:'{}'});const data=await response.json();
  if(!response.ok){if([401,403].includes(response.status))fail('AGENT_AUTH_EXPIRED');console.error(JSON.stringify({status:'poll_failed',code:data.error?.code||'QUEUE_HTTP_FAILED'}));delay=60000;}
  else if(data.ticket){console.log(JSON.stringify({status:'approved_request_received',request_id:data.ticket.request_id}));const code=await runTicket(data.ticket,origin,runner,{signal:abort.signal});console.log(JSON.stringify({status:code===0?'request_finished':'request_needs_review',request_id:data.ticket.request_id}));}
  else if(data.blocked?.length)console.log(JSON.stringify({status:'requests_blocked',requests:data.blocked}));
 }catch(e){if(e.code==='AGENT_AUTH_EXPIRED')throw e;if(!stopped)console.error(JSON.stringify({status:'poll_unconfirmed',code:e.code==='RUNNER_START_FAILED'?e.code:'CHECK_PLATFORM_BEFORE_RETRY'}));delay=60000;}
 if(!stopped)await waitForDelay(delay,abort.signal);
 }}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({code:/^[A-Z0-9_]+$/.test(e.code||'')?e.code:'QUEUE_AGENT_FAILED'}));process.exitCode=1;});
module.exports={readConfig,runTicket,waitForDelay};

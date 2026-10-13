'use strict';
function startSemanticWorker(service,{intervalMs=15000,onError=()=>{}}={}) {
 let stopped=false,running=null,timer;
 const tick=()=>{if(stopped||running)return;running=service.workerTick().catch(e=>onError({code:e.code||'SEMANTIC_WORKER_ERROR'})).finally(()=>{running=null;});};
 timer=setInterval(tick,Math.max(1000,intervalMs));timer.unref?.();tick();
 return {tick,async stop(){stopped=true;clearInterval(timer);if(running)await running;}};
}
module.exports={startSemanticWorker};

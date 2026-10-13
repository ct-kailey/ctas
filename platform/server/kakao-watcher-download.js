'use strict';
const fs=require('node:fs');
const path=require('node:path');
// Bundle only trusted server source. No request input or credential is embedded in the download.
function kakaoWatcherScript(){
 const script=fs.readFileSync(path.resolve(__dirname,'../../scripts/watch-kakao-export.cjs'),'utf8');
 const parser=fs.readFileSync(path.resolve(__dirname,'integration-kakao.js'),'utf8');
 const dependency="const {parseKakaoExport}=require('../platform/server/integration-kakao');";
 const importLine="const {hash,fail}=require('./integration-contract');";
 if(!script.includes(dependency)||!parser.includes(importLine)||!parser.includes('module.exports={parseKakaoExport};'))throw new Error('WATCHER_BUNDLE_INVALID');
 const body=parser.replace(importLine,"const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');function fail(code,message,status=400){throw Object.assign(new Error(message),{code,status});}").replace('module.exports={parseKakaoExport};','return {parseKakaoExport};');
 return script.replace(dependency,`const {parseKakaoExport}=(()=>{\n${body}\n})();`);
}
module.exports={kakaoWatcherScript};

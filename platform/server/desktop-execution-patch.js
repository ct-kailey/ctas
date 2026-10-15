'use strict';
// The native runner invokes Git with core.quotePath=true and --no-renames.
// Match that exact representation against the bounded claimed file list instead
// of splitting headers on spaces (valid Next.js and Unicode paths contain them).
function safeDesktopPath(value){
 if(typeof value!=='string'||!value||Buffer.byteLength(value)>500||!value.isWellFormed()||value.startsWith('/')||/[\\\p{Cc}]/u.test(value))return false;
 return !value.split('/').some(part=>{const p=part.toLowerCase();return !part||part==='.'||part==='..'||['.git','.codex','.claude','.ssh','.aws','.gnupg','.mcp.json','.netrc','auth.json','id_rsa','id_ed25519'].includes(p)||p==='.env'||p.startsWith('.env.')&&!['.env.example','.env.sample','.env.template'].includes(p)||p.startsWith('credentials')||p.endsWith('.pem')||p.endsWith('.key');});
}
function gitQuotedPath(path){
 const bytes=Buffer.from(path);if(!bytes.some(b=>b<32||b>=127||b===34||b===92))return path;
 let value='"';for(const b of bytes)value+=b===34?'\\"':b===92?'\\\\':b<32||b>=127?'\\'+b.toString(8).padStart(3,'0'):String.fromCharCode(b);return value+'"';
}
function safeDesktopPatch(patch,files){
 if(typeof patch!=='string'||!patch||Buffer.byteLength(patch)>512000||!patch.isWellFormed()||patch.includes('\0')||!Array.isArray(files)||!files.length||files.length>100||files.some(f=>!safeDesktopPath(f))||new Set(files).size!==files.length)return false;
 const expected=new Map(files.map(f=>[`diff --git ${gitQuotedPath('a/'+f)} ${gitQuotedPath('b/'+f)}`,f]));
 const found=new Set();let current=null,oldLeft=0,newLeft=0,inHunk=false,changed=false,oldHeader=false,newHeader=false,previousContent=false;
 const complete=()=>!current||oldLeft===0&&newLeft===0&&changed;
 for(const line of patch.split('\n')){
  if(line.startsWith('diff --git ')){
   if(!complete()||!expected.has(line)||found.has(expected.get(line)))return false;
   current=expected.get(line);found.add(current);oldLeft=0;newLeft=0;inHunk=false;changed=false;oldHeader=false;newHeader=false;previousContent=false;continue;
  }
  if(!current)return false;
  if(line.startsWith('@@ ')){
   if(oldLeft||newLeft||!oldHeader||!newHeader)return false;
   const m=/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:.*)$/.exec(line);if(!m)return false;
   oldLeft=Number(m[2]??1);newLeft=Number(m[4]??1);if(!Number.isSafeInteger(oldLeft)||!Number.isSafeInteger(newLeft)||oldLeft+newLeft>1000000)return false;
   inHunk=true;previousContent=false;continue;
  }
  if(inHunk){
   if(line==='\\ No newline at end of file'){if(!previousContent)return false;previousContent=false;continue;}
   if(oldLeft||newLeft){
    if(line.startsWith(' ')){oldLeft--;newLeft--;}else if(line.startsWith('-')){oldLeft--;changed=true;}else if(line.startsWith('+')){newLeft--;changed=true;}else return false;
    if(oldLeft<0||newLeft<0)return false;previousContent=true;continue;
   }
   if(line==='')continue;
   return false;
  }
  if(line.startsWith('--- ')){if(oldHeader)return false;const v=line.slice(4).replace(/\t$/,'');if(![gitQuotedPath('a/'+current),'/dev/null'].includes(v))return false;oldHeader=true;continue;}
  if(line.startsWith('+++ ')){if(newHeader||!oldHeader)return false;const v=line.slice(4).replace(/\t$/,'');if(![gitQuotedPath('b/'+current),'/dev/null'].includes(v))return false;newHeader=true;continue;}
  if(/^(new file mode|deleted file mode|old mode|new mode) (100644|100755)$/.test(line)){changed=true;continue;}
  if(/^index [a-f0-9]{7,64}\.\.[a-f0-9]{7,64}( (100644|100755))?$/.test(line)||line==='')continue;
  return false;
 }
 return complete()&&found.size===files.length;
}
module.exports={safeDesktopPath,gitQuotedPath,safeDesktopPatch};

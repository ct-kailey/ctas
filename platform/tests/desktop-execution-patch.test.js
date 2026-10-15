'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {safeDesktopPatch,safeDesktopPath,gitQuotedPath}=require('../server/desktop-execution-patch');
test('desktop patch validation matches actual Git Next.js, spaces and quoted UTF-8 paths without weakening legacy runner',t=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'ctas-desktop-patch-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const git=(...args)=>execFileSync('git',['--no-pager','-c','core.hooksPath=/dev/null','-c','core.quotePath=true',...args],{cwd,encoding:'utf8',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'}});
 git('init','-q');git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','--allow-empty','-qm','Fixture');
 const files=['app/(dashboard)/[id]/page.tsx','자료/정책 문서.md','docs/a "quoted" file.txt','.env.example','empty.txt'];
 for(const file of files){fs.mkdirSync(path.dirname(path.join(cwd,file)),{recursive:true});fs.writeFileSync(path.join(cwd,file),file==='empty.txt'?'':'fixture content\n');}
 git('add','-N','--',...files);const patch=git('diff','--no-ext-diff','--no-textconv','--no-renames','HEAD','--');assert.equal(safeDesktopPatch(patch,files),true,patch);
 assert.equal(safeDesktopPatch(patch,files.slice(1)),false);assert.equal(safeDesktopPatch(patch,[...files,files[0]]),false);
 assert.equal(safeDesktopPatch(patch.replace('+++ b/app/(dashboard)/[id]/page.tsx','+++ b/other.tsx'),files),false);
 assert.equal(require('../server/implementation-runner').safePatch(patch,files),false,'existing unrelated runner contract stays unchanged');
 git('add','--',...files);git('-c','user.name=Fixture','-c','user.email=fixture@example.test','commit','-qm','Before');
 fs.writeFileSync(path.join(cwd,files[0]),'updated\nsecond line without newline');fs.unlinkSync(path.join(cwd,files[1]));fs.chmodSync(path.join(cwd,files[2]),0o755);
 const changed=[files[0],files[1],files[2]];const after=git('diff','--no-ext-diff','--no-textconv','--no-renames','HEAD','--');assert.equal(safeDesktopPatch(after,changed),true,after);
});
test('desktop patch parser rejects unsafe paths, symlinks, submodules, binary, traversal, malformed hunks and mismatched file claims',()=>{
 for(const file of ['../file','/root/file','a/../b','.git/config','.CODEX/config.toml','.env','.env.production','nested/auth.json','nested/credentials.json','id_rsa','certificate.pem','a\\b','a\nb'])assert.equal(safeDesktopPath(file),false,file);
 for(const file of ['app/[...slug]/page.tsx','자료/파일.md','.env.example','.env.sample','.env.template'])assert.equal(safeDesktopPath(file),true,file);
 assert.equal(gitQuotedPath('a/한글.txt'),'"a/\\355\\225\\234\\352\\270\\200.txt"');
 const valid='diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1 @@\n+hello\n';assert.equal(safeDesktopPatch(valid,['a.txt']),true);
 for(const patch of [valid.replace('100644','120000'),valid.replace('100644','160000'),valid.replace('+1 @@','+1,3 @@'),valid.replace('b/a.txt\n@@','b/other.txt\n@@'),valid+'diff --git a/a.txt b/a.txt\n',valid.replace('@@ -0,0 +1 @@\n+hello','GIT binary patch'),valid.replace('@@ -0,0 +1 @@\n+hello','rename from x\nrename to a.txt'),valid.replace('+hello','?hello'),valid.replace('+hello','+hello\n+extra')])assert.equal(safeDesktopPatch(patch,['a.txt']),false,patch);
});

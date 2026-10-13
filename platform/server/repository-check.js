'use strict';

function repositoryCoordinates(value) {
  if (typeof value !== 'string') throw Object.assign(Error('GitHub 저장소 주소를 입력하세요.'), {code:'INVALID_REPOSITORY',status:400});
  const match=/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(value);
  if (!match || ['.','..'].includes(match[2])) throw Object.assign(Error('인증 정보가 없는 GitHub HTTPS 저장소 주소를 입력하세요.'), {code:'INVALID_REPOSITORY',status:400});
  return {owner:match[1],repo:match[2],url:`https://github.com/${match[1]}/${match[2]}.git`};
}

// Fixed origin, no redirects and no user-supplied headers: this is not a general URL proxy.
async function checkRepository(settings,{fetchImpl=fetch,token=process.env.GITHUB_READ_TOKEN}={}) {
  const {owner,repo}=repositoryCoordinates(settings.repository_url);
  const branch=settings.base_branch;
  if(typeof branch!=='string'||!branch||branch.length>200) throw Object.assign(Error('기준 브랜치를 입력하세요.'),{code:'INVALID_BRANCH',status:400});
  const result={status:'inaccessible',head_sha:null,checked_at:new Date().toISOString()};
  const root=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const options={headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AINS-Repository-Check',...(token?{Authorization:`Bearer ${token}`}:{})},redirect:'error',signal:AbortSignal.timeout(10000)};
  try {
    const response=await fetchImpl(root,options);
    if(!response.ok)return result;
    const metadata=await response.json();
    if(metadata.archived||metadata.disabled)return result;
    const commit=await fetchImpl(`${root}/commits/${encodeURIComponent(branch)}`,options);
    if(commit.status===409)return {...result,status:'empty'};
    if(commit.status===404)return {...result,status:'branch_missing'};
    if(!commit.ok)return result;
    const data=await commit.json();
    return /^[0-9a-f]{40}$/.test(data.sha||'')?{...result,status:'ready',head_sha:data.sha}:result;
  } catch { return result; }
}

module.exports={repositoryCoordinates,checkRepository};

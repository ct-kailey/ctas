'use strict';

function repositoryCoordinates(value) {
  if (typeof value !== 'string') throw Object.assign(Error('GitHub 저장소 주소를 입력하세요.'), {code:'INVALID_REPOSITORY',status:400});
  const match=/^https:\/\/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9_.-]{1,100}?)(?:\.git)?\/?$/.exec(value);
  if (!match || ['.','..'].includes(match[2])) throw Object.assign(Error('인증 정보가 없는 GitHub HTTPS 저장소 주소를 입력하세요.'), {code:'INVALID_REPOSITORY',status:400});
  return {owner:match[1],repo:match[2],url:`https://github.com/${match[1]}/${match[2]}.git`};
}

const REASON_CODES = new Set(['AUTH_REQUIRED_OR_NOT_FOUND','AUTH_INVALID','ACCESS_DENIED','RATE_LIMITED','REPOSITORY_UNAVAILABLE','BRANCH_MISSING','EMPTY_REPOSITORY','REPOSITORY_ARCHIVED','NETWORK_ERROR','INVALID_RESPONSE']);
function failureReason(response, authenticated) {
  if (response.status === 401) return 'AUTH_INVALID';
  if (response.status === 429 || response.status === 403 && (response.headers?.get?.('x-ratelimit-remaining') === '0' || response.headers?.get?.('retry-after'))) return 'RATE_LIMITED';
  if (response.status === 403) return 'ACCESS_DENIED';
  // GitHub deliberately masks private repositories with 404. Do not claim they do not exist.
  if (response.status === 404) return authenticated ? 'ACCESS_DENIED' : 'AUTH_REQUIRED_OR_NOT_FOUND';
  return 'REPOSITORY_UNAVAILABLE';
}
// Fixed origin, no redirects and no user-supplied headers: this is not a general URL proxy.
async function checkRepository(settings,{fetchImpl=fetch,token=process.env.GITHUB_READ_TOKEN}={}) {
  const {owner,repo}=repositoryCoordinates(settings.repository_url);
  const branch=settings.base_branch;
  if(typeof branch!=='string'||!branch||branch.length>200) throw Object.assign(Error('기준 브랜치를 입력하세요.'),{code:'INVALID_BRANCH',status:400});
  const result={status:'inaccessible',head_sha:null,checked_at:new Date().toISOString(),reason_code:null};
  const root=`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const options={headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'AINS-Repository-Check',...(token?{Authorization:`Bearer ${token}`}:{})},redirect:'error',signal:AbortSignal.timeout(10000)};
  try {
    const response=await fetchImpl(root,options);
    if(!response.ok)return {...result,reason_code:failureReason(response,Boolean(token))};
    const metadata=await response.json();
    if(metadata.archived||metadata.disabled)return {...result,reason_code:'REPOSITORY_ARCHIVED'};
    // The commits endpoint also accepts tags and would incorrectly validate a missing branch.
    const commit=await fetchImpl(`${root}/branches/${encodeURIComponent(branch)}`,options);
    if(commit.status===409)return {...result,status:'empty',reason_code:'EMPTY_REPOSITORY'};
    if(commit.status===404){
      // GitHub reports repository size in approximate kilobytes: zero alone does not prove emptiness.
      if(metadata.size===0){
        const history=await fetchImpl(`${root}/commits?per_page=1`,options);
        if(history.status===409)return {...result,status:'empty',reason_code:'EMPTY_REPOSITORY'};
      }
      return {...result,status:'branch_missing',reason_code:'BRANCH_MISSING'};
    }
    if(!commit.ok)return {...result,reason_code:failureReason(commit,Boolean(token))};
    const data=await commit.json();
    return /^[0-9a-f]{40}$/.test(data.commit?.sha||'')?{...result,status:'ready',head_sha:data.commit.sha}:{...result,reason_code:'INVALID_RESPONSE'};
  } catch { return {...result,reason_code:'NETWORK_ERROR'}; }
}

module.exports={repositoryCoordinates,checkRepository,REASON_CODES};

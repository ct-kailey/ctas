'use strict';
const { createHash } = require('node:crypto');
const { transaction } = require('./db');
const { membership } = require('./context-ledger');
const { fail, object } = require('./context-contract');
const vault = require('./integration-contract');
const { repositoryCoordinates, checkRepository } = require('./repository-check');
const { readRepositoryCredential } = require('./github-delivery');

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify([value.source, value.version, value.token])).digest('hex');
}
async function lockOwner(db, projectId, userId) {
  const current = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE', [projectId, userId])).rows[0];
  if (current?.role !== 'owner') fail('FORBIDDEN', '프로젝트 관리자만 저장소 연결을 변경하거나 확인할 수 있습니다.', 403);
}
function createRepositoryAccess(pool, {
  encryptionKey = process.env.AINS_CREDENTIAL_ENCRYPTION_KEY || process.env.INTEGRATION_ENCRYPTION_KEY,
  deliveryEncryptionKey = process.env.AINS_CREDENTIAL_ENCRYPTION_KEY,
  serverToken = process.env.GITHUB_READ_TOKEN,
  fetchImpl = fetch,
  implementation,
  noraGit,
} = {}) {
  let canStore = false;
  try { vault.key(encryptionKey); canStore = true; } catch { /* Status reports missing vault configuration without returning a secret. */ }
  const row = async (db, p) => (await db.query('SELECT * FROM project_repository_access WHERE project_id=$1', [p])).rows[0];
  const aad = (p, repo) => `ains:repository-read:${p}:${repo}`;
  async function credential(db, p, settings) {
    const nora=await require('./project-nora').binding(db,p);
    if(nora)return {source:'nora',token:null,version:nora.version};
    if (!settings.repository_url) return { source: 'anonymous', token: null, version: 0 };
    const repo = repositoryCoordinates(settings.repository_url).url;
    const saved = await row(db, p);
    if (saved?.secret_ciphertext && saved.repository_url === repo) {
      const value = vault.unseal(saved.secret_ciphertext, aad(p, repo), encryptionKey);
      if (typeof value.access_token !== 'string' || !/^\S{20,500}$/.test(value.access_token)) fail('REPOSITORY_CREDENTIAL_INVALID', '저장소 읽기 토큰을 다시 저장해 주세요.', 503);
      return { source: 'project', token: value.access_token, version: saved.version };
    }
    const delivery = await readRepositoryCredential(db, p, repo, { encryptionKey: deliveryEncryptionKey });
    if (delivery) return { source: 'github_delivery', token: delivery.token, version: delivery.version };
    return serverToken ? { source: 'server', token: serverToken, version: 0 } : { source: 'anonymous', token: null, version: 0 };
  }
  async function publicStatus(db, p) {
    const settings = (await db.query('SELECT repository_url,version FROM project_settings WHERE project_id=$1', [p])).rows[0];
    const saved = await row(db, p);
    let source = 'anonymous', credentialError = null;
    try { source = (await credential(db, p, settings)).source; }
    catch (error) { credentialError = ['GITHUB_VAULT_UNAVAILABLE','GITHUB_CREDENTIAL_UNAVAILABLE','INTEGRATION_KEY_UNAVAILABLE','INTEGRATION_CREDENTIAL_INVALID','REPOSITORY_CREDENTIAL_INVALID'].includes(error.code) ? error.code : 'REPOSITORY_CREDENTIAL_INVALID'; }
    return {
      repository_url: settings.repository_url,
      settings_version: Number(settings.version),
      version: saved?.version || 0,
      credential_source: source,
      credential_error: credentialError,
      has_project_token: Boolean(saved?.secret_ciphertext),
      repository_matches: !saved?.secret_ciphertext || saved.repository_url === settings.repository_url,
      can_store_credentials: source!=='nora'&&canStore,
      updated_at: saved?.updated_at || null,
    };
  }
  return {
    async status(p, u) { await membership(pool, p, u); return publicStatus(pool, p); },
    async save(p, u, body) {
      object(body, ['expected_version','expected_settings_version','token','remove_token']);
      if (!Number.isSafeInteger(body.expected_version) || body.expected_version < 0 || !Number.isSafeInteger(body.expected_settings_version) || body.expected_settings_version < 1 || body.remove_token !== undefined && typeof body.remove_token !== 'boolean') fail('INVALID_REPOSITORY_ACCESS', '현재 저장소 연결 버전을 확인해 주세요.');
      const hasToken = body.token !== undefined;
      if (hasToken && (typeof body.token !== 'string' || !/^\S{20,500}$/.test(body.token))) fail('INVALID_REPOSITORY_TOKEN', '공백 없이 올바른 GitHub 토큰을 입력하세요.');
      if (hasToken === Boolean(body.remove_token)) fail('INVALID_REPOSITORY_ACCESS', '읽기 토큰 등록 또는 삭제 중 하나를 선택하세요.');
      if (hasToken && !canStore) fail('REPOSITORY_VAULT_UNAVAILABLE', '서버에 연결 정보 암호화 키를 설정해야 토큰을 저장할 수 있습니다.', 503);
      return transaction(pool, async db => {
        await membership(db, p, u, ['owner']);
        await require('./project-nora').lockProjectDispatch(db,p);
        if(await require('./project-nora').binding(db,p))fail('NORA_GITHUB_CONNECTION_MANAGED','GitHub 인증은 프로젝트의 Nora 워크스페이스에서 관리하세요.',409);
        const settings = (await db.query('SELECT repository_url,version FROM project_settings WHERE project_id=$1 FOR UPDATE', [p])).rows[0];
        await lockOwner(db, p, u);
        if (Number(settings.version) !== body.expected_settings_version) fail('SETTINGS_VERSION_CONFLICT', '대상 저장소가 변경되었습니다. 설정을 다시 불러와 주세요.', 409);
        if (!settings.repository_url) fail('PROJECT_SETTINGS_REQUIRED', '대상 저장소와 기준 브랜치를 먼저 저장하세요.', 409);
        const repo = repositoryCoordinates(settings.repository_url).url;
        const saved = await row(db, p);
        if ((saved?.version || 0) !== body.expected_version) fail('REPOSITORY_ACCESS_CHANGED', '다른 관리자가 연결 정보를 변경했습니다. 다시 불러와 주세요.', 409);
        const ciphertext = hasToken ? vault.seal({ access_token: body.token }, aad(p, repo), encryptionKey) : null;
        await db.query(`INSERT INTO project_repository_access(project_id,repository_url,secret_ciphertext,updated_by) VALUES($1,$2,$3,$4)
          ON CONFLICT(project_id) DO UPDATE SET repository_url=excluded.repository_url,secret_ciphertext=excluded.secret_ciphertext,
          updated_by=excluded.updated_by,version=project_repository_access.version+1,updated_at=now()`, [p, repo, ciphertext, u]);
        await db.query('UPDATE project_settings SET repository_check=NULL,updated_at=now() WHERE project_id=$1', [p]);
        await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$1,$4)', [p, u, 'implementation.repository_access_updated', { repository_url: repo, token_removed: Boolean(body.remove_token) }]);
        return publicStatus(db, p);
      });
    },
    async verify(p, u) {
      await membership(pool, p, u, ['owner']);
      const settings = await implementation.getSettings(p, u);
      if (!settings.repository_url || !settings.base_branch) fail('PROJECT_SETTINGS_REQUIRED', '대상 저장소와 기준 브랜치를 먼저 저장하세요.', 409);
      const access = await credential(pool, p, settings), signature = fingerprint(access);
      if(access.source==='nora'){
        if(!noraGit)fail('NORA_SERVICE_UNAVAILABLE','Nora 연결 서비스를 사용할 수 없습니다.',503);
        const result=await noraGit.verify(p);
        return implementation.recordRepositoryCheck(p,u,settings.version,result.checked,{assertAccess:async(db)=>{
          await lockOwner(db,p,u);const current=await require('./project-nora').binding(db,p);
          if(current?.version!==result.binding.version||current.status!=='ready')fail('NORA_GITHUB_SETTINGS_CHANGED','저장소 확인 중 Nora 연결이 변경되었습니다.',409);
        }});
      }
      // Network reads happen outside a transaction; persist only against the same settings and credentials.
      const checked = { ...await checkRepository(settings, { fetchImpl, token: access.token }), credential_source: access.source };
      return implementation.recordRepositoryCheck(p, u, settings.version, checked, {
        assertAccess: async (db, current) => {
          await lockOwner(db, p, u);
          if (fingerprint(await credential(db, p, current)) !== signature) fail('REPOSITORY_ACCESS_CHANGED', '확인 중 저장소 인증 정보가 변경되었습니다. 다시 확인해 주세요.', 409);
        },
      });
    },
  };
}
function mountRepositoryAccessRoutes(router, { pool, owner, implementation, ...options }) {
  const access = createRepositoryAccess(pool, { ...options, implementation });
  router.get('/settings/repository-access', async (req, res) => res.json({ access: await access.status(req.params.p, req.user.id) }));
  router.put('/settings/repository-access', owner, async (req, res) => res.json({ access: await access.save(req.params.p, req.user.id, req.body) }));
  router.post('/settings/verify-repository', owner, async (req, res) => res.json({ settings: await access.verify(req.params.p, req.user.id) }));
  return access;
}
module.exports = { createRepositoryAccess, mountRepositoryAccessRoutes };

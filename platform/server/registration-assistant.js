'use strict';
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { transaction } = require('./db');
const { recordKind, documentCategory, CATEGORY_RECORD_KINDS } = require('./record-contract');

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function error(code, message, status = 400) { return Object.assign(new Error(message), {code, status}); }
function field(value, name, limit, required = false) {
  if (value === undefined || value === null) { if (!required) return ''; }
  if (typeof value !== 'string' || value.includes('\0') || value.length > limit || (required && !value.trim())) throw error('INVALID_INPUT', `${name} 형식 또는 길이를 확인해 주세요.`);
  return value;
}
function localToken() {
  if (process.env.NORA_REGISTRATION_TOKEN) return process.env.NORA_REGISTRATION_TOKEN;
  if (process.env.NODE_ENV === 'production') return null;
  try {
    const file = path.resolve(__dirname, '../../nora/.secrets/registration-secret.json');
    if ((fs.statSync(file).mode & 0o077) !== 0) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')).token || null;
  } catch { return null; }
}

/** Suggestions are advisory. Only the ordinary record API can persist a user's selection. */
function createRegistrationAssistant({pool, token, invoke, available} = {}) {
  let active = 0;
  const activeUsers = new Set();
  return {
    async suggest(projectId, userId, body) {
      const role = (await pool.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2', [projectId, userId])).rows[0]?.role;
      if (!['owner', 'reviewer', 'member'].includes(role)) throw error('FORBIDDEN', '분류 추천을 요청할 권한이 없습니다.', 403);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['title', 'text', 'filename', 'record_kind', 'document_category', 'domain_id'].includes(k))) throw error('INVALID_INPUT', '분류할 제목과 내용을 입력하세요.');
      const title = field(body.title, '제목', 300, true).trim();
      const text = field(body.text, '본문', 20000);
      const filename = field(body.filename, '파일 이름', 255);
      const category = body.document_category === undefined ? null : documentCategory(body.document_category);
      const kind = recordKind(body.record_kind, category ? CATEGORY_RECORD_KINDS[category] : 'specification');
      const selected = body.domain_id || null;
      if (selected !== null && (typeof selected !== 'string' || !UUID.test(selected))) throw error('INVALID_DOMAIN', '업무 영역을 확인해 주세요.');
      // Lazy loading allows normal records to function while a new Nora publication is pending.
      const client = require('../../nora/client/registration-client');
      const manifest = require('../../nora/registration/manifest.json');
      const secret = token || localToken();
      if (!(available ?? manifest.publication_status === 'published') || (!invoke && !secret)) throw error('REGISTRATION_UNAVAILABLE', 'AI 분류 추천은 Nora 연결 준비 후 사용할 수 있습니다. 업무 영역과 등록 위치를 직접 선택해 등록할 수 있습니다.', 503);
      if (active >= 4 || activeUsers.has(userId)) throw error('REGISTRATION_BUSY', '분류 추천을 처리 중입니다. 잠시 후 다시 시도해 주세요.', 429);
      active++; activeUsers.add(userId);
      let requestId;
      try {
        const [domainRows, documentRows] = await Promise.all([
          pool.query('SELECT id,name,left(description,200) AS description FROM project_domains WHERE project_id=$1 ORDER BY (id=$2::uuid) DESC NULLS LAST,is_default DESC,created_at,id LIMIT 51', [projectId, selected]),
          pool.query(`SELECT d.id,d.domain_id,d.title,d.record_kind,
            left(COALESCE((SELECT string_agg(s.value->>'text', E'\\n') FROM jsonb_array_elements(COALESCE(r.document_json->'segments','[]'::jsonb)) WITH ORDINALITY s(value,n) WHERE n <= 2),''),300) AS excerpt
            FROM documents d LEFT JOIN revisions r ON r.id=d.baseline_revision_id AND r.project_id=d.project_id
            WHERE d.project_id=$1 AND ($2::uuid IS NULL OR d.domain_id=$2::uuid)
              AND ($3::text IS NULL OR d.document_category=$3)
            ORDER BY d.created_at DESC,d.id LIMIT 51`, [projectId, selected, category]),
        ]);
        const domains = domainRows.rows.slice(0,50);
        if (selected && !domains.some(d => d.id === selected)) throw error('INVALID_DOMAIN', '이 프로젝트의 업무 영역을 선택하세요.');
        const domainIds = new Set(domains.map(d => d.id));
        const documents = documentRows.rows.slice(0,50).filter(d => domainIds.has(d.domain_id));
        requestId = randomUUID();
        const request = {schema_version:'1.0', request_id:requestId, project_id:projectId, title, text, record_kind:kind, domains, documents, ...(filename ? {filename} : {}), ...(selected ? {selected_domain_id:selected} : {})};
        client.validateRegistrationRequest(request, projectId);
        const hash = createHash('sha256').update(JSON.stringify(request)).digest('hex');
        // Persist the dispatch intent before any model call; lock only during the short quota check.
        await transaction(pool, async db => {
          await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['registration:'+projectId]);
          const recent = (await db.query("SELECT count(*)::int n FROM registration_requests WHERE project_id=$1 AND created_at>now()-interval '1 hour'", [projectId])).rows[0].n;
          if (recent >= 60) throw error('REGISTRATION_RATE_LIMIT', '이 프로젝트의 시간당 분류 추천 횟수를 초과했습니다. 잠시 후 다시 시도해 주세요.', 429);
          await db.query('INSERT INTO registration_requests(id,project_id,actor_id,input_sha256) VALUES($1,$2,$3,$4)', [requestId, projectId, userId, hash]);
        });
        const result = await (invoke || client.runRegistrationSuggestion)(request, {expectedProjectId:projectId, token:secret, timeoutMs:45000});
        const suggestion = client.validateRegistrationSuggestion(result.suggestion, request, projectId);
        if (!result.traceId || typeof result.traceId !== 'string' || result.traceId.length > 200) throw error('REGISTRATION_RESPONSE_INVALID','분류 추천 실행 이력을 확인하지 못했습니다.',502);
        await transaction(pool, async db => {
          await db.query("UPDATE registration_requests SET status='succeeded',suggestion=$2,trace_id=$3,completed_at=now() WHERE id=$1", [requestId, JSON.stringify(suggestion), result.traceId]);
          await db.query("INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,'registration.suggested',$3,$4)", [projectId,userId,requestId,JSON.stringify({trace_id:result.traceId,input_sha256:hash,action:suggestion.action,domain_id:suggestion.domain_id,document_id:suggestion.document_id})]);
        });
        return {status:'suggested', suggestion, trace_id:result.traceId, request_id:requestId,
          context:{domain_count:domains.length,document_count:documents.length,content_included:!!text.trim()},
          limitations:[...(!text.trim() ? ['본문 없이 제목과 파일 이름을 기준으로 추천했습니다.'] : []), ...(documentRows.rows.length>50||domainRows.rows.length>50 ? ['최근 문서와 업무 영역 일부만 비교했습니다. 후보에 없으면 직접 선택하세요.'] : [])]};
      } catch (err) {
        const code = /^[A-Z0-9_]+$/.test(err.code || '') ? err.code : 'REGISTRATION_FAILED';
        if (requestId) await pool.query("UPDATE registration_requests SET status=$2,error_code=$3,trace_id=$4,completed_at=now() WHERE id=$1 AND status='running'", [requestId, /UNKNOWN|TIMEOUT|HTTP_5\d\d$/.test(code) ? 'uncertain' : 'failed', code, typeof err.traceId === 'string' && err.traceId.length <= 200 ? err.traceId : null]).catch(() => {});
        if (err.status) throw err;
        throw error(code, /UNKNOWN|TIMEOUT|HTTP_5\d\d$/.test(code) ? 'Nora 응답을 확인하지 못했습니다. 자동 재실행하지 않았습니다. 등록 위치를 직접 선택하거나 Nora 실행 이력을 확인해 주세요.' : '분류 추천 결과를 검증하지 못했습니다. 등록 위치를 직접 선택해 주세요.', 502);
      } finally {active--; activeUsers.delete(userId);}
    },
  };
}
module.exports = {createRegistrationAssistant};

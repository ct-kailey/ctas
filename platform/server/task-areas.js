'use strict';
const { transaction } = require('./db');
const { membership } = require('./context-ledger');

const AREAS = ['screen', 'server', 'database'];
const STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'done', 'not_applicable'];
const WRITERS = ['owner', 'reviewer', 'member'];
const FIELDS = ['status', 'description', 'reference', 'assignee_ids'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HISTORY_LIMIT = 50, TASK_LIMIT = 200;

function fail(code, message, status = 400) { throw Object.assign(new Error(message), { code, status }); }
function id(value) {
  if (typeof value !== 'string' || !UUID.test(value)) fail('TASK_AREA_ID_INVALID', '작업 또는 담당자 식별자를 확인하세요.');
  return value.toLowerCase();
}
function areaName(value) {
  if (!AREAS.includes(value)) fail('TASK_AREA_INVALID', '화면·서버·DB 중 작업 영역을 선택하세요.');
  return value;
}
function text(value, max) {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || !value.isWellFormed()) fail('TASK_AREA_INPUT_INVALID', '작업 내용과 연결 정보의 형식·길이를 확인하세요.');
  return value.trim();
}
function parseUpdate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !['expected_version', ...FIELDS].includes(k))) fail('TASK_AREA_INPUT_INVALID', '작업 영역의 입력 항목을 확인하세요.');
  if (!Number.isSafeInteger(value.expected_version) || value.expected_version < 0 || value.expected_version >= 2147483647) fail('TASK_AREA_VERSION_REQUIRED', '확인한 작업 영역의 버전이 필요합니다.');
  const parsed = { expected_version: value.expected_version };
  if ('status' in value) {
    if (!STATUSES.includes(value.status)) fail('TASK_AREA_STATUS_INVALID', '작업 영역의 진행 상태를 확인하세요.');
    parsed.status = value.status;
  }
  if ('description' in value) parsed.description = text(value.description, 10000);
  if ('reference' in value) parsed.reference = text(value.reference, 2000);
  if ('assignee_ids' in value) {
    if (!Array.isArray(value.assignee_ids) || value.assignee_ids.length > 50) fail('TASK_AREA_ASSIGNEES_INVALID', '담당자는 프로젝트 구성원 중 최대 50명까지 선택할 수 있습니다.');
    parsed.assignee_ids = value.assignee_ids.map(id).sort();
    if (new Set(parsed.assignee_ids).size !== parsed.assignee_ids.length) fail('TASK_AREA_ASSIGNEES_INVALID', '담당자를 중복 선택하지 마세요.');
  }
  if (!FIELDS.some(field => field in parsed)) fail('TASK_AREA_INPUT_INVALID', '변경할 작업 영역 정보를 입력하세요.');
  return parsed;
}
function defaultArea(area) {
  return { area, status: 'todo', description: '', reference: '', assignee_ids: [], assignees: [], version: 0, updated_at: null, updated_by: null };
}
function progress(areas) {
  const applicable = areas.filter(area => area.status !== 'not_applicable');
  const completed = applicable.filter(area => area.status === 'done').length;
  return { completed, total: applicable.length, percent: applicable.length ? Math.round(completed / applicable.length * 100) : 0 };
}
function state(area) { return Object.fromEntries(FIELDS.map(field => [field, area[field]])); }
async function task(db, p, taskId) {
  if (!(await db.query('SELECT id FROM automation_tasks WHERE project_id=$1 AND id=$2', [p, taskId])).rowCount) fail('TASK_AREA_TASK_NOT_FOUND', '이 프로젝트의 작업을 찾을 수 없습니다.', 404);
}
async function loadAreas(db, p, ids, summary = false) {
  if (!ids.length) return new Map();
  const rows = (await db.query(`SELECT a.task_id,a.area,a.status,${summary ? '' : 'a.description,a.reference,'}a.version,a.updated_at,a.updated_by,
    COALESCE((SELECT jsonb_agg(s.user_id ORDER BY s.user_id) FROM automation_task_area_assignees s
      WHERE s.task_id=a.task_id AND s.project_id=a.project_id AND s.area=a.area),'[]'::jsonb) AS assignee_ids,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) ORDER BY s.user_id)
      FROM automation_task_area_assignees s JOIN users u ON u.id=s.user_id
      WHERE s.task_id=a.task_id AND s.project_id=a.project_id AND s.area=a.area),'[]'::jsonb) AS assignees
    FROM automation_task_areas a WHERE a.project_id=$1 AND a.task_id=ANY($2::uuid[])`, [p, ids])).rows;
  const byTask = new Map(ids.map(taskId => [taskId, new Map()]));
  for (const { task_id, ...row } of rows) byTask.get(task_id).set(row.area, row);
  return new Map(ids.map(taskId => [taskId, AREAS.map(area => {
    const value = byTask.get(taskId).get(area) || defaultArea(area);
    if (!summary) return value;
    const { description, reference, ...compact } = value;
    return compact;
  })]));
}
async function detail(db, p, taskId) {
  const areas = (await loadAreas(db, p, [taskId])).get(taskId);
  const rows = (await db.query(`SELECT h.id,h.area,h.version,h.changed_fields,h.before_state,h.after_state,h.actor_id,u.name AS actor_name,h.created_at
    FROM automation_task_area_history h JOIN users u ON u.id=h.actor_id
    WHERE h.project_id=$1 AND h.task_id=$2 ORDER BY h.created_at DESC,h.id DESC LIMIT $3`, [p, taskId, HISTORY_LIMIT + 1])).rows;
  return { task_id: taskId, areas, progress: progress(areas), history: rows.slice(0, HISTORY_LIMIT), history_has_more: rows.length > HISTORY_LIMIT };
}
async function authorizeWrite(db, p, u) {
  const row = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR SHARE', [p, id(u)])).rows[0];
  if (!row || !WRITERS.includes(row.role)) fail('FORBIDDEN', '이 프로젝트에서 담당자와 진행 상태를 변경할 권한이 없습니다.', 403);
}
async function validateAssignees(db, p, ids, contributors = true) {
  if (!ids.length) return;
  const rows = (await db.query(`SELECT m.user_id,m.role FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.project_id=$1 AND m.user_id=ANY($2::uuid[]) AND NOT u.is_shared_view ORDER BY m.user_id FOR SHARE OF m`, [p, ids])).rows;
  if (rows.length !== ids.length || contributors && rows.some(row => !WRITERS.includes(row.role))) fail('TASK_AREA_ASSIGNEES_INVALID', '같은 프로젝트의 관리자·검토자·참여자만 담당자로 지정할 수 있습니다. 작업을 다시 시작하려면 현재 참여 가능한 담당자로 변경하세요.', 409);
}
function createTaskAreas({ pool }) {
  return {
    async list(p, u) {
      await membership(pool, p, u);
      const ids = (await pool.query('SELECT id FROM automation_tasks WHERE project_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2', [p, TASK_LIMIT])).rows.map(row => row.id);
      const grouped = await loadAreas(pool, p, ids, true);
      return { items: ids.map(taskId => { const areas = grouped.get(taskId); return { task_id: taskId, areas, progress: progress(areas) }; }), limit: TASK_LIMIT };
    },
    async get(p, u, taskId) {
      taskId = id(taskId); await membership(pool, p, u); await task(pool, p, taskId);
      return detail(pool, p, taskId);
    },
    async update(p, u, taskId, area, body) {
      taskId = id(taskId); area = areaName(area); const input = parseUpdate(body);
      return transaction(pool, async db => {
        // Match project member mutation lock ordering so assignment and role changes cannot race.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-members:'||$1,0))", [p]);
        await authorizeWrite(db, p, u); await task(db, p, taskId);
        // This also serializes the first write, before a persisted area row exists.
        await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-task-area:'||$1||':'||$2,0))", [taskId, area]);
        const before = (await loadAreas(db, p, [taskId])).get(taskId).find(item => item.area === area);
        if (before.version !== input.expected_version) fail('TASK_AREA_VERSION_CONFLICT', '다른 사람이 작업 영역을 수정했습니다. 최신 내용을 확인한 후 다시 저장하세요.', 409);
        const after = { ...before, ...Object.fromEntries(FIELDS.filter(field => field in input).map(field => [field, input[field]])) };
        const changed = FIELDS.filter(field => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
        // Finished work retains historical assignees after a read-only role change.
        // New assignments and reopened work still require current contributor roles.
        await validateAssignees(db, p, after.assignee_ids, changed.includes('assignee_ids') || !['done','not_applicable'].includes(after.status));
        if (!changed.length) return { ...await detail(db, p, taskId), unchanged: true };
        const nextVersion = before.version + 1;
        await db.query(`INSERT INTO automation_task_areas(task_id,project_id,area,status,description,reference,version,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(task_id,area) DO UPDATE SET
          status=EXCLUDED.status,description=EXCLUDED.description,reference=EXCLUDED.reference,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [taskId, p, area, after.status, after.description, after.reference, nextVersion, u]);
        if (changed.includes('assignee_ids')) {
          await db.query('DELETE FROM automation_task_area_assignees WHERE project_id=$1 AND task_id=$2 AND area=$3', [p, taskId, area]);
          if (after.assignee_ids.length) await db.query(`INSERT INTO automation_task_area_assignees(task_id,project_id,area,user_id)
            SELECT $1,$2,$3,unnest($4::uuid[])`, [taskId, p, area, after.assignee_ids]);
        }
        const history = (await db.query(`INSERT INTO automation_task_area_history(task_id,project_id,area,version,changed_fields,before_state,after_state,actor_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [taskId, p, area, nextVersion, JSON.stringify(changed), state(before), state(after), u])).rows[0];
        await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)',
          [p, u, 'task_area.updated', taskId, { area, version: nextVersion, history_id: history.id, changed_fields: changed, before: state(before), after: state(after) }]);
        return detail(db, p, taskId);
      });
    },
  };
}
module.exports = { createTaskAreas, AREAS, STATUSES, parseUpdate, progress };

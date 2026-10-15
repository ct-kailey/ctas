'use strict';
const { error, emailAddress } = require('./auth');
const { transaction } = require('./db');
const { invalidateGrantSources } = require('./customer-connections');

const ROLES = new Set(['owner', 'reviewer', 'member', 'viewer']);
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function input(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) {
    throw error('INVALID_MEMBER_INPUT', '구성원 입력 형식을 확인하세요.');
  }
}
function role(value) {
  if (!ROLES.has(value)) throw error('INVALID_MEMBER_ROLE', '구성원 권한을 선택하세요.');
  return value;
}
function userId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw error('INVALID_MEMBER_ID', '구성원 식별자를 확인하세요.');
  return value.toLowerCase();
}
async function owner(db, p, u) {
  // Serialize membership mutations and recheck the actor under a row lock.
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('ains-members:'||$1,0))", [p]);
  const member = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR UPDATE', [p, u])).rows[0];
  if (!member) throw error('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404);
  if (member.role !== 'owner') throw error('FORBIDDEN', '프로젝트 관리자만 구성원을 관리할 수 있습니다.', 403);
}
async function target(db, p, id, expectedRole) {
  if ((await db.query('SELECT 1 FROM users WHERE id=$1 AND is_shared_view', [id])).rowCount) throw error('SHARED_VIEW_MEMBER', '공유 열람 권한은 공유 링크 관리에서 종료하세요.', 403);
  const member = (await db.query('SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2 FOR UPDATE', [p, id])).rows[0];
  if (!member) throw error('NOT_FOUND', '프로젝트 구성원을 찾을 수 없습니다.', 404);
  if (member.role !== expectedRole) throw error('MEMBERSHIP_CHANGED', '구성원 권한이 변경되었습니다. 목록을 새로 불러온 후 다시 확인하세요.', 409);
  return member;
}
async function assignments(db, p, id) {
  return (await db.query(`SELECT
    (SELECT count(*)::int FROM work_items WHERE project_id=$1 AND assignee_id=$2) AS tasks,
    (SELECT count(*)::int FROM work_items WHERE project_id=$1 AND assignee_id=$2 AND status<>'done') AS open_tasks,
    (SELECT count(*)::int FROM automation_task_area_assignees WHERE project_id=$1 AND user_id=$2) AS task_areas,
    (SELECT count(*)::int FROM automation_task_area_assignees a JOIN automation_task_areas t USING(project_id,task_id,area) WHERE a.project_id=$1 AND a.user_id=$2 AND t.status NOT IN ('done','not_applicable')) AS open_task_areas,
    (SELECT count(*)::int FROM project_questions WHERE project_id=$1 AND assigned_to=$2) AS questions,
    (SELECT count(*)::int FROM project_questions WHERE project_id=$1 AND assigned_to=$2 AND status IN ('draft','waiting','answered_pending')) AS open_questions,
    (SELECT count(*)::int FROM work_scope_locks WHERE project_id=$1 AND assignee_id=$2) AS scopes,
    (SELECT count(*)::int FROM work_scope_locks WHERE project_id=$1 AND assignee_id=$2 AND status='active') AS active_scopes`, [p, id])).rows[0];
}
async function protectOwner(db, p, actor, id, previousRole, nextRole) {
  if (previousRole === 'owner' && nextRole !== 'owner') {
    const count = (await db.query("SELECT count(*)::int AS n FROM memberships WHERE project_id=$1 AND role='owner'", [p])).rows[0].n;
    if (count <= 1) throw error('LAST_PROJECT_OWNER', '프로젝트 관리자는 최소 한 명 필요합니다. 다른 관리자를 먼저 지정하세요.', 409);
  }
  if (actor === id) throw error('SELF_MEMBERSHIP_CHANGE', '본인의 권한 변경이나 프로젝트 해제는 다른 프로젝트 관리자에게 요청하세요.', 409);
}
async function audit(db, p, actor, kind, id, detail) {
  await db.query('INSERT INTO events(project_id,actor_id,kind,entity_id,detail) VALUES($1,$2,$3,$4,$5)', [p, actor, kind, id, detail]);
}
async function stopMemberSources(db, p, id) {
  // Source workers hold the same source row lock through their last grant check
  // and evidence commit. Queue remote stops before changing membership so the
  // revocation and local collection fence become visible in one transaction.
  return invalidateGrantSources(db,
    's.project_id=$1 AND s.connection_grant_id IN (SELECT id FROM project_connection_grants WHERE project_id=$1 AND (operator_id=$2 OR reviewer_id=$2))',
    [p, id], 'CONNECTION_OPERATOR_REVOKED');
}

function createProjectMembers(pool) {
  return {
    async list(p, u) {
      const { rows } = await pool.query(`WITH authorized AS MATERIALIZED (
        SELECT role FROM memberships WHERE project_id=$1 AND user_id=$2
      ) SELECT a.role AS current_role,COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',u.id,'name',u.name,'email',u.email,'role',m.role,
        'assignments',jsonb_build_object('open_tasks',COALESCE(w.open_count,0),'open_task_areas',COALESCE(ta.open_count,0),'open_questions',COALESCE(q.open_count,0),'active_scopes',COALESCE(s.open_count,0)),
        'has_assignment_history',COALESCE(w.total,0)+COALESCE(ta.total,0)+COALESCE(q.total,0)+COALESCE(s.total,0)>0
      ) ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'reviewer' THEN 1 WHEN 'member' THEN 2 ELSE 3 END,u.name,u.id)
      FROM memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN (SELECT assignee_id,count(*) AS total,count(*) FILTER(WHERE status<>'done') AS open_count FROM work_items WHERE project_id=$1 GROUP BY assignee_id) w ON w.assignee_id=m.user_id
      LEFT JOIN (SELECT assigned_to,count(*) AS total,count(*) FILTER(WHERE status IN ('draft','waiting','answered_pending')) AS open_count FROM project_questions WHERE project_id=$1 GROUP BY assigned_to) q ON q.assigned_to=m.user_id
      LEFT JOIN (SELECT assignee_id,count(*) AS total,count(*) FILTER(WHERE status='active') AS open_count FROM work_scope_locks WHERE project_id=$1 GROUP BY assignee_id) s ON s.assignee_id=m.user_id
      LEFT JOIN (SELECT a.user_id,count(*) AS total,count(*) FILTER(WHERE t.status NOT IN ('done','not_applicable')) AS open_count FROM automation_task_area_assignees a JOIN automation_task_areas t USING(project_id,task_id,area) WHERE a.project_id=$1 GROUP BY a.user_id) ta ON ta.user_id=m.user_id
      WHERE m.project_id=$1 AND NOT u.is_shared_view),'[]'::jsonb) AS members FROM authorized a`, [p, u]);
      if (!rows[0]) throw error('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404);
      return { ...rows[0], assignment_model: 'one_primary_assignee_per_task', task_area_assignment_model: 'multiple_assignees' };
    },
    async add(p, actor, body) {
      input(body, ['email', 'role']);
      const email = emailAddress(body.email), nextRole = role(body.role);
      return transaction(pool, async db => {
        await owner(db, p, actor);
        const user = (await db.query('SELECT id,name,email FROM users WHERE email=$1 AND NOT is_shared_view', [email])).rows[0];
        if (!user) throw error('ACCOUNT_NOT_REGISTERED', '먼저 서비스 계정 등록이 필요합니다. 가입된 이메일로 다시 추가하세요. 초대 메일은 발송되지 않습니다.', 404);
        const inserted = await db.query('INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING role', [p, user.id, nextRole]);
        if (!inserted.rowCount) throw error('MEMBER_EXISTS', '이미 이 프로젝트의 구성원입니다. 목록에서 권한을 확인하세요.', 409);
        await audit(db, p, actor, 'member.added', user.id, { role: nextRole, name: user.name });
        return { member: { ...user, role: nextRole } };
      });
    },
    async change(p, actor, id, body) {
      input(body, ['role', 'expected_role']);
      id = userId(id); const nextRole = role(body.role), expectedRole = role(body.expected_role);
      return transaction(pool, async db => {
        await owner(db, p, actor);
        const previous = await target(db, p, id, expectedRole);
        if (previous.role === nextRole) return { member: { id, role: nextRole }, unchanged: true };
        await protectOwner(db, p, actor, id, previous.role, nextRole);
        if (nextRole === 'viewer') {
          const refs = await assignments(db, p, id);
          if (refs.open_tasks || refs.open_task_areas || refs.open_questions || refs.active_scopes) throw error('MEMBER_HAS_ACTIVE_ASSIGNMENTS', '진행 중인 담당 작업·화면·서버·DB 영역·질문을 정리하거나 다른 담당자로 변경하고 작업 범위를 해제한 뒤 열람 권한으로 바꾸세요.', 409);
        }
        const stopped = ['owner', 'reviewer'].includes(nextRole) ? 0 : await stopMemberSources(db, p, id);
        await db.query('UPDATE memberships SET role=$3 WHERE project_id=$1 AND user_id=$2', [p, id, nextRole]);
        await audit(db, p, actor, 'member.role_changed', id, { before: previous.role, after: nextRole, nora_sources_stopped: stopped });
        return { member: { id, role: nextRole } };
      });
    },
    async remove(p, actor, id, body) {
      input(body, ['expected_role']); id = userId(id); const expectedRole = role(body.expected_role);
      return transaction(pool, async db => {
        await owner(db, p, actor);
        const previous = await target(db, p, id, expectedRole);
        await protectOwner(db, p, actor, id, previous.role, null);
        const refs = await assignments(db, p, id);
        if (refs.tasks || refs.task_areas || refs.questions || refs.scopes) throw error('MEMBER_HAS_ASSIGNMENT_HISTORY', '담당 작업·영역·질문·작업 범위 이력이 있어 해제할 수 없습니다. 이력을 보존하며 권한만 변경할 수 있습니다.', 409);
        const stopped = await stopMemberSources(db, p, id);
        await db.query('DELETE FROM memberships WHERE project_id=$1 AND user_id=$2', [p, id]);
        await audit(db, p, actor, 'member.removed', id, { role: previous.role, nora_sources_stopped: stopped });
        return { removed: true, user_id: id };
      });
    },
  };
}

function mountProjectMemberRoutes(router, { pool }) {
  const members = createProjectMembers(pool);
  router.get('/members', async (req, res) => res.json(await members.list(req.params.p, req.user.id)));
  router.post('/members', async (req, res) => res.status(201).json(await members.add(req.params.p, req.user.id, req.body)));
  router.patch('/members/:id', async (req, res) => res.json(await members.change(req.params.p, req.user.id, req.params.id, req.body)));
  router.delete('/members/:id', async (req, res) => res.json(await members.remove(req.params.p, req.user.id, req.params.id, req.body)));
}
module.exports = { createProjectMembers, mountProjectMemberRoutes };

'use strict';
const { error } = require('./auth');

// A single SELECT keeps counts and bounded lists on the same database snapshot.
// Only summary fields leave this endpoint; source text, AI inputs, and credentials
// stay in their existing permission-checked detail endpoints.
async function readDashboard(pool, projectId, userId) {
  const { rows } = await pool.query(`
    SELECT jsonb_build_object(
      'project', jsonb_build_object('id',p.id,'name',p.name,'role',m.role),
      'counts', jsonb_build_object(
        'documents', (SELECT count(*) FROM documents WHERE project_id=p.id),
        'revisions', (SELECT count(*) FROM revisions WHERE project_id=p.id),
        'pending_reviews', (SELECT count(*) FROM reviews WHERE project_id=p.id AND status IN ('needs_review','no_change')),
        'failed_jobs', (SELECT count(*) FROM jobs WHERE project_id=p.id AND status IN ('failed','uncertain')),
        'context_entries', (SELECT count(*) FROM context_records WHERE project_id=p.id),
        'context_pending', (SELECT count(*) FROM context_candidates WHERE project_id=p.id AND status='pending'),
        'open_tasks', (SELECT count(*) FROM work_items WHERE project_id=p.id AND status<>'done'),
        'open_questions', (SELECT count(*) FROM project_questions WHERE project_id=p.id AND status IN ('draft','waiting','answered_pending')),
        'commercial_documents', (SELECT count(*) FROM commercial_documents WHERE project_id=p.id)
      ),
      'items', jsonb_build_object(
        'documents', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT d.id,d.title,COALESCE(r.status,'draft') AS status,COALESCE(r.created_at,d.created_at) AS updated_at
          FROM documents d LEFT JOIN LATERAL (
            SELECT status,created_at FROM revisions
            WHERE project_id=d.project_id AND document_id=d.id ORDER BY created_at DESC,id DESC LIMIT 1
          ) r ON true
          WHERE d.project_id=p.id ORDER BY updated_at DESC,d.id DESC LIMIT 6
        ) item),'[]'::jsonb),
        'reviews', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT r.id,d.title,r.status,r.created_at AS updated_at
          FROM reviews r JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id
          WHERE r.project_id=p.id AND r.status IN ('needs_review','no_change')
          ORDER BY r.created_at DESC,r.id DESC LIMIT 6
        ) item),'[]'::jsonb),
        'tasks', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',item.id,'title',item.title,'status',item.status,'due_at',item.due_at) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT id,COALESCE(NULLIF(source_task->>'title',''),source_task_id) AS title,status,due_on AS due_at,updated_at
          FROM work_items WHERE project_id=p.id AND status<>'done'
          ORDER BY updated_at DESC,id DESC LIMIT 6
        ) item),'[]'::jsonb),
        'questions', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',item.id,'title',item.title,'status',item.status,'due_at',item.due_at) ORDER BY item.updated_at DESC,item.id DESC) FROM (
          SELECT id,title,status,due_at,updated_at FROM project_questions
          WHERE project_id=p.id AND status IN ('draft','waiting','answered_pending')
          ORDER BY updated_at DESC,id DESC LIMIT 6
        ) item),'[]'::jsonb),
        'activity', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC,item.id DESC) FROM (
          SELECT id,kind,created_at FROM events WHERE project_id=p.id ORDER BY created_at DESC,id DESC LIMIT 6
        ) item),'[]'::jsonb)
      )
    ) AS dashboard
    FROM projects p JOIN memberships m ON m.project_id=p.id AND m.user_id=$2
    WHERE p.id=$1`, [projectId, userId]);
  if (!rows[0]) throw error('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404);
  return rows[0].dashboard;
}

function mountDashboardRoutes(router, { pool }) {
  router.get('/dashboard', async (req, res) => res.json(await readDashboard(pool, req.params.p, req.user.id)));
}

module.exports = { readDashboard, mountDashboardRoutes };

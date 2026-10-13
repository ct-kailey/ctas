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

// Attention is a projection of the existing ledgers, not a second notification
// state machine. Opening it never acknowledges or resolves the underlying work.
// All totals and the bounded list share a snapshot; Seoul calendar dates match
// the existing question reminder workflow and date-only work deadlines.
async function readAttention(pool, projectId, userId) {
  const { rows } = await pool.query(`
    WITH authorized AS MATERIALIZED (
      SELECT p.id FROM projects p JOIN memberships m ON m.project_id=p.id AND m.user_id=$2 WHERE p.id=$1
    ), attention AS MATERIALIZED (
      SELECT 'review:'||r.id AS id,'review' AS kind,'check' AS grade,
        left(d.title,200) AS title,
        CASE r.status WHEN 'no_change' THEN '요구사항 변경이 없다는 분석 결과를 확인하고 검토를 완료하세요.'
          ELSE '요구사항 변경 분석 결과와 원문을 비교하고 검토를 완료하세요.' END AS description,
        CASE r.status WHEN 'no_change' THEN 'review_no_change' ELSE 'review_pending' END AS rule,
        r.created_at,'reviews' AS tab,jsonb_build_object('reviewId',r.id) AS target
      FROM reviews r JOIN authorized a ON a.id=r.project_id
      JOIN documents d ON d.id=r.document_id AND d.project_id=r.project_id
      WHERE r.status IN ('needs_review','no_change')
      UNION ALL
      SELECT 'job:'||j.id,'job','urgent',COALESCE(left(d.title,200),'문서 분석 작업'),
        CASE j.status WHEN 'uncertain' THEN '실행 결과가 확인되지 않았습니다. 이력을 확인한 후 후속 조치를 결정하세요.'
          ELSE '분석 작업에 실패했습니다. 실패 원인을 확인하고 재처리 여부를 결정하세요.' END,
        CASE j.status WHEN 'uncertain' THEN 'job_uncertain' ELSE 'job_failed' END,
        j.created_at,CASE j.kind WHEN 'review' THEN 'reviews' ELSE 'documents' END,
        CASE j.kind WHEN 'review' THEN jsonb_build_object('reviewId',j.review_id)
          ELSE jsonb_build_object('revisionId',j.revision_id) END
      FROM jobs j JOIN authorized a ON a.id=j.project_id
      LEFT JOIN revisions v ON v.id=j.revision_id AND v.project_id=j.project_id
      LEFT JOIN reviews r ON r.id=j.review_id AND r.project_id=j.project_id
      LEFT JOIN documents d ON d.id=COALESCE(v.document_id,r.document_id) AND d.project_id=j.project_id
      WHERE j.status IN ('failed','uncertain')
      UNION ALL
      SELECT 'context:'||c.id,'context','check',COALESCE(NULLIF(left(c.payload->>'title',200),''),'프로젝트 맥락 검토'),
        '프로젝트 맥락에 반영할 후보가 있습니다. 출처와 결정 내용을 검토하세요.',
        'context_pending',c.created_at,'context',jsonb_build_object('candidateId',c.id)
      FROM context_candidates c JOIN authorized a ON a.id=c.project_id WHERE c.status='pending'
      UNION ALL
      SELECT 'question:'||q.id,'question',
        CASE WHEN q.status='waiting' AND q.due_at<=now() THEN 'urgent'
          WHEN q.status<>'waiting' OR q.waiting_since<=now()-interval '3 days' THEN 'check' ELSE 'info' END,
        left(q.title,200),
        CASE WHEN q.status='draft' THEN '아직 전달하지 않은 질문입니다. 내용을 검토하고 발송 이력을 기록하세요.'
          WHEN q.status='answered_pending' THEN '답변이 도착했습니다. 근거와 영향을 확인하고 답변을 확정하세요.'
          WHEN q.due_at<=now() THEN '설정한 답변 기한이 지났습니다. 응답 상태와 대기 중인 작업을 확인하세요.'
          WHEN q.waiting_since<=now()-interval '3 days' THEN '답변을 기다린 지 3일 이상 지났습니다. 후속 확인이 필요한지 검토하세요.'
          ELSE '고객 답변을 기다리고 있습니다. 답변이 도착하면 질문 이력에 기록하세요.' END,
        CASE WHEN q.status='draft' THEN 'question_draft'
          WHEN q.status='answered_pending' THEN 'question_answer_review'
          WHEN q.due_at<=now() THEN 'question_overdue'
          WHEN q.waiting_since<=now()-interval '3 days' THEN 'question_waiting_long' ELSE 'question_waiting' END,
        q.created_at,'questions',jsonb_build_object('questionId',q.id)
      FROM project_questions q JOIN authorized a ON a.id=q.project_id
      WHERE q.status IN ('draft','waiting','answered_pending')
      UNION ALL
      SELECT 'task:'||w.id,'task','urgent',COALESCE(NULLIF(left(w.source_task->>'title',200),''),w.source_task_id),
        CASE WHEN w.status='blocked' AND w.due_on<(now() AT TIME ZONE 'Asia/Seoul')::date
          THEN '보류된 작업의 마감일이 지났습니다. 막힌 이유와 일정 조정을 확인하세요.'
          WHEN w.status='blocked' THEN '작업이 보류되어 있습니다. 막힌 이유와 해결에 필요한 사항을 확인하세요.'
          ELSE '완료되지 않은 작업의 마감일이 지났습니다. 진행 상황과 일정을 확인하세요.' END,
        CASE WHEN w.status='blocked' AND w.due_on<(now() AT TIME ZONE 'Asia/Seoul')::date THEN 'task_blocked_overdue'
          WHEN w.status='blocked' THEN 'task_blocked' ELSE 'task_overdue' END,
        w.created_at,'work-items',jsonb_build_object('workItemId',w.id)
      FROM work_items w JOIN authorized a ON a.id=w.project_id
      WHERE w.status<>'done' AND (w.status='blocked' OR w.due_on<(now() AT TIME ZONE 'Asia/Seoul')::date)
      UNION ALL
      SELECT 'channel:'||i.id,'channel',CASE i.status WHEN 'needs_review' THEN 'check' ELSE 'urgent' END,
        left(s.name,200)||' 수집 검토',
        CASE WHEN i.evidence_changed THEN '수집한 원문이 변경되었습니다. 최신 대화를 다시 수집하고 기존 검토 항목을 확인하세요.'
          WHEN i.status='failed' THEN '대화 분석에 실패했습니다. 원문과 실패 원인을 확인하세요.'
          WHEN i.status='uncertain' THEN '대화 분석 결과가 확인되지 않았습니다. 실행 이력과 원문을 확인하세요.'
          ELSE '수집한 대화에 검토할 기록 후보가 있습니다. 원문을 확인한 후 등록하거나 제외하세요.' END,
        CASE WHEN i.evidence_changed THEN 'channel_evidence_changed'
          WHEN i.status='failed' THEN 'channel_failed' WHEN i.status='uncertain' THEN 'channel_uncertain' ELSE 'channel_review' END,
        i.created_at,'channels',jsonb_build_object('inboxId',i.id)
      FROM channel_inbox i JOIN authorized a ON a.id=i.project_id
      JOIN channel_sources s ON s.id=i.source_id AND s.project_id=i.project_id
      WHERE i.status IN ('needs_review','failed','uncertain')
    ), ranked AS (
      SELECT *,CASE grade WHEN 'urgent' THEN 0 WHEN 'check' THEN 1 ELSE 2 END AS priority
      FROM attention ORDER BY priority,created_at DESC,id LIMIT 100
    )
    SELECT jsonb_build_object(
      'items',COALESCE((SELECT jsonb_agg(to_jsonb(ranked)-'priority' ORDER BY priority,created_at DESC,id) FROM ranked),'[]'::jsonb),
      'counts',(SELECT jsonb_build_object('all',count(*),'urgent',count(*) FILTER(WHERE grade='urgent'),
        'check',count(*) FILTER(WHERE grade='check'),'info',count(*) FILTER(WHERE grade='info')) FROM attention),
      'truncated',(SELECT count(*)>100 FROM attention)
    ) AS attention FROM authorized`, [projectId, userId]);
  if (!rows[0]) throw error('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', 404);
  return rows[0].attention;
}

function mountDashboardRoutes(router, { pool }) {
  router.get('/dashboard', async (req, res) => res.json(await readDashboard(pool, req.params.p, req.user.id)));
  router.get('/attention', async (req, res) => res.json(await readAttention(pool, req.params.p, req.user.id)));
}

module.exports = { readDashboard, readAttention, mountDashboardRoutes };

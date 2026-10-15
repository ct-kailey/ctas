'use strict';
const { createTaskAutomation } = require('./task-automation');

function fail(code, message, status = 409) { throw Object.assign(new Error(message), { code, status }); }
function previewTarget(value, origins, appOrigin) {
  let url;
  try { url = new URL(value); } catch { fail('TASK_PREVIEW_REQUIRED', '아직 웹 미리보기가 준비되지 않았습니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || !Array.isArray(origins) || !origins.includes(url.origin)) {
    fail('TASK_PREVIEW_ORIGIN_INVALID', '프로젝트에서 허용한 웹 미리보기 주소가 아닙니다.');
  }
  if (url.hostname === new URL(appOrigin).hostname) fail('TASK_PREVIEW_SAME_HOST', '작업실과 다른 호스트에 배포한 미리보기 주소를 연결해 주세요.');
  return url;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
function previewHTML(url) {
  // Static, script-free wrapper. Preview code runs only in the cross-origin,
  // sandboxed child frame; no AINS credentials are forwarded to its server.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>개발 결과 미리보기</title><style>html,body{margin:0;height:100%;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><iframe title="개발 결과 동작 확인" src="${escapeHtml(url.href)}" sandbox="allow-scripts allow-forms allow-same-origin" referrerpolicy="no-referrer"></iframe></body></html>`;
}
function mountTaskPreviewRoutes(router, { pool, appOrigin }) {
  const tasks = createTaskAutomation({ pool });
  router.get('/task-automation/tasks/:id/preview-frame', async (req, res) => {
    if (req.sharedView || req.user.is_shared_view) fail('FORBIDDEN', '공유 화면에서는 외부 미리보기를 열 수 없습니다.', 403);
    const task = await tasks.getTask(req.params.p, req.user.id, req.params.id);
    const settings = (await pool.query('SELECT preview_origins FROM task_automation_settings WHERE project_id=$1', [req.params.p])).rows[0];
    const target = previewTarget(task.artifact?.preview_url, settings?.preview_origins, appOrigin);
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; frame-src ${target.origin}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`,
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    });
    res.type('html').send(previewHTML(target));
  });
}
module.exports = { mountTaskPreviewRoutes, previewTarget, previewHTML };

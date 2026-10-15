'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const state = () => import('../web/src/domain-guide-state.mjs');
const owner = { id: 'project-one', role: 'owner' };
const published = { id: 'v1', number: 1, status: 'approved', source_fingerprint: 'before', guide: { title: '검토 완료본' } };
const draft = { id: 'v2', number: 2, status: 'draft', source_fingerprint: 'now', guide: { title: '초안' } };
const data = { can_edit: true, can_review: true, published, draft, source: { fingerprint: 'now', changed: true } };
const sources = [{ id: 'policy:1', authority: 'confirmed' }, { id: 'revision:1', authority: 'reference' }];

test('new drafts preserve the published default and historical selection is explicit', async () => {
  const { chooseGuideVersion } = await state();
  assert.equal(chooseGuideVersion(data), published);
  assert.equal(chooseGuideVersion(data, 'v2'), draft);
  assert.equal(chooseGuideVersion(data, 'not-loaded'), null);
  assert.equal(chooseGuideVersion({ ...data, published: null }), draft);
  assert.equal(chooseGuideVersion({ ...data, draft: { ...draft, id: 'v3' } }, 'v2', draft), draft, 'a selected old draft remains readable during new generation');
  assert.equal(chooseGuideVersion(data, 'unknown', draft), null);
  assert.equal(chooseGuideVersion(null), null);
});

test('guide controls require project roles and positive server capabilities', async () => {
  const { guidePermissions } = await state();
  assert.deepEqual(guidePermissions(owner, data), { canRefresh: true, canReview: true, canConfigure: true });
  assert.deepEqual(guidePermissions({ role: 'reviewer' }, data), { canRefresh: true, canReview: true, canConfigure: false });
  assert.deepEqual(guidePermissions({ role: 'member' }, data), { canRefresh: true, canReview: false, canConfigure: false });
  for (const role of ['viewer', '', 'constructor', undefined]) assert.deepEqual(guidePermissions({ role }, data), { canRefresh: false, canReview: false, canConfigure: false });
  assert.deepEqual(guidePermissions(owner, null), { canRefresh: false, canReview: false, canConfigure: false });
  assert.deepEqual(guidePermissions(owner, { can_edit: false, can_review: false }), { canRefresh: false, canReview: false, canConfigure: false });
});

test('source changes independently stale older versions without marking a fresh draft stale', async () => {
  const { guideIsStale } = await state();
  assert.equal(guideIsStale(published, data.source), true);
  assert.equal(guideIsStale(draft, data.source), false);
  assert.equal(guideIsStale({ ...draft, stale: true }, data.source), true);
  assert.equal(guideIsStale(null, data.source), false);
});

test('approval requires acknowledgment, current source, a draft, and reviewer authority', async () => {
  const { canReviewGuide } = await state();
  const args = { project: owner, data, version: draft, acknowledged: true };
  assert.equal(canReviewGuide(args), true);
  for (const patch of [{ acknowledged: false }, { busy: true }, { project: { role: 'member' } }, { version: published }, { version: { ...draft, stale: true } }, { data: { ...data, source: { fingerprint: 'newer' } } }, { data: { ...data, source: { error: { code: 'UNAVAILABLE' } } } }]) assert.equal(canReviewGuide({ ...args, ...patch }), false);
  assert.equal(canReviewGuide({ ...args, decision: 'reject', acknowledged: false, version: { ...draft, stale: true }, comment: '최신 근거를 반영해 주세요.' }), true);
  assert.equal(canReviewGuide({ ...args, decision: 'reject', comment: '  ' }), false);
  assert.equal(canReviewGuide({ ...args, decision: 'unknown' }), false);
  assert.equal(canReviewGuide({ ...args, data: { ...data, draft: { ...draft, id: 'newer-draft' } } }), false, 'comments on an older draft cannot approve its replacement');
});

test('guide approval does not promote reference sources into confirmed policy evidence', async () => {
  const { guideAuthority } = await state();
  assert.equal(guideAuthority(['policy:1'], sources, 'confirmed').confirmed, true);
  assert.equal(guideAuthority(['policy:1', 'revision:1'], sources, 'confirmed').confirmed, false);
  assert.equal(guideAuthority(['revision:1'], sources, 'confirmed').label, '참고 근거');
  assert.equal(guideAuthority(['policy:1'], sources, 'reference').confirmed, false);
  for (const ids of [[], ['unknown'], ['policy:1', 'unknown']]) assert.equal(guideAuthority(ids, sources, 'confirmed').label, '근거 확인 필요');
  assert.equal(guideAuthority(['policy:1'], sources, 'needs_confirmation').confirmed, false);
});

test('evidence resolution deduplicates IDs without accepting orphan or prototype properties', async () => {
  const { guideEvidence } = await state();
  assert.deepEqual(guideEvidence(['policy:1', 'policy:1', 'constructor', null, 'missing'], sources), [sources[0]]);
  assert.deepEqual(guideEvidence(null, null), []);
});

test('source navigation permits only read-only endpoints in the current project', async () => {
  const { guideSourceUrl, guideSourceRevision } = await state();
  const id = 'ec56df91-5100-463e-8cd9-8782b3c85145', prefix = '/api/projects/project-one/';
  for (const suffix of [`revisions/${id}`, `context/records/${id}`]) assert.equal(guideSourceUrl({ source_url: prefix + suffix }, 'project-one'), prefix + suffix);
  for (const url of [`/api/projects/project-two/revisions/${id}`, `https://evil.test/${id}`, `javascript:alert(1)`, `//evil.test/${id}`, `${prefix}revisions/${id}/delete`, `${prefix}revisions/${id}?redirect=evil`, `${prefix}revisions/${id}#secret`, `${prefix}../project-two/revisions/${id}`, `${prefix}revisions/not-a-uuid`]) assert.equal(guideSourceUrl({ source_url: url }, 'project-one'), null);
  assert.equal(guideSourceRevision({ id: `revision:${id}` }), id);
  for (const value of [`context_record:${id}`, `revision:${id}/../x`, `revision:javascript:alert(1)`, id]) assert.equal(guideSourceRevision({ id: value }), null);
});

test('flow rendering keeps yes/no branches and loops as typed geometry, never executable markup', async () => {
  const { guideFlowLayout } = await state();
  const workflow = { nodes: [{ id: 'start', kind: 'start', label: '시작' }, { id: 'decision', kind: 'decision', label: '<script>alert(1)</script>' }, { id: 'end', kind: 'end', label: '완료' }], edges: [{ from: 'start', to: 'decision' }, { from: 'decision', to: 'end', label: 'Yes' }, { from: 'decision', to: 'start', label: 'No' }, { from: 'end', to: 'end', label: '다시 확인' }, { from: 'missing', to: 'end' }] };
  const graph = guideFlowLayout(workflow);
  assert.equal(graph.nodes.length, 3); assert.equal(graph.edges.length, 4);
  assert.equal(graph.nodes[1].kind, 'decision'); assert.equal(graph.nodes[1].label, '<script>alert(1)</script>');
  assert.deepEqual(graph.edges.slice(1, 3).map(edge => edge.label), ['Yes', 'No']);
  for (const edge of graph.edges) { assert.match(edge.path, /^M [-\d .]+[LCV]/); assert.ok(!edge.path.includes('script')); }
  assert.equal(graph.nodes[0].x < graph.nodes[1].x, true);
});

test('malformed or oversized graphs cannot create unbounded nodes or dangling edges', async () => {
  const { guideFlowLayout, guideContents } = await state();
  const graph = guideFlowLayout({ nodes: [null, { id: 'same', kind: 'html', label: 'plain' }, { id: 'same' }, ...Array.from({ length: 40 }, (_, i) => ({ id: String(i), label: String(i) }))], edges: Array.from({ length: 30 }, () => ({ from: 'same', to: '0' })).concat({ from: 'same', to: '39' }) });
  assert.equal(graph.nodes.length, 12); assert.equal(graph.edges.length, 18); assert.equal(graph.nodes[0].kind, 'process');
  assert.equal(guideFlowLayout(null).nodes.length, 0);
  assert.deepEqual(guideContents({ sections: [null, 'text', { title: '정책' }], glossary: '<script>' }).sections, [{ title: '정책' }]);
  assert.deepEqual(guideContents(null).workflows, []);
});

test('display states use safe Korean labels and invalid dates do not crash rendering', async () => {
  const { guideRunState, guideVersionState, guideDate } = await state();
  assert.equal(guideRunState({ status: 'running' }).active, true);
  assert.equal(guideRunState({ status: 'uncertain' }).uncertain, true);
  for (const status of ['constructor', '__proto__', 'trace-secret', undefined]) assert.equal(guideRunState({ status }).label, '상태 확인 필요');
  assert.equal(guideVersionState(published).label, '가이드 검토 완료');
  assert.equal(guideVersionState(draft).label, '검토 전 초안');
  assert.equal(guideDate('not a date'), '시각 미확인');
  assert.equal(guideDate(null), '시각 미확인');
});

test('inline source identifiers use evidence numbers only for exact known sources', async () => {
  const { formatGuideText } = await state();
  const evidence = [{ id: 'record:smoke-policy' }, { id: 'revision:source.v2(approved)' }, { id: 'record:smoke-policy' }];
  assert.equal(formatGuideText('확인 [record:smoke-policy], `revision:source.v2(approved)`에 따름.', evidence), '확인 [근거 1], `근거 2`에 따름.');
  assert.equal(formatGuideText('[record:unknown] [record:smoke-policy-extra] prefixrecord:smoke-policy', evidence), '[record:unknown] [record:smoke-policy-extra] prefixrecord:smoke-policy');
  assert.equal(formatGuideText('[record:smoke-policy]', []), '[record:smoke-policy]');
  assert.equal(formatGuideText(null, evidence), '');
});

test('display projection formats every guide prose field and node without changing canonical content', async () => {
  const { guideContents } = await state();
  const marker = '[record:smoke-policy]', evidence = [{ id: 'record:smoke-policy' }];
  const original = { title: marker, summary: marker, summary_evidence_ids: ['record:smoke-policy'], sections: [{ id: 'section', title: marker, body: marker, evidence_ids: ['record:smoke-policy'] }], glossary: [{ term: marker, definition: marker }], workflows: [{ title: marker, nodes: [{ id: 'record:smoke-policy', label: marker }], edges: [{ from: 'record:smoke-policy', to: 'next', label: marker }] }], changes: [{ summary: marker }], questions: [{ question: marker, reason: marker }] };
  const before = structuredClone(original), view = guideContents(original, evidence);
  for (const value of [view.title, view.summary, view.sections[0].title, view.sections[0].body, view.glossary[0].term, view.glossary[0].definition, view.workflows[0].title, view.workflows[0].nodes[0].label, view.workflows[0].edges[0].label, view.changes[0].summary, view.questions[0].question, view.questions[0].reason]) assert.equal(value, '[근거 1]');
  assert.equal(view.workflows[0].nodes[0].id, 'record:smoke-policy');
  assert.equal(view.workflows[0].edges[0].from, 'record:smoke-policy');
  assert.deepEqual(view.sections[0].evidence_ids, ['record:smoke-policy']);
  assert.deepEqual(original, before);
});

test('formatted prose remains escaped React text rather than executable HTML', async () => {
  const { formatGuideText } = await state();
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const formatted = formatGuideText('<script>alert(1)</script> [record:smoke-policy]', [{ id: 'record:smoke-policy' }]);
  const markup = renderToStaticMarkup(React.createElement('p', null, formatted));
  assert.ok(markup.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(markup.includes('[근거 1]'));
  assert.ok(!markup.includes('<script>'));
});

test('domain guide deep links resolve to the work area and remain excluded from shared views', async () => {
  const { readWorkspaceLocation } = await import('../web/src/workspace-navigation.mjs');
  const { WORKFLOW_STEPS } = await import('../web/src/workspace-flow.mjs');
  const { SHARED_VIEW_TABS, sharedViewTab } = await import('../web/src/shared-view-state.mjs');
  const entry = readWorkspaceLocation('?project=one&tab=domain-guide');
  assert.equal(entry.projectId, 'one'); assert.equal(entry.invalidProject, false); assert.equal(entry.tab, 'domain-guide');
  const area = WORKFLOW_STEPS.find(item => item.tabs.includes('domain-guide'));
  assert.ok(area); assert.equal(area.primaryTab, 'domain-guide'); assert.equal(entry.workflowStep, area.id);
  assert.equal(SHARED_VIEW_TABS.has('domain-guide'), false);
  assert.equal(sharedViewTab('domain-guide', true), 'home');
  assert.equal(sharedViewTab('domain-guide', false), 'domain-guide');
});

test('Nora connection recovery action follows known API, run and scheduler error codes', async () => {
  const { guideNeedsConnection } = await state();
  for (const code of ['GUIDE_NORA_NOT_READY', 'GUIDE_CONNECTION_REQUIRED', 'NORA_AUTH_REQUIRED']) {
    assert.equal(guideNeedsConnection({ code }, null), true);
    assert.equal(guideNeedsConnection(null, { run: { error_code: code } }), true);
    assert.equal(guideNeedsConnection(null, { settings: { last_error_code: code } }), true);
    assert.equal(guideNeedsConnection(null, { source: { error: { code } } }), true);
  }
  assert.equal(guideNeedsConnection(null, null), false);
  assert.equal(guideNeedsConnection({ code: 'constructor', message: 'NORA_AUTH_REQUIRED' }, { run: { error_code: 'OTHER' } }), false);
});

test('long edge labels use numbered diagram markers with full readable legend data', async () => {
  const { guideFlowLayout } = await state();
  const workflow = { nodes: [{ id: 'request', label: '사용자 요청' }, { id: 'route', label: '실행 대상 결정' }, { id: 'run', label: 'CLI 실행 및 스트리밍' }], edges: [{ from: 'request', to: 'route', label: 'Yes' }, { from: 'route', to: 'run', label: '중앙/개인 CLI 라우팅' }, { from: 'run', to: 'request', label: 'No' }, { from: 'request', to: 'run', label: '123456' }, { from: 'run', to: 'route', label: '1234567' }] };
  const original = structuredClone(workflow), graph = guideFlowLayout(workflow);
  assert.deepEqual(graph.edges.map(edge => edge.displayLabel), ['Yes', '[2]', 'No', '123456', '[5]']);
  assert.deepEqual(graph.edges.filter(edge => edge.numbered).map(({ displayLabel, label, fromLabel, toLabel }) => ({ displayLabel, label, fromLabel, toLabel })), [
    { displayLabel: '[2]', label: '중앙/개인 CLI 라우팅', fromLabel: '실행 대상 결정', toLabel: 'CLI 실행 및 스트리밍' },
    { displayLabel: '[5]', label: '1234567', fromLabel: 'CLI 실행 및 스트리밍', toLabel: '실행 대상 결정' },
  ]);
  assert.deepEqual(workflow, original);
});

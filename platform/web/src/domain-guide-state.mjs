const array = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export const GUIDE_SECTIONS = [
  { id: 'overview', label: '프로젝트 이해' }, { id: 'glossary', label: '핵심 용어' },
  { id: 'workflows', label: '업무 흐름' }, { id: 'policies', label: '업무 기준·정책' },
  { id: 'changes', label: '최근 변경' }, { id: 'questions', label: '확인 필요사항' },
  { id: 'sources', label: '근거 자료' },
];

const RUN_STATES = {
  queued: ['갱신 대기', 'quiet'], running: ['초안 작성 중', 'blue'],
  succeeded: ['초안 작성 완료', 'green'], failed: ['갱신 실패', 'red'], uncertain: ['결과 확인 필요', 'amber'],
};
export function guideRunState(run) {
  const status = text(run?.status), entry = own(RUN_STATES, status) ? RUN_STATES[status] : ['상태 확인 필요', 'quiet'];
  return { label: entry[0], tone: entry[1], active: ['queued', 'running'].includes(status), uncertain: status === 'uncertain', failed: status === 'failed' };
}

export function guideNeedsConnection(error, data) {
  const connectionCodes = new Set(['GUIDE_NORA_NOT_READY', 'GUIDE_CONNECTION_REQUIRED', 'NORA_AUTH_REQUIRED']);
  return [error?.code, data?.run?.error_code, data?.settings?.last_error_code, data?.source?.error?.code].some(code => connectionCodes.has(code));
}

export function guideVersionState(version) {
  if (version?.status === 'approved') return { label: '가이드 검토 완료', tone: 'green' };
  if (version?.status === 'draft') return { label: '검토 전 초안', tone: 'amber' };
  if (version?.status === 'rejected') return { label: '반려된 초안', tone: 'quiet' };
  return { label: '상태 확인 필요', tone: 'quiet' };
}

export function guidePermissions(project, data) {
  const writer = ['owner', 'reviewer', 'member'].includes(project?.role);
  return {
    canRefresh: writer && data?.can_edit === true,
    canReview: ['owner', 'reviewer'].includes(project?.role) && data?.can_review === true,
    canConfigure: project?.role === 'owner' && data?.can_edit === true,
  };
}

// A new draft never displaces the last reviewed guide without an explicit selection.
export function chooseGuideVersion(data, selectedId = '', loadedVersion = null) {
  if (!data) return null;
  if (selectedId) {
    const match = [data.published, data.draft, loadedVersion].find(version => version?.id === selectedId && version.guide);
    return match || null;
  }
  return data.published?.guide ? data.published : data.draft?.guide ? data.draft : null;
}

export function guideIsStale(version, source) {
  if (!version) return false;
  return version.stale === true || Boolean(version.source_fingerprint && source?.fingerprint && version.source_fingerprint !== source.fingerprint);
}

export function canReviewGuide({ project, data, version, busy = false, acknowledged = false, decision = 'approve', comment = '' }) {
  if (!guidePermissions(project, data).canReview || busy || version?.status !== 'draft' || data?.draft?.id !== version.id) return false;
  if (decision === 'reject') return Boolean(text(comment).trim());
  return decision === 'approve' && acknowledged && Boolean(version.source_fingerprint && data.source?.fingerprint) && !guideIsStale(version, data.source) && !data.source?.error;
}

export function guideEvidence(ids, sources) {
  const byId = new Map(array(sources).filter(source => source && typeof source.id === 'string').map(source => [source.id, source]));
  return [...new Set(array(ids).filter(id => typeof id === 'string'))].map(id => byId.get(id)).filter(Boolean);
}

export function guideAuthority(ids, sources, declaredStatus) {
  const unique = [...new Set(array(ids).filter(id => typeof id === 'string'))], evidence = guideEvidence(unique, sources);
  if (declaredStatus === 'needs_confirmation' || !unique.length || unique.length !== evidence.length) return { label: '근거 확인 필요', tone: 'amber', confirmed: false };
  const confirmed = evidence.every(item => item.authority === 'confirmed') && declaredStatus !== 'reference';
  return { label: confirmed ? '확정 근거' : '참고 근거', tone: confirmed ? 'green' : 'quiet', confirmed };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function guideSourceRevision(source) {
  const match = text(source?.id).match(new RegExp(`^revision:(${UUID})$`, 'i'));
  return match?.[1] || null;
}

// Only current-project, read-only source endpoints may become links.
export function guideSourceUrl(source, projectId) {
  const value = text(source?.source_url), prefix = `/api/projects/${encodeURIComponent(projectId)}/`;
  if (!value.startsWith(prefix) || /[?#\\\s]/.test(value)) return null;
  const suffix = value.slice(prefix.length);
  return new RegExp(`^(?:revisions|context/records)/${UUID}$`, 'i').test(suffix) ? value : null;
}

function guideTextFormatter(sources) {
  const labels = new Map();
  array(sources).forEach((source, index) => { if (typeof source?.id === 'string' && source.id && !labels.has(source.id)) labels.set(source.id, `근거 ${index + 1}`); });
  if (!labels.size) return text;
  const ids = [...labels.keys()].sort((a, b) => b.length - a.length).map(id => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Exact known identifier tokens only; preserve unknown identifiers and longer IDs.
  // Returned strings stay React text children, never parsed markup.
  const pattern = new RegExp(`(?<![A-Za-z0-9_:/-])(?:${ids.join('|')})(?![A-Za-z0-9_:/-])`, 'g');
  return value => text(value).replace(pattern, id => labels.get(id));
}

export function formatGuideText(value, sources) { return guideTextFormatter(sources)(value); }

export function guideContents(guide, sources) {
  const value = guide && typeof guide === 'object' ? guide : {};
  const format = guideTextFormatter(sources), objects = values => array(values).filter(item => item && typeof item === 'object');
  return {
    title: format(value.title), summary: format(value.summary), summaryEvidenceIds: array(value.summary_evidence_ids),
    sections: objects(value.sections).map(item => ({ ...item, title: format(item.title), ...(typeof item.body === 'string' ? { body: format(item.body) } : {}) })),
    glossary: objects(value.glossary).map(item => ({ ...item, term: format(item.term), definition: format(item.definition) })),
    workflows: objects(value.workflows).map(item => ({ ...item, title: format(item.title), nodes: objects(item.nodes).map(node => ({ ...node, label: format(node.label) })), edges: objects(item.edges).map(edge => ({ ...edge, label: format(edge.label) })) })),
    changes: objects(value.changes).map(item => ({ ...item, summary: format(item.summary) })),
    questions: objects(value.questions).map(item => ({ ...item, question: format(item.question), reason: format(item.reason) })),
  };
}

// Layout is local code; strings from Nora are only text. No HTML, Mermaid or scripts are evaluated.
export function guideFlowLayout(workflow) {
  const seen = new Set();
  const nodes = array(workflow?.nodes).filter(node => {
    if (!node || typeof node.id !== 'string' || seen.has(node.id)) return false;
    seen.add(node.id); return true;
  }).slice(0, 12).map((node, index) => {
    const row = Math.floor(index / 3), column = row % 2 === 0 ? index % 3 : 2 - index % 3;
    return { id: node.id, label: text(node.label), kind: ['start', 'process', 'decision', 'end'].includes(node.kind) ? node.kind : 'process', evidence_ids: array(node.evidence_ids), x: 36 + column * 280, y: 32 + row * 180, width: 200, height: 104 };
  });
  const lookup = new Map(nodes.map(node => [node.id, node]));
  const edges = array(workflow?.edges).filter(edge => edge && lookup.has(edge.from) && lookup.has(edge.to)).slice(0, 18).map((edge, index) => {
    const from = lookup.get(edge.from), to = lookup.get(edge.to), sameRow = from.y === to.y;
    const right = to.x > from.x, down = to.y > from.y;
    const start = sameRow ? { x: from.x + (right ? from.width : 0), y: from.y + from.height / 2 } : { x: from.x + from.width / 2, y: from.y + (down ? from.height : 0) };
    const end = sameRow ? { x: to.x + (right ? 0 : to.width), y: to.y + to.height / 2 } : { x: to.x + to.width / 2, y: to.y + (down ? 0 : to.height) };
    let path;
    let labelX = (start.x + end.x) / 2, labelY = (start.y + end.y) / 2 - 10;
    if (edge.from === edge.to) { path = `M ${from.x + 200} ${from.y + 68} C ${from.x + 230} ${from.y + 110}, ${from.x + 230} ${from.y - 20}, ${from.x + 200} ${from.y + 30}`; labelX = from.x + 200; labelY = from.y + 2; }
    else if (sameRow && Math.abs(to.x - from.x) <= 280) path = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    else if (sameRow) { const lane = from.y + from.height + 24; path = `M ${from.x + 100} ${from.y + 104} V ${lane} H ${to.x + 100} V ${to.y + 104}`; labelY = lane - 8; }
    else if (Math.abs(to.y - from.y) <= 180) { const middle = (start.y + end.y) / 2; path = `M ${start.x} ${start.y} V ${middle} H ${end.x} V ${end.y}`; }
    else { const lane = right ? 822 : 18, startY = start.y + (down ? 20 : -20), endY = end.y + (down ? -20 : 20); path = `M ${start.x} ${start.y} V ${startY} H ${lane} V ${endY} H ${end.x} V ${end.y}`; labelX = lane; }
    const label = text(edge.label), numbered = Array.from(label).length > 6;
    return { key: `edge-${index}`, from: from.id, to: to.id, fromLabel: from.label, toLabel: to.label, label, displayLabel: numbered ? `[${index + 1}]` : label, numbered, path, labelX, labelY };
  });
  return { nodes, edges, width: 840, height: Math.max(168, Math.ceil(nodes.length / 3) * 180 - 12) };
}

export function guideDate(value) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '시각 미확인';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

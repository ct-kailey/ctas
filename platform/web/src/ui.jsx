import React, { useId, useRef } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button as CTDSButton } from './components/ctds/Button/Button';
import { Badge as CTDSBadge } from './components/ctds/Badge/Badge';
import { Spinner as CTDSSpinner } from './components/ctds/Spinner/Spinner';
import { EmptyState as CTDSEmptyState } from './components/ctds/EmptyState/EmptyState';
import { Modal as CTDSModal } from './components/ctds/Modal/Modal';
import { Callout as CTDSCallout } from './components/ctds/Callout/Callout';
import { Toast as CTDSToast, ToastProvider as CTDSToastProvider, ToastViewport } from './components/ctds/Toast/Toast';
import { Input, Textarea, Select, Disclosure } from './ui-controls';
import { Hint } from './components/ctds/Hint/Hint';
import { List, ListItem } from './ctds-lists';
import './ui-layout.css';
export { Input, Textarea, Select, Disclosure, ControlButton, Tabs } from './ui-controls';

export const STATUS = {
  queued: ['대기 중', 'quiet'], running: ['분석 중', 'blue'], ready: ['추출·정리 완료', 'green'],
  succeeded: ['완료', 'green'], needs_review: ['검토 필요', 'amber'], no_change: ['변경 없음', 'quiet'],
  blocked: ['확인 필요', 'red'], failed: ['실패', 'red'], uncertain: ['결과 확인 필요', 'amber'],
  approved: ['승인 완료', 'green'], rejected: ['반려', 'red'], published: ['확정본 반영', 'green'],
  pending: ['대기 중', 'quiet'], extracting: ['추출 중', 'blue'], processing: ['처리 중', 'blue'],
};
export const ROLES = { owner: '관리자', reviewer: '검토자', member: '실무자', viewer: '열람자' };
export const dateTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
export const shortId = (value) => value ? String(value).slice(0, 8) : '—';
export const projectPath = (id) => `/api/projects/${encodeURIComponent(id)}`;
const BADGE_STATUS = { green: 'success', amber: 'warning', red: 'destructive', blue: 'info' };
export function Badge({ status, children, tone }) {
  const mapped = STATUS[status] || [status || '—', 'quiet'], effectiveTone = tone || mapped[1];
  return <CTDSBadge size="md" variant="soft" status={BADGE_STATUS[effectiveTone]} className={`badge ${effectiveTone}`} data-ctds="badge">{['running', 'extracting', 'processing'].includes(status) ? <CTDSSpinner size="sm" aria-hidden="true" role="presentation" /> : <span className="status-dot" aria-hidden="true" />}{children ?? mapped[0]}</CTDSBadge>;
}
export function Spinner({ label = '불러오는 중입니다' }) { return <div className="loading" role="status"><CTDSSpinner size="lg" aria-hidden="true" role="presentation" /><span>{label}</span></div>; }
export const Notice = React.forwardRef(function Notice({ children, className = '', tone, icon = null, title, ...props }, ref) {
  const classes = new Set(className.split(/\s+/));
  const resolvedTone = tone || (classes.has('error') ? 'destructive' : classes.has('warning') ? 'warning' : classes.has('success') ? 'success' : 'neutral');
  return <CTDSCallout {...props} ref={ref} className={className} tone={resolvedTone} icon={icon} title={title} data-ctds="callout">{children}</CTDSCallout>;
});
export function ErrorNotice({ error, onRetry }) {
  if (!error) return null;
  return <CTDSCallout data-ctds="callout" tone="destructive" role="alert" title={String(error.message || error).replaceAll('기준선', '확정본').replaceAll('리비전', '버전')}
    actions={onRetry ? <CTDSButton data-ctds="button" type="button" size="sm" variant="ghost" onClick={onRetry}>다시 불러오기</CTDSButton> : null}>
    {error.code ? <Disclosure><summary>오류 코드 보기</summary><small>{error.code}</small></Disclosure> : null}
  </CTDSCallout>;
}
export function Empty({ icon: Icon, title, children, action, compact = false }) {
  return <CTDSEmptyState size={compact ? 'sm' : 'md'} className={`empty ${compact ? 'compact' : ''}`} data-ctds="empty" illustration={Icon ? <Icon size={24} strokeWidth={1.5} /> : undefined} title={<h3>{title}</h3>} description={children} actions={action} />;
}
export function Button({ children, icon: Icon, busy, variant = 'primary', className = '', ...props }) {
  // Existing AINS forms rely on HTML's implicit submit default.
  return <CTDSButton {...props} type={props.type ?? 'submit'} size="sm" variant={{ secondary: 'outline', danger: 'destructive' }[variant] || variant} className={`button ${variant} ${className}`} data-ctds="button" loading={Boolean(busy)} leftIcon={Icon ? <Icon size={16} /> : undefined} disabled={props.disabled || busy}>{children}</CTDSButton>;
}
export function Modal({ title, eyebrow, children, onClose, busy = false, wide = false }) {
  const returnFocus = useRef(typeof document === 'undefined' ? null : document.activeElement);
  return <CTDSModal.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }} disableEscape={busy} closeOnOutside={!busy} className={`ains-modal ${wide ? 'wide' : ''}`} data-ctds="modal" onCloseAutoFocus={(event) => {
    event.preventDefault();
    if (returnFocus.current?.isConnected) returnFocus.current.focus?.();
  }}>
    <CTDSModal.Header title={title} eyebrow={eyebrow} dismissible={!busy} dismissLabel="닫기" />
    <div className="ains-modal-content">{children}</div>
  </CTDSModal.Root>;
}

export function FormField({ label, hint, children, className = '', ...props }) {
  const generatedId = useId(), child = React.Children.count(children) === 1 ? React.Children.toArray(children)[0] : null;
  const isControl = React.isValidElement(child) && ['input', 'textarea', 'select', Input, Textarea, Select].includes(child.type);
  if (!isControl) return <label className={`field ${className}`} {...props}><span>{label}</span>{children}{hint ? <Hint>{hint}</Hint> : null}</label>;
  const id = child.props.id || generatedId, hintId = `${id}-hint`, labelId = `${id}-label`;
  const controlProps = { ...child.props, id, 'aria-describedby': [child.props['aria-describedby'], hint ? hintId : null].filter(Boolean).join(' ') || undefined };
  if ((child.type === 'select' || child.type === Select) && !child.props['aria-label'] && !child.props['aria-labelledby']) controlProps['aria-labelledby'] = labelId;
  const Component = { input: Input, textarea: Textarea, select: Select }[child.type];
  const control = Component ? <Component {...controlProps} /> : React.cloneElement(child, controlProps);
  return <div className={`field ${className}`} data-ctds="field" {...props}><label id={labelId} htmlFor={id}>{label}</label>{control}{hint ? <Hint id={hintId}>{hint}</Hint> : null}</div>;
}
export function ToastProvider({ children }) { return <CTDSToastProvider duration={7000}>{children}<ToastViewport placement="bottom-right" label="알림" /></CTDSToastProvider>; }
export function Toast({ message, onClose }) {
  return <CTDSToast key={message} open title={message} tone="neutral" dismissLabel="알림 닫기" duration={7000} onOpenChange={open => { if (!open) onClose(); }} />;
}
export function SectionHeading({ eyebrow, title, children }) { return <div className="section-heading"><div><h2>{title}</h2></div>{children}</div>; }
export function TextLink({ children, ...props }) { return <CTDSButton data-ctds="button" type="button" size="sm" variant="ghost" {...props} rightIcon={<ArrowRight size={14} />}>{children}</CTDSButton>; }

const SOURCE_CHECKS = {
  EMPTY_TEXT: '텍스트를 읽지 못한 위치가 있습니다. 이미지나 스캔 내용은 원본에서 확인해 주세요.',
  PDF_LAYOUT_UNVERIFIED: 'PDF의 표 관계, 읽기 순서와 특수 기호는 원본 페이지와 대조해 주세요.',
  IMAGE_NOT_EXTRACTED: '문서 속 이미지의 내용은 추출하지 않았습니다. 원본에서 직접 확인해 주세요.',
  DOCX_TABLE_LAYOUT_UNVERIFIED: '표의 셀 텍스트는 보존했지만 병합 셀과 표의 의미는 원본과 대조해 주세요.',
  DOCX_PARAGRAPHS_GROUPED: '문단이 많은 문서를 원문 순서대로 묶었습니다. 문단·표 셀 위치를 함께 표시했으니 원본과 대조해 주세요.',
  DOCX_AUXILIARY_TEXT_NOT_EXTRACTED: '머리말·꼬리말·각주·주석 등의 부가 내용은 원본에서 확인해 주세요.',
  DOCX_COMPLEX_CONTENT: '텍스트 상자, 수식, 변경 내용 추적 등 복합 요소는 원본에서 확인해 주세요.',
  PPTX_TABLE_LAYOUT_UNVERIFIED: '슬라이드 표의 병합 셀과 항목 간 관계를 원본과 대조해 주세요.',
  PPTX_VISUAL_NOT_EXTRACTED: '슬라이드의 그림·차트·첨부 개체는 원본에서 확인해 주세요.',
  PPTX_NOTES_NOT_EXTRACTED: '발표자 노트는 원본 슬라이드에서 확인해 주세요.',
  PPTX_LAYOUT_UNVERIFIED: '슬라이드 배치·애니메이션·읽기 순서는 원본과 대조해 주세요.',
  XLSX_DISPLAY_UNVERIFIED: '시트의 표시 형식과 계산 결과는 검증하지 않았습니다. 원본 값을 대조해 주세요.',
  XLSX_FORMULA_UNVERIFIED: '수식을 실행하지 않았으며 저장된 계산 값이 최신인지 확인이 필요합니다.',
  XLSX_NONCELL_CONTENT_NOT_EXTRACTED: '시트의 그림·차트·주석·매크로는 원본에서 확인해 주세요.',
  XLSX_HIDDEN_SHEETS_INCLUDED: '숨겨진 시트의 셀도 추출된 내용에 포함되어 있습니다.',
  MATCH_REQUIRES_REVIEW: '변경 전후의 항목이 같은 요구사항인지 원문을 대조해 주세요.',
};

export function SourceNotices({ warnings = [], incomplete = false }) {
  const originals = [...new Set(warnings.filter((value) => typeof value === 'string'))];
  const codes = new Set(originals.map((value) => value.match(/\b[A-Z][A-Z0-9_]+(?=:)/)?.[0] || 'OTHER'));
  const checks = [...codes].filter((code) => !['CONTENT_IS_UNTRUSTED', 'MOCK_DATA_UNVERIFIED'].includes(code));
  if (!originals.length && !incomplete) return null;
  return <section className="source-notices" aria-label="문서 처리 안내와 확인 사항">
    {codes.has('CONTENT_IS_UNTRUSTED') ? <CTDSCallout tone="neutral" icon="info" title="문서 속 명령은 자동 실행하지 않습니다.">문서 안의 요청과 지시문도 원문 자료로 보존합니다. 문서 등록만으로 코드 변경이나 외부 작업이 시작되지는 않습니다.</CTDSCallout> : null}
    {codes.has('MOCK_DATA_UNVERIFIED') ? <CTDSCallout tone="warning" title="예시와 수치의 실제 적용 여부를 확인해 주세요.">자동 추출은 문서 속 값이 예시인지 실제 업무 기준인지 판단하지 않습니다. 원문을 확인하고 필요한 내용을 확정해 주세요.</CTDSCallout> : null}
    {incomplete || checks.length ? <CTDSCallout tone="warning" title={incomplete ? '일부 내용과 형식은 원본에서 확인해야 합니다.' : '추출·검토 과정에서 추가 확인할 항목이 있습니다.'}>
      {checks.length ? <List>{checks.map((code) => <ListItem key={code}>{SOURCE_CHECKS[code] || '아래 기술 세부정보의 추가 안내를 확인하고 관련 원문을 대조해 주세요.'}</ListItem>)}</List> : <p>표·이미지·레이아웃 등 추출되지 않은 내용이 있는지 원본을 확인해 주세요.</p>}
    </CTDSCallout> : null}
    {originals.length ? <Disclosure className="source-notice-technical"><summary>기술 세부정보 · 원본 안내 {originals.length}건</summary><List>{originals.map((value, index) => <ListItem key={index}><code>{value}</code></ListItem>)}</List></Disclosure> : null}
  </section>;
}

export function JobExecution({ job }) {
  const execution = job.execution || {};
  const hasExecutionId = Boolean(execution.trace_id || execution.run_id);
  const timestamp = (value) => value ? new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul', hour12: false }).format(new Date(value)) + ' KST' : '기록 없음';
  return <section className="execution-record" aria-label="Nora 실행 기록"><h3>Nora 실행 기록</h3><dl>
    {execution.trace_id ? <><dt>검토 Trace ID</dt><dd><code>{execution.trace_id}</code></dd></> : null}
    {execution.run_id ? <><dt>파이프라인 Run ID</dt><dd><code>{execution.run_id}</code></dd></> : null}
    <dt>작업 ID</dt><dd><code>{job.id}</code></dd>
    <dt>실행 횟수</dt><dd>{job.attempt ?? 0}회</dd>
    <dt>작업 등록 시각</dt><dd><time dateTime={job.created_at}>{timestamp(job.created_at)}</time></dd>
    <dt>최근 갱신 시각</dt><dd><time dateTime={job.updated_at}>{timestamp(job.updated_at)}</time></dd>
  </dl>{!hasExecutionId ? <p>실행 ID가 반환되지 않았습니다. Nora 실행 이력에서 작업 시각과 문서를 기준으로 실행 여부를 확인해 주세요.</p> : <p>위 실행 ID로 Nora 실행 이력을 찾아 완료 여부를 확인해 주세요.</p>}</section>;
}

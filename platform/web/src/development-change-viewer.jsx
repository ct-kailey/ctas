import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Code2, ExternalLink, Monitor, RefreshCw } from 'lucide-react';
import { Badge, Button, Disclosure, Empty, FormField, Notice, Select, shortId } from './ui';
import { Button as CTDSButton } from './components/ctds/Button/Button';
import { CHANGE_AREAS, developmentEvidence, developmentPreviewState, parseDevelopmentDiff } from './development-change-viewer-state.mjs';
import './development-change-viewer.css';

const FILE_STATUS = { added: '새 파일', deleted: '삭제', renamed: '이름 변경', modified: '수정', reported: '목록만 제공' };
const PREVIEW_STATUS = { passed: ['미리보기 검사 통과', 'green'], pending: ['미리보기 검사 대기', 'amber'], failed: ['미리보기 검사 실패', 'red'], unavailable: ['미리보기 검사 미연결', 'quiet'] };

function CodePane({ file, side }) {
  const before = side === 'before', title = before ? '변경 전' : '변경 후';
  const absent = before ? file.status === 'added' : file.status === 'deleted';
  return <section className={`development-code-pane ${side}`} aria-label={`${file.path} ${title}`}>
    <div className="development-code-pane-heading"><strong>{title}</strong><span>{before ? `삭제 ${file.deletions}줄` : `추가 ${file.additions}줄`}</span></div>
    {absent ? <p className="development-code-absent">{before ? '이전에 없던 새 파일입니다.' : '파일이 삭제되었습니다.'}</p> : null}
    {/* CTDS has no aligned diff component. This local, read-only code layout uses CTDS tokens and plain React text. */}
    <pre className="development-code-lines" tabIndex={0} aria-label={`${title} 코드 발췌`}><code>{file.rows.map((row, index) => {
      if (row.header) return <span key={index} className="development-code-hunk">{row.header}</span>;
      const line = row[side];
      return <span key={index} className={`development-code-line${line?.changed ? ' changed' : ''}${!line ? ' blank' : ''}`}>
        <span className="development-code-number" aria-hidden="true">{line?.number ?? ''}</span>
        <span className="development-code-sign" aria-hidden="true">{line?.changed ? before ? '−' : '+' : ' '}</span>
        <span>{line?.text ?? ' '}</span>
      </span>;
    })}</code></pre>
  </section>;
}

function FileChange({ file, index, total }) {
  const area = CHANGE_AREAS.find(item => item.id === file.area)?.label;
  return <article className="development-change-card" aria-label={`${index + 1}번째 변경 파일`}>
    <header className="development-change-card-heading">
      <span className="development-change-sequence" aria-label={`${total}개 파일 중 ${index + 1}번째`}>{String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</span>
      <div className="development-change-file-title"><h4>{file.path}</h4>{file.status === 'renamed' ? <p>이전 경로: <code>{file.oldPath}</code></p> : null}</div>
      <div className="development-change-badges"><Badge>{area}</Badge><Badge>{FILE_STATUS[file.status]}</Badge></div>
    </header>
    {file.invalid || file.incomplete ? <Notice tone="warning" title={file.invalid ? '변경 내역 형식을 확인해야 합니다.' : '변경 내역이 일부만 전달되었습니다.'}>확인할 수 있는 코드만 표시합니다. 전체 변경 내용은 저장소에서 대조해 주세요.</Notice> : null}
    {file.binary ? <Empty compact icon={Code2} title="바이너리 파일은 코드로 비교할 수 없습니다.">이미지·첨부 파일 등은 저장소의 원본으로 확인해 주세요.</Empty>
      : file.rows.length ? <div className="development-code-comparison"><CodePane file={file} side="before" /><CodePane file={file} side="after" /></div>
        : <Empty compact icon={Code2} title={file.status === 'reported' ? '이 파일의 코드 변경 내역이 제공되지 않았습니다.' : file.status === 'renamed' ? '파일 이름이 변경되었습니다.' : '비교할 텍스트 변경 내역이 없습니다.'}>{file.metadata.length ? file.metadata.join(' · ') : '코드 내용이 제공되면 변경 전후를 이곳에서 확인할 수 있습니다.'}</Empty>}
    {file.excerpted ? <p className="development-change-caption">긴 변경 내용은 일부만 표시합니다. 아래 원본 diff나 저장소에서 이어서 확인해 주세요.</p> : null}
  </article>;
}

function WorkingPreview({ artifact, state }) {
  const [loaded, setLoaded] = useState(false), [generation, setGeneration] = useState(0), [phase, setPhase] = useState('idle');
  const status = PREVIEW_STATUS[artifact?.preview_status];
  const load = () => { setPhase('loading'); setLoaded(true); setGeneration(value => value + 1); };
  return <section className="development-preview ains-section-stack" aria-label="개발 화면 미리보기">
    <header className="development-change-heading"><div><h3>개발 화면 미리보기</h3><p>등록된 웹 화면을 직접 열어 동작을 확인합니다.</p></div>{status ? <Badge tone={status[1]}>{status[0]}</Badge> : <Badge>미리보기 검사 상태 미제공</Badge>}</header>
    {state.url ? <>
      <div className="development-preview-toolbar"><span className="development-preview-origin"><Monitor size={16} aria-hidden="true" /><code>{state.origin}</code></span><div className="development-change-actions">
        {state.framePath ? <Button type="button" variant={loaded ? 'secondary' : 'primary'} icon={loaded ? RefreshCw : Monitor} onClick={load}>{loaded ? '미리보기 새로고침' : '미리보기 불러오기'}</Button> : null}
        <CTDSButton asChild size="sm" variant="outline"><a href={state.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true" />새 창에서 열기</a></CTDSButton>
      </div></div>
      {state.framePath ? <>
        {loaded ? <div className="development-preview-window" aria-busy={phase === 'loading'}>
          <div className="development-preview-window-status" role="status">{phase === 'loading' ? '화면을 불러오는 중입니다…' : phase === 'error' ? '화면을 불러오지 못했습니다. 새 창에서 확인해 주세요.' : '화면 불러오기를 요청했습니다. 실제 표시와 동작을 확인해 주세요.'}</div>
          <iframe key={generation} src={state.framePath} title="개발 결과 웹 화면" sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" onLoad={() => setPhase('loaded')} onError={() => setPhase('error')} />
        </div> : <div className="development-preview-placeholder"><Empty compact icon={Monitor} title="아직 미리보기를 불러오지 않았습니다.">위의 ‘미리보기 불러오기’를 누르면 등록된 개발 화면이 열립니다.</Empty></div>}
        <p className="development-change-caption">외부 서비스에서 화면 삽입을 막거나 로그인이 필요한 경우 새 창에서 확인해 주세요. 이 화면을 여는 것만으로 승인되거나 병합되지는 않습니다.</p>
      </> : <Notice title="새 창에서 개발 화면을 확인해 주세요.">이 작업에는 내부 미리보기 연결 경로가 제공되지 않았습니다.</Notice>}
    </> : <Empty compact icon={Monitor} title={state.reason === 'same_host' ? '작업실과 같은 호스트는 미리보기로 열 수 없습니다.' : state.reason === 'not_allowed' ? '프로젝트에서 허용한 미리보기 주소가 아닙니다.' : '아직 사용할 수 있는 웹 미리보기가 없습니다.'}>{state.reason === 'same_host' ? '포트가 달라도 같은 호스트의 주소는 사용할 수 없습니다. 별도의 개발 화면 주소를 연결해 주세요.' : state.reason === 'not_allowed' ? '프로젝트의 미리보기 허용 주소와 개발 결과 주소를 확인해 주세요.' : '개발 화면이 배포되고 주소가 연결되면 여기에서 동작을 확인할 수 있습니다.'}</Empty>}
  </section>;
}

function PrivateDevelopmentChangeViewer({ artifact, previewOrigins, previewFramePath }) {
  const parsed = useMemo(() => parseDevelopmentDiff(artifact?.diff, artifact?.changed_files), [artifact?.diff, artifact?.changed_files]);
  const [selectedPath, setSelectedPath] = useState(null);
  const selectedIndex = Math.max(0, parsed.files.findIndex(file => file.path === selectedPath));
  const selected = parsed.files[selectedIndex], evidence = developmentEvidence(artifact);
  const preview = developmentPreviewState({ artifact, previewOrigins, previewFramePath, appOrigin: typeof window === 'undefined' ? null : window.location.origin });
  const previewKey = [artifact?.head_sha, artifact?.base_sha, artifact?.preview_url, preview.framePath, preview.reason].join('|');
  return <div className="development-change-viewer ains-section-stack">
    <section className="ains-section-stack" aria-label="코드 변경 전후">
      <header className="development-change-heading"><div><h3>코드 변경 전후</h3><p>실제 코드 변경 부분을 비교합니다. 실행 화면의 전후 캡처는 아닙니다.</p></div><Badge tone={evidence.tone}>{evidence.label}</Badge></header>
      <div className="development-change-facts"><span>변경 파일 <strong>{parsed.files.length}개</strong></span><span className="development-change-added">추가 <strong>+{parsed.additions}줄</strong></span><span className="development-change-deleted">삭제 <strong>−{parsed.deletions}줄</strong></span>{artifact?.target_branch ? <span>대상 브랜치 <code>{artifact.target_branch}</code></span> : null}</div>
      {artifact?.base_sha || artifact?.head_sha ? <p className="development-change-caption">비교 커밋 <code title={artifact.base_sha || ''}>{shortId(artifact.base_sha)}</code> → <code title={artifact.head_sha || ''}>{shortId(artifact.head_sha)}</code>{!artifact.head_sha ? ' · 변경 커밋 미제공' : ''}</p> : null}
      {parsed.incomplete || parsed.invalid ? <Notice tone="warning" title="전체 변경 내용은 원본과 대조해 주세요.">전달된 diff가 불완전하거나 형식·표시 한도를 넘어 일부만 표시됩니다. 줄 수는 읽을 수 있는 부분을 기준으로 집계했습니다.</Notice> : null}
      {parsed.files.length ? <>
        <div className="development-change-picker"><FormField label="변경 파일" hint="화면·서버·DB는 파일 경로를 기준으로 분류합니다."><Select value={selected.path} onChange={event => setSelectedPath(event.target.value)}>{parsed.files.map((file, index) => <option key={`${index}:${file.path}`} value={file.path}>{index + 1}. [{CHANGE_AREAS.find(area => area.id === file.area)?.label}] {file.path}</option>)}</Select></FormField><div className="development-change-actions">
          <Button type="button" variant="secondary" icon={ArrowLeft} disabled={selectedIndex === 0} onClick={() => setSelectedPath(parsed.files[selectedIndex - 1].path)}>이전 파일</Button>
          <Button type="button" variant="secondary" icon={ArrowRight} disabled={selectedIndex === parsed.files.length - 1} onClick={() => setSelectedPath(parsed.files[selectedIndex + 1].path)}>다음 파일</Button>
        </div></div>
        <FileChange file={selected} index={selectedIndex} total={parsed.files.length} />
      </> : <Empty compact icon={Code2} title="아직 비교할 코드 변경 내역이 없습니다.">실제 개발 결과가 연결되면 변경 파일과 코드 전후를 표시합니다.</Empty>}
      {parsed.raw.trim() ? <Disclosure><summary>원본 diff 보기{parsed.rawTruncated ? ' · 일부 표시' : ''}</summary><pre className="development-raw-diff" tabIndex={0}><code>{parsed.raw}</code></pre>{parsed.rawTruncated ? <p className="development-change-caption">긴 원본은 앞부분만 표시합니다. 전체 diff는 저장소에서 확인해 주세요.</p> : null}</Disclosure> : null}
    </section>
    <WorkingPreview key={previewKey} artifact={artifact} state={preview} />
  </div>;
}

export function DevelopmentChangeViewer({ artifact, previewOrigins = [], sharedView = false, previewFramePath }) {
  // Do not parse sensitive content or mount preview links/frames for public shares.
  if (sharedView) return <Notice title="코드와 개발 화면은 프로젝트 구성원에게만 표시됩니다.">공유 화면에서는 개발 진행 상태와 공개된 결과 요약을 확인할 수 있습니다.</Notice>;
  return <PrivateDevelopmentChangeViewer artifact={artifact} previewOrigins={previewOrigins} previewFramePath={previewFramePath} />;
}

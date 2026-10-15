// Local browser regression fixture. Real board/components, synthetic read-only data;
// not a production build entry, no authentication or network calls.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from './ui.jsx';
import { ConfirmationProvider } from './confirmation.jsx';
import { TaskAutomationBoard } from './task-automation.jsx';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './components/ctds/tokens.css';
import './appearance.css';
import './styles.css';
import './ctds-spacing-fixture.css';

const request = async (path, options = {}) => {
  if (options.method && options.method !== 'GET') throw new Error('Fixture is read-only');
  if (path.includes('/task-drafts')) return { items: [1, 2].map(id => ({ id: `draft-${id}`, key: `TEST-${id}`, title: '프로젝트·고객·역할별 접근과 데이터 격리 검증', source_title: '긴 문서 제목과 출처가 여러 줄로 표시되어도 카드 안쪽 간격을 유지합니다.', depends_on: [] })), total: 2, has_more: false };
  if (path.includes('/implementation-notes')) return { items: [], total: 0, has_more: false };
  if (path.endsWith('/task-automation')) return { tasks: [], analyses: [], intake: [], settings: {}, capabilities: { blockers: ['Nora 워크스페이스의 GitHub 커넥터를 선택하세요.', '코드 업로드·PR 조회·CI 검사·미리보기 배포 조회가 가능한 연결을 설정하세요.'] } };
  throw new Error('Unknown fixture request');
};
const noOp = () => {};
function Fixture() {
  const [report, setReport] = useState([]);
  async function verify() {
    const results = [], root = document.documentElement, original = root.dataset.density;
    try { for (const density of ['compact', 'default', 'comfortable']) {
    root.dataset.density = density;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (const sample of document.querySelectorAll('.spacing-sample')) {
      const section = sample.querySelector('.task-automation'), notice = section.querySelector('[data-ctds="callout"]'), board = sample.querySelector('.task-auto-board'), card = sample.querySelector('.task-auto-card'), ordinary = sample.querySelector('.spacing-ordinary');
      const label = `${density}/${sample.dataset.width}`;
      if (!board || !card) { results.push({ label, pass: false, reason: 'Wait for board data' }); continue; }
      const gap = board.getBoundingClientRect().top - notice.getBoundingClientRect().bottom;
      const padding = ['Top', 'Right', 'Bottom', 'Left'].map(side => parseFloat(getComputedStyle(card)[`padding${side}`]));
      const token = parseFloat(getComputedStyle(sample.querySelector('.spacing-token-probe')).paddingTop);
      const inner = card.firstElementChild, box = card.getBoundingClientRect(), content = inner.getBoundingClientRect();
      const within = content.top > box.top && content.bottom < box.bottom && content.left > box.left && content.right < box.right;
      const actions = notice.lastElementChild;
      const checks = { sectionGap: Math.abs(gap - parseFloat(getComputedStyle(section).gap)) < 0.1 && gap > 0, uniformTokenInset: padding.every(value => Math.abs(value - token) < 0.1), contentContained: within && card.scrollHeight <= card.clientHeight, actionsSlot: !actions.querySelector('ul') && Boolean(actions.querySelector('button')), overflowContained: section.scrollWidth <= section.clientWidth + 1 && board.scrollWidth > board.clientWidth, ordinaryButtonUnchanged: !ordinary.className.includes('cardLayout') && Math.abs(ordinary.getBoundingClientRect().height - parseFloat(getComputedStyle(sample.querySelector('.spacing-token-probe')).height)) < 0.1 };
      results.push({ label, pass: Object.values(checks).every(Boolean), gap, padding, checks });
    }
    } } finally { root.dataset.density = original; }
    setReport(results);
  }
  return <ConfirmationProvider><main className="spacing-fixture ains-section-stack"><h1>CTDS 간격 검증</h1><p>실제 작업 보드에 테스트 데이터만 제공합니다. 세 가지 밀도와 좁은 화면을 함께 검사합니다.</p><Button type="button" onClick={verify}>실제 간격 검사</Button><output>{report.length ? `${report.filter(item => item.pass).length}/${report.length} 통과` : '검사 대기'}</output><pre>{JSON.stringify(report, null, 2)}</pre>
    {['wide', 'narrow'].map(width => <section key={width} className="spacing-sample ains-section-stack" data-width={width}><h2>{width}</h2><div className="spacing-token-probe" aria-hidden="true" /><Button className="spacing-ordinary" type="button">일반 버튼</Button><TaskAutomationBoard projectId="synthetic-spacing" request={request} role="viewer" notify={noOp} onSettings={noOp} /></section>)}
  </main></ConfirmationProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);

import React, { useId, useState } from 'react';
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { ArrowRight, GripVertical } from 'lucide-react';
import { Badge, Button, ControlButton, dateTime } from './ui.jsx';
import { TaskAreaSummary } from './task-areas.jsx';
import { AUTOMATION_COLUMNS, automationBoardAction, automationCanRequestStart, automationColumn, automationExecutionLabel, automationKeyboardCoordinates } from './task-automation-state.mjs';

const screenReaderInstructions = { draggable: '스페이스 또는 엔터로 카드를 집습니다. 왼쪽·오른쪽 방향키로 열을 선택하고 스페이스 또는 엔터로 놓습니다. Esc로 취소합니다. 진행 중에 놓으면 개발 시작 전 확인을 진행합니다.' };
const laneLabel = id => AUTOMATION_COLUMNS.find(([status]) => `lane:${status}` === id)?.[1];
const collisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : rectIntersection(args);

function TaskColumn({ status, label, count, active, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${status}`, data: { status } });
  return <section ref={setNodeRef} className={`task-auto-column${active && status === 'in_progress' ? ' task-auto-drop-target' : ''}${active && isOver ? ' task-auto-drop-over' : ''}`} aria-label={label}>
    <header><h3>{label}</h3><Badge tone="quiet">{count}</Badge></header>
    <div className="task-auto-cards">{children}</div>
    {active && status === 'in_progress' ? <p className="task-auto-help">여기에 놓으면 개발 준비 상태를 확인합니다.</p> : !count ? <p className="task-auto-help">작업 없음</p> : null}
  </section>;
}

function TaskCard({ kind, item, canMove, busy, area, areasUnavailable, onSelect, onMove }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id: `${kind}:${item.id}`, disabled: !canMove || busy, data: { kind, id: item.id, title: item.title } });
  const pointerListeners = canMove ? { onMouseDown: listeners?.onMouseDown, onTouchStart: listeners?.onTouchStart } : {};
  const draft = kind === 'draft', status = draft ? 'todo' : automationColumn(item);
  return <div ref={setNodeRef} className="task-auto-card-group" data-dragging={isDragging || undefined}>
    {canMove ? <ControlButton ref={setActivatorNodeRef} type="button" variant="ghost" className="task-auto-drag-handle" disabled={busy} {...attributes} {...listeners} aria-label={`${item.title} · 드래그로 이동`}><GripVertical size={16} aria-hidden="true" /><span>드래그로 이동</span></ControlButton> : null}
    <ControlButton type="button" variant="outline" layout="card" className="task-auto-card" disabled={busy} {...pointerListeners} onClick={() => { if (!isDragging) onSelect(item.id); }}>
      <span>{draft ? <Badge tone="amber">Nora 검증 전</Badge> : null}<strong>{item.title}</strong>
        {draft ? <><small>{item.source_title} · 출처 기반 초안</small><small>{item.key}{item.depends_on?.length ? ` · 선행 작업 ${item.depends_on.length}개` : ''}</small><small>개발 전 정책 분석이 필요합니다.</small></> : <>
          {item.requires_provisional_confirmation ? <Badge tone="amber">검토 필요</Badge> : null}<small>{automationExecutionLabel(item)}</small>
          <TaskAreaSummary value={area} unavailable={areasUnavailable} />
          <small>{status === 'qa' ? '코드·자동 이력 확인 · 검증 후 병합 승인' : status === 'done' ? '기준 브랜치 병합 확인됨' : `${dateTime(item.updated_at)} 갱신`}</small>
        </>}
      </span>
    </ControlButton>
    {canMove ? <Button type="button" variant="ghost" icon={ArrowRight} disabled={busy} aria-label={`${item.title} · ${draft ? '개발 준비 확인' : '진행 중으로 이동하고 AI 개발 시작'}`} onClick={() => onMove(item)}>{draft ? '개발 준비 확인' : '진행 중으로 이동'}</Button> : null}
  </div>;
}

// CTDS has no Kanban primitive. Compose CTDS controls with dnd-kit sensors;
// the server remains authoritative for development, review and merge states.
export function TaskAutomationKanban({ tasks, drafts, areas, areasUnavailable, permissions, busy, onStart, onDraftStart, onSelectTask, onSelectDraft, onInvalidMove }) {
  const id = useId(), [active, setActive] = useState(null);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: automationKeyboardCoordinates }));
  function finish({ active: dragged, over }) {
    setActive(null);
    const source = dragged.data.current;
    if (!source) return;
    const item = (source.kind === 'draft' ? drafts : tasks).find(value => value.id === source.id);
    const action = automationBoardAction({ kind: source.kind, item, target: over?.data.current?.status, permissions, busy });
    if (action === 'start') onStart(item);
    if (action === 'prepare_draft') onDraftStart(item);
    if (action === 'unavailable') onInvalidMove?.('이 열은 실행 결과에 따라 갱신됩니다. 할 일을 진행 중으로 옮겨 개발을 시작해 주세요.');
  }
  const announcements = {
    onDragStart: ({ active: item }) => `${item.data.current?.title || '작업'} 카드를 집었습니다.`,
    onDragOver: ({ over }) => over ? `${laneLabel(over.id)} 열입니다.${over.id === 'lane:in_progress' ? ' 놓으면 개발 준비를 확인합니다.' : ''}` : '열 밖입니다. 놓으면 이동을 취소합니다.',
    onDragEnd: ({ over }) => over?.id === 'lane:in_progress' ? '개발 준비 상태를 확인합니다.' : '작업 상태를 변경하지 않았습니다.',
    onDragCancel: () => '이동을 취소했습니다.',
  };
  return <DndContext id={id} sensors={sensors} collisionDetection={collisionDetection} accessibility={{ screenReaderInstructions, announcements }} onDragStart={({ active: item }) => setActive(item.data.current)} onDragCancel={() => setActive(null)} onDragEnd={finish}>
    <div className="task-auto-board" role="region" aria-label="AI 개발 작업 칸반" tabIndex={0}>{AUTOMATION_COLUMNS.map(([status, label]) => {
      const column = tasks.filter(task => automationColumn(task) === status), sourceDrafts = status === 'todo' ? drafts : [];
      return <TaskColumn key={status} status={status} label={label} count={column.length + sourceDrafts.length} active={active}>
        {sourceDrafts.map(item => <TaskCard key={`draft:${item.id}`} kind="draft" item={item} canMove={permissions.canWrite} busy={busy} onSelect={onSelectDraft} onMove={onDraftStart} />)}
        {column.map(item => <TaskCard key={`task:${item.id}`} kind="task" item={item} canMove={automationCanRequestStart(item, permissions)} busy={busy} area={areas?.find(value => value.task_id === item.id)} areasUnavailable={areasUnavailable} onSelect={onSelectTask} onMove={onStart} />)}
      </TaskColumn>;
    })}</div>
    <DragOverlay dropAnimation={null}>{active ? <div className="task-auto-drag-preview"><ControlButton type="button" variant="outline" layout="card" className="task-auto-card" tabIndex={-1} aria-hidden="true"><strong>{active.title}</strong><small>진행 중에 놓아 개발 준비 확인</small></ControlButton></div> : null}</DragOverlay>
  </DndContext>;
}

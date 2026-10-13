"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import {
  Badge,
  Button,
  Callout,
  Icon,
  Input,
  Modal,
  Radio,
  Select,
  Spinner,
  Textarea,
} from "@/components/ctds";
import { PROJECTS, getProject, type Draft, type MeetingType } from "@/lib/mock";
import { useAins } from "./AinsContext";
import s from "./page.module.css";

type Kind = "meeting" | "call" | "chat";
type Step = "form" | "working" | "done";

const KIND_LABEL: Record<Kind, string> = {
  meeting: "회의록",
  call: "전화 메모",
  chat: "대화 붙여넣기",
};

/**
 * 자료 넣기 — 회의록 · 전화 메모 · 붙여넣은 대화(카톡, 슬랙)의 단일 입구.
 * 넣으면 저장 → 결정 · 할 일 뽑기 → 점검이 한 번에 된다.
 * 프리뷰: 실제 AI 처리 대신 예시 결과를 보여 준다.
 */
export function IntakeModal({
  open,
  initialProjectId,
  onOpenChange,
}: {
  open: boolean;
  initialProjectId?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { addAlert, openDraft } = useAins();

  const [wasOpen, setWasOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [kind, setKind] = useState<Kind>("meeting");
  const [meetingType, setMeetingType] = useState<MeetingType>("client");
  const [date, setDate] = useState("");
  const [people, setPeople] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // 창이 새로 열릴 때마다 처음 상태로
  if (open && !wasOpen) {
    setWasOpen(true);
    setStep("form");
    setProjectId(initialProjectId ?? PROJECTS[0].id);
    setKind("meeting");
    setMeetingType("client");
    setDate("");
    setPeople("");
    setText("");
    setFileName("");
  }
  if (!open && wasOpen) setWasOpen(false);

  const project = getProject(projectId) ?? PROJECTS[0];
  const hasContent = text.trim() !== "" || fileName !== "";
  const needsConfirmMail =
    (kind === "meeting" && meetingType === "client") || kind === "call";

  const submit = () => {
    setStep("working");
    // 프리뷰: 실제 처리 대신 잠깐 기다렸다가 예시 결과를 보여 준다
    setTimeout(() => {
      setStep("done");
      addAlert({
        id: `new-${Date.now()}`,
        projectId: project.id,
        grade: "check",
        ruleId: "Y1",
        title: `새 ${KIND_LABEL[kind]}에 범위 밖일 수 있는 내용이 있어요`,
        body: "방금 넣은 자료에서 합의된 범위에 없는 요청을 찾았어요. 추가 요청인지 확인해 주세요. (프리뷰 예시)",
        date: "오늘",
        tab: "materials",
      });
    }, 900);
  };

  const confirmDraft: Draft = {
    label: "확인 메일 초안",
    to: project.settings.clientEmails[0] ?? "",
    subject: `[${project.client}] ${kind === "call" ? "통화" : "회의"} 내용 확인 부탁드립니다`,
    body: `안녕하세요, 오늘 ${kind === "call" ? "통화" : "회의"}에서 정한 내용 정리드립니다.\n\n- (AINS가 뽑은 결정 1)\n- (AINS가 뽑은 결정 2)\n\n다르게 이해하신 부분이 있으면 회신 부탁드립니다.`,
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="자료 넣기"
      description={
        step === "done"
          ? "저장하고, 결정을 뽑고, 점검까지 마쳤어요."
          : "메일은 자동으로 들어와요. 그 밖의 자료를 여기에 넣어 주세요."
      }
      footer={
        step === "done" ? (
          <>
            {needsConfirmMail && (
              <Button
                variant="outline"
                leftIcon={<Icon name="envelope" />}
                onClick={() => {
                  onOpenChange(false);
                  openDraft(confirmDraft);
                }}
              >
                확인 메일 초안 보기
              </Button>
            )}
            <Button variant="primary" asChild>
              <Link href={`/projects/${project.id}?tab=decisions`} onClick={() => onOpenChange(false)}>
                결정 확인하러 가기
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              leftIcon={<Icon name="upload-simple" />}
              disabled={!hasContent}
              loading={step === "working"}
              onClick={submit}
            >
              넣기
            </Button>
          </>
        )
      }
    >
      {step === "done" ? (
        <Result project={project.client} kind={kind} needsConfirmMail={needsConfirmMail} />
      ) : step === "working" ? (
        <div className={s.row}>
          <Spinner />
          <span className={s.muted}>읽고 정리하는 중이에요…</span>
        </div>
      ) : (
        <div className={s.stack}>
          <Select label="프로젝트" value={projectId} onValueChange={setProjectId}>
            <Select.Trigger />
            <Select.Content>
              {PROJECTS.map((p) => (
                <Select.Item key={p.id} value={p.id}>
                  {p.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>

          <fieldset className={s.fieldset}>
            <legend className={s.legend}>무엇을 넣나요?</legend>
            <div className={s.choices}>
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <Radio
                  key={k}
                  name="intake-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                >
                  {KIND_LABEL[k]}
                </Radio>
              ))}
            </div>
          </fieldset>

          {kind === "meeting" && (
            <fieldset className={s.fieldset}>
              <legend className={s.legend}>어떤 회의인가요?</legend>
              <div className={s.choices}>
                <Radio
                  name="meeting-type"
                  checked={meetingType === "internal"}
                  onChange={() => setMeetingType("internal")}
                >
                  내부 회의
                </Radio>
                <Radio
                  name="meeting-type"
                  checked={meetingType === "client"}
                  onChange={() => setMeetingType("client")}
                >
                  고객 회의
                </Radio>
              </div>
            </fieldset>
          )}

          {kind !== "chat" && (
            <div className={s.grid2}>
              <Input
                label="날짜"
                placeholder="예: 10/12"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                label={kind === "meeting" ? "참석자" : "통화한 사람"}
                placeholder={kind === "meeting" ? "예: 김팀장, 이과장, vara" : "예: 김팀장"}
                value={people}
                onChange={(e) => setPeople(e.target.value)}
              />
            </div>
          )}

          {kind === "meeting" && (
            <div className={s.row}>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.txt,.md,.docx,.pdf"
                className="visually-hidden"
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              />
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Icon name="waveform" />}
                onClick={() => fileRef.current?.click()}
              >
                녹음 · 회의록 파일 올리기
              </Button>
              {fileName ? (
                <Badge variant="soft" status="success">
                  {fileName}
                </Badge>
              ) : (
                <span className={s.meta}>또는 아래에 텍스트를 붙여넣어요</span>
              )}
            </div>
          )}

          <Textarea
            label={
              kind === "meeting" ? "회의 내용" : kind === "call" ? "통화 메모" : "대화 내용"
            }
            description={
              kind === "chat"
                ? "카톡이나 슬랙 대화를 복사해서 붙여넣어요. 메시지 링크도 같이 넣으면 원본 링크로 저장돼요."
                : kind === "call"
                  ? "정한 내용을 몇 줄만 적어도 돼요."
                  : undefined
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            minRows={5}
          />
        </div>
      )}
    </Modal>
  );
}

function Result({
  project,
  kind,
  needsConfirmMail,
}: {
  project: string;
  kind: Kind;
  needsConfirmMail: boolean;
}) {
  return (
    <div className={s.stack}>
      <ul className={s.checklist}>
        <li>
          <Icon name="check-circle" />
          {project} 자료함에 저장했어요
          {kind === "meeting" && " (회사 양식으로 다듬고 드라이브에 사본 저장)"}
        </li>
        <li>
          <Icon name="check-circle" />
          결정 후보 2건을 뽑았어요 — 맞는지 확인해 주세요
        </li>
        {kind === "meeting" && (
          <li>
            <Icon name="check-circle" />
            후속 액션 2건을 할 일에 넣었어요
          </li>
        )}
      </ul>
      <Callout tone="warning" title="점검 결과: 확인할 내용 1건">
        합의된 범위에 없는 요청이 있어요. 알림함에 🟡 확인 필요로 올렸어요.
      </Callout>
      {needsConfirmMail && (
        <Callout tone="brand" icon="envelope" title="고객에게 확인받기">
          고객과 정한 내용이라, 확인 메일 초안을 준비했어요.
        </Callout>
      )}
      <span className={s.meta}>프리뷰라서 결과는 예시예요.</span>
    </div>
  );
}

"use client";

import { useState } from "react";

import { Avatar, Button, Callout, Chip, Icon, Input, Switch } from "@/components/ctds";
import { consentDraft, type Person, type Project } from "@/lib/mock";
import { useAins } from "../../../AinsContext";
import s from "../../../page.module.css";

/**
 * 프로젝트 설정 — 참여자, 고객 담당자, 고객 메일 주소, AI 사용, 고객 답장 기준, 동의 안내.
 * 프리뷰라 저장해도 새로고침하면 처음 값으로 돌아간다.
 */
export function SettingsView({ project }: { project: Project }) {
  const { openDraft } = useAins();
  const [members, setMembers] = useState(project.settings.members);
  const [contacts, setContacts] = useState(project.people.filter((p) => p.side === "client"));
  const [emails, setEmails] = useState(project.settings.clientEmails);
  const [aiAllowed, setAiAllowed] = useState(project.settings.aiAllowed);
  const [checkDays, setCheckDays] = useState(String(project.settings.replyDays.check));
  const [urgentDays, setUrgentDays] = useState(String(project.settings.replyDays.urgent));
  const [saved, setSaved] = useState(false);

  const touch = () => setSaved(false);

  return (
    <div className={s.page}>
      <header className={s.headRow}>
        <div className={s.head}>
          <h1 className={s.title}>{project.client} 설정</h1>
          <p className={s.subtitle}>{project.name}</p>
        </div>
        <Button
          variant="primary"
          leftIcon={<Icon name={saved ? "check" : "check-circle"} />}
          onClick={() => setSaved(true)}
        >
          {saved ? "저장했어요" : "저장"}
        </Button>
      </header>

      <Callout
        tone="brand"
        icon="envelope"
        title="프로젝트를 시작할 때 고객 동의를 받아요"
        actions={
          <Button
            size="xs"
            variant="primary"
            leftIcon={<Icon name="envelope" />}
            onClick={() => openDraft(consentDraft(project))}
          >
            동의 안내 메일 초안
          </Button>
        }
      >
        회의 녹음, 메일 기록, AI 정리를 해도 되는지 한 번에 물어봐요. 답에 따라 아래 AI 사용을 정해요.
      </Callout>

      <div className={s.grid2}>
        <section className={s.panel}>
          <div className={s.head}>
            <h2 className={s.panelTitle}>참여자</h2>
            <span className={s.muted}>이 사람들만 프로젝트를 볼 수 있어요.</span>
          </div>
          <div className={s.stack}>
            {members.map((m) => (
              <div key={m} className={s.panelHead}>
                <div className={s.row}>
                  <Avatar size="sm" name={m} />
                  <span className={s.body}>{m}</span>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setMembers((list) => list.filter((x) => x !== m));
                    touch();
                  }}
                >
                  빼기
                </Button>
              </div>
            ))}
          </div>
          <AddField
            label="참여자 추가"
            placeholder="팀원 이름"
            onAdd={(v) => {
              setMembers((list) => (list.includes(v) ? list : [...list, v]));
              touch();
            }}
          />
        </section>

        <section className={s.panel}>
          <div className={s.head}>
            <h2 className={s.panelTitle}>고객 담당자</h2>
            <span className={s.muted}>
              {project.client} 쪽 사람이에요. 직급 · 역할은 개요의 담당자 이름 옆에 보여요.
            </span>
          </div>
          <div className={s.stack}>
            {contacts.map((c) => (
              <div key={c.name} className={s.contactRow}>
                <Avatar size="sm" name={c.name} />
                <div className={s.contactMain}>
                  <span id={`contact-${c.name}`} className={s.body}>
                    {c.name}
                  </span>
                  {c.email && <span className={s.meta}>{c.email}</span>}
                </div>
                <Input
                  size="sm"
                  aria-labelledby={`contact-${c.name}`}
                  placeholder="직급 · 역할"
                  value={c.role ?? ""}
                  onChange={(e) => {
                    const role = e.target.value;
                    setContacts((list) => list.map((x) => (x.name === c.name ? { ...x, role } : x)));
                    touch();
                  }}
                />
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setContacts((list) => list.filter((x) => x.name !== c.name));
                    touch();
                  }}
                >
                  빼기
                </Button>
              </div>
            ))}
          </div>
          <AddContact
            onAdd={(c) => {
              setContacts((list) => (list.some((x) => x.name === c.name) ? list : [...list, c]));
              // 담당자 메일은 자동으로 가져올 주소에도 넣는다
              if (c.email) setEmails((list) => (list.includes(c.email!) ? list : [...list, c.email!]));
              touch();
            }}
          />
        </section>

        <section className={s.panel}>
          <div className={s.head}>
            <h2 className={s.panelTitle}>고객 메일 주소</h2>
            <span className={s.muted}>
              이 주소에서 온 메일만 Gmail에서 자동으로 가져와요. @seegene.com처럼 회사 주소 전체도 돼요.
            </span>
          </div>
          <div className={s.row}>
            {emails.map((e) => (
              <Chip
                key={e}
                size="sm"
                variant="outline"
                leftIcon={<Icon name="envelope" />}
                onRemove={() => {
                  setEmails((list) => list.filter((x) => x !== e));
                  touch();
                }}
                removeLabel={`${e} 빼기`}
              >
                {e}
              </Chip>
            ))}
          </div>
          <AddField
            label="주소 추가"
            placeholder="예: kim@seegene.com"
            onAdd={(v) => {
              setEmails((list) => (list.includes(v) ? list : [...list, v]));
              touch();
            }}
          />
        </section>

        <section className={s.panel}>
          <div className={s.head}>
            <h2 className={s.panelTitle}>AI 사용</h2>
            <span className={s.muted}>고객사가 외부 AI 사용을 막으면 꺼 주세요.</span>
          </div>
          <div className={s.panelHead}>
            <span className={s.body}>
              {aiAllowed
                ? "허용 — 회의록 다듬기, 결정 뽑기, 점검을 AI로 해요"
                : "금지 — 자료 보관만 하고, 결정은 사람이 직접 적어요"}
            </span>
            <Switch
              checked={aiAllowed}
              onCheckedChange={(v) => {
                setAiAllowed(v);
                touch();
              }}
              aria-label="AI 사용"
            />
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.head}>
            <h2 className={s.panelTitle}>고객 답장 기준</h2>
            <span className={s.muted}>고객사마다 답장 속도가 달라서 여기서만 바꿀 수 있어요.</span>
          </div>
          <div className={s.grid2}>
            <Input
              label="🟡 확인 필요"
              type="number"
              min={1}
              suffix="일"
              value={checkDays}
              onChange={(e) => {
                setCheckDays(e.target.value);
                touch();
              }}
            />
            <Input
              label="🔴 급함"
              type="number"
              min={1}
              suffix="일"
              value={urgentDays}
              onChange={(e) => {
                setUrgentDays(e.target.value);
                touch();
              }}
            />
          </div>
          <span className={s.meta}>
            주말 · 공휴일은 일수에서 빼요. 나머지 알림 기준은 회사 공통이에요 (AINS_알림기준.md).
          </span>
        </section>
      </div>
    </div>
  );
}

function AddField({
  label,
  placeholder,
  onAdd,
}: {
  label: string;
  placeholder: string;
  onAdd: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const add = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  };
  return (
    <div className={s.addField}>
      <Input
        size="sm"
        label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button size="sm" variant="outline" leftIcon={<Icon name="plus" />} onClick={add}>
        추가
      </Button>
    </div>
  );
}

function AddContact({ onAdd }: { onAdd: (person: Person) => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const add = () => {
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      role: role.trim() || undefined,
      email: email.trim() || undefined,
      side: "client",
    });
    setName("");
    setRole("");
    setEmail("");
  };
  return (
    <div className={s.addContact}>
      <Input size="sm" label="이름" placeholder="예: 정대리" value={name} onChange={(e) => setName(e.target.value)} />
      <Input size="sm" label="직급 · 역할" placeholder="예: 대리 · 기획" value={role} onChange={(e) => setRole(e.target.value)} />
      <Input
        size="sm"
        label="메일"
        placeholder="예: jung@seegene.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
      <Button size="sm" variant="outline" leftIcon={<Icon name="plus" />} onClick={add}>
        추가
      </Button>
    </div>
  );
}

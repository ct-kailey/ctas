"use client";

import { useState } from "react";

import { Button, Icon, Input, Modal, Textarea } from "@/components/ctds";
import type { Draft } from "@/lib/mock";
import s from "./page.module.css";

type Target = { draft: Draft; alertId?: string } | null;

/**
 * 메일 초안 창 — 답장 · 재촉 · 확인 · 동의 안내 공용.
 * AINS는 초안만 쓰고, 보내기는 사람이 Gmail에서 직접 한다.
 */
export function DraftModal({
  target,
  onClose,
  onSent,
}: {
  target: Target;
  onClose: () => void;
  onSent: (alertId?: string) => void;
}) {
  const [shown, setShown] = useState<Target>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  // 새 초안이 열리면 입력값을 그 초안으로 바꾼다
  if (target !== shown) {
    setShown(target);
    if (target) {
      setTo(target.draft.to);
      setSubject(target.draft.subject);
      setBody(target.draft.body);
      setCopied(false);
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={target?.draft.label ?? "메일 초안"}
      description="AINS가 쓴 초안이에요. 고쳐서 Gmail에서 직접 보내 주세요."
      footer={
        <>
          <Button
            variant="outline"
            leftIcon={<Icon name={copied ? "check" : "copy"} />}
            onClick={copy}
          >
            {copied ? "복사됨" : "복사"}
          </Button>
          <Button
            variant="primary"
            leftIcon={<Icon name="envelope" />}
            onClick={() => onSent(target?.alertId)}
          >
            Gmail에서 보냈어요
          </Button>
        </>
      }
    >
      <div className={s.stack}>
        <Input label="받는 사람" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input label="제목" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea
          label="본문"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          minRows={8}
        />
      </div>
    </Modal>
  );
}

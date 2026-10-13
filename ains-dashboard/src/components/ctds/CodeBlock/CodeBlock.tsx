"use client";

import { useCallback, useState, type HTMLAttributes, type ReactNode } from "react";
import {
  CodeSimple as PhCodeSimple,
  Copy as PhCopy,
  Check as PhCheck,
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ctds/Tooltip";
import styles from "./CodeBlock.module.css";

export interface CodeBlockProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** 보여줄 코드 문자열. 하이라이팅은 CodeBlock이 따로 하지 않음 — 사용처가 ReactNode(span 조합)로 전달해도 됨. */
  code: string | ReactNode;
  /** 상단 언어 라벨 (예: "html", "tsx"). 없으면 숨김. */
  language?: string;
  /** copy 버튼 클릭 시 호출. 미지정이면 clipboard API로 자동 복사. */
  onCopyCode?: (code: string) => void;
}

export function CodeBlock({
  code,
  language,
  onCopyCode,
  className,
  ...rest
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const codeText = typeof code === "string" ? code : "";

  const handleCopy = useCallback(() => {
    if (onCopyCode) {
      onCopyCode(codeText);
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(codeText).catch(() => {});
    }
    setCopied(true);
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [codeText, onCopyCode]);

  const cls = [styles.root, className].filter(Boolean).join(" ");

  return (
    <div className={cls} {...rest}>
      <div className={styles.header}>
        <div className={styles.lang}>
          <PhCodeSimple className={styles.langIcon} weight="regular" aria-hidden />
          {language ? <span className={styles.langLabel}>{language}</span> : null}
        </div>
        <Tooltip content={copied ? "복사됨" : "복사"}>
          <button
            type="button"
            className={styles.copyBtn}
            onClick={handleCopy}
            aria-label={copied ? "복사됨" : "코드 복사"}
          >
            {copied ? (
              <PhCheck className={styles.copyIcon} weight="bold" />
            ) : (
              <PhCopy className={styles.copyIcon} weight="regular" />
            )}
          </button>
        </Tooltip>
      </div>
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Paperclip as PhPaperclip } from "@phosphor-icons/react";
import { AttachmentItem } from "@/components/ctds/AttachmentItem";
import { AttachmentThumb } from "@/components/ctds/AttachmentThumb";
import { DropdownMenu } from "@/components/ctds/DropdownMenu";
import { QuotationBar } from "@/components/ctds/QuotationBar";
import { ModelSelector } from "./ModelSelector";
import { SendButton } from "./SendButton";
import styles from "./ChatInput.module.css";

export type ChatInputShape = "multi" | "single";

/** 첨부 공용 타입 — ChatInput·Message 양쪽에서 재사용. */
export interface ChatAttachmentImage {
  id: string;
  kind: "image";
  src?: string; // 아직 로딩 중이면 생략
  alt?: string;
  loading?: boolean;
}
export interface ChatAttachmentFile {
  id: string;
  kind: "file";
  filename: string;
}
export type ChatAttachment = ChatAttachmentImage | ChatAttachmentFile;

export interface ChatInputModel {
  id: string;
  label: string;
  /** 메뉴 아이템 leading 슬롯. 모델별 대표 아이콘 (CTDS Icon 노드 등). */
  icon?: ReactNode;
  /** 2줄 아이템용 보조 문구. 넘기면 메뉴 아이템이 2줄로 열림. */
  description?: ReactNode;
}

export interface ChatInputProps {
  shape?: ChatInputShape;

  value: string;
  onChange: (v: string) => void;

  /** 전송 가능할 때 호출. onStop이 분기. */
  onSend: () => void;
  /** 스트리밍 중 send 자리에 stop. */
  onStop?: () => void;
  isStreaming?: boolean;

  attachments?: ChatAttachment[];
  onRemoveAttachment?: (id: string) => void;
  onAttach?: (files: File[]) => void;

  quotation?: { text: string; onRemove?: () => void };

  /** 모델 선택 UI. 없거나 selectedModel 없으면 숨김. */
  models?: ChatInputModel[];
  selectedModel?: string;
  onSelectModel?: (id: string) => void;

  placeholder?: string;
  disabled?: boolean;
  /** multiLine일 때 textarea max rows. 넘으면 세로 스크롤. */
  maxRows?: number;
  /** 외부에서 wrapper에 추가 폭 지정하고 싶을 때. */
  className?: string;
  style?: CSSProperties;
}

/** 10자 넘으면 ModelSelector compact — SingleLine 공간 압박 완화. */
const SINGLE_COMPACT_THRESHOLD = 10;

export const ChatInput = forwardRef<HTMLDivElement, ChatInputProps>(
  function ChatInput(props, ref) {
    const {
      shape = "multi",
      value,
      onChange,
      onSend,
      onStop,
      isStreaming = false,
      attachments = [],
      onRemoveAttachment,
      onAttach,
      quotation,
      models,
      selectedModel,
      onSelectModel,
      placeholder = "Ask me anything…",
      disabled = false,
      maxRows = 8,
      className,
      style,
    } = props;

    const taRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const canSend = !disabled && (value.trim().length > 0 || attachments.length > 0);
    const showStop = isStreaming && !!onStop;

    /* autoResize — multi/single 둘 다. textarea는 content + padding에 맞춰 자람.
       scrollHeight는 content + padding(border-box). height를 auto로 reset해야 축소도 가능. */
    useLayoutEffect(() => {
      const el = taRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        if (e.shiftKey) return; // Shift+Enter: multi/single 모두 줄바꿈 허용
        if (e.nativeEvent.isComposing) return; // 한글 조합 중 전송 방지
        e.preventDefault();
        if (showStop) {
          onStop?.();
        } else if (canSend) {
          onSend();
        }
      },
      [canSend, showStop, onSend, onStop]
    );

    const handleSendClick = useCallback(() => {
      if (showStop) onStop?.();
      else if (canSend) onSend();
    }, [showStop, canSend, onSend, onStop]);

    const handleAttachClick = useCallback(() => {
      fileRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        if (files.length > 0) onAttach?.(files);
        // 같은 파일 다시 선택 가능하게
        e.target.value = "";
      },
      [onAttach]
    );

    const hasAttachments = attachments.length > 0;
    const modelLabel =
      models && selectedModel
        ? models.find((m) => m.id === selectedModel)?.label ?? selectedModel
        : null;

    /* SingleLine에서 입력이 10자 넘으면 모델 selector compact. */
    const modelCompact =
      shape === "single" && value.length > SINGLE_COMPACT_THRESHOLD;

    const rootCls = [
      styles.root,
      styles[`shape-${shape}`],
      disabled ? styles.disabled : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    const AttachInput = (
      <input
        ref={fileRef}
        type="file"
        multiple
        className={styles.hiddenFile}
        onChange={handleFileChange}
        aria-hidden
        tabIndex={-1}
      />
    );

    const AttachButton = (
      <button
        type="button"
        className={styles.attachBtn}
        onClick={handleAttachClick}
        disabled={disabled || !onAttach}
        aria-label="파일 첨부"
      >
        <PhPaperclip className={styles.attachIcon} weight="regular" />
      </button>
    );

    const ModelAndSend = (
      <div className={styles.actions}>
        {modelLabel && models ? (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <ModelSelector
                label={modelLabel}
                compact={modelCompact}
                disabled={disabled}
              />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end">
              <DropdownMenu.Label>모델 변경</DropdownMenu.Label>
              {models.map((m) => (
                <DropdownMenu.Item
                  key={m.id}
                  leadingActions={m.icon ? [{ node: m.icon, key: m.id }] : undefined}
                  description={m.description}
                  onSelect={() => onSelectModel?.(m.id)}
                >
                  {m.label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        ) : null}
        <SendButton
          active={canSend}
          streaming={showStop}
          disabled={disabled && !showStop}
          onClick={handleSendClick}
        />
      </div>
    );

    const handleFormSubmit = (e: FormEvent) => {
      e.preventDefault();
      if (showStop) onStop?.();
      else if (canSend) onSend();
    };

    return (
      <div ref={ref} className={rootCls} style={style}>
        {/* 첨부물 바 */}
        {hasAttachments ? (
          <div className={styles.attachments}>
            {attachments.map((a) => (
              <div
                key={a.id}
                className={styles.attachmentCell}
                data-kind={a.kind}
              >
                {a.kind === "image" ? (
                  <AttachmentThumb
                    src={a.src}
                    alt={a.alt}
                    size="md"
                    loading={a.loading}
                    onRemove={
                      onRemoveAttachment
                        ? () => onRemoveAttachment(a.id)
                        : undefined
                    }
                  />
                ) : (
                  <AttachmentItem
                    filename={a.filename}
                    onRemove={
                      onRemoveAttachment
                        ? () => onRemoveAttachment(a.id)
                        : undefined
                    }
                  />
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Quotation */}
        {quotation ? (
          <div className={styles.quotation}>
            <QuotationBar text={quotation.text} onRemove={quotation.onRemove} />
          </div>
        ) : null}

        <form className={styles.body} onSubmit={handleFormSubmit}>
          {shape === "single" ? (
            <>
              {AttachButton}
              <div className={styles.singleScroll}>
                <textarea
                  ref={taRef}
                  className={styles.singleField}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  aria-label={placeholder}
                />
              </div>
              {ModelAndSend}
            </>
          ) : (
            <div className={styles.multiStack}>
              <div className={styles.multiScroll}>
                <textarea
                  ref={taRef}
                  className={styles.multiField}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  aria-label={placeholder}
                />
              </div>
              <div className={styles.footer}>
                {AttachButton}
                {ModelAndSend}
              </div>
            </div>
          )}
        </form>

        {AttachInput}
      </div>
    );
  }
);

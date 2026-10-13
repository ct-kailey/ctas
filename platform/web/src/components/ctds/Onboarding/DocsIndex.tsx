"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "../Button";
import { components, componentSlugs } from "../_data";
import styles from "./Onboarding.module.css";

export function DocsIndex() {
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const copyPrompt = async (name: string, slug: string) => {
    setError(null);
    try {
      const promptSlug = slug.split("/").pop() ?? slug;
      const res = await fetch(`/api/prompt/${promptSlug}`);
      if (!res.ok) {
        setError(name);
        return;
      }
      const md = await res.text();
      await navigator.clipboard.writeText(md);
      setCopied(name);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError(name);
    }
  };

  return (
    <div className={styles.panel}>
      {components.map((cat) => (
        <div key={cat.id} className={styles.docsCategory}>
          <span className={styles.docsCategoryTitle}>{cat.title}</span>
          <div className={styles.docsGrid}>
            {cat.items.map((name) => {
              const slug = componentSlugs[name];
              const hasDoc = Boolean(slug);
              return (
                <div key={name} className={styles.docsCard}>
                  <span className={styles.docsCardName}>{name}</span>
                  <div className={styles.docsCardActions}>
                    {hasDoc ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/components/${slug}`}
                          target="_blank"
                          rel="noopener"
                        >
                          문서 열기
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled>
                        문서 없음
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!hasDoc}
                      onClick={() => hasDoc && copyPrompt(name, slug)}
                    >
                      프롬프트 복사
                    </Button>
                    {copied === name && (
                      <span className={styles.docsBadge}>복사됨</span>
                    )}
                    {error === name && (
                      <span className={styles.docsBadge}>실패</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

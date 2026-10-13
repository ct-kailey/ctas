"use client";

/**
 * LottiePlayer — Spinner가 lottie-* variant일 때 내부에서 쓰는 플레이어.
 *
 * - 서버 사이드에서는 아무것도 렌더 안 함 (lottie-react는 client-only).
 * - fetch로 /lottie/<name>.json 로드 → 캐시 (모듈 레벨).
 * - 매니페스트의 colorBind=true면 바깥 요소 computed color로 recolor.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Lottie } from "lottie-react";
import { LOTTIE_MANIFEST, type LottieName } from "./lottieManifest";
import { parseCssColor, recolorLottie } from "./lottieColor";
import styles from "./Spinner.module.css";

/** JSON 캐시 — 같은 로티를 여러 자리에서 쓸 때 fetch 1회만. */
const cache = new Map<LottieName, unknown>();
const inflight = new Map<LottieName, Promise<unknown>>();

async function loadLottie(name: LottieName): Promise<unknown> {
  if (cache.has(name)) return cache.get(name);
  if (inflight.has(name)) return inflight.get(name)!;
  const p = fetch(LOTTIE_MANIFEST[name].path)
    .then((r) => r.json())
    .then((json) => {
      cache.set(name, json);
      inflight.delete(name);
      return json;
    });
  inflight.set(name, p);
  return p;
}

export type LottiePlayerProps = {
  name: LottieName;
  className?: string;
};

export function LottiePlayer({ name, className }: LottiePlayerProps) {
  const entry = LOTTIE_MANIFEST[name];
  const [data, setData] = useState<unknown>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadLottie(name).then((raw) => {
      if (cancelled) return;
      if (!entry.colorBind) {
        setData(raw);
        return;
      }
      // 바깥 요소의 computed color를 읽어 재색상화
      const el = containerRef.current;
      const css = el ? getComputedStyle(el).color : "rgb(0,0,0)";
      const rgb = parseCssColor(css);
      // eslint-disable-next-line no-console
      console.log(
        `[LottiePlayer] name=${name} | computed.color="${css}" | parsed=${
          rgb ? `[${rgb.map((v) => (v * 255).toFixed(0)).join(",")}]` : "NULL(fallback to black)"
        }`,
      );
      setData(recolorLottie(raw, rgb ?? [0, 0, 0]));
    });
    return () => {
      cancelled = true;
    };
  }, [name, entry.colorBind]);

  // offset은 bounds(--loader-size) 비율 기준. 스케일된 자기 요소 % 혼동을 피하려고 calc로 묶음.
  const style = {
    ...(entry.visualScale ? { "--lottie-scale": entry.visualScale } : {}),
    ...(entry.offsetX
      ? { "--lottie-offset-x": `calc(var(--loader-size) * ${entry.offsetX})` }
      : {}),
    ...(entry.offsetY
      ? { "--lottie-offset-y": `calc(var(--loader-size) * ${entry.offsetY})` }
      : {}),
  } as CSSProperties;

  return (
    <div ref={containerRef} className={className} style={style}>
      {data ? (
        <Lottie src={data} loop autoplay className={styles.lottieFill} />
      ) : null}
    </div>
  );
}

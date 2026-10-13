/**
 * Lottie JSON 안의 모든 색 배열을 target 색으로 치환.
 *
 * Lottie 색 포맷: `[r, g, b]` 또는 `[r, g, b, a]` (0~1 정규화).
 * 매니페스트에서 `colorBind: true`인 단색 로티에만 사용 — 다색 로티는 색 구조가
 * 흐트러져서 적용 불가.
 */

export type Rgb = [number, number, number];

/** oklch(L C H) → sRGB [r,g,b] 0~1. L은 0~1, C는 0~0.4, H는 degree.
 *  CTDS 토큰이 전부 oklch라 브라우저 Canvas 미지원을 우회하기 위해 수동 변환. */
function oklchToRgb(L: number, C: number, Hdeg: number): Rgb {
  const H = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  // OKLab → linear sRGB (Björn Ottosson)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  // linear → sRGB gamma
  const toSrgb = (x: number) => {
    const c = Math.max(0, Math.min(1, x));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };
  return [toSrgb(r), toSrgb(g), toSrgb(bl)];
}

/** CSS 색 문자열 → [r,g,b] 0~1 정규화. 서버에서는 null 반환.
 *  oklch()는 수동 변환(브라우저 Canvas가 oklch 입력을 받지 못하는 경우가 많음).
 *  rgb()/rgba()/#hex는 그대로 파싱. */
export function parseCssColor(css: string): Rgb | null {
  if (typeof document === "undefined") return null;
  const trimmed = css.trim();
  // oklch(L C H) 또는 oklch(L C H / A) — 수동 변환
  const oklchMatch = /^oklch\(\s*([^\s,/)]+)[\s,]+([^\s,/)]+)[\s,]+([^\s,/)]+)/i.exec(trimmed);
  if (oklchMatch) {
    const parsePart = (s: string, scale: number) =>
      s.endsWith("%") ? (parseFloat(s) / 100) * scale : parseFloat(s);
    const L = parsePart(oklchMatch[1], 1);
    const C = parsePart(oklchMatch[2], 0.4);
    const H = parseFloat(oklchMatch[3]);
    if ([L, C, H].every((v) => Number.isFinite(v))) return oklchToRgb(L, C, H);
  }
  // rgb() / rgba() / #hex — 숫자 파싱 (CSS Typed OM 없이 간단히)
  const m = trimmed.match(/-?\d+(\.\d+)?/g);
  if (m && m.length >= 3) return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
  return null;
}

/** 색 자리를 target으로 치환. colorBind=true 전용 — 단색 로티 가정.
 *  원본 색의 알파만 보존하고 rgb는 target 그대로.
 *  (이전 버전은 원본 luma 비율로 scale → primary처럼 중간 밝기 target일 때
 *   원본이 검정이면 결과도 검정으로 묶여버렸음.) */
export function recolorLottie(data: unknown, target: Rgb): unknown {
  const [tr, tg, tb] = target;

  function walk(node: unknown, parentKey?: string): unknown {
    if (Array.isArray(node)) {
      if (
        (node.length === 3 || node.length === 4) &&
        node.every((v) => typeof v === "number" && v >= 0 && v <= 1)
      ) {
        const alpha = node.length === 4 ? node[3] : undefined;
        return alpha !== undefined ? [tr, tg, tb, alpha] : [tr, tg, tb];
      }
      return node.map((v) => walk(v));
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      // 그라데이션 fill(ty:"gf"|"gs")은 g.k.k가 플랫 배열 [stop, r, g, b, stop, r, g, b, ...].
      // 전체를 target 단색으로 눕힘 (stop만 유지).
      if (
        parentKey === "g" &&
        obj.k &&
        typeof obj.k === "object" &&
        !Array.isArray(obj.k) &&
        Array.isArray((obj.k as Record<string, unknown>).k)
      ) {
        const inner = obj.k as Record<string, unknown>;
        const flat = inner.k as unknown[];
        if (
          flat.length >= 4 &&
          flat.length % 4 === 0 &&
          flat.every((v) => typeof v === "number" && v >= 0 && v <= 1)
        ) {
          const flatted: number[] = [];
          for (let i = 0; i < flat.length; i += 4) {
            flatted.push(flat[i] as number, tr, tg, tb);
          }
          for (const [k, v] of Object.entries(obj)) {
            if (k === "k") {
              out[k] = { ...inner, k: flatted };
            } else {
              out[k] = walk(v, k);
            }
          }
          return out;
        }
      }
      for (const [k, v] of Object.entries(obj)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    return node;
  }

  return walk(data);
}

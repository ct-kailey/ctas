import type { SVGProps } from "react";

/**
 * Conscience 마크. 원본: conscience-mark-color.svg
 * 색은 currentColor — Mode 축(라이트/다크)에 따라 글자색을 따라간다.
 */
export function ConscienceMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 129.03 103.1" fill="currentColor" role="img" aria-label="Conscience" {...props}>
      <polygon points="128.99 71.93 129 71.93 70.22 28.67 42.93 28.67 42.93 9.17 31.1 0 0 0 0 31.1 11.83 40.27 39.12 40.27 39.12 59.78 97.86 103 97.86 103.1 129.03 103.1 129.03 71.93" />
      <polygon points="0 62.83 0 93.93 11.83 103.1 42.93 103.1 42.93 72 31.1 62.83 0 62.83" />
    </svg>
  );
}

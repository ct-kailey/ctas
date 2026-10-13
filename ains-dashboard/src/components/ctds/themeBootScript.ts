/**
 * CTDS 테마 blocking boot script.
 *
 * Next.js SSR이 HTML을 보내기 전에 <head> 안에서 **동기적으로** 실행돼야 한다.
 * 하이드레이션 전에 localStorage/prefers-color-scheme을 읽고 <html>에 모든 축
 * data-* 어트리뷰트를 세팅 → 첫 페인트부터 올바른 모드로 뜸(FOUC 방지).
 *
 * 사용:
 *   <html suppressHydrationWarning>
 *     <head>
 *       <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
 *     </head>
 *     <body><ThemeController>{children}</ThemeController></body>
 *   </html>
 *
 * 데모 앱(web/app/layout.tsx) + ctds-cli init이 패치하는 소비자 layout.tsx
 * 양쪽이 이 함수 하나를 쓴다. ThemeController와 로직이 drift 나지 않도록 single-source.
 *
 * 옵션:
 *   onboardingPath — 온보딩 라우트는 설정 전 단계라 다크 선호도 무시하고 라이트 고정.
 *                    기본값 "/onboarding". 소비자가 다른 경로면 넘겨서 교체.
 */
import type { InitialConfig } from "./ThemeController";

export function themeBootScript({ onboardingPath = "/onboarding", initialConfig = {} }: {
  onboardingPath?: string;
  initialConfig?: InitialConfig;
} = {}): string {
  // IIFE. try/catch로 서버 렌더 환경·시크릿 모드·localStorage 접근 실패 전부 흡수.
  // 축이 늘면 아래 배열에 (storageKey, attrName, default)를 추가.
  return `(function(){try{
var ONBOARD=${JSON.stringify(onboardingPath)};
var defaults=${JSON.stringify(initialConfig)};
var isOnboarding=location.pathname===ONBOARD||location.pathname.indexOf(ONBOARD+'/')===0;
var mode=isOnboarding?'light':(localStorage.getItem('ctds-mode')||defaults.mode||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.documentElement.setAttribute('data-mode',mode);
var axes=[['ctds-palette','data-palette',defaults.palette||'standard'],['ctds-shape','data-shape',defaults.shape||'standard'],['ctds-density','data-density',defaults.density||'default'],['ctds-motion','data-motion',defaults.motion||'standard'],['ctds-icon-family','data-icon-family',defaults.iconFamily||'phosphor'],['ctds-lang','data-lang',defaults.lang||'ko'],['ctds-focus-ring','data-focus-ring',defaults.focusRing||'off'],['ctds-voice','data-voice',defaults.voice||'neutral']];
for(var i=0;i<axes.length;i++){var k=axes[i][0],a=axes[i][1],d=axes[i][2];var v=localStorage.getItem(k)||d;document.documentElement.setAttribute(a,v);if(a==='data-lang')document.documentElement.lang=v;}
try{localStorage.removeItem('ctds-accent');}catch(e){}
document.documentElement.removeAttribute('data-accent');
try{localStorage.removeItem('ctds-typography');}catch(e){}
document.documentElement.removeAttribute('data-typography');
var hue=localStorage.getItem('ctds-hue')??defaults.hue;if(hue!=null)document.documentElement.style.setProperty('--hue',String(hue));
var ah=localStorage.getItem('ctds-accent-hue');if(ah)document.documentElement.style.setProperty('--secondary-hue',ah);
}catch(e){}})();`;
}

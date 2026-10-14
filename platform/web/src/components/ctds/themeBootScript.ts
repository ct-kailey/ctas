/**
 * CTDS 테마 blocking boot script.
 *
 * Next.js SSR이 HTML을 보내기 전에 <head> 안에서 **동기적으로** 실행돼야 한다.
 * 하이드레이션 전에 initialConfig/localStorage/prefers-color-scheme을 읽고
 * <html>에 모든 축 data-* 어트리뷰트를 세팅 → 첫 페인트부터 올바른 모드로 뜸(FOUC 방지).
 *
 * 사용:
 *   <html suppressHydrationWarning>
 *     <head>
 *       <script dangerouslySetInnerHTML={{ __html: themeBootScript({ initial: ctdsConfig }) }} />
 *     </head>
 *     <body><ThemeController initialConfig={ctdsConfig}>{children}</ThemeController></body>
 *   </html>
 *
 * 데모 앱(web/app/layout.tsx) + ctds-cli init이 패치하는 소비자 layout.tsx
 * 양쪽이 이 함수 하나를 쓴다. ThemeController와 로직이 drift 나지 않도록 single-source.
 *
 * Precedence: initial(명시된 축) > localStorage > 디폴트/시스템 선호.
 * initial은 ctds.config.json(프로젝트 소스 오브 트루스)에서 온 값.
 * 과거 세션의 localStorage가 config을 덮지 못하게 한다.
 *
 * 옵션:
 *   initial         — ctds.config.json 객체. 명시된 축은 localStorage보다 우선.
 *   onboardingPath  — 온보딩 라우트는 설정 전 단계라 다크 선호도 무시하고 라이트 고정.
 *                     기본값 "/onboarding". 소비자가 다른 경로면 넘겨서 교체.
 */
export type InitialAxes = {
  mode?: "light" | "dark";
  palette?: string;
  hue?: number;
  accentHue?: number | null;
  shape?: string;
  density?: string;
  motion?: string;
  iconFamily?: string;
  voice?: string;
  lang?: string;
};

export function themeBootScript({
  onboardingPath = "/onboarding",
  initial,
}: { onboardingPath?: string; initial?: InitialAxes } = {}): string {
  // 명시된 축만 JSON으로 흘려보냄 → 런타임이 localStorage보다 initial을 우선.
  const init = initial ?? {};
  // IIFE. try/catch로 서버 렌더 환경·시크릿 모드·localStorage 접근 실패 전부 흡수.
  // 축이 늘면 아래 배열에 (storageKey, attrName, default, initKey)를 추가.
  return `(function(){try{
var INIT=${JSON.stringify(init)};
var ONBOARD=${JSON.stringify(onboardingPath)};
var isOnboarding=location.pathname===ONBOARD||location.pathname.indexOf(ONBOARD+'/')===0;
var mode=isOnboarding?'light':(INIT.mode||localStorage.getItem('ctds-mode')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.documentElement.setAttribute('data-mode',mode);
var axes=[['ctds-palette','data-palette','standard','palette'],['ctds-shape','data-shape','standard','shape'],['ctds-density','data-density','default','density'],['ctds-motion','data-motion','standard','motion'],['ctds-icon-family','data-icon-family','phosphor','iconFamily'],['ctds-lang','data-lang','ko','lang'],['ctds-voice','data-voice','neutral','voice']];
for(var i=0;i<axes.length;i++){var k=axes[i][0],a=axes[i][1],d=axes[i][2],ik=axes[i][3];var v=INIT[ik]||localStorage.getItem(k)||d;document.documentElement.setAttribute(a,v);if(a==='data-lang')document.documentElement.lang=v;}
try{localStorage.removeItem('ctds-accent');}catch(e){}
document.documentElement.removeAttribute('data-accent');
try{localStorage.removeItem('ctds-typography');}catch(e){}
document.documentElement.removeAttribute('data-typography');
try{localStorage.removeItem('ctds-focus-ring');}catch(e){}
document.documentElement.removeAttribute('data-focus-ring');
var hue=(INIT.hue!=null)?String(INIT.hue):localStorage.getItem('ctds-hue');if(hue)document.documentElement.style.setProperty('--hue',hue);
var ah=(INIT.accentHue!=null)?String(INIT.accentHue):localStorage.getItem('ctds-accent-hue');if(ah)document.documentElement.style.setProperty('--secondary-hue',ah);
}catch(e){}})();`;
}

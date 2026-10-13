import type { Metadata } from "next";
import type { CSSProperties } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeController } from "../components/ctds/ThemeController";
import { themeBootScript } from "../components/ctds/themeBootScript";
import { dashboardTheme } from "@/lib/dashboard-theme";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-dashboard-pretendard",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "AINS · 예시 대시보드",
  description: "예시 데이터로 살펴보는 프로젝트 현황과 업무 흐름. 실제 저장·발송·AI 처리는 하지 않습니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={pretendard.variable}
      data-mode={dashboardTheme.mode}
      data-palette={dashboardTheme.palette}
      data-shape={dashboardTheme.shape}
      data-density={dashboardTheme.density}
      data-motion={dashboardTheme.motion}
      data-icon-family={dashboardTheme.iconFamily}
      data-lang={dashboardTheme.lang}
      data-focus-ring={dashboardTheme.focusRing}
      data-voice={dashboardTheme.voice}
      style={{ "--hue": dashboardTheme.hue } as CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript({ initialConfig: dashboardTheme }) }} />
      </head>
      <body>
        <ThemeController initialConfig={dashboardTheme}>{children}</ThemeController>
      </body>
    </html>
  );
}

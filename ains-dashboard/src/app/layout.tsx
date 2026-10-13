import type { Metadata } from "next";
import "./globals.css";
import { ThemeController } from "../components/ctds/ThemeController";
import { themeBootScript } from "../components/ctds/themeBootScript";

export const metadata: Metadata = {
  title: "AINS",
  description: "프로젝트에 무슨 일이 있었고, 지금 뭘 조심해야 하는지 한눈에",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body>
        <ThemeController>{children}</ThemeController>
      </body>
    </html>
  );
}

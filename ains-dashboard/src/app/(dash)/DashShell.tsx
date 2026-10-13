"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  AppFrame,
  Badge,
  Breadcrumb,
  Button,
  Icon,
  Input,
  Sidebar,
  Topbar,
  TooltipProvider,
} from "@/components/ctds";
import { PROJECTS, getProject } from "@/lib/mock";
import { ConscienceMark } from "@/components/brand/ConscienceMark";
import { AinsProvider, useAins } from "./AinsContext";
import shell from "./shell.module.css";

export function DashShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <AinsProvider>
        <Frame>{children}</Frame>
      </AinsProvider>
    </TooltipProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Static exports use trailing slashes; keep the original navigation matching.
  const route = pathname.replace(/\/+$/, "") || "/";
  const { alerts, openIntake } = useAins();

  const projectId = route.startsWith("/projects/")
    ? route.split("/")[2]
    : null;
  const project = projectId ? getProject(projectId) : undefined;
  const isSettings = route.endsWith("/settings");

  // 급함 + 확인 필요 개수 — 알림함 메뉴 옆에 표시
  const todayCount = alerts.filter((a) => a.grade !== "info").length;
  const countFor = (id: string, grade: "urgent" | "check") =>
    alerts.filter((a) => a.projectId === id && a.grade === grade).length;

  return (
    <AppFrame variant="outlined" layout="sidebar-first">
      <AppFrame.Sidebar>
        <Sidebar>
          <Sidebar.Header>
            <Sidebar.Brand
              symbol={<ConscienceMark style={{ height: "var(--icon-size-md)", width: "auto" }} />}
              wordmark="AINS"
            />
          </Sidebar.Header>

          <Sidebar.Body>
            <Sidebar.Section>
              <Sidebar.Item asChild icon={<Icon name="house" />} label="예시 홈" active={route === "/example"}>
                <Link href="/example">예시 홈</Link>
              </Sidebar.Item>
              <Sidebar.Item
                asChild
                icon={<Icon name="bell" />}
                label="알림함"
                active={route === "/alerts"}
                trailing={
                  todayCount > 0 ? (
                    <Badge variant="soft" status="warning">
                      {todayCount}
                    </Badge>
                  ) : undefined
                }
              >
                <Link href="/alerts">알림함</Link>
              </Sidebar.Item>
            </Sidebar.Section>

            <Sidebar.Separator />

            <Sidebar.Section title="내 프로젝트">
              {PROJECTS.map((p) => {
                const urgent = countFor(p.id, "urgent");
                const check = countFor(p.id, "check");
                return (
                  <Sidebar.Item
                    key={p.id}
                    asChild
                    icon={<Icon name="squares-four" />}
                    label={p.client}
                    active={projectId === p.id}
                    trailing={
                      urgent > 0 ? (
                        <Badge variant="soft" status="destructive">
                          {urgent}
                        </Badge>
                      ) : check > 0 ? (
                        <Badge variant="soft" status="warning">
                          {check}
                        </Badge>
                      ) : undefined
                    }
                  >
                    <Link href={`/projects/${p.id}`}>{p.client}</Link>
                  </Sidebar.Item>
                );
              })}
            </Sidebar.Section>
          </Sidebar.Body>

          <Sidebar.Footer>
            <Sidebar.Profile
              name="vara · 예시 사용자"
              sub="실제 로그인 계정이 아닙니다"
              avatar={{ status: "online" }}
            />
          </Sidebar.Footer>
        </Sidebar>
      </AppFrame.Sidebar>

      <AppFrame.Topbar>
        <Topbar size="md" className={shell.topbar}>
          {/* Breadcrumb은 직접 자식 사이에만 꺽쇠를 넣는다 — Fragment로 묶지 말고 항목을 하나씩 넘긴다 */}
          <Breadcrumb>
            {route === "/example" && <Breadcrumb.Current>홈</Breadcrumb.Current>}
            {route === "/alerts" && (
              <Breadcrumb.Link asChild leftIcon={<Icon name="house" />}>
                <Link href="/example">예시 홈</Link>
              </Breadcrumb.Link>
            )}
            {route === "/alerts" && <Breadcrumb.Current>알림함</Breadcrumb.Current>}
            {project && (
              <Breadcrumb.Link asChild leftIcon={<Icon name="house" />}>
                <Link href="/example">예시 홈</Link>
              </Breadcrumb.Link>
            )}
            {project && isSettings && (
              <Breadcrumb.Link asChild>
                <Link href={`/projects/${project.id}`}>{project.client}</Link>
              </Breadcrumb.Link>
            )}
            {project && isSettings && <Breadcrumb.Current>설정</Breadcrumb.Current>}
            {project && !isSettings && <Breadcrumb.Current>{project.client}</Breadcrumb.Current>}
          </Breadcrumb>
          <Topbar.Spacer />
          <Input
            size="md"
            width="md"
            variant="filled"
            placeholder="통합 검색 · 준비 중"
            aria-label="통합 검색은 예시 화면에서 지원하지 않습니다"
            disabled
            leftIcon={<Icon name="search" />}
          />
          <Button
            variant="primary"
            leftIcon={<Icon name="plus" />}
            onClick={() => openIntake(project?.id)}
          >
            자료 넣기
          </Button>
        </Topbar>
      </AppFrame.Topbar>

      <AppFrame.Content>
        <aside className={shell.previewNotice} aria-label="예시 대시보드 안내">
          <div>
            <Badge variant="soft">예시 데이터</Badge>
            <p>실제 저장·메일 발송·AI 처리는 하지 않습니다. 입력과 업무 변경은 새로고침하면 초기화됩니다.</p>
          </div>
          <nav className={shell.workspaceLinks} aria-label="AINS 화면 이동">
            {/* Plain anchors intentionally leave Next's /dashboard basePath. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- This opens the separate Vite workspace, not the Next home route. */}
            <Button variant="outline" asChild><a href="/">기존 작업실</a></Button>
            <Button variant="outline" asChild><Link href="/">실제 업무 대시보드</Link></Button>
            <Button variant="outline" asChild><a href="/preview">전체 흐름 프리뷰</a></Button>
          </nav>
        </aside>
        {children}
      </AppFrame.Content>
    </AppFrame>
  );
}

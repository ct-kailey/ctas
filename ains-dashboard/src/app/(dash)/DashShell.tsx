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
  const { alerts, openIntake } = useAins();

  const projectId = pathname.startsWith("/projects/")
    ? pathname.split("/")[2]
    : null;
  const project = projectId ? getProject(projectId) : undefined;
  const isSettings = pathname.endsWith("/settings");

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
              <Sidebar.Item asChild icon={<Icon name="house" />} label="홈" active={pathname === "/"}>
                <Link href="/">홈</Link>
              </Sidebar.Item>
              <Sidebar.Item
                asChild
                icon={<Icon name="bell" />}
                label="알림함"
                active={pathname === "/alerts"}
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
              name="vara"
              sub="vara@conscience.technology"
              avatar={{ status: "online" }}
            />
          </Sidebar.Footer>
        </Sidebar>
      </AppFrame.Sidebar>

      <AppFrame.Topbar>
        <Topbar size="md" className={shell.topbar}>
          {/* Breadcrumb은 직접 자식 사이에만 꺽쇠를 넣는다 — Fragment로 묶지 말고 항목을 하나씩 넘긴다 */}
          <Breadcrumb>
            {pathname === "/" && <Breadcrumb.Current>홈</Breadcrumb.Current>}
            {pathname === "/alerts" && (
              <Breadcrumb.Link asChild leftIcon={<Icon name="house" />}>
                <Link href="/">홈</Link>
              </Breadcrumb.Link>
            )}
            {pathname === "/alerts" && <Breadcrumb.Current>알림함</Breadcrumb.Current>}
            {project && (
              <Breadcrumb.Link asChild leftIcon={<Icon name="house" />}>
                <Link href="/">홈</Link>
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
            placeholder="무엇이든 검색"
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

      <AppFrame.Content>{children}</AppFrame.Content>
    </AppFrame>
  );
}

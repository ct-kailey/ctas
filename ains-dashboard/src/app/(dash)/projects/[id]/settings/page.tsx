import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PROJECTS, getProject } from "@/lib/mock";
import { SettingsView } from "./SettingsView";

export const dynamicParams = false;

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

async function SettingsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <SettingsView project={project} />;
}

export default function ProjectSettingsPage({ params }: PageProps<"/projects/[id]/settings">) {
  return (
    <Suspense fallback={null}>
      <SettingsContent params={params} />
    </Suspense>
  );
}

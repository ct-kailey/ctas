import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PROJECTS, getProject } from "@/lib/mock";
import { ProjectView } from "./ProjectView";

export function generateStaticParams() {
  return PROJECTS.map((p) => ({ id: p.id }));
}

async function ProjectContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) notFound();
  return <ProjectView project={project} />;
}

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <Suspense fallback={null}>
      <ProjectContent params={params} />
    </Suspense>
  );
}

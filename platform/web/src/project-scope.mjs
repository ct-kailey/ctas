export const PROJECT_KINDS = {
  product_development: '자체 제품 개발',
  client_project: '고객 프로젝트',
  unspecified: '분류 필요',
};
export const projectKindLabel = (project) => PROJECT_KINDS[project?.project_kind] || PROJECT_KINDS.unspecified;
export const projectOptionLabel = (project) => `${project.name} · ${projectKindLabel(project)}`;

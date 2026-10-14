const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

export function sourceReviewDocuments(documents = []) {
  return documents.map((document) => ({ ...document, revisions: [...(document.revisions || [])].sort(byNewest) }))
    .filter((document) => document.revisions.length)
    .sort((a, b) => byNewest(a.revisions[0], b.revisions[0]));
}

export function sourceReviewSelection(documents, selectedId, initialRevisionId) {
  const requested = selectedId || initialRevisionId;
  for (const document of documents) {
    const revision = document.revisions.find((item) => item.id === requested);
    if (revision) return { document, revision };
  }
  if (requested) return null;
  const document = documents.find((item) => item.revisions[0].id !== item.baseline_revision_id) || documents[0];
  return document ? { document, revision: document.revisions[0] } : null;
}

export function sourceReviewForRevision(reviews = [], revisionId) {
  return [...reviews].filter((review) => review.current_revision_id === revisionId).sort(byNewest)[0] || null;
}

export function sourceRunsForRevision(runs = [], revisionId, sourceType = 'revision') {
  return runs.filter((run) => run.source_refs?.some((ref) => ref.type === sourceType && ref.id === revisionId)).sort(byNewest);
}

export function sourceCandidatesForRevision(candidates = [], revisionId, sourceType = 'revision') {
  return candidates.filter((candidate) => candidate.source_refs?.some((ref) => ref.type === sourceType && ref.id === revisionId));
}

export function candidateBlockers(candidate, version) {
  return {
    stale: candidate.status === 'pending' && candidate.base_version !== version,
    questions: Boolean(candidate.questions?.some((item) => item.blocking && !item.answer?.trim())),
    conflicts: Boolean(candidate.conflicts?.some((item) => item.resolution === 'unresolved')),
  };
}

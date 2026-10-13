// Preserve text, source hash, identifiers, and locators verbatim.
// Deliberately do not perform NFKC, punctuation, digit, unit, or operator rewrites.
const document = args;
const warnings = [...document.extraction.warnings];
if (!document.extraction.complete) warnings.push('Document extraction is incomplete; source review is required.');
const segments = document.segments.map(segment => {
  const normalized_text = segment.text.replace(/\r\n?/g, '\n')
    .split('\n').map(line => line.replace(/[ \t\u00a0]+/g, ' ').trim()).join('\n').trim();
  if (segment.extraction_status === 'needs_review') warnings.push(`Segment ${segment.segment_id}: extraction requires source review.`);
  if (!normalized_text) warnings.push(`Segment ${segment.segment_id}: extracted text is empty.`);
  return {...segment, normalized_text};
});
return {
  segments,
  normalization: {
    status: warnings.length > 0 ? 'needs_review' : 'ready',
    warnings: [...new Set(warnings)],
    segment_count: segments.length
  }
};

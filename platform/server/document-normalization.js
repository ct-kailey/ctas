'use strict';
// Same lossless whitespace normalization as the published document pipeline.
// Project-bound workspaces can extract documents before an AI flow is connected.
function normalizeLocal(document){
  const warnings=[...document.extraction.warnings];
  if(!document.extraction.complete)warnings.push('Document extraction is incomplete; source review is required.');
  const segments=document.segments.map(segment=>{
    const normalized_text=segment.text.replace(/\r\n?/g,'\n').split('\n').map(line=>line.replace(/[ \t\u00a0]+/g,' ').trim()).join('\n').trim();
    if(segment.extraction_status==='needs_review')warnings.push(`Segment ${segment.segment_id}: extraction requires source review.`);
    if(!normalized_text)warnings.push(`Segment ${segment.segment_id}: extracted text is empty.`);
    return {...segment,normalized_text};
  });
  return {...document,segments,normalization:{status:warnings.length?'needs_review':'ready',warnings:[...new Set(warnings)],segment_count:segments.length}};
}
module.exports={normalizeLocal};

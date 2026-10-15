const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_ERROR = '작업 초안 목록을 확인할 수 없습니다. 목록을 새로 불러와 주세요.';

export function taskDraftSourceUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

function validItems(items) {
  return Array.isArray(items) && items.every(item => item && typeof item === 'object' && !Array.isArray(item) && UUID.test(item.id || ''));
}

export function mergeTaskDraftPage(previous, page) {
  if (!page || typeof page !== 'object' || !validItems(page.items)
    || !Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > 200
    || !Number.isSafeInteger(page.offset) || page.offset < 0 || page.offset > 100000
    || !Number.isSafeInteger(page.total) || page.total < 0
    || typeof page.has_more !== 'boolean' || page.items.length > page.limit || page.items.length > page.total) throw new Error(PAGE_ERROR);
  const nextOffset = page.offset + page.items.length;
  if (page.has_more && !page.items.length) throw new Error('다음 작업 초안 목록이 비어 있습니다. 목록을 새로 불러와 주세요.');
  if (page.has_more !== (nextOffset < page.total)) throw new Error(PAGE_ERROR);
  let prior = [];
  if (page.offset > 0) {
    if (!previous || !validItems(previous.items) || !Number.isSafeInteger(previous.next_offset) || previous.next_offset !== page.offset) throw new Error('작업 초안 목록 순서가 변경되었습니다. 처음부터 다시 불러와 주세요.');
    prior = previous.items;
  }
  const seen = new Set(), items = [];
  // Offsets count server rows, including repeated IDs; display keeps the first
  // occurrence so a duplicate page never overwrites an already opened draft.
  for (const item of [...prior, ...page.items]) {
    const id = item.id.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id); items.push(item);
  }
  return { items, total: page.total, has_more: page.has_more, next_offset: nextOffset };
}

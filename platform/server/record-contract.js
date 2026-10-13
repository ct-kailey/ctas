'use strict';

const SOURCE_TYPES = ['file', 'editor', 'slack', 'azure_devops', 'teams', 'kakaotalk', 'discord', 'email', 'meeting', 'other'];
const RECORD_KINDS = ['specification', 'conversation', 'decision', 'work_item', 'note'];
const MAX_TEXT_BYTES = 200000;
const HISTORY_KEYS = new Set(['source_type', 'occurred_on', 'decided_on', 'source_created_at', 'channel', 'url', 'external_id', 'participants', 'tags']);
function invalid(message) { throw Object.assign(new Error(message), { code: 'INVALID_HISTORY', status: 400 }); }
function dateOnly(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') invalid(`${label}은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) invalid(`${label}은 YYYY-MM-DD 형식의 실제 날짜여야 합니다.`);
  return value;
}
function optionalText(value, label, max) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max || /[\x00-\x1f\x7f]/.test(value)) invalid(`${label} 형식이 올바르지 않습니다. 최대 ${max}자입니다.`);
  return value.trim() || null;
}
function stringList(value, label, maxItems, maxLength) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) invalid(`${label}은 최대 ${maxItems}개까지 등록할 수 있습니다.`);
  return value.map(item => {
    const cleaned = optionalText(item, label, maxLength);
    if (!cleaned) invalid(`${label}에 빈 항목을 사용할 수 없습니다.`);
    return cleaned;
  });
}
function history(value, { defaultSource = 'file', allowJson = false } = {}) {
  let input = value === undefined ? {} : value;
  if (allowJson && typeof input === 'string') {
    try { input = JSON.parse(input); } catch { invalid('이력 특성은 JSON 객체여야 합니다.'); }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !HISTORY_KEYS.has(key))) invalid('지원하지 않는 이력 특성이 포함되어 있습니다.');
  const source = input.source_type === undefined ? defaultSource : input.source_type;
  if (!SOURCE_TYPES.includes(source)) invalid('올바른 기록 출처를 선택하세요.');
  const result = {
    source_type: source,
    occurred_on: dateOnly(input.occurred_on, '발생일'),
    decided_on: dateOnly(input.decided_on, '결정일'),
    source_created_at: null,
    channel: optionalText(input.channel, '대화 채널', 200),
    url: optionalText(input.url, '출처 링크', 2048),
    external_id: optionalText(input.external_id, '외부 기록 ID', 300),
    participants: stringList(input.participants, '참여자', 50, 200),
    tags: stringList(input.tags, '태그', 30, 100),
  };
  if (input.source_created_at !== undefined && input.source_created_at !== null && input.source_created_at !== '') {
    const value = input.source_created_at;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(value)) invalid('원본 생성 시각은 시간대가 포함된 ISO 시각이어야 합니다.');
    dateOnly(value.slice(0, 10), '원본 생성일');
    if (/[+-]14:(?!00)/.test(value) || !Number.isFinite(Date.parse(value))) invalid('원본 생성 시각의 시간대를 확인하세요.');
    result.source_created_at = value;
  }
  if (result.url) {
    let parsed;
    try { parsed = new URL(result.url); } catch { invalid('올바른 출처 링크를 입력하세요.'); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) invalid('출처 링크는 인증 정보가 없는 HTTP 또는 HTTPS 주소여야 합니다.');
  }
  return result;
}
function recordKind(value, fallback = 'specification') {
  const result = value === undefined ? fallback : value;
  if (!RECORD_KINDS.includes(result)) throw Object.assign(new Error('올바른 기록 유형을 선택하세요.'), { code: 'INVALID_RECORD_KIND', status: 400 });
  return result;
}
function editorText(value) {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0') || !value.isWellFormed() || Buffer.byteLength(value, 'utf8') > MAX_TEXT_BYTES) {
    throw Object.assign(new Error('본문을 입력하세요. UTF-8 기준 최대 200,000바이트까지 등록할 수 있습니다.'), { code: 'INVALID_RECORD_TEXT', status: 400 });
  }
  return Buffer.from(value, 'utf8');
}
module.exports = { SOURCE_TYPES, RECORD_KINDS, MAX_TEXT_BYTES, history, recordKind, editorText };

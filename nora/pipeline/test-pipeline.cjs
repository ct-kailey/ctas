const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = file => fs.readFileSync(path.join(__dirname, file), 'utf8');
const validateSource = read('validate-document.js');
const normalizeSource = read('normalize-document.js');
const blockSource = read('normalize-block.js');
const validate = new Function('args', validateSource);
const normalize = new Function('args', blockSource);
const fixture = JSON.parse(read('synthetic-document.json'));
const copy = () => structuredClone(fixture);
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function rejects(mutate) { const input = copy(); mutate(input); assert.throws(() => validate(input), /SISM_/); }

test('deployed normalizer includes exact current validator and normalizer', () => {
  assert.equal(blockSource.trimEnd(), ('(() => {\n' + validateSource + '\n})();\n' + normalizeSource).trimEnd());
  const snapshot = JSON.parse(read('draft-snapshot.json'));
  assert.equal(snapshot.nodes.find(n => n.title === 'Validate Document Envelope').config.code, validateSource);
  assert.equal(snapshot.nodes.find(n => n.title === 'Preserve and Normalize Text').config.code.trimEnd(), blockSource.trimEnd());
});
test('valid document preserves original and numerical semantics', () => {
  const input = copy(); const original = structuredClone(input); validate(input);
  const output = {...input, ...normalize(input)};
  assert.deepEqual(input, original);
  assert.equal(output.segments[0].text, original.segments[0].text);
  assert.deepEqual(output.source, original.source);
  for (const token of ['5 mg', '50%', '３㎖', '>= 5', '≤ 50', 'μg', 'mL', '< > =']) assert(output.segments[0].normalized_text.includes(token));
  assert.equal(output.normalization.status, 'ready');
});
test('incomplete extraction always needs review', () => {
  const input = copy(); input.extraction.complete = false;
  assert.equal(normalize(input).normalization.status, 'needs_review');
});
test('missing project', () => rejects(d => delete d.project_id));
test('duplicate segment', () => rejects(d => d.segments.push({...d.segments[0]})));
test('missing locator', () => rejects(d => delete d.segments[0].locator));
test('empty source text', () => rejects(d => d.segments[0].text = '   '));
test('overlong text', () => rejects(d => d.segments[0].text = 'x'.repeat(100001)));
test('total text cap across segments', () => rejects(d => {
  d.segments[0].text = 'x'.repeat(50001);
  d.segments.push({...d.segments[0], segment_id: 's2'});
}));
test('segment count cap', () => rejects(d => {
  d.segments = Array.from({length:201}, (_, i) => ({...d.segments[0], segment_id:'s' + i}));
}));
test('non-ASCII identities accepted', () => {
  const input = copy(); input.project_id = '합성 프로젝트'; input.document_id = '요구사항 문서'; validate(input);
});
test('normalized envelope is accepted idempotently', () => {
  const input = copy(); const once = {...input, ...normalize(input)}; validate(once);
  assert.deepEqual({...once, ...normalize(once)}, once);
});
test('invalid document cannot acquire normalization in final node', () => {
  const input = copy(); delete input.project_id;
  assert.throws(() => normalize(input), /SISM_/);
});
console.log(`${passed} pipeline tests passed.`);

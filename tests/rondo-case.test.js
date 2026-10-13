'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadBundle, findRecord } = require('../scripts/setup-rondo-case');
const fixtureDirectory = path.join(__dirname, 'fixtures', 'preparation-case');
const loadFixture = () => loadBundle(fixtureDirectory);

test('meeting evidence remains dated conversation; future agenda is not an occurred or decided event', () => {
  const { records } = loadFixture();
  const kickoff = records.find(r => r.key === 'kickoff');
  assert.equal(kickoff.record_kind, 'conversation');
  assert.equal(kickoff.history.occurred_on, '2026-10-01');
  assert.equal(kickoff.history.source_created_at, null);
  assert.match(kickoff.text, /2026-10-01T15:00:00\+09:00/);
  const agenda = records.find(r => r.key === 'agenda');
  assert.equal(agenda.record_kind, 'note');
  assert.equal(agenda.history.occurred_on, null);
  assert.equal(agenda.history.source_created_at, '2026-10-02T09:00:00+09:00');
  for (const r of records) {
    assert.equal(r.history.decided_on, null);
    assert.ok(['note', 'conversation'].includes(r.record_kind));
  }
});

function fixture() {
  const item = loadFixture().records[0];
  const doc = { id: 'doc', title: item.title, domain_id: 'domain', record_kind: item.record_kind,
    revisions: [{ id: 'rev', history: structuredClone(item.history), sha256: item.sha256 }] };
  return { item, doc };
}
test('repeated preparation import reuses exact registered evidence', () => {
  const { item, doc } = fixture();
  assert.deepEqual(findRecord([doc], item, 'domain'), { document_id: 'doc', revision_id: 'rev' });
});
test('matching external ID cannot silently change content, domain, type or historical metadata', () => {
  const { item, doc } = fixture();
  for (const mutate of [
    d => { d.revisions[0].sha256 = 'changed'; },
    d => { d.domain_id = 'other'; },
    d => { d.record_kind = 'decision'; },
    d => { d.revisions[0].history.decided_on = '2026-10-07'; },
  ]) {
    const changed = structuredClone(doc); mutate(changed);
    assert.throws(() => findRecord([changed], item, 'domain'), /differs/);
  }
});
test('ambiguous duplicates require reconciliation rather than choosing newest', () => {
  const { item, doc } = fixture();
  const other = structuredClone(doc); other.id = 'other';
  assert.throws(() => findRecord([doc, other], item, 'domain'), /Multiple revisions/);
});

function modifiedBundle(t, mutate) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ains-preparation-fixture-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  fs.cpSync(fixtureDirectory, temporary, { recursive: true });
  const file = path.join(temporary, 'archive-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  mutate(manifest);
  fs.writeFileSync(file, JSON.stringify(manifest));
  return temporary;
}

test('preparation bundle rejects a decision date instead of treating notes as approved policy', t => {
  const directory = modifiedBundle(t, manifest => { manifest.records[1].history.decided_on = '2026-10-07'; });
  assert.throws(() => loadBundle(directory), /Preparation cannot have a decision date/);
});

test('preparation bundle rejects duplicate external IDs before import', t => {
  const directory = modifiedBundle(t, manifest => { manifest.records[1].history.external_id = manifest.records[0].history.external_id; });
  assert.throws(() => loadBundle(directory), /Duplicate external_id/);
});

test('injected bundle cannot read a source outside its directory', t => {
  const directory = modifiedBundle(t, manifest => { manifest.records[0].files = ['../outside.md']; });
  assert.throws(() => loadBundle(directory), /Source outside case directory/);
});

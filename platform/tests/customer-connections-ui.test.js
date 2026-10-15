'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = () => import('../web/src/customer-connections-state.mjs');
const grant = { id: 'grant-one', status: 'active', usable: true, provider: 'slack', workspace_id: 'workspace-one', connector_id: 'connector-one', allowed_resources: [{ id: 'channel-one', label: 'Approved', kind: 'channel' }] };

test('collection only offers grants with explicit server authorization', async () => {
  const { usableConnectionGrants } = await model();
  const other = [ { ...grant, id: 'revoked', status: 'revoked' }, { ...grant, id: 'paused', usable: false }, { ...grant, id: 'unknown', usable: undefined } ];
  assert.deepEqual(usableConnectionGrants([grant, ...other]), [grant]);
  assert.deepEqual(usableConnectionGrants(null), []);
});

test('resource selection cannot retain an arbitrary or formerly approved channel', async () => {
  const { selectedGrantResource } = await model();
  assert.equal(selectedGrantResource([grant], grant.id, 'channel-one').resource.label, 'Approved');
  assert.equal(selectedGrantResource([grant], grant.id, 'channel-two'), null);
  assert.equal(selectedGrantResource([grant], 'missing-grant', 'channel-one'), null);
  assert.equal(selectedGrantResource([{ ...grant, usable: false }], grant.id, 'channel-one'), null);
  assert.equal(selectedGrantResource([{ ...grant, allowed_resources: [] }], grant.id, 'channel-one'), null);
});

test('legacy reauthorization requires the existing workspace, connector, provider, and exact target', async () => {
  const { usableConnectionGrants } = await model();
  const source = { workspace_id: 'workspace-one', connector_id: 'connector-one', provider: 'slack', external_channel_id: 'channel-one' };
  assert.deepEqual(usableConnectionGrants([grant], source), [grant]);
  for (const patch of [{ workspace_id: 'other' }, { connector_id: 'other' }, { provider: 'discord' }, { external_channel_id: 'other' }]) assert.deepEqual(usableConnectionGrants([grant], { ...source, ...patch }), []);
  const drive = { ...grant, provider: 'google_drive' };
  assert.deepEqual(usableConnectionGrants([drive], { ...source, provider: 'gdrive' }), [drive]);
});

test('connector choices keep provider identity and exclude disabled integrations', async () => {
  const { matchingConnectors } = await model();
  const connectors = [{ id: 'drive', provider: 'gdrive', enabled: true }, { id: 'slack', provider: 'slack', enabled: true }, { id: 'disabled', provider: 'google_drive', enabled: false }];
  assert.deepEqual(matchingConnectors(connectors, { provider: 'google_drive' }), [connectors[0]]);
  assert.deepEqual(matchingConnectors(connectors, null), []);
});

test('scope normalization rejects empty and duplicate resource identities before approval', async () => {
  const { normalizeGrantResources, resourceKind } = await model();
  assert.deepEqual(normalizeGrantResources([{ id: ' F1 ', label: ' Finance ' }, { id: 'F1', label: 'Duplicate' }, { id: ' ', label: 'Empty' }, { id: '*', label: 'Everything' }], 'google_drive'), [{ id: 'F1', label: 'Finance', kind: 'folder' }]);
  assert.equal(resourceKind('onedrive'), 'folder');
  assert.equal(resourceKind('discord'), 'channel');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = () => import('../web/src/desktop/bridge.mjs');

test('ordinary browser never invokes native or claims a connection', async () => {
  const { createDesktopBridge } = await load();
  const api = createDesktopBridge({ isNative: () => false, call: () => assert.fail('native invoked from browser') });
  const state = await api.getDesktopState();
  assert.equal(state.runtime, 'browser');
  assert.equal(state.connection.connected, false);
  assert.deepEqual(await api.listLocalRuns(), []);
  for (const action of [() => api.chooseWorkspace(), () => api.saveProfile({}), () => api.refreshDiagnostics(), () => api.openWorkspace(), () => api.startLocalRun({prompt:'x',expectedHead:'x'}), () => api.cancelLocalRun('x'), () => api.pairDesktop('code'), () => api.setDesktopReceiving(true), () => api.disconnectDesktop()]) {
    await assert.rejects(action, { code: 'DESKTOP_REQUIRED' });
  }
});

test('profile cannot choose a filesystem path or inject a command through native bridge', async () => {
  const { createDesktopBridge } = await load();
  const calls = [];
  const api = createDesktopBridge({ isNative: () => true, call: async (...args) => { calls.push(args); return { schemaVersion: 1 }; } });
  await api.saveProfile({ projectId: 'ctas', workspaceId: 'AINS', repositoryUrl: 'https://github.com/ct-kailey/ctas', provider: 'codex', workingFolder: '/unsafe', command: 'bad' });
  assert.deepEqual(calls.pop(), ['save_profile', { profile: { project_id: 'ctas', workspace_id: 'AINS', repository_url: 'https://github.com/ct-kailey/ctas', provider: 'codex' } }]);
  await api.startLocalRun({ prompt: 'Fix a test', expectedHead: 'abcdef', workingFolder: '/unsafe', command: 'bad' });
  assert.deepEqual(calls.pop(), ['start_local_run', { prompt: 'Fix a test', expectedHead: 'abcdef' }]);
});

test('native failures remain failures, without fake successful fallback', async () => {
  const { createDesktopBridge } = await load();
  const api = createDesktopBridge({ isNative: () => true, call: async () => { throw { code: 'REPOSITORY_MISMATCH', message: 'Mismatch' }; } });
  await assert.rejects(api.refreshDiagnostics, { code: 'REPOSITORY_MISMATCH' });
});

test('desktop capabilities grant no remote page native access', () => {
  const root = path.resolve(__dirname, '../desktop/src-tauri');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'tauri.conf.json'), 'utf8'));
  const capability = JSON.parse(fs.readFileSync(path.join(root, 'capabilities/local-main.json'), 'utf8'));
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(capability.windows, ['main']);
  assert.ok(!capability.permissions.some(x => String(x).startsWith('shell:')));
  assert.match(config.app.security.csp, /frame-src 'none'/);
  assert.match(config.app.security.csp, /form-action 'none'/);
});


test('desktop receiver bridge forwards only code and explicit boolean consent', async () => {
  const {createDesktopBridge}=await load(), calls=[];
  const api=createDesktopBridge({isNative:()=>true,call:async (...args)=>{calls.push(args);return {desktopConnection:{paired:true,receiving:false}};}});
  await api.pairDesktop('test-one-time-code'); await api.setDesktopReceiving(true); await api.disconnectDesktop();
  assert.deepEqual(calls,[['pair_desktop',{code:'test-one-time-code'}],['set_desktop_receiving',{enabled:true}],['disconnect_desktop',undefined]]);
});

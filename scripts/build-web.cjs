'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function run(script, args, cwd) {
  if (!fs.existsSync(script)) throw new Error('Build dependencies are missing. Run npm ci and npm ci --prefix ains-dashboard first.');
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run(path.join(root, 'node_modules/vite/bin/vite.js'), ['build'], root);
run(path.join(root, 'ains-dashboard/node_modules/next/dist/bin/next'), ['build'], path.join(root, 'ains-dashboard'));
const source = path.join(root, 'ains-dashboard/out');
if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Dashboard static export did not produce index.html.');
fs.cpSync(source, path.join(root, 'dist/dashboard'), { recursive: true });
console.log('Built workspace, workflow preview and vara dashboard into dist/.');

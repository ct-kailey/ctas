#!/usr/bin/env node
// Use explicit Node entry points: this checkout may contain ':' in its path.
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'platform/desktop');
const vite = path.join(root, 'node_modules/vite/bin/vite.js');
const tauri = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const config = path.join(desktop, 'vite.config.mjs');
const mode = process.argv[2] || 'dev';
const extra = process.argv.slice(3);
const env = { ...process.env, PATH: [path.dirname(process.execPath), path.join(os.homedir(), '.cargo/bin'), process.env.PATH].filter(Boolean).join(path.delimiter) };
// Cargo's native library search paths cannot safely contain a colon on Unix.
if (!env.CARGO_TARGET_DIR && process.platform !== 'win32' && root.includes(':')) env.CARGO_TARGET_DIR = '/tmp/ctas-desktop-target';
const children = new Set();
const watchers = [];
const mirrors = [];
function start(entry, args, cwd = root) {
  const child = spawn(process.execPath, [entry, ...args], { cwd, env, stdio: 'inherit' });
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}
function done(child) { return new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`Process stopped (${signal || code}).`))); }); }
function stop() { for (const watcher of watchers) watcher.close(); for (const child of children) child.kill('SIGTERM'); }
process.once('exit', () => { for (const mirror of mirrors) fs.rmSync(mirror, { recursive: true, force: true }); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop(); process.exitCode = 130; });
async function waitForVite(child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error('Desktop preview server stopped.');
    try { const r = await fetch('http://127.0.0.1:1420', { signal: AbortSignal.timeout(500) }); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Desktop preview server did not start.');
}
function developmentConfig() {
  if (process.platform === 'win32' || !root.includes(':')) return config;
  // Vite intentionally rejects ':' in served paths. Keep fs.strict enabled;
  // mirror only public frontend sources and never copy credentials or .env.
  const mirror = fs.mkdtempSync(path.join(os.tmpdir(), 'ctas-desktop-web-'));
  mirrors.push(mirror);
  fs.chmodSync(mirror, 0o700);
  const paths = ['platform/web/src', 'platform/desktop/index.html', 'platform/desktop/vite.config.mjs', 'ctds.config.json'];
  for (const relative of paths) {
    const source = path.join(root, relative), dest = path.join(mirror, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const copy = () => fs.cpSync(source, dest, { recursive: true });
    copy();
    const directory = fs.statSync(source).isDirectory();
    const watcher = fs.watch(source, { recursive: directory }, (_event, filename) => {
      const changed = directory && filename ? path.resolve(source, filename.toString()) : source;
      if (changed !== source && !changed.startsWith(source + path.sep)) return;
      const target = path.join(dest, path.relative(source, changed));
      try {
        if (fs.existsSync(changed)) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.cpSync(changed, target, { recursive: true }); }
        else fs.rmSync(target, { recursive: true, force: true });
      } catch (error) { console.error(`Frontend mirror update failed: ${error.code || 'unknown'}`); }
    });
    watchers.push(watcher);
  }
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(mirror, 'node_modules'), 'dir');
  console.log('Vite preview uses a temporary source mirror because the checkout path contains a colon.');
  return path.join(mirror, 'platform/desktop/vite.config.mjs');
}
async function main() {
  if (!['web', 'build:web', 'dev', 'build', 'info', 'test'].includes(mode)) throw new Error('Use desktop.cjs web|build:web|dev|build|info|test.');
  if (mode === 'test') {
    const cargoPath = path.join(os.homedir(), '.cargo/bin/cargo');
    const child = spawn(fs.existsSync(cargoPath) ? cargoPath : 'cargo', ['test', '--manifest-path', path.join(desktop, 'src-tauri/Cargo.toml'), ...extra], { cwd: root, env, stdio: 'inherit' });
    children.add(child); child.on('exit', () => children.delete(child)); return done(child);
  }
  if (mode === 'web') { try { return await done(start(vite, ['--config', developmentConfig(), ...extra])); } finally { stop(); } }
  if (mode === 'build:web') return done(start(vite, ['build', '--config', config, ...extra]));
  if (!fs.existsSync(tauri)) throw new Error('Run npm install before building the desktop app.');
  if (mode === 'info') return done(start(tauri, ['info', ...extra], desktop));
  if (mode === 'build') {
    await done(start(vite, ['build', '--config', config]));
    await done(start(tauri, ['build', ...extra], desktop));
    console.log(`Desktop build output: ${env.CARGO_TARGET_DIR || path.join(desktop, 'src-tauri/target')}`);
    return;
  }
  const server = start(vite, ['--config', developmentConfig()]);
  try { await waitForVite(server); await done(start(tauri, ['dev', ...extra], desktop)); } finally { stop(); }
}
main().catch(error => { stop(); console.error(error.message); process.exitCode = 1; });

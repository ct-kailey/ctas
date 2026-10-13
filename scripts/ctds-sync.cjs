'use strict';
// Vite adapter for CTDS's source-copy distribution. Never overwrites a customized
// local file. Use package-lock + metadata so updates remain explicit/reviewable.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const packageRoot = path.join(root, 'node_modules/@conscience-technology/ctds');
const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json')));
if (process.argv.includes('--check-latest')) {
  const latest = JSON.parse(execFileSync('npm', ['view', '@conscience-technology/ctds', 'version', '--json'], { encoding: 'utf8', timeout: 30000 }));
  console.log(JSON.stringify({ checked_at: new Date().toISOString(), installed: pkg.version, latest, update_available: pkg.version !== latest }, null, 2));
  process.exit(0);
}
const metaFile = path.join(root, '.ctds-meta.json');
const meta = JSON.parse(fs.readFileSync(metaFile));
const apply = process.argv.includes('--apply'), files = { ...meta.files }, report = { mode: apply ? 'apply' : 'dry-run', version: pkg.version, added: [], updated: [], customized: [], unchanged: 0 };
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const mappings = [['assets/components', 'platform/web/src/components/ctds'], ['assets/prompts', 'docs/ctds/prompts']];
for (const [from, to] of mappings) for (const src of walk(path.join(packageRoot, from))) {
  const relative = path.join(to, path.relative(path.join(packageRoot, from), src)), dest = path.join(root, relative), upstream = hash(src);
  const current = fs.existsSync(dest) ? hash(dest) : null, baseline = files[relative];
  if (current === upstream) { report.unchanged++; files[relative] = upstream; continue; }
  if (current && current !== baseline) { report.customized.push(relative); continue; }
  report[current ? 'updated' : 'added'].push(relative);
  if (apply) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); files[relative] = upstream; }
}
if (apply) fs.writeFileSync(metaFile, JSON.stringify({ ...meta, version: pkg.version, updatedAt: new Date().toISOString(), files }, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.customized.length) console.log('Customized files were preserved. Compare with the installed package and merge code and paired prompts together.');

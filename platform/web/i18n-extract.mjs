import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformUiSource } from './i18n-transform.mjs';
import { validTranslation } from './src/ui-i18n.mjs';
const sourceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const files = fs.readdirSync(sourceRoot).filter(name => /\.(?:jsx|mjs|js)$/.test(name)).sort();
const keys = new Set(), skipped = [], locations = {};
for (const name of files) {
  const result = transformUiSource(fs.readFileSync(path.join(sourceRoot, name), 'utf8'), { filename: name });
  for (const key of result.keys) { keys.add(key); (locations[key] ||= []).push(name); }
  skipped.push(...result.skipped);
}
const manifest = { keys: [...keys].sort(), locations, skipped };
if (process.argv[2] === '--check') {
  const catalog = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'locales/en.json'), 'utf8'));
  const problems = [];
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) problems.push('English catalog must be an object.');
  else {
    for (const key of manifest.keys) {
      if (!Object.hasOwn(catalog, key)) problems.push(`Missing: ${JSON.stringify(key)} (${locations[key].join(', ')})`);
      else if (!validTranslation(key, catalog[key])) problems.push(`Blank/invalid placeholders: ${JSON.stringify(key)} (${locations[key].join(', ')})`);
    }
  }
  if (problems.length) { process.stderr.write(`${problems.join('\n')}\n${problems.length} catalog issue(s).\n`); process.exitCode = 1; }
  else process.stdout.write(`UI catalog verified: ${manifest.keys.length} source messages; ${skipped.length} intentionally preserved literals.\n`);
} else {
  const output = JSON.stringify(manifest, null, 2) + '\n';
  if (process.argv[2]) fs.writeFileSync(process.argv[2], output); else process.stdout.write(output);
}

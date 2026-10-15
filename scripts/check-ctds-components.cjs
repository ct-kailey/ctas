'use strict';
// Tokens alone cannot prove that a screen uses CTDS. Inspect the active Vite
// application, and permit native controls only inside reviewed CTDS adapters or
// a direct CTDS asChild slot. Archived dashboards are not build entry points.
const fs = require('node:fs'), path = require('node:path');
const { parse } = require('@babel/parser');
const root = path.resolve(__dirname, '..'), source = path.join(root, 'platform/web/src');
const adapters = new Set(['ui.jsx', 'ui-controls.jsx']);
const primitives = new Set(['button', 'input', 'textarea', 'select', 'details', 'dialog']);
const issues = [], counts = {};
let files = 0, slots = 0;
const nameOf = node => node?.type === 'JSXIdentifier' ? node.name : node?.type === 'JSXMemberExpression' ? `${nameOf(node.object)}.${nameOf(node.property)}` : '';
const attr = (node, name) => node.attributes.find(item => item.type === 'JSXAttribute' && item.name.name === name);
const classText = node => {
  const value = attr(node, 'className')?.value;
  if (value?.type === 'StringLiteral') return value.value;
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : null;
  if (expression?.type === 'StringLiteral') return expression.value;
  return expression?.type === 'TemplateLiteral' ? expression.quasis.map(part => part.value.cooked || '').join(' ') : '';
};
function inspect(file) {
  const relative = path.relative(source, file);
  if (relative.startsWith('components/') || relative === 'ctds-contract-fixture.jsx' || adapters.has(relative)) return;
  files++;
  const ast = parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  const ctds = new Set();
  for (const item of ast.program.body) if (item.type === 'ImportDeclaration' && /(?:components\/ctds\/|\/ui(?:\.jsx)?$)/.test(item.source.value)) {
    for (const binding of item.specifiers) ctds.add(binding.local.name);
  }
  const isCTDS = name => ctds.has(name.split('.')[0]);
  const report = (node, rule) => issues.push(`${path.relative(root, file)}:${node.loc.start.line} ${rule}`);
  function visit(node, parentElement = null) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'JSXElement') {
      const opening = node.openingElement, name = nameOf(opening.name);
      const parentOpening = parentElement?.openingElement;
      const asChild = parentOpening && attr(parentOpening, 'asChild');
      const childSlot = asChild && (asChild.value === null || asChild.value?.expression?.value === true) && isCTDS(nameOf(parentOpening.name));
      if (isCTDS(name)) counts[name] = (counts[name] || 0) + 1;
      if (primitives.has(name)) {
        if (childSlot) slots++;
        else report(opening, `native <${name}>: use a CTDS component or reviewed adapter`);
      }
      const role = attr(opening, 'role')?.value?.value;
      if (['tab', 'tablist', 'listbox'].includes(role) && !/^(?:\w+\.)?(?:Tabs|Select)/.test(name)) report(opening, `handwritten role=${role}: use the matching CTDS primitive`);
      if (name === 'a' && /(?:^|\s)(?:button|text-button|icon-button)(?:\s|$)/.test(classText(opening)) && !childSlot) report(opening, 'button-styled link: use CTDS Button asChild');
      if (/^[a-z]/.test(name) && /(?:^|\s)notice(?:\s|$)/.test(classText(opening))) report(opening, 'handwritten notice: use CTDS Callout or the Notice adapter');
      for (const child of node.children) visit(child, node);
      // Event/slot render expressions may contain additional JSX.
      for (const attribute of opening.attributes) visit(attribute, node);
      return;
    }
    if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'window' && ['confirm', 'alert', 'prompt'].includes(node.callee.property?.name)) report(node, 'native browser dialog: use the CTDS confirmation provider');
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'start', 'end', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => visit(child, parentElement));
      else if (value && typeof value === 'object') visit(value, parentElement);
    }
  }
  visit(ast);
}
for (const directory of [source, path.join(source, 'desktop')].filter(directory => fs.existsSync(directory))) {
  for (const entry of fs.readdirSync(directory)) if (entry.endsWith('.jsx')) inspect(path.join(directory, entry));
}
console.log(`CTDS component audit: ${files} application files, ${Object.values(counts).reduce((sum, count) => sum + count, 0)} CTDS/adapter uses, ${slots} valid asChild slots.`);
if (issues.length) { issues.forEach(issue => console.error(issue)); process.exitCode = 1; }
else console.log('PASS: active application controls use CTDS; browser-only form transport is confined to reviewed adapters.');

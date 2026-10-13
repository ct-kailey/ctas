'use strict';
// Check AINS-owned styling. Upstream CTDS source is a token catalogue, not a lint target.
const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');
const root = path.resolve(__dirname, '..');
const src = path.join(root, 'platform/web/src');
const sourceFiles = fs.readdirSync(src).filter(name => /\.(css|jsx)$/.test(name)).map(name => path.join(src, name));
const tokens = new Set();
const issues = [];
let cssDeclarations = 0, variableReferences = 0, inlineStyles = 0, structuralTokens = 0;
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
// CSS tokens can be declared in CTDS component modules and runtime style bindings as well as tokens.css.
for (const file of walk(src).filter(file => /\.(css|jsx|tsx|js|ts)$/.test(file))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/(--[\w-]+)\s*:/g)) tokens.add(match[1]);
  for (const match of text.matchAll(/["'](--[\w-]+)["']\s*:/g)) tokens.add(match[1]);
  for (const match of text.matchAll(/\.setProperty\(\s*["'](--[\w-]+)["']/g)) tokens.add(match[1]);
}
const literalColor = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab)\s*\(/i;
const literalDimension = /(?<![\w-])(?:\d*\.)?\d+(?:px|rem|em|ms|s)\b/;
const colorProperty = /^(?:color|background(?:-color)?|border(?:-(?:top|right|bottom|left|block|inline))?(?:-color)?|outline(?:-color)?|fill|stroke|box-shadow|text-shadow|accent-color|caret-color)$/;
const allowedStructuralName = /^--ains-(?:(?:layout|viewport|workspace|panel|form|dialog|grid|content|sidebar|topbar)-|[a-z-]+-measure-\d+$)/;
const structuralProperty = /^(?:min-|max-)?(?:width|height)$|^grid-template-(?:columns|rows)$|^flex(?:-basis)?$|^(?:top|right|bottom|left|inset)$/;
function report(file, line, rule, value) {
  issues.push({ file: path.relative(root, file), line, rule, value: value.trim().slice(0, 180) });
}
function checkReferences(file, line, text) {
  for (const match of text.matchAll(/var\(\s*(--[\w-]+)/g)) {
    variableReferences += 1;
    if (!tokens.has(match[1])) report(file, line, 'undefined-token', match[1]);
  }
}
function checkValue(file, line, property, value, custom = false) {
  value = value.trim();
  checkReferences(file, line, value);
  if (!custom && !structuralProperty.test(property)) for (const match of value.matchAll(/var\((--ains-[\w-]+-measure-\d+)\)/g)) report(file, line, 'structural-token-misuse', `${property}: ${match[1]}`);
  if (/^(?:font-weight|line-height|letter-spacing)$/.test(property) && /^-?(?:\d*\.)?\d+$/.test(value) && Number(value) !== 0) report(file, line, 'literal-typography', `${property}: ${value}`);
  if (literalColor.test(value) || (colorProperty.test(property) && /\b(?:white|black)\b/.test(value))) report(file, line, 'literal-color', `${property}: ${value}`);
  if ((property === 'font-family' || property === 'fontFamily') && !/^(?:inherit|initial|unset|var\()/.test(value)) report(file, line, 'literal-font', `${property}: ${value}`);
  if (property === 'font' && !/^(?:inherit|initial|unset|var\()/.test(value)) report(file, line, 'literal-font', `${property}: ${value}`);
  if (literalDimension.test(value)) {
    // Explicit AINS layout token definitions and 1px hairline/visually hidden conventions are structural.
    const structural = custom && allowedStructuralName.test(property) && /^-?(?:\d*\.)?\d+px$/.test(value);
    const hairline = /^border(?:-|$)|^outline$/.test(property) && /^1px(?:\s|$)/.test(value) && !literalDimension.test(value.replace(/^1px\b/, ''));
    if (structural) structuralTokens += 1;
    else if (!hairline) report(file, line, 'literal-dimension-or-motion', `${property}: ${value}`);
  }
}
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.css')) {
    let ast;
    try { ast = postcss.parse(text, { from: file }); }
    catch (error) { report(file, error.line || 1, 'css-parse', error.reason || error.message); continue; }
    ast.walkDecls(declaration => {
      cssDeclarations += 1;
      checkValue(file, declaration.source.start.line, declaration.prop, declaration.value, declaration.prop.startsWith('--'));
    });
  } else {
    // Scope to JSX style bindings: business strings, imported data and icon numeric props are not styling.
    for (const match of text.matchAll(/style\s*=\s*\{\{([\s\S]*?)\}\}/g)) {
      inlineStyles += 1;
      const line = text.slice(0, match.index).split('\n').length;
      const style = match[1];
      checkReferences(file, line, style);
      if (literalColor.test(style)) report(file, line, 'inline-literal-color', style);
      if (literalDimension.test(style)) report(file, line, 'inline-literal-dimension-or-motion', style);
      const numericStyle = /\b(?:padding(?:Top|Right|Bottom|Left|Inline|Block)?|margin(?:Top|Right|Bottom|Left|Inline|Block)?|gap|rowGap|columnGap|fontSize|letterSpacing|borderRadius|transitionDuration|animationDuration)\s*:\s*(-?(?:\d*\.)?\d+)\b/g;
      for (const property of style.matchAll(numericStyle)) if (Number(property[1]) !== 0) report(file, line, 'inline-numeric-style', property[0]);
      for (const property of style.matchAll(/\bfontFamily\s*:\s*['"]([^'"]+)['"]/g)) checkValue(file, line, 'fontFamily', property[1]);
    }
  }
}
const counts = issues.reduce((sum, issue) => { sum[issue.rule] = (sum[issue.rule] || 0) + 1; return sum; }, {});
console.log(`CTDS token audit: ${sourceFiles.length} AINS files, ${cssDeclarations} CSS declarations, ${variableReferences} variable references, ${inlineStyles} inline style bindings.`);
console.log(`Catalog: ${tokens.size} declared tokens; ${structuralTokens} explicit AINS layout dimensions; vendor implementation and media breakpoints excluded.`);
if (issues.length) {
  for (const issue of issues.slice(0, 60)) console.error(`${issue.file}:${issue.line} [${issue.rule}] ${issue.value}`);
  if (issues.length > 60) console.error(`... ${issues.length - 60} more issue(s).`);
  console.error(`FAIL: ${issues.length} issue(s). ${JSON.stringify(counts)}`);
  process.exitCode = 1;
} else {
  console.log('PASS: no literal style values or undefined token references in AINS-owned styles.');
}

import { parse } from '@babel/parser';
import path from 'node:path';

const KOREAN = /[\uac00-\ud7a3]/;
const EXCLUDED = new Set(['ui-i18n.mjs', 'ui-language-state.mjs', 'question-language-state.mjs']);
const DISPLAY_ATTRIBUTES = new Set(['title', 'label', 'placeholder', 'aria-label', 'aria-description', 'alt', 'description', 'hint', 'eyebrow', 'dismissLabel', 'emptyLabel', 'loadingLabel', 'searchPlaceholder', 'emptyMessage', 'emptyTitle', 'emptyDescription', 'submit', 'optional', 'options', 'from', 'body', 'message', 'error']);
const SEMANTIC_METHODS = new Set(['includes', 'indexOf', 'lastIndexOf', 'startsWith', 'endsWith', 'replace', 'replaceAll', 'split', 'match', 'matchAll', 'search', 'test', 'exec', 'localeCompare', 'setItem', 'getItem', 'removeItem', 'append', 'set']);
const CONTENT_FIELDS = new Set(['channel', 'title', 'question', 'body', 'text', 'content', 'summary', 'description', 'reason', 'notes', 'comment', 'message', 'prompt', 'recipient', 'name', 'requirement', 'rationale', 'temporary_approach', 'decision', 'resolution', 'answer']);
const nameOf = node => ['Identifier', 'JSXIdentifier'].includes(node?.type) ? node.name : node?.type === 'StringLiteral' ? node.value : '';
const callName = node => nameOf(node?.callee?.property || node?.callee);
const contains = (parent, child) => parent && child.start >= parent.start && child.end <= parent.end;
const quote = value => JSON.stringify(value);

// React's JSX whitespace normalization, before converting text into an expression.
export function jsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) lastNonEmpty = i;
  return lines.map((line, index) => {
    let result = line.replace(/\t/g, ' ');
    if (index !== 0) result = result.replace(/^ +/, '');
    if (index !== lines.length - 1) result = result.replace(/ +$/, '');
    return result && index !== lastNonEmpty ? `${result} ` : result;
  }).join('');
}

function exclusion(node, parents, semanticValues = new Set()) {
  const parent = parents.at(-1);
  if (node.type === 'DirectiveLiteral') return 'directive';
  if (parent?.type === 'ObjectProperty' && parent.key === node) return 'object-key';
  if (['MemberExpression', 'OptionalMemberExpression'].includes(parent?.type) && parent.property === node) return 'property-key';
  const attr = parents.findLast(item => item.type === 'JSXAttribute');
  const attrChildren = attr ? parents.slice(parents.lastIndexOf(attr) + 1) : [];
  const element = parents.findLast(item => item.type === 'JSXOpeningElement');
  const metricValue = nameOf(attr?.name) === 'value' && nameOf(element?.name) === 'MetricCard';
  if (attr && !DISPLAY_ATTRIBUTES.has(nameOf(attr.name)) && !metricValue && !attrChildren.some(item => ['JSXElement', 'JSXFragment', 'ArrowFunctionExpression', 'FunctionExpression'].includes(item.type))) return 'non-display-attribute';
  if (parents.some(item => item.type === 'TaggedTemplateExpression')) return 'tagged-template';
  if (parents.some(item => item.type === 'BinaryExpression' && ['===', '!==', '==', '!=', 'in'].includes(item.operator))) return 'semantic-comparison';
  for (const ancestor of parents) {
    if (['CallExpression', 'OptionalCallExpression'].includes(ancestor.type)) {
      const name = callName(ancestor);
      if (SEMANTIC_METHODS.has(name) && ancestor.arguments.some(arg => contains(arg, node))) return 'semantic-call';
      if ((['request', 'fetch', 'sendBeacon'].includes(name) || (name === 'stringify' && ancestor.callee?.object?.name === 'JSON')) && ancestor.arguments.some(arg => contains(arg, node))) return 'request-payload';
    }
    if (ancestor.type === 'ObjectProperty' && ['body', 'payload', 'prompt', 'messages'].includes(nameOf(ancestor.key))) return 'content-payload';
  }
  const field = parents.findLast(item => item.type === 'ObjectProperty');
  if (field && CONTENT_FIELDS.has(nameOf(field.key))) {
    if (parents.some(item => ['CallExpression', 'OptionalCallExpression'].includes(item.type) && /^(useState|setForm|setDraft|setValues|setRecord)$/.test(callName(item)))) return 'editable-content-default';
    const declaration = parents.findLast(item => item.type === 'VariableDeclarator');
    if (declaration && /(?:form|draft|payload|body|initial|record|params)/i.test(nameOf(declaration.id))) return 'editable-content-default';
  }
  const declaration = parents.findLast(item => item.type === 'VariableDeclarator');
  if (declaration && /(?:TEMPLATE|DRAFT|EXAMPLE)/.test(nameOf(declaration.id))) return 'content-template';
  if (node.type === 'StringLiteral' && semanticValues.has(node.value)) {
    const container = parents.findLast(item => item.type === 'JSXExpressionContainer');
    const afterContainer = container ? parents.slice(parents.lastIndexOf(container) + 1) : [];
    const callback = afterContainer.some(item => ['ArrowFunctionExpression', 'FunctionExpression'].includes(item.type));
    const explicitDisplay = (attr && DISPLAY_ATTRIBUTES.has(nameOf(attr.name)) && nameOf(attr.name) !== 'options') || (container && !attr && !callback);
    if (!explicitDisplay) return 'semantic-identity';
  }
  return null;
}

function dateLocale(node, parent) {
  if (node.type !== 'StringLiteral' || node.value !== 'ko-KR' || !['NewExpression', 'CallExpression'].includes(parent?.type) || parent.arguments[0] !== node) return false;
  const name = callName(parent);
  return ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'].includes(name) ||
    (parent.callee?.object?.name === 'Intl' && ['DateTimeFormat', 'NumberFormat', 'RelativeTimeFormat', 'ListFormat'].includes(name));
}

export function transformUiSource(code, { filename = 'view.jsx', runtimeImport = './ui-i18n.mjs' } = {}) {
  if (EXCLUDED.has(path.basename(filename))) return { code, keys: [], skipped: [], changed: false };
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
  const edits = [], keys = new Set(), skipped = [];
  const semanticValues = new Set();
  function identifySemantics(node, parents = []) {
    if (!node || typeof node !== 'object' || !node.type) return;
    if (node.type === 'StringLiteral' && KOREAN.test(node.value) && ['semantic-comparison', 'semantic-call'].includes(exclusion(node, parents))) semanticValues.add(node.value);
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => identifySemantics(child, [...parents, node]));
      else if (value?.type) identifySemantics(value, [...parents, node]);
    }
  }
  identifySemantics(ast);
  let needsTranslate = false, needsLocale = false, needsParts = false;
  const sourceWithEdits = node => {
    let text = code.slice(node.start, node.end);
    for (const edit of edits.filter(edit => edit.start >= node.start && edit.end <= node.end).sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start - node.start) + edit.text + text.slice(edit.end - node.start);
    return text;
  };
  function add(node, text) {
    for (let i = edits.length - 1; i >= 0; i--) if (edits[i].start >= node.start && edits[i].end <= node.end) edits.splice(i, 1);
    edits.push({ start: node.start, end: node.end, text });
  }
  function walk(node, parents = []) {
    if (!node || typeof node !== 'object' || !node.type) return;
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => walk(child, [...parents, node]));
      else if (value?.type) walk(value, [...parents, node]);
    }
    if (['JSXElement', 'JSXFragment'].includes(node.type)) {
      let run = [];
      const flush = () => {
        if (run.length > 1 && run.some(child => child.type === 'JSXText' && KOREAN.test(child.value)) && run.some(child => child.type === 'JSXExpressionContainer')) {
          const values = []; let source = '';
          for (const child of run) {
            if (child.type === 'JSXText') source += jsxText(child.value);
            else { source += `{${values.length}}`; values.push(sourceWithEdits(child.expression)); }
          }
          keys.add(source.trim()); needsParts = true;
          add({ start: run[0].start, end: run.at(-1).end }, `{__ainsTranslateParts(${quote(source)}, [${values.join(', ')}])}`);
        }
        run = [];
      };
      for (const child of node.children) {
        if (child.type === 'JSXText' || (child.type === 'JSXExpressionContainer' && child.expression.type !== 'JSXEmptyExpression')) run.push(child);
        else flush();
      }
      flush();
    }
    const parent = parents.at(-1);
    if (dateLocale(node, parent)) { needsLocale = true; add(node, '__ainsLocaleTag()'); return; }
    if (!['StringLiteral', 'JSXText', 'TemplateLiteral'].includes(node.type)) return;
    const source = node.type === 'TemplateLiteral'
      ? node.quasis.map((part, index) => (part.value.cooked ?? part.value.raw) + (index < node.expressions.length ? `{${index}}` : '')).join('')
      : node.type === 'JSXText' ? jsxText(node.value) : node.value;
    if (!KOREAN.test(source)) return;
    const reason = exclusion(node, parents, semanticValues);
    if (reason) { skipped.push({ file: path.basename(filename), line: node.loc.start.line, reason, source }); return; }
    keys.add(source.trim()); needsTranslate = true;
    const args = node.type === 'TemplateLiteral' && node.expressions.length ? `, [${node.expressions.map(sourceWithEdits).join(', ')}]` : '';
    const call = `__ainsTranslate(${quote(source)}${args})`;
    add(node, node.type === 'JSXText' || parent?.type === 'JSXAttribute' ? `{${call}}` : call);
  }
  walk(ast);
  if (!edits.length) return { code, keys: [...keys], skipped, changed: false };
  let output = code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  const bindings = [needsTranslate && 'translate as __ainsTranslate', needsLocale && 'getLocaleTag as __ainsLocaleTag', needsParts && 'translateParts as __ainsTranslateParts'].filter(Boolean).join(', ');
  return { code: `import { ${bindings} } from ${quote(runtimeImport)};\n${output}`, keys: [...keys], skipped, changed: true };
}

export function ainsUiI18n() {
  let sourceRoot;
  return {
    name: 'ains-source-ui-i18n', enforce: 'pre',
    configResolved(config) { sourceRoot = path.resolve(config.root, 'src'); },
    transform(code, id) {
      const filename = id.split('?')[0];
      if (path.dirname(filename) !== sourceRoot || !/\.(?:jsx|mjs|js)$/.test(filename) || EXCLUDED.has(path.basename(filename))) return null;
      const result = transformUiSource(code, { filename });
      return result.changed ? { code: result.code, map: null } : null;
    },
  };
}

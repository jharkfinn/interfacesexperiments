// A view is declared as data. The Document view is the editor itself; every
// other view shows pieces of the document and says what gestures do to them.
//
//   unit    what one piece is            sentence | paragraph
//   group   how pieces form rows         paragraph | none
//   show    what a piece displays        text | start (first words)
//   layout  how pieces are arranged      flow | list
//   on      gesture → operation          drop-on, drop-between, double-click, delete
//
// A declaration is data only. It names operations from a fixed list and never
// carries code, so a declaration from anywhere cannot run a script in the page.

export const VOCABULARY = {
  kind: ['document', 'pieces'],
  unit: ['sentence', 'paragraph'],
  group: ['paragraph', 'none'],
  show: ['text', 'start'],
  layout: ['flow', 'list'],
};
// Each gesture, and the operations it may name.
export const GESTURES = {
  'drop-on': ['combine'],
  'drop-between': ['move'],
  'double-click': ['open'],
  delete: ['remove'],
};
// Operations that change sentences work only on sentence pieces for now.
const SENTENCE_ONLY = new Set(['combine', 'move', 'remove']);

export const BUILT_IN = [
  { id: 'document', title: 'Document', kind: 'document' },
  {
    id: 'sentences',
    title: 'Sentences',
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'text',
    layout: 'flow',
    on: { 'drop-on': 'combine', 'drop-between': 'move', 'double-click': 'open', delete: 'remove' },
  },
  {
    id: 'paragraphs',
    title: 'Paragraphs',
    kind: 'pieces',
    unit: 'paragraph',
    group: 'none',
    show: 'start',
    layout: 'list',
    on: { 'double-click': 'open' },
  },
];

// The problems in a declaration, as sentences a person can act on; none when
// it is valid. Fields left out take the defaults of a Sentences view.
export function checkSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['A view is an object with fields such as "unit" and "layout".'];
  }
  if (typeof spec.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(spec.id)) {
    problems.push('"id" must be lowercase letters, digits, or hyphens, starting with a letter.');
  }
  if (typeof spec.title !== 'string' || !spec.title.trim() || spec.title.length > 40) {
    problems.push('"title" must be text of 1 to 40 characters.');
  }
  for (const [field, allowed] of Object.entries(VOCABULARY)) {
    if (spec[field] !== undefined && !allowed.includes(spec[field])) {
      problems.push(`"${field}" must be one of: ${allowed.join(', ')}.`);
    }
  }
  const known = new Set(['id', 'title', 'on', ...Object.keys(VOCABULARY)]);
  for (const field of Object.keys(spec)) {
    if (!known.has(field)) problems.push(`"${field}" is not a field a view can have.`);
  }
  if (spec.on !== undefined) {
    if (!spec.on || typeof spec.on !== 'object' || Array.isArray(spec.on)) {
      problems.push('"on" must map gestures to operations.');
    } else {
      for (const [gesture, operation] of Object.entries(spec.on)) {
        if (!GESTURES[gesture]) {
          problems.push(`"${gesture}" is not a gesture. Use: ${Object.keys(GESTURES).join(', ')}.`);
        } else if (operation !== null && !GESTURES[gesture].includes(operation)) {
          problems.push(`"${gesture}" can do: ${GESTURES[gesture].join(', ')}.`);
        } else if (SENTENCE_ONLY.has(operation) && (spec.unit || 'sentence') !== 'sentence') {
          problems.push(`"${operation}" works on sentences only, so "unit" must be "sentence".`);
        }
      }
    }
  }
  return problems;
}

// A declaration with every field filled in.
export function fullSpec(spec) {
  if (spec.kind === 'document') return { ...spec };
  return {
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'text',
    layout: 'flow',
    ...spec,
    on: { ...spec.on },
  };
}

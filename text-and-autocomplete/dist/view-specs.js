import { MAX_PURPOSE_CHARS } from './segment-core.js?v=da80b70b8354';

// A view is declared as data. The Document view is the editor itself; every
// other view shows pieces of the document and says what gestures do to them.
//
//   unit     what one piece is          sentence | paragraph | claude
//   purpose  what the view is for       words; with unit "claude", Claude
//                                       divides the document to suit them
//   group    how pieces form rows       paragraph | none
//   show     what a piece displays      text | start (first words) | label
//                                       (Claude's name for the piece)
//   layout   how pieces are arranged    flow | list | cards | bars (one bar
//                                       per piece, as long as its word count)
//   on       gesture → operation        drop-on, drop-between, double-click, delete
//
// A declaration is data only. It names operations from a fixed list and never
// carries code, so a declaration from anywhere cannot run a script in the page.

export const VOCABULARY = {
  kind: ['document', 'pieces'],
  unit: ['sentence', 'paragraph', 'claude'],
  group: ['paragraph', 'none'],
  show: ['text', 'start', 'label'],
  layout: ['flow', 'list', 'cards', 'bars'],
};
// Each gesture, and the operations it may name.
export const GESTURES = {
  'drop-on': ['combine'],
  'drop-between': ['move'],
  'double-click': ['open'],
  delete: ['remove'],
};
// Combining and removing work on sentences only for now.
const SENTENCE_ONLY = new Set(['combine', 'remove']);
const MAX_TITLE_CHARS = 40;

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
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'rhythm',
    title: 'Rhythm',
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'start',
    layout: 'bars',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'outline',
    title: 'Outline',
    kind: 'pieces',
    unit: 'claude',
    purpose:
      'The parts a reader would list in an outline of this document: each section, step, or turn in the argument.',
    group: 'none',
    show: 'label',
    layout: 'list',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'ideas',
    title: 'Ideas',
    kind: 'pieces',
    unit: 'claude',
    purpose: 'The distinct ideas a reader takes away from this document, one idea per piece.',
    group: 'none',
    show: 'label',
    layout: 'cards',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
];

// The problems in a declaration, as sentences a person can act on; none when
// it is valid. Fields left out take the defaults that fullSpec() fills in.
export function checkSpec(spec) {
  const problems = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    return ['A view is an object with fields such as "unit" and "layout".'];
  }
  if (typeof spec.id !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(spec.id)) {
    problems.push('"id" must be lowercase letters, digits, or hyphens, starting with a letter.');
  }
  if (typeof spec.title !== 'string' || !spec.title.trim() || spec.title.length > MAX_TITLE_CHARS) {
    problems.push(`"title" must be text of 1 to ${MAX_TITLE_CHARS} characters.`);
  }
  for (const [field, allowed] of Object.entries(VOCABULARY)) {
    if (spec[field] !== undefined && !allowed.includes(spec[field])) {
      problems.push(`"${field}" must be one of: ${allowed.join(', ')}.`);
    }
  }
  const known = new Set(['id', 'title', 'on', 'purpose', ...Object.keys(VOCABULARY)]);
  for (const field of Object.keys(spec)) {
    if (!known.has(field)) problems.push(`"${field}" is not a field a view can have.`);
  }
  if (spec.kind === 'document') return problems;
  const unit = spec.unit || 'sentence';
  if (unit === 'claude') {
    if (
      typeof spec.purpose !== 'string' ||
      !spec.purpose.trim() ||
      spec.purpose.length > MAX_PURPOSE_CHARS
    ) {
      problems.push(
        `With "unit": "claude", "purpose" must say what the view is for, in 1 to ${MAX_PURPOSE_CHARS} characters.`,
      );
    }
  } else if (spec.purpose !== undefined) {
    problems.push('"purpose" is used only with "unit": "claude".');
  }
  if (unit !== 'sentence' && spec.group === 'paragraph') {
    problems.push(`With "unit": "${unit}", "group" must be "none".`);
  }
  if (spec.show === 'label' && unit !== 'claude') {
    problems.push('"show": "label" needs "unit": "claude", because Claude writes the labels.');
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
        } else if (SENTENCE_ONLY.has(operation) && unit !== 'sentence') {
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
  const unit = spec.unit || 'sentence';
  return {
    kind: 'pieces',
    unit,
    group: unit === 'sentence' ? 'paragraph' : 'none',
    show: unit === 'claude' ? 'label' : 'text',
    layout: unit === 'sentence' ? 'flow' : 'list',
    ...spec,
    on: { ...spec.on },
  };
}

// A new view from a title and what it is for: Claude divides the document to
// suit the purpose, and pieces move by dragging.
export function specFromPurpose({ id, title, purpose, layout = 'list', move = true, open = true }) {
  const on = {};
  if (move) on['drop-between'] = 'move';
  if (open) on['double-click'] = 'open';
  return {
    id,
    title: title.trim(),
    kind: 'pieces',
    unit: 'claude',
    purpose: purpose.trim(),
    group: 'none',
    show: 'label',
    layout,
    on,
  };
}

// An id for a new view's title, unlike the ids already taken.
export function idFor(title, taken) {
  const base =
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 30) || 'view';
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`;
  return id;
}

import { STRUCTURE_CHECKS } from './legal-core.js';
import { MAX_PURPOSE_CHARS, MAX_LEVELS } from './segment-core.js?v=bc5c5daaadea';

// A view is declared as data. The Document view is the editor itself; every
// other view shows pieces of the document and says what gestures do to them.
//
//   unit     what one piece is          sentence | paragraph | claude | level |
//                                       role (a run of sentences that do one
//                                       job in a legal analysis: IRAC)
//   purpose  what the view is for       words; with unit "claude", Claude
//                                       divides the document to suit them
//   level    which level of goals       1 (the main goals) to 4; with unit
//                                       "level", the view shows one level of
//                                       Claude's tree of what the text tries
//                                       to do, which all level views share
//   group    how pieces form rows       paragraph | parent (the goal above,
//                                       on levels 2 and down) | section (the
//                                       document's headings, for unit role) | none
//   show     what a piece displays      text | start (first words) | label
//                                       (Claude's name for the piece) | method
//                                       (the goal and how the piece reaches it) |
//                                       role (the piece's IRAC job) | sources
//                                       (what a sentence asserts, its support,
//                                       citations, and flags)
//   header   a panel above the pieces   none | checks (IRAC structure checks) |
//                                       authorities (a table of authorities)
//   checks   which structure checks     a list of names from STRUCTURE_CHECKS
//   layout   how pieces are arranged    flow | list | cards | bars (one bar
//                                       per piece, as long as its word count)
//   on       gesture → operation        drop-on, drop-between, double-click, delete
//
// A declaration is data only. It names operations from a fixed list and never
// carries code, so a declaration from anywhere cannot run a script in the page.

export const VOCABULARY = {
  kind: ['document', 'pieces'],
  unit: ['sentence', 'paragraph', 'claude', 'level', 'role'],
  group: ['paragraph', 'parent', 'section', 'none'],
  show: ['text', 'start', 'label', 'method', 'role', 'sources'],
  layout: ['flow', 'list', 'cards', 'bars'],
  header: ['none', 'checks', 'authorities'],
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
    id: 'irac',
    title: 'IRAC',
    kind: 'pieces',
    unit: 'role',
    group: 'section',
    show: 'role',
    layout: 'list',
    header: 'checks',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'sourcing',
    title: 'Sourcing',
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'sources',
    layout: 'list',
    header: 'authorities',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'goals',
    title: 'Goals',
    kind: 'pieces',
    unit: 'level',
    level: 1,
    group: 'none',
    show: 'label',
    layout: 'list',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
  {
    id: 'how',
    title: 'How',
    kind: 'pieces',
    unit: 'level',
    level: 2,
    group: 'parent',
    show: 'method',
    layout: 'list',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  },
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
  const known = new Set([
    'id',
    'title',
    'on',
    'purpose',
    'level',
    'checks',
    ...Object.keys(VOCABULARY),
  ]);
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
  if (unit === 'level') {
    if (!Number.isInteger(spec.level) || spec.level < 1 || spec.level > MAX_LEVELS) {
      problems.push(
        `With "unit": "level", "level" must be a whole number from 1 (the main goals) to ${MAX_LEVELS}.`,
      );
    }
  } else if (spec.level !== undefined) {
    problems.push('"level" is used only with "unit": "level".');
  }
  if (unit !== 'sentence' && spec.group === 'paragraph') {
    problems.push(
      unit === 'role'
        ? 'With "unit": "role", "group" must be "section" or "none".'
        : `With "unit": "${unit}", "group" must be "none".`,
    );
  }
  if (spec.group === 'section' && unit !== 'role') {
    problems.push('"group": "section" needs "unit": "role".');
  }
  if (spec.show === 'role' && unit !== 'role') {
    problems.push('"show": "role" needs "unit": "role".');
  }
  if (spec.show === 'sources' && unit !== 'sentence') {
    problems.push(
      '"show": "sources" needs "unit": "sentence", because support is read sentence by sentence.',
    );
  }
  // An IRAC view shows roles unless it says otherwise.
  const show = spec.show ?? (unit === 'role' ? 'role' : undefined);
  if ((show === 'role' || show === 'sources') && (spec.layout ?? 'list') !== 'list') {
    problems.push(`"show": "${show}" works only with "layout": "list".`);
  }
  if (spec.header === 'checks' && unit !== 'role') {
    problems.push('"header": "checks" needs "unit": "role".');
  }
  if (spec.checks !== undefined) {
    const names = spec.checks;
    if (
      !Array.isArray(names) ||
      names.some(name => !STRUCTURE_CHECKS.includes(name)) ||
      new Set(names).size !== names.length
    ) {
      problems.push(
        `"checks" must be a list of different checks from: ${STRUCTURE_CHECKS.join(', ')}.`,
      );
    }
    const header = spec.header ?? (unit === 'role' ? 'checks' : 'none');
    if (header !== 'checks') problems.push('"checks" needs "header": "checks".');
  }
  if (spec.group === 'parent' && !(unit === 'level' && spec.level > 1)) {
    problems.push('"group": "parent" needs "unit": "level" and "level" 2 or more.');
  }
  if (spec.show === 'label' && unit !== 'claude' && unit !== 'level') {
    problems.push(
      '"show": "label" needs "unit": "claude" or "level", because Claude writes the labels.',
    );
  }
  if (spec.show === 'method' && unit !== 'level') {
    problems.push('"show": "method" needs "unit": "level", because only goals have methods.');
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

// A declaration with every field filled in. A panel above the pieces, and the
// checks it runs, appear only when the view has one.
export function fullSpec(spec) {
  if (spec.kind === 'document') return { ...spec };
  const unit = spec.unit || 'sentence';
  const role = unit === 'role';
  const sources = spec.show === 'sources';
  const full = {
    kind: 'pieces',
    unit,
    group: role ? 'section' : unit === 'sentence' ? 'paragraph' : 'none',
    show: role ? 'role' : unit === 'claude' || unit === 'level' ? 'label' : 'text',
    layout: unit === 'sentence' && !sources ? 'flow' : 'list',
    ...(role ? { header: 'checks' } : sources ? { header: 'authorities' } : {}),
    ...spec,
    on: { ...spec.on },
  };
  if (full.header === 'checks' && full.checks === undefined) full.checks = [...STRUCTURE_CHECKS];
  if (full.header === 'none') delete full.header;
  return full;
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

// A new view of one level of Claude's tree of goals. Below the main goals,
// pieces show how they reach their goal and are grouped by it.
export function specFromLevel({ id, title, level, layout = 'list', move = true, open = true }) {
  const on = {};
  if (move) on['drop-between'] = 'move';
  if (open) on['double-click'] = 'open';
  return {
    id,
    title: title.trim(),
    kind: 'pieces',
    unit: 'level',
    level,
    group: level > 1 ? 'parent' : 'none',
    show: level > 1 ? 'method' : 'label',
    layout,
    on,
  };
}

// A new IRAC view: Claude labels each sentence's job, and the app groups the
// labels by the document's headings and checks the structure.
export function specFromRoles({ id, title, move = true, open = true }) {
  const on = {};
  if (move) on['drop-between'] = 'move';
  if (open) on['double-click'] = 'open';
  return {
    id,
    title: title.trim(),
    kind: 'pieces',
    unit: 'role',
    group: 'section',
    show: 'role',
    layout: 'list',
    header: 'checks',
    on,
  };
}

// A new Sourcing view: each sentence with what it asserts and its support, under
// a table of authorities.
export function specFromSources({ id, title, move = true, open = true }) {
  const on = {};
  if (move) on['drop-between'] = 'move';
  if (open) on['double-click'] = 'open';
  return {
    id,
    title: title.trim(),
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'sources',
    layout: 'list',
    header: 'authorities',
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

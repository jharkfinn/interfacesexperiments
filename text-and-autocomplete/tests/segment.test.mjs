import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEGMENT_INSTRUCTIONS,
  LEVELS_INSTRUCTIONS,
  MAX_LEVELS,
  segmentEvent,
  levelsEvent,
  parseSegments,
  parseLevels,
  normalize,
  remap,
  remapLevels,
  cleanLabel,
} from '../dist/segment-core.js';
import { MAX_WORDS } from '../dist/compose-core.js';
import { LEGAL_INSTRUCTIONS } from '../dist/legal-core.js';
import { LEGAL, LEVELS, divisionKey } from '../dist/segments.js';
import { buildRequest } from '../scripts/bridge/prompts.mjs';

// Three paragraphs: a heading, two sentences, three sentences (6 sentences in all).
const PARAGRAPHS = [
  { kind: 'h1', sentences: ['Pancakes for Dinner'] },
  { kind: 'p', sentences: ['Pancakes are quick.', 'They take ten minutes.'] },
  { kind: 'p', sentences: ['Go sweet.', 'Go savory.', 'Both work.'] },
];

test('a segment request numbers sentences through the document and carries the purpose', () => {
  const event = segmentEvent('id', { purpose: ' The ideas. ', paragraphs: PARAGRAPHS });
  assert.equal(event.response.metadata.operation, 'segment');
  assert.equal(event.response.instructions, SEGMENT_INSTRUCTIONS);
  const input = JSON.parse(event.response.input[0].content[0].text);
  assert.equal(input.purpose, 'The ideas.');
  assert.deepEqual(input.paragraphs[2], {
    kind: 'p',
    sentences: [
      { n: 4, text: 'Go sweet.' },
      { n: 5, text: 'Go savory.' },
      { n: 6, text: 'Both work.' },
    ],
  });
});

test('a segment request refuses a bad purpose or document', () => {
  const ok = { purpose: 'Ideas', paragraphs: PARAGRAPHS };
  assert.throws(() => segmentEvent('id', { ...ok, purpose: '' }));
  assert.throws(() => segmentEvent('id', { ...ok, purpose: 'x'.repeat(301) }));
  assert.throws(() => segmentEvent('id', { ...ok, paragraphs: 'text' }));
  assert.throws(() =>
    segmentEvent('id', { ...ok, paragraphs: [{ kind: 'script', sentences: ['A.'] }] }),
  );
  assert.throws(() => segmentEvent('id', { ...ok, paragraphs: [{ kind: 'p', sentences: [] }] }));
  assert.throws(() => segmentEvent('id', { ...ok, paragraphs: [{ kind: 'p', sentences: [3] }] }));
  assert.throws(() =>
    segmentEvent('id', {
      ...ok,
      paragraphs: [{ kind: 'p', sentences: ['word '.repeat(MAX_WORDS + 1)] }],
    }),
  );
});

test('a document within the limit is never refused for its number of paragraphs', () => {
  // A transcript of short lines: 600 paragraphs, 1,200 words.
  const lines = Array.from({ length: 600 }, (_, n) => ({ kind: 'p', sentences: [`Q${n}. Yes.`] }));
  const input = JSON.parse(
    segmentEvent('id', { purpose: 'Ideas', paragraphs: lines }).response.input[0].content[0].text,
  );
  assert.equal(input.paragraphs.length, 600);
  assert.doesNotThrow(() => levelsEvent('id', { paragraphs: lines }));
  // A list longer than the limit has words is refused before its text is counted.
  const many = Array.from({ length: MAX_WORDS + 1 }, () => ({ kind: 'li', sentences: ['A'] }));
  assert.throws(
    () => levelsEvent('id', { paragraphs: many }),
    /Expected the document as a list of paragraphs/,
  );
});

test('a block quotation is a paragraph Claude can see', () => {
  const event = segmentEvent('id', {
    purpose: 'Ideas',
    paragraphs: [{ kind: 'blockquote', sentences: ['“A dwelling.” Id. at 2.'] }],
  });
  const input = JSON.parse(event.response.input[0].content[0].text);
  assert.equal(input.paragraphs[0].kind, 'blockquote');
});

test('a valid reply becomes pieces as given', () => {
  const raw = JSON.stringify({
    pieces: [
      { first: 1, last: 1, label: 'Title' },
      { first: 2, last: 3, label: 'Why pancakes' },
      { first: 4, last: 6, label: 'Ways to eat them' },
    ],
  });
  assert.deepEqual(parseSegments(raw, PARAGRAPHS), [
    { first: 1, last: 1, label: 'Title' },
    { first: 2, last: 3, label: 'Why pancakes' },
    { first: 4, last: 6, label: 'Ways to eat them' },
  ]);
});

test('a reply in a code fence, with gaps, overlaps, and a late start, is repaired', () => {
  const raw =
    'Here you go:\n```json\n{"pieces":[{"first":3,"last":4,"label":"B"},{"first":2,"last":9,"label":"A"},{"first":2,"label":"dup"},{"first":99,"label":"out"},{"first":6,"label":"C"}]}\n```';
  // Pieces start at 2, 3, and 6; sentence 1 joins the first piece. The run 1-2
  // crosses from the heading into a paragraph, so it splits there; 3-5 splits
  // at the start of the third paragraph.
  assert.deepEqual(parseSegments(raw, PARAGRAPHS), [
    { first: 1, last: 1, label: 'A' },
    { first: 2, last: 2, label: 'A' },
    { first: 3, last: 3, label: 'B' },
    { first: 4, last: 5, label: 'B' },
    { first: 6, last: 6, label: 'C' },
  ]);
});

test('a reply with no usable piece is refused', () => {
  assert.equal(parseSegments('no json here', PARAGRAPHS), null);
  assert.equal(parseSegments('{"pieces": "all"}', PARAGRAPHS), null);
  assert.equal(parseSegments('{"pieces": [{"first": 0}]}', PARAGRAPHS), null);
  assert.deepEqual(parseSegments('{"pieces": []}', []), []);
});

test('runs of whole paragraphs stay whole; partial ones split at paragraph boundaries', () => {
  const counts = [1, 2, 3];
  assert.deepEqual(normalize([{ first: 1, last: 6, label: 'All' }], counts), [
    { first: 1, last: 6, label: 'All' },
  ]);
  assert.deepEqual(normalize([{ first: 2, last: 5, label: 'X' }], counts), [
    { first: 2, last: 3, label: 'X' },
    { first: 4, last: 5, label: 'X' },
  ]);
  assert.deepEqual(normalize([{ first: 3, last: 6, label: 'Y' }], counts), [
    { first: 3, last: 3, label: 'Y' },
    { first: 4, last: 6, label: 'Y' },
  ]);
});

test('labels are short plain text', () => {
  assert.equal(cleanLabel('  "Why  pancakes" '), 'Why pancakes');
  assert.equal(cleanLabel(42), '');
  assert.equal(cleanLabel('x'.repeat(80)).length, 60);
  assert.equal(cleanLabel('“‘Quoted’”'), 'Quoted');
  assert.equal(cleanLabel('"”’'), '');
});

test('a label of a long run of quotation marks is cleaned in time', () => {
  // A reply may be up to 65,536 characters on the bridge.
  const started = performance.now();
  assert.equal(cleanLabel(`${'’'.repeat(30000)}x`), `${'’'.repeat(59)}…`);
  assert.ok(performance.now() - started < 50, `${performance.now() - started} ms`);
});

test('stored pieces follow their sentences through moves and edits', () => {
  const stored = {
    pieces: [
      { label: 'Title', sentences: ['Pancakes for Dinner'] },
      { label: 'Why', sentences: ['Pancakes are quick.', 'They take ten minutes.'] },
      { label: 'Ways', sentences: ['Go sweet.', 'Go savory.', 'Both work.'] },
    ],
  };
  // The third paragraph moved before the second, and a sentence was edited.
  const moved = [
    { kind: 'h1', sentences: ['Pancakes for Dinner'] },
    { kind: 'p', sentences: ['Go sweet.', 'Go savory!', 'Both work.'] },
    { kind: 'p', sentences: ['Pancakes are quick.', 'They take ten minutes.'] },
  ];
  assert.deepEqual(remap(stored, moved), [
    { first: 1, last: 1, label: 'Title' },
    { first: 2, last: 4, label: 'Ways' },
    { first: 5, last: 6, label: 'Why' },
  ]);
  assert.equal(remap(null, moved), null);
});

test('the bridge builds a segment request and refuses a bad one', () => {
  const request = buildRequest({ op: 'segment', purpose: 'Ideas', paragraphs: PARAGRAPHS });
  assert.equal(request.operation, 'segment');
  assert.equal(request.instructions, SEGMENT_INSTRUCTIONS);
  assert.equal(request.timeoutMs, 30000);
  assert.throws(() =>
    buildRequest({ op: 'segment', purpose: 'Ideas', paragraphs: [{ kind: 'p' }] }),
  );
  assert.throws(() => buildRequest({ op: 'segment', paragraphs: PARAGRAPHS }));
});

// Every level covers sentences 1 to `total` once, in order; each piece is inside
// one paragraph or is whole paragraphs; and each piece fits inside its parent.
function assertTree(levels, paragraphs) {
  const counts = paragraphs.map(paragraph => paragraph.sentences.length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const starts = counts.map((_, at) => counts.slice(0, at).reduce((sum, c) => sum + c, 0) + 1);
  const paragraphOf = n => starts.findLastIndex(start => start <= n);
  levels.forEach((pieces, level) => {
    let next = 1;
    for (const piece of pieces) {
      assert.equal(piece.first, next, `level ${level} starts where the last piece ended`);
      assert.ok(piece.last >= piece.first);
      const a = paragraphOf(piece.first);
      const b = paragraphOf(piece.last);
      if (a !== b) {
        assert.equal(piece.first, starts[a], 'a piece across paragraphs starts one');
        assert.equal(piece.last, starts[b] + counts[b] - 1, 'and ends one');
      }
      if (level) {
        const parent = levels[level - 1][piece.parent];
        assert.ok(parent, `level ${level} piece has a parent`);
        assert.ok(parent.first <= piece.first && piece.last <= parent.last, 'inside its parent');
      } else assert.equal(piece.parent, null);
      next = piece.last + 1;
    }
    assert.equal(next, total + 1, `level ${level} ends at the last sentence`);
  });
}

test('a levels request numbers sentences through the document and has no purpose', () => {
  const event = levelsEvent('id', { paragraphs: PARAGRAPHS });
  assert.equal(event.response.metadata.operation, 'levels');
  assert.equal(event.response.instructions, LEVELS_INSTRUCTIONS);
  const input = JSON.parse(event.response.input[0].content[0].text);
  assert.deepEqual(Object.keys(input), ['paragraphs']);
  assert.deepEqual(input.paragraphs[1].sentences[1], { n: 3, text: 'They take ten minutes.' });
  // Room for a tree of a document at the word limit; Realtime caps it lower.
  assert.equal(event.response.max_output_tokens, 8192);
  assert.throws(() => levelsEvent('id', { paragraphs: [{ kind: 'p', sentences: [] }] }));
  assert.throws(() => levelsEvent('id', {}));
});

test('a valid tree becomes levels; a goal with no steps stands for itself below', () => {
  const raw = JSON.stringify({
    goals: [
      { first: 1, last: 1, goal: 'Name the dish', method: 'title' },
      {
        first: 2,
        last: 6,
        goal: 'Sell pancakes for dinner',
        method: 'argument',
        parts: [
          { first: 2, last: 3, goal: 'Show they are quick', method: 'direct claim' },
          {
            first: 4,
            last: 6,
            goal: 'Show they are flexible',
            method: 'options',
            parts: [
              { first: 4, last: 5, goal: 'Offer two ways', method: 'contrast' },
              { first: 6, last: 6, goal: 'Reassure', method: 'claim' },
            ],
          },
        ],
      },
    ],
  });
  const levels = parseLevels(raw, PARAGRAPHS);
  assert.equal(levels.length, 3);
  assert.deepEqual(levels[0], [
    { first: 1, last: 1, label: 'Name the dish', method: 'title', parent: null },
    { first: 2, last: 6, label: 'Sell pancakes for dinner', method: 'argument', parent: null },
  ]);
  assert.deepEqual(levels[1], [
    { first: 1, last: 1, label: 'Name the dish', method: 'title', parent: 0 },
    { first: 2, last: 3, label: 'Show they are quick', method: 'direct claim', parent: 1 },
    { first: 4, last: 6, label: 'Show they are flexible', method: 'options', parent: 1 },
  ]);
  assert.deepEqual(levels[2], [
    { first: 1, last: 1, label: 'Name the dish', method: 'title', parent: 0 },
    { first: 2, last: 3, label: 'Show they are quick', method: 'direct claim', parent: 1 },
    { first: 4, last: 5, label: 'Offer two ways', method: 'contrast', parent: 2 },
    { first: 6, last: 6, label: 'Reassure', method: 'claim', parent: 2 },
  ]);
  assertTree(levels, PARAGRAPHS);
});

test('a tree with gaps, overlaps, stray parts, and pieces across paragraphs is repaired', () => {
  const raw =
    '```json\n' +
    JSON.stringify({
      goals: [
        // Starts late, so sentence 1 joins it; 1-2 crosses from the heading
        // into a paragraph, so it splits there.
        {
          first: 2,
          goal: '"Open"',
          method: 'a very long method name that goes on and on',
          parts: [{ first: 2, goal: 'Hook' }, { first: 9 }, { first: 'x' }],
        },
        // 3-6 starts inside a paragraph and ends at the end of the next one.
        {
          first: 3,
          goal: 'Ways',
          parts: [
            { first: 1, goal: 'Too early' },
            { first: 4, goal: 'Sweet' },
            { first: 5, goal: 'Savory' },
            { first: 5, goal: 'Duplicate' },
          ],
        },
        { first: 3, goal: 'Duplicate goal' },
      ],
    }) +
    '\n```';
  const levels = parseLevels(raw, PARAGRAPHS);
  assertTree(levels, PARAGRAPHS);
  const rows = level =>
    levels[level].map(({ first, last, label, parent }) => [first, last, label, parent]);
  assert.deepEqual(rows(0), [
    [1, 1, 'Open', null],
    [2, 2, 'Open', null],
    [3, 3, 'Ways', null],
    [4, 6, 'Ways', null],
  ]);
  assert.equal(levels[0][0].method, 'a very long method name that…');
  // A part that starts before its piece of a goal starts with it; a piece of a
  // goal with no part inside stands for itself.
  assert.deepEqual(rows(1), [
    [1, 1, 'Open', 0],
    [2, 2, 'Hook', 1],
    [3, 3, 'Too early', 2],
    [4, 4, 'Sweet', 3],
    [5, 6, 'Savory', 3],
  ]);
});

test('a tree is cut at the deepest level allowed', () => {
  let node = { first: 1, goal: 'Level 6' };
  for (let level = 5; level >= 1; level--)
    node = { first: 1, goal: `Level ${level}`, parts: [node] };
  const levels = parseLevels(JSON.stringify({ goals: [node] }), PARAGRAPHS);
  assert.equal(levels.length, MAX_LEVELS);
  assert.equal(levels.at(-1)[0].label, `Level ${MAX_LEVELS}`);
  assertTree(levels, PARAGRAPHS);
});

test('a tree reply with no usable goal is refused', () => {
  assert.equal(parseLevels('nothing', PARAGRAPHS), null);
  assert.equal(parseLevels('{"pieces": [{"first": 1}]}', PARAGRAPHS), null);
  assert.equal(parseLevels('{"goals": [{"first": 0}, {"goal": "No start"}]}', PARAGRAPHS), null);
  assert.deepEqual(parseLevels('{"goals": []}', []), []);
});

test('any reply makes levels that nest and follow the paragraph rule', () => {
  // A small fixed generator, so the cases are the same on every run.
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const node = depth => ({
    first: 1 + Math.floor(random() * 8),
    last: 1 + Math.floor(random() * 8),
    goal: `g${Math.floor(random() * 100)}`,
    method: 'm',
    parts:
      depth < 6 && random() < 0.6
        ? Array.from({ length: Math.floor(random() * 4) }, () => node(depth + 1))
        : undefined,
  });
  for (let n = 0; n < 200; n++) {
    const goals = Array.from({ length: 1 + Math.floor(random() * 4) }, () => node(1));
    const levels = parseLevels(JSON.stringify({ goals }), PARAGRAPHS);
    if (levels) {
      assert.ok(levels.length <= MAX_LEVELS);
      assertTree(levels, PARAGRAPHS);
    }
  }
});

test('stored levels follow their sentences, and new sentences join every level alike', () => {
  const levels = parseLevels(
    JSON.stringify({
      goals: [
        { first: 1, goal: 'Name' },
        {
          first: 2,
          goal: 'Sell',
          method: 'argument',
          parts: [
            { first: 2, goal: 'Quick', method: 'claim' },
            { first: 4, goal: 'Flexible', method: 'options' },
          ],
        },
      ],
    }),
    PARAGRAPHS,
  );
  const sentences = PARAGRAPHS.flatMap(paragraph => paragraph.sentences);
  const stored = {
    levels: levels.map(pieces =>
      pieces.map(({ first, last, label, method }) => ({
        label,
        method,
        sentences: sentences.slice(first - 1, last),
      })),
    ),
  };
  // The third paragraph moved before the second, and a new sentence was typed.
  const edited = [
    { kind: 'h1', sentences: ['Pancakes for Dinner'] },
    { kind: 'p', sentences: ['Go sweet.', 'Go savory.', 'Both work.', 'A new one.'] },
    { kind: 'p', sentences: ['Pancakes are quick.', 'They take ten minutes.'] },
  ];
  const carried = remapLevels(stored, edited);
  assertTree(carried, edited);
  assert.deepEqual(
    carried[1].map(({ first, last, label, method, parent }) => [
      first,
      last,
      label,
      method,
      parent,
    ]),
    [
      [1, 1, 'Name', '', 0],
      [2, 5, 'Flexible', 'options', 1],
      [6, 7, 'Quick', 'claim', 1],
    ],
  );
  assert.equal(remapLevels(null, edited), null);
  assert.equal(remapLevels({ pieces: [] }, edited), null);
});

test('the bridge builds a levels request and refuses a bad one', () => {
  const request = buildRequest({ op: 'levels', paragraphs: PARAGRAPHS });
  assert.equal(request.operation, 'levels');
  assert.equal(request.instructions, LEVELS_INSTRUCTIONS);
  assert.equal(request.timeoutMs, 45000);
  assert.throws(() => buildRequest({ op: 'levels', paragraphs: 'all of it' }));
});

test('the bridge builds a legal request with prior labels and refuses bad ones', () => {
  const request = buildRequest({ op: 'legal', paragraphs: PARAGRAPHS });
  assert.equal(request.operation, 'legal');
  assert.equal(request.instructions, LEGAL_INSTRUCTIONS);
  assert.equal(request.timeoutMs, 45000);
  assert.equal(request.maxChars, 4096 * 8);
  const prior = [['heading', 'framing'], null, null, ['rule', 'law'], null, null];
  const input = JSON.parse(buildRequest({ op: 'legal', paragraphs: PARAGRAPHS, prior }).input);
  assert.deepEqual(input.paragraphs[0].sentences[0].prior, ['heading', 'framing']);
  assert.deepEqual(input.paragraphs[2].sentences[0].prior, ['rule', 'law']);
  assert.equal('prior' in input.paragraphs[1].sentences[0], false);
  for (const bad of [[['rules', 'law']], 'x', [['rule', 'law', 'extra']], [{ role: 'rule' }]]) {
    assert.throws(
      () => buildRequest({ op: 'legal', paragraphs: PARAGRAPHS, prior: bad }),
      error =>
        error.status === 400 &&
        error.message === 'Expected prior as one [role, kind] pair or null per sentence.',
    );
  }
  // Pairs from the lists, but not one per sentence.
  assert.throws(
    () => buildRequest({ op: 'legal', paragraphs: PARAGRAPHS, prior: [['rule', 'law']] }),
    error => error.status === 400 && error.message === 'Expected one prior entry per sentence.',
  );
  assert.throws(
    () => buildRequest({ op: 'legal', paragraphs: 'all of it' }),
    error => error.status === 400,
  );
});

test('the legal key ignores moves but not edits', () => {
  const key = divisionKey(LEGAL, PARAGRAPHS);
  const moved = [PARAGRAPHS[0], PARAGRAPHS[2], PARAGRAPHS[1]];
  assert.equal(divisionKey(LEGAL, moved), key);
  // A sentence moved inside its paragraph keeps the key too.
  const reordered = [
    PARAGRAPHS[0],
    PARAGRAPHS[1],
    { kind: 'p', sentences: ['Go savory.', 'Go sweet.', 'Both work.'] },
  ];
  assert.equal(divisionKey(LEGAL, reordered), key);
  const edited = [
    PARAGRAPHS[0],
    { kind: 'p', sentences: ['Pancakes are fast.', 'They take ten minutes.'] },
    PARAGRAPHS[2],
  ];
  assert.notEqual(divisionKey(LEGAL, edited), key);
  // A sentence that becomes a heading is a different sentence.
  assert.notEqual(
    divisionKey(LEGAL, [
      { kind: 'h2', sentences: ['Pancakes for Dinner'] },
      ...PARAGRAPHS.slice(1),
    ]),
    key,
  );
  // Other topics still follow the order of the text.
  assert.notEqual(divisionKey(LEVELS, moved), divisionKey(LEVELS, PARAGRAPHS));
});

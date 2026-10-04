import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEGMENT_INSTRUCTIONS,
  segmentEvent,
  parseSegments,
  normalize,
  remap,
  cleanLabel,
} from '../dist/segment-core.js';
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
    segmentEvent('id', { ...ok, paragraphs: [{ kind: 'p', sentences: ['word '.repeat(501)] }] }),
  );
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

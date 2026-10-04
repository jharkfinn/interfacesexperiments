import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesIn, sentenceIndex, joiner, overlaps } from '../dist/doc-model.js';
import { plainHTML } from '../dist/doc-edits.js';
import { sameLink, Links } from '../dist/links.js';
import { scrollToShow, opening, hintFor } from '../dist/piece-view.js';
import { checkSpec, fullSpec, BUILT_IN } from '../dist/view-specs.js';
import { resizeWeights as resize, restorePanes } from '../dist/panes.js';

const TEXT = 'Pancakes are quick.  They take ten minutes! Does anyone complain?';

test('sentences come without the spaces between them, with their offsets', () => {
  const sentences = sentencesIn(TEXT, 'en');
  assert.deepEqual(
    sentences.map(({ text }) => text),
    ['Pancakes are quick.', 'They take ten minutes!', 'Does anyone complain?'],
  );
  for (const { start, end, text } of sentences) assert.equal(TEXT.slice(start, end), text);
});

test('a page without a language still splits sentences', () => {
  assert.equal(sentencesIn(TEXT, '').length, 3);
  assert.equal(sentencesIn(TEXT, undefined).length, 3);
});

test('a soft line break ends a sentence, and blank text has none', () => {
  assert.deepEqual(
    sentencesIn('A heading without a stop\nThe text below.', 'en').map(({ text }) => text),
    ['A heading without a stop', 'The text below.'],
  );
  assert.deepEqual(sentencesIn(' \n ', 'en'), []);
});

test('an offset between two sentences goes to the earlier one or the later one', () => {
  const sentences = sentencesIn(TEXT, 'en');
  const end = sentences[0].end;
  assert.equal(sentenceIndex(sentences, end), 0);
  assert.equal(sentenceIndex(sentences, end, false), 1);
  assert.equal(sentenceIndex(sentences, 0), 0);
  assert.equal(sentenceIndex(sentences, TEXT.length + 5), 2);
  assert.equal(sentenceIndex([], 0), -1);
});

test('Japanese and Chinese sentences join without a space, others with one', () => {
  assert.equal(joiner('パンケーキは早い。'), '');
  assert.equal(joiner('煎饼很快。'), '');
  assert.equal(joiner('팬케이크는 빠르다.'), ' ');
  assert.equal(joiner('Pancakes are quick.'), ' ');
});

test('a piece overlaps a link span it shares text with, or a caret inside it', () => {
  const piece = { block: 1, start: 10, end: 20 };
  const span = (startBlock, start, endBlock, end) => ({ startBlock, start, endBlock, end });
  assert.ok(overlaps(piece, span(1, 10, 1, 20)));
  assert.ok(overlaps(piece, span(1, 15, 1, 30)));
  assert.ok(overlaps(piece, span(0, 0, 3, 0)));
  assert.ok(!overlaps(piece, span(1, 20, 1, 30)));
  assert.ok(!overlaps(piece, span(1, 0, 1, 10)));
  assert.ok(!overlaps(piece, span(2, 0, 2, 5)));
  assert.ok(overlaps(piece, span(1, 12, 1, 12)));
  assert.ok(overlaps(piece, span(1, 20, 1, 20)));
  assert.ok(!overlaps(piece, span(1, 21, 1, 21)));
  assert.ok(!overlaps(piece, null));
});

test('the edit check ignores empty style attributes, and only in tags', () => {
  assert.equal(plainHTML('<p style="">A.</p><h1 style="">T</h1>'), '<p>A.</p><h1>T</h1>');
  assert.equal(plainHTML('<p style="color: red">A.</p>'), '<p style="color: red">A.</p>');
  assert.equal(plainHTML('<p>Type style="" here.</p>'), '<p>Type style="" here.</p>');
});

test('links tell listeners about changes only', () => {
  const links = new Links();
  const heard = [];
  links.on((channel, value) => heard.push([channel, value?.origin ?? null]));
  links.set('hover', { origin: 'a', fraction: 1 });
  links.set('hover', { origin: 'a', fraction: 1 });
  links.set('hover', { origin: 'b', fraction: 1 });
  links.emit('flash', { origin: 'c' });
  links.clear();
  assert.deepEqual(heard, [
    ['hover', 'a'],
    ['hover', 'b'],
    ['flash', 'c'],
    ['hover', null],
  ]);
  assert.ok(sameLink(null, null));
  assert.ok(!sameLink({ origin: 'a' }, null));
});

test('a span is scrolled into the room only as far as it needs', () => {
  // Room from 100 to 500 with a 10 pixel margin.
  assert.equal(scrollToShow(200, 240, 100, 500, 10), 0);
  assert.equal(scrollToShow(60, 100, 100, 500, 10), -50);
  assert.equal(scrollToShow(480, 520, 100, 500, 10), 30);
  // Taller than the room: its top goes to the start.
  assert.equal(scrollToShow(300, 900, 100, 500, 10), 190);
});

test('the opening of a long piece ends at a word', () => {
  assert.equal(opening('Short.'), 'Short.');
  const long = 'Pancakes are too good to stay stuck at breakfast, because they take ten minutes';
  assert.equal(opening(long, 40), 'Pancakes are too good to stay stuck at…');
});

test('the header hint says what the declared gestures do', () => {
  const [, sentences, paragraphs] = BUILT_IN.map(fullSpec);
  assert.equal(
    hintFor(sentences),
    'Drag a sentence onto another to combine them, or between two to move it. Double-click a sentence to edit it in the document. Delete removes it.',
  );
  assert.equal(hintFor(paragraphs), 'Double-click a paragraph to edit it in the document.');
  assert.match(hintFor(fullSpec({ id: 'x', title: 'X', on: {} })), /links to the same text/);
});

test('built-in views are valid declarations', () => {
  for (const spec of BUILT_IN) assert.deepEqual(checkSpec(spec), [], spec.id);
});

test('declarations name fields, values, gestures, and operations from the vocabulary', () => {
  assert.deepEqual(checkSpec({ id: 'cards', title: 'Cards', unit: 'paragraph' }), []);
  assert.equal(checkSpec(null).length, 1);
  assert.equal(checkSpec([]).length, 1);
  const problems = checkSpec({
    id: 'Bad Id',
    title: '',
    unit: 'word',
    script: 'alert(1)',
    on: { 'drop-on': 'delete-everything', swipe: 'move' },
  });
  assert.equal(problems.length, 6, problems.join('\n'));
  assert.deepEqual(
    checkSpec({ id: 'p', title: 'P', unit: 'paragraph', on: { 'drop-between': 'move' } }),
    ['"move" works on sentences only, so "unit" must be "sentence".'],
  );
  assert.equal(checkSpec({ id: 'p', title: 'P', on: 'move' }).length, 1);
});

test('a declaration is filled in with the defaults of a Sentences view', () => {
  assert.deepEqual(fullSpec({ id: 'x', title: 'X' }), {
    kind: 'pieces',
    unit: 'sentence',
    group: 'paragraph',
    show: 'text',
    layout: 'flow',
    id: 'x',
    title: 'X',
    on: {},
  });
  assert.deepEqual(fullSpec({ id: 'document', title: 'Document', kind: 'document' }), {
    id: 'document',
    title: 'Document',
    kind: 'document',
  });
});

test('moving a divider shifts width between two panes and keeps both usable', () => {
  const resizeWeights = (...args) => resize(...args).map(weight => Number(weight.toFixed(6)));
  // Two panes of 500 pixels with weight 1 each.
  assert.deepEqual(resizeWeights([1, 1], [500, 500], 100, 300), [1.2, 0.8]);
  // The right pane cannot go below 300 pixels.
  assert.deepEqual(resizeWeights([1, 1], [500, 500], 400, 300), [1.4, 0.6]);
  assert.deepEqual(resizeWeights([1, 1], [500, 500], -400, 300), [0.6, 1.4]);
  // Panes already at the minimum stay as they are.
  assert.deepEqual(resizeWeights([1, 1], [300, 300], 50, 300), [1, 1]);
});

test('a saved arrangement keeps known views, one Document pane, and sane weights', () => {
  const known = ['document', 'sentences', 'paragraphs'];
  assert.deepEqual(
    restorePanes(
      [
        { view: 'document', weight: 2 },
        { view: 'gone', weight: 1 },
        { view: 'document', weight: 1 },
        { view: 'sentences', weight: -3, follows: false },
        null,
      ],
      known,
    ),
    [
      { view: 'document', weight: 2, follows: true },
      { view: 'sentences', weight: 1, follows: false },
    ],
  );
  assert.equal(restorePanes('nonsense', known), null);
  assert.equal(restorePanes([{ view: 'gone' }], known), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sentencesIn, sentenceIndex, joiner, overlaps } from '../dist/doc-model.js';
import { plainHTML } from '../dist/doc-edits.js';
import { sameLink, Links } from '../dist/links.js';
import { scrollToShow, opening, hintFor, statusText, destination } from '../dist/piece-view.js';
import {
  checkSpec,
  fullSpec,
  BUILT_IN,
  specFromPurpose,
  specFromLevel,
  idFor,
} from '../dist/view-specs.js';
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
  const builtIn = id => fullSpec(BUILT_IN.find(spec => spec.id === id));
  const sentences = builtIn('sentences');
  const paragraphs = builtIn('paragraphs');
  assert.equal(
    hintFor(sentences),
    'Drag a sentence onto another to combine them, or between two to move it. Double-click a sentence to edit it in the document. Delete removes it.',
  );
  assert.equal(
    hintFor(paragraphs),
    'Drag a paragraph between two to move it. Double-click a paragraph to edit it in the document.',
  );
  const ideas = fullSpec(BUILT_IN.find(spec => spec.id === 'ideas'));
  assert.match(hintFor(ideas), /^Claude divides the document for this view: “The distinct ideas/);
  assert.match(hintFor(ideas), /Drag a piece between two to move it\./);
  assert.match(hintFor(fullSpec({ id: 'x', title: 'X', on: {} })), /links to the same text/);
  assert.match(hintFor(builtIn('goals')), /Each piece here is one of its main goals\./);
  assert.match(
    hintFor(builtIn('how')),
    /a step toward a goal one level up, with how it takes that step\. Drag a piece/,
  );
});

test('level views say they wait for the map of goals', () => {
  assert.match(statusText('waiting', false, true), /^Claude is mapping the goals of the text\./);
  assert.match(statusText('offline', true, true), /The last pieces stand in/);
  assert.match(statusText('waiting', false), /^Claude is dividing the document for this view/);
});

test('a level view declares a level, and only level views have methods and goal groups', () => {
  const one = spec => checkSpec({ id: 'v', title: 'V', ...spec });
  assert.deepEqual(one({ unit: 'level', level: 2, group: 'parent', show: 'method' }), []);
  assert.deepEqual(one({ unit: 'level', level: 1, show: 'label', layout: 'cards' }), []);
  assert.deepEqual(one({ unit: 'level' }), [
    'With "unit": "level", "level" must be a whole number from 1 (the main goals) to 4.',
  ]);
  assert.deepEqual(one({ unit: 'level', level: 5 }).length, 1);
  assert.deepEqual(one({ unit: 'level', level: 1.5 }).length, 1);
  assert.deepEqual(one({ unit: 'claude', purpose: 'Claims.', level: 2 }), [
    '"level" is used only with "unit": "level".',
  ]);
  assert.deepEqual(one({ unit: 'level', level: 1, group: 'parent' }), [
    '"group": "parent" needs "unit": "level" and "level" 2 or more.',
  ]);
  assert.deepEqual(one({ unit: 'level', level: 2, group: 'paragraph' }), [
    'With "unit": "level", "group" must be "none".',
  ]);
  assert.deepEqual(one({ unit: 'claude', purpose: 'Claims.', show: 'method' }), [
    '"show": "method" needs "unit": "level", because only goals have methods.',
  ]);
  assert.deepEqual(one({ unit: 'level', level: 2, on: { 'drop-on': 'combine' } }), [
    '"combine" works on sentences only, so "unit" must be "sentence".',
  ]);
  assert.deepEqual(fullSpec({ id: 'x', title: 'X', unit: 'level', level: 3 }), {
    kind: 'pieces',
    unit: 'level',
    group: 'none',
    show: 'label',
    layout: 'list',
    id: 'x',
    title: 'X',
    level: 3,
    on: {},
  });
});

test('a new level view groups its steps by goal below the main goals', () => {
  const steps = specFromLevel({ id: 'steps', title: ' Steps ', level: 3, layout: 'cards' });
  assert.deepEqual(steps, {
    id: 'steps',
    title: 'Steps',
    kind: 'pieces',
    unit: 'level',
    level: 3,
    group: 'parent',
    show: 'method',
    layout: 'cards',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  });
  assert.deepEqual(checkSpec(steps), []);
  const top = specFromLevel({ id: 'top', title: 'Top', level: 1, move: false });
  assert.equal(top.group, 'none');
  assert.equal(top.show, 'label');
  assert.deepEqual(top.on, { 'double-click': 'open' });
  assert.deepEqual(checkSpec(top), []);
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
  const one = spec => checkSpec({ id: 'v', title: 'V', ...spec });
  assert.deepEqual(one({ unit: 'paragraph', group: 'none', on: { 'drop-between': 'move' } }), []);
  assert.deepEqual(one({ unit: 'paragraph', group: 'none', on: { 'drop-on': 'combine' } }), [
    '"combine" works on sentences only, so "unit" must be "sentence".',
  ]);
  assert.deepEqual(one({ unit: 'claude', group: 'none' }), [
    'With "unit": "claude", "purpose" must say what the view is for, in 1 to 300 characters.',
  ]);
  assert.deepEqual(one({ unit: 'claude', purpose: 'Claims.', group: 'paragraph' }), [
    'With "unit": "claude", "group" must be "none".',
  ]);
  assert.deepEqual(one({ unit: 'sentence', purpose: 'Claims.' }), [
    '"purpose" is used only with "unit": "claude".',
  ]);
  assert.deepEqual(one({ unit: 'sentence', show: 'label' }), [
    '"show": "label" needs "unit": "claude" or "level", because Claude writes the labels.',
  ]);
  assert.deepEqual(
    one({ unit: 'claude', purpose: 'Claims.', layout: 'bars', on: { delete: 'remove' } }),
    ['"remove" works on sentences only, so "unit" must be "sentence".'],
  );
  assert.equal(checkSpec({ id: 'p', title: 'P', on: 'move' }).length, 1);
});

test('a declaration is filled in with defaults that suit its unit', () => {
  assert.deepEqual(fullSpec({ id: 'x', title: 'X', unit: 'claude', purpose: 'Claims.' }), {
    kind: 'pieces',
    unit: 'claude',
    group: 'none',
    show: 'label',
    layout: 'list',
    id: 'x',
    title: 'X',
    purpose: 'Claims.',
    on: {},
  });
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

test('a view from a name and a purpose is a valid declaration of Claude-made pieces', () => {
  const spec = specFromPurpose({
    id: 'claims',
    title: ' Claims ',
    purpose: ' Each claim with its support. ',
    layout: 'cards',
    move: true,
    open: false,
  });
  assert.deepEqual(spec, {
    id: 'claims',
    title: 'Claims',
    kind: 'pieces',
    unit: 'claude',
    purpose: 'Each claim with its support.',
    group: 'none',
    show: 'label',
    layout: 'cards',
    on: { 'drop-between': 'move' },
  });
  assert.deepEqual(checkSpec(spec), []);
});

test('a new view gets an id from its name, unlike the ids taken', () => {
  assert.equal(idFor('Claims & Support', []), 'claims-support');
  assert.equal(idFor('Claims', ['claims', 'claims-2']), 'claims-3');
  assert.equal(idFor('2024 plan', []), 'plan');
  assert.equal(idFor('!!!', []), 'view');
});

test('the status line says why Claude’s pieces are not current', () => {
  assert.match(statusText('waiting', false), /Paragraphs stand in/);
  assert.match(statusText('offline', true), /^Connect.*The last pieces stand in/);
  assert.equal(statusText('ready', true), undefined);
});

test('a dragged piece goes between paragraphs when it is whole paragraphs, else into one', () => {
  // Blocks 0 (one sentence) and 1 (three sentences); pieces: the heading, two
  // sentences of block 1, and its last sentence.
  const firstStart = () => 0;
  const heading = { block: 0, endBlock: 0, start: 0, end: 5, whole: true };
  const head = { block: 1, endBlock: 1, start: 0, end: 30, whole: false };
  const tail = { block: 1, endBlock: 1, start: 31, end: 40, whole: false };
  const pieces = [heading, head, tail];
  // Next to itself, a piece stays put.
  assert.equal(destination(pieces, 0, heading, firstStart, 2), null);
  assert.equal(destination(pieces, 1, heading, firstStart, 2), null);
  // Whole paragraphs go before a paragraph start, or to the end.
  assert.deepEqual(destination(pieces, 3, heading, firstStart, 2), { before: 2 });
  // Part of a paragraph at the very end joins the last paragraph.
  assert.deepEqual(destination(pieces, 3, head, firstStart, 2), {
    block: 1,
    offset: 40,
    side: 'after',
  });
  assert.deepEqual(destination(pieces, 0, tail, firstStart, 2), {
    block: 0,
    offset: 0,
    side: 'before',
  });
  // Part of a paragraph goes into the paragraph at the gap.
  assert.deepEqual(destination(pieces, 1, tail, firstStart, 2), {
    block: 1,
    offset: 0,
    side: 'before',
  });
  const both = { block: 0, endBlock: 1, start: 0, end: 40, whole: true };
  assert.deepEqual(destination([both], 1, both, firstStart, 2), null);
  // Several whole paragraphs only go between paragraphs.
  const opening = { block: 2, endBlock: 2, start: 0, end: 2, whole: false };
  const rest = { block: 2, endBlock: 2, start: 3, end: 9, whole: false };
  assert.equal(destination([both, opening, rest], 2, both, firstStart, 3), null);
  assert.deepEqual(destination([both, opening, rest], 3, both, firstStart, 3), { before: 3 });
});

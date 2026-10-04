import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sentencesIn,
  sentenceIndex,
  staysPut,
  joiner,
  plainHTML,
  samePosition,
  scrollToShow,
} from '../dist/sentence-view.js';

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
  assert.equal(sentenceIndex(sentences, sentences[1].start, false), 1);
  assert.equal(sentenceIndex(sentences, 0), 0);
  assert.equal(sentenceIndex(sentences, TEXT.length + 5), 2);
  assert.equal(sentenceIndex([], 0), -1);
});

test('only the gaps beside a sentence leave it in place', () => {
  const source = { block: 1, index: 2 };
  assert.ok(staysPut(source, { block: 1, at: 2 }));
  assert.ok(staysPut(source, { block: 1, at: 3 }));
  assert.ok(!staysPut(source, { block: 1, at: 1 }));
  assert.ok(!staysPut(source, { block: 1, at: 4 }));
  assert.ok(!staysPut(source, { block: 0, at: 2 }));
});

test('Japanese and Chinese sentences join without a space, others with one', () => {
  assert.equal(joiner('パンケーキは早い。'), '');
  assert.equal(joiner('煎饼很快。'), '');
  assert.equal(joiner('팬케이크는 빠르다.'), ' ');
  assert.equal(joiner('Pancakes are quick.'), ' ');
});

test('the edit check ignores empty style attributes, and only in tags', () => {
  assert.equal(plainHTML('<p style="">A.</p><h1 style="">T</h1>'), '<p>A.</p><h1>T</h1>');
  assert.equal(plainHTML('<p style="color: red">A.</p>'), '<p style="color: red">A.</p>');
  assert.equal(plainHTML('<p>Type style="" here.</p>'), '<p>Type style="" here.</p>');
});

test('positions match by block and index, and two missing positions match', () => {
  assert.ok(samePosition({ block: 1, index: 2 }, { block: 1, index: 2 }));
  assert.ok(!samePosition({ block: 1, index: 2 }, { block: 2, index: 2 }));
  assert.ok(!samePosition({ block: 0, index: 0 }, null));
  assert.ok(samePosition(null, null));
});

test('a span is scrolled into the room only as far as it needs', () => {
  // Room from 100 to 500 with a 10 pixel margin.
  assert.equal(scrollToShow(200, 240, 100, 500, 10), 0);
  assert.equal(scrollToShow(60, 100, 100, 500, 10), -50);
  assert.equal(scrollToShow(480, 520, 100, 500, 10), 30);
  // Taller than the room: its top goes to the start.
  assert.equal(scrollToShow(300, 900, 100, 500, 10), 190);
});

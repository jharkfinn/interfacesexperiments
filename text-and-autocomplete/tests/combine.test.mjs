import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMBINE_INSTRUCTIONS,
  COMBINE_SEPARATOR,
  COMBINE_SLACK,
  combineBudget,
  combineEvent,
  coversBoth,
  combineText,
  sentenceAt,
  removalSpan,
  mergeSpans,
} from '../dist/combine-core.js';
import { CITATION_RULE } from '../dist/compose-core.js';
import { RealtimeCompose } from '../dist/realtime.js';

const TEXT =
  'Pancakes are quick. They take ten minutes, and nobody complains. Dinner should be fun.';
const span = part => ({ start: TEXT.indexOf(part), end: TEXT.indexOf(part) + part.length });
const context = {
  before: 'Pancakes are quick. ',
  target: 'They take ten minutes, and nobody complains.',
  after: ' Dinner should be fun.',
  dragged: ' Dinner should be fun.',
};

test('combine request carries the receiving sentence, its context and the dragged text', () => {
  const event = combineEvent('combine-id', context);
  const input = JSON.parse(event.response.input[0].content[0].text);
  assert.deepEqual(input, {
    ...context,
    dragged: 'Dinner should be fun.',
    target_words: 4,
    max_words: 7,
  });
  assert.deepEqual(combineBudget({ target: 'Go.', dragged: 'Now please.' }), {
    target_words: 3,
    max_words: 2,
  });
  assert.equal(event.response.conversation, 'none');
  assert.equal(event.response.metadata.operation, 'combine');
  assert.deepEqual(event.response.output_modalities, ['text']);
  assert.throws(() => combineEvent('id', { ...context, dragged: '  ' }));
  assert.throws(() => combineEvent('id', { ...context, target: '' }));
  // The prompt asks for one short, plain sentence rather than the two joined.
  assert.equal(event.response.instructions, COMBINE_INSTRUCTIONS);
  assert.match(COMBINE_INSTRUCTIONS, /best first/);
  assert.match(COMBINE_INSTRUCTIONS, /never exceed max_words/);
  assert.match(COMBINE_INSTRUCTIONS, /drop the explanation of how the image works/);
  assert.ok(COMBINE_INSTRUCTIONS.endsWith(CITATION_RULE));
});
test('the first simple version that carries both passages is kept', () => {
  assert.equal(
    combineText('  Dinner should be fun, so make ten-minute pancakes. ', context),
    'Dinner should be fun, so make ten-minute pancakes.',
  );
  const glued = context.target + ' Also, ' + context.dragged.trim().toLowerCase();
  assert.equal(combineText(glued, context), '');
  const short = 'Ten-minute pancakes make dinner fun.';
  const longer = 'Ten-minute pancakes that nobody minds make dinner fun.';
  // Best first: the first simple version wins even when a later one is shorter.
  assert.equal(
    combineText(
      `${longer}\n${COMBINE_SEPARATOR}\n${short}\n ${COMBINE_SEPARATOR} \n${glued}`,
      context,
    ),
    longer,
  );
  // A joined sentence is a fallback when no version is simple.
  const wide = { ...context, dragged: 'Dinner should be easy and fun for everyone.' };
  const joined = 'They take ten minutes and nobody complains, so dinner is easy and fun.';
  assert.ok(
    joined.length > wide.target.length + COMBINE_SLACK &&
      joined.length <= wide.target.length + wide.dragged.length,
  );
  assert.equal(combineText(`${joined}\n${COMBINE_SEPARATOR}\n${short}`, wide), short);
  assert.equal(combineText(joined, wide), joined);
  // Fenced or over-long versions do not spoil the others; separators may vary.
  assert.equal(combineText(`\`\`\`text\n====\n${longer}`, context), longer);
  // A version that keeps only one passage is dropped, however short.
  assert.equal(combineText(`Dinner should be fun.\n====\n${short}`, context), short);
  assert.equal(coversBoth('They take ten minutes.', context), false);
  assert.equal(
    coversBoth('The new office feels brighter than the old.', {
      target: 'The old office was cramped and dark.',
      dragged: 'The new one has windows on three sides.',
    }),
    true,
  );
  assert.equal(
    coversBoth('The old office was cramped.', {
      target: 'The old office was cramped and dark.',
      dragged: 'The new one has windows on three sides.',
    }),
    false,
  );
  assert.equal(coversBoth('Ten-minute dinners are fun.', context), true);
  assert.equal(
    coversBoth('Computers are like a bicycle for the mind.', {
      target: 'A bicycle multiplies what your legs can do.',
      dragged: 'Computers do the same for your mind.',
    }),
    true,
  );
  assert.equal(
    coversBoth('A bicycle multiplies what your legs can do.', {
      target: 'A bicycle multiplies what your legs can do.',
      dragged: 'Computers do the same for your mind.',
    }),
    false,
  );
  assert.equal(combineText('', context), '');
  assert.equal(combineText('word '.repeat(40), context), '');
  assert.equal(combineText(null, context), '');
});
test('a guard drops the versions it rejects', () => {
  const short = 'Ten-minute pancakes make dinner fun.';
  const cited = 'Smith v. Jones makes dinner fun in ten minutes.';
  const reasons = [];
  const guard = text => {
    const reason = /v\./.test(text) ? 'new-case-name' : null;
    if (reason) reasons.push(reason);
    return reason;
  };
  assert.equal(combineText(`${cited}\n${COMBINE_SEPARATOR}\n${short}`, context, guard), short);
  assert.equal(combineText(cited, context, guard), '');
  assert.deepEqual(reasons, ['new-case-name', 'new-case-name']);
  // Without a guard, nothing changes.
  assert.equal(combineText(cited, context), cited);
});
test('the receiving sentence is found under an offset without its separating spaces', () => {
  assert.deepEqual(sentenceAt(TEXT, 0), span('Pancakes are quick.'));
  assert.deepEqual(
    sentenceAt(TEXT, TEXT.indexOf('nobody')),
    span('They take ten minutes, and nobody complains.'),
  );
  assert.deepEqual(sentenceAt(TEXT, TEXT.indexOf(' They')), span('Pancakes are quick.'));
  assert.deepEqual(sentenceAt(TEXT, TEXT.length), span('Dinner should be fun.'));
  assert.equal(sentenceAt('   ', 1), null);
  assert.equal(sentenceAt('', 0), null);
});
test('removing the dragged text leaves single spaces and no space before punctuation', () => {
  const cut = (text, part) => {
    const start = text.indexOf(part);
    const removed = removalSpan(text, start, start + part.length);
    return text.slice(0, removed.start) + text.slice(removed.end);
  };
  assert.equal(cut('One. Two. Three.', 'Two.'), 'One. Three.');
  assert.equal(cut('One. Two. Three.', 'Two. '), 'One. Three.');
  assert.equal(cut('One. Two. Three.', 'One.'), 'Two. Three.');
  assert.equal(cut('One. Two. Three.', 'Three.'), 'One. Two.');
  assert.equal(cut('Go sweet with syrup, or savory.', 'with syrup'), 'Go sweet, or savory.');
  assert.equal(cut('unbreakable', 'break'), 'unable');
});
test('passages in one block become a single edit from the first to the last', () => {
  const apply = (source, target) => {
    const edit = mergeSpans(TEXT, span(source), span(target), 'NEW.');
    return TEXT.slice(0, edit.start) + edit.text + TEXT.slice(edit.end);
  };
  assert.equal(
    apply('Dinner should be fun.', 'Pancakes are quick.'),
    'NEW. They take ten minutes, and nobody complains.',
  );
  assert.equal(
    apply('Pancakes are quick.', 'Dinner should be fun.'),
    'They take ten minutes, and nobody complains. NEW.',
  );
  assert.equal(
    apply('They take ten minutes, and nobody complains.', 'Pancakes are quick.'),
    'NEW. Dinner should be fun.',
  );
});
test('transport sends a combine request and resolves its text', async () => {
  const sent = [];
  const client = new RealtimeCompose(() => {});
  client.ready = true;
  client.socket = { send: data => sent.push(JSON.parse(data)) };
  const result = client.combine(context);
  const id = sent[0].response.metadata.request_id;
  assert.equal(sent[0].response.metadata.operation, 'combine');
  client.receive({
    type: 'response.created',
    response: { id: 'r1', metadata: { request_id: id } },
  });
  client.receive({
    type: 'response.done',
    response: {
      status: 'completed',
      metadata: { request_id: id },
      output: [{ content: [{ type: 'output_text', text: 'Merged.' }] }],
    },
  });
  assert.equal(await result, 'Merged.');
});

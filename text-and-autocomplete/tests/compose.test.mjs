import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wordCount,
  withinLimit,
  fitInsertion,
  cleanCompletion,
  responseEvent,
  MODEL,
  previewCompletion,
  reuseCompletion,
  SUGGESTION_DELAY_MS,
  isSentenceBoundary,
  completionAnchor,
  inspectCompletion,
  contextWindow,
  CONTEXT_BEFORE_WORDS,
  CONTEXT_AFTER_WORDS,
  MAX_WORDS,
  MAX_CHARS,
  CITATION_RULE,
  COMPOSE_INSTRUCTIONS,
} from '../dist/compose-core.js';
import { RealtimeCompose } from '../dist/realtime.js';
import { memoBlocks } from './fixtures/memo.mjs';
import { readSavedKey, saveKey, forgetKey } from '../dist/key-storage.js';
test('request uses the unchanged context, and sentence intent', () => {
  const before = 'The launch went well. ';
  const after = '\nBest,\nSam';
  const event = responseEvent('request', { before, after });
  assert.deepEqual(JSON.parse(event.response.input[0].content[0].text), {
    before,
    after,
    anchor: completionAnchor(before),
    mode: 'new_sentence',
  });
  assert.equal(event.response.conversation, 'none');
  assert.deepEqual(event.response.output_modalities, ['text']);
  assert.equal(event.response.max_output_tokens, 256);
  assert.equal(SUGGESTION_DELAY_MS, 130);
  assert.throws(() => responseEvent('bad', { before: 'x '.repeat(MAX_WORDS + 1), after: '' }));
});
test('literal suffix extraction preserves the original text at every caret position', () => {
  const passages = [
    'The narrow bridge crosses the river.',
    'Please share the updated schedule when it is ready.',
    'L’été commence bientôt. Quelle belle journée !',
    '彼女は明日ここに来る予定です。',
    'A café 🌿 can be quiet, too.',
    "Don't change apostrophes—or hyphens.",
    'An exact  space and a\u00a0nonbreaking space.',
    'Repeated repeated words are data, not a parser rule.',
  ];
  let cases = 0;
  for (const passage of passages) {
    const chars = Array.from(passage);
    for (let i = 0; i < chars.length; i++) {
      const before = chars.slice(0, i).join('');
      const suffix = chars.slice(i).join('');
      const raw = completionAnchor(before) + suffix;
      assert.equal(cleanCompletion(raw, before, ''), suffix);
      assert.equal(before + fitInsertion(before, cleanCompletion(raw, before, ''), ''), passage);
      cases++;
    }
  }
  assert.ok(cases > 250);
});
test('anchor mismatches and over-budget outputs are discarded, never repaired', () => {
  const before = 'promising';
  for (const raw of [
    'wrong prefix',
    'Promising next',
    '```promising next```',
    'promisingnew\nline',
    'promising' + 'x'.repeat(221),
    'promising' + 'word '.repeat(17),
  ]) {
    assert.equal(cleanCompletion(raw, before, ''), '', raw);
  }
  assert.equal(
    cleanCompletion(
      completionAnchor('word '.repeat(MAX_WORDS)) + 'extra',
      'word '.repeat(MAX_WORDS),
      '',
    ),
    '',
  );
});
test('anchor and decoder preserve whitespace, Unicode, and repetitions without grammar rules', () => {
  for (const before of ['word', 'word ', 'word\u00a0', '名前', 'café', 'emoji🌿', 'done.”']) {
    assert.ok(before.endsWith(completionAnchor(before)));
    for (const insert of [
      ' next',
      '  next',
      '\u00a0next',
      'had had',
      'that that',
      'iPhone',
      'écrit',
      '本です。',
      'say hello',
    ]) {
      assert.equal(cleanCompletion(completionAnchor(before) + insert, before, ''), insert);
    }
    // A quotation is the author's evidence, so the continuation stops before it.
    assert.equal(cleanCompletion(completionAnchor(before) + 'say "hello"', before, ''), 'say');
  }
});
test('context anchor is a bounded exact Unicode suffix within the current paragraph', () => {
  for (const before of [
    'Earlier paragraph.\n  Current paragraph  ',
    'Long context '.repeat(30) + '🌲'.repeat(130),
  ]) {
    const anchor = completionAnchor(before);
    assert.ok(before.endsWith(anchor));
    assert.ok(Array.from(anchor).length <= 120);
    assert.ok(!anchor.includes('\n'));
    assert.equal(cleanCompletion(anchor + ' next', before, ''), ' next');
  }
});
test('streamed output is always an exact prefix of the final insertion', () => {
  for (const [before, suffix] of [
    ['The parcel arr', 'ives tomorrow.'],
    ['A good plan', ' needs a clear goal.'],
    ['Final.', ' Next sentence.'],
    ['彼女は', '明日来ます。'],
  ]) {
    const raw = completionAnchor(before) + suffix;
    for (let end = 0; end <= raw.length; end++) {
      const preview = previewCompletion(raw.slice(0, end), before, '');
      assert.ok(suffix.startsWith(preview), raw.slice(0, end));
    }
    assert.equal(cleanCompletion(raw, before, ''), suffix);
  }
});
test('sentence intent and reuse remain context-bound without grammar heuristics', () => {
  for (const before of ['Done.', 'Done? ', 'Done!”', '完了。']) {
    assert.ok(isSentenceBoundary(before));
  }
  for (const before of ['Done,', 'Done. N', 'Done.\n']) assert.ok(!isSentenceBoundary(before));
  // A legal abbreviation ends in a period without ending the sentence.
  for (const before of [
    'This claim is against Lakeside Village LP v. ',
    'See Lakeside, 455 F.',
    'The Third Cir. ',
  ]) {
    assert.ok(!isSentenceBoundary(before), before);
  }
  assert.ok(isSentenceBoundary('Was it Inc.? '));
  assert.equal(
    reuseCompletion({ before: 'A', after: '' }, ' clear goal', { before: 'A cl', after: '' }),
    'ear goal',
  );
  assert.equal(
    reuseCompletion({ before: 'A', after: '' }, ' clear goal', {
      before: 'A cl',
      after: 'changed',
    }),
    '',
  );
  assert.equal(
    reuseCompletion({ before: 'A', after: '' }, ' clear goal', { before: 'A dif', after: '' }),
    '',
  );
  assert.equal(
    reuseCompletion({ before: 'Done', after: '' }, '. Next sentence.', {
      before: 'Done.',
      after: '',
    }),
    '',
  );
  // Contenteditable types a trailing space as U+00A0, then turns it back into
  // U+0020 when the next character arrives.
  assert.equal(
    reuseCompletion({ before: 'A', after: '' }, ' clear goal', { before: 'A ', after: '' }),
    'clear goal',
  );
  assert.equal(
    reuseCompletion({ before: 'A ', after: '' }, 'clear goal', { before: 'A c', after: '' }),
    'lear goal',
  );
  assert.equal(
    reuseCompletion({ before: 'A ', after: '' }, 'clear goal', { before: 'A d', after: '' }),
    '',
  );
});
test('word and character bounds cover huge single words and documents at the limit', () => {
  assert.equal(wordCount(' hello\nworld  '), 2);
  assert.ok(withinLimit('word '.repeat(MAX_WORDS)));
  assert.ok(!withinLimit('word '.repeat(MAX_WORDS + 1)));
  assert.ok(!withinLimit('a'.repeat(MAX_CHARS + 1)));
  // The sample legal memo fits.
  assert.ok(
    withinLimit(
      memoBlocks()
        .map(block => block.text)
        .join('\n'),
    ),
  );
});
test('paste and acceptance fit the remaining space, including selection replacement', () => {
  const before = 'word '.repeat(MAX_WORDS - 1);
  const fitted = fitInsertion(before, 'one two three', '');
  assert.equal(fitted.trim(), 'one');
  assert.ok(withinLimit(before + fitted));
  assert.equal(fitInsertion('hello ', 'there', ' world'), 'there');
  assert.equal(fitInsertion('a'.repeat(MAX_CHARS), 'b', ''), '');
  // One character of room must not keep half of a surrogate pair.
  assert.equal(fitInsertion('a'.repeat(MAX_CHARS - 1), '🌲🌲', ''), '');
  assert.equal(fitInsertion('a'.repeat(MAX_CHARS - 2), '🌲🌲', ''), '🌲');
});
test('autocomplete stops before a citation, signal, or quotation it would begin', () => {
  const before = 'The stay was short. Courts apply the test.';
  const anchor = completionAnchor(before);
  assert.deepEqual(inspectCompletion(anchor + ' See Lakeside, 455 F.3d at 158.', before, ''), {
    text: '',
    reason: 'citation-cut',
  });
  assert.equal(
    cleanCompletion(anchor + ' It was significant. See id.', before, ''),
    ' It was significant.',
  );
  // A case name is cut off where it begins.
  assert.equal(
    cleanCompletion(anchor + ' Smith was cited in Brown v. Board too', before, ''),
    ' Smith was cited in',
  );
  // A reply, or the streamed part of one, that stops partway into a citation is cut too:
  // accepting it would leave "455 F.3d at" in the memo.
  for (const finished of [true, false]) {
    assert.equal(
      inspectCompletion(anchor + ' It held so in Lakeside, 455 F.3d at ', before, '', finished)
        .text,
      ' It held so in Lakeside',
    );
  }
  assert.equal(
    cleanCompletion(anchor + ' It applies, see Lakeside, 455 F.3d at 159.', before, ''),
    ' It applies',
  );
  // While a reply streams, a number and a signal word wait for the word after them,
  // which shows whether a citation begins there.
  assert.deepEqual(inspectCompletion(anchor + ' It held so in Lakeside, 455 ', before, '', false), {
    text: ' It held so in Lakeside, ',
    reason: null,
  });
  assert.deepEqual(inspectCompletion(anchor + ' 455 ', before, '', false), {
    text: '',
    reason: 'waiting-for-word',
  });
  assert.equal(previewCompletion(anchor + ' It applies, see ', before, ''), ' It applies, ');
  // A number is offered only where the document has it (here, after the caret).
  const days = ' The stay was 455 days.';
  assert.equal(
    previewCompletion(anchor + ' It took 455 days to', before, days),
    ' It took 455 days ',
  );
  // Ordinary prose that looks a little like a citation is kept.
  const meeting = ' We meet at 3 PM on 5 May.';
  assert.equal(
    cleanCompletion(anchor + ' See you at 3 PM on 5 May.', before, meeting),
    ' See you at 3 PM on 5 May.',
  );
});
test('a sentence ends after an abbreviation that can end one (CC-1)', () => {
  for (const before of [
    'Achterberg grew up outside the U.S. ',
    'It opens at 7 a.m. ',
    'She named it after her late uncle, Gustav Halvorsen Jr. ',
    'Mix flour, sugar, etc. ',
    'She earned her Ph.D. ',
    'The supplier is Brightwater Logistics, Inc. ',
    'The cap is $25,000 per shipment. ',
    'Halvorsen keeps a letter from a customer in St. Paul, Minn. ',
  ])
    assert.ok(isSentenceBoundary(before), before);
  // A legal abbreviation, a title, an initial, a page, a month or a word inside a name
  // still keeps the sentence open.
  for (const before of [
    'as held in Smith v. ',
    'See 42 U.S.C. ',
    '550 U.S. ',
    'Dr. ',
    'Photograph by T. J. ',
    'She lives in St. ',
    'See id. at p. ',
    'who wore No. ',
    'See Bell Atl. ',
    'Code Civ. ',
    '(S.D.N.Y. Mar. ',
    '(2d Cir. ',
    'i.e. ',
  ])
    assert.ok(!isSentenceBoundary(before), before);
  const before = 'Achterberg grew up outside the U.S. ';
  const event = responseEvent('request', { before, after: '' });
  assert.equal(JSON.parse(event.response.input[0].content[0].text).mode, 'new_sentence');
});
test('autocomplete stops in other citation forms and leaves prose whole (GD-9, GD-10, GD-12)', () => {
  // A reply is cut before a report's name, and one that runs on in a guidance citation is
  // not offered.
  const report = 'Congress said so';
  assert.deepEqual(
    inspectCompletion(completionAnchor(report) + ' per H.R. Rep. No. 110-730', report, ''),
    { text: ' per', reason: null },
  );
  const guidance = 'The agency agrees. EEOC, Enforcement Guidance';
  assert.equal(
    inspectCompletion(
      `${completionAnchor(guidance)}: Reasonable Accommodation, Question 35 (Oct. 17, 2002).`,
      guidance,
      '',
    ).text,
    '',
  );
  // A signal before ordinary words, and a jersey number, are prose. The number is one the
  // document has (after the caret); a new one is not offered.
  const before = 'The shop is easy to find.';
  const after = ' His number is 5.';
  for (const insertion of [
    ' See Halvorsen on Saturdays for the best rye.',
    ' Pruitt wore No. 5 for the River Otters.',
  ]) {
    assert.equal(cleanCompletion(completionAnchor(before) + insertion, before, after), insertion);
    for (let end = 0; end <= insertion.length; end++) {
      const preview = previewCompletion(
        completionAnchor(before) + insertion.slice(0, end),
        before,
        after,
      );
      assert.ok(insertion.startsWith(preview), insertion.slice(0, end));
    }
  }
  assert.equal(
    inspectCompletion(completionAnchor(before) + ' Pruitt wore No. 5.', before, '').reason,
    'new-number',
  );
  // A streamed parenthesis waits until it closes: one a quotation or citation cuts goes
  // whole, so a preview never shows what the finished reply drops.
  const fees = 'Customer shall pay the fees in Order Form No.';
  const form = '\nOrder Form No. 2023-014 is attached.';
  const reply = ' 2023-014 (collectively, the “Fees”), within thirty days.';
  assert.equal(cleanCompletion(completionAnchor(fees) + reply, fees, form), ' 2023-014');
  for (let end = 0; end <= reply.length; end++)
    assert.ok(
      ' 2023-014'.startsWith(
        previewCompletion(completionAnchor(fees) + reply.slice(0, end), fees, form),
      ),
      reply.slice(0, end),
    );
  // A sentence before a citation keeps its last word.
  const dispute = 'The dispute goes to';
  assert.equal(
    cleanCompletion(
      completionAnchor(dispute) +
        ' JAMS. See Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019).',
      dispute,
      '',
    ),
    ' JAMS.',
  );
});
test('autocomplete leaves no piece of a citation or case name behind (GD-9)', () => {
  // A reply that finishes a case name being written is not offered.
  const name = 'As held in Kessler v. Northgate';
  assert.deepEqual(
    inspectCompletion(completionAnchor(name) + ' Cold Storage, the court agreed.', name, ''),
    { text: '', reason: 'citation-cut' },
  );
  // The author and title after a signal, a short name before a neutral citation, and the
  // name of a code go with the citation they lead into.
  for (const [before, reply, kept] of [
    [
      'Dismissal is common',
      ', see 5 Charles Alan Wright & Arthur R. Miller, Federal Practice and Procedure § 1357 (3d ed. 2004).',
      '',
    ],
    ['Review is deferential', ' under Vavilov, 2019 SCC 65 at para 23.', ' under'],
    ['Owners must take care', ' under the California Civil Code § 1714.', ' under'],
  ])
    assert.equal(cleanCompletion(completionAnchor(before) + reply, before, ''), kept, reply);
  // A finished name followed by prose is kept.
  const cited = 'The rule comes from Smith v. Jones';
  assert.equal(
    cleanCompletion(completionAnchor(cited) + ' and the cases after it.', cited, ''),
    ' and the cases after it.',
  );
});
test('the context window keeps the paragraphs nearest the caret', () => {
  const short = { before: 'One.\nTwo three. ', after: ' four\nFive.' };
  assert.deepEqual(contextWindow(short), short);
  // 25 paragraphs of 40 words before the caret, 10 of 20 after it.
  const paragraph = (n, words) =>
    Array.from({ length: words }, (_, k) => `p${n}w${k}`).join(' ') + '.';
  const before =
    Array.from({ length: 25 }, (_, n) => paragraph(n, 40)).join('\n') + '\nThe last para';
  const after = Array.from({ length: 10 }, (_, n) => paragraph(n, 20)).join('\n');
  assert.equal(wordCount(before), 1003);
  const window = contextWindow({ before, after });
  assert.ok(wordCount(window.before) <= CONTEXT_BEFORE_WORDS);
  assert.ok(wordCount(window.before) >= 150);
  assert.ok(before.endsWith(window.before));
  assert.equal(before[before.length - window.before.length - 1], '\n');
  assert.equal(completionAnchor(window.before), completionAnchor(before));
  assert.ok(wordCount(window.after) <= CONTEXT_AFTER_WORDS);
  assert.ok(after.startsWith(window.after));
  assert.equal(after[window.after.length], '\n');
  // The request carries the window, with the anchor from the whole text.
  const sent = JSON.parse(responseEvent('id', { before, after }).response.input[0].content[0].text);
  assert.deepEqual(sent, {
    ...window,
    anchor: completionAnchor(before),
    mode: 'continue_sentence',
  });
  // One paragraph longer than the window is cut at a word.
  const long = paragraph(0, 1000);
  assert.equal(wordCount(contextWindow({ before: long, after: '' }).before), CONTEXT_BEFORE_WORDS);
});
class FakeSocket {
  static instances = [];
  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.sent = [];
    FakeSocket.instances.push(this);
    queueMicrotask(() => this.emit({ type: 'session.created' }));
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.onclose?.();
  }
  emit(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
async function setup(diagnose) {
  let authRequest;
  const statuses = [];
  const client = new RealtimeCompose((...args) => statuses.push(args), {
    diagnose,
    Socket: FakeSocket,
    fetchImpl: async (url, options) => {
      authRequest = { url, options };
      return { ok: true, json: async () => ({ value: 'ek_test' }) };
    },
  });
  await client.connect('sk-test-not-a-real-key');
  return { client, socket: FakeSocket.instances.at(-1), authRequest, statuses };
}
test('connect exchanges key once and authenticates socket with an ephemeral token', async () => {
  const { client, socket, authRequest } = await setup();
  assert.equal(JSON.parse(authRequest.options.body).session.model, MODEL);
  assert.deepEqual(socket.protocols, ['realtime', 'openai-insecure-api-key.ek_test']);
  assert.equal(client.ready, true);
  client.disconnect();
  assert.equal(client.ready, false);
});
test('completion correlates response metadata and ignores unrelated responses', async () => {
  const { client, socket } = await setup();
  const result = client.request({ before: 'D', after: '' });
  const id = socket.sent.at(-1).response.metadata.request_id;
  socket.emit({
    type: 'response.done',
    response: { metadata: { request_id: 'other' }, status: 'completed', output: [] },
  });
  socket.emit({
    type: 'response.done',
    response: {
      metadata: { request_id: id },
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: 'o you want to go?' }] }],
    },
  });
  assert.equal(await result, 'o you want to go?');
  client.disconnect();
});
test('cancel before response.created cancels late generation and never accepts stale output', async () => {
  const { client, socket } = await setup();
  const result = client.request({ before: 'D', after: '' });
  const rejected = assert.rejects(result, { name: 'AbortError' });
  const id = socket.sent.at(-1).response.metadata.request_id;
  client.cancel();
  await rejected;
  socket.emit({
    type: 'response.created',
    response: { id: 'stale', metadata: { request_id: id } },
  });
  assert.deepEqual(socket.sent.at(-1), { type: 'response.cancel', response_id: 'stale' });
  client.disconnect();
});
test('cancel during active response and failed responses settle pending requests', async () => {
  const { client, socket } = await setup();
  let p = client.request({ before: 'D', after: '' });
  let id = socket.sent.at(-1).response.metadata.request_id;
  socket.emit({
    type: 'response.created',
    response: { id: 'active', metadata: { request_id: id } },
  });
  const cancelled = assert.rejects(p, { name: 'AbortError' });
  client.cancel();
  await cancelled;
  assert.equal(socket.sent.at(-1).response_id, 'active');
  p = client.request({ before: 'Do', after: '' });
  id = socket.sent.at(-1).response.metadata.request_id;
  socket.emit({
    type: 'response.done',
    response: { status: 'failed', metadata: { request_id: id } },
  });
  await assert.rejects(p);
  client.disconnect();
});
test('bad credentials return safe feedback without echoing the key', async () => {
  const client = new RealtimeCompose(() => {}, {
    Socket: FakeSocket,
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(client.connect('sk-secret-value'), /key was rejected/);
  assert.equal(client.ready, false);
});
test('default fetch preserves the browser global receiver', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async function (url) {
    assert.equal(this, globalThis, 'native browser fetch requires its global receiver');
    assert.equal(url, 'https://api.openai.com/v1/realtime/client_secrets');
    called = true;
    return { ok: true, json: async () => ({ value: 'ek_test' }) };
  };
  const client = new RealtimeCompose(() => {}, { Socket: FakeSocket });
  try {
    await client.connect('sk-test-not-a-real-key');
    assert.ok(called);
    assert.ok(client.ready);
  } finally {
    client.disconnect();
    globalThis.fetch = originalFetch;
  }
});

test('key storage survives module reload and forgetting preserves unrelated site data', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const data = new Map([['unrelated', 'keep']]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: key => data.delete(key),
    },
  });
  try {
    assert.equal(readSavedKey(), '');
    saveKey('sk-test-not-a-real-key');
    const reloaded = await import('../dist/key-storage.js?reload-test');
    assert.equal(reloaded.readSavedKey(), 'sk-test-not-a-real-key');
    saveKey('sk-replacement-not-a-real-key');
    assert.equal(reloaded.readSavedKey(), 'sk-replacement-not-a-real-key');
    forgetKey();
    assert.equal(reloaded.readSavedKey(), '');
    assert.deepEqual([...data], [['unrelated', 'keep']]);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
test('blocked browser storage permits startup and reports failed saves and removals', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Blocked');
    },
  });
  try {
    assert.equal(readSavedKey(), '');
    assert.throws(() => saveKey('sk-test'), /Blocked/);
    assert.throws(forgetKey, /Blocked/);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});
test('matching stream deltas are delivered before response.done and cancelled deltas are ignored', async () => {
  const { client, socket } = await setup();
  const previews = [];
  const promise = client.request({ before: 'D', after: '' }, (text, done) =>
    previews.push({ text, done }),
  );
  const id = socket.sent.at(-1).response.metadata.request_id;
  socket.emit({
    type: 'response.created',
    response: { id: 'stream', metadata: { request_id: id } },
  });
  socket.emit({ type: 'response.output_text.delta', response_id: 'other', delta: 'WRONG' });
  socket.emit({ type: 'response.output_text.delta', response_id: 'stream', delta: 'Do you ' });
  assert.deepEqual(previews, [{ text: 'Do you ', done: false }]);
  socket.emit({ type: 'response.output_text.delta', response_id: 'stream', delta: 'want to go?' });
  socket.emit({
    type: 'response.output_text.done',
    response_id: 'stream',
    text: 'Do you want to go?',
  });
  assert.deepEqual(previews.at(-1), { text: 'Do you want to go?', done: true });
  const rejected = assert.rejects(promise, { name: 'AbortError' });
  client.cancel();
  await rejected;
  const count = previews.length;
  socket.emit({ type: 'response.output_text.delta', response_id: 'stream', delta: 'stale' });
  assert.equal(previews.length, count);
  client.disconnect();
});

test('browser nonbreaking spaces in copied context do not suppress valid completions', () => {
  for (const before of [
    'A useful next step is\u00a0',
    'One idea.\u00a0Another is',
    'Un détail\u202f:',
    'word\u00a0\u00a0',
  ]) {
    const echoed = completionAnchor(before).replace(/[\u00a0\u202f]/gu, ' ');
    const suffix = before.endsWith('is') ? ' to simplify things.' : 'make this easier.';
    assert.equal(cleanCompletion(echoed + suffix, before, ''), suffix);
    assert.equal(before + cleanCompletion(echoed + suffix, before, ''), before + suffix);
    for (let end = 0; end <= (echoed + suffix).length; end++) {
      assert.ok(suffix.startsWith(previewCompletion((echoed + suffix).slice(0, end), before, '')));
    }
  }
  // The exception is space-for-space only: changed words, punctuation, counts,
  // tabs and newlines still cannot masquerade as the user's existing text.
  for (const raw of [
    'A useful step is next',
    'A useful next step is next',
    'A useful\tnext step is  next',
    'A useful\nnext step is  next',
  ]) {
    assert.equal(cleanCompletion(raw, 'A useful next step is\u00a0\u00a0', ''), '');
  }
  assert.equal(cleanCompletion('Keep going\u00a0now.', 'Keep', ''), ' going\u00a0now.');
});

test('transport diagnostics correlate requests and expose final/stream discrepancies without credentials', async () => {
  const events = [];
  const { client, socket } = await setup((event, data) => events.push({ event, ...data }));
  const result = client.request({ before: 'A', after: '' }, () => {}, 'attempt-1');
  const id = socket.sent.at(-1).response.metadata.request_id;
  socket.emit({
    type: 'response.created',
    response: { id: 'response-1', metadata: { request_id: id } },
  });
  socket.emit({
    type: 'response.output_text.done',
    response_id: 'response-1',
    text: 'A useful idea.',
  });
  socket.emit({
    type: 'response.done',
    response: { metadata: { request_id: id }, status: 'completed', output: [] },
  });
  assert.equal(await result, '');
  const final = events.find(row => row.event === 'transport-final-text');
  assert.equal(final.requestId, id);
  assert.equal(final.attempt, 'attempt-1');
  assert.equal(final.chars, 0);
  assert.equal(final.matchesStream, false);
  assert.ok(!JSON.stringify(events).includes('ek_test'));
  assert.ok(!JSON.stringify(events).includes('sk-test'));
  client.disconnect();
  const brokenLogger = await setup(() => {
    throw new Error('logger failed');
  });
  const request = brokenLogger.client.request({ before: 'A', after: '' });
  const cancelled = assert.rejects(request, { name: 'AbortError' });
  assert.doesNotThrow(() => brokenLogger.client.cancel());
  await cancelled;
  brokenLogger.client.disconnect();
});
test('multiple tab autocomplete requests and validates one alternative per line', async () => {
  const { inspectAlternatives, ALTERNATIVES_INSTRUCTIONS, ALTERNATIVE_COUNT } =
    await import('../dist/compose-core.js');
  const before = 'The cat sat';
  const event = responseEvent('request', { before, after: '' }, { alternatives: true });
  assert.equal(event.response.instructions, ALTERNATIVES_INSTRUCTIONS);
  assert.ok(COMPOSE_INSTRUCTIONS.includes(CITATION_RULE));
  assert.ok(ALTERNATIVES_INSTRUCTIONS.includes(CITATION_RULE));
  assert.match(
    ALTERNATIVES_INSTRUCTIONS,
    /If the next words would begin a citation, a signal, or a quotation, return no text\./,
  );
  assert.equal(event.response.max_output_tokens, 640);
  assert.equal(ALTERNATIVE_COUNT, 3);
  // The last streamed line is unfinished, so its partial word is withheld.
  assert.deepEqual(
    inspectAlternatives(
      'The cat sat on the mat.\nThe cat sat quietly by the door.\nThe cat sat dow',
      before,
      '',
      false,
    ).texts,
    [' on the mat.', ' quietly by the door.'],
  );
  // Blank lines, duplicates, mismatched anchors, and extras are dropped.
  assert.deepEqual(
    inspectAlternatives(
      'The cat sat on the mat.\n\nThe cat sat on the mat.\nA dog ran.\nThe cat sat down.\nThe cat sat up.\nThe cat sat still.',
      before,
      '',
    ).texts,
    [' on the mat.', ' down.', ' up.'],
  );
  assert.deepEqual(inspectAlternatives('The ca', before, '', false), {
    texts: [],
    text: '',
    reason: 'waiting-for-anchor',
  });
  assert.equal(inspectAlternatives('', before, '').reason, 'empty-response');
});
test('suggested paragraph requests styled alternatives and parses one per line', async () => {
  const { inspectParagraphs, PARAGRAPH_INSTRUCTIONS } = await import('../dist/compose-core.js');
  const before = 'Intro paragraph.\n';
  const after = '\nClosing paragraph.';
  const event = responseEvent('request', { before, after }, { paragraphs: true });
  assert.equal(event.response.instructions, PARAGRAPH_INSTRUCTIONS);
  assert.ok(PARAGRAPH_INSTRUCTIONS.includes(CITATION_RULE));
  assert.equal(event.response.max_output_tokens, 1024);
  const done = inspectParagraphs(
    'Formal: This is one. It has two sentences.\ncasual: Here is another take.\n\nSentimental: A third one, warmly.\nextra: ignored fourth.',
    before,
    after,
  );
  assert.deepEqual(done.labels, ['formal', 'casual', 'sentimental']);
  assert.equal(done.texts[1], 'Here is another take.');
  // The streaming line shows whole words only; an unfinished label shows nothing.
  assert.deepEqual(
    inspectParagraphs('formal: This is one.\ncasual: Here is ano', before, after, false).texts,
    ['This is one.', 'Here is'],
  );
  assert.deepEqual(inspectParagraphs('for', before, after, false), {
    texts: [],
    labels: [],
    text: '',
    reason: 'waiting-for-paragraph',
  });
  // Duplicate styles, unlabelled lines, and over-limit paragraphs are dropped.
  assert.deepEqual(
    inspectParagraphs(
      'formal: One.\nformal: Two.\nNo label here\nlong: ' + 'word '.repeat(80),
      before,
      after,
    ).labels,
    ['formal'],
  );
  assert.equal(
    inspectParagraphs('just prose without a label', before, after).reason,
    'paragraph-format',
  );
  // A draft may not bring numbers, quotations, or citations of its own.
  assert.equal(
    inspectParagraphs('formal: The stay lasted 4 years.', before, after).reason,
    'new-number',
  );
  assert.equal(
    inspectParagraphs('formal: The court said "no".', before, after).reason,
    'new-quotation',
  );
});
test('autocomplete, its alternatives and a suggested paragraph bring no number of their own (2a)', async () => {
  const { inspectAlternatives, inspectParagraphs } = await import('../dist/compose-core.js');
  const before = 'The lease ran 24 months, from 2019 to 20';
  const anchor = completionAnchor(before);
  // The reply finishes a year: "20" + "24" is 2024, which the document does not have,
  // though it has 24. One the document has may be finished.
  assert.deepEqual(inspectCompletion(`${anchor}24.`, before, ''), {
    text: '',
    reason: 'new-number',
  });
  assert.deepEqual(inspectCompletion(`${anchor}21.`, before, ' It ended in 2021.'), {
    text: '21.',
    reason: null,
  });
  const sentence = 'The lease ran 24 months.';
  assert.equal(
    inspectCompletion(`${sentence} The rent rose by 5%.`, sentence, '').reason,
    'new-number',
  );
  assert.equal(
    cleanCompletion(`${sentence} It ran 24 months.`, sentence, ''),
    ' It ran 24 months.',
  );
  // While a reply streams, a number the document lacks is not shown either.
  assert.equal(previewCompletion(`${sentence} The rent was $1,850 a month`, sentence, ''), '');
  // Alternatives keep the lines that pass.
  assert.deepEqual(
    inspectAlternatives(
      `${sentence} It ran 6 months more.\n${sentence} It ran on.\n${sentence} It ended.`,
      sentence,
      '',
    ).texts,
    [' It ran on.', ' It ended.'],
  );
  // A suggested paragraph may use the document's numbers, and only those.
  const paragraphs = inspectParagraphs(
    'formal: The lease ran 24 months from 2019.\ncasual: It ran 36 months.',
    'The lease ran 24 months from 2019.\n',
    '',
  );
  assert.deepEqual(paragraphs.texts, ['The lease ran 24 months from 2019.']);
  // Citations in forms no list has are still cut as citations, not refused as numbers.
  assert.deepEqual(inspectCompletion(`${sentence} Joint Stip. ¶ 4.`, sentence, ''), {
    text: '',
    reason: 'citation-cut',
  });
});

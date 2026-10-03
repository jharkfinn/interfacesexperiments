import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rephraseFitsLength,
  expansionForDrag,
  rewriteTarget,
  rewriteEvent,
  rewriteText,
  LiveRewrite,
  LENGTH_TOLERANCE,
  MAX_REVISIONS,
  VERSION_SEPARATOR,
} from '../dist/rewrite-core.js';
import { RealtimeCompose } from '../dist/realtime.js';

const context = {
  before: 'Hello. ',
  selected: 'I have an extra ticket for the movie on Saturday. ',
  after: '\nCharlie',
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
// The selection is 49 characters, so 0.5 targets 25 and 2 targets 98, each within the tolerance.
const SHORT = 'Join me this Saturday.';
const LONG =
  'I have one extra ticket for the movie this Saturday, and I would really love for you to join me.';
test('expansion reserves the cursor distance regardless of selection length', () => {
  for (const width of [100, 350, 1000, 2400]) {
    const result = expansionForDrag(80, width);
    assert.equal(result.pixels, 80);
    assert.equal(result.ratio, 1 + 80 / width);
  }
  assert.equal(expansionForDrag(80.25, 1000).pixels, 80.25);
  assert.equal(expansionForDrag(0, 350).pixels, 0);
  assert.equal(expansionForDrag(-10, 350).pixels, 0);
  assert.deepEqual(expansionForDrag(1000, 100), { pixels: 150, ratio: 2.5 });
});
function session() {
  const requests = [];
  const previews = [];
  const results = [];
  const errors = [];
  let cancelled = 0;
  const live = new LiveRewrite({
    context,
    delay: 0,
    request: (input, ratio, progress, revision) =>
      new Promise((resolve, reject) =>
        requests.push({ input, ratio, progress, revision, resolve, reject }),
      ),
    cancel: () => {
      cancelled++;
    },
    onPreview: (text, finished) => previews.push({ text, finished }),
    onReady: text => results.push(text),
    onError: error => errors.push(error),
  });
  return {
    live,
    requests,
    previews,
    results,
    errors,
    get cancelled() {
      return cancelled;
    },
  };
}

test('rewrite request carries original selected text, surrounding context and length intent', () => {
  const event = rewriteEvent('rewrite-id', context, 2);
  const input = JSON.parse(event.response.input[0].content[0].text);
  assert.equal(input.selected, context.selected);
  assert.equal(input.before, context.before);
  assert.equal(input.after, context.after);
  assert.equal(input.target_words, 20);
  assert.equal(input.direction, 'longer');
  assert.equal(event.response.conversation, 'none');
  assert.deepEqual(event.response.output_modalities, ['text']);
  assert.equal(event.response.max_output_tokens, 4096);
  assert.equal(event.response.metadata.operation, 'rewrite');
  assert.equal(rewriteTarget(context, 0.5).direction, 'shorter');
});
test('length budgets count surrounding words and support languages without spaces', () => {
  assert.equal(
    rewriteTarget({ before: 'word '.repeat(490), selected: 'one two three', after: ' end' }, 2.5)
      .target_words,
    8,
  );
  const input = { before: '', selected: '彼女は明日ここに来る予定です。', after: '' };
  assert.ok(rewriteTarget(input, 0.5).target_characters < input.selected.length);
  for (const ratio of [NaN, Infinity, 0, -1, 3]) assert.throws(() => rewriteTarget(context, ratio));
  assert.throws(() => rewriteTarget({ ...context, selected: 'word '.repeat(501) }, 2));
});
test('rewrite validation preserves boundary whitespace and rejects empty or over-limit output', () => {
  const input = { before: 'before', selected: '\n old text  ', after: 'after' };
  assert.equal(rewriteText('  New text. \n', input), '\n New text.  ');
  assert.equal(rewriteText('New', input), '\n New  ');
  assert.equal(rewriteText('', input), '');
  assert.equal(rewriteText('```text\nno```', input), '');
  assert.equal(rewriteText('word '.repeat(501), input), '');
  assert.equal(rewriteText('x'.repeat(12001), input), '');
  assert.equal(
    rewriteText('<script>literal text</script>', input),
    '\n <script>literal text</script>  ',
  );
});
test('a rewrite streams before release but commits only a completed response after release', async () => {
  const s = session();
  s.live.setRatio(0.5);
  await tick();
  s.requests[0].progress('Join me ', false);
  assert.equal(s.previews[0].text, 'Join me ');
  assert.deepEqual(s.results, []);
  s.live.release();
  assert.equal(s.requests.length, 1);
  s.requests[0].resolve(SHORT);
  await tick();
  assert.deepEqual(s.results, [SHORT + ' ']);
  s.live.close();
});
test('continuous dragging queues only the latest target and ignores superseded stream output', async () => {
  const s = session();
  s.live.setRatio(1.3);
  await tick();
  s.live.setRatio(1.5);
  s.live.setRatio(2);
  await tick();
  assert.equal(s.requests.length, 1);
  s.requests[0].progress('Outdated words', false);
  assert.equal(s.previews.length, 0);
  s.live.release();
  s.requests[0].resolve('Older expansion.');
  await tick();
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[1].ratio, 2);
  assert.equal(s.requests[1].input.selected, context.selected);
  assert.deepEqual(s.results, []);
  s.requests[1].resolve(LONG);
  await tick();
  assert.deepEqual(s.results, [LONG + ' ']);
  s.live.close();
});
test('sustained pointer motion starts a request without waiting for a pause or release', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = session();
  s.live.delay = 160;
  s.live.setRatio(1.2);
  t.mock.timers.tick(60);
  s.live.setRatio(1.4);
  t.mock.timers.tick(60);
  s.live.setRatio(1.6);
  assert.equal(s.requests.length, 0);
  t.mock.timers.tick(40);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].ratio, 1.6);
  assert.equal(s.live.released, false);
  s.live.close();
});
test('reversing direction cancels active work and ignores late completions', async () => {
  const s = session();
  s.live.setRatio(2);
  await tick();
  s.live.setRatio(0.5);
  await tick();
  s.live.release();
  assert.equal(s.cancelled, 1);
  s.requests[0].resolve('Late expansion');
  await tick();
  assert.deepEqual(s.results, []);
  s.requests[1].resolve(SHORT);
  await tick();
  assert.deepEqual(s.results, [SHORT + ' ']);
  s.live.close();
});
test('returning to original cancels work and commits no generated text', async () => {
  const s = session();
  s.live.setRatio(2);
  await tick();
  s.live.setRatio(1);
  s.live.release();
  assert.deepEqual(s.results, [context.selected]);
  s.requests[0].progress('Late', false);
  s.requests[0].resolve('Late');
  await tick();
  assert.deepEqual(s.results, [context.selected]);
  s.live.close();
});
test('Escape, document changes, or lost focus close the session and suppress late results', async () => {
  const s = session();
  s.live.setRatio(2);
  await tick();
  s.live.close();
  s.requests[0].progress('Late words', false);
  s.requests[0].resolve('Late result');
  await tick();
  assert.deepEqual(s.results, []);
  assert.deepEqual(s.previews, []);
  s.live.setRatio(0.5);
  s.live.release();
  await tick();
  assert.equal(s.requests.length, 1);
});
test('revisiting a completed length reuses its result without another LLM call', async () => {
  const s = session();
  s.live.setRatio(2);
  await tick();
  s.requests[0].resolve(LONG);
  await tick();
  s.live.setRatio(1);
  s.live.setRatio(2);
  s.live.release();
  assert.equal(s.requests.length, 1);
  assert.deepEqual(s.results, [LONG + ' ']);
  s.live.close();
});
test('failed or over-limit responses never commit partial previews', async () => {
  for (const result of ['', 'word '.repeat(501), new Error('Connection closed')]) {
    const s = session();
    s.live.setRatio(2);
    await tick();
    s.live.release();
    s.requests[0].progress('Some partial words', false);
    if (result instanceof Error) s.requests[0].reject(result);
    else s.requests[0].resolve(result);
    await tick();
    assert.equal(s.errors.length, 1);
    assert.deepEqual(s.results, []);
    s.live.close();
  }
});

class FakeSocket {
  constructor() {
    this.sent = [];
    queueMicrotask(() => this.emit({ type: 'session.created' }));
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  emit(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.onclose?.();
  }
}
test('rewrites use the existing transport and supersede autocomplete without mixing responses', async () => {
  const client = new RealtimeCompose(() => {}, {
    Socket: FakeSocket,
    fetchImpl: async () => ({ ok: true, json: async () => ({ value: 'test' }) }),
  });
  await client.connect('sk-fake');
  const socket = client.socket;
  const compose = client.request({ before: 'Hello', after: '' });
  const cancelled = assert.rejects(compose, { name: 'AbortError' });
  const previews = [];
  const rewrite = client.rewrite(context, 0.5, text => previews.push(text));
  await cancelled;
  const event = socket.sent.at(-1);
  const id = event.response.metadata.request_id;
  assert.equal(event.response.metadata.operation, 'rewrite');
  socket.emit({
    type: 'response.created',
    response: { id: 'rewrite', metadata: { request_id: id } },
  });
  socket.emit({ type: 'response.output_text.delta', response_id: 'old', delta: 'Unrelated' });
  socket.emit({ type: 'response.output_text.delta', response_id: 'rewrite', delta: 'Join me.' });
  assert.deepEqual(previews, ['Join me.']);
  socket.emit({
    type: 'response.done',
    response: {
      metadata: { request_id: id },
      status: 'completed',
      output: [{ content: [{ type: 'output_text', text: 'Join me.' }] }],
    },
  });
  assert.equal(await rewrite, 'Join me.');
  client.disconnect();
});

test('visual length targets prioritize a tight character budget for shortening', () => {
  for (const ratio of [0.35, 0.5, 0.75]) {
    const input = { before: '', selected: 'a'.repeat(200), after: '' };
    const target = rewriteTarget(input, ratio);
    assert.equal(target.target_characters, 200 * ratio);
    assert.equal(target.min_characters, 200 * ratio - LENGTH_TOLERANCE);
    assert.equal(target.max_characters, 200 * ratio + LENGTH_TOLERANCE);
    const event = rewriteEvent('length-test', input, ratio);
    const sent = JSON.parse(event.response.input[0].content[0].text);
    assert.equal(sent.max_characters, target.max_characters);
    assert.match(event.response.instructions, /For EVERY language, prioritize target_characters/);
  }
  const tiny = rewriteTarget({ before: '', selected: 'Hi', after: '' }, 0.35);
  assert.ok(
    tiny.min_characters <= tiny.target_characters && tiny.target_characters <= tiny.max_characters,
  );
});

test('a draft outside the length window is sent back for a ladder of measured versions', async () => {
  assert.ok(
    Math.abs(SHORT.length - 25) <= LENGTH_TOLERANCE &&
      Math.abs(LONG.length - 98) <= LENGTH_TOLERANCE,
  );
  const s = session();
  s.live.setRatio(0.5);
  await tick();
  s.live.release();
  s.requests[0].resolve('Join me.');
  await tick();
  // The miss is shown as a preview but not committed; the revision carries the draft.
  assert.deepEqual(s.results, []);
  assert.equal(s.requests.length, 2);
  assert.deepEqual(s.requests[1].revision, { draft: 'Join me.' });
  assert.equal(s.requests[1].input.selected, context.selected);
  s.requests[1].progress('Partial revision', false);
  assert.ok(!s.previews.some(preview => preview.text.includes('Partial revision')));
  // The app measures every version and keeps the one closest to the target.
  // Separators may arrive padded with blank lines; they are never candidates themselves.
  s.requests[1].resolve(
    `Join me for it.\n\n===\n\n${SHORT}\n ${VERSION_SEPARATOR} \nPlease come and join me at the movie this Saturday.`,
  );
  await tick();
  assert.deepEqual(s.results, [SHORT + ' ']);
  s.live.close();
  const sent = JSON.parse(
    rewriteEvent('id', context, 0.5, { draft: 'Join me.' }).response.input[0].content[0].text,
  );
  assert.deepEqual([sent.draft, sent.draft_characters, sent.draft_words], ['Join me.', 8, 2]);
  // 25 characters at this draft's word length is about 6 words; a short draft ladders upward.
  assert.deepEqual(sent.version_words, [5, 6, 7, 8, 9, 10]);
  const long = JSON.parse(
    rewriteEvent('id', context, 0.5, { draft: context.selected.trim() }).response.input[0]
      .content[0].text,
  );
  assert.deepEqual(long.version_words, [6, 5, 4, 3, 2, 1]);
  assert.equal(
    JSON.parse(rewriteEvent('id', context, 0.5).response.input[0].content[0].text).draft,
    undefined,
  );
  assert.match(rewriteEvent('id', context, 0.5).response.instructions, /line containing only ===/);
});
test('revisions are bounded and the closest draft is kept', async () => {
  const s = session();
  s.live.setRatio(0.5);
  await tick();
  s.live.release();
  for (const [index, text] of ['Join.', 'Yes.\n===\nJoin me.', 'Yes.', 'Join.\n===\n'].entries()) {
    assert.equal(s.requests.length, index + 1);
    // Each revision starts from the closest draft so far.
    if (index > 1) assert.deepEqual(s.requests[index].revision, { draft: 'Join me.' });
    s.requests[index].resolve(text);
    await tick();
  }
  assert.equal(s.requests.length, MAX_REVISIONS + 1);
  assert.deepEqual(s.results, ['Join me. ']);
  s.live.close();
});
test('a failed revision keeps the closest draft instead of discarding it', async () => {
  const s = session();
  s.live.setRatio(0.5);
  await tick();
  s.live.release();
  s.requests[0].resolve('Join.');
  await tick();
  assert.equal(s.requests.length, 2);
  s.requests[1].reject(new Error('Writing request timed out. Try again.'));
  await tick();
  assert.deepEqual(s.errors, []);
  assert.deepEqual(s.results, ['Join. ']);
  s.live.close();
});
test('release aims for the exact dragged length unless the preview already fits it', async () => {
  const fits = session();
  fits.live.setRatio(0.5);
  await tick();
  fits.requests[0].resolve(SHORT);
  await tick();
  fits.live.release(0.52);
  assert.equal(fits.requests.length, 1);
  assert.deepEqual(fits.results, [SHORT + ' ']);
  fits.live.close();
  const misses = session();
  misses.live.setRatio(2);
  await tick();
  misses.requests[0].resolve(LONG);
  await tick();
  misses.live.release(2.5);
  await tick();
  assert.equal(misses.requests.length, 2);
  assert.equal(misses.requests[1].ratio, 2.5);
  assert.deepEqual(misses.results, []);
  misses.live.close();
});
test('rephrase requests keep length only for more than two words', () => {
  const word = {
    before: 'A warm stack feels like a small ',
    selected: 'party',
    after: ' on a plate.',
  };
  const short = rewriteEvent('id', word, 1, null, { avoid: ['celebration'] });
  const sent = JSON.parse(short.response.input[0].content[0].text);
  assert.deepEqual(sent, {
    before: word.before,
    selected: 'party',
    after: word.after,
    avoid: ['celebration'],
    max_words: 2,
  });
  assert.equal(short.response.metadata.operation, 'rephrase');
  assert.doesNotMatch(short.response.instructions, /max_characters/);
  const long = rewriteEvent('id', context, 1, null, { avoid: [] });
  const fitted = JSON.parse(long.response.input[0].content[0].text);
  assert.equal(fitted.target_characters, context.selected.trim().length);
  assert.equal(fitted.direction, undefined);
  assert.match(long.response.instructions, /max_characters/);
  assert.equal(rephraseFitsLength('two words'), false);
  assert.equal(rephraseFitsLength('now three words'), true);
});
function rephrasing(input, avoid = []) {
  const requests = [];
  const results = [];
  const errors = [];
  const live = new LiveRewrite({
    context: input,
    delay: 0,
    rephrase: { avoid },
    cancel: () => {},
    request: (_, ratio, progress, revision) =>
      new Promise(resolve => requests.push({ ratio, revision, resolve })),
    onPreview: () => {},
    onReady: text => results.push(text),
    onError: error => errors.push(error),
  });
  live.release();
  return { requests, results, errors };
}
test('a short rephrase skips the character window but never returns a wording already seen', async () => {
  const word = { before: 'a small ', selected: 'party', after: ' on a plate.' };
  const run = rephrasing(word);
  assert.equal(run.requests[0].ratio, 1);
  run.requests[0].resolve('grand celebration');
  await tick();
  assert.deepEqual(run.results, ['grand celebration']);
  const repeat = rephrasing(word, ['Celebration']);
  // A repeat is asked for again until the attempts run out.
  for (let index = 0; index <= MAX_REVISIONS; index++) {
    repeat.requests[index].resolve('celebration');
    await tick();
  }
  assert.equal(repeat.results.length, 0);
  assert.match(repeat.errors[0].message, /No new phrasing/);
});
test('a short rephrase never grows into a sentence', async () => {
  const word = { before: 'a small ', selected: 'party', after: ' on a plate.' };
  const sent = JSON.parse(
    rewriteEvent('id', word, 1, null, { avoid: [] }).response.input[0].content[0].text,
  );
  assert.equal(sent.max_words, 2);
  const run = rephrasing(word);
  run.requests[0].resolve('A warm stack feels like a little celebration on a plate.');
  await tick();
  assert.deepEqual(run.results, []);
  assert.equal(run.requests.length, 2);
  run.requests[1].resolve('celebration');
  await tick();
  assert.deepEqual(run.results, ['celebration']);
  const stubborn = rephrasing(word);
  for (let index = 0; index <= MAX_REVISIONS; index++) {
    stubborn.requests[index].resolve('a celebration for everyone here');
    await tick();
  }
  assert.equal(stubborn.requests.length, MAX_REVISIONS + 1);
  assert.deepEqual(stubborn.results, []);
  assert.match(stubborn.errors[0].message, /No new phrasing/);
});
test('a sentence rephrase is revised until it matches the original length', async () => {
  const run = rephrasing(context);
  run.requests[0].resolve('Join me.');
  await tick();
  assert.equal(run.requests[1].revision.draft, 'Join me.');
  const fit = 'There is a spare movie ticket for this Saturday.';
  run.requests[1].resolve(`Join me Saturday.\n${VERSION_SEPARATOR}\n${fit}`);
  await tick();
  assert.deepEqual(run.results, [fit + ' ']);
});

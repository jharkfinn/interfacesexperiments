import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Segments, LEGAL, LEVELS, topicFor, usesClaude, idleFor } from '../dist/segments.js';
import { RealtimeCompose, REALTIME_MAX_OUTPUT_TOKENS } from '../dist/realtime.js';
import { BridgeCompose } from '../dist/bridge-client.js';

// A heading and two paragraphs, as DocumentModel.paragraphs() gives them.
const PARAGRAPHS = [
  { kind: 'h1', block: 0, sentences: ['Jones and the FHA'] },
  { kind: 'p', block: 1, sentences: ['The question is whether it is a dwelling.', 'It is.'] },
  { kind: 'p', block: 2, sentences: ['A club is not.', 'Ours is a home.'] },
];

// A stand-in for DocumentModel: the paragraphs, a version that changes with
// every edit, and listeners told about each edit.
function fakeModel(paragraphs = PARAGRAPHS) {
  const listeners = new Set();
  const model = {
    version: 0,
    paragraphs: () => model.current,
    current: paragraphs,
    read: () => ({ version: model.version }),
    runs: runs => runs.map(run => ({ ...run })),
    on: listener => listeners.add(listener),
    edit(next) {
      model.current = next;
      model.version++;
      for (const listener of listeners) listener(model.version);
    },
  };
  return model;
}

// A stand-in for a transport that answers one request at a time: a new
// request cancels the one before it, as every real client does. Each answer
// comes `delay` ms after the request.
function fakeClient({ delay = 2000, replies = {} } = {}) {
  const client = { ready: true, pending: null, sends: [] };
  const send = (operation, context) => {
    client.sends.push({ operation, context });
    if (client.pending) client.pending.reject(new DOMException('Superseded', 'AbortError'));
    return new Promise((resolve, reject) => {
      const pending = { reject };
      client.pending = pending;
      setTimeout(() => {
        if (client.pending !== pending) return;
        client.pending = null;
        const reply = replies[operation];
        resolve(typeof reply === 'function' ? reply(context) : reply);
      }, delay);
    });
  };
  client.segment = context => send('segment', context);
  client.levels = context => send('levels', context);
  client.legal = context => send('legal', context);
  return client;
}

const PIECES = JSON.stringify({
  pieces: [
    { first: 1, last: 1, label: 'Title' },
    { first: 2, last: 5, label: 'Body' },
  ],
});
const LABELS = JSON.stringify({
  tags: [
    [1, 'heading', 'framing'],
    [2, 'issue', 'law'],
    [3, 'conclusion', 'conclusion'],
    [4, 'rule', 'law'],
    [5, 'application', 'application'],
  ],
});

// Runs the mocked clock forward, letting promises settle between steps.
async function advance(ms, step = 100) {
  for (let passed = 0; passed < ms; passed += step) {
    mock.timers.tick(step);
    for (let turn = 0; turn < 5; turn++) await new Promise(resolve => setImmediate(resolve));
  }
}

function setup(options = {}) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const model = fakeModel();
  const client = fakeClient(options);
  const events = [];
  const segments = new Segments({
    model,
    client,
    ready: () => true,
    shared: false,
    diagnose: (event, data) => events.push([event, data]),
  });
  return { model, client, segments, events };
}

test('views that use Claude, and their topics', () => {
  assert.equal(topicFor({ unit: 'claude', purpose: 'Ideas' }), 'purpose:Ideas');
  assert.equal(topicFor({ unit: 'level', level: 2 }), LEVELS);
  assert.equal(topicFor({ unit: 'role' }), LEGAL);
  assert.equal(topicFor({ unit: 'sentence', show: 'sources' }), LEGAL);
  assert.ok(usesClaude({ unit: 'claude' }));
  assert.ok(usesClaude({ unit: 'level' }));
  assert.ok(usesClaude({ unit: 'role' }));
  assert.ok(usesClaude({ unit: 'sentence', show: 'sources' }));
  assert.ok(!usesClaude({ unit: 'sentence' }));
  assert.ok(!usesClaude({ unit: 'paragraph', show: 'text' }));
  assert.equal(idleFor(LEGAL), 5000);
  assert.equal(idleFor(LEVELS), 2500);
});

test('two topics asked at once take turns instead of cancelling each other', async t => {
  t.after(() => mock.timers.reset());
  const { client, segments } = setup({ replies: { segment: PIECES } });
  segments.watch('purpose:A', () => {});
  segments.watch('purpose:B', () => {});
  await advance(20000);
  assert.equal(segments.view('purpose:A').status, 'ready');
  assert.equal(segments.view('purpose:B').status, 'ready');
  assert.deepEqual(
    segments.view('purpose:B').pieces.map(piece => piece.label),
    ['Title', 'Body'],
  );
  assert.equal(client.sends.length, 2);
});

test('legal labels arrive once, carry prior labels, and wait 5 s after typing', async t => {
  t.after(() => mock.timers.reset());
  const { model, client, segments, events } = setup({ delay: 500, replies: { legal: LABELS } });
  const asked = () => client.sends.map(send => send.context);
  assert.equal(segments.legal().status, 'waiting');
  segments.watch(LEGAL, () => {});
  await advance(1000);
  assert.deepEqual(events.at(-1), ['segment-request', { topic: 'legal', paragraphs: 3 }]);
  assert.equal(asked()[0].prior, null);
  const first = segments.legal();
  assert.equal(first.status, 'ready');
  assert.equal(first.partial, false);
  assert.deepEqual(
    first.tags.map(tag => [tag.text, tag.role, tag.kind]),
    [
      ['Jones and the FHA', 'heading', 'framing'],
      ['The question is whether it is a dwelling.', 'issue', 'law'],
      ['It is.', 'conclusion', 'conclusion'],
      ['A club is not.', 'rule', 'law'],
      ['Ours is a home.', 'application', 'application'],
    ],
  );
  // Nothing changed, so a view gets the same object back.
  assert.equal(segments.legal(), first);

  // A move asks nothing: the labels belong to the sentences.
  model.edit([PARAGRAPHS[0], PARAGRAPHS[2], PARAGRAPHS[1]]);
  const moved = segments.legal();
  assert.notEqual(moved, first);
  assert.equal(moved.status, 'ready');
  assert.deepEqual(
    moved.tags.map(tag => tag.role),
    ['heading', 'rule', 'application', 'issue', 'conclusion'],
  );
  await advance(10000);
  assert.equal(client.sends.length, 1);

  // An edit waits for 5 s of quiet, then sends the labels of the sentences
  // that kept them; the edited sentence is a guess and is sent as null.
  model.edit([
    PARAGRAPHS[0],
    PARAGRAPHS[1],
    { kind: 'p', block: 2, sentences: ['A club is not.', 'Ours is a family home.'] },
  ]);
  const editing = segments.legal();
  assert.equal(editing.status, 'updating');
  assert.equal(editing.tags[4].guess, true);
  await advance(4900);
  assert.equal(client.sends.length, 1);
  await advance(200);
  assert.equal(client.sends.length, 2);
  assert.deepEqual(asked()[1].prior, [
    ['heading', 'framing'],
    ['issue', 'law'],
    ['conclusion', 'conclusion'],
    ['rule', 'law'],
    null,
  ]);
  await advance(1000);
  assert.equal(segments.legal().status, 'ready');
  assert.equal(segments.legal().tags[4].guess, undefined);
});

test('a legal reply with no usable label fails with a message', async t => {
  t.after(() => mock.timers.reset());
  const { segments } = setup({ delay: 100, replies: { legal: 'I cannot label this.' } });
  segments.watch(LEGAL, () => {});
  await advance(1000);
  const result = segments.legal();
  assert.equal(result.status, 'failed');
  assert.equal(result.message, 'Claude gave no labels this view can use.');
  assert.equal(result.tags, null);
});

test('saved labels come back without asking, and offline labels still show', async t => {
  t.after(() => mock.timers.reset());
  const store = new Map();
  const storage = {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
  };
  mock.timers.enable({ apis: ['setTimeout'] });
  const first = fakeClient({ delay: 100, replies: { legal: LABELS } });
  const before = new Segments({
    model: fakeModel(),
    client: first,
    ready: () => true,
    shared: false,
    storage,
  });
  before.watch(LEGAL, () => {});
  await advance(1000);
  assert.equal(first.sends.length, 1);

  let ready = false;
  const second = fakeClient({ delay: 100, replies: { legal: LABELS } });
  const after = new Segments({
    model: fakeModel(),
    client: second,
    ready: () => ready,
    shared: false,
    storage,
  });
  after.watch(LEGAL, () => {});
  await advance(1000);
  const offline = after.legal();
  assert.equal(offline.status, 'ready');
  assert.equal(offline.tags.length, 5);
  ready = true;
  assert.notEqual(after.legal(), offline);
  assert.equal(second.sends.length, 0);
});

test('the Realtime transport caps every request at its 4,096-token limit', async () => {
  const sent = [];
  const client = new RealtimeCompose(() => {}, { Socket: class {} });
  client.ready = true;
  client.socket = { send: data => sent.push(JSON.parse(data)), close() {} };
  const paragraphs = PARAGRAPHS.map(({ kind, sentences }) => ({ kind, sentences }));
  const levels = client.levels({ paragraphs });
  assert.equal(sent[0].response.metadata.operation, 'levels');
  assert.equal(sent[0].response.max_output_tokens, REALTIME_MAX_OUTPUT_TOKENS);
  const legal = client.legal({ paragraphs, prior: null });
  assert.equal(sent[1].response.metadata.operation, 'legal');
  assert.equal(sent[1].response.max_output_tokens, 4096);
  client.cancel();
  await assert.rejects(levels, error => error.name === 'AbortError');
  await assert.rejects(legal, error => error.name === 'AbortError');
});

test('the bridge transport sends a legal request as an operation with its data', async () => {
  const bodies = [];
  const client = new BridgeCompose(() => {}, {
    token: 't',
    fetchImpl: async (path, init) => {
      bodies.push([path, JSON.parse(init.body)]);
      return new Response(`${JSON.stringify({ type: 'done', text: LABELS })}\n`);
    },
  });
  client.ready = true;
  const prior = [null, null, null, ['rule', 'law'], null];
  assert.equal(await client.legal({ paragraphs: PARAGRAPHS, prior }), LABELS);
  assert.deepEqual(bodies[0], ['api/run', { op: 'legal', paragraphs: PARAGRAPHS, prior }]);
  await client.legal({ paragraphs: PARAGRAPHS });
  assert.equal(bodies[1][1].prior, null);
});

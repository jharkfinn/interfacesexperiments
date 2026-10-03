import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listFiles, createBridgeHandler } from '../scripts/bridge/server.mjs';
import { buildRequest } from '../scripts/bridge/prompts.mjs';
import { BridgeCompose } from '../dist/bridge-client.js';
import { ALTERNATIVES_INSTRUCTIONS, PARAGRAPH_INSTRUCTIONS } from '../dist/compose-core.js';
import { COMBINE_INSTRUCTIONS } from '../dist/combine-core.js';

const TOKEN = 'test-token-0123456789abcdefghijklmnop';

class FakeBackend {
  constructor() {
    this.runs = [];
    this.reply = ['Hello', ' world'];
  }
  describe() {
    return { provider: 'fake', ready: true };
  }
  run({ instructions, input, maxChars, signal, onDelta }) {
    const run = { instructions, input, maxChars, signal, aborted: false };
    this.runs.push(run);
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        run.aborted = true;
        reject(new DOMException('Cancelled', 'AbortError'));
      });
      if (this.hang) return;
      for (const chunk of this.reply) onDelta(chunk);
      resolve(this.reply.join(''));
    });
  }
}

async function bridge(backend = new FakeBackend()) {
  const root = mkdtempSync(join(tmpdir(), 'bridge-root-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(root, 'app.js'), 'export {};');
  writeFileSync(join(root, '.hidden.js'), 'secret');
  mkdirSync(join(root, 'fonts'));
  writeFileSync(join(root, 'fonts', 'a.ttf'), 'font');
  writeFileSync(join(root, 'notes.md'), 'not served');
  const files = await listFiles(root);
  let handler;
  const server = createServer((req, res) => handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  handler = createBridgeHandler({ files, backend, token: TOKEN, port });
  const origin = `http://127.0.0.1:${port}`;
  const call = (path, { method = 'GET', headers = {}, body } = {}) =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          host: '127.0.0.1',
          port,
          path,
          method,
          headers: { Host: `127.0.0.1:${port}`, ...headers },
        },
        res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => (data += chunk));
          res.on('end', () =>
            resolve({ status: res.statusCode, headers: res.headers, body: data }),
          );
        },
      );
      req.on('error', reject);
      if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
      req.end();
    });
  const api = (path, body = {}, headers = {}) =>
    call(path, {
      method: 'POST',
      body,
      headers: {
        Origin: origin,
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  return { server, port, origin, call, api, backend, close: () => server.close() };
}

test('static files are served only for the exact loopback host and from the file list', async () => {
  const b = await bridge();
  try {
    const page = await b.call('/');
    assert.equal(page.status, 200);
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match(page.headers['content-security-policy'], /script-src 'self'/);
    assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.match((await b.call('/app.js?v=abc')).headers['content-type'], /text\/javascript/);
    assert.equal((await b.call('/fonts/a.ttf')).headers['content-type'], 'font/ttf');
    for (const path of [
      '/.hidden.js',
      '/notes.md',
      '/../package.json',
      '/%2e%2e/%2e%2e/etc/passwd',
      '/eval/',
    ]) {
      assert.equal((await b.call(path)).status, 404, path);
    }
    assert.equal((await b.call('/favicon.ico')).status, 204);
    // DNS rebinding: an attacker's name that resolves to 127.0.0.1.
    assert.equal((await b.call('/', { headers: { Host: `evil.example:${b.port}` } })).status, 403);
    assert.equal((await b.call('/', { headers: { Host: '127.0.0.1:1' } })).status, 403);
    assert.equal((await b.call('/', { method: 'POST' })).status, 405);
  } finally {
    b.close();
  }
});

test('API calls need POST, the exact origin, the token, and JSON', async () => {
  const b = await bridge();
  try {
    assert.equal((await b.api('/api/session')).status, 200);
    assert.deepEqual(JSON.parse((await b.api('/api/session')).body), {
      provider: 'fake',
      ready: true,
    });
    assert.equal((await b.call('/api/session')).status, 405);
    const cases = [
      [{ Origin: 'https://evil.example' }, 403],
      [{ Origin: 'null' }, 403],
      [{ Origin: `http://127.0.0.1:${b.port + 1}` }, 403],
      [{ 'Sec-Fetch-Site': 'cross-site' }, 403],
      [{ 'Sec-Fetch-Mode': 'navigate' }, 403],
      [{ Authorization: 'Bearer wrong' }, 401],
      [{ Authorization: `Bearer ${TOKEN}x` }, 401],
      [{ Authorization: '' }, 401],
      [{ 'Content-Type': 'text/plain' }, 415],
      [{ 'Content-Type': 'application/x-www-form-urlencoded' }, 415],
    ];
    for (const [headers, status] of cases) {
      assert.equal(
        (await b.api('/api/session', {}, headers)).status,
        status,
        JSON.stringify(headers),
      );
    }
    const noOrigin = await b.call('/api/session', {
      method: 'POST',
      body: {},
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    });
    assert.equal(noOrigin.status, 403);
    const huge = await b.api('/api/run', { op: 'x'.repeat(600000) }).catch(error => error);
    assert.ok(
      huge.status === 413 || ['ECONNRESET', 'EPIPE'].includes(huge.code),
      String(huge.status),
    );
    assert.equal((await b.api('/api/session', 'not json')).status, 400);
    assert.equal((await b.api('/api/nothing')).status, 404);
    assert.equal((await b.api('/api/login')).status, 404, 'no login on a backend without it');
    assert.equal(b.backend.runs.length, 0);
  } finally {
    b.close();
  }
});

test('a run builds the prompt from the editor modules and streams it as NDJSON', async () => {
  const b = await bridge();
  try {
    const response = await b.api('/api/run', {
      op: 'complete',
      before: 'The proposal looks',
      after: '',
      alternatives: true,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /application\/x-ndjson/);
    assert.deepEqual(response.body.trim().split('\n').map(JSON.parse), [
      { type: 'delta', delta: 'Hello' },
      { type: 'delta', delta: ' world' },
      { type: 'done', text: 'Hello world' },
    ]);
    const run = b.backend.runs[0];
    assert.equal(run.instructions, ALTERNATIVES_INSTRUCTIONS);
    assert.deepEqual(JSON.parse(run.input), {
      before: 'The proposal looks',
      after: '',
      anchor: 'The proposal looks',
      mode: 'continue_sentence',
    });
    for (const body of [
      { op: 'shell', command: 'ls' },
      { op: 'complete', before: 1, after: '' },
      { op: 'complete', before: 'word '.repeat(501), after: '' },
      { op: 'rewrite', before: '', selected: 'abc', after: '', ratio: 9 },
      { op: 'rewrite', before: '', selected: 'abc', after: '', ratio: 1, rephrase: { avoid: 'x' } },
      { op: 'combine', before: '', target: '', after: '', dragged: 'x' },
    ]) {
      const rejected = await b.api('/api/run', body);
      assert.equal(rejected.status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(b.backend.runs.length, 1);
  } finally {
    b.close();
  }
});

test('prompts come only from the editor modules, with a reply cap and the editor timeout', () => {
  const paragraph = buildRequest({ op: 'complete', before: 'A.\n', after: '', paragraphs: true });
  assert.equal(paragraph.instructions, PARAGRAPH_INSTRUCTIONS);
  assert.equal(paragraph.timeoutMs, 20000);
  assert.equal(paragraph.maxChars, 1024 * 8);
  const rephrase = buildRequest({
    op: 'rewrite',
    before: 'A ',
    selected: 'quick',
    after: ' fox.',
    ratio: 1,
    rephrase: { avoid: ['fast'] },
  });
  assert.equal(rephrase.operation, 'rephrase');
  assert.deepEqual(JSON.parse(rephrase.input).avoid, ['fast']);
  const combine = buildRequest({
    op: 'combine',
    before: '',
    target: 'The bus was late.',
    after: ' ',
    dragged: 'Traffic was heavy.',
  });
  assert.equal(combine.instructions, COMBINE_INSTRUCTIONS);
  assert.equal(combine.operation, 'combine');
  assert.throws(() => buildRequest(null), /JSON object/);
  assert.throws(() => buildRequest({ op: 'complete', before: 'a' }), /after/);
});

test('closing the request stops the run, and a new run replaces the old one', async () => {
  const backend = new FakeBackend();
  backend.hang = true;
  const b = await bridge(backend);
  try {
    const first = new Promise(resolve => {
      const req = request(
        {
          host: '127.0.0.1',
          port: b.port,
          path: '/api/run',
          method: 'POST',
          headers: {
            Host: `127.0.0.1:${b.port}`,
            Origin: b.origin,
            Authorization: `Bearer ${TOKEN}`,
            'Content-Type': 'application/json',
          },
        },
        res => {
          res.once('readable', () => {
            req.destroy();
            resolve();
          });
        },
      );
      req.on('error', () => {});
      req.end(JSON.stringify({ op: 'complete', before: 'One', after: '' }));
    });
    await first;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(backend.runs[0].aborted, true, 'client disconnect aborts the backend');
    backend.hang = false;
    const second = b.api('/api/run', { op: 'complete', before: 'Two', after: '' });
    assert.equal((await second).status, 200);
  } finally {
    b.close();
  }
});

// Browser client against a fake fetch.
function stream(lines, { delay = 0 } = {}) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      for (const line of lines) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        controller.enqueue(encoder.encode(JSON.stringify(line) + '\n'));
      }
      controller.close();
    },
  });
}

test('the browser client streams progress, sends only the operation, and supersedes', async () => {
  const calls = [];
  const statuses = [];
  const fetchImpl = async (path, init) => {
    calls.push({ path, init, body: JSON.parse(init.body) });
    if (path === 'api/session') return Response.json({ provider: 'claude', ready: true });
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(
      stream(
        [
          { type: 'delta', delta: 'Hel' },
          { type: 'delta', delta: 'lo' },
          { type: 'done', text: 'Hello' },
        ],
        { delay: 5 },
      ),
    );
  };
  const client = new BridgeCompose((state, message) => statuses.push([state, message]), {
    token: TOKEN,
    fetchImpl,
  });
  await client.connect('ignored-key');
  assert.equal(client.ready, true);
  assert.deepEqual(statuses.at(-1), ['ready', undefined]);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(calls[0].init.credentials, 'omit');
  const progress = [];
  const text = await client.request(
    { before: 'He', after: '', range: {}, collapsed: true },
    (value, done) => progress.push([value, done]),
    'a1',
    { alternatives: true },
  );
  assert.equal(text, 'Hello');
  assert.deepEqual(progress, [
    ['Hel', false],
    ['Hello', false],
    ['Hello', true],
  ]);
  assert.deepEqual(calls[1].body, {
    op: 'complete',
    before: 'He',
    after: '',
    alternatives: true,
    paragraphs: false,
  });
  const first = client.rewrite({ before: '', selected: 'abc', after: '', range: {} }, 0.5);
  const second = client.combine({ before: '', target: 'A.', after: '', dragged: 'B.' });
  await assert.rejects(first, error => error.name === 'AbortError');
  assert.equal(await second, 'Hello');
  assert.deepEqual(Object.keys(calls.at(-1).body), ['op', 'before', 'target', 'after', 'dragged']);
});

test('the browser client reports bridge errors and drops the connection when unpaired', async () => {
  const statuses = [];
  let mode = 'error';
  const fetchImpl = async path => {
    if (path === 'api/session') return Response.json({ provider: 'chatgpt', ready: true });
    if (mode === 'error') {
      return new Response(
        stream([{ type: 'error', message: 'Limit reached.', code: 'usage_limit' }]),
      );
    }
    if (mode === 'unpaired') return Response.json({ error: 'no' }, { status: 401 });
    throw new TypeError('fetch failed');
  };
  const client = new BridgeCompose((state, message) => statuses.push([state, message]), {
    token: TOKEN,
    fetchImpl,
  });
  await client.connect();
  await assert.rejects(
    client.request({ before: 'a', after: '' }),
    error => error.message === 'Limit reached.' && error.code === 'usage_limit',
  );
  assert.equal(client.ready, true, 'a usage limit keeps the connection');
  mode = 'unpaired';
  await assert.rejects(client.request({ before: 'a', after: '' }), /not paired/);
  assert.equal(client.ready, false);
  assert.equal(statuses.at(-1)[0], 'error');
  await client.connect();
  mode = 'offline';
  await assert.rejects(client.request({ before: 'a', after: '' }), /not running/);
  assert.equal(client.ready, false);
  const waiting = new BridgeCompose(() => {}, {
    token: TOKEN,
    fetchImpl: async () => Response.json({ provider: 'chatgpt', ready: false, problem: null }),
  });
  await assert.rejects(waiting.connect(), /Continue with ChatGPT/);
});

test('cancelled runs are not reported as errors and do not count toward the rate limit', async () => {
  const backend = new FakeBackend();
  backend.hang = true;
  backend.login = async options => ({ url: 'https://auth.example/', options });
  const b = await bridge(backend);
  try {
    const login = await b.api('/api/login', { newAccount: true });
    assert.deepEqual(JSON.parse(login.body).options, { newAccount: true });
    // Typing cancels a request on every key; 70 of them must not trip the limit.
    const first = b.api('/api/run', { op: 'complete', before: 'a', after: '' });
    await new Promise(resolve => setTimeout(resolve, 30));
    for (let index = 0; index < 70; index++) {
      const next = b.api('/api/run', { op: 'complete', before: `a${index}`, after: '' });
      await new Promise(resolve => setTimeout(resolve, 5));
      next.catch(() => {});
    }
    const replaced = await first;
    assert.equal(replaced.status, 200);
    assert.equal(replaced.body, '', 'a replaced run ends quietly, with no error line');
    backend.hang = false;
    const answered = await b.api('/api/run', { op: 'complete', before: 'b', after: '' });
    assert.equal(answered.status, 200);
    assert.match(answered.body, /"type":"done"/);
  } finally {
    b.close();
  }
});

test('the client falls back when the page is not served by the bridge, and connect times out', async () => {
  const notBridge = new BridgeCompose(() => {}, {
    token: TOKEN,
    fetchImpl: async () => new Response('Not found', { status: 404 }),
  });
  await assert.rejects(notBridge.connect(), error => error.code === 'not_bridge');
  const statuses = [];
  const stalled = new BridgeCompose((state, message) => statuses.push([state, message]), {
    token: TOKEN,
    fetchImpl: (path, init) =>
      new Promise((resolve, reject) =>
        init.signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      ),
  });
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, ms, ...rest) =>
    realSetTimeout(callback, Math.min(ms, 20), ...rest);
  try {
    await assert.rejects(stalled.connect(), /timed out/);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(statuses.at(-1), ['error', 'Connection timed out. Try again.']);
});

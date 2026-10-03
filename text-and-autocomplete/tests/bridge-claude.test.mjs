import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ClaudeBackend,
  childEnv,
  claudeArgs,
  lockdownProblem,
  accountProblem,
  resultError,
} from '../scripts/bridge/claude.mjs';

// A stand-in for the claude CLI that speaks its stream-json protocol, reads its
// behaviour from fake-config.json beside it, and logs what it received.
const FAKE = `#!/usr/bin/env node
import { readFileSync, appendFileSync } from 'node:fs';
const here = new URL('.', import.meta.url);
const config = JSON.parse(readFileSync(new URL('fake-config.json', here), 'utf8'));
const log = value => appendFileSync(new URL('fake-log.jsonl', here), JSON.stringify(value) + '\\n');
const args = process.argv.slice(2);
log({ args, env: process.env, cwd: process.cwd(), pid: process.pid });
if (args[0] === 'auth') {
  process.stdout.write(JSON.stringify(config.status));
  process.exit(0);
}
const out = value => process.stdout.write(JSON.stringify(value) + '\\n');
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let end;
  while ((end = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, end);
    buffer = buffer.slice(end + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => {
  log({ terminated: process.pid });
  process.exit(143);
});
function handle(message) {
  if (message.type === 'control_request') {
    const account = config.account || { subscriptionType: 'max' };
    out({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: { account } } });
    return;
  }
  log({ message, pid: process.pid });
  if (!config.noInit) out({ type: 'system', subtype: 'init', tools: config.tools || [], mcp_servers: config.mcp || [], apiKeySource: config.apiKeySource || 'none' });
  const chunks = config.chunks || ['ok'];
  let delay = 0;
  for (const text of chunks) {
    delay += 5;
    setTimeout(() => out({ type: 'stream_event', event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } }), delay);
  }
  const result = config.result || { subtype: 'success', is_error: false, result: chunks.join(''), terminal_reason: 'completed' };
  if (!config.hang) setTimeout(() => out({ type: 'result', ...result }), delay + 5);
}
`;

function fakeClaude(config) {
  const dir = mkdtempSync(join(tmpdir(), 'fake-claude-'));
  const command = join(dir, 'claude.mjs');
  writeFileSync(command, FAKE);
  chmodSync(command, 0o755);
  const setConfig = value => writeFileSync(join(dir, 'fake-config.json'), JSON.stringify(value));
  setConfig({
    status: { loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' },
    ...config,
  });
  const logs = () =>
    existsSync(join(dir, 'fake-log.jsonl'))
      ? readFileSync(join(dir, 'fake-log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
      : [];
  return { command, setConfig, logs };
}

const skip = process.platform === 'win32' ? 'the fake CLI relies on a shebang' : false;
const settle = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
const ENV = {
  PATH: process.env.PATH,
  HOME: '/home/someone',
  ANTHROPIC_API_KEY: 'sk-ant-api-should-not-pass',
  ANTHROPIC_AUTH_TOKEN: 'bearer-should-not-pass',
  ANTHROPIC_BASE_URL: 'https://elsewhere.example',
  ANTHROPIC_CONFIG_DIR: '/home/someone/.config/anthropic',
  CLAUDE_CODE_USE_BEDROCK: '1',
  CLAUDECODE: '1',
  CLAUDE_CODE_SESSION_ID: 'parent-session',
  CLAUDE_EFFORT: 'max',
  CLAUDE_CODE_OAUTH_TOKEN: 'sk-ant-oat-subscription',
};

test('the CLI runs with no tools, no MCP, no settings, and an allowlisted environment', () => {
  const args = claudeArgs('claude-haiku-4-5-20251001');
  const after = flag => args[args.indexOf(flag) + 1];
  assert.equal(after('--tools'), '');
  assert.equal(after('--setting-sources'), '');
  assert.equal(after('--disallowedTools'), 'mcp__*');
  for (const flag of [
    '--strict-mcp-config',
    '--safe-mode',
    '--disable-slash-commands',
    '--no-session-persistence',
  ]) {
    assert.ok(args.includes(flag), flag);
  }
  assert.ok(!args.includes('--bare'), '--bare would ignore the Claude plan sign-in');
  assert.ok(!args.includes('--effort'));
  assert.equal(claudeArgs('claude-sonnet-5-5').at(-1), 'low');
  const env = childEnv(ENV, 'claude-haiku-4-5-20251001', '/empty');
  for (const name of [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'CLAUDE_CODE_USE_BEDROCK',
    'CLAUDECODE',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_EFFORT',
  ]) {
    assert.equal(env[name], undefined, name);
  }
  assert.equal(env.ANTHROPIC_CONFIG_DIR, '/empty', 'API profiles cannot outrank the plan');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'sk-ant-oat-subscription');
  assert.equal(env.MAX_THINKING_TOKENS, '0');
  assert.equal(childEnv(ENV, 'claude-sonnet-5-5').MAX_THINKING_TOKENS, undefined);
  assert.equal(lockdownProblem({ tools: [], mcp_servers: [], apiKeySource: 'none' }), null);
  assert.match(
    lockdownProblem({ tools: ['Bash'], mcp_servers: [], apiKeySource: 'none' }),
    /tools/,
  );
  assert.match(lockdownProblem({ tools: [], mcp_servers: [{}], apiKeySource: 'none' }), /MCP/);
  assert.match(
    lockdownProblem({ tools: [], mcp_servers: [], apiKeySource: 'ANTHROPIC_API_KEY' }),
    /API key/,
  );
  assert.equal(lockdownProblem({ tools: [], mcp_servers: [], apiKeySource: 'x' }, true), null);
  assert.equal(accountProblem({ subscriptionType: 'max' }), null);
  assert.match(accountProblem({ apiKeySource: 'apiKeyHelper' }), /API key/);
  assert.equal(accountProblem({ apiKeySource: 'apiKeyHelper' }, true), null);
  assert.match(accountProblem({ apiProvider: 'vertex' }), /vertex/);
  assert.equal(
    resultError({ is_error: true, result: 'Please run /login' }).code,
    'signin_required',
  );
  assert.match(
    resultError({ subtype: 'error_during_execution' }).message,
    /error_during_execution/,
  );
});

test(
  'start checks the sign-in and the session account before any document text',
  { skip },
  async () => {
    const fake = fakeClaude({});
    const backend = new ClaudeBackend({ command: fake.command, env: ENV });
    try {
      await backend.start();
      const logs = fake.logs();
      assert.deepEqual(logs[0].args, ['auth', 'status']);
      assert.notEqual(logs[0].cwd, tmpdir(), 'auth status runs in a private folder');
      const spawned = logs.find(entry => entry.args?.[0] === '-p');
      assert.equal(spawned.env.ANTHROPIC_API_KEY, undefined);
      assert.equal(spawned.env.ANTHROPIC_BASE_URL, undefined);
      assert.equal(spawned.env.MAX_THINKING_TOKENS, '0');
      assert.ok(spawned.env.ANTHROPIC_CONFIG_DIR.includes('text-autocomplete-profile-'));
      assert.deepEqual(readdirSync(spawned.env.ANTHROPIC_CONFIG_DIR), []);
      assert.ok(spawned.cwd.includes('text-autocomplete-'), 'runs in an empty temporary folder');
      const sent = logs.find(entry => entry.message).message;
      assert.equal(sent.client_composed, true);
      assert.match(sent.message.content, /^INSTRUCTIONS:\nReply with exactly: ok\n\nINPUT:\n\{\}$/);
      assert.equal(backend.describe().ready, true);
      assert.equal(backend.describe().plan, 'max');
      assert.equal(backend.describe().billing, 'plan');
    } finally {
      backend.close();
    }
    for (const [config, pattern] of [
      [{ status: { loggedIn: false } }, /not signed in/],
      [
        { account: { apiKeySource: 'ANTHROPIC_API_KEY', tokenSource: 'x' } },
        /would bill an API key/,
      ],
      [{ account: { apiProvider: 'bedrock' } }, /bedrock/],
    ]) {
      const other = fakeClaude(config);
      const refused = new ClaudeBackend({ command: other.command, env: ENV });
      try {
        await assert.rejects(refused.start(), pattern);
        assert.equal(other.logs().filter(entry => entry.message).length, 0, 'no text was sent');
      } finally {
        refused.close();
      }
    }
    const keyed = fakeClaude({
      account: { apiKeySource: 'ANTHROPIC_API_KEY' },
      apiKeySource: 'ANTHROPIC_API_KEY',
    });
    const allowed = new ClaudeBackend({ command: keyed.command, env: ENV, allowApiKey: true });
    try {
      await allowed.start();
      assert.equal(allowed.describe().billing, 'api_key');
    } finally {
      allowed.close();
    }
  },
);

test(
  'Claude Code errors keep their message, and a missing session report fails closed',
  { skip },
  async () => {
    const limited = fakeClaude({
      result: { subtype: 'success', is_error: true, result: "You've hit your usage limit." },
    });
    const backend = new ClaudeBackend({ command: limited.command, env: ENV });
    try {
      await assert.rejects(
        backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
        error => error.code === 'usage_limit' && /usage limit/.test(error.message),
      );
      assert.equal(backend.describe().ready, true, 'a usage limit does not end the session');
    } finally {
      backend.close();
    }
    const silent = fakeClaude({ noInit: true });
    const unchecked = new ClaudeBackend({ command: silent.command, env: ENV });
    try {
      await assert.rejects(
        unchecked.run({ instructions: 'x', input: '{}', maxChars: 100 }),
        /session settings/,
      );
      assert.equal(unchecked.describe().ready, false);
    } finally {
      unchecked.close();
    }
  },
);

test(
  'requests stream from a fresh process each time, and the next spare starts at once',
  { skip },
  async () => {
    const fake = fakeClaude({ chunks: ['Hello', ' there'] });
    const backend = new ClaudeBackend({ command: fake.command, env: ENV });
    try {
      const deltas = [];
      const first = await backend.run({
        instructions: 'Do it',
        input: '{"before":"a"}',
        maxChars: 100,
        onDelta: delta => deltas.push(delta),
      });
      assert.equal(first, 'Hello there');
      assert.deepEqual(deltas, ['Hello', ' there']);
      await backend.run({ instructions: 'Again', input: '{}', maxChars: 100 });
      await settle(300);
      const processes = new Set(
        fake
          .logs()
          .filter(entry => entry.message)
          .map(entry => entry.pid),
      );
      assert.equal(processes.size, 2, 'no process answers twice, so no history carries over');
      assert.ok(backend.spare && !backend.spare.exited, 'a spare is waiting');
      fake.setConfig({ hang: true, chunks: ['x'] });
      backend.spare.stop();
      backend.spare = null;
      const running = backend.run({ instructions: 'Hang', input: '{}', maxChars: 100 });
      running.catch(() => {});
      assert.ok(backend.spare, 'a spare starts while the request runs');
      const dirs = [...backend.workers].map(worker => worker.cwd);
      assert.ok(dirs.length >= 2);
      backend.close();
      assert.ok(
        dirs.every(dir => !existsSync(dir)),
        'close removes every folder at once',
      );
      assert.ok(!existsSync(backend.profileDir));
    } finally {
      backend.close();
    }
  },
);

test('cancelling stops the process, and a long reply is cut off', { skip }, async () => {
  const fake = fakeClaude({ hang: true, chunks: ['partial'] });
  const backend = new ClaudeBackend({ command: fake.command, env: ENV });
  try {
    const controller = new AbortController();
    const running = backend.run({
      instructions: 'x',
      input: '{}',
      maxChars: 100,
      signal: controller.signal,
    });
    await settle(150);
    controller.abort();
    await assert.rejects(running, error => error.name === 'AbortError');
    await settle(150);
    assert.ok(
      fake.logs().some(entry => entry.terminated),
      'the process received SIGTERM',
    );
    fake.setConfig({ chunks: ['a'.repeat(60), 'b'.repeat(60)] });
    backend.spare?.stop();
    backend.spare = null;
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'too_long',
    );
  } finally {
    backend.close();
  }
});

test('a session that reports tools or an API key is refused for good', { skip }, async () => {
  const fake = fakeClaude({ tools: ['Bash'] });
  const backend = new ClaudeBackend({ command: fake.command, env: ENV });
  try {
    await assert.rejects(backend.run({ instructions: 'x', input: '{}', maxChars: 100 }), /tools/);
    assert.equal(backend.describe().ready, false);
    await assert.rejects(backend.run({ instructions: 'x', input: '{}', maxChars: 100 }), /tools/);
    assert.equal(
      fake.logs().filter(entry => entry.message).length,
      1,
      'no second request was sent',
    );
  } finally {
    backend.close();
  }
  const keyed = fakeClaude({ apiKeySource: 'ANTHROPIC_API_KEY' });
  const billed = new ClaudeBackend({ command: keyed.command, env: ENV });
  try {
    await assert.rejects(billed.run({ instructions: 'x', input: '{}', maxChars: 100 }), /API key/);
  } finally {
    billed.close();
  }
});

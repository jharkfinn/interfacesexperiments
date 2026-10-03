import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, statSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChatGPTBackend, APP_NAME } from '../scripts/bridge/chatgpt.mjs';

// A stand-in for auth.openai.com and api.openai.com that follows the Sign in with
// ChatGPT docs closely enough to check the bridge's side of the flow.
async function fakeOpenAI() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', use: 'sig', alg: 'RS256' };
  const state = {
    challenge: null,
    tokens: 0,
    refreshes: 0,
    revoked: [],
    responses: [],
    stream: null,
    nonce: null,
    overrides: {},
  };
  let base;
  const idToken = (clientId, claims = {}) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString(
      'base64url',
    );
    const body = Buffer.from(
      JSON.stringify({
        iss: base,
        aud: clientId,
        sub: 'user-123',
        email: 'writer@example.com',
        nonce: state.nonce,
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...claims,
        ...state.overrides.claims,
      }),
    ).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey);
    return `${header}.${body}.${signature.toString('base64url')}`;
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, base);
    let body = '';
    for await (const chunk of req) body += chunk;
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/.well-known/openid-configuration') {
      json(200, { issuer: base, jwks_uri: `${base}/jwks`, revocation_endpoint: `${base}/revoke` });
    } else if (url.pathname === '/jwks') json(200, { keys: [jwk] });
    else if (url.pathname === '/api/accounts/oauth/token') {
      const form = new URLSearchParams(body);
      state.lastForm = Object.fromEntries(form);
      if (form.get('grant_type') === 'authorization_code') {
        const challenge = createHash('sha256')
          .update(form.get('code_verifier'))
          .digest('base64url');
        if (form.get('code') !== 'good-code' || challenge !== state.challenge) {
          json(400, { error: 'invalid_grant' });
          return;
        }
        state.tokens++;
        json(200, {
          access_token: `access-${state.tokens}`,
          refresh_token: `refresh-${state.tokens}`,
          id_token: idToken(form.get('client_id')),
          token_type: 'Bearer',
          expires_in: 3600,
          scope:
            state.overrides.scope ??
            'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke',
        });
      } else {
        if (state.overrides.refreshError) {
          json(400, { error: state.overrides.refreshError });
          return;
        }
        state.refreshes++;
        json(200, {
          access_token: `refreshed-${state.refreshes}`,
          refresh_token: `refresh-r${state.refreshes}`,
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke',
        });
      }
    } else if (url.pathname === '/revoke') {
      state.revoked.push(Object.fromEntries(new URLSearchParams(body)));
      res.writeHead(state.overrides.revokeStatuses?.shift() ?? 200);
      res.end();
    } else if (url.pathname === '/v1/models') {
      json(200, {
        models: [
          { slug: 'gpt-6.1-sol', display_name: 'Sol', visibility: 'list' },
          { slug: 'gpt-6-luna', display_name: 'Luna', visibility: 'list' },
          { slug: 'internal', visibility: 'hide' },
        ],
      });
    } else if (url.pathname === '/v1/responses') {
      const request = JSON.parse(body);
      state.responses.push({ request, authorization: req.headers.authorization });
      if (state.overrides.responseError) {
        res.setHeader('x-request-id', 'req_test123');
        json(state.overrides.responseError.status, { error: state.overrides.responseError });
        if (state.overrides.responseErrorOnce) delete state.overrides.responseError;
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const event of state.stream || [
        { type: 'response.created' },
        { type: 'response.output_text.delta', delta: 'Hello' },
        { type: 'response.output_text.delta', delta: ' world' },
        { type: 'response.completed', response: { status: 'completed' } },
      ]) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
    } else json(404, {});
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  return { base, state, server, idToken };
}

async function signedIn(fake, options = {}) {
  const configDir = mkdtempSync(join(tmpdir(), 'siwc-'));
  const backend = new ChatGPTBackend({
    configDir,
    authBase: fake.base,
    apiBase: `${fake.base}/v1`,
    issuer: fake.base,
    callbackPort: 0,
    ...options,
  });
  await backend.start();
  const { url } = await backend.login();
  const params = new URL(url).searchParams;
  fake.state.challenge = params.get('code_challenge');
  fake.state.nonce = params.get('nonce');
  const callback = new URL(params.get('redirect_uri'));
  callback.searchParams.set('code', 'good-code');
  callback.searchParams.set('state', params.get('state'));
  callback.searchParams.set('client_id', 'oaiapp_test');
  const page = await fetch(callback);
  return { backend, configDir, params, page, text: await page.text() };
}

test('sign-in follows the documented OAuth flow and stores tokens only the user can read', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend, configDir, params, page, text } = await signedIn(fake);
    assert.equal(params.get('client_id'), 'dynamic_agent_client');
    assert.equal(params.get('agent_name_hint'), APP_NAME);
    assert.match(params.get('ext_agent_host_id'), /^urn:uuid:[0-9a-f-]{36}$/);
    assert.match(params.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
    assert.equal(
      params.get('scope'),
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    );
    assert.equal(params.get('resource'), 'https://api.openai.com/v1');
    assert.equal(params.get('response_type'), 'code');
    assert.equal(params.get('code_challenge_method'), 'S256');
    assert.equal(page.status, 200);
    assert.match(text, /Signed in/);
    assert.equal(fake.state.lastForm.client_id, 'oaiapp_test');
    assert.equal(fake.state.lastForm.redirect_uri, params.get('redirect_uri'));
    assert.equal(fake.state.lastForm.resource, 'https://api.openai.com/v1');
    const session = await backend.describe();
    assert.equal(session.ready, true);
    assert.equal(session.email, 'writer@example.com');
    assert.equal(session.model, 'gpt-6-luna', 'the smallest listed model answers fastest');
    const file = join(configDir, 'chatgpt.json');
    if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(saved.client_id, 'oaiapp_test');
    assert.equal(saved.refresh_token, 'refresh-1');
    assert.equal(saved.subject, 'user-123');
    assert.ok(!JSON.stringify(session).includes('access-1'), 'tokens never reach the page');
    // Signing in again reuses the issued client and the same host ID.
    const again = new URL((await backend.login()).url).searchParams;
    assert.equal(again.get('client_id'), 'oaiapp_test');
    assert.equal(again.get('ext_agent_host_id'), params.get('ext_agent_host_id'));
    assert.equal(again.get('agent_name_hint'), null);
    assert.equal(again.get('login_hint'), 'writer@example.com');
    assert.ok(again.get('id_token_hint'));
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('the ID token must be signed, addressed to this client, and match the nonce', async () => {
  const fake = await fakeOpenAI();
  try {
    for (const [claims, pattern] of [
      [{ nonce: 'other' }, /does not match this sign-in/],
      [{ aud: 'someone-else' }, /another client/],
      [{ iss: 'https://evil.example' }, /wrong issuer/],
      [{ exp: 1000 }, /expired/],
    ]) {
      fake.state.overrides.claims = claims;
      const { backend, text } = await signedIn(fake);
      assert.match(text, pattern);
      assert.equal((await backend.describe()).ready, false);
      backend.close();
    }
    fake.state.overrides = { scope: 'openid profile email offline_access' };
    const { backend } = await signedIn(fake);
    const session = await backend.describe();
    assert.equal(session.signedIn, true);
    assert.equal(session.planUsage, false);
    assert.match(session.problem, /plan usage was not allowed/);
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'signin_required',
    );
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('the callback rejects a wrong state and a declined sign-in', async () => {
  const fake = await fakeOpenAI();
  try {
    const backend = new ChatGPTBackend({
      configDir: mkdtempSync(join(tmpdir(), 'siwc-')),
      authBase: fake.base,
      apiBase: `${fake.base}/v1`,
      issuer: fake.base,
      callbackPort: 0,
    });
    await backend.start();
    const params = new URL((await backend.login()).url).searchParams;
    const callback = new URL(params.get('redirect_uri'));
    callback.searchParams.set('state', 'forged');
    callback.searchParams.set('code', 'good-code');
    assert.equal((await fetch(callback)).status, 400);
    assert.equal(fake.state.tokens, 0, 'no code exchange for a forged state');
    const declined = new URL(params.get('redirect_uri'));
    declined.searchParams.set('state', params.get('state'));
    declined.searchParams.set('error', 'access_denied');
    assert.match(await (await fetch(declined)).text(), /declined/);
    assert.match((await backend.describe()).problem, /declined/);
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('inference streams from the Responses API with the documented body', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend } = await signedIn(fake);
    const deltas = [];
    const text = await backend.run({
      instructions: 'Continue.',
      input: '{"before":"Hi"}',
      maxChars: 100,
      onDelta: delta => deltas.push(delta),
    });
    assert.equal(text, 'Hello world');
    assert.deepEqual(deltas, ['Hello', ' world']);
    const { request, authorization } = fake.state.responses[0];
    assert.equal(authorization, 'Bearer access-1');
    assert.deepEqual(request, {
      model: 'gpt-6-luna',
      instructions: 'Continue.',
      input: [{ role: 'user', content: '{"before":"Hi"}' }],
      store: false,
      stream: true,
      reasoning: { effort: 'low' },
    });
    for (const field of ['max_output_tokens', 'temperature', 'metadata', 'conversation']) {
      assert.ok(!(field in request), `${field} is not supported on this route`);
    }
    fake.state.stream = [
      { type: 'response.output_text.delta', delta: 'x'.repeat(80) },
      { type: 'response.output_text.delta', delta: 'x'.repeat(80) },
      { type: 'response.completed' },
    ];
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'too_long',
    );
    fake.state.stream = [{ type: 'response.output_text.delta', delta: 'cut' }];
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      /ended before/,
    );
    fake.state.stream = [
      {
        type: 'response.failed',
        response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } },
      },
    ];
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'usage_limit' && /usage limit/.test(error.message),
    );
    const sent = fake.state.responses.length;
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      /usage limit/,
    );
    assert.equal(fake.state.responses.length, sent, 'requests pause after a usage limit');
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('an unsupported reasoning setting is dropped once, and tokens refresh before expiry', async () => {
  const fake = await fakeOpenAI();
  try {
    let clock = Date.now();
    const { backend } = await signedIn(fake, { now: () => clock });
    fake.state.overrides.responseError = {
      status: 400,
      code: 'subscription_sharing_unsupported_capability',
      param: 'reasoning.effort',
    };
    fake.state.overrides.responseErrorOnce = true;
    assert.equal(
      await backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      'Hello world',
    );
    assert.equal('reasoning' in fake.state.responses.at(-1).request, false);
    clock += 3600 * 1000;
    await backend.run({ instructions: 'x', input: '{}', maxChars: 100 });
    assert.equal(fake.state.refreshes, 1);
    assert.equal(fake.state.lastForm.grant_type, 'refresh_token');
    assert.equal(fake.state.lastForm.client_id, 'oaiapp_test');
    assert.equal(fake.state.lastForm.refresh_token, 'refresh-1');
    assert.equal(fake.state.responses.at(-1).authorization, 'Bearer refreshed-1');
    clock += 3600 * 1000;
    fake.state.overrides.refreshError = 'refresh_token_reused';
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'signin_required',
    );
    assert.equal((await backend.describe()).signedIn, false);
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('signing out revokes the refresh token and keeps the client and host IDs', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend, configDir, params } = await signedIn(fake);
    assert.deepEqual(await backend.logout(), { revoked: true, signedIn: true });
    assert.deepEqual(fake.state.revoked[0], {
      token: 'refresh-1',
      token_type_hint: 'refresh_token',
      client_id: 'oaiapp_test',
    });
    const saved = JSON.parse(readFileSync(join(configDir, 'chatgpt.json'), 'utf8'));
    assert.equal(saved.refresh_token, undefined);
    assert.equal(saved.access_token, undefined);
    assert.equal(saved.client_id, 'oaiapp_test');
    assert.equal(saved.ext_agent_host_id, params.get('ext_agent_host_id'));
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('a declined plan grant asks for consent again, and the issued client is kept', async () => {
  const fake = await fakeOpenAI();
  try {
    fake.state.overrides = { scope: 'openid profile email offline_access' };
    const { backend } = await signedIn(fake);
    const again = new URL((await backend.login()).url).searchParams;
    assert.equal(again.get('client_id'), 'oaiapp_test');
    assert.equal(again.get('prompt'), 'consent', 'a returning sign-in would skip consent');
    backend.close();
    fake.state.overrides = {};
    const { backend: granted } = await signedIn(fake);
    const routine = new URL((await granted.login()).url).searchParams;
    assert.equal(routine.get('prompt'), null, 'ordinary sign-ins do not force consent');
    granted.close();
  } finally {
    fake.server.close();
  }
});

test('an issued client ID survives a failed code exchange', async () => {
  const fake = await fakeOpenAI();
  try {
    const configDir = mkdtempSync(join(tmpdir(), 'siwc-'));
    const backend = new ChatGPTBackend({
      configDir,
      authBase: fake.base,
      apiBase: `${fake.base}/v1`,
      issuer: fake.base,
      callbackPort: 0,
    });
    await backend.start();
    const params = new URL((await backend.login()).url).searchParams;
    const callback = new URL(params.get('redirect_uri'));
    callback.searchParams.set('code', 'expired-code');
    callback.searchParams.set('state', params.get('state'));
    callback.searchParams.set('client_id', 'oaiapp_first');
    assert.equal((await fetch(callback)).status, 400);
    const retry = new URL((await backend.login()).url).searchParams;
    assert.equal(retry.get('client_id'), 'oaiapp_first', 'no second registration');
    assert.equal(retry.get('agent_name_hint'), null);
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('a rejected token is refreshed once, then dropped so sign-in can start again', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend } = await signedIn(fake);
    fake.state.overrides.responseError = { status: 401, code: 'subscription_sharing_invalid_user' };
    fake.state.overrides.responseErrorOnce = true;
    assert.equal(
      await backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      'Hello world',
    );
    assert.equal(fake.state.refreshes, 1, 'one forced refresh');
    assert.equal(fake.state.responses.at(-1).authorization, 'Bearer refreshed-1');
    fake.state.overrides.responseError = { status: 401, code: 'subscription_sharing_invalid_user' };
    delete fake.state.overrides.responseErrorOnce;
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'signin_required' && /req_test123/.test(error.message),
    );
    const session = await backend.describe();
    assert.equal(session.signedIn, false, 'the page can offer Continue with ChatGPT again');
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('an ineligible account stops sending requests', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend } = await signedIn(fake);
    fake.state.overrides.responseError = {
      status: 403,
      code: 'subscription_sharing_user_not_eligible',
    };
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'not_eligible' && /Plus or Pro/.test(error.message),
    );
    const sent = fake.state.responses.length;
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      /Plus or Pro/,
    );
    assert.equal(fake.state.responses.length, sent);
    const session = await backend.describe();
    assert.equal(session.ready, false);
    assert.match(session.problem, /Plus or Pro/);
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('another account can be signed in without losing this host ID', async () => {
  const fake = await fakeOpenAI();
  try {
    const { backend, configDir, params } = await signedIn(fake);
    const fresh = new URL((await backend.login({ newAccount: true })).url).searchParams;
    assert.equal(fresh.get('client_id'), 'dynamic_agent_client');
    assert.equal(fresh.get('agent_name_hint'), APP_NAME);
    assert.equal(fresh.get('ext_agent_host_id'), params.get('ext_agent_host_id'));
    fake.state.challenge = fresh.get('code_challenge');
    fake.state.nonce = fresh.get('nonce');
    fake.state.overrides.claims = { sub: 'user-456', email: 'other@example.com' };
    const callback = new URL(fresh.get('redirect_uri'));
    callback.searchParams.set('code', 'good-code');
    callback.searchParams.set('state', fresh.get('state'));
    callback.searchParams.set('client_id', 'oaiapp_second');
    assert.match(await (await fetch(callback)).text(), /Signed in/);
    const saved = JSON.parse(readFileSync(join(configDir, 'chatgpt.json'), 'utf8'));
    assert.equal(saved.client_id, 'oaiapp_second');
    assert.equal(saved.subject, 'user-456');
    assert.equal(saved.ext_agent_host_id, params.get('ext_agent_host_id'));
    backend.close();
  } finally {
    fake.server.close();
  }
});

test('two bridges share one sign-in: refreshes do not race, and sign-out stops both', async () => {
  const fake = await fakeOpenAI();
  try {
    let clock = Date.now();
    const { backend, configDir } = await signedIn(fake, { now: () => clock });
    const other = new ChatGPTBackend({
      configDir,
      authBase: fake.base,
      apiBase: `${fake.base}/v1`,
      issuer: fake.base,
      now: () => clock,
    });
    await other.start();
    clock += 3600 * 1000;
    await Promise.all([
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      other.run({ instructions: 'x', input: '{}', maxChars: 100 }),
    ]);
    assert.equal(fake.state.refreshes, 1, 'the second process adopted the first refresh');
    fake.state.overrides.revokeStatuses = [503, 200];
    assert.deepEqual(await other.logout(), { revoked: true, signedIn: true });
    assert.equal(fake.state.revoked.length, 2, 'a server error is retried');
    await assert.rejects(
      backend.run({ instructions: 'x', input: '{}', maxChars: 100 }),
      error => error.code === 'signin_required',
    );
    backend.close();
  } finally {
    fake.server.close();
  }
});

test(
  'a credential file readable by others is made private on start',
  { skip: process.platform === 'win32' },
  async () => {
    const configDir = mkdtempSync(join(tmpdir(), 'siwc-'));
    const file = join(configDir, 'chatgpt.json');
    writeFileSync(file, JSON.stringify({ ext_agent_host_id: 'urn:uuid:x', refresh_token: 'r' }), {
      mode: 0o644,
    });
    chmodSync(file, 0o644);
    const backend = new ChatGPTBackend({ configDir });
    await backend.start();
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.match(backend.notice, /readable only by you/);
  },
);

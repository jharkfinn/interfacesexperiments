// Runs requests on the user's ChatGPT plan through Sign in with ChatGPT, OpenAI's
// documented route for open-source apps that run locally:
// https://developers.openai.com/siwc/token-sharing-open-source
// The bridge signs in with OAuth (PKCE, a 127.0.0.1 callback, no client secret),
// keeps the tokens in a file only the user can read, and calls the public
// Responses API with store:false and stream:true. Tokens never reach the page.
import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, createPublicKey, verify } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_NAME = 'Text and Autocomplete';
export const MANAGE_USAGE_URL = 'https://chatgpt.com/settings/usage';
const AUTH_BASE = 'https://auth.openai.com';
const API_BASE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
const CALLBACK_PATH = '/auth/callback';
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const REFRESH_MARGIN_MS = 2 * 60 * 1000;
const LIMIT_PAUSE_MS = 60 * 1000;
const UNUSABLE_REFRESH = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);
const LIMIT_MESSAGE = `Your ChatGPT plan reached a usage limit for this app. Manage usage at ${MANAGE_USAGE_URL}.`;
const ERRORS = {
  subscription_sharing_user_not_eligible:
    'ChatGPT plan usage is not available for this account or workspace. It needs ChatGPT Plus or Pro.',
  subscription_sharing_usage_limit_exceeded: LIMIT_MESSAGE,
  subscription_sharing_usage_unavailable: 'ChatGPT could not check your usage. Try again soon.',
  subscription_sharing_user_unavailable: 'ChatGPT account details are unavailable. Try again soon.',
  subscription_sharing_invalid_user: 'Sign in with ChatGPT again.',
};

const base64url = buffer => Buffer.from(buffer).toString('base64url');
const sha256 = text => createHash('sha256').update(text).digest();
const fail = (message, code) => Object.assign(new Error(message), code ? { code } : {});

export function defaultConfigDir(env = process.env, platform = process.platform) {
  const root =
    platform === 'win32'
      ? env.APPDATA || join(homedir(), 'AppData', 'Roaming')
      : env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(root, 'text-and-autocomplete');
}

function decodeSegment(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

async function errorOf(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {}
  const error = body?.error;
  const code =
    (typeof error === 'object' ? error?.code : error) || body?.code || `http_${response.status}`;
  const message =
    (typeof error === 'object' ? error?.message : body?.error_description) || body?.detail || '';
  return { status: response.status, code, param: error?.param || null, message };
}

// Reads a server-sent event stream and yields each event's parsed data.
async function* sseEvents(body) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data || data === '[DONE]') continue;
      try {
        yield JSON.parse(data);
      } catch {}
    }
  }
}

export class ChatGPTBackend {
  constructor({
    model = null,
    reasoning = 'low',
    configDir = defaultConfigDir(),
    authBase = AUTH_BASE,
    apiBase = API_BASE,
    issuer = AUTH_BASE,
    callbackPort = 1455,
    fetchImpl = (...args) => globalThis.fetch(...args),
    now = () => Date.now(),
  } = {}) {
    Object.assign(this, {
      requestedModel: model,
      reasoning,
      configDir,
      authBase,
      apiBase,
      issuer,
      callbackPort,
      fetch: fetchImpl,
      now,
    });
    this.file = join(configDir, 'chatgpt.json');
    this.record = {};
    this.models = null;
    this.model = null;
    this.pending = null;
    this.loginError = null;
    this.refreshing = null;
    this.limitUntil = 0;
  }
  async start() {
    try {
      this.record = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw fail(`Could not read ${this.file}.`);
      this.record = {};
    }
    // A stable, opaque host ID must exist before the first sign-in.
    if (!this.record.ext_agent_host_id) {
      this.record.ext_agent_host_id = `urn:uuid:${randomUUID()}`;
      await this.save();
    }
  }
  async save() {
    await mkdir(this.configDir, { recursive: true, mode: 0o700 });
    const temporary = `${this.file}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(this.record, null, 2) + '\n', { mode: 0o600 });
    await rename(temporary, this.file);
    await chmod(this.file, 0o600).catch(() => {});
  }
  get signedIn() {
    return Boolean(this.record.refresh_token && this.record.client_id);
  }
  get planUsage() {
    return Boolean(this.record.scopes?.includes(PLAN_SCOPE));
  }
  async describe() {
    if (this.signedIn && this.planUsage && !this.models) {
      try {
        await this.pickModel();
      } catch {}
    }
    return {
      provider: 'chatgpt',
      name: 'ChatGPT',
      ready: this.signedIn && this.planUsage,
      signedIn: this.signedIn,
      planUsage: this.planUsage,
      email: this.record.email || null,
      model: this.model,
      signingIn: Boolean(this.pending),
      problem: this.loginError,
      manageUsageUrl: MANAGE_USAGE_URL,
    };
  }

  // Sign-in. Opens a callback listener and returns the URL the page opens.
  async login() {
    this.pending?.close();
    this.loginError = null;
    const state = base64url(randomBytes(32));
    const nonce = base64url(randomBytes(32));
    const verifier = base64url(randomBytes(32));
    const server = createServer((req, res) => this.callback(req, res));
    const listen = port =>
      new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', reject);
          resolve(server.address().port);
        });
      });
    // Only the port may change between sign-ins, so a busy default port is fine.
    const port = await listen(this.callbackPort).catch(error => {
      if (error.code === 'EADDRINUSE' && this.callbackPort !== 0) return listen(0);
      throw error;
    });
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const returning = Boolean(this.record.client_id);
    const params = new URLSearchParams({
      client_id: returning ? this.record.client_id : 'dynamic_agent_client',
      ext_agent_host_id: this.record.ext_agent_host_id,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      resource: `${API_BASE}`,
      state,
      nonce,
      code_challenge_method: 'S256',
      code_challenge: base64url(sha256(verifier)),
    });
    if (returning) {
      if (this.record.id_token) params.set('id_token_hint', this.record.id_token);
      if (this.record.email) params.set('login_hint', this.record.email);
    } else params.set('agent_name_hint', APP_NAME);
    const timer = setTimeout(
      () => this.endLogin('Sign-in timed out. Try again.'),
      LOGIN_TIMEOUT_MS,
    );
    timer.unref();
    this.pending = {
      state,
      nonce,
      verifier,
      redirectUri,
      port,
      clientId: returning ? this.record.client_id : null,
      close: () => {
        clearTimeout(timer);
        server.close();
        server.closeAllConnections?.();
      },
    };
    return { url: `${this.authBase}/api/accounts/authorize?${params}` };
  }
  // During a callback, the listener closes once its reply page has been sent.
  endLogin(error = null, response = null) {
    this.loginError = error;
    const pending = this.pending;
    this.pending = null;
    if (response) response.once('finish', () => pending?.close());
    else pending?.close();
  }
  async callback(req, res) {
    const page = (status, message) => {
      res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(message);
    };
    const pending = this.pending;
    const url = new URL(req.url, 'http://127.0.0.1');
    if (
      !pending ||
      req.method !== 'GET' ||
      req.headers.host !== `127.0.0.1:${pending.port}` ||
      url.pathname !== CALLBACK_PATH
    ) {
      page(404, 'Not found.');
      return;
    }
    const query = url.searchParams;
    if (query.get('state') !== pending.state) {
      page(400, 'This sign-in link does not match. Start again from the editor.');
      return;
    }
    if (query.get('error')) {
      this.endLogin(
        query.get('error') === 'access_denied'
          ? 'ChatGPT sign-in was declined.'
          : `ChatGPT sign-in failed (${query.get('error')}).`,
        res,
      );
      page(200, `${this.loginError} You can close this tab.`);
      return;
    }
    const clientId = pending.clientId || query.get('client_id');
    if (
      !clientId ||
      (pending.clientId && query.get('client_id') && query.get('client_id') !== pending.clientId)
    ) {
      this.endLogin('ChatGPT did not finish registering this app. Try again.', res);
      page(400, `${this.loginError} You can close this tab.`);
      return;
    }
    try {
      const tokens = await this.tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code: query.get('code') || '',
        code_verifier: pending.verifier,
        redirect_uri: pending.redirectUri,
        resource: API_BASE,
      });
      const identity = await this.validateIdToken(tokens.id_token, clientId, pending.nonce);
      if (
        this.record.subject &&
        this.record.client_id === clientId &&
        identity.sub !== this.record.subject
      ) {
        throw fail('ChatGPT signed in a different account than the saved one.');
      }
      this.store(tokens, { clientId, identity });
      await this.save();
      this.models = null;
      this.endLogin(
        this.planUsage ? null : 'ChatGPT plan usage was not allowed. Sign in again and allow it.',
        res,
      );
      page(200, 'Signed in. You can close this tab and return to the editor.');
    } catch (error) {
      this.endLogin(error.message, res);
      page(400, `Sign-in failed: ${error.message} You can close this tab.`);
    }
  }
  store(tokens, { clientId, identity } = {}) {
    const record = this.record;
    if (clientId) record.client_id = clientId;
    if (identity) {
      record.issuer = identity.iss;
      record.subject = identity.sub;
      record.email = identity.email || record.email || null;
    }
    if (tokens.id_token) record.id_token = tokens.id_token;
    record.access_token = tokens.access_token;
    if (tokens.refresh_token) record.refresh_token = tokens.refresh_token;
    record.token_type = tokens.token_type || 'Bearer';
    record.expires_in = tokens.expires_in;
    record.expires_at = this.now() + (Number(tokens.expires_in) || 3600) * 1000;
    if (typeof tokens.scope === 'string') record.scopes = tokens.scope.split(' ').filter(Boolean);
    record.saved_at = new Date(this.now()).toISOString();
  }
  async tokenRequest(form) {
    const response = await this.fetch(`${this.authBase}/api/accounts/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(form),
    });
    if (!response.ok) {
      const error = await errorOf(response);
      throw fail(`ChatGPT sign-in failed (${error.code}).`, error.code);
    }
    return response.json();
  }
  // Signature against OpenAI's published keys, then issuer, audience, expiry, nonce.
  async validateIdToken(idToken, clientId, nonce) {
    const parts = typeof idToken === 'string' ? idToken.split('.') : [];
    if (parts.length !== 3) throw fail('ChatGPT did not return an ID token.');
    const header = decodeSegment(parts[0]);
    const claims = decodeSegment(parts[1]);
    if (header.alg !== 'RS256') throw fail('Unexpected ID token algorithm.');
    const config = await this.json(`${this.authBase}/.well-known/openid-configuration`);
    const jwks = await this.json(config.jwks_uri);
    const jwk = (jwks.keys || []).find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) throw fail('No signing key matches the ID token.');
    const valid = verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!valid) throw fail('The ID token signature is not valid.');
    if (claims.iss !== this.issuer) throw fail('The ID token has the wrong issuer.');
    if (!audience.includes(clientId)) throw fail('The ID token was issued to another client.');
    if (!(claims.exp * 1000 > this.now() - 60000)) throw fail('The ID token has expired.');
    if (claims.nonce !== nonce) throw fail('The ID token does not match this sign-in.');
    if (!claims.sub) throw fail('The ID token has no subject.');
    return claims;
  }
  async json(url) {
    const response = await this.fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw fail(`Could not load ${url} (${response.status}).`);
    return response.json();
  }

  // Refreshes run one at a time, because each refresh replaces the refresh token.
  async accessToken() {
    if (!this.signedIn) throw fail('Sign in with ChatGPT first.', 'signin_required');
    if (this.record.access_token && this.record.expires_at - REFRESH_MARGIN_MS > this.now()) {
      return this.record.access_token;
    }
    this.refreshing ??= (async () => {
      try {
        const tokens = await this.tokenRequest({
          grant_type: 'refresh_token',
          client_id: this.record.client_id,
          refresh_token: this.record.refresh_token,
          resource: API_BASE,
        });
        this.store(tokens);
        await this.save();
      } catch (error) {
        if (UNUSABLE_REFRESH.has(error.code)) {
          for (const key of ['access_token', 'refresh_token', 'expires_at'])
            delete this.record[key];
          await this.save();
          throw fail(
            'Your ChatGPT sign-in expired. Sign in with ChatGPT again.',
            'signin_required',
          );
        }
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    await this.refreshing;
    return this.record.access_token;
  }
  async pickModel() {
    if (this.model) return this.model;
    const token = await this.accessToken();
    const response = await this.fetch(`${this.apiBase}/models`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) {
      const error = await errorOf(response);
      throw fail(
        ERRORS[error.code] || `ChatGPT models are unavailable (${error.code}).`,
        error.code,
      );
    }
    const list = ((await response.json()).models || [])
      .filter(model => model.visibility === 'list' && model.slug)
      .map(model => model.slug);
    this.models = list;
    // The smallest listed model answers fastest, which autocomplete needs.
    this.model =
      (this.requestedModel && list.includes(this.requestedModel) && this.requestedModel) ||
      list.find(slug => /luna|mini|nano/i.test(slug)) ||
      list[0] ||
      this.requestedModel;
    if (!this.model) throw fail('This ChatGPT account lists no models for this app.');
    return this.model;
  }
  async run({ instructions, input, maxChars, signal, onDelta = () => {} }) {
    if (this.limitUntil > this.now()) throw fail(LIMIT_MESSAGE, 'usage_limit');
    if (!this.planUsage)
      throw fail('Sign in with ChatGPT and allow plan usage first.', 'signin_required');
    const model = await this.pickModel();
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.accessToken();
      response = await this.fetch(`${this.apiBase}/responses`, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          model,
          instructions,
          input: [{ role: 'user', content: input }],
          store: false,
          stream: true,
          ...(this.reasoning ? { reasoning: { effort: this.reasoning } } : {}),
        }),
      });
      if (response.ok) break;
      const error = await errorOf(response);
      // Some models take no reasoning setting; drop it once and retry.
      if (
        attempt === 0 &&
        this.reasoning &&
        error.code === 'subscription_sharing_unsupported_capability' &&
        String(error.param || '').startsWith('reasoning')
      ) {
        this.reasoning = null;
        continue;
      }
      throw this.responseError(error);
    }
    let text = '';
    for await (const event of sseEvents(response.body)) {
      if (event.type === 'response.output_text.delta') {
        text += event.delta || '';
        if (text.length > maxChars) throw fail('The reply ran too long.', 'too_long');
        onDelta(event.delta || '');
      } else if (event.type === 'response.completed') {
        return text;
      } else if (event.type === 'response.failed' || event.type === 'error') {
        const error = event.response?.error || event.error || event;
        throw this.responseError({ code: error.code, message: error.message });
      } else if (event.type === 'response.incomplete') {
        const reason = event.response?.incomplete_details?.reason || 'incomplete';
        throw fail(`ChatGPT stopped before the reply finished (${reason}).`, reason);
      }
    }
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    throw fail('The ChatGPT stream ended before the reply finished.');
  }
  responseError({ code, message, status }) {
    if (code === 'subscription_sharing_usage_limit_exceeded') {
      this.limitUntil = this.now() + LIMIT_PAUSE_MS;
      return fail(LIMIT_MESSAGE, 'usage_limit');
    }
    if (code === 'subscription_sharing_invalid_user' || status === 401) {
      return fail(
        'ChatGPT did not accept the sign-in. Sign in with ChatGPT again.',
        'signin_required',
      );
    }
    return fail(
      ERRORS[code] || `ChatGPT returned an error (${code || 'unknown'}). ${message || ''}`.trim(),
      code,
    );
  }

  // Ends the renewable session at OpenAI, then forgets the tokens. The client ID
  // and host ID stay, so the next sign-in reuses this registration.
  async logout() {
    const { refresh_token: token, client_id: clientId } = this.record;
    let revoked = !token;
    if (token) {
      try {
        const config = await this.json(`${this.authBase}/.well-known/openid-configuration`);
        const response = await this.fetch(config.revocation_endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token,
            token_type_hint: 'refresh_token',
            client_id: clientId,
          }),
        });
        revoked = response.ok;
      } catch {}
    }
    for (const key of [
      'access_token',
      'refresh_token',
      'id_token',
      'expires_at',
      'expires_in',
      'scopes',
    ]) {
      delete this.record[key];
    }
    this.model = null;
    this.models = null;
    await this.save();
    return { revoked };
  }
  close() {
    this.endLogin();
  }
}

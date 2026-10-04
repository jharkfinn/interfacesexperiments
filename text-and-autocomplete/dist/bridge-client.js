// Talks to scripts/bridge.mjs, which runs requests on the user's Claude or ChatGPT
// plan. It has the same interface as RealtimeCompose, so the editor works the same
// with either. The page sends an operation and document text; the bridge builds
// the prompt, so this page cannot make the bridge run anything else.
export class BridgeCompose {
  constructor(
    onStatus,
    { token, fetchImpl = (...args) => globalThis.fetch(...args), diagnose = () => {} } = {},
  ) {
    this.onStatus = onStatus;
    this.token = token;
    this.fetch = fetchImpl;
    this.diagnose = (event, data) => {
      try {
        diagnose(event, data);
      } catch {}
    };
    this.ready = false;
    this.pending = null;
    this.session = null;
  }
  async post(path, body = {}, signal = undefined) {
    let response;
    try {
      response = await this.fetch(path, {
        method: 'POST',
        signal,
        cache: 'no-store',
        credentials: 'omit',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw Object.assign(new Error('The bridge is not running. Start it and open its new link.'), {
        code: 'bridge_offline',
      });
    }
    // A static server answers these for any path: this page was not opened by the bridge.
    if ([404, 405, 501].includes(response.status) && path === 'api/session') {
      throw Object.assign(new Error('This page is not served by the bridge.'), {
        code: 'not_bridge',
      });
    }
    if (response.status === 401) {
      throw Object.assign(
        new Error('This tab is not paired with the running bridge. Open the link it printed.'),
        { code: 'bridge_unpaired' },
      );
    }
    if (!response.ok) {
      let message = '';
      try {
        message = (await response.json()).error;
      } catch {}
      throw new Error(message || `The bridge returned an error (${response.status}).`);
    }
    return response;
  }
  async describe(signal = undefined) {
    this.session = await (await this.post('api/session', {}, signal)).json();
    return this.session;
  }
  async login({ newAccount = false } = {}) {
    return (await this.post('api/login', { newAccount })).json();
  }
  async connect() {
    this.cancel();
    this.onStatus('connecting');
    // Same limit as RealtimeCompose: a stalled sign-in check must not hang the dialog.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const session = await this.describe(controller.signal).catch(error => {
        throw error.name === 'AbortError' ? new Error('Connection timed out. Try again.') : error;
      });
      if (!session.ready) {
        throw new Error(
          session.problem ||
            (session.provider === 'chatgpt'
              ? 'Continue with ChatGPT and allow plan usage first.'
              : 'The bridge is not ready.'),
        );
      }
      this.ready = true;
      this.onStatus('ready');
    } catch (error) {
      this.ready = false;
      this.onStatus('error', error.message);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  request(context, onProgress = () => {}, attempt = null, options = {}) {
    return this.send(
      {
        op: 'complete',
        before: context.before,
        after: context.after,
        alternatives: Boolean(options.alternatives),
        paragraphs: Boolean(options.paragraphs),
      },
      onProgress,
      options.paragraphs ? 20000 : 10000,
      attempt,
    );
  }
  rewrite(context, ratio, onProgress = () => {}, revision = null, rephrase = null) {
    return this.send(
      {
        op: 'rewrite',
        before: context.before,
        selected: context.selected,
        after: context.after,
        ratio,
        revision,
        rephrase,
      },
      onProgress,
      20000,
    );
  }
  combine(context) {
    return this.send(
      {
        op: 'combine',
        before: context.before,
        target: context.target,
        after: context.after,
        dragged: context.dragged,
      },
      () => {},
      20000,
    );
  }
  // Divides the document into pieces for a view: {purpose, paragraphs}.
  segment(context) {
    return this.send(
      { op: 'segment', purpose: context.purpose, paragraphs: context.paragraphs },
      () => {},
      30000,
    );
  }
  send(body, onProgress, timeout, attempt = null) {
    this.cancel();
    if (!this.ready) return Promise.reject(new Error('Connect first.'));
    const controller = new AbortController();
    const pending = { controller, attempt, superseded: false, timedOut: false };
    this.pending = pending;
    this.diagnose('transport-request', { attempt, timeout, operation: body.op });
    const timer = setTimeout(() => {
      pending.timedOut = true;
      controller.abort();
    }, timeout);
    const current = () => this.pending === pending;
    return (async () => {
      try {
        const response = await this.post('api/run', body, controller.signal);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let text = '';
        for (;;) {
          const { value, done } = await reader.read();
          // A newer request replaced this one; stop reading its stream.
          if (pending.superseded) {
            reader.cancel().catch(() => {});
            throw new DOMException('Superseded', 'AbortError');
          }
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === 'delta') {
              text += event.delta;
              if (current()) onProgress(text, false);
            } else if (event.type === 'done') {
              this.diagnose('transport-response-done', { attempt, chars: event.text.length });
              if (current()) onProgress(event.text, true);
              return event.text;
            } else if (event.type === 'error') {
              throw Object.assign(new Error(event.message), { code: event.code });
            }
          }
        }
        throw new Error('The bridge closed the request before it finished.');
      } catch (error) {
        if (pending.superseded) throw new DOMException('Superseded', 'AbortError');
        if (pending.timedOut) throw new Error('Writing request timed out. Try again.');
        this.diagnose('transport-failed', { attempt, code: error.code || null });
        // Lost pairing or sign-in ends the connection, so the dialog comes back.
        if (
          ['bridge_offline', 'bridge_unpaired', 'signin_required', 'not_eligible'].includes(
            error.code,
          )
        ) {
          this.ready = false;
          this.onStatus('error', error.message);
        }
        throw error;
      } finally {
        clearTimeout(timer);
        if (current()) this.pending = null;
      }
    })();
  }
  cancel() {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    pending.superseded = true;
    this.diagnose('transport-cancelled', { attempt: pending.attempt });
    pending.controller.abort();
  }
  disconnect() {
    this.cancel();
    this.ready = false;
    this.onStatus('disconnected');
  }
}

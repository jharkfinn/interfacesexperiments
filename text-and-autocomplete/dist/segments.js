import { parseSegments, remap } from './segment-core.js?v=da80b70b8354';

// Claude's division of the document for each purpose a view declares. A
// division is kept as pieces of sentence text, so it follows its sentences
// through moves and edits. When the text changes, Claude divides it again once
// typing has stopped for a while and the connection is free. Divisions are
// saved by document text, in memory and in this browser, so the same text is
// never sent twice.

const SAVED_KEY = 'text-and-autocomplete.segments';
const SAVED_LIMIT = 30;
const IDLE_MS = 2500;
const RETRY_MS = 1500;

// A short key for a purpose and a document's text, for the saved divisions.
export function divisionKey(purpose, paragraphs) {
  const text = [purpose, ...paragraphs.map(p => `${p.kind}\u0001${p.sentences.join('\u0002')}`)];
  let hash = 0x811c9dc5;
  let second = 0;
  for (const char of text.join('\u0003')) {
    const code = char.codePointAt(0);
    hash = Math.imul(hash ^ code, 0x01000193) >>> 0;
    second = (Math.imul(second, 31) + code) >>> 0;
  }
  return `${hash.toString(36)}.${second.toString(36)}.${text.join('').length}`;
}

export class Segments {
  // `client` asks Claude; `ready()` says whether the editor is connected;
  // `shared` says the client also serves autocomplete, so a division waits
  // until it is free.
  constructor({ model, client, ready, shared, storage = null, diagnose = () => {} }) {
    Object.assign(this, { model, client, ready, shared, storage, diagnose });
    this.states = new Map();
    this.listeners = new Map();
    this.saved = new Map(this.load());
    model.on(() => {
      for (const purpose of this.listeners.keys()) this.check(purpose);
    });
  }
  load() {
    try {
      const entries = JSON.parse(this.storage?.getItem(SAVED_KEY) || '[]');
      return Array.isArray(entries) ? entries.filter(entry => Array.isArray(entry)) : [];
    } catch {
      return [];
    }
  }
  remember(key, division) {
    this.saved.delete(key);
    this.saved.set(key, division);
    while (this.saved.size > SAVED_LIMIT) this.saved.delete(this.saved.keys().next().value);
    try {
      this.storage?.setItem(SAVED_KEY, JSON.stringify([...this.saved]));
    } catch {}
  }
  state(purpose) {
    if (!this.states.has(purpose)) {
      this.states.set(purpose, {
        division: null,
        key: null,
        status: 'waiting',
        timer: 0,
        asking: null,
      });
    }
    return this.states.get(purpose);
  }
  // A view listens while it shows Claude's pieces for a purpose.
  watch(purpose, listener) {
    if (!this.listeners.has(purpose)) this.listeners.set(purpose, new Set());
    this.listeners.get(purpose).add(listener);
    this.check(purpose, 0);
    return () => {
      const set = this.listeners.get(purpose);
      set?.delete(listener);
      if (set && !set.size) {
        this.listeners.delete(purpose);
        clearTimeout(this.state(purpose).timer);
      }
    };
  }
  notify(purpose) {
    for (const listener of [...(this.listeners.get(purpose) || [])]) listener();
  }
  // Connecting, or losing the connection, changes what every view can show.
  connectionChanged() {
    for (const purpose of this.listeners.keys()) {
      const state = this.state(purpose);
      if (this.ready() && state.status === 'offline') {
        state.status = state.division ? 'updating' : 'waiting';
      }
      this.notify(purpose);
      this.check(purpose, 0);
    }
  }
  // The pieces for a purpose now, with what the division's status is:
  //   ready     Claude divided this text
  //   updating  Claude's pieces, carried over edits, until a new division comes
  //   waiting   no division yet; paragraphs stand in
  //   offline   not connected; paragraphs stand in
  //   failed    the last request failed; the last pieces stand in
  view(purpose) {
    const state = this.state(purpose);
    const paragraphs = this.model.paragraphs();
    const key = divisionKey(purpose, paragraphs);
    const saved = this.saved.get(key);
    if (saved && state.key !== key) {
      state.division = saved;
      state.key = key;
      if (state.status !== 'failed') state.status = 'ready';
    }
    const carried = remap(state.division, paragraphs);
    const runs =
      carried ||
      paragraphs.map((paragraph, index) => {
        const first =
          paragraphs.slice(0, index).reduce((sum, p) => sum + p.sentences.length, 0) + 1;
        return { first, last: first + paragraph.sentences.length - 1, label: '' };
      });
    let status = state.status;
    if (!this.ready()) status = carried ? (state.key === key ? 'ready' : 'updating') : 'offline';
    else if (state.key !== key && carried && status === 'ready') status = 'updating';
    return { pieces: this.model.runs(runs), status, message: state.message || '' };
  }
  // Schedules a division when the text differs from the last one.
  check(purpose, delay = IDLE_MS) {
    if (!this.listeners.has(purpose)) return;
    const state = this.state(purpose);
    const key = divisionKey(purpose, this.model.paragraphs());
    if (state.key === key || this.saved.has(key)) {
      if (this.saved.has(key) && state.key !== key) this.notify(purpose);
      return;
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this.ask(purpose), delay);
  }
  async ask(purpose) {
    const state = this.state(purpose);
    if (!this.listeners.has(purpose) || state.asking) return;
    const paragraphs = this.model.paragraphs();
    const key = divisionKey(purpose, paragraphs);
    if (state.key === key) return;
    if (this.saved.has(key)) {
      this.notify(purpose);
      return;
    }
    if (!paragraphs.length) {
      state.division = { pieces: [] };
      state.key = key;
      state.status = 'ready';
      this.notify(purpose);
      return;
    }
    if (!this.ready()) {
      state.status = 'offline';
      this.notify(purpose);
      return;
    }
    // Autocomplete and the views' own requests come first on a shared client.
    if (this.shared && this.client.pending) {
      state.timer = setTimeout(() => this.ask(purpose), RETRY_MS);
      return;
    }
    if (!this.client.ready) {
      try {
        await this.client.connect();
      } catch {
        state.status = 'offline';
        this.notify(purpose);
        return;
      }
    }
    state.asking = key;
    if (state.status !== 'updating') state.status = state.division ? 'updating' : 'waiting';
    state.message = '';
    this.notify(purpose);
    this.diagnose('segment-request', { purpose: purpose.length, paragraphs: paragraphs.length });
    try {
      const raw = await this.client.segment({ purpose, paragraphs });
      const runs = parseSegments(raw, paragraphs);
      if (!runs) throw new Error('Claude gave no pieces this view can use.');
      const sentences = paragraphs.flatMap(paragraph => paragraph.sentences);
      const division = {
        pieces: runs.map(({ first, last, label }) => ({
          label,
          sentences: sentences.slice(first - 1, last),
        })),
      };
      this.remember(key, division);
      state.division = division;
      state.key = key;
      state.status = 'ready';
    } catch (error) {
      if (error?.name === 'AbortError') {
        // Another request took the connection; try again once it is free.
        state.asking = null;
        state.timer = setTimeout(() => this.ask(purpose), RETRY_MS);
        return;
      }
      state.status = 'failed';
      state.message = error?.message || 'Claude could not divide the document.';
      state.key = key;
    } finally {
      if (state.asking === key) state.asking = null;
    }
    this.notify(purpose);
    // The text may have changed while Claude worked.
    this.check(purpose);
  }
}

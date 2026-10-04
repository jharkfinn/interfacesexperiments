import { parseSegments, parseLevels, remapLevels } from './segment-core.js?v=bc5c5daaadea';

// Claude's divisions of the document. A topic is what one division answers:
// the purpose of a view ("purpose:" and its words), or the tree of goals that
// every level view shares ("levels"). A division is kept as levels of pieces of
// sentence text, one level for a purpose, so it follows its sentences through
// moves and edits. When the text changes, Claude divides it again once typing
// has stopped for a while and the connection is free. Divisions are saved by
// topic and document text, in memory and in this browser, so the same text is
// never sent twice.

export const LEVELS = 'levels';
// The topic a view's declaration asks Claude about.
export const topicFor = spec => (spec.unit === 'level' ? LEVELS : `purpose:${spec.purpose}`);

// Asks Claude about a topic.
function request(client, topic, paragraphs) {
  if (topic === LEVELS) return client.levels({ paragraphs });
  return client.segment({ purpose: topic.slice('purpose:'.length), paragraphs });
}
// Claude's answer as levels of runs of sentences, or null.
function answer(topic, raw, paragraphs) {
  if (topic === LEVELS) return parseLevels(raw, paragraphs);
  const runs = parseSegments(raw, paragraphs);
  return runs && [runs];
}

const SAVED_KEY = 'text-and-autocomplete.segments';
const SAVED_LIMIT = 30;
const IDLE_MS = 2500;
const RETRY_MS = 1500;

// A short key for a topic and a document's text, for the saved divisions.
export function divisionKey(topic, paragraphs) {
  const text = [topic, ...paragraphs.map(p => `${p.kind}\u0001${p.sentences.join('\u0002')}`)];
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
      for (const topic of this.listeners.keys()) this.check(topic);
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
  state(topic) {
    if (!this.states.has(topic)) {
      this.states.set(topic, {
        division: null,
        key: null,
        status: 'waiting',
        timer: 0,
        asking: null,
      });
    }
    return this.states.get(topic);
  }
  // A view listens while it shows Claude's pieces for a topic.
  watch(topic, listener) {
    if (!this.listeners.has(topic)) this.listeners.set(topic, new Set());
    this.listeners.get(topic).add(listener);
    this.check(topic, 0);
    return () => {
      const set = this.listeners.get(topic);
      set?.delete(listener);
      if (set && !set.size) {
        this.listeners.delete(topic);
        clearTimeout(this.state(topic).timer);
      }
    };
  }
  notify(topic) {
    for (const listener of [...(this.listeners.get(topic) || [])]) listener();
  }
  // Connecting, or losing the connection, changes what every view can show.
  connectionChanged() {
    for (const topic of this.listeners.keys()) {
      const state = this.state(topic);
      if (this.ready() && state.status === 'offline') {
        state.status = state.division ? 'updating' : 'waiting';
      }
      this.notify(topic);
      this.check(topic, 0);
    }
  }
  // The pieces on one level of a topic's division now (0 is the top level, and
  // a level below the deepest one shows the deepest), the pieces of the level
  // above them (null on the top level), and the division's status:
  //   ready     Claude divided this text
  //   updating  Claude's pieces, carried over edits, until a new division comes
  //   waiting   no division yet; paragraphs stand in
  //   offline   not connected; paragraphs stand in
  //   failed    the last request failed; the last pieces stand in
  view(topic, level = 0) {
    const state = this.state(topic);
    const paragraphs = this.model.paragraphs();
    const key = divisionKey(topic, paragraphs);
    const saved = this.saved.get(key);
    if (saved && state.key !== key) {
      state.division = saved;
      state.key = key;
      if (state.status !== 'failed') state.status = 'ready';
    }
    const levels = remapLevels(state.division, paragraphs);
    const shown = levels ? Math.min(level, levels.length - 1) : 0;
    const carried = levels?.[shown];
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
    return {
      pieces: this.model.runs(runs),
      above: carried && shown ? this.model.runs(levels[shown - 1]) : null,
      status,
      message: state.message || '',
    };
  }
  // Schedules a division when the text differs from the last one.
  check(topic, delay = IDLE_MS) {
    if (!this.listeners.has(topic)) return;
    const state = this.state(topic);
    const key = divisionKey(topic, this.model.paragraphs());
    if (state.key === key || this.saved.has(key)) {
      if (this.saved.has(key) && state.key !== key) this.notify(topic);
      return;
    }
    clearTimeout(state.timer);
    state.timer = setTimeout(() => this.ask(topic), delay);
  }
  async ask(topic) {
    const state = this.state(topic);
    if (!this.listeners.has(topic) || state.asking) return;
    const paragraphs = this.model.paragraphs();
    const key = divisionKey(topic, paragraphs);
    if (state.key === key) return;
    if (this.saved.has(key)) {
      this.notify(topic);
      return;
    }
    if (!paragraphs.length) {
      state.division = { levels: [] };
      state.key = key;
      state.status = 'ready';
      this.notify(topic);
      return;
    }
    if (!this.ready()) {
      state.status = 'offline';
      this.notify(topic);
      return;
    }
    // Autocomplete and the views' own requests come first on a shared client.
    if (this.shared && this.client.pending) {
      state.timer = setTimeout(() => this.ask(topic), RETRY_MS);
      return;
    }
    if (!this.client.ready) {
      try {
        await this.client.connect();
      } catch {
        state.status = 'offline';
        this.notify(topic);
        return;
      }
    }
    state.asking = key;
    if (state.status !== 'updating') state.status = state.division ? 'updating' : 'waiting';
    state.message = '';
    this.notify(topic);
    this.diagnose('segment-request', {
      topic: topic === LEVELS ? 'levels' : 'purpose',
      paragraphs: paragraphs.length,
    });
    try {
      const raw = await request(this.client, topic, paragraphs);
      const levels = answer(topic, raw, paragraphs);
      if (!levels?.length) throw new Error('Claude gave no pieces this view can use.');
      const sentences = paragraphs.flatMap(paragraph => paragraph.sentences);
      const division = {
        levels: levels.map(pieces =>
          pieces.map(({ first, last, label, method }) => ({
            label,
            ...(method === undefined ? {} : { method }),
            sentences: sentences.slice(first - 1, last),
          })),
        ),
      };
      this.remember(key, division);
      state.division = division;
      state.key = key;
      state.status = 'ready';
    } catch (error) {
      if (error?.name === 'AbortError') {
        // Another request took the connection; try again once it is free.
        state.asking = null;
        state.timer = setTimeout(() => this.ask(topic), RETRY_MS);
        return;
      }
      state.status = 'failed';
      state.message = error?.message || 'Claude could not divide the document.';
      state.key = key;
    } finally {
      if (state.asking === key) state.asking = null;
    }
    this.notify(topic);
    // The text may have changed while Claude worked.
    this.check(topic);
  }
}

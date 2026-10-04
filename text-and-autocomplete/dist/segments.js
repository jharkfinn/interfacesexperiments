import { parseSegments, parseLevels, remapLevels } from './segment-core.js?v=bc5c5daaadea';
import { parseLegal, remapLegal } from './legal-core.js';

// Claude's divisions of the document. A topic is what one division answers:
// the purpose of a view ("purpose:" and its words), the tree of goals that
// every level view shares ("levels"), or the legal labels of every sentence
// that the IRAC and Sourcing views share ("legal"). A division is kept as
// levels of pieces of sentence text, one level for a purpose, or as one tag per
// sentence with the sentence's text, so it follows its sentences through moves
// and edits. When the text changes, Claude divides it again once typing
// has stopped for a while and the connection is free. Divisions are saved by
// topic and document text, in memory and in this browser, so the same text is
// never sent twice.

export const LEVELS = 'levels';
export const LEGAL = 'legal';
// Whether a view's declaration needs Claude to read the document.
export const usesClaude = spec =>
  ['claude', 'level', 'role'].includes(spec.unit) || spec.show === 'sources';
// The topic a view's declaration asks Claude about.
export function topicFor(spec) {
  if (spec.unit === 'level') return LEVELS;
  if (spec.unit === 'role' || spec.show === 'sources') return LEGAL;
  return `purpose:${spec.purpose}`;
}

// Asks Claude about a topic. A legal request carries the labels Claude gave
// before, for the sentences that kept them, so a small edit does not relabel
// sentences nobody touched; a guessed label is not sent back as Claude's own.
function request(client, topic, paragraphs, state) {
  if (topic === LEVELS) return client.levels({ paragraphs });
  if (topic === LEGAL) {
    const carried = remapLegal(state.division, paragraphs);
    const prior = carried?.map(tag => (tag.guess ? null : [tag.role, tag.kind]));
    return client.legal({ paragraphs, prior: prior?.some(Boolean) ? prior : null });
  }
  return client.segment({ purpose: topic.slice('purpose:'.length), paragraphs });
}
// Claude's answer as the division to store, or null: for legal labels, one tag
// per sentence; otherwise levels of pieces of sentence text.
function answer(topic, raw, paragraphs) {
  if (topic === LEGAL) return parseLegal(raw, paragraphs);
  let levels;
  if (topic === LEVELS) levels = parseLevels(raw, paragraphs);
  else {
    const runs = parseSegments(raw, paragraphs);
    levels = runs && [runs];
  }
  if (!levels?.length) return null;
  const sentences = paragraphs.flatMap(paragraph => paragraph.sentences);
  return {
    levels: levels.map(pieces =>
      pieces.map(({ first, last, label, method }) => ({
        label,
        ...(method === undefined ? {} : { method }),
        sentences: sentences.slice(first - 1, last),
      })),
    ),
  };
}

const SAVED_KEY = 'text-and-autocomplete.segments';
const SAVED_LIMIT = 30;
const RETRY_MS = 1500;
// How long typing must stop before Claude is asked again. A legal request
// sends the whole document, so it waits longer.
export const idleFor = topic => (topic === LEGAL ? 5000 : 2500);

// A short key for a topic and a document's text, for the saved divisions.
// Legal labels belong to sentences, not to their order, so the legal key is
// the same after a move and a move asks Claude nothing.
export function divisionKey(topic, paragraphs) {
  const text =
    topic === LEGAL
      ? [
          topic,
          ...paragraphs
            .flatMap(p => p.sentences.map(sentence => `${p.kind}\u0001${sentence}`))
            .sort(),
        ]
      : [topic, ...paragraphs.map(p => `${p.kind}\u0001${p.sentences.join('\u0002')}`)];
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
  // The legal labels of the sentences now, one tag per sentence in document
  // order or null, with the same status as view(), and `partial` when Claude
  // left many sentences unlabelled. The same object comes back while nothing
  // changed, so views can skip work when it is the one they last drew.
  legal() {
    const state = this.state(LEGAL);
    const { version } = this.model.read();
    const ready = this.ready();
    const memo = state.memo;
    if (
      memo &&
      memo.version === version &&
      memo.key === state.key &&
      memo.status === state.status &&
      memo.division === state.division &&
      memo.ready === ready
    ) {
      return memo.value;
    }
    const paragraphs = this.model.paragraphs();
    const key = divisionKey(LEGAL, paragraphs);
    const saved = this.saved.get(key);
    if (saved && state.key !== key) {
      state.division = saved;
      state.key = key;
      if (state.status !== 'failed') state.status = 'ready';
    }
    const tags = remapLegal(state.division, paragraphs);
    let status = state.status;
    if (!ready) status = tags ? (state.key === key ? 'ready' : 'updating') : 'offline';
    else if (state.key !== key && tags && status === 'ready') status = 'updating';
    const value = {
      tags,
      status,
      message: state.message || '',
      partial: Boolean(tags && state.division?.partial),
    };
    state.memo = {
      version,
      key: state.key,
      status: state.status,
      division: state.division,
      ready,
      value,
    };
    return value;
  }
  // Schedules a division when the text differs from the last one.
  check(topic, delay = idleFor(topic)) {
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
      state.division = topic === LEGAL ? { tags: [] } : { levels: [] };
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
    // One topic asks at a time. A new request cancels the one before it on
    // every client, so two topics asking at once would abort each other, try
    // again, and abort each other again.
    if ([...this.states.values()].some(other => other !== state && other.asking)) {
      state.timer = setTimeout(() => this.ask(topic), RETRY_MS);
      return;
    }
    state.asking = key;
    if (state.status !== 'updating') state.status = state.division ? 'updating' : 'waiting';
    state.message = '';
    this.notify(topic);
    this.diagnose('segment-request', {
      topic: topic === LEVELS || topic === LEGAL ? topic : 'purpose',
      paragraphs: paragraphs.length,
    });
    try {
      const raw = await request(this.client, topic, paragraphs, state);
      const division = answer(topic, raw, paragraphs);
      if (!division) {
        throw new Error(
          topic === LEGAL
            ? 'Claude gave no labels this view can use.'
            : 'Claude gave no pieces this view can use.',
        );
      }
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

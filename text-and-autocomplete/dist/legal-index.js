import { analyzeLegal } from './legal-analysis.js?v=4a9d365f429b';

// The legal reading of the document that the IRAC and Sourcing views share:
// Claude's labels for each sentence's job, and what the app works out itself
// from the text (sections, citations, support, checks, authorities). It is
// worked out again only when the text or Claude's labels change.
//
// Which authorities a reader has checked is a convenience for that reader, so
// it is kept in this browser only; if it is lost, an authority shows as unread.

const READ_KEY = 'text-and-autocomplete.read';
const READ_LIMIT = 200;

export class LegalIndex {
  constructor({ model, segments, storage = null }) {
    Object.assign(this, { model, segments, storage });
    this.cache = null;
    this.checked = null;
  }
  // The analysis now, with the state of Claude's labels: {...analysis, status,
  // message, partial}.
  read() {
    const { blocks, version } = this.model.read();
    const legal = this.segments.legal();
    const cache = this.cache;
    if (cache && cache.version === version && cache.legal === legal) return cache.value;
    const value = {
      ...analyzeLegal(blocks, legal.tags),
      status: legal.status,
      message: legal.message,
      partial: Boolean(legal.partial),
    };
    this.cache = { version, legal, value };
    return value;
  }
  // The authorities a reader marked as read, by key.
  readSet() {
    if (!this.checked) {
      try {
        const saved = JSON.parse(this.storage?.getItem(READ_KEY) || '[]');
        this.checked = new Set(
          Array.isArray(saved) ? saved.filter(key => typeof key === 'string') : [],
        );
      } catch {
        this.checked = new Set();
      }
    }
    return this.checked;
  }
  setRead(key, on) {
    const checked = this.readSet();
    checked.delete(key);
    if (on) checked.add(key);
    while (checked.size > READ_LIMIT) checked.delete(checked.values().next().value);
    try {
      this.storage?.setItem(READ_KEY, JSON.stringify([...checked]));
    } catch {}
  }
}

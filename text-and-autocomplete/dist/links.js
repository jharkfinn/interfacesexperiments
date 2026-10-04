// What the views point at, shared so every view can mark it in its own way.
//
//   hover    the piece under the pointer           { range, ranges?, origin }
//            (ranges: every place a hovered authority is cited)
//   focus    the chosen piece, or the caret's      { range, origin }
//   drag     a drag in progress                    { source, target, insert, origin }
//   pending  a combine waiting for its sentence    { source, target }
//   scroll   the reading position of a pane        { range, fraction, origin }
//
// Ranges are live document ranges, so a link stays on its text while edits
// elsewhere renumber the pieces. `origin` names the view that set the value, so
// that view can skip what it already shows. `flash` is an event, with no state:
// the text an operation just changed.

export const CHANNELS = ['hover', 'focus', 'drag', 'pending', 'scroll'];

const isRange = value => Boolean(value) && typeof value === 'object' && 'startContainer' in value;
const sameRange = (a, b) =>
  a === b ||
  (a &&
    b &&
    a.startContainer === b.startContainer &&
    a.startOffset === b.startOffset &&
    a.endContainer === b.endContainer &&
    a.endOffset === b.endOffset);

const sameRanges = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every((range, index) => sameRange(range, b[index]));

export function sameLink(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (isRange(x) || isRange(y)) {
      if (!sameRange(x, y)) return false;
    } else if (Array.isArray(x) || Array.isArray(y)) {
      if (!sameRanges(x, y)) return false;
    } else if (x !== y) return false;
  }
  return true;
}

export class Links {
  constructor() {
    this.state = {};
    this.listeners = new Set();
  }
  get(channel) {
    return this.state[channel] || null;
  }
  set(channel, value) {
    if (sameLink(this.state[channel] || null, value || null)) return;
    this.state[channel] = value || null;
    for (const listener of [...this.listeners]) listener(channel, this.state[channel]);
  }
  emit(channel, value) {
    for (const listener of [...this.listeners]) listener(channel, value);
  }
  clear() {
    for (const channel of CHANNELS) this.set(channel, null);
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

import { blocksOf, blockText, offsetIn, rangeIn, joiner } from './doc-model.js?v=014942255fc1';
import { removalSpan } from './combine-core.js?v=1c8f69eb2a6d';

// Every change a view asks for is planned on copies of the blocks it touches,
// then made in the editor as native edits, so the browser's own Undo holds it.
// The planned markup is checked against the result: a mismatch is undone and
// reported, never kept.

const PLAIN_BLOCK = /^(P|DIV|H[1-6])$/;

// The copies an edit made become steps: new contents for each block that
// changed, then the removal of a block the edit left empty. A document keeps
// at least one block.
export function stepsFor(editor, copies) {
  const count = blocksOf(editor).length;
  const replace = [];
  const remove = [];
  for (const [block, copy] of copies) {
    if (count > 1 && blockText(block).trim() && !blockText(copy).trim()) {
      remove.push({ block, remove: true });
    } else if (copy.innerHTML !== block.innerHTML) replace.push({ block, html: copy.innerHTML });
  }
  return [...replace, ...remove];
}

// Removing a suggestion's spacing leaves an empty style attribute on a block.
// It changes nothing, and a merged block can gain or lose it, so the check of
// an edit ignores it.
export const plainHTML = html => html.replace(/ style=""(?=[^<]*>)/g, '');

// The editor's markup once the steps are made, to check the native edits
// against. Blocks are matched by their order in the document.
export function expectedHTML(editor, steps) {
  const copy = editor.cloneNode(true);
  const blocks = blocksOf(editor);
  const copies = blocksOf(copy);
  for (const step of steps) {
    if (step.format) {
      // A block that takes another type keeps its contents.
      const old = copies[step.index];
      const block = document.createElement(step.format);
      block.append(...old.childNodes);
      old.replaceWith(block);
      copies[step.index] = block;
      continue;
    }
    const block = copies[blocks.indexOf(step.block)];
    if (!step.remove) block.innerHTML = step.html;
    else {
      const list = block.tagName === 'LI' ? block.parentElement : null;
      block.remove();
      if (list && !list.children.length) list.remove();
    }
  }
  return copy.innerHTML;
}

// A block's number once the steps are made, which can remove a block before it.
export function indexAfter(editor, block, steps) {
  const blocks = blocksOf(editor);
  const at = blocks.indexOf(block);
  return at - steps.filter(step => step.remove && blocks.indexOf(step.block) < at).length;
}

// Moving text inside paragraphs. `source` is a span in one block ({block,
// start, end}); `to` is where it goes: {block, offset, side}, where side
// 'before' puts it ahead of the text at offset, 'after' puts it behind the
// text that ends at offset, and 'into' fills an empty block. Returns the steps
// and the span the text lands on, {block, start, end}, once they are made.
export function planSpanMove(editor, model, source, to) {
  const { blocks } = model.read();
  const from = blocks[source.block];
  const into = blocks[to.block];
  if (!from || !into) return null;
  const moving = from.text.slice(source.start, source.end);
  const copies = new Map([[from.element, from.element.cloneNode(true)]]);
  if (!copies.has(into.element)) copies.set(into.element, into.element.cloneNode(true));
  const fromCopy = copies.get(from.element);
  const intoCopy = copies.get(into.element);
  const fragment = rangeIn(from.element, source.start, source.end).cloneContents();
  // A marker holds the destination while the text leaves its old place. It
  // adds no text, so the offsets found before it went in still hold.
  const marker = document.createElement('span');
  const space = joiner(moving);
  let before = '';
  let after = '';
  if (to.side === 'into') intoCopy.replaceChildren(marker);
  else {
    rangeIn(intoCopy, to.offset, to.offset).insertNode(marker);
    if (to.side === 'before') after = space;
    else before = space;
  }
  const span = removalSpan(from.text, source.start, source.end);
  rangeIn(fromCopy, span.start, span.end).deleteContents();
  const offset = offsetIn(intoCopy, marker, 0) + before.length;
  marker.replaceWith(before, fragment, after);
  for (const copy of copies.values()) copy.normalize();
  const steps = stepsFor(editor, copies);
  const block = indexAfter(editor, into.element, steps);
  return { steps, landing: { block, start: offset, end: offset + moving.length } };
}

// Moving a sentence to a gap. `gap` is {block, at}: the gap before sentence
// number `at` of that block, or after its last sentence.
export function planMove(editor, model, source, gap) {
  const { blocks } = model.read();
  const from = blocks[source.block];
  const to = blocks[gap.block];
  const sentence = from?.sentences[source.index];
  if (!sentence || !to) return null;
  const destination = !to.sentences.length
    ? { block: gap.block, offset: 0, side: 'into' }
    : gap.at < to.sentences.length
      ? { block: gap.block, offset: to.sentences[gap.at].start, side: 'before' }
      : { block: gap.block, offset: to.sentences.at(-1).end, side: 'after' };
  const span = { block: source.block, start: sentence.start, end: sentence.end };
  return planSpanMove(editor, model, span, destination);
}

const PLAIN = /^(P|DIV|H[1-6])$/;

// Moving whole blocks `first`..`last` so they come before block `before`
// (the number of blocks to put them at the end). No block is made or removed:
// the blocks from the first one that changes to the last one take new contents
// in their new order, and a block that needs another type gets it. Lists are
// not reordered this way, so a move that touches a list item is refused.
export function planBlockMove(editor, model, first, last, before) {
  const { blocks } = model.read();
  if (first < 0 || last >= blocks.length || first > last) return null;
  if (before >= first && before <= last + 1) return null;
  const order = blocks.map((_, index) => index);
  const moving = order.splice(first, last - first + 1);
  const at = before > last ? before - moving.length : before;
  order.splice(at, 0, ...moving);
  const from = Math.min(first, before);
  const to = Math.max(last, before - 1);
  const region = blocks.slice(from, to + 1);
  if (!region.every(block => PLAIN.test(block.element.tagName))) return null;
  const replace = [];
  const format = [];
  for (let index = from; index <= to; index++) {
    const target = blocks[index].element;
    const source = blocks[order[index]].element;
    if (source.innerHTML !== target.innerHTML)
      replace.push({ block: target, html: source.innerHTML });
    if (source.tagName !== target.tagName) {
      format.push({ index, format: source.tagName.toLowerCase() });
    }
  }
  const head = blocks[first];
  const tail = blocks[last];
  return {
    steps: [...replace, ...format],
    landing: {
      block: at,
      start: head.sentences[0]?.start ?? 0,
      endBlock: at + last - first,
      end: tail.sentences.at(-1)?.end ?? tail.text.length,
    },
  };
}

// Replacing `target` with `text` and removing `source`, for a combine.
export function planCombine(editor, model, source, target, text) {
  const { blocks } = model.read();
  const from = blocks[source.block];
  const into = blocks[target.block];
  if (!from || !into) return null;
  const copies = new Map([[into.element, into.element.cloneNode(true)]]);
  if (!copies.has(from.element)) copies.set(from.element, from.element.cloneNode(true));
  const intoCopy = copies.get(into.element);
  // Live ranges follow the edits, so the removal stays on the dragged sentence
  // when both sentences share a block.
  const replace = rangeIn(intoCopy, target.start, target.end);
  const removal = removalSpan(from.text, source.start, source.end);
  const remove = rangeIn(copies.get(from.element), removal.start, removal.end);
  const combined = document.createTextNode(text);
  replace.deleteContents();
  replace.insertNode(combined);
  remove.deleteContents();
  const offset = offsetIn(intoCopy, combined, 0);
  for (const copy of copies.values()) copy.normalize();
  const steps = stepsFor(editor, copies);
  const block = indexAfter(editor, into.element, steps);
  return { steps, landing: { block, start: offset, end: offset + text.length } };
}

// Removing a sentence, with the space that set it apart.
export function planRemove(editor, model, piece) {
  const block = model.read().blocks[piece.block];
  if (!block) return null;
  const copy = block.element.cloneNode(true);
  const span = removalSpan(block.text, piece.start, piece.end);
  rangeIn(copy, span.start, span.end).deleteContents();
  copy.normalize();
  const steps = stepsFor(editor, new Map([[block.element, copy]]));
  const landing = steps.some(step => step.remove)
    ? { block: Math.max(0, piece.block - 1), offset: Infinity }
    : { block: piece.block, offset: span.start };
  return { steps, landing };
}

export class DocumentEdits {
  // `run(work)` gives native edits an editor that is shown and focused, and
  // records the result as the app's valid document.
  constructor({ editor, run }) {
    this.editor = editor;
    this.run = run;
    this.applying = false;
    // Each operation is one or more native edits. These stacks say how many,
    // so one Undo takes back a whole move or combine.
    this.done = [];
    this.undone = [];
    // Any other edit (typing, a rewrite, a native undo) makes the counts stale.
    editor.addEventListener('input', () => {
      if (!this.applying) this.forget();
    });
  }
  forget() {
    this.done = [];
    this.undone = [];
  }
  has(command) {
    return (command === 'undo' ? this.done : this.undone).length > 0;
  }
  // Makes the steps; when the browser's result differs from the plan, its edits
  // are undone and this returns false.
  apply(steps) {
    if (!steps?.length) return false;
    const expected = plainHTML(expectedHTML(this.editor, steps));
    const before = this.editor.innerHTML;
    let made = 0;
    this.applying = true;
    try {
      this.run(() => {
        const selection = getSelection();
        const select = range => {
          selection.removeAllRanges();
          selection.addRange(range);
        };
        for (const step of steps) {
          const count = step.format
            ? this.formatBlock(step, select)
            : step.remove
              ? this.removeBlock(step.block, select)
              : this.replaceBlock(step, select);
          made += count;
          if (!count) break;
        }
        if (plainHTML(this.editor.innerHTML) !== expected) {
          for (; made > 0; made--) document.execCommand('undo');
        }
        selection.removeAllRanges();
      });
    } finally {
      this.applying = false;
    }
    if (made && plainHTML(this.editor.innerHTML) === expected) {
      this.done.push(made);
      this.undone = [];
      return true;
    }
    if (this.editor.innerHTML !== before) this.forget();
    return false;
  }
  // Gives the block at `index` another type, keeping its contents.
  formatBlock({ index, format }, select) {
    const block = blocksOf(this.editor)[index];
    if (!block) return 0;
    const range = document.createRange();
    range.selectNodeContents(block);
    select(range);
    return document.execCommand('formatBlock', false, format) ? 1 : 0;
  }
  replaceBlock({ block, html }, select) {
    const range = document.createRange();
    range.selectNodeContents(block);
    select(range);
    return document.execCommand('insertHTML', false, html) ? 1 : 0;
  }
  // Deleting from the end of the block before takes a block with it. The first
  // block has none before it, so it merges into the next block instead, taking
  // that block's type first so the merge keeps it.
  removeBlock(block, select) {
    const blocks = blocksOf(this.editor);
    const at = blocks.indexOf(block);
    const range = document.createRange();
    if (at > 0) {
      const previous = blocks[at - 1];
      range.setStart(previous, previous.childNodes.length);
      range.setEnd(block, block.childNodes.length);
      select(range);
      return document.execCommand('insertHTML', false, '') ? 1 : 0;
    }
    const next = blocks[1];
    let made = 0;
    if (
      next.tagName !== block.tagName &&
      PLAIN_BLOCK.test(block.tagName) &&
      PLAIN_BLOCK.test(next.tagName)
    ) {
      range.selectNodeContents(block);
      select(range);
      if (!document.execCommand('formatBlock', false, next.tagName.toLowerCase())) return 0;
      made++;
      block = blocksOf(this.editor)[0];
    }
    const only = block.tagName === 'LI' && block.parentElement.children.length === 1;
    range.setStartBefore(only ? block.parentElement : block);
    range.setEnd(next, 0);
    select(range);
    return document.execCommand('delete') ? made + 1 : made;
  }
  // Undoes or redoes a whole operation while its count is on record, else one
  // native step. Returns whether the document changed.
  history(command) {
    const from = command === 'undo' ? this.done : this.undone;
    const to = command === 'undo' ? this.undone : this.done;
    const count = from.pop() || 1;
    const before = this.editor.innerHTML;
    // From the editor, the caret stays there, at the end of what changed.
    const typing = document.activeElement === this.editor;
    this.applying = true;
    try {
      this.run(() => {
        for (let i = 0; i < count; i++) document.execCommand(command);
        const selection = getSelection();
        if (typing && selection.rangeCount) selection.collapseToEnd();
        else selection.removeAllRanges();
      });
    } finally {
      this.applying = false;
    }
    const changed = this.editor.innerHTML !== before;
    if (changed) to.push(count);
    else this.forget();
    return changed;
  }
}

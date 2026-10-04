import { blocksOf, blockText, offsetIn, rangeIn, joiner } from './doc-model.js?v=7ef16fd28f8c';
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

// Moving a sentence to a gap. `gap` is {block, at}: the gap before sentence
// number `at` of that block, or after its last sentence. Returns the steps and
// where the sentence lands: {block, offset} once the steps are made.
export function planMove(editor, model, source, gap) {
  const { blocks } = model.read();
  const from = blocks[source.block];
  const to = blocks[gap.block];
  const sentence = from?.sentences[source.index];
  if (!sentence || !to) return null;
  const copies = new Map([[from.element, from.element.cloneNode(true)]]);
  if (!copies.has(to.element)) copies.set(to.element, to.element.cloneNode(true));
  const fromCopy = copies.get(from.element);
  const toCopy = copies.get(to.element);
  const fragment = rangeIn(from.element, sentence.start, sentence.end).cloneContents();
  // A marker holds the destination while the sentence leaves its old place.
  // It adds no text, so the offsets found before it went in still hold.
  const marker = document.createElement('span');
  const space = joiner(sentence.text);
  let before = '';
  let after = '';
  if (!to.sentences.length) {
    toCopy.replaceChildren(marker);
  } else if (gap.at < to.sentences.length) {
    const next = to.sentences[gap.at].start;
    rangeIn(toCopy, next, next).insertNode(marker);
    after = space;
  } else {
    const end = to.sentences.at(-1).end;
    rangeIn(toCopy, end, end).insertNode(marker);
    before = space;
  }
  const span = removalSpan(from.text, sentence.start, sentence.end);
  rangeIn(fromCopy, span.start, span.end).deleteContents();
  const offset = offsetIn(toCopy, marker, 0) + before.length;
  marker.replaceWith(before, fragment, after);
  for (const copy of copies.values()) copy.normalize();
  const steps = stepsFor(editor, copies);
  return { steps, landing: { block: indexAfter(editor, to.element, steps), offset } };
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
  return { steps, landing: { block: indexAfter(editor, into.element, steps), offset } };
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
          const count = step.remove
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

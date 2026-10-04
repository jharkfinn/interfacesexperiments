import { combineText, removalSpan } from './combine-core.js?v=1c8f69eb2a6d';

// The Sentences view shows the document one sentence at a time. Dragging a
// sentence onto another asks the model for one sentence that says both; dropping
// it in a gap moves it there. Each change is worked out on copies of the blocks
// it touches, then made in the editor as native edits, so Undo in either view
// steps back through the same history.

const BLOCK = /^(P|DIV|H[1-6]|LI)$/;
const LIST = /^(UL|OL)$/;
const PLAIN_BLOCK = /^(P|DIV|H[1-6])$/;
// Within this distance of a sentence's left or right edge, a drop moves the
// sentence beside it instead of combining with it.
export const EDGE_PX = 14;
const DRAG_START_PX = 4;
// A finger has to rest on a sentence this long before it drags; a quicker
// swipe scrolls the page.
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;
// Near the top or bottom of the window, a drag scrolls the page.
const SCROLL_EDGE_PX = 56;
const SCROLL_STEP_PX = 14;

// The editor's top-level blocks, with each list item as its own block.
export function blocksOf(editor) {
  const blocks = [];
  for (const child of editor.children) {
    if (LIST.test(child.tagName)) {
      blocks.push(...[...child.children].filter(item => item.tagName === 'LI'));
    } else if (BLOCK.test(child.tagName)) blocks.push(child);
  }
  return blocks;
}

// Offsets count the block's text, with a soft line break (Shift+Enter) as a
// newline so sentences on either side of it stay separate.
export function blockText(block) {
  let text = '';
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    text += node.nodeType === Node.TEXT_NODE ? node.data : node.tagName === 'BR' ? '\n' : '';
  }
  return text;
}

export function offsetIn(block, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(block);
  range.setEnd(node, offset);
  return range.toString().length + range.cloneContents().querySelectorAll('br').length;
}

export function rangeIn(block, start, end) {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const range = document.createRange();
  let seen = 0;
  let open = false;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const isBreak = node.nodeType === Node.ELEMENT_NODE;
    if (isBreak && node.tagName !== 'BR') continue;
    const length = isBreak ? 1 : node.length;
    const place = (set, at) =>
      isBreak ? range[set + (at === 0 ? 'Before' : 'After')](node) : range[set](node, at);
    if (!open && start <= seen + length && (start < seen + length || end === start)) {
      place('setStart', start - seen);
      open = true;
    }
    if (open && end <= seen + length) {
      place('setEnd', end - seen);
      return range;
    }
    seen += length;
  }
  return null;
}

// The sentences of a block's text, without the spaces between them.
export function sentencesIn(text, locale) {
  const sentences = [];
  // An empty locale (a page with no lang) is an error to Intl; undefined is the default.
  for (const { segment, index } of new Intl.Segmenter(locale || undefined, {
    granularity: 'sentence',
  }).segment(text)) {
    const body = segment.trim();
    if (!body) continue;
    const start = index + segment.length - segment.trimStart().length;
    sentences.push({ start, end: start + body.length, text: body });
  }
  return sentences;
}

// The sentence that holds a character offset. An offset between two sentences
// belongs to the one before it when `atEnd` is true, else to the one after it.
export function sentenceIndex(sentences, offset, atEnd = true) {
  if (!sentences.length) return -1;
  const found = sentences.findIndex(sentence =>
    atEnd ? offset <= sentence.end : offset < sentence.end,
  );
  return found < 0 ? sentences.length - 1 : found;
}

// The gap just before or just after a sentence leaves it where it is.
export function staysPut(source, gap) {
  return source.block === gap.block && (gap.at === source.index || gap.at === source.index + 1);
}

// Japanese and Chinese join sentences without a space. Korean, like most
// scripts, puts a space between them.
export const joiner = text => (/[぀-ヿ㐀-鿿]/u.test(text) ? '' : ' ');

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

export class SentenceView {
  constructor({ editor, root, client, contextOf, edit, onJump, notify, connect, locale }) {
    Object.assign(this, { editor, root, client, contextOf, edit, onJump, notify, connect, locale });
    this.list = root.querySelector('.sv-list');
    this.undoButton = root.querySelector('.sv-undo');
    this.redoButton = root.querySelector('.sv-redo');
    this.active = false;
    this.applying = false;
    // Each change here is one or more native edits. These stacks say how many,
    // so one Undo here takes back a whole move or combine.
    this.done = [];
    this.undone = [];
    this.pending = null;
    this.current = null;
    this.press = null;
    this.drag = null;
    this.scrolling = 0;
    this.undoButton.addEventListener('click', () => this.undo());
    this.redoButton.addEventListener('click', () => this.redo());
    // Any other edit (typing, a rewrite, a native undo) makes the counts stale.
    editor.addEventListener('input', () => {
      if (!this.applying) this.forget();
    });
    // A fast pointer can leave the list before a drag starts, so moves and
    // releases are heard on the whole document.
    this.list.addEventListener('pointerdown', event => this.pointerDown(event));
    document.addEventListener('pointermove', event => this.pointerMove(event));
    document.addEventListener('pointerup', event => this.pointerUp(event));
    document.addEventListener('pointercancel', event => {
      if (event.pointerId === this.press?.pointerId) this.endDrag();
    });
    // Taking the capture from a touched sentence also fires this, on the sentence.
    this.list.addEventListener('lostpointercapture', event => {
      if (event.target === this.list) this.endDrag();
    });
    // Once a held finger starts a drag, the page must not scroll under it.
    this.list.addEventListener(
      'touchmove',
      event => {
        if (this.drag || this.press?.armed) event.preventDefault();
      },
      { passive: false },
    );
    this.list.addEventListener('contextmenu', event => {
      if (this.drag || this.press?.armed) event.preventDefault();
    });
    window.addEventListener('blur', () => this.endDrag());
    this.list.addEventListener('click', event => {
      const chip = event.target.closest('.sv-sentence');
      if (chip) this.choose(this.position(chip));
    });
    this.list.addEventListener('dblclick', event => {
      const chip = event.target.closest('.sv-sentence');
      if (chip) this.jump(this.position(chip));
    });
    this.list.addEventListener('keydown', event => this.chipKey(event));
    document.addEventListener('keydown', event => this.documentKey(event), true);
  }
  get busy() {
    return Boolean(this.pending) || this.applying;
  }
  // `at` is a point in the document ({node, offset}); the sentence holding it is
  // chosen, so switching views keeps the reader's place.
  show(at = null, { focus = false } = {}) {
    this.active = true;
    this.root.hidden = false;
    this.current = null;
    this.render();
    const found = at && this.locate(at.node, at.offset);
    if (found) this.choose(found, { scroll: true, focus: false });
    if (focus) {
      this.list.querySelector('.sv-sentence[tabindex="0"]')?.focus({ preventScroll: true });
    }
  }
  // Returns the chosen sentence, for the Document view to show.
  hide() {
    this.cancel();
    this.endDrag();
    this.active = false;
    this.root.hidden = true;
    return this.current && this.rangeOf(this.current);
  }
  forget() {
    this.done = [];
    this.undone = [];
  }
  model() {
    return blocksOf(this.editor).map(block => {
      const text = blockText(block);
      return { block, text, sentences: sentencesIn(text, this.locale) };
    });
  }
  locate(node, offset) {
    const model = this.model();
    const block = model.findIndex(({ block }) => block === node || block.contains(node));
    if (block < 0) return null;
    const index = sentenceIndex(model[block].sentences, offsetIn(model[block].block, node, offset));
    return index < 0 ? null : { block, index };
  }
  // The sentence that starts at `offset` in block number `block`, after an edit.
  sentenceAt(block, offset) {
    const item = this.model()[block];
    const index = item ? sentenceIndex(item.sentences, offset, false) : -1;
    return index < 0 ? null : { block, index };
  }
  // A block's number once the steps are made, which can remove a block before it.
  indexAfter(block, steps) {
    const blocks = blocksOf(this.editor);
    const at = blocks.indexOf(block);
    return at - steps.filter(step => step.remove && blocks.indexOf(step.block) < at).length;
  }
  rangeOf({ block, index }) {
    const item = this.model()[block];
    const sentence = item?.sentences[index];
    return sentence ? rangeIn(item.block, sentence.start, sentence.end) : null;
  }
  position(chip) {
    return { block: Number(chip.dataset.block), index: Number(chip.dataset.index) };
  }
  chip(position) {
    return position
      ? this.list.querySelector(
          `.sv-sentence[data-block="${position.block}"][data-index="${position.index}"]`,
        )
      : null;
  }
  // The chosen sentence is the one in the tab order; arrow keys reach the rest.
  choose(position, { scroll = false, focus = scroll } = {}) {
    const chip = this.chip(position);
    this.current = chip ? position : null;
    for (const other of this.list.querySelectorAll('.sv-sentence')) {
      other.classList.toggle('sv-current', other === chip);
      other.tabIndex = -1;
    }
    (chip || this.list.querySelector('.sv-sentence'))?.setAttribute('tabindex', '0');
    if (!chip) return;
    if (scroll) {
      const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
      chip.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
    }
    if (focus) chip.focus({ preventScroll: true });
  }
  jump(position) {
    this.choose(position);
    this.onJump(position);
  }
  render() {
    const gap = (block, at) => {
      const element = document.createElement('span');
      element.className = 'sv-gap';
      element.dataset.block = block;
      element.dataset.at = at;
      element.setAttribute('aria-hidden', 'true');
      return element;
    };
    const rows = this.model().map(({ block, sentences }, b) => {
      const row = document.createElement('div');
      row.className = 'sv-block';
      row.dataset.kind = block.tagName.toLowerCase();
      row.append(gap(b, 0));
      sentences.forEach((sentence, i) => {
        const chip = document.createElement('span');
        chip.className = 'sv-sentence';
        chip.setAttribute('role', 'button');
        chip.setAttribute('aria-describedby', 'sv-keys');
        chip.dataset.block = b;
        chip.dataset.index = i;
        chip.textContent = sentence.text;
        // A gap stays on the line of the sentence before it, so every wrapped
        // line starts with a sentence.
        const unit = document.createElement('span');
        unit.className = 'sv-unit';
        unit.append(chip, gap(b, i + 1));
        row.append(unit);
      });
      if (!sentences.length) row.classList.add('sv-empty');
      return row;
    });
    this.list.replaceChildren(...rows);
    this.choose(this.current);
    this.undoButton.disabled = this.redoButton.disabled = Boolean(this.pending);
  }
  chipKey(event) {
    const chip = event.target.closest('.sv-sentence');
    if (!chip || this.pending) return;
    const position = this.position(chip);
    const chips = [...this.list.querySelectorAll('.sv-sentence')];
    const at = chips.indexOf(chip);
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.jump(position);
    } else if (step && event.altKey && event.shiftKey) {
      // Alt+Shift+Arrow combines the sentence into the one beside it.
      event.preventDefault();
      const other = chips[at + step];
      if (other) void this.combine(position, this.position(other));
    } else if (step && event.altKey) {
      // Alt+Arrow moves the sentence one place earlier or later.
      event.preventDefault();
      const gap = this.neighbourGap(position, step);
      if (gap) this.move(position, gap);
    } else if (step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next =
        event.key === 'Home' ? chips[0] : event.key === 'End' ? chips.at(-1) : chips[at + step];
      if (next) this.choose(this.position(next), { scroll: true });
    }
  }
  // The gap one sentence away, crossing into the next or previous block at an end.
  neighbourGap({ block, index }, step) {
    const model = this.model();
    if (step < 0 && index > 0) return { block, at: index - 1 };
    if (step > 0 && index < model[block].sentences.length - 1) return { block, at: index + 2 };
    const other = model[block + step];
    return other ? { block: block + step, at: step < 0 ? other.sentences.length : 0 } : null;
  }
  documentKey(event) {
    if (!this.active) return;
    if (event.key === 'Escape' && (this.drag || this.pending)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.drag) this.endDrag();
      else this.cancel(true);
      return;
    }
    const typing = event.target.closest?.('input, textarea, select, dialog, [contenteditable]');
    if (typing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    event.preventDefault();
    if (key === 'y' || event.shiftKey) this.redo();
    else this.undo();
  }

  // Dragging uses pointer events, so it works with a mouse, a pen, or a finger.
  pointerDown(event) {
    const chip = event.target.closest('.sv-sentence');
    if (!chip || event.button !== 0 || this.pending || this.drag) return;
    this.endDrag();
    const press = { x: event.clientX, y: event.clientY, chip, pointerId: event.pointerId };
    if (event.pointerType === 'touch') {
      press.touch = true;
      press.timer = setTimeout(() => {
        press.armed = true;
        chip.classList.add('sv-lifted');
      }, TOUCH_HOLD_MS);
    }
    this.press = press;
  }
  pointerMove(event) {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    if (!this.drag) {
      const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (press.touch && !press.armed) {
        // The finger moved before the hold finished: it is scrolling.
        if (moved > TOUCH_SLOP_PX) this.endDrag();
        return;
      }
      if (!press.touch && moved < DRAG_START_PX) return;
      this.startDrag(event);
    }
    this.drag.x = event.clientX;
    this.drag.y = event.clientY;
    Object.assign(this.drag.ghost.style, {
      left: `${event.clientX}px`,
      top: `${event.clientY + 14}px`,
    });
    this.setTarget(this.targetAt(event.clientX, event.clientY));
    this.autoScroll();
  }
  startDrag(event) {
    const { chip } = this.press;
    this.list.setPointerCapture(event.pointerId);
    const ghost = document.createElement('div');
    ghost.className = 'combine-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const text = chip.textContent;
    ghost.textContent = text.length > 64 ? text.slice(0, 63).trimEnd() + '…' : text;
    document.body.append(ghost);
    this.drag = { source: this.position(chip), chip, ghost, target: null };
    chip.classList.add('sv-lifted');
    this.root.classList.add('sv-dragging');
    document.documentElement.classList.add('combine-dragging');
  }
  pointerUp(event) {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    const drag = this.drag;
    if (drag) this.pointerMove(event);
    const target = drag?.target;
    this.endDrag();
    if (!drag || !target) return;
    if (target.kind === 'combine') void this.combine(drag.source, target.position);
    else this.move(drag.source, target.gap);
  }
  endDrag() {
    const press = this.press;
    this.press = null;
    if (press) {
      clearTimeout(press.timer);
      press.chip.classList.remove('sv-lifted');
    }
    cancelAnimationFrame(this.scrolling);
    this.scrolling = 0;
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    drag.ghost.remove();
    drag.target?.element?.classList.remove('sv-target');
    this.root.classList.remove('sv-dragging');
    document.documentElement.classList.remove('combine-dragging');
  }
  autoScroll() {
    if (this.scrolling) return;
    const tick = () => {
      this.scrolling = 0;
      const drag = this.drag;
      if (!drag) return;
      const step =
        drag.y < SCROLL_EDGE_PX
          ? -SCROLL_STEP_PX
          : drag.y > innerHeight - SCROLL_EDGE_PX
            ? SCROLL_STEP_PX
            : 0;
      const before = scrollY;
      if (step) scrollBy(0, step);
      if (scrollY === before) return;
      this.setTarget(this.targetAt(drag.x, drag.y));
      this.scrolling = requestAnimationFrame(tick);
    };
    this.scrolling = requestAnimationFrame(tick);
  }
  targetAt(x, y) {
    const source = this.drag.source;
    const element = document.elementFromPoint(x, y);
    const gap = element?.closest('.sv-gap');
    if (gap && this.list.contains(gap)) {
      const at = { block: Number(gap.dataset.block), at: Number(gap.dataset.at) };
      return staysPut(source, at) ? null : { kind: 'move', gap: at, element: gap };
    }
    // An empty paragraph takes a dropped sentence anywhere along its row.
    const empty = element?.closest('.sv-empty');
    if (empty && this.list.contains(empty)) {
      const gap = empty.querySelector('.sv-gap');
      return { kind: 'move', gap: { block: Number(gap.dataset.block), at: 0 }, element: gap };
    }
    const chip = element?.closest('.sv-sentence');
    if (!chip || !this.list.contains(chip) || chip === this.drag.chip) return null;
    const position = this.position(chip);
    const rect = chip.getBoundingClientRect();
    const side = x < rect.left + EDGE_PX ? 0 : x > rect.right - EDGE_PX ? 1 : null;
    if (side !== null) {
      const at = { block: position.block, at: position.index + side };
      const edge = this.list.querySelector(`.sv-gap[data-block="${at.block}"][data-at="${at.at}"]`);
      return staysPut(source, at) ? null : { kind: 'move', gap: at, element: edge };
    }
    return { kind: 'combine', position, element: chip };
  }
  setTarget(target) {
    const drag = this.drag;
    if (!drag) return;
    const previous = drag.target;
    if (previous?.element === target?.element && previous?.kind === target?.kind) return;
    previous?.element?.classList.remove('sv-target');
    drag.target = target;
    target?.element?.classList.add('sv-target');
  }

  // Makes the steps in the editor through `edit`, which shows the Document
  // view's editor for the moment native edits need it. When the browser's
  // result differs from the plan, its edits are undone and this returns false.
  apply(steps) {
    if (!steps.length) return false;
    const expected = plainHTML(expectedHTML(this.editor, steps));
    const before = this.editor.innerHTML;
    let made = 0;
    this.applying = true;
    try {
      this.edit(() => {
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
  undo() {
    if (!this.pending) this.history('undo', this.done, this.undone);
  }
  redo() {
    if (!this.pending) this.history('redo', this.undone, this.done);
  }
  // With no count on record, Undo and Redo take one native step, as they do in
  // the Document view.
  history(command, from, to) {
    const count = from.pop() || 1;
    const before = this.editor.innerHTML;
    this.applying = true;
    try {
      this.edit(() => {
        for (let i = 0; i < count; i++) document.execCommand(command);
        getSelection().removeAllRanges();
      });
    } finally {
      this.applying = false;
    }
    if (this.editor.innerHTML === before) {
      this.forget();
      this.notify(command === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.');
    } else {
      to.push(count);
      this.notify(command === 'undo' ? 'Undone.' : 'Redone.');
    }
    this.render();
  }

  move(source, gap) {
    if (this.pending || staysPut(source, gap)) return;
    const model = this.model();
    const from = model[source.block];
    const to = model[gap.block];
    const sentence = from?.sentences[source.index];
    if (!sentence || !to) return;
    const copies = new Map([[from.block, from.block.cloneNode(true)]]);
    if (!copies.has(to.block)) copies.set(to.block, to.block.cloneNode(true));
    const fromCopy = copies.get(from.block);
    const toCopy = copies.get(to.block);
    const fragment = rangeIn(from.block, sentence.start, sentence.end).cloneContents();
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
    const start = offsetIn(toCopy, marker, 0) + before.length;
    marker.replaceWith(before, fragment, after);
    for (const copy of copies.values()) copy.normalize();
    const steps = stepsFor(this.editor, copies);
    const block = this.indexAfter(to.block, steps);
    if (!this.apply(steps)) {
      this.render();
      this.notify('Could not move that sentence there. The document is unchanged.');
      return;
    }
    this.finish(this.sentenceAt(block, start), 'Moved. Undo to put it back.');
  }
  async combine(source, target) {
    if (this.pending) return;
    if (!this.client.ready) {
      this.connect();
      return;
    }
    const model = this.model();
    const from = model[source.block];
    const into = model[target.block];
    const dragged = from?.sentences[source.index];
    const receiver = into?.sentences[target.index];
    if (!dragged || !receiver) return;
    const html = this.editor.innerHTML;
    const around = this.contextOf(rangeIn(into.block, receiver.start, receiver.end));
    const request = {
      before: around.before,
      target: receiver.text,
      after: around.after,
      dragged: dragged.text,
    };
    const pending = {};
    this.pending = pending;
    this.choose(target);
    this.chip(source)?.classList.add('sv-leaving');
    this.chip(target)?.classList.add('sv-pending');
    this.undoButton.disabled = this.redoButton.disabled = true;
    this.notify('Combining…');
    let text;
    try {
      text = combineText(await this.client.combine(request), request);
    } catch (error) {
      // A cancelled combine has already said so.
      if (this.pending !== pending) return;
      this.pending = null;
      this.render();
      this.notify(
        error.name === 'AbortError'
          ? 'Combine cancelled. Original text kept.'
          : `${error.message} Original text kept.`,
      );
      return;
    }
    if (this.pending !== pending) return;
    this.pending = null;
    const problem = !text
      ? 'No combined sentence came back. Try again.'
      : this.editor.innerHTML !== html
        ? 'The document changed.'
        : '';
    if (problem) {
      this.render();
      this.notify(`${problem} Original text kept.`);
      return;
    }
    const copies = new Map([[into.block, into.block.cloneNode(true)]]);
    if (!copies.has(from.block)) copies.set(from.block, from.block.cloneNode(true));
    const intoCopy = copies.get(into.block);
    // Live ranges follow the edits, so the removal stays on the dragged
    // sentence when both sentences share a block.
    const replace = rangeIn(intoCopy, receiver.start, receiver.end);
    const removal = removalSpan(from.text, dragged.start, dragged.end);
    const remove = rangeIn(copies.get(from.block), removal.start, removal.end);
    const combined = document.createTextNode(text);
    replace.deleteContents();
    replace.insertNode(combined);
    remove.deleteContents();
    const start = offsetIn(intoCopy, combined, 0);
    for (const copy of copies.values()) copy.normalize();
    const steps = stepsFor(this.editor, copies);
    const block = this.indexAfter(into.block, steps);
    if (!this.apply(steps)) {
      this.render();
      this.notify('Could not apply the combined sentence. Original text kept.');
      return;
    }
    this.finish(this.sentenceAt(block, start), 'Combined into one sentence. Undo to restore.');
  }
  finish(position, message) {
    this.current = position;
    this.render();
    this.choose(position, { scroll: true });
    const chip = this.chip(position);
    if (chip) {
      chip.classList.add('sv-new');
      setTimeout(() => chip.classList.remove('sv-new'), 1200);
    }
    this.notify(message);
  }
  cancel(announce = false) {
    if (!this.pending) return;
    this.pending = null;
    this.client.cancel();
    if (this.active) this.render();
    if (announce) this.notify('Combine cancelled. Original text kept.');
  }
}

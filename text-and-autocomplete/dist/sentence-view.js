import { combineText, removalSpan } from './combine-core.js?v=1c8f69eb2a6d';
import { DocumentMarks } from './document-marks.js?v=927a85939e84';

// The Sentences view shows the document one sentence at a time. Dragging a
// sentence onto another asks the model for one sentence that says both; dropping
// it in a gap moves it there. Each change is worked out on copies of the blocks
// it touches, then made in the editor as native edits, so Undo in either view
// steps back through the same history.
//
// Next to the Document view, the two are linked: a sentence under the pointer
// or the caret in one view is marked in the other, the list follows edits as
// they are typed, and the list scrolls with the document.

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
// Near the top or bottom of what scrolls, a drag scrolls it.
const SCROLL_EDGE_PX = 56;
const SCROLL_STEP_PX = 14;
// The document's reading line: the sentence here lines up with the top of the list.
const READING_LINE_PX = 24;

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

// The list is split again on every edit, so each locale keeps one segmenter.
const segmenters = new Map();
function segmenter(locale) {
  const key = locale || '';
  if (!segmenters.has(key)) {
    // An empty locale (a page with no lang) is an error to Intl; undefined is the default.
    segmenters.set(key, new Intl.Segmenter(locale || undefined, { granularity: 'sentence' }));
  }
  return segmenters.get(key);
}

// The sentences of a block's text, without the spaces between them.
export function sentencesIn(text, locale) {
  const sentences = [];
  for (const { segment, index } of segmenter(locale).segment(text)) {
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

export const samePosition = (a, b) => a?.block === b?.block && a?.index === b?.index;

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

// How far to scroll so a span from `top` to `bottom` sits inside `start`..`end`
// with `margin` to spare; 0 when it already does. A span taller than the room
// lines up with the start.
export function scrollToShow(top, bottom, start, end, margin) {
  if (top < start + margin || bottom - top > end - start - 2 * margin) return top - start - margin;
  if (bottom > end - margin) return bottom - end + margin;
  return 0;
}

export class SentenceView {
  constructor({
    editor,
    root,
    client,
    contextOf,
    edit,
    interrupt,
    onJump,
    flash,
    notify,
    connect,
    locale,
  }) {
    Object.assign(this, {
      editor,
      root,
      client,
      contextOf,
      edit,
      interrupt,
      onJump,
      flash,
      notify,
      connect,
      locale,
    });
    this.list = root.querySelector('.sv-list');
    this.header = root.querySelector('.sv-header');
    this.undoButton = root.querySelector('.sv-undo');
    this.redoButton = root.querySelector('.sv-redo');
    this.marks = new DocumentMarks(editor);
    this.active = false;
    this.applying = false;
    // Each change here is one or more native edits. These stacks say how many,
    // so one Undo takes back a whole move or combine.
    this.done = [];
    this.undone = [];
    this.pending = null;
    // The chosen sentence, and the view it was chosen in. The other view marks it.
    this.current = null;
    this.currentFrom = null;
    // The sentence under the pointer, in either view.
    this.hover = null;
    this.hoverFrom = null;
    this.press = null;
    this.drag = null;
    this.scrolling = 0;
    this.frames = {};
    this.undoButton.addEventListener('click', () => this.undo());
    this.redoButton.addEventListener('click', () => this.redo());
    // Any other edit (typing, a rewrite, a native undo) makes the counts stale.
    editor.addEventListener('input', () => {
      if (!this.applying) this.forget();
    });
    // The list follows every change to the document, however it was made.
    this.observer = new MutationObserver(() => this.documentChanged());
    this.observer.observe(editor, { childList: true, characterData: true, subtree: true });
    document.addEventListener('selectionchange', () => this.follow());
    editor.addEventListener('mousemove', event => {
      this.pointer = { x: event.clientX, y: event.clientY, buttons: event.buttons };
      this.frame('hover', () => this.hoverDocument());
    });
    editor.addEventListener('mouseleave', () => {
      if (this.hoverFrom === 'document') this.setHover(null);
    });
    editor.addEventListener('keydown', () => {
      if (this.hoverFrom === 'document') this.setHover(null);
    });
    this.list.addEventListener('pointerover', event => {
      if (this.press || this.drag) return;
      const chip = event.target.closest('.sv-sentence');
      this.setHover(chip && this.position(chip), 'sentences');
    });
    this.list.addEventListener('pointerleave', () => {
      if (this.hoverFrom === 'sentences') this.setHover(null);
    });
    addEventListener('scroll', () => this.frame('scroll', () => this.syncScroll()), {
      passive: true,
    });
    addEventListener('resize', () =>
      this.frame('resize', () => {
        this.paintMarks();
        this.syncScroll();
      }),
    );
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
    addEventListener('blur', () => this.endDrag());
    this.list.addEventListener('click', event => {
      const chip = event.target.closest('.sv-sentence');
      if (chip) this.choose(this.position(chip), { reveal: true });
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
  // Runs `work` once in the next animation frame, however often it is asked for.
  frame(name, work) {
    if (this.frames[name]) return;
    this.frames[name] = requestAnimationFrame(() => {
      this.frames[name] = 0;
      work();
    });
  }
  documentShown() {
    return this.editor.getClientRects().length > 0;
  }
  // `at` is a point in the document ({node, offset}); the sentence holding it is
  // chosen, so the view opens at the reader's place.
  show(at = null, { focus = false } = {}) {
    this.active = true;
    this.root.hidden = false;
    this.current = null;
    this.render();
    this.syncScroll();
    const found = at && this.locate(at.node, at.offset);
    if (found) this.choose(found, { from: 'document', scroll: true, focus: false });
    if (focus) {
      this.list.querySelector('.sv-sentence[tabindex="0"]')?.focus({ preventScroll: true });
    }
  }
  hide() {
    this.cancel();
    this.endDrag();
    this.active = false;
    this.root.hidden = true;
    this.hover = this.hoverFrom = null;
    this.marks.clear();
  }
  // The chosen sentence as a range in the document.
  chosenRange() {
    return this.current && this.rangeOf(this.current);
  }
  // The other layout's panes moved or resized.
  relayout() {
    this.paintMarks();
    this.syncScroll();
  }
  forget() {
    this.done = [];
    this.undone = [];
  }
  has(command) {
    return (command === 'undo' ? this.done : this.undone).length > 0;
  }
  documentChanged() {
    if (!this.active || this.applying) return;
    // Typing moves text under a mark that came from the pointer.
    if (this.hoverFrom === 'document') this.hover = this.hoverFrom = null;
    this.frame('render', () => {
      if (this.active && !this.applying && !this.drag) this.render();
    });
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
  rangeOf(position) {
    const item = position && this.model()[position.block];
    const sentence = item?.sentences[position.index];
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
  // `scroll` shows it in the list and `reveal` shows it in the document.
  choose(
    position,
    {
      from = 'sentences',
      scroll = false,
      focus = scroll && from === 'sentences',
      reveal = false,
    } = {},
  ) {
    const chip = this.chip(position);
    this.current = chip ? position : null;
    this.currentFrom = chip ? from : null;
    for (const other of this.list.querySelectorAll('.sv-sentence')) {
      other.classList.toggle('sv-current', other === chip);
      other.tabIndex = -1;
    }
    (chip || this.list.querySelector('.sv-sentence'))?.setAttribute('tabindex', '0');
    this.paintMarks();
    if (!chip) return;
    if (scroll) this.showChip(chip);
    if (focus) chip.focus({ preventScroll: true });
    if (reveal) this.revealInDocument(this.rangeOf(position));
  }
  jump(position) {
    this.choose(position);
    this.onJump(position);
  }
  // The caret's sentence is chosen as the caret moves in the document.
  follow() {
    if (!this.active || this.applying || this.drag || this.pending) return;
    if (document.activeElement !== this.editor) return;
    const selection = getSelection();
    if (!selection.rangeCount || !this.editor.contains(selection.focusNode)) return;
    const position = this.locate(selection.focusNode, selection.focusOffset);
    if (samePosition(position, this.current) && this.currentFrom === 'document') return;
    this.choose(position, { from: 'document', scroll: true });
  }
  setHover(position, from = null) {
    if (samePosition(position, this.hover) && (!position || from === this.hoverFrom)) return;
    this.hover = position;
    this.hoverFrom = position ? from : null;
    for (const chip of this.list.querySelectorAll('.sv-hover')) chip.classList.remove('sv-hover');
    if (from === 'document') this.chip(position)?.classList.add('sv-hover');
    this.paintMarks();
  }
  // The sentence under the pointer in the document, when the pointer is on its text.
  hoverDocument() {
    const pointer = this.pointer;
    if (!this.active || this.drag || this.pending || !pointer || pointer.buttons) return;
    const { x, y } = pointer;
    let node = null;
    let offset = 0;
    const caret = document.caretPositionFromPoint?.(x, y);
    if (caret) ({ offsetNode: node, offset } = caret);
    else {
      const range = document.caretRangeFromPoint?.(x, y);
      if (range) ({ startContainer: node, startOffset: offset } = range);
    }
    let position = node && this.editor.contains(node) ? this.locate(node, offset) : null;
    // The nearest caret can sit past the end of a line, away from the pointer.
    const on = rect =>
      x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2;
    if (position && ![...(this.rangeOf(position)?.getClientRects() || [])].some(on)) {
      position = null;
    }
    this.setHover(position, 'document');
  }
  // Marks in the document show what the list is pointing at: the hovered and
  // the chosen sentence, and during a drag or a combine, the sentence that
  // moves and where it goes.
  paintMarks() {
    if (!this.active || !this.documentShown()) {
      this.marks.clear();
      return;
    }
    const drag = this.drag;
    const pending = this.pending;
    const target = drag?.target;
    this.marks.set(
      'current',
      this.currentFrom === 'sentences' && !drag && !pending ? this.rangeOf(this.current) : null,
    );
    this.marks.set('hover', drag || pending ? null : this.rangeOf(this.hover));
    this.marks.set('source', this.rangeOf(drag?.source || pending?.source));
    this.marks.set(
      'target',
      this.rangeOf(target?.kind === 'combine' ? target.position : pending?.target),
    );
    this.marks.set('insert', target?.kind === 'move' ? this.insertion(target.gap) : null);
    this.marks.layer('target').classList.toggle('doc-mark-pending', Boolean(pending));
  }
  // Where a sentence dropped in `gap` would go in the document.
  insertion(gap) {
    const item = this.model()[gap.block];
    if (!item) return null;
    if (!item.sentences.length) {
      const rect = item.block.getBoundingClientRect();
      return [new DOMRect(rect.left, rect.top, 2, rect.height)];
    }
    const at =
      gap.at < item.sentences.length ? item.sentences[gap.at].start : item.sentences.at(-1).end;
    return rangeIn(item.block, at, at);
  }
  // Beside the document, the list scrolls inside its own pane; on its own, the
  // page scrolls.
  pane() {
    const pane = this.root;
    const overflow = getComputedStyle(pane).overflowY;
    return (overflow === 'auto' || overflow === 'scroll') && pane.scrollHeight > pane.clientHeight
      ? pane
      : null;
  }
  // Pane scroll offsets are in the pane's own pixels, which differ from viewport
  // pixels when the page is zoomed.
  paneScale(pane) {
    return pane.offsetHeight ? pane.getBoundingClientRect().height / pane.offsetHeight : 1;
  }
  showChip(chip) {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pane = this.pane();
    if (!pane) {
      chip.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    const box = pane.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    const top = box.top + (this.header?.getBoundingClientRect().height || 0);
    const by = scrollToShow(rect.top, rect.bottom, top, box.bottom, 12);
    if (by) pane.scrollBy({ top: by / this.paneScale(pane), behavior: smooth ? 'smooth' : 'auto' });
  }
  revealInDocument(range) {
    if (!range || !this.documentShown()) return;
    const rect = range.getBoundingClientRect();
    // A list docked along the bottom of a narrow window covers the document there.
    const docked = getComputedStyle(this.root).bottom === '0px';
    const end = docked ? Math.min(innerHeight, this.root.getBoundingClientRect().top) : innerHeight;
    const by = scrollToShow(rect.top, rect.bottom, 0, end, Math.min(80, end / 6));
    if (!by) return;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollBy({ top: by, behavior: smooth ? 'smooth' : 'auto' });
  }
  // Beside the document, the list scrolls with it: the block at the document's
  // reading line lines up with the top of the list, at the same point within it.
  // While the reader is in the list, it stays where they put it.
  syncScroll() {
    const pane = this.pane();
    if (!pane || !this.active || this.drag || !this.documentShown()) return;
    if (pane.contains(document.activeElement) || pane.matches(':hover')) return;
    const blocks = blocksOf(this.editor);
    const rows = this.list.querySelectorAll('.sv-block');
    if (!blocks.length || rows.length !== blocks.length) return;
    const line = READING_LINE_PX;
    let at = blocks.findIndex(block => block.getBoundingClientRect().bottom > line);
    if (at < 0) at = blocks.length - 1;
    const rect = blocks[at].getBoundingClientRect();
    if (at === 0 && rect.top >= line) {
      pane.scrollTop = 0;
      return;
    }
    const within = rect.height ? Math.min(1, Math.max(0, (line - rect.top) / rect.height)) : 0;
    const row = rows[at].getBoundingClientRect();
    const top =
      pane.getBoundingClientRect().top + (this.header?.getBoundingClientRect().height || 0);
    pane.scrollTop += (row.top + within * row.height - top) / this.paneScale(pane);
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
    // Keep focus on the chosen sentence when the list is rebuilt under it.
    const hadFocus = this.list.contains(document.activeElement);
    this.list.replaceChildren(...rows);
    if (this.hoverFrom === 'document') this.chip(this.hover)?.classList.add('sv-hover');
    if (!this.chip(this.hover)) this.hover = this.hoverFrom = null;
    this.choose(this.current, { from: this.currentFrom || 'sentences', focus: hadFocus });
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
      if (!other) return;
      this.interrupt();
      void this.combine(position, this.position(other));
    } else if (step && event.altKey) {
      // Alt+Arrow moves the sentence one place earlier or later.
      event.preventDefault();
      const gap = this.neighbourGap(position, step);
      if (!gap) return;
      this.interrupt();
      this.move(position, gap);
    } else if (step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next =
        event.key === 'Home' ? chips[0] : event.key === 'End' ? chips.at(-1) : chips[at + step];
      if (next) this.choose(this.position(next), { scroll: true, reveal: true });
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
    if (this.active && event.key === 'Escape' && (this.drag || this.pending)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.drag) this.endDrag();
      else this.cancel(true);
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    const command = key === 'y' || event.shiftKey ? 'redo' : 'undo';
    // In the editor, the browser undoes one native edit at a time. A move or
    // combine still on record is taken back whole instead.
    if (this.editor.contains(event.target)) {
      if (!this.has(command)) return;
    } else if (
      !this.active ||
      event.target.closest?.('input, textarea, select, dialog, [contenteditable]')
    ) {
      return;
    }
    event.preventDefault();
    this[command]();
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
    // A rewrite still running in the document would land on moved text.
    this.interrupt();
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
    this.setHover(null);
    this.paintMarks();
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
    this.paintMarks();
  }
  autoScroll() {
    if (this.scrolling) return;
    const tick = () => {
      this.scrolling = 0;
      const drag = this.drag;
      if (!drag) return;
      const pane = this.pane();
      const box = pane ? pane.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const step =
        drag.y < box.top + SCROLL_EDGE_PX
          ? -SCROLL_STEP_PX
          : drag.y > box.bottom - SCROLL_EDGE_PX
            ? SCROLL_STEP_PX
            : 0;
      const scroller = pane || document.scrollingElement;
      const before = scroller.scrollTop;
      if (step) scroller.scrollBy(0, step);
      if (scroller.scrollTop === before) return;
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
    this.paintMarks();
  }

  // Makes the steps in the editor through `edit`, which gives native edits an
  // editor that is shown and focused. When the browser's result differs from
  // the plan, its edits are undone and this returns false.
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
      // The view renders its own edits once they are done.
      this.observer.takeRecords();
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
    // From the editor, the caret stays there, at the end of what changed.
    const typing = document.activeElement === this.editor;
    this.applying = true;
    try {
      this.edit(() => {
        for (let i = 0; i < count; i++) document.execCommand(command);
        const selection = getSelection();
        if (typing && selection.rangeCount) selection.collapseToEnd();
        else selection.removeAllRanges();
      });
    } finally {
      this.applying = false;
      this.observer.takeRecords();
    }
    const changed = this.editor.innerHTML !== before;
    if (changed) to.push(count);
    else this.forget();
    if (!this.active) return;
    this.render();
    this.notify(
      changed
        ? command === 'undo'
          ? 'Undone.'
          : 'Redone.'
        : command === 'undo'
          ? 'Nothing to undo.'
          : 'Nothing to redo.',
    );
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
    const pending = { source, target };
    this.pending = pending;
    this.setHover(null);
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
  // The changed sentence is chosen and flashes in both views.
  finish(position, message) {
    this.current = position;
    this.currentFrom = 'sentences';
    this.render();
    this.choose(position, { scroll: true, reveal: true });
    const chip = this.chip(position);
    if (chip) {
      chip.classList.add('sv-new');
      setTimeout(() => chip.classList.remove('sv-new'), 1200);
    }
    if (this.documentShown()) this.flash(this.rangeOf(position));
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

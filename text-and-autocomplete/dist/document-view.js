import { DocumentMarks } from './document-marks.js?v=7f00142f2ecf';
import { scrollToShow, READING_LINE_PX } from './piece-view.js?v=2cc930a55f3d';

// The Document view is the editor itself. It is the one view a person types
// in, so there is only one. It marks what the other views point at, tells them
// which sentence is under the pointer and which holds the caret, and scrolls
// with the other panes.

export class DocumentView {
  // `root` holds the page; `holder` keeps it, hidden, while no pane shows it.
  constructor({ id = 'document', root, holder, editor, model, links, ops, flash }) {
    Object.assign(this, { id, root, holder, editor, model, links, ops, flash });
    this.marks = new DocumentMarks(editor);
    this.scroller = null;
    this.follows = true;
    this.expectedTop = null;
    this.frames = {};
    this.cleanup = [];
    this.always = [
      links.on((channel, value) => this.linked(channel, value)),
      model.on(() => this.paint()),
    ];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.always.push(() => target.removeEventListener(type, handler, options));
    };
    listen(document, 'selectionchange', () => this.follow());
    listen(editor, 'mousemove', event => {
      this.pointer = { x: event.clientX, y: event.clientY, buttons: event.buttons };
      this.frame('hover', () => this.hover());
    });
    listen(editor, 'mouseleave', () => this.clearHover());
    // Typing moves text under a mark that came from the pointer.
    listen(editor, 'keydown', () => this.clearHover());
    listen(window, 'resize', () => this.frame('paint', () => this.paint()));
  }
  get mounted() {
    return Boolean(this.scroller);
  }
  // Runs `work` once in the next animation frame, however often it is asked for.
  frame(name, work) {
    if (this.frames[name]) return;
    this.frames[name] = requestAnimationFrame(() => {
      this.frames[name] = 0;
      work();
    });
  }
  mount(scroller) {
    this.scroller = scroller;
    const onScroll = () => this.scrolled();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    this.cleanup.push(() => scroller.removeEventListener('scroll', onScroll));
    const scroll = this.links.get('scroll');
    if (scroll && scroll.origin !== this.id) this.alignTo(scroll);
    this.paint();
  }
  // The page leaves its pane; the editor stays in the page, hidden, so the
  // other views can still edit through it.
  unmount() {
    for (const undo of this.cleanup) undo();
    this.cleanup = [];
    this.scroller = null;
    this.marks.clear();
    this.holder.append(this.root);
    for (const channel of ['hover', 'focus', 'scroll']) {
      if (this.links.get(channel)?.origin === this.id) this.links.set(channel, null);
    }
  }
  clearHover() {
    if (this.links.get('hover')?.origin === this.id) this.links.set('hover', null);
  }
  // The caret's sentence is chosen in the other views as the caret moves.
  follow() {
    if (!this.mounted || this.ops.busy || document.activeElement !== this.editor) return;
    const selection = getSelection();
    if (!selection.rangeCount || !this.editor.contains(selection.focusNode)) return;
    const piece = this.model.locate(selection.focusNode, selection.focusOffset, 'sentence');
    const range = piece && this.model.range(piece);
    const focus = this.links.get('focus');
    if (!range && !focus) return;
    this.links.set('focus', range ? { range, origin: this.id } : null);
  }
  // The sentence under the pointer, when the pointer is on its text.
  hover() {
    const pointer = this.pointer;
    if (!this.mounted || this.links.get('drag') || this.ops.pending || !pointer) return;
    if (pointer.buttons) return;
    const { x, y } = pointer;
    let node = null;
    let offset = 0;
    const caret = document.caretPositionFromPoint?.(x, y);
    if (caret) ({ offsetNode: node, offset } = caret);
    else {
      const range = document.caretRangeFromPoint?.(x, y);
      if (range) ({ startContainer: node, startOffset: offset } = range);
    }
    const piece = node && this.editor.contains(node) ? this.model.locate(node, offset) : null;
    let range = piece && this.model.range(piece);
    // The nearest caret can sit past the end of a line, away from the pointer.
    const on = rect =>
      x >= rect.left - 2 && x <= rect.right + 2 && y >= rect.top - 2 && y <= rect.bottom + 2;
    if (range && ![...range.getClientRects()].some(on)) range = null;
    if (range) this.links.set('hover', { range, origin: this.id });
    else this.clearHover();
  }
  linked(channel, value) {
    if (channel === 'flash') {
      if (this.mounted) this.flash(value.range);
      return;
    }
    if (channel === 'scroll') {
      if (value && value.origin !== this.id) this.alignTo(value);
      return;
    }
    this.paint();
    // A piece chosen in another view shows in the document.
    if (channel === 'focus' && value && value.origin !== this.id) this.reveal(value.range);
  }
  // Marks show what the other views point at: the hovered and the chosen piece,
  // and during a drag or a combine, the sentence that moves and where it goes.
  paint() {
    if (!this.mounted || !this.editor.getClientRects().length) {
      this.marks.clear();
      return;
    }
    const link = channel => this.links.get(channel);
    const drag = link('drag');
    const pending = link('pending');
    const focus = link('focus');
    this.marks.set(
      'current',
      focus && focus.origin !== this.id && !drag && !pending ? focus.range : null,
    );
    const hover = link('hover');
    this.marks.set('hover', drag || pending ? null : hover?.ranges || hover?.range);
    this.marks.set('source', drag?.source || pending?.source);
    this.marks.set('target', drag?.target || pending?.target);
    this.marks.set('insert', drag?.insert);
    this.marks.layer('target').classList.toggle('doc-mark-pending', Boolean(pending));
  }
  reveal(range) {
    if (!this.mounted || !range) return;
    const box = this.scroller.getBoundingClientRect();
    const rect = range.getBoundingClientRect();
    if (!rect.height && !rect.width) return;
    const by = scrollToShow(
      rect.top,
      rect.bottom,
      box.top,
      box.bottom,
      Math.min(80, box.height / 6),
    );
    if (by) this.scrollTo(this.scroller.scrollTop + by);
  }
  scrollTo(top) {
    const scroller = this.scroller;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const target = Math.max(0, Math.min(max, Math.round(top)));
    if (Math.abs(target - scroller.scrollTop) < 1) return;
    this.expectedTop = target;
    scroller.scrollTop = target;
  }
  readingAnchor() {
    const line = this.scroller.getBoundingClientRect().top + READING_LINE_PX;
    const blocks = this.model.read().blocks;
    if (!blocks.length) return null;
    const found =
      blocks.find(({ element }) => element.getBoundingClientRect().bottom > line) || blocks.at(-1);
    const rect = found.element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(found.element);
    const fraction = rect.height ? Math.min(1, Math.max(0, (line - rect.top) / rect.height)) : 0;
    return { range, fraction, top: this.scroller.scrollTop === 0 };
  }
  scrolled() {
    const top = this.scroller.scrollTop;
    if (this.expectedTop !== null && Math.abs(top - this.expectedTop) <= 1) {
      this.expectedTop = null;
      return;
    }
    this.expectedTop = null;
    if (!this.follows) return;
    const anchor = this.readingAnchor();
    if (anchor) this.links.set('scroll', { ...anchor, origin: this.id });
  }
  alignTo({ range, fraction, top }) {
    if (!this.follows || !this.mounted) return;
    if (top) {
      this.scrollTo(0);
      return;
    }
    const span = this.model.span(range);
    const block = span && this.model.read().blocks[span.startBlock];
    if (!block) return;
    const rect = block.element.getBoundingClientRect();
    const line = this.scroller.getBoundingClientRect().top + READING_LINE_PX;
    this.scrollTo(this.scroller.scrollTop + rect.top + fraction * rect.height - line);
  }
}

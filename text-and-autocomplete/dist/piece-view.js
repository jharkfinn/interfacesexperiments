import { overlaps } from './doc-model.js?v=7ef16fd28f8c';

// A declared view: the document's pieces (sentences or paragraphs), arranged as
// its declaration says, with gestures that run the operations it names. It
// shows the shared links (hover, focus, drag, pending combine, flash) on its
// pieces, sets them from its own pieces, and scrolls with the other panes.

// Within this distance of a piece's left or right edge (top or bottom in a
// list), a drop moves the piece beside it instead of combining with it.
export const EDGE_PX = 14;
const DRAG_START_PX = 4;
// A finger has to rest on a piece this long before it drags; a quicker swipe
// scrolls the pane.
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;
// Near the top or bottom of the pane, a drag scrolls it.
const SCROLL_EDGE_PX = 48;
const SCROLL_STEP_PX = 14;
// The line near the top of a pane that lines panes up with each other.
export const READING_LINE_PX = 12;
const START_CHARS = 90;

// How far to scroll so a span from `top` to `bottom` sits inside `start`..`end`
// with `margin` to spare; 0 when it already does. A span taller than the room
// lines up with the start.
export function scrollToShow(top, bottom, start, end, margin) {
  if (top < start + margin || bottom - top > end - start - 2 * margin) return top - start - margin;
  if (bottom > end - margin) return bottom - end + margin;
  return 0;
}

// The opening of a piece's text, cut at a word near `limit` characters.
export function opening(text, limit = START_CHARS) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}

// What the declaration lets a person do, in one or two sentences for the view's header.
export function hintFor(spec) {
  const noun = spec.unit === 'paragraph' ? 'paragraph' : 'sentence';
  const drag = [];
  if (spec.on['drop-on'] === 'combine') drag.push('onto another to combine them');
  if (spec.on['drop-between'] === 'move') drag.push('between two to move it');
  const parts = [];
  if (drag.length) parts.push(`Drag a ${noun} ${drag.join(', or ')}.`);
  if (spec.on['double-click'] === 'open') {
    parts.push(`Double-click a ${noun} to edit it in the document.`);
  }
  if (spec.on.delete === 'remove') parts.push('Delete removes it.');
  return parts.join(' ') || `Each ${noun} links to the same text in the other views.`;
}

export class PieceView {
  constructor({ id, spec, model, ops, links }) {
    Object.assign(this, { id, spec, model, ops, links });
    this.root = document.createElement('section');
    this.root.className = `piece-view page layout-${spec.layout} unit-${spec.unit}`;
    this.root.setAttribute('aria-label', spec.title);
    const hint = document.createElement('p');
    hint.className = 'pv-hint';
    hint.textContent = hintFor(spec);
    this.list = document.createElement('div');
    this.list.className = 'pv-list';
    this.root.append(hint, this.list);
    this.scroller = null;
    this.pieces = new Map();
    this.version = -1;
    this.press = null;
    this.drag = null;
    this.scrolling = 0;
    this.follows = true;
    this.expectedTop = null;
    this.flashed = null;
    this.wantFocus = false;
    this.canDrag = spec.on['drop-on'] === 'combine' || spec.on['drop-between'] === 'move';
    this.cleanup = [
      model.on(version => {
        if (version !== this.version && !this.drag) this.render();
      }),
      links.on((channel, value) => this.linked(channel, value)),
    ];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.cleanup.push(() => target.removeEventListener(type, handler, options));
    };
    listen(this.list, 'pointerover', event => {
      if (this.press || this.drag) return;
      const piece = this.pieceOf(event.target);
      this.links.set('hover', piece ? { range: this.model.range(piece), origin: this.id } : null);
    });
    listen(this.list, 'pointerleave', () => {
      if (this.links.get('hover')?.origin === this.id) this.links.set('hover', null);
    });
    // A fast pointer can leave the list before a drag starts, so moves and
    // releases are heard on the whole document.
    listen(this.list, 'pointerdown', event => this.pointerDown(event));
    listen(document, 'pointermove', event => this.pointerMove(event));
    listen(document, 'pointerup', event => this.pointerUp(event));
    listen(document, 'pointercancel', event => {
      if (event.pointerId === this.press?.pointerId) this.endDrag();
    });
    // Taking the capture from a touched piece also fires this, on the piece.
    listen(this.list, 'lostpointercapture', event => {
      if (event.target === this.list) this.endDrag();
    });
    // Once a held finger starts a drag, the pane must not scroll under it.
    listen(
      this.list,
      'touchmove',
      event => {
        if (this.drag || this.press?.armed) event.preventDefault();
      },
      { passive: false },
    );
    listen(this.list, 'contextmenu', event => {
      if (this.drag || this.press?.armed) event.preventDefault();
    });
    listen(window, 'blur', () => this.endDrag());
    listen(this.list, 'click', event => {
      const piece = this.pieceOf(event.target);
      if (piece) this.choose(piece);
    });
    listen(this.list, 'dblclick', event => {
      const piece = this.pieceOf(event.target);
      if (piece && this.spec.on['double-click'] === 'open') this.ops.open(piece);
    });
    listen(this.root, 'keydown', event => this.keydown(event));
    this.render();
  }
  // The pane gives the view the element it scrolls in.
  mount(scroller) {
    this.scroller = scroller;
    const onScroll = () => this.scrolled();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    this.cleanup.push(() => scroller.removeEventListener('scroll', onScroll));
    const scroll = this.links.get('scroll');
    if (scroll && scroll.origin !== this.id) this.alignTo(scroll);
  }
  destroy() {
    this.endDrag();
    for (const undo of this.cleanup) undo();
    this.root.remove();
    for (const channel of ['hover', 'focus', 'drag', 'scroll']) {
      if (this.links.get(channel)?.origin === this.id) this.links.set(channel, null);
    }
  }
  pieceOf(element) {
    const chip = element?.closest?.('.pv-piece');
    return chip && this.list.contains(chip) ? this.pieces.get(chip.dataset.id) : null;
  }
  chips(range) {
    if (!range) return [];
    const span = this.model.span(range);
    return span
      ? [...this.list.querySelectorAll('.pv-piece')].filter(chip =>
          overlaps(this.pieces.get(chip.dataset.id), span),
        )
      : [];
  }
  render() {
    const spec = this.spec;
    const { blocks, version } = this.model.read();
    this.version = version;
    const pieces = this.model.pieces(spec.unit);
    this.pieces = new Map(pieces.map(piece => [piece.id, piece]));
    const moves = spec.on['drop-between'] === 'move' && spec.unit === 'sentence';
    const gap = (block, at) => {
      const element = document.createElement('span');
      element.className = 'pv-gap';
      element.dataset.block = block;
      element.dataset.at = at;
      element.setAttribute('aria-hidden', 'true');
      return element;
    };
    const chip = piece => {
      const element = document.createElement('span');
      element.className = 'pv-piece';
      element.setAttribute('role', 'button');
      element.setAttribute('aria-describedby', 'pv-keys');
      element.tabIndex = -1;
      element.dataset.id = piece.id;
      element.dataset.kind = blocks[piece.block].kind;
      if (spec.show === 'start') {
        const first = spec.unit === 'paragraph' ? blocks[piece.block].sentences[0]?.text : null;
        element.textContent = opening(first || piece.text);
        element.title = piece.text;
      } else element.textContent = piece.text;
      return element;
    };
    // Each block's pieces, with a gap before each and after the last when the
    // view moves sentences.
    const blockParts = block => {
      const own = pieces.filter(piece => piece.block === block.index);
      const parts = [];
      if (moves) parts.push(gap(block.index, 0));
      own.forEach((piece, i) => {
        if (!moves) {
          parts.push(chip(piece));
          return;
        }
        // A gap stays on the line of the piece before it, so a wrapped line
        // starts with a piece.
        const unit = document.createElement('span');
        unit.className = 'pv-unit';
        unit.append(chip(piece), gap(block.index, i + 1));
        parts.push(unit);
      });
      return { own, parts };
    };
    const rows = [];
    if (spec.group === 'paragraph') {
      for (const block of blocks) {
        const { own, parts } = blockParts(block);
        if (!own.length && !moves) continue;
        const row = document.createElement('div');
        row.className = 'pv-row';
        row.dataset.kind = block.kind;
        row.dataset.block = block.index;
        row.append(...parts);
        if (!own.length) row.classList.add('pv-empty');
        rows.push(row);
      }
    } else {
      const row = document.createElement('div');
      row.className = 'pv-row';
      for (const block of blocks) row.append(...blockParts(block).parts);
      rows.push(row);
    }
    // Keep focus on the chosen piece when the list is rebuilt under it.
    const hadFocus = this.list.contains(document.activeElement);
    this.list.replaceChildren(...rows);
    this.paintLinks({ focus: hadFocus });
  }
  // Marks every link on the pieces it touches.
  paintLinks({ focus = false } = {}) {
    const all = [...this.list.querySelectorAll('.pv-piece, .pv-gap')];
    for (const element of all) {
      element.classList.remove(
        'pv-hover',
        'pv-current',
        'pv-source',
        'pv-target',
        'pv-leaving',
        'pv-pending',
      );
    }
    const mark = (range, name) => {
      const chips = this.chips(range);
      for (const chip of chips) chip.classList.add(name);
      return chips;
    };
    const hover = this.links.get('hover');
    if (hover && !this.drag) mark(hover.range, 'pv-hover');
    const current = mark(this.links.get('focus')?.range, 'pv-current');
    for (const chip of this.list.querySelectorAll('.pv-piece')) chip.tabIndex = -1;
    const stop = current[0] || this.list.querySelector('.pv-piece');
    if (stop) stop.tabIndex = 0;
    if (focus && current[0]) current[0].focus({ preventScroll: true });
    const drag = this.links.get('drag');
    if (drag) {
      mark(drag.source, 'pv-source');
      mark(drag.target, 'pv-target');
      if (drag.origin === this.id) this.drag?.target?.element?.classList.add('pv-target');
      else this.gapAt(drag.insert)?.classList.add('pv-target');
    }
    const pending = this.links.get('pending');
    if (pending) {
      mark(pending.source, 'pv-leaving');
      mark(pending.target, 'pv-pending');
    }
    if (this.flashed && performance.now() < this.flashed.until) {
      for (const chip of this.chips(this.flashed.range)) chip.classList.add('pv-new');
    }
  }
  // The gap in this view for an insertion point set by another view.
  gapAt(range) {
    const span = range && this.model.span(range);
    if (!span) return null;
    const pieces = [...this.pieces.values()].filter(piece => piece.block === span.startBlock);
    const next = pieces.find(piece => piece.start >= span.start);
    const at = next ? next.index : pieces.length;
    return this.list.querySelector(`.pv-gap[data-block="${span.startBlock}"][data-at="${at}"]`);
  }
  linked(channel, value) {
    if (channel === 'flash') {
      this.flashed = { range: value.range, until: performance.now() + 1200 };
      for (const chip of this.chips(value.range)) {
        chip.classList.remove('pv-new');
        void chip.offsetWidth;
        chip.classList.add('pv-new');
      }
      return;
    }
    if (channel === 'scroll') {
      if (value && value.origin !== this.id) this.alignTo(value);
      return;
    }
    if (this.model.read().version !== this.version) this.render();
    else this.paintLinks();
    if (channel === 'focus' && value) {
      const chip = this.chips(value.range)[0];
      if (!chip) return;
      if (value.origin === this.id) {
        if (this.wantFocus) chip.focus({ preventScroll: true });
        this.reveal(chip);
      } else this.reveal(chip);
    }
  }
  choose(piece, { focus = false } = {}) {
    this.wantFocus = focus || this.root.contains(document.activeElement);
    this.links.set('focus', { range: this.model.range(piece), origin: this.id });
  }
  // Scrolls the pane, without telling the other panes, so a chip shows.
  reveal(chip) {
    const scroller = this.scroller;
    if (!scroller) return;
    const box = scroller.getBoundingClientRect();
    const rect = chip.getBoundingClientRect();
    const by = scrollToShow(rect.top, rect.bottom, box.top, box.bottom, 12);
    if (by) this.scrollTo(scroller.scrollTop + by);
  }
  scrollTo(top) {
    const scroller = this.scroller;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const target = Math.max(0, Math.min(max, Math.round(top)));
    if (Math.abs(target - scroller.scrollTop) < 1) return;
    this.expectedTop = target;
    scroller.scrollTop = target;
  }
  // The element at the reading line, as a range and how far into it the line falls.
  anchors() {
    const blocks = this.model.read().blocks;
    if (this.spec.group === 'paragraph') {
      return [...this.list.querySelectorAll('.pv-row')].map(row => {
        const block = blocks[Number(row.dataset.block)];
        const range = document.createRange();
        range.selectNodeContents(block.element);
        return { element: row, range };
      });
    }
    return [...this.list.querySelectorAll('.pv-piece')].map(chip => ({
      element: chip,
      range: this.model.range(this.pieces.get(chip.dataset.id)),
    }));
  }
  readingAnchor() {
    const line = this.scroller.getBoundingClientRect().top + READING_LINE_PX;
    const anchors = this.anchors();
    if (!anchors.length) return null;
    const found = anchors.find(({ element }) => element.getBoundingClientRect().bottom > line);
    const { element, range } = found || anchors.at(-1);
    const rect = element.getBoundingClientRect();
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
    if (!this.follows || this.drag) return;
    const anchor = this.readingAnchor();
    if (anchor) this.links.set('scroll', { ...anchor, origin: this.id });
  }
  // Scrolls so the text another pane reads at its reading line is at this one's.
  alignTo({ range, fraction, top }) {
    if (!this.follows || !this.scroller || this.drag) return;
    if (top) {
      this.scrollTo(0);
      return;
    }
    const span = this.model.span(range);
    if (!span) return;
    const point = { startBlock: span.startBlock, start: span.start, endBlock: span.startBlock };
    point.end = point.start;
    const anchors = this.anchors();
    const found =
      anchors.find(({ range: own }) => {
        const mine = this.model.span(own);
        return (
          mine &&
          (mine.startBlock > point.startBlock ||
            (mine.startBlock === point.startBlock && mine.end >= point.start))
        );
      }) || anchors.at(-1);
    if (!found) return;
    const rect = found.element.getBoundingClientRect();
    const line = this.scroller.getBoundingClientRect().top + READING_LINE_PX;
    this.scrollTo(this.scroller.scrollTop + rect.top + fraction * rect.height - line);
  }
  keydown(event) {
    if (event.key === 'Escape' && this.drag) {
      event.preventDefault();
      event.stopPropagation();
      this.endDrag();
      return;
    }
    const piece = this.pieceOf(event.target);
    if (!piece || this.ops.pending) return;
    const chips = [...this.list.querySelectorAll('.pv-piece')];
    const at = chips.indexOf(event.target.closest('.pv-piece'));
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    const on = this.spec.on;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (on['double-click'] === 'open') this.ops.open(piece);
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && on.delete === 'remove') {
      event.preventDefault();
      this.wantFocus = true;
      this.ops.run('remove', { piece }, this.id);
    } else if (step && event.altKey && event.shiftKey) {
      // Alt+Shift+Arrow combines the piece into the one beside it.
      event.preventDefault();
      const other = this.pieceOf(chips[at + step]);
      if (!other || on['drop-on'] !== 'combine') return;
      this.wantFocus = true;
      this.ops.run('combine', { source: piece, target: other }, this.id);
    } else if (step && event.altKey) {
      // Alt+Arrow moves the piece one place earlier or later.
      event.preventDefault();
      const gap = on['drop-between'] === 'move' && this.neighbourGap(piece, step);
      if (!gap) return;
      this.wantFocus = true;
      this.ops.run('move', { source: piece, gap }, this.id);
    } else if (step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next =
        event.key === 'Home' ? chips[0] : event.key === 'End' ? chips.at(-1) : chips[at + step];
      const other = this.pieceOf(next);
      if (other) this.choose(other, { focus: true });
    }
  }
  // The gap one sentence away, crossing into the next or previous block at an end.
  neighbourGap(piece, step) {
    const blocks = this.model.read().blocks;
    const count = blocks[piece.block].sentences.length;
    if (step < 0 && piece.index > 0) return { block: piece.block, at: piece.index - 1 };
    if (step > 0 && piece.index < count - 1) return { block: piece.block, at: piece.index + 2 };
    const other = blocks[piece.block + step];
    return other ? { block: piece.block + step, at: step < 0 ? other.sentences.length : 0 } : null;
  }

  // Dragging uses pointer events, so it works with a mouse, a pen, or a finger.
  pointerDown(event) {
    const chip = event.target.closest('.pv-piece');
    if (!this.canDrag || !chip || event.button !== 0 || this.ops.pending || this.drag) return;
    this.endDrag();
    const press = { x: event.clientX, y: event.clientY, chip, pointerId: event.pointerId };
    if (event.pointerType === 'touch') {
      press.touch = true;
      press.timer = setTimeout(() => {
        press.armed = true;
        chip.classList.add('pv-lifted');
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
    const source = this.pieceOf(chip);
    this.drag = { source, chip, ghost, target: null };
    chip.classList.add('pv-lifted');
    this.root.classList.add('pv-dragging');
    document.documentElement.classList.add('combine-dragging');
    this.links.set('hover', null);
    this.publishDrag();
  }
  publishDrag() {
    const drag = this.drag;
    const target = drag?.target;
    this.links.set(
      'drag',
      drag
        ? {
            source: this.model.range(drag.source),
            target: target?.kind === 'combine' ? this.model.range(target.piece) : null,
            insert: target?.kind === 'move' ? this.insertion(target.gap) : null,
            origin: this.id,
          }
        : null,
    );
  }
  // Where a sentence dropped in `gap` goes in the document, as a collapsed range.
  insertion(gap) {
    const block = this.model.read().blocks[gap.block];
    if (!block) return null;
    if (!block.sentences.length) {
      const range = document.createRange();
      range.setStart(block.element, 0);
      return range;
    }
    const at =
      gap.at < block.sentences.length ? block.sentences[gap.at].start : block.sentences.at(-1).end;
    return this.model.range({ block: gap.block, start: at, end: at });
  }
  pointerUp(event) {
    const press = this.press;
    if (!press || event.pointerId !== press.pointerId) return;
    const drag = this.drag;
    if (drag) this.pointerMove(event);
    const target = drag?.target;
    this.endDrag();
    if (!drag || !target) return;
    this.wantFocus = true;
    if (target.kind === 'combine') {
      this.ops.run('combine', { source: drag.source, target: target.piece }, this.id);
    } else this.ops.run('move', { source: drag.source, gap: target.gap }, this.id);
  }
  endDrag() {
    const press = this.press;
    this.press = null;
    if (press) {
      clearTimeout(press.timer);
      press.chip.classList.remove('pv-lifted');
    }
    cancelAnimationFrame(this.scrolling);
    this.scrolling = 0;
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    drag.ghost.remove();
    this.root.classList.remove('pv-dragging');
    document.documentElement.classList.remove('combine-dragging');
    this.links.set('drag', null);
    if (this.model.read().version !== this.version) this.render();
  }
  autoScroll() {
    if (this.scrolling || !this.scroller) return;
    const tick = () => {
      this.scrolling = 0;
      const drag = this.drag;
      if (!drag) return;
      const box = this.scroller.getBoundingClientRect();
      const step =
        drag.y < box.top + SCROLL_EDGE_PX
          ? -SCROLL_STEP_PX
          : drag.y > box.bottom - SCROLL_EDGE_PX
            ? SCROLL_STEP_PX
            : 0;
      const before = this.scroller.scrollTop;
      if (step) this.scroller.scrollBy(0, step);
      if (this.scroller.scrollTop === before) return;
      this.setTarget(this.targetAt(drag.x, drag.y));
      this.scrolling = requestAnimationFrame(tick);
    };
    this.scrolling = requestAnimationFrame(tick);
  }
  // The gap just before or just after the dragged sentence leaves it where it is.
  staysPut(gap) {
    const source = this.drag.source;
    return source.block === gap.block && (gap.at === source.index || gap.at === source.index + 1);
  }
  targetAt(x, y) {
    const on = this.spec.on;
    const element = document.elementFromPoint(x, y);
    if (on['drop-between'] === 'move') {
      const gap = element?.closest('.pv-gap');
      if (gap && this.list.contains(gap)) {
        const at = { block: Number(gap.dataset.block), at: Number(gap.dataset.at) };
        return this.staysPut(at) ? null : { kind: 'move', gap: at, element: gap };
      }
      // An empty paragraph takes a dropped sentence anywhere along its row.
      const empty = element?.closest('.pv-empty');
      if (empty && this.list.contains(empty)) {
        const gap = empty.querySelector('.pv-gap');
        return { kind: 'move', gap: { block: Number(gap.dataset.block), at: 0 }, element: gap };
      }
    }
    const chip = element?.closest('.pv-piece');
    if (!chip || !this.list.contains(chip) || chip === this.drag.chip) return null;
    const piece = this.pieceOf(chip);
    if (on['drop-between'] === 'move') {
      const rect = chip.getBoundingClientRect();
      const list = this.spec.layout === 'list';
      const near = list ? y - rect.top : x - rect.left;
      const far = list ? rect.bottom - y : rect.right - x;
      const side = near < EDGE_PX ? 0 : far < EDGE_PX ? 1 : null;
      if (side !== null || on['drop-on'] !== 'combine') {
        const at = { block: piece.block, at: piece.index + (side ?? (near < far ? 0 : 1)) };
        const edge = this.list.querySelector(
          `.pv-gap[data-block="${at.block}"][data-at="${at.at}"]`,
        );
        return this.staysPut(at) ? null : { kind: 'move', gap: at, element: edge };
      }
    }
    return on['drop-on'] === 'combine' ? { kind: 'combine', piece, element: chip } : null;
  }
  setTarget(target) {
    const drag = this.drag;
    if (!drag) return;
    const previous = drag.target;
    if (previous?.element === target?.element && previous?.kind === target?.kind) return;
    previous?.element?.classList.remove('pv-target');
    drag.target = target;
    target?.element?.classList.add('pv-target');
    this.publishDrag();
  }
}

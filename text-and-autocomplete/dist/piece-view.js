import { overlaps } from './doc-model.js?v=c4e011ab5217';
import { topicFor, usesClaude } from './segments.js?v=337dfe6e5a58';
import { checksPanel, sectionName, roleChip, sourceChip, authoritiesPanel } from './legal-view.js?v=2af94c276185';
import { STRUCTURE_CHECKS } from './legal-core.js?v=7c037f3d7b33';
import { planChecks } from './cite-check.js?v=cbdd9cc01761';

// A declared view: the document's pieces (sentences, paragraphs, pieces Claude
// chose for the view's purpose, one level of Claude's tree of the goals the
// text pursues, or runs of sentences that do one job in a legal analysis),
// arranged as its declaration says, with
// gestures that run the operations it names. It shows the shared links (hover,
// focus, drag, pending combine, flash) on its pieces, sets them from its own
// pieces, and scrolls with the other panes.
//
// Sentence views have a gap before and after each sentence of a paragraph.
// Views of larger pieces have one gap between each two pieces; where a dragged
// piece can go depends on the piece: whole paragraphs go between paragraphs,
// and a run of sentences goes into a paragraph.

// Within this distance of a piece's edge, a drop moves the piece beside it
// instead of combining with it.
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
const EXCERPT_CHARS = 140;

const words = text => (text.match(/\S+/gu) || []).length;

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
  const noun = { sentence: 'sentence', paragraph: 'paragraph' }[spec.unit] || 'piece';
  const drag = [];
  if (spec.on['drop-on'] === 'combine') drag.push('onto another to combine them');
  if (spec.on['drop-between'] === 'move') drag.push('between two to move it');
  const parts = [];
  if (spec.unit === 'role') {
    parts.push(
      'Claude labels each sentence’s job in the analysis; the app groups the labels by the document’s headings and checks the structure. A hollow letter is a part a section lacks.',
    );
  } else if (spec.show === 'sources') {
    parts.push(
      'The app finds citations and quotations itself; Claude only says what each sentence asserts. With a Midpage connector, Check looks up each case and statute and compares its quotations word for word. Nothing here checks that a source supports the sentence.',
    );
  } else if (spec.unit === 'claude') {
    parts.push(`Claude divides the document for this view: “${spec.purpose}”`);
  } else if (spec.unit === 'level') {
    parts.push(
      spec.level > 1
        ? `Claude maps what the text is trying to do. Each piece here is a step toward a goal one level up${spec.show === 'method' ? ', with how it takes that step' : ''}.`
        : 'Claude maps what the text is trying to do. Each piece here is one of its main goals.',
    );
  }
  if (drag.length) parts.push(`Drag a ${noun} ${drag.join(', or ')}.`);
  if (spec.on['double-click'] === 'open') {
    parts.push(`Double-click a ${noun} to edit it in the document.`);
  }
  if (spec.on.delete === 'remove') parts.push('Delete removes it.');
  return parts.join(' ') || `Each ${noun} links to the same text in the other views.`;
}

// What the view says while Claude's pieces are not current. Level views share
// one map of the text's goals (`map` true or 'levels'); the legal views share
// Claude's labels for each sentence's job (`map` 'legal').
export function statusText(status, carried, map = false) {
  if (map === 'legal') {
    const kept = carried
      ? 'The last labels stand in until then.'
      : 'Citations, quotations, and headings show until then.';
    return {
      waiting: `Claude is labeling each sentence’s job. ${kept}`,
      updating:
        'Claude is updating the labels after your changes. Changed sentences keep the label before them until then.',
      offline: `Connect to let Claude label each sentence’s job. ${kept}`,
    }[status];
  }
  const levels = Boolean(map);
  const stand = carried
    ? 'The last pieces stand in until then.'
    : 'Paragraphs stand in until then.';
  return {
    waiting: levels
      ? `Claude is mapping the goals of the text. ${stand}`
      : `Claude is dividing the document for this view. ${stand}`,
    updating: 'Claude is updating the pieces after your changes.',
    offline: levels
      ? `Connect to let Claude map the goals of the text. ${stand}`
      : `Connect to let Claude divide the document for this view. ${stand}`,
  }[status];
}

// Where a piece dropped in gap `index` (before piece number `index`) goes in
// the document, or null where it cannot go. Whole paragraphs go between
// paragraphs ({before}: a block number); a run of sentences goes into a
// paragraph ({block, offset, side}). `firstStart(block)` is where the first
// sentence of a block starts.
export function destination(pieces, index, source, firstStart, blockCount) {
  const at = pieces.indexOf(source);
  if (index === at || index === at + 1) return null;
  const next = pieces[index];
  const previous = pieces[index - 1];
  const between = !next || next.start === firstStart(next.block);
  if (source.whole && between) return { before: next ? next.block : blockCount };
  if ((source.endBlock ?? source.block) !== source.block) return null;
  if (next) return { block: next.block, offset: next.start, side: 'before' };
  return previous
    ? { block: previous.endBlock ?? previous.block, offset: previous.end, side: 'after' }
    : null;
}

export class PieceView {
  constructor({ id, spec, model, ops, links, segments, legal = null, check = null }) {
    Object.assign(this, { id, spec, model, ops, links, segments, legal, check });
    this.sentences = spec.unit === 'sentence';
    // Pieces Claude chose, for a purpose or as a level of goals, or the legal
    // labels the IRAC and Sourcing views share.
    this.topic = usesClaude(spec) ? topicFor(spec) : null;
    this.vertical = spec.layout === 'list' || spec.layout === 'bars';
    this.root = document.createElement('section');
    this.root.className = `piece-view page layout-${spec.layout} unit-${spec.unit}`;
    this.root.setAttribute('aria-label', spec.title);
    const hint = document.createElement('p');
    hint.className = 'pv-hint';
    hint.textContent = hintFor(spec);
    this.status = document.createElement('p');
    this.status.className = 'pv-status';
    this.status.setAttribute('role', 'status');
    this.list = document.createElement('div');
    this.list.className = 'pv-list';
    // A panel above the pieces: structure checks, or a table of authorities.
    this.header = document.createElement('div');
    this.header.className = 'pv-header';
    this.root.append(hint, this.status, this.header, this.list);
    // What header rows and citation chips point at, by `data-target`.
    this.targets = [];
    this.stepping = null;
    this.headerOpen = true;
    this.attentionOnly = false;
    this.scroller = null;
    this.pieces = new Map();
    this.order = [];
    this.version = -1;
    this.press = null;
    this.drag = null;
    this.stale = false;
    this.scrolling = 0;
    this.follows = true;
    this.expectedTop = null;
    this.flashed = null;
    this.wantFocus = false;
    this.moves = spec.on['drop-between'] === 'move';
    this.canDrag = spec.on['drop-on'] === 'combine' || this.moves;
    this.cleanup = [
      model.on(version => {
        if (version !== this.version && !this.drag) this.render();
      }),
      links.on((channel, value) => this.linked(channel, value)),
    ];
    // A table of authorities shows each Midpage check as it runs and ends.
    if (check && spec.header === 'authorities') {
      this.cleanup.push(
        check.on(() => {
          if (this.drag) this.stale = true;
          else this.render();
        }),
      );
    }
    if (this.topic) {
      this.cleanup.push(
        segments.watch(this.topic, () => {
          if (this.drag) this.stale = true;
          else this.render();
        }),
      );
    }
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.cleanup.push(() => target.removeEventListener(type, handler, options));
    };
    const hoverAt = element => {
      if (this.press || this.drag) return;
      const pointed = this.targetOf(element);
      if (pointed) {
        this.links.set('hover', pointed);
        return;
      }
      const piece = this.pieceOf(element);
      this.links.set('hover', piece ? { range: this.model.range(piece), origin: this.id } : null);
    };
    const leave = () => {
      if (this.links.get('hover')?.origin === this.id) this.links.set('hover', null);
    };
    listen(this.list, 'pointerover', event => hoverAt(event.target));
    listen(this.list, 'pointerleave', leave);
    listen(this.header, 'pointerover', event => hoverAt(event.target));
    listen(this.header, 'pointerleave', leave);
    listen(this.header, 'click', event => {
      if (event.target.closest('input, button, summary')) return;
      const node = event.target.closest('[data-target]');
      if (node) this.focusTarget(node);
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
      // A citation or a letter points at its own text.
      const node = event.target.closest('[data-target]');
      if (node && this.list.contains(node)) {
        this.focusTarget(node);
        return;
      }
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
  // The view's pieces now, and the state of Claude's division for them. A level
  // view also gets the pieces of the level above, which its pieces fit inside;
  // the legal views get the legal reading, and IRAC its sections.
  source() {
    const spec = this.spec;
    if (spec.unit === 'role' || spec.show === 'sources') {
      const reading = this.legal.read();
      const pieces =
        spec.unit === 'role'
          ? this.model.runs(reading.runs, 'role')
          : this.model.pieces('sentence');
      return {
        pieces,
        above: spec.unit === 'role' ? reading.sections : null,
        reading,
        status: reading.status,
        message: reading.message,
      };
    }
    if (this.topic) return this.segments.view(this.topic, (this.spec.level || 1) - 1);
    return { pieces: this.model.pieces(this.spec.unit), status: 'ready' };
  }
  // A header row, a rail letter, or a citation chip: the hover link for the text
  // it points at, or null.
  targetOf(element) {
    const node = element?.closest?.('[data-target]');
    if (!node || !this.root.contains(node)) return null;
    const ranges = this.rangesOf(node);
    if (!ranges.length) return null;
    return ranges.length > 1
      ? { range: ranges[0], ranges, origin: this.id }
      : { range: ranges[0], origin: this.id };
  }
  rangesOf(node) {
    return (this.targets[Number(node.dataset.target)] || [])
      .map(span => this.model.range(span))
      .filter(Boolean);
  }
  // Chooses the text a header row points at; each further click on the same
  // row steps to its next mention.
  focusTarget(node) {
    const ranges = this.rangesOf(node);
    if (!ranges.length) return;
    const key = node.dataset.target + (node.dataset.key || node.textContent);
    const at = this.stepping?.key === key ? (this.stepping.at + 1) % ranges.length : 0;
    this.stepping = { key, at };
    this.wantFocus = false;
    this.links.set('focus', { range: ranges[at], origin: this.id });
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
    this.stale = false;
    const { pieces, above, reading, status, message } = this.source();
    this.pieces = new Map(pieces.map(piece => [piece.id, piece]));
    this.order = pieces;
    const carried = reading
      ? reading.labeled
      : Boolean(this.topic) && pieces.some(piece => piece.label);
    const note =
      status === 'failed'
        ? `${message} The last ${reading ? 'labels' : 'pieces'} stand in.`
        : reading?.partial && status === 'ready'
          ? 'Claude labeled only part of the document; the other sentences keep the label of the sentence before them.'
          : statusText(status, carried, reading ? 'legal' : spec.unit === 'level');
    this.status.textContent = note || '';
    this.status.hidden = !note;
    this.targets = [];
    this.renderHeader(reading);
    // Sourcing reads each sentence's support by its place in the document.
    const support = new Map(
      (reading && spec.show === 'sources' ? reading.sentences : []).map(sentence => [
        `${sentence.block}.${sentence.index}`,
        sentence,
      ]),
    );
    const longest = Math.max(1, ...pieces.map(piece => words(piece.text)));
    const gap = (at, block) => {
      const element = document.createElement('span');
      element.className = 'pv-gap';
      element.dataset.at = at;
      if (block !== undefined) element.dataset.block = block;
      element.setAttribute('aria-hidden', 'true');
      return element;
    };
    const chip = (piece, index) => {
      const element = document.createElement('span');
      element.className = 'pv-piece';
      element.setAttribute('role', 'button');
      element.setAttribute('aria-describedby', 'pv-keys');
      element.tabIndex = -1;
      element.dataset.id = piece.id;
      element.dataset.index = index;
      element.dataset.kind = blocks[piece.block].kind;
      if (spec.show === 'role') {
        roleChip(element, piece, opening(piece.text, EXCERPT_CHARS));
        return element;
      }
      if (spec.show === 'sources') {
        const sentence = support.get(`${piece.block}.${piece.index}`);
        sourceChip(
          element,
          sentence,
          opening(sentence?.lead || piece.text, EXCERPT_CHARS),
          this.targets,
        );
        return element;
      }
      const text =
        spec.show === 'start'
          ? opening(
              (spec.unit === 'paragraph' ? blocks[piece.block].sentences[0]?.text : null) ||
                piece.text,
            )
          : spec.show === 'label' || spec.show === 'method'
            ? opening(piece.text, EXCERPT_CHARS)
            : piece.text;
      if (spec.show !== 'text') element.title = piece.text;
      if (spec.layout === 'bars') {
        // A bar as long as the piece, against the longest piece in the view.
        const count = words(piece.text);
        element.style.setProperty('--share', String(count / longest));
        const number = document.createElement('span');
        number.className = 'pv-count';
        number.textContent = String(count);
        const excerpt = document.createElement('span');
        excerpt.className = 'pv-excerpt';
        excerpt.textContent = spec.show === 'label' && piece.label ? piece.label : text;
        element.setAttribute('aria-label', `${count} words: ${piece.text}`);
        element.append(number, excerpt);
      } else if ((spec.show === 'label' || spec.show === 'method') && piece.label) {
        const label = document.createElement('strong');
        label.className = 'pv-label';
        label.textContent = piece.label;
        const excerpt = document.createElement('span');
        excerpt.className = 'pv-excerpt';
        excerpt.textContent = text;
        if (spec.show === 'method' && piece.method) {
          // How the piece reaches its goal, as a tag before the goal.
          const method = document.createElement('span');
          method.className = 'pv-method';
          method.textContent = piece.method;
          label.prepend(method);
        }
        element.append(label, excerpt);
      } else element.textContent = text;
      return element;
    };
    const rows = [];
    if (this.sentences) {
      // A gap before each sentence and after the last, when sentences move.
      for (const block of blocks) {
        const own = pieces.filter(piece => piece.block === block.index);
        if (!own.length && !this.moves) continue;
        const row = document.createElement('div');
        row.className = 'pv-row';
        row.dataset.kind = block.kind;
        row.dataset.block = block.index;
        if (this.moves) row.append(gap(0, block.index));
        own.forEach((piece, i) => {
          if (!this.moves) {
            row.append(chip(piece, i));
            return;
          }
          // A gap stays on the line of the piece before it, so a wrapped line
          // starts with a piece.
          const unit = document.createElement('span');
          unit.className = 'pv-unit';
          const element = chip(piece, i);
          if ('attention' in element.dataset) unit.dataset.attention = '';
          unit.append(element, gap(i + 1, block.index));
          row.append(unit);
        });
        if (!own.length) row.classList.add('pv-empty');
        rows.push(row);
      }
    } else {
      // One gap between each two pieces, and one at each end. Grouped by the
      // goal above, each goal's steps form a row under its name; the gap at the
      // end of one row is the place before the next row's first piece.
      const byParent = (spec.group === 'parent' || spec.group === 'section') && above;
      let row = null;
      pieces.forEach((piece, index) => {
        if (!row || (byParent && piece.parent !== pieces[index - 1].parent)) {
          row = document.createElement('div');
          row.className = 'pv-row';
          const goal = byParent ? above[piece.parent] : null;
          const own = pieces.filter(other => other.parent === piece.parent);
          if (spec.group === 'section' && goal) {
            // A section of the memo, with its rail of IRAC letters.
            row.classList.add('pv-group', 'irac-section');
            row.dataset.part = goal.part;
            row.append(sectionName(goal, own, this.targets));
          } else if (goal?.label && !(own.length === 1 && own[0].label === goal.label)) {
            // A goal reached in one step needs no name over that step.
            row.classList.add('pv-group');
            const name = document.createElement('p');
            name.className = 'pv-group-label';
            name.textContent = goal.label;
            row.append(name);
          }
          if (this.moves && !index) row.append(gap(0));
          rows.push(row);
        }
        if (!this.moves) {
          row.append(chip(piece, index));
          return;
        }
        const unit = document.createElement('span');
        unit.className = 'pv-unit';
        unit.append(chip(piece, index), gap(index + 1));
        row.append(unit);
      });
      if (!pieces.length) {
        row = document.createElement('div');
        row.className = 'pv-row';
        if (this.moves) row.append(gap(0));
        rows.push(row);
      }
    }
    // Keep focus on the chosen piece when the list is rebuilt under it.
    const hadFocus = this.list.contains(document.activeElement);
    this.list.replaceChildren(...rows);
    this.paintLinks({ focus: hadFocus });
  }
  // The panel above the pieces, as the declaration names it.
  renderHeader(reading) {
    const header = this.spec.header;
    let panel = null;
    if (reading && header === 'checks') {
      panel = checksPanel(reading, this.spec.checks || STRUCTURE_CHECKS, this.targets);
    } else if (reading && header === 'authorities') {
      panel = authoritiesPanel(
        reading,
        this.legal.readSet(),
        (key, on) => {
          this.legal.setRead(key, on);
          this.render();
        },
        on => {
          this.attentionOnly = on;
          this.root.classList.toggle('pv-attention-only', on);
          this.render();
        },
        this.attentionOnly,
        this.targets,
        this.checkFor(reading),
      );
    }
    if (panel) {
      // A panel the reader closed stays closed while the view updates.
      panel.open = this.headerOpen;
      panel.addEventListener('toggle', () => {
        this.headerOpen = panel.open;
      });
      this.header.replaceChildren(panel);
    } else this.header.replaceChildren();
  }
  // What the table of authorities needs to check its cases and statutes with
  // Midpage, or null when this page cannot reach the reader's connectors.
  checkFor(reading) {
    const check = this.check;
    if (!check?.available) return null;
    if (this.plans?.reading !== reading) {
      const { blocks } = this.model.read();
      this.plans = {
        reading,
        value: new Map(planChecks(reading, blocks).map(plan => [plan.key, plan])),
      };
    }
    const plans = this.plans.value;
    return {
      plans,
      state: plan => check.state(plan),
      run: (plan, fresh) => check.check(plan, { fresh }),
      runAll: () => check.checkAll([...plans.values()]),
      stop: () => check.stop(),
      notice: check.notice,
      running: check.running,
    };
  }
  // Marks every link on the pieces it touches.
  paintLinks({ focus = false } = {}) {
    for (const element of this.list.querySelectorAll('.pv-piece, .pv-gap')) {
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
    if (hover && !this.drag)
      for (const range of hover.ranges || [hover.range]) mark(range, 'pv-hover');
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
    if (this.sentences) {
      const pieces = this.order.filter(piece => piece.block === span.startBlock);
      const next = pieces.find(piece => piece.start >= span.start);
      const at = next ? next.index : pieces.length;
      return this.list.querySelector(`.pv-gap[data-block="${span.startBlock}"][data-at="${at}"]`);
    }
    let at = this.order.findIndex(
      piece =>
        piece.block > span.startBlock ||
        (piece.block === span.startBlock && piece.start >= span.start),
    );
    if (at < 0) at = this.order.length;
    return this.list.querySelector(`.pv-gap[data-at="${at}"]:not([data-block])`);
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
      if (value.origin === this.id && this.wantFocus) chip.focus({ preventScroll: true });
      this.reveal(chip);
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
  // The elements that line up with the other panes, each with its text as a range.
  anchors() {
    const blocks = this.model.read().blocks;
    if (this.sentences) {
      return [...this.list.querySelectorAll('.pv-row')].map(row => {
        const range = document.createRange();
        range.selectNodeContents(blocks[Number(row.dataset.block)].element);
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
    const anchors = this.anchors();
    const found =
      anchors.find(({ range: own }) => {
        const mine = this.model.span(own);
        return (
          mine &&
          (mine.endBlock > span.startBlock ||
            (mine.endBlock === span.startBlock && mine.end >= span.start))
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
      if (!this.moves) return;
      const target = this.neighbour(piece, step);
      if (!target) return;
      this.wantFocus = true;
      this.ops.run('move', { source: piece, ...target }, this.id);
    } else if (step || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next =
        event.key === 'Home' ? chips[0] : event.key === 'End' ? chips.at(-1) : chips[at + step];
      const other = this.pieceOf(next);
      if (other) this.choose(other, { focus: true });
    }
  }
  // One place earlier or later: past the piece beside it.
  neighbour(piece, step) {
    if (this.sentences) {
      const blocks = this.model.read().blocks;
      const count = blocks[piece.block].sentences.length;
      if (step < 0 && piece.index > 0) return { gap: { block: piece.block, at: piece.index - 1 } };
      if (step > 0 && piece.index < count - 1) {
        return { gap: { block: piece.block, at: piece.index + 2 } };
      }
      const other = blocks[piece.block + step];
      return other
        ? { gap: { block: piece.block + step, at: step < 0 ? other.sentences.length : 0 } }
        : null;
    }
    const at = this.order.indexOf(piece);
    const to = this.destinationAt(step < 0 ? at - 1 : at + 2, piece);
    return to ? { to } : null;
  }
  destinationAt(index, source) {
    const blocks = this.model.read().blocks;
    if (index < 0 || index > this.order.length) return null;
    return destination(
      this.order,
      index,
      source,
      block => blocks[block].sentences[0]?.start ?? 0,
      blocks.length,
    );
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
    const source = this.pieceOf(chip);
    const text = source.label || source.text;
    ghost.textContent = text.length > 64 ? text.slice(0, 63).trimEnd() + '…' : text;
    document.body.append(ghost);
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
            insert: target?.kind === 'move' ? this.insertion(target) : null,
            origin: this.id,
          }
        : null,
    );
  }
  // Where a moved piece goes in the document, as a collapsed range.
  insertion({ gap, to }) {
    const blocks = this.model.read().blocks;
    if (gap) {
      const block = blocks[gap.block];
      if (!block) return null;
      if (!block.sentences.length) {
        const range = document.createRange();
        range.setStart(block.element, 0);
        return range;
      }
      const at =
        gap.at < block.sentences.length
          ? block.sentences[gap.at].start
          : block.sentences.at(-1).end;
      return this.model.range({ block: gap.block, start: at, end: at });
    }
    if (to.before !== undefined) {
      if (blocks[to.before]) return this.model.range({ block: to.before, start: 0, end: 0 });
      const last = blocks.at(-1);
      return last
        ? this.model.range({ block: last.index, start: last.text.length, end: last.text.length })
        : null;
    }
    return this.model.range({ block: to.block, start: to.offset, end: to.offset });
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
    } else {
      this.ops.run('move', { source: drag.source, gap: target.gap, to: target.to }, this.id);
    }
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
    if (this.stale || this.model.read().version !== this.version) this.render();
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
  // What dropping in a gap element would do, or null where it does nothing.
  gapTarget(element) {
    const source = this.drag.source;
    const at = Number(element.dataset.at);
    if (this.sentences) {
      const gap = { block: Number(element.dataset.block), at };
      const stays =
        source.block === gap.block && (gap.at === source.index || gap.at === source.index + 1);
      return stays ? null : { kind: 'move', gap, element };
    }
    const to = this.destinationAt(at, source);
    return to ? { kind: 'move', to, element } : null;
  }
  targetAt(x, y) {
    const on = this.spec.on;
    const element = document.elementFromPoint(x, y);
    if (this.moves) {
      const gap = element?.closest('.pv-gap');
      if (gap && this.list.contains(gap)) return this.gapTarget(gap);
      // An empty paragraph takes a dropped sentence anywhere along its row.
      const empty = element?.closest('.pv-empty');
      if (empty && this.list.contains(empty)) {
        return this.gapTarget(empty.querySelector('.pv-gap'));
      }
    }
    const chip = element?.closest('.pv-piece');
    if (!chip || !this.list.contains(chip) || chip === this.drag.chip) return null;
    const piece = this.pieceOf(chip);
    if (this.moves) {
      const rect = chip.getBoundingClientRect();
      const near = this.vertical ? y - rect.top : x - rect.left;
      const far = this.vertical ? rect.bottom - y : rect.right - x;
      const side = near < EDGE_PX ? 0 : far < EDGE_PX ? 1 : null;
      if (side !== null || on['drop-on'] !== 'combine') {
        const index = Number(chip.dataset.index) + (side ?? (near < far ? 0 : 1));
        const gap = this.sentences
          ? this.list.querySelector(`.pv-gap[data-block="${piece.block}"][data-at="${index}"]`)
          : this.list.querySelector(`.pv-gap[data-at="${index}"]:not([data-block])`);
        return gap ? this.gapTarget(gap) : null;
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

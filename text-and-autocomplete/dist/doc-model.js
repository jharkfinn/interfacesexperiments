// The document as the views see it: its blocks, and the pieces in them. A piece
// is one unit of text (a sentence, or a whole paragraph). Every view and every
// operation reads pieces from one model, so they all split the text the same way.
//
// Views link to each other through document ranges. A live Range follows edits
// made anywhere else in the document, so a link stays on its text while the
// pieces around it are numbered again.

const BLOCK = /^(P|DIV|H[1-6]|LI)$/;
const LIST = /^(UL|OL)$/;
export const UNITS = ['sentence', 'paragraph'];

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

// The text is split again on every edit, so each locale keeps one segmenter.
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

// Japanese and Chinese join sentences without a space. Korean, like most
// scripts, puts a space between them.
export const joiner = text => (/[぀-ヿ㐀-鿿]/u.test(text) ? '' : ' ');

// Whether a piece and a span from a link share text. A piece runs from
// {block, start} to {endBlock, end}; endBlock is block when left out. A
// collapsed link span (a caret or an insertion point) overlaps the piece it
// sits in, ends included.
export function overlaps(piece, span) {
  if (!piece || !span) return false;
  const endBlock = piece.endBlock ?? piece.block;
  const order = (blockA, offsetA, blockB, offsetB) => blockA - blockB || offsetA - offsetB;
  if (span.startBlock === span.endBlock && span.start === span.end) {
    return (
      order(piece.block, piece.start, span.startBlock, span.start) <= 0 &&
      order(endBlock, piece.end, span.startBlock, span.start) >= 0
    );
  }
  return (
    order(endBlock, piece.end, span.startBlock, span.start) > 0 &&
    order(piece.block, piece.start, span.endBlock, span.end) < 0
  );
}

export class DocumentModel {
  constructor(editor, locale) {
    this.editor = editor;
    this.locale = locale;
    this.version = 0;
    this.cache = null;
    this.listeners = new Set();
    this.frame = 0;
    // Edits made by any means (typing, a command, a script) mark the model stale.
    this.observer = new MutationObserver(() => this.changed());
    this.observer.observe(editor, { childList: true, characterData: true, subtree: true });
  }
  changed() {
    this.version++;
    this.cache = null;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.notify();
    });
  }
  notify() {
    for (const listener of this.listeners) listener(this.version);
  }
  // Listeners hear about changes once per frame, or at once after refresh().
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  // Makes pending changes visible now, so the views show an edit before what
  // comes after it in the same task.
  refresh() {
    if (this.observer.takeRecords().length) this.changed();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.notify();
  }
  // The blocks and their sentences. Changes not yet reported by the observer are
  // taken first, so a read never returns text from before an edit.
  read() {
    if (this.observer.takeRecords().length) this.changed();
    if (this.cache) return this.cache;
    const blocks = blocksOf(this.editor).map((element, index) => {
      const text = blockText(element);
      return {
        index,
        element,
        text,
        kind: element.tagName.toLowerCase(),
        sentences: sentencesIn(text, this.locale),
      };
    });
    this.cache = { version: this.version, blocks };
    return this.cache;
  }
  // The pieces of a unit, in document order. Each has the block it is in and its
  // span there; blank blocks have no paragraph piece.
  pieces(unit) {
    const { blocks, version } = this.read();
    const pieces = [];
    for (const block of blocks) {
      if (unit === 'paragraph') {
        const body = block.text.trim();
        if (!body) continue;
        const start = block.text.length - block.text.trimStart().length;
        pieces.push({
          unit,
          version,
          id: `p${block.index}`,
          block: block.index,
          endBlock: block.index,
          index: 0,
          start,
          end: start + body.length,
          whole: true,
          text: body,
        });
      } else {
        block.sentences.forEach((sentence, index) =>
          pieces.push({
            unit,
            version,
            id: `s${block.index}.${index}`,
            block: block.index,
            index,
            ...sentence,
          }),
        );
      }
    }
    return pieces;
  }
  element(piece) {
    return this.read().blocks[piece.block]?.element || null;
  }
  // A piece's text as a range; a piece can run across blocks.
  range(piece) {
    if (!piece) return null;
    const { blocks } = this.read();
    const first = blocks[piece.block]?.element;
    const last = blocks[piece.endBlock ?? piece.block]?.element;
    if (!first || !last) return null;
    if (first === last) return rangeIn(first, piece.start, piece.end);
    const start = rangeIn(first, piece.start, piece.start);
    const end = rangeIn(last, piece.end, piece.end);
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.startContainer, start.startOffset);
    range.setEnd(end.endContainer, end.endOffset);
    return range;
  }
  // The paragraphs that have text, as Claude sees them, with the sentences in
  // document order and the block each paragraph is.
  paragraphs() {
    const { blocks } = this.read();
    return blocks
      .filter(block => block.sentences.length)
      .map(block => ({
        kind: block.kind,
        block: block.index,
        sentences: block.sentences.map(sentence => sentence.text),
      }));
  }
  // Pieces made of runs of sentences, numbered through the document from 1, as
  // a segmentation gives them: [{first, last, label}].
  runs(runs, unit = 'claude') {
    const { version, blocks } = this.read();
    const sentences = blocks.flatMap(block =>
      block.sentences.map(sentence => ({ ...sentence, block: block.index })),
    );
    return runs.map(({ first, last, label }) => {
      const head = sentences[first - 1];
      const tail = sentences[last - 1];
      const own = sentences.slice(first - 1, last);
      // Whole paragraphs: from the start of one to the end of another.
      const whole =
        head.start === blocks[head.block].sentences[0].start &&
        tail.end === blocks[tail.block].sentences.at(-1).end;
      return {
        unit,
        version,
        id: `c${first}-${last}`,
        block: head.block,
        start: head.start,
        endBlock: tail.block,
        end: tail.end,
        first,
        last,
        whole,
        label: label || '',
        text: own.map(sentence => sentence.text).join(' '),
      };
    });
  }
  // A point in the editor as a block number and an offset in that block's text.
  point(node, offset) {
    const { blocks } = this.read();
    let at = blocks.findIndex(({ element }) => element === node || element.contains(node));
    if (at >= 0) return { block: at, offset: offsetIn(blocks[at].element, node, offset) };
    // Between blocks: the start of the next block, or the end of the document.
    at = blocks.findIndex(({ element }) => {
      const probe = document.createRange();
      probe.setStart(node, offset);
      return probe.comparePoint(element, 0) >= 0;
    });
    if (at >= 0) return { block: at, offset: 0 };
    const last = blocks.at(-1);
    return last ? { block: last.index, offset: last.text.length } : null;
  }
  // A link range as block numbers and offsets, to compare with piece spans.
  span(range) {
    if (!range || !this.editor.contains(range.commonAncestorContainer)) return null;
    const start = this.point(range.startContainer, range.startOffset);
    const end = range.collapsed ? start : this.point(range.endContainer, range.endOffset);
    return start && end
      ? { startBlock: start.block, start: start.offset, endBlock: end.block, end: end.offset }
      : null;
  }
  // The pieces of a unit that a link range touches.
  piecesIn(range, unit) {
    const span = this.span(range);
    return span ? this.pieces(unit).filter(piece => overlaps(piece, span)) : [];
  }
  // The piece of a unit at a point in the editor.
  locate(node, offset, unit = 'sentence') {
    const point = this.point(node, offset);
    if (!point) return null;
    const pieces = this.pieces(unit).filter(piece => piece.block === point.block);
    if (!pieces.length) return null;
    if (unit === 'paragraph') return pieces[0];
    return pieces[sentenceIndex(pieces, point.offset)] || null;
  }
  // The piece that starts at or holds `offset` in block number `block`, after an edit.
  pieceAt(block, offset, unit = 'sentence') {
    const pieces = this.pieces(unit).filter(piece => piece.block === block);
    if (!pieces.length) return null;
    if (unit === 'paragraph') return pieces[0];
    return pieces[sentenceIndex(pieces, offset, false)] || null;
  }
}

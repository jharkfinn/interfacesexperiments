// Streamed text never controls layout. Expansion reserves space in a disposable
// document copy; shortening uses the original document's fixed footprint.
export function mergeTextRects(rects) {
  const lines = [];
  for (const rect of [...rects]
    .filter(r => r.width > 0 && r.height > 0)
    .sort((a, b) => a.top - b.top || a.left - b.left)) {
    const previous = lines.at(-1);
    if (previous && Math.abs(previous.top - rect.top) < 3 && rect.left <= previous.right + 1) {
      previous.right = Math.max(previous.right, rect.right);
      previous.bottom = Math.max(previous.bottom, rect.bottom);
      previous.width = previous.right - previous.left;
      previous.height = previous.bottom - previous.top;
    } else {
      lines.push({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  return lines;
}

// The part of each text node under root that falls inside range.
function textRangesIn(root, range) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!range.intersectsNode(node)) continue;
    const part = document.createRange();
    part.selectNodeContents(node);
    if (part.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
      part.setStart(range.startContainer, range.startOffset);
    }
    if (part.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
      part.setEnd(range.endContainer, range.endOffset);
    }
    parts.push(part);
  }
  return parts;
}

export function selectionRects(editor, selection) {
  return mergeTextRects(
    textRangesIn(editor, selection)
      .filter(part => !part.collapsed)
      .flatMap(part => [...part.getClientRects()]),
  );
}

// Overlays are sized in the editor surface's own pixels, which differ from
// viewport pixels when the page is zoomed.
export function surfacePlacement(surface) {
  const origin = surface.getBoundingClientRect();
  const scale = surface.offsetWidth ? origin.width / surface.offsetWidth : 1;
  return {
    scale,
    place: (element, rect) =>
      Object.assign(element.style, {
        left: `${(rect.left - origin.left) / scale}px`,
        top: `${(rect.top - origin.top) / scale}px`,
        width: `${rect.width / scale}px`,
        height: `${rect.height / scale}px`,
      }),
  };
}

export function selectionWidth(rects) {
  return rects.reduce((width, rect) => width + rect.width, 0);
}

// Treat wrapped lines as one continuous selection. Dragging a handle onto an
// earlier/later line trims all the intervening text as well as the partial line.
export function offsetAtPoint(rects, point, flow) {
  if (!rects.length) return 0;
  const last = rects.at(-1);
  if (flow) {
    if (point.y < rects[0].top) return 0;
    const rows = Math.round((point.y - last.top - last.height / 2) / flow.lineHeight);
    if (rows > 0) {
      return (
        selectionWidth(rects) +
        flow.right -
        last.right +
        (rows - 1) * (flow.right - flow.left) +
        Math.max(0, Math.min(flow.right - flow.left, point.x - flow.left))
      );
    }
  }
  let closest = 0;
  let distance = Infinity;
  rects.forEach((rect, index) => {
    const gap = Math.abs(point.y - (rect.top + rect.height / 2));
    if (gap < distance) {
      closest = index;
      distance = gap;
    }
  });
  const limit = flow && closest === rects.length - 1 ? Infinity : rects[closest].width;
  return (
    selectionWidth(rects.slice(0, closest)) +
    Math.max(0, Math.min(limit, point.x - rects[closest].left))
  );
}

export function selectionWindow(rects, fraction) {
  const retained = selectionWidth(rects) * Math.max(0, Math.min(1, fraction));
  const kept = [];
  const removed = [];
  let offset = 0;
  for (const rect of rects) {
    const width = Math.max(0, Math.min(rect.width, retained - offset));
    if (width > 0) kept.push({ ...rect, right: rect.left + width, width });
    if (width < rect.width) {
      removed.push({ ...rect, left: rect.left + width, width: rect.width - width });
    }
    offset += rect.width;
  }
  const edge = kept.at(-1);
  return {
    kept,
    removed,
    boundary: edge ? { x: edge.right, y: edge.top + edge.height / 2 } : null,
  };
}

const SHIMMER_MS = 1400; // Matches rewrite-shimmer in style.css.
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function fittingPrefix(text, width, measure) {
  const chars = [...graphemes.segment(text)].map(item => item.segment);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(chars.slice(0, middle).join('')) <= width) low = middle;
    else high = middle - 1;
  }
  return chars.slice(0, low).join('');
}

export function fitPreviewLines(text, widths, measure) {
  let rest = text.trim();
  return widths.map((width, index) => {
    if (!rest) return '';
    const newline = rest.indexOf('\n');
    const paragraph = newline < 0 ? rest : rest.slice(0, newline);
    let line = fittingPrefix(paragraph, width, measure);
    if (line.length < paragraph.length && !/\s/u.test(paragraph[line.length])) {
      const wordBreak = line.search(/\s+\S*$/u);
      if (wordBreak > 0) line = line.slice(0, wordBreak);
    }
    rest = rest.slice(line.length).replace(/^[^\S\n]+/u, '');
    if (line === paragraph && rest.startsWith('\n')) rest = rest.slice(1);
    if (index === widths.length - 1 && rest) {
      line = fittingPrefix(line, Math.max(0, width - measure('…')), measure).trimEnd() + '…';
    }
    return line;
  });
}

export class RewritePreview {
  constructor(editor, range) {
    this.editor = editor;
    // A paragraph selection can end between blocks (or at the start of the
    // next block). Anchor preview space to the last selected text instead of
    // inserting an anonymous line outside the paragraph, after its margin.
    this.range = range.cloneRange();
    const lastText = textRangesIn(editor, range).findLast(part => part.toString().trim());
    if (lastText) this.range.setEnd(lastText.endContainer, lastText.endOffset);
    this.surface = editor.parentElement;
    this.element = document.createElement('div');
    this.element.className = 'rewrite-preview';
    this.element.setAttribute('aria-hidden', 'true');
    const start =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : range.startContainer;
    const style = getComputedStyle(start);
    for (const property of [
      'fontFamily',
      'fontSize',
      'fontWeight',
      'fontStyle',
      'letterSpacing',
      'direction',
    ]) {
      this.element.style[property] = style[property];
    }
    const canvas = document.createElement('canvas');
    const metrics = canvas.getContext('2d');
    metrics.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const spacing = parseFloat(style.letterSpacing) || 0;
    this.measure = text =>
      metrics.measureText(text).width +
      (spacing && Math.max(0, [...graphemes.segment(text)].length - 1) * spacing);
    this.surface.append(this.element);
    this.rects = selectionRects(editor, this.range);
  }
  updateExpansion(pixels, scale) {
    if (pixels <= 0) {
      this.expansion?.copy.remove();
      this.expansion = null;
      this.editor.classList.remove('expanding');
      return;
    }
    if (!this.expansion) {
      const copy = this.editor.cloneNode(true);
      copy.removeAttribute('id');
      copy.removeAttribute('contenteditable');
      copy.removeAttribute('role');
      copy.removeAttribute('aria-label');
      copy.removeAttribute('aria-multiline');
      copy.classList.remove('rewriting', 'expanding');
      copy.classList.add('rewrite-layout');
      copy.setAttribute('aria-hidden', 'true');
      const locate = node => {
        const path = [];
        while (node !== this.editor) {
          path.unshift([...node.parentNode.childNodes].indexOf(node));
          node = node.parentNode;
        }
        return path.reduce((parent, index) => parent.childNodes[index], copy);
      };
      const selected = document.createRange();
      selected.setStart(locate(this.range.startContainer), this.range.startOffset);
      selected.setEnd(locate(this.range.endContainer), this.range.endOffset);
      const spacer = document.createElement('span');
      spacer.className = 'rewrite-reserved-space';
      // Match the measuring font even if the selection ends in another style.
      for (const property of [
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'letterSpacing',
      ]) {
        spacer.style[property] = this.element.style[property];
      }
      const insertion = selected.cloneRange();
      insertion.collapse(false);
      insertion.insertNode(spacer);
      selected.setEndBefore(spacer);
      const expanded = selected.cloneRange();
      expanded.setEndAfter(spacer);
      const added = document.createRange();
      added.selectNodeContents(spacer);
      this.surface.insertBefore(copy, this.element);
      this.expansion = { copy, selected, expanded, spacer, added };
      this.editor.classList.add('expanding');
    }
    const width = pixels / scale;
    const spaceWidth = Math.max(1, this.measure(' '));
    const count = Math.max(1, Math.ceil(width / spaceWidth));
    // Sub-space precision prevents rounding the reservation ahead of the cursor.
    this.expansion.spacer.style.letterSpacing = `${width / count - spaceWidth}px`;
    if (this.expansion.count !== count) {
      this.expansion.spacer.textContent = ' '.repeat(count);
      this.expansion.added.selectNodeContents(this.expansion.spacer);
      this.expansion.count = count;
    }
  }
  render(fraction, text, expansionPixels, pending) {
    const { scale, place } = surfacePlacement(this.surface);
    this.baseRects = selectionRects(this.editor, this.range);
    const end =
      this.range.endContainer.nodeType === Node.TEXT_NODE
        ? this.range.endContainer.parentElement
        : this.range.endContainer;
    let block = end;
    while (block !== this.editor && getComputedStyle(block).display === 'inline') {
      block = block.parentElement;
    }
    const bounds = block.getBoundingClientRect();
    const style = getComputedStyle(block);
    const endStyle = getComputedStyle(end);
    this.lineFlow = {
      left:
        bounds.left +
        (parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) || 0) * scale,
      right:
        bounds.right -
        (parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth) || 0) * scale,
      lineHeight: (parseFloat(endStyle.lineHeight) || parseFloat(endStyle.fontSize) * 1.75) * scale,
    };
    this.updateExpansion(expansionPixels, scale);
    this.rects = this.expansion
      ? selectionRects(this.expansion.copy, this.expansion.expanded)
      : this.baseRects;
    const area = selectionWindow(this.rects, fraction);
    const pieces = [];
    const box = (rect, className, content = '') => {
      const element = document.createElement('span');
      element.className = className;
      element.textContent = content;
      place(element, rect);
      element.style.lineHeight = `${rect.height / scale}px`;
      pieces.push(element);
    };
    const originalRects = this.expansion
      ? selectionRects(this.expansion.copy, this.expansion.selected)
      : this.rects;
    for (const rect of originalRects) box(rect, 'rewrite-original-highlight');
    if (this.expansion) {
      for (const rect of selectionRects(this.expansion.copy, this.expansion.added)) {
        box(rect, 'rewrite-added-highlight');
      }
    }
    for (const rect of area.removed) box(rect, 'rewrite-discarded');
    if (text !== null) {
      const lines = fitPreviewLines(
        text,
        area.kept.map(rect => rect.width / scale),
        this.measure,
      );
      if (this.expansion) for (const rect of originalRects) box(rect, 'rewrite-replacement');
      area.kept.forEach((rect, index) =>
        box(rect, this.expansion ? 'rewrite-expanded-text' : 'rewrite-replacement', lines[index]),
      );
    }
    if (pending) {
      // Every paint rebuilds the spans, so phase the sweep off the clock to keep it continuous.
      const delay = `${-(performance.now() % SHIMMER_MS)}ms`;
      for (const rect of area.kept) {
        box(rect, 'rewrite-shimmer');
        pieces.at(-1).style.animationDelay = delay;
      }
    }
    this.element.replaceChildren(...pieces);
    return area;
  }
  remove() {
    this.expansion?.copy.remove();
    this.editor.classList.remove('expanding');
    this.element.remove();
  }
}

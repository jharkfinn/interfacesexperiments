import { selectionRects, surfacePlacement } from './rewrite-preview.js?v=0ef16eccfb75';

// Highlights drawn over the document, so the Sentences view can point at the
// text it stands for. Each kind of mark has its own layer, which a class in
// style.css colors. Marks sit over the text and never take the pointer.
export class DocumentMarks {
  constructor(editor) {
    this.editor = editor;
    this.surface = editor.parentElement;
    this.layers = new Map();
  }
  layer(kind) {
    let layer = this.layers.get(kind);
    if (!layer) {
      layer = document.createElement('div');
      layer.className = `doc-mark doc-mark-${kind}`;
      layer.setAttribute('aria-hidden', 'true');
      this.layers.set(kind, layer);
    }
    if (!layer.isConnected) this.surface.append(layer);
    return layer;
  }
  // Draws `kind` over a Range, or over a list of viewport rects. A collapsed
  // range draws a bar where text would go in. Without a target, or while the
  // editor is hidden, the mark is removed.
  set(kind, target) {
    if (!target || !this.editor.getClientRects().length) {
      this.layers.get(kind)?.replaceChildren();
      return;
    }
    const rects = Array.isArray(target)
      ? target
      : target.collapsed
        ? caretRects(target)
        : selectionRects(this.editor, target);
    const { place } = surfacePlacement(this.surface);
    this.layer(kind).replaceChildren(
      ...rects.map(rect => {
        const mark = document.createElement('span');
        place(mark, rect);
        return mark;
      }),
    );
  }
  clear() {
    for (const layer of this.layers.values()) layer.replaceChildren();
  }
}

// A bar two pixels wide at a collapsed range, or nothing where the browser
// gives the range no box.
function caretRects(range) {
  const rect = range.getBoundingClientRect();
  return rect.height ? [new DOMRect(rect.left - 1, rect.top, 2, rect.height)] : [];
}

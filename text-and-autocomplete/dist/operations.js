import { combineText } from './combine-core.js?v=412285b0ee1b';
import { combineRefusal, guardMessage, guardReplacement } from './citation-guard.js?v=5d0ebcbd173f';
import {
  planMove,
  planSpanMove,
  planBlockMove,
  planCombine,
  planRemove,
} from './doc-edits.js?v=24a55d3f7fd1';

// The operations a view's gestures can name. Each one changes the document
// through DocumentEdits, then chooses and flashes the text it changed, so every
// view shows the result the same way.
//
//   move     a sentence to a gap                 (source, gap)
//            or any piece to a place             (source, to)
//   combine  two sentences into one, by Claude   (source, target)
//   remove   a sentence                          (piece)
//   open     a piece in the Document view        (piece)
export const OPERATIONS = ['move', 'combine', 'remove', 'open'];

export class Operations {
  constructor({
    editor,
    model,
    edits,
    links,
    client,
    contextOf,
    notify,
    connect,
    open,
    interrupt,
  }) {
    Object.assign(this, {
      editor,
      model,
      edits,
      links,
      client,
      contextOf,
      notify,
      connect,
      openPiece: open,
      interrupt,
    });
    this.pending = null;
  }
  get busy() {
    return Boolean(this.pending) || this.edits.applying;
  }
  get applying() {
    return this.edits.applying;
  }
  has(command) {
    return this.edits.has(command);
  }
  forget() {
    this.edits.forget();
  }
  // A piece from a view is checked against the document as it is now.
  current(piece) {
    return piece && piece.version === this.model.read().version ? piece : null;
  }
  undo() {
    this.history('undo');
  }
  redo() {
    this.history('redo');
  }
  history(command) {
    if (this.pending) return;
    const changed = this.edits.history(command);
    this.model.refresh();
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
  // The text a change produced is chosen in every view and flashes. A landing
  // is a span ({block, start, end}), or a point whose sentence is chosen.
  land(landing, unit, origin, message) {
    this.model.refresh();
    const piece =
      landing &&
      (landing.end !== undefined
        ? landing
        : this.model.pieceAt(landing.block, landing.offset, unit));
    const range = piece && this.model.range(piece);
    if (range) {
      this.links.set('focus', { range, origin });
      this.links.emit('flash', { range, origin });
    }
    this.notify(message);
  }
  run(name, args, origin) {
    if (name === 'move') this.move(args, origin);
    else if (name === 'combine') void this.combine(args.source, args.target, origin);
    else if (name === 'remove') this.remove(args.piece, origin);
    else if (name === 'open') this.open(args.piece);
  }
  // A sentence moves to a sentence gap. A piece of any size moves to `to`:
  // whole paragraphs to a place between paragraphs ({before}: a block number),
  // other pieces into a paragraph ({block, offset, side}).
  move({ source, gap, to }, origin) {
    source = this.current(source);
    if (this.pending || !source) return;
    this.interrupt();
    let plan = null;
    if (gap) plan = planMove(this.editor, this.model, source, gap);
    else if (to?.before !== undefined) {
      plan = planBlockMove(this.editor, this.model, source.block, source.endBlock, to.before);
    } else if (to && (source.endBlock ?? source.block) === source.block) {
      plan = planSpanMove(this.editor, this.model, source, to);
    }
    if (!plan || !this.edits.apply(plan.steps)) {
      this.model.refresh();
      this.notify(
        to?.before !== undefined && !plan
          ? 'Moving paragraphs across a list is not supported yet. The document is unchanged.'
          : 'Could not move that there. The document is unchanged.',
      );
      return;
    }
    this.land(plan.landing, 'sentence', origin, 'Moved. Undo to put it back.');
  }
  remove(piece, origin) {
    piece = this.current(piece);
    if (this.pending || !piece) return;
    this.interrupt();
    const plan = planRemove(this.editor, this.model, piece);
    if (!plan || !this.edits.apply(plan.steps)) {
      this.model.refresh();
      this.notify('Could not remove that sentence. The document is unchanged.');
      return;
    }
    this.land(plan.landing, 'sentence', origin, 'Removed. Undo to bring it back.');
  }
  open(piece) {
    const range = this.model.range(this.current(piece));
    if (range) this.openPiece(range);
  }
  async combine(source, target, origin) {
    source = this.current(source);
    target = this.current(target);
    if (this.pending || !source || !target) return;
    // A merge rewords both sentences, so neither may carry the author's evidence or sit
    // in a block quotation.
    const { blocks } = this.model.read();
    const quoted = piece =>
      blocks
        .slice(piece.block, (piece.endBlock ?? piece.block) + 1)
        .some(block => block.kind === 'blockquote');
    const refusal = combineRefusal(target.text, source.text, quoted(target) || quoted(source));
    if (refusal) {
      this.client.diagnose?.('legal-guard', { operation: 'combine', reason: 'refused' });
      this.notify(refusal);
      return;
    }
    if (!this.client.ready) {
      this.connect();
      return;
    }
    this.interrupt();
    const html = this.editor.innerHTML;
    const targetRange = this.model.range(target);
    const sourceRange = this.model.range(source);
    const around = this.contextOf(targetRange);
    const request = {
      before: around.before,
      target: target.text,
      after: around.after,
      dragged: source.text,
    };
    const pending = { source, target };
    this.pending = pending;
    this.links.set('hover', null);
    this.links.set('focus', { range: targetRange, origin });
    this.links.set('pending', { source: sourceRange, target: targetRange });
    this.notify('Combining…');
    // The merged sentence may not add a citation, a quotation or a case name, drop a
    // short quotation either passage had, or say what a court held. Either passage
    // may come first in it.
    const doc = request.before + request.target + request.after;
    let rejected = null;
    const guard = text => {
      const reason =
        guardReplacement(doc, `${request.target} ${request.dragged}`, text) &&
        guardReplacement(doc, `${request.dragged} ${request.target}`, text);
      if (reason) {
        rejected = reason;
        this.client.diagnose?.('legal-guard', { operation: 'combine', reason });
      }
      return reason;
    };
    let text;
    try {
      text = combineText(await this.client.combine(request), request, guard);
    } catch (error) {
      // A cancelled combine has already said so.
      if (this.pending !== pending) return;
      this.settle();
      this.notify(
        error.name === 'AbortError'
          ? 'Combine cancelled. Original text kept.'
          : `${error.message} Original text kept.`,
      );
      return;
    }
    if (this.pending !== pending) return;
    this.settle();
    const problem = !text
      ? rejected
        ? guardMessage(rejected, 'The combined sentence')
        : 'No combined sentence came back. Try again.'
      : this.editor.innerHTML !== html
        ? 'The document changed.'
        : '';
    if (problem) {
      this.notify(`${problem} Original text kept.`);
      return;
    }
    const plan = planCombine(this.editor, this.model, source, target, text);
    if (!plan || !this.edits.apply(plan.steps)) {
      this.model.refresh();
      this.notify('Could not apply the combined sentence. Original text kept.');
      return;
    }
    this.land(plan.landing, 'sentence', origin, 'Combined into one sentence. Undo to restore.');
  }
  settle() {
    this.pending = null;
    this.links.set('pending', null);
  }
  cancel(announce = false) {
    if (!this.pending) return;
    this.settle();
    this.client.cancel();
    if (announce) this.notify('Combine cancelled. Original text kept.');
  }
}

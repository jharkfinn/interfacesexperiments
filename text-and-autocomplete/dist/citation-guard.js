// Citations, quotations and open items are the author's evidence. Claude may write the
// prose around them but must never invent, change or drop them, so every suggestion,
// rewrite and merge passes through these checks before the editor shows it.
import {
  findCitations,
  findReferences,
  quoteSpans,
  referenceNames,
  unseenCitations,
} from './legal-text.js';

// Contenteditable keeps typed spaces as nonbreaking ones; compare them as plain spaces.
// Each replaced character is one character, so offsets stay the same.
const plain = t => t.replace(/[\u00a0\u202f]/gu, ' ');

// Open items the author left for later: Claude must not fill them in or drop them.
export const PLACEHOLDER = /\[cite\]|\bTK\b|\((?:need|needs) to [^)]*\)|\bconfirm with client\b/gi;
// Where a case name, a reporter citation, a section, an id., a quotation or a signal
// begins. Autocomplete stops before any of these, so it never starts writing authority.
export const CITATION_START =
  /\b[A-Z][\w.'’&-]*(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&|ex rel\.))*\s+v\.?\s|\bIn re\s|\b\d{1,4}\s+(?:[A-Z][A-Za-z.'’]*\s?){1,4}(?:\d[a-z]{1,2}\s?)?(?:at\s+)?\*?\d{1,5}\b|§|¶|\b[Ii]d\.|\b[Ii]bid\.|\bsupra\b|\bat\s+\*?\d|\bNos?\.\s+\d|\b\d{4}\s+(?:WL|U\.S\.\s?Dist\.\s?LEXIS)\s|[“"‘]|(?:^|\s)(?:See|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,)\s/g;
// A paragraph that ends in a signal, or partway through a citation ("455 F.3d at").
const SIGNAL_TAIL =
  /(?:^|[\s(])(?:See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,?)\s*$/;
const CITATION_TAIL =
  /(?:\b(?:v|vs|No|Nos|[Ii]d|[Ii]bid)\.|§§?|¶)\s*$|\b\d{1,4}\s+(?:[A-Z][A-Za-z.'’]*\s?)+(?:\d[a-z]{1,2}\s?)?(?:at\s*)?$/;
// "Smith v. Jones": a case Claude names must already be named in the document.
const CASE_NAME =
  /\b[A-Z][\w.'’&-]*(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&))*\s+v\.\s+[A-Z][\w.'’&-]*/g;
// Words that say what a court decided. After a case name they claim a holding.
const HOLDING_VERB =
  /^(?:(?![.!?]["”’)]*(?:\s|$))[\s\S]){0,60}?\b(?:held|holds|found|finds|reasoned|concluded|ruled|stated|noted|explained|clarified|recognized)\b/;

const count = (text, re) => (text.match(re) || []).length;
const collapse = text => text.toLowerCase().replace(/\s+/g, ' ');

// Quotations that are not inside another one: a quotation within a quotation is
// checked as part of the outer one.
const outerQuotes = text =>
  quoteSpans(text)
    .sort((a, b) => a[0] - b[0] || b[1] - a[1])
    .filter(([s, e], i, all) => !all.slice(0, i).some(([os, oe]) => os <= s && e <= oe));

// Every text in `parts` appears in `text`, in the same order.
function keptInOrder(parts, text) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

// The text a selection or a sentence may not reword, as sorted [start, end, type] with
// overlaps merged: citations, quotations, open items, and the short names of cases
// cited in it ("Lakeside"). A merged span keeps the type of the span that starts first,
// so a citation inside a quotation counts as quotation.
export function protectedSpans(text) {
  text = plain(text);
  const cites = findCitations(text);
  const spans = [
    ...cites.filter(c => !c.nested).map(c => [c.start, c.end, 'citation']),
    ...quoteSpans(text).map(([s, e]) => [s, e, 'quotation']),
    ...[...text.matchAll(PLACEHOLDER)].map(m => [m.index, m.index + m[0].length, 'placeholder']),
    ...findReferences(text, cites).map(r => [r.start, r.end, 'name']),
  ].sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

// Whether the caret is partway through a quotation or a citation, given the text of
// its paragraph before it. Autocomplete stays quiet there, since anything it wrote
// would be quoted words or authority.
export function citationContext(paragraphBefore) {
  const text = plain(paragraphBefore);
  if (count(text, /“/g) > count(text, /”/g) || count(text, /"/g) % 2) return 'inside-quotation';
  if (SIGNAL_TAIL.test(text) || CITATION_TAIL.test(text)) return 'inside-citation';
  const end = text.trimEnd().length;
  if (findCitations(text).some(c => c.end === end)) return 'inside-citation';
  return null;
}

// An autocomplete insertion cut just before the first citation, signal or quotation it
// would start. What is left may be empty.
export function cutAtCitation(paragraphBefore, insertion) {
  const offset = paragraphBefore.length;
  for (const m of plain(paragraphBefore + insertion).matchAll(CITATION_START)) {
    if (m.index + m[0].length <= offset) continue;
    return insertion.slice(0, Math.max(0, m.index - offset)).replace(/[\s,;:(]+$/, '');
  }
  return insertion;
}

// Why new text may not be inserted into the document `doc`, or null. Inserted text may
// not cite, quote, or name a case the document does not already name.
export function guardInsertion(doc, text) {
  doc = plain(doc);
  text = plain(text);
  if (unseenCitations(doc, text).length) return 'new-citation';
  if (/[“”"]/.test(text)) return 'new-quotation';
  if ([...text.matchAll(CASE_NAME)].some(m => !doc.includes(m[0]))) return 'new-case-name';
  return null;
}

// The same for a drafted paragraph, which also may not bring numbers of its own: dates,
// amounts and durations about the client come from the author.
export function guardDraft(doc, text) {
  const reason = guardInsertion(doc, text);
  if (reason) return reason;
  const numbers = new Set(plain(doc).match(/\d+(?:[.,]\d+)*/g) || []);
  if ((plain(text).match(/\d+(?:[.,]\d+)*/g) || []).some(n => !numbers.has(n))) return 'new-number';
  return null;
}

// Why `replacement` may not replace `original` (part of `doc`), or null. The prose may
// change; the citations, quotations and open items must come through word for word,
// and the rewrite may not say what a court held in words the document does not use.
export function guardReplacement(doc, original, replacement) {
  doc = plain(doc);
  original = plain(original);
  const text = plain(replacement);
  if (unseenCitations(doc, text).length) return 'new-citation';
  const cites = findCitations(original).filter(c => !c.nested);
  if (
    !keptInOrder(
      cites.map(c => c.text),
      text,
    )
  )
    return 'citation-changed';
  const quotes = outerQuotes(original).map(([s, e]) => original.slice(s, e));
  if (!keptInOrder(quotes, text)) return 'quotation-changed';
  if (count(text, /[“”"]/g) > count(original, /[“”"]/g)) return 'new-quotation';
  if (count(text, PLACEHOLDER) < count(original, PLACEHOLDER)) return 'placeholder-removed';
  if ([...text.matchAll(CASE_NAME)].some(m => !doc.includes(m[0]))) return 'new-case-name';
  const said = collapse(doc);
  for (const name of referenceNames(findCitations(doc)).keys()) {
    const re = new RegExp(
      String.raw`(?<![\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w])`,
      'g',
    );
    for (const m of text.matchAll(re)) {
      const verb = text.slice(m.index + m[0].length).match(HOLDING_VERB);
      if (verb && !said.includes(collapse(m[0] + verb[0]))) return 'holding-claim';
    }
  }
  return null;
}

// Why a selection may not be rewritten or rephrased, as the notice to show, or null.
// A selection must take a citation or quotation whole or leave it alone, and a resize
// of text that is mostly citation would have almost nothing it may change.
export function selectionRefusal(before, selected, after, rephrase) {
  const left = before.slice(-400);
  const text = left + selected + after.slice(0, 400);
  const start = left.length + (selected.length - selected.trimStart().length);
  const end = left.length + selected.trimEnd().length;
  if (end <= start) return null;
  const spans = protectedSpans(text);
  const within = ([s, e]) => s <= start && end <= e;
  const evidence = spans.filter(([, , type]) => type === 'citation' || type === 'quotation');
  // One bound falls strictly inside the span and the other does not: the selection takes
  // part of it ("Lakeside, 455" of "Lakeside, 455 F.3d at 159"). Both inside, or the
  // span exactly, is a selection inside it.
  const inside = (x, [s, e]) => s < x && x < e;
  if (evidence.some(span => inside(start, span) !== inside(end, span)))
    return 'Select the whole citation or quotation, or none of it.';
  if (evidence.some(within)) return 'Citations and quotations keep their exact words.';
  if (spans.some(span => span[2] === 'name' && within(span)))
    return 'Case names keep their exact words.';
  if (!rephrase) {
    const visible = count(text.slice(start, end), /\S/g);
    let guarded = 0;
    for (const [s, e] of spans)
      guarded += count(text.slice(Math.max(s, start), Math.min(e, end)), /\S/g);
    if (guarded > 0.6 * visible)
      return 'This selection is mostly citation or quotation, which keep their exact words.';
  }
  return null;
}

// Why two sentences may not be merged, as the notice to show, or null. A merge rewords
// both, so neither may carry a citation, a real quotation, or an open item.
export function combineRefusal(target, dragged) {
  const evidence = text => {
    text = plain(text);
    if (findCitations(text).length || count(text, PLACEHOLDER)) return true;
    return quoteSpans(text).some(([s, e]) => count(text.slice(s, e), /[^\s“”"]+/g) >= 4);
  };
  return evidence(target) || evidence(dragged)
    ? 'Sentences with citations, quotations, or open items are not combined, so their words stay exact. Move them instead.'
    : null;
}

const MESSAGES = {
  'new-citation': 'added a citation that is not in the document',
  'citation-changed': 'changed a citation',
  'quotation-changed': 'changed a quotation',
  'new-quotation': 'added a quotation',
  'placeholder-removed': 'removed an open item such as [cite]',
  'new-case-name': 'named a case that is not in the document',
  'holding-claim': 'said what a court held in words the document does not use',
};

// The notice for a rejected version. `op` names what was rejected: "The rewrite",
// "The new wording" or "The combined sentence".
export function guardMessage(reason, op) {
  return MESSAGES[reason]
    ? `${op} ${MESSAGES[reason]}, so it was not used.`
    : `${op} was not used.`;
}

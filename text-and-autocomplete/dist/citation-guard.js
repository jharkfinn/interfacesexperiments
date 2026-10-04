// Citations, quotations and open items are the author's evidence. Claude may write the
// prose around them but must never invent, change or drop them, so every suggestion,
// rewrite and merge passes through these checks before the editor shows it.
import {
  citationKey,
  findCitations,
  findReferences,
  quoteSpans,
  referenceNames,
} from './legal-text.js';

// Contenteditable keeps typed spaces as nonbreaking ones; compare them as plain spaces.
// Each replaced character is one character, so offsets stay the same.
const plain = t => t.replace(/[\u00a0\u202f]/gu, ' ');

// Every pattern here keeps its repeated parts unambiguous and bounded: a name word runs
// from a capital to the next space, and a reporter word is one capital and lowercase
// letters. Looser patterns rescan a long all-caps heading ("Section 12 GOVERNING LAW AND
// JURISDICTION ...") in every possible way, which froze the page for seconds.
const MONTH = String.raw`(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\b`;
// The words of a reporter ("F. Supp.", "U.S.", "Cal. App."). The first has a period, so a
// date ("5 May 2024") or a time ("3 PM") is not taken for one.
const REPORTER_WORDS = String.raw`(?!${MONTH})(?=[A-Z][a-z'’]*\.)(?:[A-Z][a-z'’]*\.?\s?){1,6}`;
// A capitalized word of a case name, starting where its word starts.
const NAME_WORD = String.raw`(?<![\w.'’&-])[A-Z][\w.'’&-]*`;

// Open items the author left for later: Claude must not fill them in or drop them.
export const PLACEHOLDER = /\[cite\]|\bTK\b|\((?:need|needs) to [^)]*\)|\bconfirm with client\b/gi;
// Where a case name, a reporter citation, a section, an id., a quotation or a signal
// begins. Autocomplete stops before any of these, so it never starts writing authority.
// A signal counts only before what could begin authority ("See Lakeside", "See id."), so
// "See you then" is ordinary prose, and "at 3" counts only as a pin after a reporter
// ("455 F.3d, at 159") or a star page, so "meet at 3" is too.
export const CITATION_START = new RegExp(
  [
    String.raw`${NAME_WORD}(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&|ex rel\.)){0,12}\s+v\.?\s`,
    String.raw`\bIn re\s`,
    String.raw`\b\d{1,4}\s+${REPORTER_WORDS}(?:\d[a-z]{1,2}\s?)?(?:at\s+)?\*?\d{1,5}\b`,
    '§',
    '¶',
    String.raw`\b[Ii]d\.`,
    String.raw`\b[Ii]bid\.`,
    String.raw`\bsupra\b`,
    String.raw`\d[a-z]{0,2}\.?,\s*at\s+\*?\d`,
    String.raw`\bat\s+\*\d`,
    String.raw`\bNos?\.\s+\d`,
    String.raw`\b\d{4}\s+(?:WL|U\.S\.\s?Dist\.\s?LEXIS)\s`,
    String.raw`[„“‘]|(?<!\d)"|"(?=\w)`,
    String.raw`(?:^|\s)(?:See(?:,\s+e\.g\.,?)?|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,)\s+(?=[A-Z\d§¶„“"‘(]|id\.|ibid\.|also\b|generally\b|e\.g\.)`,
  ].join('|'),
  'g',
);
// A paragraph that ends in a signal, or partway through a citation ("455 F.3d at").
const SIGNAL_TAIL =
  /(?:^|[\s(])(?:See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,?)\s*$/;
const CITATION_TAIL = new RegExp(
  String.raw`(?:\b(?:v|vs|No|Nos|[Ii]d|[Ii]bid)\.|§§?|¶)\s*$|\b\d{1,4}\s+${REPORTER_WORDS}(?:\d[a-z]{1,2})?\s*(?:at\s*)?$|\b\d{4}\s+WL\s*$`,
);
// The end of an insertion that stops partway into a citation. "No." is left out: it ends
// sentences ("The answer is No."), and a docket number after it is cut anyway.
const PARTIAL_TAIL = new RegExp(
  String.raw`(?:\b(?:v|vs|[Ii]d|[Ii]bid)\.|§§?|¶)\s*$|\b\d{1,4}\s+[A-Z]\s*$|\b\d{1,4}\s+${REPORTER_WORDS}(?:\d[a-z]{1,2})?\s*(?:at\s*)?$|\b\d{4}\s+WL\s*$`,
);
// A signal left at the end of an insertion once the citation after it is cut ("…, see").
const TRAILING_SIGNAL =
  /(?:^|[\s(])(?:see(?:,?\s+e\.g\.,?|\s+also|\s+generally)?|cf\.|but\s+(?:see|cf\.)|accord|contra|compare|e\.g\.,?|quoting|citing)$/i;
// "Smith v. Jones": a case Claude names must already be named in the document.
const CASE_NAME = new RegExp(
  String.raw`${NAME_WORD}(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&)){0,12}\s+v\.\s+[A-Z][\w.'’&-]*`,
  'g',
);
// Words that say what a court decided. After a case name they claim a holding.
const HOLDING_VERB =
  /^(?:(?![.!?]["”’)]*(?:\s|$))[\s\S]){0,60}?\b(?:held|holds|found|finds|reasoned|concluded|ruled|stated|noted|explained|clarified|recognized)\b/;
// Quotation marks. ’ is left out, since it is also the apostrophe, and so is a " after a
// number (a 9" pan), which is an inch mark.
const QUOTE_MARKS = /[„“”‘]|(?<!\d)"|"(?=\w)/g;
// Whether the " at `i` is an inch mark ("9\" pan") rather than a quotation mark, given
// whether a straight quotation is open before it.
const inchMark = (text, i, open) =>
  !open && /\d/.test(text[i - 1]) && !/\w/.test(text[i + 1] ?? '');
// Capitalized words that begin sentences rather than case names. The citation parser
// takes them into a name ("In Smith v. Jones, …", "Under United States v. …"), but a
// rewrite may change them like any other prose.
const NOT_NAME = new Set(
  `A About According Accordingly After Again Also Although An And Applying As At Based Because
  Before Both But By Citing Compare Contra Despite Distinguishing Each Even Following For From
  Further Furthermore Given Here However In Indeed Like Likewise Moreover Notably Of On Only Or
  Per Quoting See Similarly Since So That The Then There These Thus This Those Though Through
  To Under Unlike When Where Whereas While With Within Yet`.split(/\s+/),
);

const count = (text, re) => (text.match(re) || []).length;
const collapse = text => text.toLowerCase().replace(/\s+/g, ' ');

// Guards run once per version Claude returns, with the same document each time, so the
// document's citations are parsed once.
let parsed = { text: null, cites: [] };
function citationsOf(text) {
  if (parsed.text !== text) parsed = { text, cites: findCitations(text) };
  return parsed.cites;
}

// A name with the sentence words the parser took into it removed ("Under United States"
// and "in Lakeside" become "United States" and "Lakeside"). It keeps at least its last
// word, and "In re" stays whole.
function stripLead(name) {
  for (;;) {
    const m = name.match(/^(\S+?),?\s+(?=\S)/);
    if (!m || /^In\s+re\b/.test(name)) return name;
    if (!NOT_NAME.has(m[1]) && !NOT_NAME.has(m[1][0].toUpperCase() + m[1].slice(1))) return name;
    name = name.slice(m[0].length);
  }
}

// The part of a citation that must be copied exactly: all of it except sentence words
// the parser read as the start of its case name.
function exactText(c) {
  const name = c.type === 'supra' ? c.antecedent : c.name;
  if (!name || !c.text.startsWith(name)) return c.text;
  return stripLead(name) + c.text.slice(name.length);
}

// Citations in `cites` that the document `doc` does not cite at all.
function unseen(doc, cites) {
  const known = new Set(citationsOf(doc).map(citationKey).filter(Boolean));
  return cites.filter(c => {
    const key = citationKey(c);
    return key && !known.has(key);
  });
}

// A case name in `text` the document does not use, with or without the sentence words
// the pattern takes in front of it.
function newCaseName(doc, text) {
  return [...text.matchAll(CASE_NAME)].some(
    ([name]) => !doc.includes(name) && !doc.includes(stripLead(name)),
  );
}

// Merges overlapping [start, end] spans, sorted by start.
function merge(spans) {
  const merged = [];
  for (const span of [...spans].sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    const last = merged.at(-1);
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

// Curly double quotations, “English” and „German“ (where “ closes), as the closed
// [start, end] spans and the starts of those still open.
function curlyQuotes(text) {
  const spans = [];
  const open = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '„') open.push(i);
    else if (c === '“') {
      if (text[open.at(-1)] === '„') spans.push([open.pop(), i + 1]);
      else open.push(i);
    } else if (c === '”' && text[open.at(-1)] === '“') spans.push([open.pop(), i + 1]);
  }
  return { spans, open };
}

// Every quotation in `text`, as merged [start, end] spans. Beyond the balanced double
// quotations quoteSpans finds, a “ that never closes quotes to the end of its paragraph,
// straight quotes it could not pair (a stray space in `, " [t]o … lives."`) are paired in
// order, and ‘single’ and „German“ quotations count too. A slip in the quotation marks
// must not leave quoted words open to change.
function quotations(text) {
  const spans = quoteSpans(text);
  const paragraphEnd = i => {
    const end = text.indexOf('\n', i);
    return end < 0 ? text.length : end;
  };
  const curly = curlyQuotes(text);
  spans.push(...curly.spans, ...curly.open.map(i => [i, paragraphEnd(i)]));
  const singles = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') singles.length = 0;
    else if (c === '‘') singles.push(i);
    // A ’ inside a word ("club’s") is an apostrophe, not the end of a quotation.
    else if (c === '’' && singles.length && !/[\p{L}\p{N}]/u.test(text[i + 1] ?? ''))
      spans.push([singles.pop(), i + 1]);
  }
  if (text.includes('"') && !spans.some(([s]) => text[s] === '"')) {
    let open = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') open = -1;
      else if (text[i] === '"' && !inchMark(text, i, open >= 0)) {
        if (open < 0) open = i;
        else {
          spans.push([open, i + 1]);
          open = -1;
        }
      }
    }
  }
  return merge(spans);
}

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
// cited ("Lakeside"). A merged span keeps the type of the span that starts first, so a
// citation inside a quotation counts as quotation. `names` are the case names of the
// whole document; by default only the citations in `text` give them.
export function protectedSpans(text, names) {
  text = plain(text);
  const cites = findCitations(text);
  const spans = [
    ...cites.filter(c => !c.nested).map(c => [c.start, c.end, 'citation']),
    ...quotations(text).map(([s, e]) => [s, e, 'quotation']),
    ...[...text.matchAll(PLACEHOLDER)].map(m => [m.index, m.index + m[0].length, 'placeholder']),
    ...findReferences(text, cites, names ?? referenceNames(cites)).map(r => [
      r.start,
      r.end,
      'name',
    ]),
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
  if (curlyQuotes(text).open.length || openQuote(text)) return 'inside-quotation';
  if (SIGNAL_TAIL.test(text) || CITATION_TAIL.test(text)) return 'inside-citation';
  const end = text.trimEnd().length;
  if (findCitations(text).some(c => c.end === end)) return 'inside-citation';
  return null;
}

// A straight quotation, or a ‘single’ one, that has not closed yet in this paragraph.
function openQuote(text) {
  let straight = false;
  let single = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && !inchMark(text, i, straight)) straight = !straight;
    else if (c === '‘') single++;
    else if (c === '’' && single && !/[\p{L}\p{N}]/u.test(text[i + 1] ?? '')) single--;
  }
  return straight || single > 0;
}

// An autocomplete insertion cut just before the first citation, signal or quotation it
// would start, or that it stops partway into ("Lakeside, 455 F.3d at"). A case name
// goes with its citation, and a signal left at the end goes too. What is left may be
// empty.
export function cutAtCitation(paragraphBefore, insertion) {
  const offset = paragraphBefore.length;
  const text = plain(paragraphBefore + insertion);
  let cut = text.length;
  for (const m of text.matchAll(CITATION_START)) {
    if (m.index + m[0].length <= offset) continue;
    cut = m.index;
    break;
  }
  // The parser also knows citations the pattern does not start at: the name of
  // "Lakeside, 455 F.3d at 159", the title of "42 U.S.C. § 3602", or "Fed. R. Civ. P. 12".
  const cite = findCitations(text).find(c => c.end > offset);
  if (cite) cut = Math.min(cut, cite.start);
  // What is left may still stop partway into a citation ("42 U.S. Code" before a cut "§",
  // or a reply that ends at "Lakeside, 455 F.3d at"), or end in the signal before one.
  for (let last; last !== cut; ) {
    last = cut;
    const head = text.slice(0, cut);
    const tail = head.match(SIGNAL_TAIL) || head.match(PARTIAL_TAIL);
    if (tail && tail.index + tail[0].length > offset) cut = tail.index;
  }
  if (cut === text.length) return insertion;
  let kept = insertion.slice(0, Math.max(0, cut - offset));
  for (let last; last !== kept; ) {
    last = kept;
    kept = kept.replace(/[\s,;:(]+$/, '').replace(TRAILING_SIGNAL, '');
  }
  return kept;
}

// Why new text may not be inserted into the document `doc`, or null. Inserted text may
// not cite, quote, or name a case the document does not already name, and a citation it
// copies must be in the document word for word, pin cite and all.
export function guardInsertion(doc, text) {
  doc = plain(doc);
  text = plain(text);
  const cites = findCitations(text);
  if (cites.length) {
    if (unseen(doc, cites).length) return 'new-citation';
    if (cites.some(c => !c.nested && !doc.includes(exactText(c)))) return 'new-citation';
  }
  if (count(text, QUOTE_MARKS)) return 'new-quotation';
  if (newCaseName(doc, text)) return 'new-case-name';
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
// none may be added, and the rewrite may not say what a court held in words the
// document does not use.
export function guardReplacement(doc, original, replacement) {
  doc = plain(doc);
  original = plain(original);
  const text = plain(replacement);
  const added = findCitations(text).filter(c => !c.nested);
  if (unseen(doc, added).length) return 'new-citation';
  const cites = findCitations(original).filter(c => !c.nested);
  // Each citation is kept, in order, and nothing is added to one or copied in from
  // elsewhere ("at 159" becoming "at 159, 881").
  if (
    !keptInOrder(cites.map(exactText), text) ||
    added.length > cites.length ||
    added.some(c => !original.includes(exactText(c)))
  )
    return 'citation-changed';
  const quotes = quotations(original).map(([s, e]) => original.slice(s, e));
  if (!keptInOrder(quotes, text)) return 'quotation-changed';
  if (count(text, QUOTE_MARKS) > count(original, QUOTE_MARKS)) return 'new-quotation';
  if (!keptInOrder(original.match(PLACEHOLDER) || [], text)) return 'placeholder-removed';
  if (newCaseName(doc, text)) return 'new-case-name';
  const said = collapse(doc);
  for (const name of referenceNames(citationsOf(doc)).keys()) {
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

const KEEP_WORDS = 'Citations and quotations keep their exact words.';

// Why a selection may not be rewritten or rephrased, as the notice to show, or null.
// A selection must take a citation or quotation whole or leave it alone, and a resize
// of text that is mostly citation would have almost nothing it may change. A selection
// in a block quotation (`blockQuote`, which the text alone cannot show) is all quotation.
export function selectionRefusal(before, selected, after, rephrase, blockQuote = false) {
  // The whole document is read: a long quotation can open far before the selection, and
  // a case is often named far from its citation.
  const text = before + selected + after;
  const start = before.length + (selected.length - selected.trimStart().length);
  const end = before.length + selected.trimEnd().length;
  if (end <= start) return null;
  if (blockQuote) return KEEP_WORDS;
  const spans = protectedSpans(text, referenceNames(citationsOf(plain(text))));
  const within = ([s, e]) => s <= start && end <= e;
  const evidence = spans.filter(([, , type]) => type === 'citation' || type === 'quotation');
  // One bound falls strictly inside the span and the other does not: the selection takes
  // part of it ("Lakeside, 455" of "Lakeside, 455 F.3d at 159"). Both inside, or the
  // span exactly, is a selection inside it.
  const inside = (x, [s, e]) => s < x && x < e;
  if (evidence.some(span => inside(start, span) !== inside(end, span)))
    return 'Select the whole citation or quotation, or none of it.';
  if (evidence.some(within)) return KEEP_WORDS;
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
// both, so neither may carry a citation, a real quotation, or an open item, nor sit in
// a block quotation (`blockQuote`).
export function combineRefusal(target, dragged, blockQuote = false) {
  const evidence = text => {
    text = plain(text);
    if (findCitations(text).length || count(text, PLACEHOLDER)) return true;
    return quotations(text).some(([s, e]) => count(text.slice(s, e), /[^\s“”"‘’]+/g) >= 4);
  };
  return blockQuote || evidence(target) || evidence(dragged)
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

import { findCitations, quoteSpans } from './legal-text.js?v=0bb9b215a317';

// Checks the authorities a document cites against Midpage, a legal research
// database, through the reader's own Midpage connector on claude.ai (the page's
// `mcp` capability). Nothing is sent until the reader asks for a check.
//
// What it sends, per authority: the citation (a reporter citation, a case name
// with its docket or database number, or a code section) and the quotations the
// document attributes to that authority alone. It never sends the document's
// own sentences: a quotation is sent only when every citation in its sentence
// names that one authority and the sentence is not a client fact.
//
// What it checks, and how far each answer goes:
// - The citation leads to a real case or provision. The case name, court and
//   decision date come from Midpage's records and are compared here with what
//   the document says.
// - Each quotation is in the source word for word. Midpage returns passages it
//   quotes from the source; the comparison with the document's words is made
//   here, so a match is never Midpage's say-so.
// - Each pin is inside the opinion, and each quotation is on the page cited.
//   Midpage reports page numbers only when its copy of the opinion has them,
//   and only in its own words; these are shown as Midpage's reading.
// - Later decisions that treat a case negatively or with caution, as Midpage
//   lists them. Midpage's list is not a full citator.
// It does not check that a source supports the sentence that cites it: that
// would mean sending the sentence.

export const SERVER = 'Midpage Legal Research';
export const TOOLS = ['analyzeCaseDocument', 'analyzeLaw', 'search', 'searchLaws'];

// Quotations shorter than this are terms ("residence"), not passages to find.
const MIN_QUOTE_WORDS = 4;
// A quotation longer than this goes to Midpage in parts, so each part can be found.
const PART_CHARS = 600;
// How much quotation text one question carries.
const QUESTION_CHARS = 3200;
const STORE_KEY = 'text-and-autocomplete.cite-check';
const STORE_LIMIT = 100;
const CONCURRENCY = 2;

const words = text => (text.match(/\S+/gu) || []).length;
const squash = text => text.replace(/\s+/g, ' ').trim();
const digits = text => (String(text || '').match(/\d+/g) || []).map(Number);

// ---------------------------------------------------------------------------
// What to check
// ---------------------------------------------------------------------------

// planChecks(reading, blocks) reads, for each case and statute in the reading's
// table of authorities, what can be checked and how:
// [{
//   key, name, title,        // the authority's, from the reading
//   kind,                    // case or law
//   how,                     // citation (look it up by its citation), search (find it
//                            // by name first) or none (nothing to look it up by)
//   citation,                // "455 F.3d 154", "42 U.S.C. § 3602", or null
//   find,                    // for search: {name, volume, reporter, docket, database, court, year}
//   caseName, court, year,   // as the document gives them, or null
//   pins: [{pin, first, last, span}],   // the distinct pins the document cites
//   quotes: [{text, pin, first, last, parts, span}],  // quotations attributed to it alone
//   skipped: [{why, span}],  // quotations that are not sent, and why
//   why,                     // for how none: why it cannot be checked
//   signature,               // what the check depends on, for keeping results
// }]
export function planChecks(reading, blocks) {
  const plans = [];
  for (const authority of reading?.authorities || []) {
    if (authority.group !== 'cases' && authority.group !== 'statutes') continue;
    plans.push(planFor(authority, reading, blocks));
  }
  return plans;
}

function planFor(authority, reading, blocks) {
  const kind = authority.group === 'cases' ? 'case' : 'law';
  const parsed = authority.mentions
    .filter(mention => mention.type !== 'reference')
    .map(mention => {
      const text = blocks[mention.block]?.text.slice(mention.start, mention.end) || '';
      return { mention, text, cite: findCitations(text)[0] || null };
    });
  const plan = {
    key: authority.key,
    name: authority.name,
    title: authority.title,
    kind,
    how: 'none',
    citation: null,
    find: null,
    caseName: null,
    court: authority.court || null,
    year: null,
    pins: [],
    quotes: [],
    skipped: [],
    why: null,
  };
  if (kind === 'case') {
    const full = parsed.find(item => item.cite?.type === 'full' && item.cite.page)?.cite;
    const docket = parsed.find(item => item.cite?.type === 'docket')?.cite;
    const short = parsed.find(item => item.cite?.type === 'short' && item.cite.volume)?.cite;
    if (full && foreign(full)) {
      plan.why = 'Midpage covers United States law only.';
    } else if (full) {
      plan.how = 'citation';
      plan.citation = `${full.volume} ${full.reporter} ${full.page}`;
      plan.caseName = full.name || null;
      plan.year = full.year || null;
      plan.court = full.court || plan.court;
      // If Midpage does not match the citation as written, the case is looked for by name.
      if (full.name) {
        plan.find = {
          name: full.name,
          volume: full.volume,
          reporter: full.reporter,
          page: full.page,
          court: plan.court,
          year: plan.year,
        };
      }
    } else if (docket?.name) {
      plan.how = 'search';
      plan.caseName = docket.name;
      plan.year = docket.year || null;
      plan.court = docket.court || plan.court;
      plan.find = {
        name: docket.name,
        docket: docket.docket || null,
        database: docket.database ? docket.database.replace(/,?\s*at\s.*$/, '') : null,
        court: plan.court,
        year: plan.year,
      };
    } else if (short?.reporter && authority.name) {
      plan.how = 'search';
      plan.find = { name: authority.name, volume: short.volume, reporter: short.reporter };
    } else {
      plan.why = 'There is no reporter citation, docket number or case name to look it up by.';
    }
  } else {
    // The title is the citation in the document's best form; a mention is the fallback.
    plan.citation =
      sectionCitation(authority.title) ||
      sectionCitation(parsed.find(item => item.cite?.type === 'statute')?.text);
    if (plan.citation) plan.how = 'citation';
    else plan.why = 'There is no code section to look it up by.';
  }
  // Pins, from every citation of this authority the document makes itself.
  const pins = new Map();
  for (const { mention, text, cite } of parsed) {
    if (mention.state === 'quoted') continue;
    const pin = pinOf(cite, text);
    if (pin && !pins.has(pin.pin)) pins.set(pin.pin, { ...pin, span: spanOf(mention) });
  }
  for (const sentence of reading.sentences || []) {
    for (const cite of sentence.cites || []) {
      if (cite.key !== authority.key || cite.state === 'quoted') continue;
      const pin = pinOf(findCitations(cite.text)[0], cite.text);
      if (pin && !pins.has(pin.pin)) {
        pins.set(pin.pin, {
          ...pin,
          span: { block: sentence.block, start: cite.start, end: cite.end },
        });
      }
    }
  }
  plan.pins = [...pins.values()];
  quotationsFor(plan, reading, blocks);
  plan.signature = signatureOf(plan);
  return plan;
}

// English, Scottish, Irish, Canadian, Australian and New Zealand citations:
// "[1990] 1 WLR 491", "[2004] EWCA Crim 631", "2019 SCC 65".
const FOREIGN_COURT =
  /^(?:UK|EW|CS|HCJ|NI|IE|SCC|SCR|FCA?$|ON|BC|AB|QC|NS|NB|MB|SK|NL|PE|YK|NWT|NU|TCC|CMAC|CanLII|HCA|NSW|VSC|QCA|NZ)/;
function foreign(cite) {
  return /^\[/.test(cite.volume || '') || (cite.neutral && FOREIGN_COURT.test(cite.reporter || ''));
}

// "42 U.S.C. § 3602(b), (c)" → "42 U.S.C. § 3602": the section, without
// subsections, parentheticals or a second section.
export function sectionCitation(text) {
  let cite = squash(String(text || '')).replace(
    /^(?:see(?:,? e\.g\.,?)?|cf\.|accord|but see|see also|compare)\s+/i,
    '',
  );
  const several = /§§/.test(cite);
  cite = cite.replace(/§§/g, '§');
  // Up to a date or publisher in parentheses, a second subsection or section, or
  // a pin ("U.S. Const. art. I, § 8" keeps its section).
  cite = cite.split(/\s\(|,\s(?=\(|\d|and\b|at\b|&)|;\s/)[0];
  cite = cite.replace(/([\w.:/-]*\d[\w.:/-]*?)(?:\s?\([^)]*\))+$/, '$1');
  // A range of sections checks its first; a hyphen inside a section number stays.
  const range = several
    ? /(\d[\w.:/]*)\s*[-–—]\s*\d[\w.:/-]*$/
    : /(\d[\w.:/-]*)\s*[–—]\s*\d[\w.:/-]*$/;
  cite = cite
    .replace(/\s+et\s+seq\.?$/i, '')
    .replace(range, '$1')
    .replace(/[.,;:]+$/, '');
  return /\d/.test(cite) && /[A-Za-z]/.test(cite) ? cite : null;
}

const spanOf = mention => ({ block: mention.block, start: mention.start, end: mention.end });

// A pin's first and last page: "159–60" → 159..160; "¶ 22" and "*3" have no pages
// to compare.
function pinOf(cite, text) {
  const pin = cite?.pin ? String(cite.pin).trim() : null;
  if (!pin || /^[*¶§]/.test(pin) || /^at\s*\*/.test(pin))
    return pin ? { pin, first: null, last: null } : null;
  const match = pin.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?/);
  if (!match) return { pin, first: null, last: null };
  const first = Number(match[1]);
  let last = first;
  if (match[2]) {
    // "159–60" means 160: the second number keeps the first's leading digits.
    const end = match[2];
    last =
      end.length < match[1].length
        ? Number(match[1].slice(0, match[1].length - end.length) + end)
        : Number(end);
    if (last < first) last = first;
  }
  return { pin, first, last };
}

// The quotations each sentence attributes to this authority alone. A block
// quotation is the whole block less its citations.
function quotationsFor(plan, reading, blocks) {
  const seen = new Set();
  const add = (text, sentence, cite, start) => {
    const clean = quotationText(text);
    if (words(clean) < MIN_QUOTE_WORDS || seen.has(clean)) return;
    seen.add(clean);
    const pin = pinOf(findCitations(cite.text)[0], cite.text) || {
      pin: null,
      first: null,
      last: null,
    };
    plan.quotes.push({
      text: clean,
      ...pin,
      parts: partsOf(clean),
      span: { block: sentence.block, start, end: start + text.length },
    });
  };
  const byBlock = new Map();
  for (const sentence of reading.sentences || []) {
    if (!byBlock.has(sentence.block)) byBlock.set(sentence.block, []);
    byBlock.get(sentence.block).push(sentence);
  }
  for (const [index, sentences] of byBlock) {
    const block = blocks[index];
    if (!block) continue;
    const ours = sentences.flatMap(sentence =>
      (sentence.cites || []).filter(cite => cite.state === 'own').map(cite => ({ sentence, cite })),
    );
    const mine = ours.filter(({ cite }) => cite.key === plan.key);
    if (!mine.length) continue;
    const quote = /^blockquote$/i.test(block.kind);
    for (const sentence of quote ? [sentences[0]] : sentences) {
      const own = quote
        ? ours.map(item => item.cite)
        : (sentence.cites || []).filter(cite => cite.state === 'own');
      if (!own.some(cite => cite.key === plan.key)) continue;
      const spans = quote
        ? [[0, block.text.length]]
        : outermost(quoteSpans(sentence.text)).map(([a, b]) => [
            a + sentence.start,
            b + sentence.start,
          ]);
      if (!spans.length) continue;
      const span = { block: index, start: spans[0][0], end: spans[spans.length - 1][1] };
      const keys = new Set(own.map(cite => cite.key));
      if (keys.size > 1 || keys.has(null)) {
        plan.skipped.push({
          why: keys.has(null)
            ? 'Its sentence also cites the record or a source with no full citation.'
            : 'Its sentence cites more than one source.',
          span,
        });
        continue;
      }
      if (
        (quote ? sentences : [sentence]).some(
          item => item.kind === 'client-fact' || item.role === 'facts',
        )
      ) {
        plan.skipped.push({ why: 'It is in a statement of the client’s facts.', span });
        continue;
      }
      const cite = own.find(item => item.key === plan.key);
      const nested = (sentence.cites || []).filter(item => item.state === 'nested');
      for (const [start, end] of spans) {
        if (nested.some(item => item.start <= start && end <= item.end)) continue;
        // A citation inside the quoted span (a block quotation's own) is not quoted text.
        let text = block.text.slice(start, end);
        if (quote) {
          for (const item of [...own].sort((a, b) => b.start - a.start)) {
            if (item.start >= start && item.end <= end) {
              text = text.slice(0, item.start - start) + ' ' + text.slice(item.end - start);
            }
          }
          text = text.replace(/\s*[.;,]?\s*$/, '');
        }
        add(text, sentence, cite, start);
      }
    }
  }
}

// A quotation as sent and compared: without the marks that enclose all of it,
// and with the double marks inside it made single, as a quotation inside a
// quotation is written.
export function quotationText(text) {
  let value = squash(text);
  const spans = outermost(quoteSpans(value));
  if (spans.length === 1 && spans[0][0] === 0 && spans[0][1] === value.length) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/“|"(?=\w)/g, '‘').replace(/”|"/g, '’');
}

// Quotation spans not inside another.
const outermost = spans =>
  spans
    .filter(([a, b]) => !spans.some(([c, d]) => (c < a && b <= d) || (c <= a && b < d)))
    .sort((x, y) => x[0] - y[0]);

// A long quotation in parts of up to PART_CHARS, cut between words.
function partsOf(text) {
  if (text.length <= PART_CHARS) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > PART_CHARS) {
    let cut = rest.lastIndexOf('. ', PART_CHARS);
    if (cut < PART_CHARS / 2) cut = rest.lastIndexOf(' ', PART_CHARS);
    if (cut < 1) cut = PART_CHARS;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

function signatureOf(plan) {
  return hash(
    JSON.stringify([
      plan.key,
      plan.how,
      plan.citation,
      plan.find,
      plan.caseName,
      plan.court,
      plan.year,
      plan.pins.map(pin => pin.pin),
      plan.quotes.map(quote => [quote.text, quote.pin]),
    ]),
  );
}

function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

// ---------------------------------------------------------------------------
// The questions
// ---------------------------------------------------------------------------

// The calls a check makes once it knows which document to read: one question per
// batch of quotations, so no question grows too long.
export function questionsFor(plan) {
  const items = plan.quotes.flatMap((quote, q) =>
    quote.parts.map((part, p) => ({
      q,
      p,
      part,
      label: quote.parts.length > 1 ? `${q + 1}${'abcdefghij'[p] || p}` : `${q + 1}`,
    })),
  );
  const batches = [];
  let batch = [];
  let size = 0;
  for (const item of items) {
    if (batch.length && size + item.part.length > QUESTION_CHARS) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(item);
    size += item.part.length;
  }
  if (batch.length || !batches.length) batches.push(batch);
  return batches.map((items, index) => {
    const lines = [];
    if (plan.kind === 'case') {
      lines.push('Answer only from this opinion. Answer each numbered item.');
      if (index === 0 && plan.pins.some(pin => pin.first !== null)) {
        lines.push(
          'Pages: give the first and last reporter pages of the opinion, written as "pages A-B". If the text has no reporter page numbers, say so.',
        );
      }
      for (const item of items) {
        lines.push(
          `Quotation ${item.label}: does the opinion contain these words, word for word? "${item.part}" If it does, quote the whole passage verbatim and give the reporter page it is on, written as "page N".`,
        );
      }
      if (!items.length && index === 0 && !plan.pins.some(pin => pin.first !== null)) {
        lines.push('Give the case name, the court and the date of decision.');
      }
    } else {
      lines.push('Answer only from this provision. Answer each numbered item.');
      for (const item of items) {
        lines.push(
          `Quotation ${item.label}: does the provision contain these words, word for word? "${item.part}" If it does, quote the whole passage verbatim.`,
        );
      }
      if (!items.length) lines.push('What does this provision cover?');
    }
    return { items, question: lines.join('\n') };
  });
}

// The search that finds a case the document cites without a reporter citation.
export function searchInput(plan) {
  const find = plan.find;
  const queries = [{ query: find.name }];
  if (find.docket) queries.push({ query: `${find.name} ${find.docket.replace(/^No\.\s*/i, '')}` });
  else if (find.volume) queries.push({ query: `${find.name} ${find.volume} ${find.reporter}` });
  return { queries };
}

// ---------------------------------------------------------------------------
// Reading the answers
// ---------------------------------------------------------------------------

const QUOTES = /[“”"‘’'`´«»]/g;
const DASHES = /[‐‑‒–—―-]/g;
const ELLIPSIS = /\s*(?:\.\s?\.\s?\.(?:\s?\.)?|…)\s*/;
// Exact: the same characters, ignoring spaces, quotation marks and the kind of dash.
const exactForm = text =>
  text.normalize('NFKC').replace(QUOTES, '').replace(DASHES, '-').replace(/\s+/g, '');
// Words: the same letters and digits in the same order.
const wordForm = text =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// The pieces of a quotation the source must contain, in order: what is left
// between ellipses and bracketed changes ("[t]he", "[the facility]").
export function fragmentsOf(quotation) {
  return quotation
    .split(ELLIPSIS)
    .flatMap(piece => piece.split(/\[[^\]]{0,60}\]/))
    .map(piece => piece.trim())
    .filter(piece => wordForm(piece).length >= 6 || words(piece) >= 2);
}

// matchQuotation(quotation, passages) compares a quotation with the passages
// Midpage quoted from the source: exact (every piece, character for character),
// words (the same words; punctuation or capitals differ), partial (some pieces),
// or missing. Returns {state, missing: the first piece not found, passage: the
// passage it was found in}.
export function matchQuotation(quotation, passages) {
  const sources = passages.filter(Boolean);
  const fragments = fragmentsOf(quotation);
  if (!fragments.length) return { state: 'missing', missing: quotation, passage: null };
  const find = form => {
    for (const passage of sources) {
      const haystack = form(passage);
      let at = 0;
      let ok = true;
      for (const fragment of fragments) {
        const found = haystack.indexOf(form(fragment), at);
        if (found < 0) {
          ok = false;
          break;
        }
        at = found + form(fragment).length;
      }
      if (ok) return passage;
    }
    // Pieces may come from different passages.
    const all = fragments.every(fragment =>
      sources.some(passage => form(passage).includes(form(fragment))),
    );
    return all ? sources.find(passage => form(passage).includes(form(fragments[0]))) : null;
  };
  const exact = find(exactForm);
  if (exact) return { state: 'exact', missing: null, passage: exact };
  const same = find(wordForm);
  if (same) return { state: 'words', missing: null, passage: same };
  // Which pieces, or halves of a lone piece, are there.
  const pieces =
    fragments.length > 1
      ? fragments
      : (() => {
          const all = fragments[0].split(/\s+/);
          const half = Math.ceil(all.length / 2);
          return [all.slice(0, half).join(' '), all.slice(half).join(' ')].filter(
            piece => words(piece) >= 3,
          );
        })();
  const found = pieces.filter(piece =>
    sources.some(passage => wordForm(passage).includes(wordForm(piece))),
  );
  if (found.length) {
    const missing = pieces.find(piece => !found.includes(piece));
    return {
      state: 'partial',
      missing: missing || null,
      passage: sources.find(passage => wordForm(passage).includes(wordForm(found[0]))),
    };
  }
  return { state: 'missing', missing: fragments[0], passage: null };
}

// Page numbers in Midpage's own words: a range ("pages 154-162") and single
// pages ("page 159").
export function pagesIn(text) {
  const value = String(text || '');
  const range = value.match(
    /\bpages?\s+(?:(?:are|is|from)\s+)?(\d{1,5})\s*(?:-|–|—|to|through)\s*(\d{1,5})\b/i,
  );
  const pages = [
    ...value.matchAll(
      /\bpages?\s+(?:(?:is|as|number|no\.)\s+)?(\d{1,5})\b(?!\s*(?:-|–|—|to|through)\s*\d)/gi,
    ),
  ].map(match => Number(match[1]));
  return {
    range: range ? [Number(range[1]), Number(range[2])].sort((a, b) => a - b) : null,
    pages: [...new Set(pages)],
  };
}

// Words that say Midpage's copy has no page numbers, so a page it names is not a reading.
const NO_PAGES = /\b(?:no|not|without|does not|doesn't|cannot|can't)\b[^.]{0,80}\bpage/i;

const yearOf = date => (String(date || '').match(/\b(1[6-9]\d\d|20\d\d)\b/) || [])[1] || null;
const courtForm = court =>
  String(court || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const NAME_STOP = new Set(
  'the of and for in on to at by re ex rel parte matter estate marriage application petition v vs inc co corp llc lp llp ltd plc et al dba aka company corporation incorporated limited partnership'.split(
    ' ',
  ),
);
const nameTokens = name =>
  (
    String(name || '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  ).filter(token => token.length >= 3 && !NAME_STOP.has(token));

// Whether two case names name the same case: each party's words, or their
// abbreviations, are mostly in Midpage's name for that party. null when the
// document's name has no words to compare.
export function sameCaseName(ours, theirs) {
  const parties = name => String(name || '').split(/\s+vs?\.?\s+/i);
  const a = parties(ours);
  const b = parties(theirs);
  if (a.length === 2 && b.length === 2) {
    const first = sameWords(a[0], b[0]);
    const second = sameWords(a[1], b[1]);
    if (first === null && second === null) return null;
    return first !== false && second !== false;
  }
  return sameWords(ours, theirs);
}
function sameWords(ours, theirs) {
  const a = nameTokens(ours);
  const b = nameTokens(theirs);
  if (!a.length) return null;
  const hit = token =>
    b.some(
      other =>
        other.startsWith(token) ||
        (other.length >= 4 && token.startsWith(other)) ||
        abbreviates(token, other),
    );
  return a.filter(hit).length >= Math.max(1, Math.ceil(a.length / 2));
}
// "enters" for "enterprises", "twp" for "township", "bd" for "board": the
// abbreviation's letters in order, starting with the word's first.
function abbreviates(short, long) {
  if (short.length >= long.length || short[0] !== long[0]) return false;
  let at = 0;
  for (const letter of long) if (letter === short[at]) at++;
  return at === short.length && short.length >= 2;
}

const line = (state, text, extra = {}) => ({ state, text, ...extra });
const safeUrl = url => (typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null);

// readCase(plan, answers, found?) turns Midpage's answers about a case into the
// result shown under the authority. answers: the payloads of the
// analyzeCaseDocument calls; found: the search hit, when the case was found by
// name.
export function readCase(plan, answers, found = null, notes = []) {
  const first = answers[0] || {};
  const caseInfo = first.case || {};
  const opinion = first.document?.opinion || {};
  const lines = [];
  const theirName = caseInfo.caseName || '';
  const citation = opinion.citation || caseInfo.caseName || plan.citation;
  lines.push(line('ok', `Found in Midpage: ${citation}`));
  if (found && plan.how === 'search') {
    lines.push(line('info', 'Found by name, as the document gives no reporter citation.'));
  }
  lines.push(...notes);
  const ours = plan.caseName || plan.name;
  const same = theirName ? sameCaseName(ours, theirName) : null;
  if (same === false) {
    lines.push(line('problem', `This citation leads to ${theirName}, not ${ours}.`));
  }
  const theirYear = yearOf(opinion.dateDecided || caseInfo.dateFiled);
  if (plan.year && theirYear && plan.year !== theirYear) {
    lines.push(
      line(
        'problem',
        `Midpage dates the decision ${opinion.dateDecided || theirYear}; the document says ${plan.year}.`,
      ),
    );
  }
  if (plan.court && caseInfo.court && courtForm(plan.court) !== courtForm(caseInfo.court)) {
    lines.push(
      line(
        'warn',
        `Midpage gives the court as ${caseInfo.court}; the document says ${plan.court}.`,
      ),
    );
  }
  // Pages, in Midpage's words.
  const texts = answers.flatMap(answer => [
    answer.answer,
    ...(answer.supportedPropositions || []).map(item => item.proposition),
  ]);
  let range = null;
  for (const text of texts) {
    const read = pagesIn(text);
    if (read.range && !NO_PAGES.test(text)) {
      range = read.range;
      break;
    }
  }
  const passages = answers.flatMap(answer => answer.supportedPropositions || []);
  if (range) {
    const paged = plan.pins.filter(pin => pin.first !== null);
    const inside = paged.filter(pin => pin.first >= range[0] && pin.last <= range[1]);
    if (inside.length) {
      lines.push(
        line(
          'ok',
          `${inside.length === 1 ? 'Pin' : 'Pins'} ${inside.map(pin => pin.pin).join(', ')} ${inside.length === 1 ? 'is' : 'are'} within the opinion’s pages, ${range[0]}–${range[1]}, as Midpage gives them.`,
          { spans: inside.map(pin => pin.span) },
        ),
      );
    }
    for (const pin of paged.filter(pin => !inside.includes(pin))) {
      lines.push(
        line(
          'warn',
          `Pin ${pin.pin} is outside the opinion’s pages, ${range[0]}–${range[1]}, as Midpage gives them.`,
          { span: pin.span },
        ),
      );
    }
  }
  const paged = plan.pins.filter(pin => pin.first !== null);
  if (paged.length && !range) {
    lines.push(line('unknown', `Pins not checked against the opinion’s pages: Midpage gave none.`));
  }
  lines.push(
    ...quoteLines(
      plan,
      passages.map(item => ({
        text: item.quote,
        truncated: item.quoteTruncated,
        url: item.deeplinkUrl,
        about: item.proposition,
      })),
      true,
    ),
  );
  lines.push(...treatmentLines(opinion.treatment));
  for (const warning of answers.flatMap(answer => answer.sourceWarnings || [])) {
    lines.push(line('warn', `Midpage: ${squash(String(warning))}`));
  }
  return finish(plan, lines, safeUrl(first.document?.url || caseInfo.url));
}

// readLaw(plan, answers) does the same for a statute, rule or regulation.
export function readLaw(plan, answers) {
  const first = answers[0] || {};
  const lines = [];
  lines.push(
    line(
      'ok',
      `Found in Midpage: ${[first.citation || plan.citation, first.title].filter(Boolean).join(' · ')}`,
    ),
  );
  if (first.isHistorical) lines.push(line('warn', 'Midpage marks this version as superseded.'));
  else if (first.isCurrent === false)
    lines.push(line('warn', 'Midpage marks this version as not in force today.'));
  const passages = answers.flatMap(answer => answer.analysis?.passages || []);
  lines.push(
    ...quoteLines(
      plan,
      passages.map(item => ({
        text: item.quote,
        truncated: false,
        url: item.deeplinkUrl,
        about: item.point,
      })),
      false,
    ),
  );
  return finish(plan, lines, safeUrl(first.url));
}

function quoteLines(plan, passages, paged) {
  const lines = [];
  const texts = passages.map(passage => passage.text).filter(Boolean);
  for (const quote of plan.quotes) {
    const opening =
      quote.text.length > 70 ? `${quote.text.slice(0, 70).replace(/\s+\S*$/, '')}…` : quote.text;
    const match = matchQuotation(quote.text, texts);
    const from = passages.find(passage => passage.text === match.passage);
    const url = safeUrl(from?.url);
    const truncated = passages.some(passage => passage.truncated);
    if (match.state === 'exact') {
      lines.push(
        line('ok', `Quotation found word for word: “${opening}”`, { span: quote.span, url }),
      );
    } else if (match.state === 'words') {
      lines.push(
        line('warn', `Quotation found with different punctuation or capitals: “${opening}”`, {
          span: quote.span,
          url,
        }),
      );
    } else if (match.state === 'partial') {
      lines.push(
        line(
          truncated ? 'unknown' : 'problem',
          `Only part of this quotation was found: “${opening}”. Not found: “${match.missing ? squash(match.missing).slice(0, 80) : 'the rest'}”`,
          { span: quote.span, url },
        ),
      );
    } else {
      lines.push(
        line(
          truncated ? 'unknown' : 'problem',
          `Quotation not found in the passages Midpage returned: “${opening}”`,
          {
            span: quote.span,
          },
        ),
      );
    }
    // The page Midpage puts it on, when its copy has page numbers.
    if (paged && match.passage && quote.first !== null) {
      const about = from?.about || '';
      const pages = NO_PAGES.test(about) ? [] : pagesIn(about).pages;
      if (pages.length) {
        const onPage = pages.some(page => page >= quote.first && page <= quote.last);
        lines.push(
          line(
            onPage ? 'ok' : 'warn',
            onPage
              ? `Midpage puts it on page ${pages.join(', ')}, the page cited.`
              : `Midpage puts it on page ${pages.join(', ')}; the document cites ${quote.pin}.`,
            { span: quote.span },
          ),
        );
      }
    }
  }
  if (plan.skipped.length) {
    const why = [...new Set(plan.skipped.map(item => item.why))].join(' ');
    lines.push(
      line(
        'info',
        `${plan.skipped.length === 1 ? '1 quotation was' : `${plan.skipped.length} quotations were`} not sent: ${why}`,
        { spans: plan.skipped.map(item => item.span) },
      ),
    );
  }
  return lines;
}

function treatmentLines(treatment) {
  if (!treatment) return [];
  const lines = [];
  const history = Array.isArray(treatment.history) ? treatment.history : [];
  const about = category =>
    history
      .filter(item => item?.category === category)
      .slice(0, 5)
      .map(item => ({
        text: [item.citation, item.reason].filter(Boolean).map(String).join(': '),
        url: null,
      }));
  const negative = Number(treatment.negative) || 0;
  const caution = Number(treatment.caution) || 0;
  if (negative) {
    lines.push(
      line(
        'problem',
        `Midpage lists ${negative === 1 ? '1 later decision' : `${negative} later decisions`} treating it negatively.`,
        {
          items: about('Negative'),
        },
      ),
    );
  }
  if (caution) {
    lines.push(
      line(
        'warn',
        `Midpage lists ${caution === 1 ? '1 later decision' : `${caution} later decisions`} to read with caution.`,
        {
          items: about('Caution'),
        },
      ),
    );
  }
  if (!negative && !caution)
    lines.push(
      line(
        'info',
        'Midpage lists no negative or caution treatment. Its list is not a full citator.',
      ),
    );
  return lines;
}

function finish(plan, lines, url) {
  const states = new Set(lines.map(item => item.state));
  const verdict = states.has('problem')
    ? 'problem'
    : states.has('warn')
      ? 'warn'
      : states.has('unknown')
        ? 'partial'
        : 'ok';
  return { verdict, lines, url, signature: plan.signature };
}

// A result when Midpage could not answer for this authority.
function failed(plan, verdict, text) {
  return {
    verdict,
    lines: [line(verdict === 'problem' ? 'problem' : 'unknown', text)],
    url: null,
    signature: plan.signature,
  };
}

// ---------------------------------------------------------------------------
// Failures
// ---------------------------------------------------------------------------

// What the page tells the reader when a call fails for every authority at once.
const PAGE_LEVEL = {
  needs_reauth: `Reconnect ${SERVER} in claude.ai Settings → Connectors, then check again.`,
  server_not_connected: `Add the ${SERVER} connector in claude.ai Settings → Connectors to check citations.`,
  server_not_found: `The ${SERVER} connector is gone. Add it again in claude.ai Settings → Connectors.`,
  selection_required: `You have more than one ${SERVER} connector. Choose one when claude.ai asks, then check again.`,
  not_in_manifest: `${SERVER} is not allowed for this page. Allow it in this page’s Permissions menu to check citations.`,
  consent_required: `${SERVER} is not allowed for this page yet. Click Check to be asked again.`,
  blocked_by_policy: `Your organization’s policy blocks ${SERVER} here.`,
  approval_required: `Your organization requires approval for each ${SERVER} call, which this page cannot ask for.`,
  not_granted: 'Connectors are not available on this page.',
  capability_disabled: 'Connectors are not available on this page.',
  capability_removed: 'Connectors are not available on this page.',
  user_changed: 'You signed in as someone else. Reload the page.',
};
// Denials that end what the page may keep from earlier answers.
const DENIALS = new Set([
  'needs_reauth',
  'server_not_connected',
  'not_in_manifest',
  'blocked_by_policy',
  'user_changed',
]);

// failureOf(error) reads a rejected call: {code, status, message, page, retry, wait}.
// status is Midpage's own (not_found, ambiguous, …) on a tool_error.
export function failureOf(error) {
  const code = typeof error?.code === 'string' ? error.code : 'upstream_error';
  let body = null;
  if (code === 'tool_error') {
    const result = error.result || {};
    body =
      result.payload ??
      result.structuredContent ??
      parse(result.content?.find?.(item => item?.type === 'text')?.text) ??
      parse(error.message);
    if (typeof body === 'string') body = parse(body) || { message: body };
  }
  const status = typeof body?.status === 'string' ? body.status : body?.error ? 'not_found' : null;
  const message = squash(String(body?.message || body?.error || error?.message || ''));
  return {
    code,
    status,
    message,
    page: PAGE_LEVEL[code] || null,
    deny: DENIALS.has(code),
    retry: error?.retryable === true && code !== 'tool_error',
    wait: Math.min(Number(error?.retryAfterMs) || 0, 60000),
    candidates: Array.isArray(body?.candidates) ? body.candidates : null,
  };
}

function parse(text) {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// A page-level failure stops a check; the rest of a check-all waits for the reader.
class PageFailure extends Error {
  constructor(failure) {
    super(failure.page);
    this.failure = failure;
  }
}

// ---------------------------------------------------------------------------
// The checker
// ---------------------------------------------------------------------------

// CiteCheck runs checks through the `mcp` capability and keeps their results.
// load: () => Promise of the mcp namespace or null. storage: localStorage or
// null; results are kept in this browser only, for this reader.
//
// state: available (null while finding out, then true or false), notice (a
// page-level message or null), running (a check-all in progress: {done, total})
// or null.
export class CiteCheck {
  constructor({
    load,
    storage = null,
    wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
    now = () => Date.now(),
  }) {
    Object.assign(this, { storage, wait, now });
    this.mcp = null;
    this.available = null;
    this.notice = null;
    this.running = null;
    this.listeners = new Set();
    this.active = new Map(); // key → {signature, controller}
    this.results = this.restore();
    this.loading = Promise.resolve()
      .then(load)
      .catch(() => null)
      .then(async mcp => {
        this.mcp = mcp && typeof mcp.callTool === 'function' ? mcp : null;
        this.available = Boolean(this.mcp);
        if (this.mcp) await this.connection();
        this.changed();
      });
  }
  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  changed() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {}
    }
  }
  // Whether the reader has Midpage connected, without asking anything.
  async connection() {
    try {
      const listed = await this.mcp.listTools(SERVER);
      const server = listed?.servers?.find(item => item?.server === SERVER);
      if (!server) this.notice = PAGE_LEVEL.server_not_connected;
      else if (server.authStatus === 'needs_reauth') this.notice = PAGE_LEVEL.needs_reauth;
      else this.notice = null;
    } catch (error) {
      const failure = failureOf(error);
      if (failure.page) this.notice = failure.page;
    }
  }
  // A plan's state: {status: idle, running, done or stale, result}. stale: the
  // result is from before the document changed what this check depends on.
  state(plan) {
    const active = this.active.get(plan.key);
    if (active?.signature === plan.signature) return { status: 'running', result: null };
    const result = this.results.get(plan.signature);
    if (result) return { status: 'done', result };
    const earlier = [...this.results.values()].find(item => item.key === plan.key);
    return earlier ? { status: 'stale', result: earlier } : { status: 'idle', result: null };
  }
  // Checks one authority. Resolves when it is done; never rejects.
  async check(plan, { quiet = false, fresh = false } = {}) {
    if (!this.mcp || plan.how === 'none' || this.active.has(plan.key)) return;
    const controller = new AbortController();
    this.active.set(plan.key, { signature: plan.signature, controller });
    if (!quiet) this.notice = null;
    this.changed();
    let result;
    try {
      result = await this.run(plan, controller.signal, fresh);
    } catch (error) {
      if (error instanceof PageFailure) {
        this.notice = error.failure.page;
        if (error.failure.deny) this.forget();
        result = null;
      } else if (controller.signal.aborted) {
        result = null;
      } else {
        result = failed(
          plan,
          'error',
          `Midpage could not run this check. ${error?.message || ''}`.trim(),
        );
      }
    }
    this.active.delete(plan.key);
    if (result) {
      result.key = plan.key;
      result.checkedAt = this.now();
      this.keep(plan, result);
    }
    this.changed();
    return result;
  }
  // Checks every plan that can be checked, two at a time. A page-level failure
  // stops the rest.
  async checkAll(plans) {
    if (!this.mcp || this.running) return;
    // What is checked already, and matches the document, is not asked again.
    const queue = plans.filter(plan => {
      if (plan.how === 'none') return false;
      const { status, result } = this.state(plan);
      return status !== 'done' || result.verdict === 'error';
    });
    this.running = { done: 0, total: queue.length };
    this.notice = null;
    this.changed();
    const next = async () => {
      while (queue.length && this.running && !this.notice) {
        const plan = queue.shift();
        await this.check(plan, { quiet: true });
        if (this.running) this.running.done++;
        this.changed();
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, next));
    this.running = null;
    this.changed();
  }
  // Stops a check-all and any check in flight.
  stop() {
    this.running = null;
    for (const { controller } of this.active.values()) controller.abort();
    this.changed();
  }
  // One call, retried once after a short wait when Midpage says a retry may work.
  async call(tool, input, signal, fresh = false) {
    let retried = false;
    for (;;) {
      try {
        const result = await this.mcp.callTool(SERVER, tool, input, {
          cache: { staleTime: 300000, gcTime: 86400000, refresh: fresh },
          signal,
        });
        return { ok: true, payload: result?.payload ?? parse(result?.content?.[0]?.text) ?? null };
      } catch (error) {
        const failure = failureOf(error);
        if (failure.page) throw new PageFailure(failure);
        if (failure.code === 'cancelled') throw error;
        if (failure.retry && !retried) {
          retried = true;
          await this.wait(failure.wait || 1500 + Math.random() * 1500);
          if (signal.aborted) throw error;
          continue;
        }
        return { ok: false, failure };
      }
    }
  }
  async run(plan, signal, fresh = false) {
    const call = (tool, input) => this.call(tool, input, signal, fresh);
    return plan.kind === 'case' ? this.runCase(plan, call) : this.runLaw(plan, call);
  }
  async runCase(plan, call) {
    let reference = { citation: plan.citation };
    let found = null;
    if (plan.how === 'search') {
      const searched = await call('search', searchInput(plan));
      if (!searched.ok) return failedCall(plan, searched.failure);
      found = pickCase(plan, searched.payload?.results || []);
      if (!found) {
        return failed(
          plan,
          'partial',
          `Midpage’s search found no case matching ${plan.find.name}${plan.find.docket ? `, ${plan.find.docket}` : ''}. It may not have this case; check it by hand.`,
        );
      }
      reference = { documentId: found.document.documentId };
    }
    const answers = [];
    const notes = [];
    for (const { question } of questionsFor(plan)) {
      let answer = await call('analyzeCaseDocument', { ...reference, question });
      let failure = !answer.ok
        ? answer.failure
        : answer.payload?.status && answer.payload.status !== 'ok'
          ? {
              code: 'tool_error',
              status: answer.payload.status,
              message: answer.payload.message || '',
            }
          : null;
      // A citation Midpage does not match as written: look for the case by name.
      if (failure && !answers.length && !found && plan.find && MISSED.has(failure.status)) {
        const searched = await call('search', {
          queries: [{ query: plan.find.name }, { query: `${plan.find.name} ${plan.citation}` }],
        });
        const hit = searched.ok ? pickByName(plan, searched.payload?.results || []) : null;
        if (hit) {
          found = hit.hit;
          reference = { documentId: found.document.documentId };
          const theirs = found.document.opinion?.citation || found.case?.caseName || '';
          notes.push(
            hit.same
              ? line(
                  'info',
                  'Midpage did not match the citation as written, so the case was found by name.',
                )
              : line(
                  'problem',
                  `Midpage has this case as ${theirs}; the document cites ${plan.citation}. Check the citation.`,
                ),
          );
          answer = await call('analyzeCaseDocument', { ...reference, question });
          failure = !answer.ok
            ? answer.failure
            : answer.payload?.status && answer.payload.status !== 'ok'
              ? {
                  code: 'tool_error',
                  status: answer.payload.status,
                  message: answer.payload.message || '',
                }
              : null;
        }
      }
      if (failure) {
        if (answers.length) break;
        return failedCall(plan, failure);
      }
      answers.push(answer.payload || {});
    }
    return readCase(plan, answers, found, notes);
  }
  async runLaw(plan, call) {
    const questions = questionsFor(plan);
    const register = plan.citation.match(/^(\d+)\s+Fed\.\s?Reg\.\s+([\d,]+)/);
    let reference = register
      ? { registerCitation: `${register[1]} FR ${register[2].replace(/,/g, '')}` }
      : { citation: plan.citation };
    let first = await call('analyzeLaw', { ...reference, question: questions[0].question });
    if (!first.ok && first.failure.code === 'tool_error') {
      // Midpage matches a code's own abbreviations only; find the section by search.
      const searched = await call('searchLaws', { query: plan.citation, pageSize: 10 });
      const hit = searched.ok ? pickLaw(plan, searched.payload?.results || []) : null;
      if (!hit) {
        return failed(
          plan,
          'partial',
          `Midpage has no provision at ${plan.citation}. Midpage may not cover this code, so check the citation by hand.`,
        );
      }
      reference = { id: hit.id };
      first = await call('analyzeLaw', { ...reference, question: questions[0].question });
    }
    if (!first.ok) return failedCall(plan, first.failure);
    if (first.payload?.error)
      return failed(
        plan,
        'partial',
        `Midpage has no provision at ${plan.citation}. Midpage may not cover this code, so check the citation by hand.`,
      );
    const answers = [first.payload || {}];
    for (const { question } of questions.slice(1)) {
      const answer = await call('analyzeLaw', { ...reference, question });
      if (!answer.ok) break;
      answers.push(answer.payload || {});
    }
    return readLaw(plan, answers);
  }
  // Results, kept in this browser by signature.
  keep(plan, result) {
    for (const [signature, item] of this.results) {
      if (item.key === plan.key && signature !== plan.signature) this.results.delete(signature);
    }
    this.results.set(plan.signature, result);
    while (this.results.size > STORE_LIMIT) this.results.delete(this.results.keys().next().value);
    this.save();
  }
  forget() {
    this.results.clear();
    this.save();
  }
  restore() {
    try {
      const saved = JSON.parse(this.storage?.getItem(STORE_KEY) || '[]');
      return new Map(
        (Array.isArray(saved) ? saved : []).filter(
          entry =>
            Array.isArray(entry) &&
            typeof entry[0] === 'string' &&
            entry[1] &&
            Array.isArray(entry[1].lines),
        ),
      );
    } catch {
      return new Map();
    }
  }
  save() {
    try {
      this.storage?.setItem(STORE_KEY, JSON.stringify([...this.results]));
    } catch {}
  }
}

function failedCall(plan, failure) {
  const status = failure.status;
  if (status === 'not_found' || status === 'invalid_reference') {
    return failed(
      plan,
      'problem',
      plan.how === 'search'
        ? `Midpage found the case but could not open it. ${failure.message}`.trim()
        : `Midpage has no case at ${plan.citation}. Check the citation, or check it by hand if Midpage lacks this reporter.`,
    );
  }
  if (status === 'ambiguous')
    return failed(
      plan,
      'partial',
      `More than one case in Midpage has the citation ${plan.citation}. Check it by hand.`,
    );
  if (status === 'text_not_available')
    return failed(
      plan,
      'partial',
      'Midpage has this case but not its text, so nothing in it could be checked.',
    );
  if (
    failure.code === 'server_unavailable' ||
    failure.code === 'rate_limited' ||
    failure.code === 'upstream_error'
  ) {
    return failed(plan, 'error', 'Midpage did not answer. Try again in a minute.');
  }
  return failed(
    plan,
    'error',
    `Midpage could not run this check${failure.message ? `: ${failure.message}` : '.'}`,
  );
}

// Midpage statuses that mean it did not match a citation as written.
const MISSED = new Set(['not_found', 'invalid_reference', 'ambiguous']);

// For a citation Midpage did not match, the search hit with the case's name: the
// same volume, reporter and page written another way (same: true), or else the
// same court and year (same: false: the document's citation looks wrong).
export function pickByName(plan, results) {
  const find = plan.find;
  const want = wordForm(`${find.volume} ${find.reporter} ${find.page}`);
  const named = results.filter(
    hit =>
      hit?.document?.documentId &&
      sameCaseName(find.name, hit.case?.caseName || hit.document.opinion?.citation || ''),
  );
  const same = named.find(hit => wordForm(hit.document.opinion?.citation || '').includes(want));
  if (same) return { hit: same, same: true };
  const near = named.find(
    hit =>
      find.year &&
      yearOf(hit.document.opinion?.dateDecided) === find.year &&
      (!find.court || courtForm(hit.case?.court) === courtForm(find.court)),
  );
  return near ? { hit: near, same: false } : null;
}

// The search hit that is the case the document cites: its name matches, and its
// docket number, or its volume and reporter, or its court and year, do too.
export function pickCase(plan, results) {
  const find = plan.find;
  const want = {
    docket: find.docket ? digits(find.docket).join('-') : null,
    volume: find.volume ? wordForm(`${find.volume} ${find.reporter}`) : null,
    court: find.court ? courtForm(find.court) : null,
    year: find.year || null,
  };
  for (const hit of results) {
    const caseInfo = hit?.case || {};
    const opinion = hit?.document?.opinion || {};
    if (!hit?.document?.documentId) continue;
    const name = caseInfo.caseName || opinion.citation || '';
    if (!sameCaseName(find.name, name)) continue;
    if (want.volume) {
      if (wordForm(opinion.citation || '').includes(want.volume)) return hit;
      continue;
    }
    if (
      want.docket &&
      `-${digits(caseInfo.docketNumber).join('-')}-`.includes(`-${want.docket}-`)
    ) {
      return hit;
    }
    const sameCourt = !want.court || courtForm(caseInfo.court) === want.court;
    const sameYear = !want.year || yearOf(opinion.dateDecided) === want.year;
    if (!want.docket && sameCourt && sameYear) return hit;
    if (want.docket && sameCourt && sameYear && !caseInfo.docketNumber) return hit;
  }
  return null;
}

// The searchLaws hit that is the section the document cites: the same numbers,
// and the same code, by its words' initials ("U.S. Code" and "U.S.C.") or by
// every word ("Civ." and "Civil").
const PUBLISHER =
  /\b(?:Ann|Annotated|West|Supp|Consol|McKinney|McKinney's|Vernon|Vernon's|Deering|LexisNexis|Lexis)\b\.?/gi;
const codeWords = citation => String(citation).replace(/\d+/g, ' ').replace(PUBLISHER, ' ');
const initials = text =>
  (text.match(/[A-Za-z]+/g) || []).map(word => word[0].toLowerCase()).join('');
export function pickLaw(plan, results) {
  const numbers = digits(plan.citation).join('.');
  const ours = codeWords(plan.citation);
  for (const hit of results) {
    if (!hit?.id || !hit.citation) continue;
    if (digits(hit.citation).join('.') !== numbers) continue;
    const theirs = codeWords(hit.citation);
    const words = nameTokens(ours);
    const every = words.length && words.every(token => sameWords(token, theirs));
    if (initials(ours) === initials(theirs) || every) return hit;
  }
  return null;
}

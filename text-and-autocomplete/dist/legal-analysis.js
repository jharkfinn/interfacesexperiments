import {
  findCitations,
  quoteSpans,
  referenceNames,
  findReferences,
  citationKey,
  shortName,
  isCitationSentence,
  distinctiveName,
} from './legal-text.js?v=d320b2da73d2';
import { ROLES, KINDS, ALLOWED, STRUCTURE_CHECKS } from './legal-core.js?v=be1784b5bce5';

// What the app works out for itself about a legal document, from its text and
// Claude's labels: the sections its headings make, runs of sentences that do one
// job, the citations and what each sentence rests on, the structure checks, and
// a table of authorities. Claude only names each sentence's role and kind from
// fixed lists; every name, citation and quotation here is read from the
// document, so nothing Claude writes reaches the screen. No DOM, so the IRAC and
// Sourcing views and the tests share one reading. It reads office memos, briefs,
// letters and emails in Bluebook or California Style Manual form, and English and
// Canadian citations; text with no legal analysis in it, such as a contract's
// clauses or a story, gets no IRAC checks.
//
// analyzeLegal(blocks, labels) takes the model's blocks, [{index, kind, text,
// sentences: [{start, end, text}]}], and Claude's labels, one per sentence
// through the document ({role, kind, also?, guess?} or [role, kind, also?]), or
// null. It returns:
// {
//   labeled,            // whether there were labels to read
//   type,               // brief (a caption with parties, an Argument, a brief's title) or memo
//                       // (anything else: memos, letters, emails, other writing)
//   sentences: [{       // one per sentence; n counts from 1 through the document
//     n, block, index, start, end, text,  // block number, place in it, offsets in its text
//     section,          // index into sections
//     role, kind, also, guess, conflict,  // labels after the app's overrides; null without labels;
//                       // kind may be document-text (a contract's or statute's own words)
//     support,          // direct, inferential, indirect, background, contrary, secondhand,
//                       // incomplete, below, missing, unsourced, record, cited, n/a or
//                       // unknown.
//                       // record: it rests on the record (Compl. ¶ 9, Ex. A at 1, 2 CT 362)
//                       // or on a section of the document or contract it discusses (a
//                       // cross-reference inside a contract's own clauses is no source),
//                       // or it is a client fact whose only citations are in a form the
//                       // parser does not know;
//                       // cited: its only citations are in a form the parser does not know
//                       // (legal-text's 'unparsed', "Joint Stip. ¶ 4"), so it is shown but
//                       // not judged, and needs no attention for that;
//                       // n/a: it needs no source (a heading, the caption, an issue, a
//                       // roadmap, a conclusion, reproduced document text, or a fact
//                       // told in a section with no legal analysis, or in a letter,
//                       // email or story that cites no record)
//     flags: [{id, text, attention, title?, items?}],  // items [{id, text}] on the one 'form' flag;
//                       // 'ambiguous-id' on an id. right after a citation of more than one
//                       // source ("A; B. Id. at 4"), which is then unresolved
//     cites: [{label, state, start, end, key, text}],  // state: own, quoted, nested or unresolved;
//                       // label has no state suffix ("Twombly 570", "Ortega 1206" for a
//                       // supra with a pin, "Id. → Compl." for an id. of the record,
//                       // "Pub. L. No. 110-325, § 2(b)(4)", "[2019] UKSC 5 [41]"); key is the
//                       // authority's, or null (a record citation, a section of the
//                       // document, the caption's)
//     lead,             // the text before its first own citation, other than a reference
//                       // to a section of the document ("Separately, § 4.3 allows …")
//     attention,        // weak support or a flag that counts toward "needs attention"
//   }],
//   sections: [{index, part, tag, label, heading, parent, blocks, first, last, rank, phrase, rail}],
//                       // part: caption, question, answer, introduction, facts, standard,
//                       // umbrella, sub-issue, conclusion or other. Only umbrellas and
//                       // sub-issues get rails and IRAC checks: introduction (a brief's
//                       // introduction or summary of argument), standard (the legal standard
//                       // or standard of review) and other (jurisdiction, and sections with
//                       // no legal analysis in them) get none;
//                       // tag: "I", "I.A" (numerals joined down the headings, "POINT II:"
//                       // as "II"), "Part 4" (a heading's own number), "Part 2" (by
//                       // position, skipping numbers headings take, so no two share a
//                       // tag), or the part's name;
//                       // heading: the heading's block number or null;
//                       // parent: the index of the umbrella it is under, or null;
//                       // first, last: sentence numbers;
//                       // rank 1-3 and phrase: how sure it sounds, or null (always null in a brief);
//                       // rail: null, or [{letter, roles, state, title}], state ok, missing or order;
//                       // null too for an umbrella that is only its heading. A sub-issue
//                       // under an umbrella that states the rule has R ok ("Rule stated in
//                       // the umbrella")
//   runs: [{first, last, label, method, parent, role, kind, also, guess, conflict}],
//                       // runs of sentences that share a role, as DocumentModel.runs takes them;
//                       // parent is the section's index
//   checks: [{id, severity, message, section, where, sentences, spans}],
//                       // severity fail, warn or info, sorted that way and then by STRUCTURE_CHECKS;
//                       // where: the section's tag or ''; spans: [{block, start, end}] it points at
//   authorities: [{key, group, name, title, italic, court, level, mentions, where, warnings, count}],
//                       // group: cases (with unreported cases cited by docket or Westlaw
//                       // number), statutes, or other (law reviews, treatises, dictionaries,
//                       // agency guidance, legislative history, bare docket and database
//                       // numbers, and citations in a form the parser does not know, named
//                       // and titled as written, with the warning "Form not recognized:
//                       // check it by hand"). The record, sections of the document and the
//                       // caption's citations are not authorities. key: legal-text's
//                       // citationKey, with a reported case's first page ("550 U.S. 544");
//                       // a neutral citation's key has its number already ("2020 IL
//                       // 124112"). name: a case's short name
//                       // ("Twombly", from legal-text's shortName), or its neutral citation
//                       // when that is all it has ("[2019] UKSC 5", "2021-Ohio-1234"); a
//                       // statute's section ("§ 3602"), a session law's or executive order's
//                       // number, or the first page of the Statutes at Large or the Federal
//                       // Register; an author's surname; a report's or bill's number and
//                       // part. title: as the document cites it, without pins (Bluebook,
//                       // California's "(2001) 25 Cal.4th 826 […]", English, Canadian and US
//                       // public-domain, "2021-Ohio-1234 (8th Dist.)"), with parallel
//                       // citations, subsequent history (", aff’d, 535 U.S. 1 (2002)", Texas's
//                       // "(Tex. App. 2003, pet. denied)"), the full date of an unreported case,
//                       // and an article's or book's author and title; a session law or
//                       // executive order with its Statutes at Large or Federal Register page
//                       // and its date; court: the full citation's court or null;
//                       // italic: [start, end] of the case name, or of the article's or book's
//                       // title, in title; level: supreme (the U.S., UK and Canadian supreme
//                       // courts, the House of Lords), circuit, district, state-supreme,
//                       // state-appellate (by reporter, or by the court a public-domain
//                       // citation names: "2020 IL 124112" is state-supreme, "2020 IL App
//                       // (1st) 123" state-appellate), appellate (an English or Canadian
//                       // court of appeal), statute or unknown;
//                       // mentions: [{block, start, end, type, state, section}], section a tag
//   unresolved: [{text, span}],  // short forms, supras and id. that name no case cited in
//                       // full here, and id. after a citation of more than one source, each
//                       // with why and its {block, start, end}
//   attentionCount,
// }

export { ROLE_NAMES, KIND_NAMES, STRUCTURE_CHECKS } from './legal-core.js?v=be1784b5bce5';

const words = text => (text.match(/\S+/gu) || []).length;
const squeeze = text => text.replace(/\s+/g, '').replace(/’/g, "'");
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HEADING = /^h[1-6]$/;

// The opening of a text, cut at a word near `limit` characters, as the views cut it.
export function opening(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/(?<![\s,;:])[\s,;:]+$/, '')}…`;
}

// A list in prose: "a", "a and b", "a, b, and c".
const prose = items =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

// The parts a top heading names, by its words without a numeral or a final colon. A
// memo's question, answer (its "Executive Summary" too), facts and conclusion; a brief's
// introduction ("Nature of the Case"), statement of the case, standard of review
// ("Applicable Law") and prayer for relief, which concludes it; a complaint's factual
// allegations and an appellee's counterstatement of facts; and parts with no analysis,
// such as jurisdiction. A facts heading is a short one: "Facts and Procedural History",
// "Relevant Facts", "Factual Background", not a point heading that mentions facts.
const PARTS = [
  [
    /^(?:(?:questions?|issues?)(?:\s+presented)?(?:\s+for\s+review)?|statement\s+of\s+(?:the\s+)?(?:issues?|questions?)(?:\s+presented)?)$/i,
    'question',
  ],
  [/^(?:(?:brief|short)?\s*answers?|executive\s+summary)$/i, 'answer'],
  [
    /^(?:introduction|preliminary\s+statement|summary\s+of\s+(?:the\s+)?argument|nature\s+of\s+(?:the\s+)?(?:case|action|proceedings?))$/i,
    'introduction',
  ],
  [
    /^(?:(?:the\s+)?(?:applicable\s+|governing\s+)?legal\s+standards?|standards?\s+of\s+(?:review|decision)|(?:the\s+)?(?:applicable|governing)\s+standards?|(?:the\s+)?applicable\s+law)$/i,
    'standard',
  ],
  [
    /^(?:(?:counter-?\s?)?(?:statement|summary)\s+of\s+(?:the\s+)?(?:(?:relevant|material|undisputed|pertinent)\s+)?facts|(?:(?:the|relevant|material|undisputed|pertinent|background|key)\s+){0,2}facts?(?:\s+and\s+(?:procedural\s+)?(?:history|background|posture|proceedings))?|factual\s+(?:and\s+procedural\s+)?(?:background|summary|history|allegations)|(?:(?:factual|procedural|relevant)\s+)?background(?:\s+facts)?|statement\s+of\s+the\s+case(?:\s+and\s+(?:the\s+)?facts)?|procedural\s+(?:history|background|posture))$/i,
    'facts',
  ],
  [
    /^(?:(?:conclusions?|recommendations?)(?:\s+and\s+(?:recommendations?|conclusions?|relief(?:\s+(?:sought|requested))?))?|(?:prayer|request)\s+for\s+relief|relief\s+(?:requested|sought))$/i,
    'conclusion',
  ],
  [
    /^(?:(?:(?:statement|basis)\s+of\s+)?(?:appellate\s+)?(?:jurisdiction|appealability)|jurisdictional\s+statement|table\s+of\s+(?:contents|authorities)|certificate\s+of\s+(?:compliance|service|word\s+count)|proof\s+of\s+service)$/i,
    'other',
  ],
];
// The heading that names the discussion. A top heading that names no part comes under
// the discussion, after it, as a point heading; before it, it is a part of its own with
// no analysis. A document whose headings never name the discussion has every such
// heading as a discussion of its own.
const DISCUSSION = /^(?:discussion|(?:legal\s+)?analysis|argument|points\s+and\s+authorities)$/i;
// Headings a brief has and a memo does not.
const BRIEF_HEADING =
  /^(?:argument|summary\s+of\s+(?:the\s+)?argument|statement\s+of\s+the\s+case|preliminary\s+statement|points\s+and\s+authorities)$/i;
const TAGS = {
  caption: 'Caption',
  question: 'Question',
  answer: 'Answer',
  introduction: 'Introduction',
  facts: 'Facts',
  standard: 'Standard',
  umbrella: 'Umbrella',
  conclusion: 'Conclusion',
  other: 'Other',
};
// A heading's numeral: "IV.", "A)", "3.", or New York's "POINT II:" (or "POINT II" alone
// on its line), whose numeral is "II". The numeral is the first group that matched.
const NUMERAL =
  /^\s*(?:(?:POINT|Point)\s+([IVXLC]+|\d{1,2})(?:[.:)]|\s+[—–-])?(?:\s|$)|((?:[IVXLC]+|[A-Z]|\d{1,2}))[.)]\s)/;
const numeralOf = text => {
  const found = text.match(NUMERAL);
  return found ? { numeral: found[1] || found[2], length: found[0].length } : null;
};
// "IV. Conclusion:" is the conclusion, as "Conclusion" is.
const headingWords = heading => heading.replace(NUMERAL, '').trim().replace(/[:.]$/, '').trim();
const partOf = heading =>
  PARTS.find(([pattern]) => pattern.test(headingWords(heading)))?.[1] || null;
// A numeral as a tag: "IV", "A", or "Part 4" for a number, which alone reads as a count.
const numeralTag = numeral => (/^\d+$/.test(numeral) ? `Part ${numeral}` : numeral);

// Headings typed as paragraphs. A document pasted from a word processor may set its
// headings in bold with no heading style, so every block is a paragraph. In a document
// with no h2-h6 headings, a short paragraph that is only a part's name ("ARGUMENT",
// "Statement of Facts", "IV. CONCLUSION") is read as an h2, and in the discussion that
// follows one, a short paragraph led by a numeral that does not end a sentence ("I. THE
// CLAIM FAILS", "A. The release does not reach the device") as a point heading: an h3
// for a roman numeral, an h4 for a capital letter, an h5 for a number, an h6 for a
// lowercase letter. All capitals may end with a period ("II. THE CLAIM FAILS."); other
// text may not, so a numbered list of sentences stays a list. Returns `blocks` itself
// when nothing changes.
const PARAGRAPH_LEVEL = numeral =>
  /^[IVXLC]+$/.test(numeral)
    ? 'h3'
    : /^[A-Z]$/.test(numeral)
      ? 'h4'
      : /^\d+$/.test(numeral)
        ? 'h5'
        : 'h6';
function withHeadings(blocks) {
  if (blocks.some(block => /^h[2-6]$/.test(block.kind))) return blocks;
  const short = text => !text.includes('\n') && text.length <= 120 && words(text) <= 16;
  let discussion = false;
  let changed = false;
  const read = blocks.map(block => {
    const text = block.text.trim();
    if (block.kind !== 'p' || !short(text)) return block;
    const name = headingWords(text);
    if (!/[.!?;,]$/.test(text) && words(name) <= 8 && (partOf(text) || DISCUSSION.test(name))) {
      discussion = DISCUSSION.test(name);
      changed = true;
      return { ...block, kind: 'h2' };
    }
    const numeral = discussion && numeralOf(text);
    const title = numeral && text.slice(numeral.length).trim();
    const capitals = title && title === title.toUpperCase() && /[A-Z]{2}/.test(title);
    if (title && /^[A-Z“"]/.test(title) && (capitals || !/[.!?;:,]$/.test(title))) {
      changed = true;
      return { ...block, kind: PARAGRAPH_LEVEL(numeral.numeral) };
    }
    return block;
  });
  return changed ? read : blocks;
}

// The document's sections, taken from its headings: [{index, part, tag, label, heading,
// parent, blocks, first, last}]. Blocks before the first h2-h6 are the caption; an h2
// (or a later h1) starts a part, named by its heading. In the discussion, each deeper
// heading starts a sub-issue, under the nearest shallower one; a sub-issue with others
// under it is their umbrella ("I" over "I.A" and "I.B"), as the discussion before its
// first sub-issue is theirs. A document with no such headings is one sub-issue,
// "Analysis".
export function sectionsOf(blocks) {
  blocks = withHeadings(blocks);
  const live = [];
  let count = 0;
  blocks.forEach(({ kind, text, sentences }, block) => {
    if (sentences.length) {
      live.push({ block, kind, text, first: count + 1, last: count + sentences.length });
    }
    count += sentences.length;
  });
  const sections = [];
  const open = (part, heading = null, level = 0, parent = null) => {
    const section = { part, heading, level, parent, blocks: [], nested: false };
    sections.push(section);
    return section;
  };
  const start = live.findIndex(block => /^h[2-6]$/.test(block.kind));
  const top = block => block.kind === 'h2' || block.kind === 'h1';
  const named = live.some(
    (block, i) =>
      start >= 0 && i >= start && top(block) && DISCUSSION.test(headingWords(block.text)),
  );
  let current = null;
  let discussion = null;
  let stack = [];
  let sawTop = false;
  // A point heading at `level` sits under the nearest open heading above that level.
  const subIssue = (block, level) => {
    while (stack.length && stack.at(-1).level >= level) stack.pop();
    const parent = stack.at(-1) || discussion;
    if (parent) parent.nested = true;
    const section = open('sub-issue', block, level, parent);
    stack.push(section);
    return section;
  };
  live.forEach((block, i) => {
    if (start < 0) {
      if (i === 0 && block.kind === 'h1') current = open('caption');
      else if (!current || current.part === 'caption') current = open('sub-issue');
    } else if (i < start) {
      current ||= open('caption');
    } else if (top(block)) {
      sawTop = true;
      const part = partOf(block.text);
      if (part) {
        current = open(part, block);
        discussion = null;
      } else if (!named || DISCUSSION.test(headingWords(block.text))) {
        current = discussion = open('discussion', block, 2);
        stack = [];
      } else if (discussion) {
        // A point heading set as an h2 under the discussion's own h2.
        current = subIssue(block, 2.5);
      } else current = open('other', block);
    } else if (/^h[3-6]$/.test(block.kind) && (discussion || !sawTop)) {
      // Before any h2, a deeper heading starts a sub-issue as well.
      current = subIssue(block, Number(block.kind[1]));
    }
    current.blocks.push(block);
  });
  let part = 0;
  // Numerals joined down the headings: "I" then "I.A". The discussion's own numeral
  // ("IV. Discussion") is not one of them.
  const chains = new Map();
  // Numbers the headings give themselves ("4. Fees" is "Part 4"), which a section without
  // a numeral skips, so no two sections share a tag.
  const taken = new Set(
    sections
      .map(section => section.heading && numeralOf(section.heading.text)?.numeral)
      .filter(numeral => /^\d+$/.test(numeral || ''))
      .map(Number),
  );
  return sections.map((section, index) => {
    const heading = section.heading;
    const numeral = heading && numeralOf(heading.text);
    const title = heading ? heading.text.slice(numeral ? numeral.length : 0).trim() : '';
    if (section.part === 'discussion') section.part = section.nested ? 'umbrella' : 'sub-issue';
    else if (section.part === 'sub-issue' && section.nested) section.part = 'umbrella';
    let tag = TAGS[section.part];
    // A point heading with others under it is named as a sub-issue is; only the umbrella
    // a Discussion heading starts is "Umbrella".
    const point =
      section.part === 'umbrella' && heading && !DISCUSSION.test(headingWords(heading.text));
    if (section.parent || section.part === 'sub-issue' || point) {
      part++;
      const above = section.parent && chains.get(section.parent);
      const chain = numeral ? (above ? `${above}.${numeral.numeral}` : numeral.numeral) : null;
      chains.set(section, chain);
      if (!chain && start >= 0) while (taken.has(part)) part++;
      tag = chain ? numeralTag(chain) : start < 0 ? 'Analysis' : `Part ${part}`;
    }
    return {
      index,
      part: section.part,
      tag,
      label: section.part === 'caption' ? 'Title and routing lines' : opening(title, 70),
      heading: heading ? heading.block : null,
      parent: section.parent ? sections.indexOf(section.parent) : null,
      blocks: section.blocks.map(block => block.block),
      first: section.blocks[0].first,
      last: section.blocks.at(-1).last,
    };
  });
}

// Whether a document is laid out as legal analysis: a heading names its question,
// answer, facts, standard or discussion. A letter or a story is not, so its sections
// with no analysis are not a Statement of Facts, and its facts need no record.
function legalShape(blocks, sections) {
  return sections.some(section => {
    if (section.heading === null || section.part === 'caption') return false;
    const text = blocks[section.heading].text;
    return (
      DISCUSSION.test(headingWords(text)) ||
      ['question', 'answer', 'facts', 'standard'].includes(partOf(text))
    );
  });
}

// A brief: a caption with the parties ("MARIA DELGADO, Plaintiff and Appellant,"), a
// brief's title, or a brief's headings. Anything else reads as a memo. A party line
// starts its line with the party's name, so a memo's "RE: Jane Doe, Plaintiff, v. Acme"
// is not one.
const PARTY_LINE =
  /^[^\S\n]*[A-Z][^\n:]*?,[^\S\n]*(?:Plaintiffs?|Defendants?|Appellants?|Appellees?|Petitioners?|Respondents?|Cross-[A-Z]\w+)\b/m;
const BRIEF_TITLE =
  /\bbrief\b|\bpoints\s+and\s+authorities\b|\bin\s+(?:support\s+of|opposition\s+to)\b/i;
function typeOf(blocks, sections) {
  for (const section of sections) {
    if (section.part === 'caption') {
      for (const at of section.blocks) {
        const { kind, text } = blocks[at];
        if (PARTY_LINE.test(text) || (HEADING.test(kind) && BRIEF_TITLE.test(text))) return 'brief';
      }
    } else if (
      section.heading !== null &&
      BRIEF_HEADING.test(headingWords(blocks[section.heading].text))
    ) {
      return 'brief';
    }
  }
  return 'memo';
}

// The roles that make a section analysis rather than a story or a contract's text.
const ANALYTIC = new Set(['issue', 'rule', 'explanation', 'application', 'counter', 'conclusion']);

// With labels, a sub-issue or umbrella that holds no analysis is not one: a contract's
// clauses or a story's paragraphs under a heading. It becomes facts when most of it
// states facts in a document laid out as legal analysis, and other otherwise, so it
// gets no rail and no IRAC checks. An umbrella left with no sub-issues under it is a
// sub-issue itself, "Analysis" if it was "Umbrella". Other tags stay, so a section keeps
// its name with and without labels.
function reclassify(sections, sentences, legal) {
  for (let i = sections.length - 1; i >= 0; i--) {
    const section = sections[i];
    if (section.part !== 'sub-issue' && section.part !== 'umbrella') continue;
    const mine = sentences.slice(section.first - 1, section.last);
    // Reproduced text is not analysis, even when it states the governing term.
    const analytic = mine.some(
      item => item.kind !== 'document-text' && (ANALYTIC.has(item.role) || ANALYTIC.has(item.also)),
    );
    const under = sections.some(
      other =>
        other.parent === section.index && (other.part === 'sub-issue' || other.part === 'umbrella'),
    );
    if (under) continue;
    if (analytic) {
      if (section.part === 'umbrella') {
        section.part = 'sub-issue';
        if (section.tag === TAGS.umbrella) section.tag = 'Analysis';
      }
      continue;
    }
    const body = mine.filter(item => item.role !== 'heading');
    const facts = body.filter(item => item.role === 'facts').length;
    section.part = legal && body.length && facts >= 0.6 * body.length ? 'facts' : 'other';
  }
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

// One of Claude's labels, if it uses the lists.
function labelOf(entry) {
  if (!entry) return null;
  const [role, kind, also] = Array.isArray(entry) ? entry : [entry.role, entry.kind, entry.also];
  if (!ROLES.includes(role) || !KINDS.includes(kind)) return null;
  return {
    role,
    kind,
    also: ROLES.includes(also) && also !== role ? also : null,
    guess: Boolean(entry.guess),
  };
}

// A sentence's labels after the overrides the app is sure of: the caption only
// frames, and a heading is a heading, predicting an outcome when Claude said
// it concludes in any of its labels.
function labelsFor(entry, { labeled, heading, caption }) {
  const label = labelOf(entry);
  if (!labeled) return { role: null, kind: null, also: null, guess: false, conflict: false };
  let { role = null, kind = null, also = null, guess = false } = label || {};
  if (heading) {
    kind = [role, kind, also].includes('conclusion') ? 'conclusion' : 'framing';
    role = 'heading';
    also = null;
  } else if (caption) {
    role = 'other';
    kind = 'framing';
    also = null;
    guess = false;
  }
  const conflict = Boolean(role && kind && !ALLOWED[role].includes(kind));
  return { role, kind, also, guess, conflict };
}

// ---------------------------------------------------------------------------
// Runs and rails
// ---------------------------------------------------------------------------

// Runs of sentences that share a role, within each section: a run stays inside
// one paragraph, except that whole paragraphs in a row with the same role make
// one run. Without labels every paragraph is a run of its own. `sentences` are
// the analysis's, with n, block, section and the labels.
export function roleRuns(sections, sentences) {
  const runs = [];
  for (const section of sections) {
    const parts = [];
    for (const sentence of sentences.slice(section.first - 1, section.last)) {
      const part = parts.at(-1);
      if (part && part.block === sentence.block && part.role === sentence.role) {
        part.members.push(sentence);
      } else parts.push({ block: sentence.block, role: sentence.role, members: [sentence] });
    }
    // How many parts each paragraph has, counted once rather than again for each part.
    const perBlock = new Map();
    for (const part of parts) perBlock.set(part.block, (perBlock.get(part.block) || 0) + 1);
    let previous = null;
    for (const part of parts) {
      part.whole = perBlock.get(part.block) === 1;
      if (part.whole && previous?.whole && part.role !== null && previous.role === part.role) {
        previous.members.push(...part.members);
        continue;
      }
      previous = part;
      runs.push(part);
    }
  }
  return runs.map(({ role, members }) => ({
    first: members[0].n,
    last: members.at(-1).n,
    label: role ?? '',
    method: '',
    parent: sentences[members[0].n - 1].section,
    role,
    kind: members[0].kind,
    also: members.find(member => member.also)?.also ?? null,
    guess: members.some(member => member.guess),
    conflict: members.some(member => member.conflict),
  }));
}

const APPLYING = ['application', 'counter'];
const step = (letter, roles, state, titles) => ({
  letter,
  roles,
  state,
  title: titles[state],
});
// Whether a run does one of `roles`, as its role or its second one.
const does = (run, roles) => roles.includes(run.role) || roles.includes(run.also);
// The runs a section opens and closes with: a greeting, a line of thanks or a sign-off
// is not where it starts or ends.
const working = run => run.role !== 'other' && run.role !== null;
const openingRun = own => own.find(working) || own[0];
const closingRun = own => own.findLast(working) || own.at(-1);
// The sentences of a section that are not its heading.
const bodyOf = (section, sentences) =>
  sentences.slice(section.first - 1, section.last).filter(sentence => sentence.role !== 'heading');

// The letters over a section: I R A C for a sub-issue, P R M (prediction, cited
// rule, roadmap) for the umbrella, none for other parts or for an umbrella that is
// only its heading. `runs` are all the document's runs; `sentences` are the
// analysis's. A sentence's second role counts toward its letters too.
export function railOf(section, runs, sentences) {
  const own = runs.filter(run => run.parent === section.index);
  if (section.part === 'sub-issue') {
    const firstApplying = own.findIndex(run => does(run, APPLYING));
    const lastApplying = own.findLastIndex(run => does(run, APPLYING));
    const firstRule = own.findIndex(run => does(run, ['rule']));
    const issue =
      own.some(run => does(run, ['issue', 'heading'])) || openingRun(own)?.role === 'conclusion';
    // A sub-issue under an umbrella that states the rule may go straight to explaining it.
    const above =
      section.parent !== null &&
      runs.some(run => run.parent === section.parent && does(run, ['rule']));
    const rule =
      firstRule < 0
        ? above
          ? 'ok'
          : 'missing'
        : firstApplying >= 0 && firstRule > firstApplying
          ? 'order'
          : 'ok';
    // A conclusion at or after the last application: one that both applies and
    // concludes closes the section too.
    const closes = own.some((run, i) => does(run, ['conclusion']) && i >= lastApplying);
    return [
      step('I', ['issue', 'heading'], issue ? 'ok' : 'missing', {
        ok: 'Issue',
        missing: 'No issue stated',
      }),
      step('R', ['rule'], rule, {
        ok: firstRule < 0 ? 'Rule stated in the umbrella' : 'Rule',
        missing: 'No rule',
        order: 'The rule comes after the application',
      }),
      step('A', APPLYING, firstApplying >= 0 ? 'ok' : 'missing', {
        ok: 'Application',
        missing: 'No application to the client’s facts',
      }),
      step('C', ['conclusion'], closes ? 'ok' : 'missing', {
        ok: 'Conclusion',
        missing: 'No closing conclusion',
      }),
    ];
  }
  if (section.part === 'umbrella') {
    const mine = sentences.slice(section.first - 1, section.last);
    if (!bodyOf(section, sentences).length) return null;
    const predicting = mine.filter(predicts);
    // A rule cited in a form the parser does not know is cited all the same.
    const cited = mine.some(
      sentence =>
        (sentence.role === 'rule' || sentence.also === 'rule') &&
        ['direct', 'inferential', 'cited'].includes(sentence.support),
    );
    const roadmap = mine.some(
      sentence => sentence.role === 'roadmap' || sentence.also === 'roadmap',
    );
    return [
      step(
        'P',
        predicting.some(sentence => sentence.role === 'heading')
          ? ['conclusion', 'heading']
          : ['conclusion'],
        predicting.length ? 'ok' : 'missing',
        { ok: 'Overall prediction', missing: 'No overall prediction' },
      ),
      step('R', ['rule'], cited ? 'ok' : 'missing', { ok: 'Cited rule', missing: 'No cited rule' }),
      step('M', ['roadmap'], roadmap ? 'ok' : 'missing', { ok: 'Roadmap', missing: 'No roadmap' }),
    ];
  }
  return null;
}

// Whether a sentence predicts an outcome: a conclusion, or a heading that predicts.
const predicts = sentence =>
  sentence.role === 'conclusion' ||
  sentence.also === 'conclusion' ||
  (sentence.role === 'heading' && sentence.kind === 'conclusion');

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

// A concession is not the prediction, whether it opens the sentence ("While we cannot
// say for certain …, it is highly likely") or trails it ("probably not, although a
// judge is unlikely to decide").
const CONCESSION = /^(?:while|although|though|even if)\b[^,]*,\s*/i;
const TRAILING_CONCESSION = /,\s*(?:although|though|while|even if)\b[^.;]*/i;
// "Unlikely" predicts as surely as "likely" does, the other way.
const RANKS = [
  [
    1,
    /\b(?:(?:more |quite |very )?(?:uncertain|unclear)|close question|cannot say for certain|may not|might not)\b/i,
  ],
  [
    3,
    /\b(?:highly likely|very likely|almost certainly|high confidence|easily met|clearly|(?:highly|very) unlikely)\b/i,
  ],
  [2, /\b(?:(?:most |more )?likely|probably|should|unlikely)\b/i],
];

// How sure a prediction sounds: {rank, phrase}, from 1 (unsure) to 3 (sure), or
// null. Concessions are skipped.
export function confidenceRank(text) {
  const prediction = text.replace(CONCESSION, '').replace(TRAILING_CONCESSION, '');
  for (const [rank, pattern] of RANKS) {
    const found = prediction.match(pattern);
    if (found) return { rank, phrase: found[0] };
  }
  return null;
}

// A section's confidence: the least sure of its predictions, the way a whole is
// no surer than its weakest part. The conclusion's is its surest, since it states
// the overall prediction; the confidence check compares it with the parts.
function confidenceOf(section, sentences, surest = section.part === 'conclusion') {
  const ranked = sentences
    .slice(section.first - 1, section.last)
    .filter(
      sentence =>
        sentence.role === 'conclusion' ||
        (sentence.role === 'heading' && sentence.kind === 'conclusion'),
    )
    .map(sentence => ({ sentence, ...confidenceRank(sentence.text) }))
    .filter(({ rank }) => rank);
  if (!ranked.length) return null;
  const pick = (surest ? Math.max : Math.min)(...ranked.map(({ rank }) => rank));
  return ranked.find(({ rank }) => rank === pick);
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

// Most blocks are unchanged between edits, so each block text's citations and
// quotations are kept. The oldest entry goes when the cache is full.
const BLOCK_CACHE = 500;
const blockCache = new Map();
// A signal at the end of the text before a citation, in any case: "See", "but see",
// "see, e.g.,", "Cf.".
const SIGNAL_BEFORE =
  /(?<![A-Za-z])((?:but\s+)?(?:see(?:,?\s+e\.g\.,|\s+also|\s+generally)?|cf\.)|compare|accord|contra|e\.g\.,)\s*$/i;
// Only a semicolon between two citations: a string citation, where a signal carries on.
const STRING_CITE = /^\s*;\s*$/;
// What joins two citations of one citation sentence: a semicolon, with or without a new
// signal ("; see also"), or Compare's ", with".
const STRING_JOIN =
  /^\s*(?:;|,?\s+with\b)\s*(?:(?:but\s+)?(?:see(?:,?\s+e\.g\.,|\s+also|\s+generally)?|cf\.)|compare|accord|contra|e\.g\.,)?\s*$/i;

// A block's citations, each with `quoted` (inside the writer's quotation, so it is
// the quoted court's), its `signal`, and `joined` when a string citation joins it to the
// citation before ("A; see also B"), and its quotation spans. A signal carries
// through a string citation until another one starts: in "See A; B", B is a See
// citation too. Callers copy the citations before adding anything to them.
function readBlock(text) {
  const cached = blockCache.get(text);
  if (cached) return cached;
  const quotes = quoteSpans(text);
  let previous = null;
  const cites = findCitations(text).map(cite => {
    let signal =
      cite.signal ||
      text.slice(Math.max(0, cite.start - 30), cite.start).match(SIGNAL_BEFORE)?.[1] ||
      null;
    if (
      !signal &&
      !cite.nested &&
      previous &&
      STRING_CITE.test(text.slice(previous.end, cite.start))
    ) {
      signal = previous.signal;
    }
    const read = {
      ...cite,
      // A statute, book or record citation is named by its text without the explanatory
      // parentheticals after it ("28 U.S.C. § 1291 (granting …)" is "28 U.S.C. § 1291");
      // its span still covers them.
      text: cite.body ?? cite.text,
      quoted: quotes.some(([start, end]) => start < cite.start && cite.end <= end),
      signal,
      joined: Boolean(
        !cite.nested &&
        previous &&
        cite.start - previous.end < 40 &&
        STRING_JOIN.test(text.slice(previous.end, cite.start)),
      ),
    };
    if (!cite.nested) previous = read;
    return read;
  });
  const read = { quotes, cites };
  if (blockCache.size >= BLOCK_CACHE) blockCache.delete(blockCache.keys().next().value);
  blockCache.set(text, read);
  return read;
}

const FULL_DATE =
  /\b(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\b/;
// "U.S. Code", or a space before a subsection: "§ 3602 (b)". A space before the
// code's edition is Bluebook form ("§ 1332 (2018)", "§ 1332 (West 2020)"), and so is
// a note after the citation ("§ 349 (Count III)").
const STATUTE_FORM = /\bU\.S\. Code\b|§\s*\d[\w.]*\s+\((?!\d{4}\))[0-9a-zA-Z]{1,4}\)/;
const SUBSECTIONS = /(?:\s?\((?!\d{4}\))[0-9a-zA-Z]{1,4}\))+/;
// California's subdivisions: ", subd. (d)", ", subds. (a) & (b)".
const SUBDIVISIONS =
  /,\s*(?:subds?|pars?|paras?)\.\s*(?:\([0-9a-zA-Z]{1,4}\))+(?:(?:,\s*|\s+(?:&|and)\s+)(?:\([0-9a-zA-Z]{1,4}\))+)*/;
// The code's edition after a statute: "(2018)". The look-behind starts each try at the
// start of a run of spaces, so a long run is read once rather than again from each of
// its spaces; the other patterns anchored at the end start the same way.
const YEAR_AFTER = /(?<!\s)\s*\([^()]*\d{4}\)$/;
const SIGNAL_START =
  /^(?:See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Compare|Accord|Contra|E\.g\.,)\s+/i;
const STRENGTHS = ['direct', 'inferential', 'indirect', 'background'];

// How strongly a signal says the source supports the sentence, whatever its case:
// "See" and "see", "But see" and "but see".
function strengthOf(signal) {
  const plain = (signal || '').toLowerCase().replace(/\s+/g, ' ').replace(/,$/, '').trim();
  if (!plain || plain === 'e.g.' || plain === 'accord') return 'direct';
  if (plain === 'see' || plain === 'see, e.g.' || plain === 'see e.g.') return 'inferential';
  if (plain === 'see also' || plain === 'cf.' || plain === 'compare') return 'indirect';
  if (plain === 'see generally') return 'background';
  if (plain === 'but see' || plain === 'but cf.' || plain === 'contra') return 'contrary';
  return 'direct';
}

// A statute from its section on ("§ 3602(b)"), since a code with a title number
// repeats through a document. A code named by words alone ("Evid. Code, § 452", "N.Y.
// Gen. Bus. Law § 349") or a constitution ("U.S. Const. amend. XIV, § 1") keeps them:
// its section means nothing without them, and two codes may share a section number.
const fromSection = text => {
  const at = text.indexOf('§');
  return at < 0 || /\bConst\./.test(text) || !/^\d+\s+[A-Z]/.test(text.slice(0, at))
    ? text
    : text.slice(at);
};

// An id. that cites a constitution's other article or amendment ("Id. art. II, § 3",
// "(Id., art. I, § 7, subd. (b).)"), and the constitution a citation names ("U.S. Const.",
// "Cal. Const.,").
const OTHER_ARTICLE = /^[Ii]d\.,?\s+((?:arts?|amends?)\.\s.*)$/;
const CONSTITUTION = /^.*?\bConst\.,?/;
// A session law's or an executive order's number: "Pub. L. No. 110-325", "Exec. Order No.
// 14,028".
const LAW_NUMBER = /^(?:Pub\.\s?L\.\s?No\.\s?\d+[-–]\d+|Exec\.\s?Order\s?No\.\s?\d{1,2},?\d{3})/;
// The volume and first page of the Statutes at Large or the Federal Register, not a
// short form's "122 Stat. at 3554".
const FIRST_PAGE = /\b\d+\s+(?:Stat\.|Fed\.\s?Reg\.)\s+\d+(?:,\d{3})*/;

// A statute's name in chips and messages: its section, without subsections ("§ 3602"),
// a session law's or executive order's number ("Pub. L. No. 110-325"), or the volume and
// first page of the Statutes at Large or the Federal Register ("76 Fed. Reg. 16,978").
const sectionName = text =>
  text.match(LAW_NUMBER)?.[0] ||
  text.match(FIRST_PAGE)?.[0] ||
  fromSection(text).replace(YEAR_AFTER, '').replace(SUBDIVISIONS, '').replace(SUBSECTIONS, '');

// Citations to the case's own record or to the document's own sections: they are a
// fact's source, not an authority. An id. after one refers to it, and a bare "§ 4.3"
// in a document that discusses a contract's sections is one of them.
const isRecord = cite =>
  cite.type === 'record' || cite.type === 'internal' || Boolean(cite.internal || cite.record);
// A reference to a section of the document or contract ("§ 4.3", "Section 12.2"), or an
// id. that repeats one.
const isSection = cite =>
  cite.type === 'internal' ||
  Boolean(cite.internal) ||
  Boolean(cite.record && isSection(cite.record));
// A citation in a form the parser does not know ("Joint Stip. ¶ 4"), or an id. that
// repeats one. It is shown and listed, but never judged: whether it has a pin, what kind
// of source it is and how strongly it supports the sentence are unknown.
const isUnparsed = cite => cite.type === 'unparsed' || Boolean(cite.unparsed);

const pinOf = cite => (cite.pin || '').replace(/^at\s+/, '');
// A slip opinion's page stands in for a database cite: "No. 21-1234, slip op. at 5".
const SLIP_OPINION = /\bslip\s+op\./;
const hasPin = cite => {
  if (isRecord(cite) || isUnparsed(cite)) return true;
  if (cite.type === 'statute' || cite.type === 'section') return true;
  if (cite.type === 'docket' || cite.type === 'docket-number' || cite.type === 'database') {
    return Boolean(cite.pin) || /\bat\s+\*?\d/.test(cite.database || '');
  }
  if (cite.type === 'supra') return Boolean(cite.pin) || /\bat\s+\*?\d/.test(cite.text);
  // An id. takes the pin of the citation it repeats, and "Id. § 12102(2)(B)" or
  // "Id. ¶ 6" is its own pin.
  if (cite.type === 'id')
    return Boolean(pinOf(cite) || cite.inheritedPin || /[§¶]/.test(cite.text));
  return Boolean(pinOf(cite));
};
const unresolved = cite =>
  ['short', 'id', 'supra'].includes(cite.type) &&
  !cite.record &&
  (!cite.authority || cite.authority.nameless);

// Whether a citation cannot support the sentence as written: a full cite with no
// pin, an unreported case with no database cite (or slip opinion page) or full date, or a
// short form nothing resolves.
function deficient(cite) {
  if (cite.type === 'full') return !pinOf(cite);
  if (cite.type === 'docket' || cite.type === 'docket-number') {
    const slip = SLIP_OPINION.test(cite.text) && Boolean(cite.pin);
    return !(cite.database || slip) || !FULL_DATE.test(cite.date || cite.text);
  }
  return unresolved(cite);
}

const stateOf = cite =>
  cite.nested ? 'nested' : cite.quoted ? 'quoted' : unresolved(cite) ? 'unresolved' : 'own';

// A database citation without its pin: "2019 WL 1234567".
const withoutPin = database => (database || '').replace(/,\s*at\b[^]*$/, '');

// The record document a record citation cites, without its pin: "Compl." for "Compl.
// ¶ 12", "Alvarez Dep." for "Alvarez Dep. 8:2-11", "2 CT" for "2 CT 371 [Ostrander depo.
// at 44:3-19]", "Ex. B" for "Ex. B at 3". The number after "Ex.", "No.", "Doc.", "vol." or
// a trial exhibit's "PX" names the document ("Ex. 4", "ECF No. 12", "Doc. 45", "Trial Tr.
// vol. 2", "PX 12"), and a bare section ("§ 4.3") is all there is to name.
function recordSource(text) {
  const words = text.split(/\s+/);
  let kept = 1;
  for (; kept < words.length; kept++) {
    if (/^(?:Exh?\.|No\.|Doc\.|vol\.|[PDGJ]X)$/.test(words[kept - 1])) continue;
    if (/^(?:at$|[¶§[]|\d)/.test(words[kept])) break;
  }
  const source = words.slice(0, kept).join(' ').replace(/,$/, '');
  return /^(?:§+|Sections?)$/.test(source) ? text : source;
}

// What a citation chip says: the case's short name and pin, "Smith (docket)",
// "§ 3602(b)", "id. → Lakeside", "id. → Compl.", or the citation itself. An id. of the
// record names the record document, not the earlier citation's pin, which is not its own.
function chipLabel(cite) {
  const authority = cite.authority;
  const id = () => cite.text.match(/^[Ii](?:bi)?d\./)[0];
  if (cite.type === 'id') {
    if (cite.record) return `${id()} → ${opening(recordSource(cite.record.text), 24)}`;
    // What part of a form the parser does not know is the pin is unknown too.
    if (cite.unparsed) return `${id()} → ${opening(cite.unparsed.text, 24)}`;
    return authority && !authority.nameless ? `${id()} → ${authority.name}` : id();
  }
  if (!authority) {
    if (cite.type === 'short' && !cite.database) {
      return `${cite.volume} ${cite.reporter} at ${pinOf(cite)}`;
    }
    if (cite.type === 'supra') return cite.text.replace(SIGNAL_START, '');
    return cite.text;
  }
  switch (cite.type) {
    case 'full':
      // Without a pin the chip gives the first page, but a neutral citation's number
      // ("[2004] EWCA Crim 631") is the case's, not a page, and one known by its neutral
      // citation has it in its name already.
      return [authority.name, pinOf(cite) || (isNeutral(cite) ? '' : cite.page)]
        .filter(Boolean)
        .join(' ');
    case 'short':
      return `${authority.name} ${pinOf(cite)}`.trim();
    case 'docket':
      if (cite.database && pinOf(cite)) return `${authority.name} ${pinOf(cite)}`;
      return SLIP_OPINION.test(cite.text) && pinOf(cite)
        ? `${authority.name} slip op. ${pinOf(cite)}`
        : `${authority.name} (docket)`;
    // A supra with a pin reads as a short form does, so a brief in California Style
    // Manual form ("Ortega, supra, 26 Cal.4th at p. 1206") shows what its Bluebook copy
    // shows ("Ortega 1206").
    case 'supra':
      return pinOf(cite) ? `${authority.name} ${pinOf(cite)}` : `${authority.name}, supra`;
    case 'statute':
    case 'section': {
      // A session law by its number and the section cited: "Pub. L. No. 110-325, § 2(b)(4)".
      const law = cite.text.match(LAW_NUMBER)?.[0];
      if (law) {
        const section = cite.text.match(/§\s*\d[\w.-]*(?:\([0-9a-zA-Z]{1,4}\))*/)?.[0];
        return section ? `${law}, ${section}` : law;
      }
      // "§ 1983 (a)" closes up to "§ 1983(a)"; "subd. (c)" and "(m), (n)" keep their space.
      return fromSection(cite.text)
        .replace(YEAR_AFTER, '')
        .replace(/(?<=[\w)])\s+(?=\([0-9a-zA-Z]{1,4}\))/g, '');
    }
    case 'periodical':
    case 'secondary':
      return [authority.name, pinOf(cite)].filter(Boolean).join(' ');
    case 'legislative':
      return authority.name;
    default:
      return cite.text;
  }
}

// Citations an id. can point back to.
const CITABLE = new Set([
  'full',
  'docket',
  'docket-number',
  'database',
  'short',
  'supra',
  'statute',
  'section',
  'periodical',
  'secondary',
  'legislative',
]);

// Citations that cite an authority in full: a case with its court, a statute, an
// article, a book, a report.
const FULL_TYPES = new Set([
  'full',
  'docket',
  'docket-number',
  'database',
  'periodical',
  'secondary',
  'legislative',
]);

// Whether a citation is a neutral one, which names its court as its reporter: "[2015]
// UKSC 31", "[2019] EWHC 123 (Ch)" (the High Court's Chancery Division), "2019 SCC 65",
// and the US states' public-domain citations, "2020 IL 124112", "2021-Ohio-1234", whose
// courts legal-text names ("Ill."). A report numbered by its year, "[1932] AC 562 (HL)",
// has pages and a court of its own, though legal-text keys it by its first page as it
// does a neutral citation.
function isNeutral(cite) {
  const court = squeeze(cite.court || '');
  const reporter = squeeze(cite.reporter || '');
  if (!/^\[/.test(cite.volume || '')) return Boolean(cite.neutral || (court && court === reporter));
  return Boolean(court && reporter && court.startsWith(reporter));
}

// A citation's volume, reporter and page as the document writes them: "2021-Ohio-1234",
// not "2021 Ohio 1234".
const coreOf = cite =>
  cite.core
    ? cite.text.slice(cite.core[0] - cite.start, cite.core[1] - cite.start).replace(/\s+/g, ' ')
    : `${cite.volume} ${cite.reporter} ${cite.page}`;

// The name a case goes by, from legal-text's shortName. A case cited by a neutral
// citation alone is named by the whole of it, "[2019] UKSC 5", since its court and year
// ("[2019] UKSC") name no one case.
function caseName(cite, all, prose) {
  const name = shortName(cite, all, prose);
  return !cite.name && isNeutral(cite) && name === `${cite.volume} ${cite.reporter}`
    ? { name: coreOf(cite) }
    : { name };
}

// The page a pin starts on: "418–19" is 418, "*3" is 3.
const pinPage = cite => parseInt(String(cite.pin || '').replace(/^\D+/, ''), 10);

// The case a short form or supra means among the cases cited in the volume and
// reporter (or database number) it cites, `key`. With one case cited in full, that
// one. With several (Celotex and Anderson are both in 477 U.S.), the one its name
// names, else the last to start before its pin, since a pin falls inside the case it
// cites. With none cited in full, a case never cited in full by the same name, or by
// any name if it gives none.
function caseIn(cases, cite, key) {
  const full = cases.filter(item => !item.nameless);
  const name = cite.antecedent ? cite.antecedent.replace(SIGNAL_START, '') : null;
  if (!full.length) return cases.find(item => !name || item.name === name) || null;
  if (full.length === 1) return full[0];
  const named =
    name &&
    full.find(
      item => item.name === name || item.shortTitle === name || item.caseName?.includes(name),
    );
  if (named) return named;
  const pin = pinPage(cite);
  const pageIn = item => Number(item.pages.get(key) ?? item.page);
  const before = full.filter(item => pageIn(item) <= pin);
  return before.sort((a, b) => pageIn(b) - pageIn(a))[0] || full[0];
}

// The surname an author goes by: "Roe" for "Jane Roe", "Wright & Miller" for "Charles
// Alan Wright & Arthur R. Miller", "Lindemann" for "Barbara T. Lindemann et al.".
const surnames = author =>
  (author || '')
    .replace(/(?<![\s,]),?\s+et\s+al\.?$/, '')
    .split(/(?<!\s)\s+(?:&|and)\s+/)
    .map(person => person.trim().split(/\s+/).at(-1))
    .filter(Boolean)
    .join(' & ');

// An authority for a law review article, a book or guidance, or legislative history,
// listed under "other": its name for chips, and its author for supras that name them.
function otherSource(cite) {
  if (cite.type === 'legislative') {
    // Its number and part, which make one report, without the pin or year: "H.R. Rep.
    // No. 110-730, pt. 1".
    const cut = cite.text.search(/,\s*at\b|\(/);
    return { name: (cut < 0 ? cite.text : cite.text.slice(0, cut)).trimEnd(), author: null };
  }
  const name =
    surnames(cite.author) ||
    opening((cite.title || cite.text).replace(/(?<![,\s])[,\s]+$/, ''), 40);
  return { name, author: cite.author || null, title: cite.title || null };
}

// The key two citations of one book or guidance share: its author and title, so its
// pins do not make rows of their own.
const sourceKey = cite =>
  cite.type === 'secondary' && cite.title
    ? `secondary:${squeeze(cite.author || '')}|${squeeze(cite.title)}`
    : citationKey(cite) || cite.text;

// A section numbered the way a contract's clauses are, "§ 4.3" or "§ 12.2(b)", and no
// code's sections are: a code's run to three digits or more ("§ 1983", "§ 1630.2").
const CLAUSE = /^§§?\s*\d{1,2}\.\d{1,2}(?![\d.])/;
// A section with a short number, as a contract's or a policy's are: "§ 2", "§ 12(b)".
const SHORT_SECTION = /^§§?\s*\d{1,2}(?![\d-])/;

// The authorities the citations point at. A full citation's key is its volume,
// reporter and first page, so two cases in one volume stay two, and it is found
// under each of its parallel citations too ("550 U.S. 544, 127 S. Ct. 1955"); a
// statute's is legal-text's citationKey, which drops subsections; an unreported
// case's is its docket or database number. Full citations, dockets, statutes and
// secondary sources name their own; a short form resolves to a case cited in full in
// its volume and reporter (or database number) anywhere in the document, or else
// stands for a case never cited in full ("Hovsons"); a supra to the case, article or
// book its volume or name names; a bare section ("§ 3602(c)") joins the statute cited
// with that section, but in a document that cites a contract's sections it does so only
// in the statute's own paragraph and is otherwise one of the contract's sections, never
// a statute, as is one numbered as a contract's are ("§ 4.3") that no statute here
// has, and a short one ("§ 2") in a client fact outside the statute's paragraph ("The
// Fees are payable as provided in § 2"): a fact tells of the client's own documents; id.
// resolves to the last citation the writer made, not one inside a quotation or a
// parenthetical, and "Id. § 12926(m)" after a code's section is another section of that
// code. An id. right after a citation of more than one source ("A; B. Id. at 4") is
// `ambiguous` and resolves to nothing, since it could mean any of them (Bluebook rule 4.1
// allows id. only after a citation of one). A citation in a form the parser does not know
// is an authority of its own, keyed by its text, and an id. after it repeats it
// (`unparsed`). The record and the document's own sections are not authorities, and
// neither is anything cited in the caption. `kindAt(cite)` is the kind of the sentence a
// citation is in, or null; `prose`, the document's words outside its citations, gives the
// name the writer calls a case by.
function resolve(all, caption, kindAt = () => null, prose = '') {
  const byKey = new Map();
  const authority = (key, make) => {
    if (!byKey.has(key)) byKey.set(key, { key, cites: [], refs: [], ...make() });
    return byKey.get(key);
  };
  // The cases cited in each volume and reporter (or database number), and the statutes,
  // in order.
  const volumes = new Map();
  const file = (key, item, page) => {
    const list = volumes.get(key) || [];
    if (!list.includes(item)) list.push(item);
    volumes.set(key, list);
    if (!item.pages.has(key)) item.pages.set(key, page);
  };
  const inVolume = (cite, item) => {
    file(citationKey(cite), item, cite.page);
    for (const parallel of cite.parallel || []) {
      file(`${parallel.volume} ${squeeze(parallel.reporter)}`, item, parallel.page);
    }
    return item;
  };
  const statutes = [];
  const statute = (key, cite, code) => {
    const item = authority(key, () => ({
      group: 'statutes',
      name: sectionName(code + cite.text.slice(Math.max(0, cite.text.indexOf('§')))),
      code,
      block: cite.block,
    }));
    if (!statutes.includes(item)) statutes.push(item);
    return item;
  };
  const counted = cite => !caption.has(cite.block);
  for (const cite of all.filter(counted)) {
    if (cite.type === 'full' || cite.type === 'docket') {
      cite.authority = inVolume(
        cite,
        authority(
          // A neutral citation's key has its number already: "2020 IL 124112".
          cite.type === 'full' && !cite.neutral
            ? `${citationKey(cite)} ${cite.page}`
            : citationKey(cite),
          () => ({
            group: 'cases',
            ...caseName(cite, all, prose),
            caseName: cite.name,
            shortTitle: cite.shortTitle || null,
            page: cite.page,
            pages: new Map(),
          }),
        ),
      );
    } else if (cite.type === 'statute') {
      const code = cite.text.includes('§') ? cite.text.slice(0, cite.text.indexOf('§')) : '';
      cite.authority = authority(citationKey(cite), () => ({
        group: 'statutes',
        name: sectionName(cite.text),
        code,
        block: cite.block,
      }));
      if (!statutes.includes(cite.authority)) statutes.push(cite.authority);
    } else if (cite.type === 'docket-number' || cite.type === 'database') {
      cite.authority = authority(citationKey(cite) || cite.text, () => ({
        group: 'other',
        name: cite.docket || withoutPin(cite.database) || cite.text,
      }));
    } else if (['periodical', 'secondary', 'legislative'].includes(cite.type)) {
      cite.authority = authority(sourceKey(cite), () => ({ group: 'other', ...otherSource(cite) }));
    } else if (cite.type === 'unparsed') {
      cite.authority = authority(citationKey(cite), () => ({
        group: 'other',
        name: cite.text,
        unparsed: true,
      }));
    }
  }
  // A supra that names its source: a case by its name or short title, else an article
  // or book by its author.
  const byName = antecedent => {
    const name = antecedent
      .replace(SIGNAL_START, '')
      .replace(/(?<![\s,]),?\s+et\s+al\.?$/, '')
      .trim();
    if (!name) return null;
    const word = new RegExp(String.raw`(?<![\w])${escape(name)}(?![\w])`);
    const items = [...byKey.values()];
    return (
      items.find(
        item =>
          item.group === 'cases' &&
          !item.nameless &&
          (item.name === name || item.shortTitle === name || word.test(item.caseName || '')),
      ) ||
      items.find(item => item.group === 'other' && item.author && word.test(item.author)) ||
      null
    );
  };
  const contract = all.some(cite => cite.type === 'internal');
  // What an id. refers to: {authority, cite}, {record} (a record citation or a section
  // of the document), {unparsed} (a citation in a form the parser does not know), or
  // {lost} (a citation nothing resolves), or null.
  let last = null;
  // The sources the last citation sentence cites: {sources}.
  let string = null;
  for (const cite of all.filter(counted)) {
    if (cite.type === 'short') {
      const key = citationKey(cite);
      const found = caseIn(volumes.get(key) || [], cite, key);
      if (found) cite.authority = found;
      else if (cite.antecedent) {
        const name = shortName(cite);
        const item = authority(`${key} ${name}`, () => ({
          group: 'cases',
          name,
          nameless: true,
          volume: cite.volume,
          reporter: cite.reporter,
          database: withoutPin(cite.database) || null,
          pages: new Map(),
        }));
        cite.authority = inVolume(cite, item);
      }
    } else if (cite.type === 'section') {
      const key = citationKey(cite);
      // In a document that cites a contract's sections, or in a client fact with a short
      // section, "§ 2" is the statute's only in the paragraph that cites the statute;
      // elsewhere, a statute cited anywhere.
      const local = contract || (kindAt(cite) === 'client-fact' && SHORT_SECTION.test(cite.text));
      const cited = statutes.find(
        item =>
          item.key.replace(/^[^§]*/, '') === key &&
          (!local ||
            all.some(
              other =>
                other.type === 'statute' && other.authority === item && other.block === cite.block,
            )),
      );
      if (cited) cite.authority = cited;
      else if (local || CLAUSE.test(cite.text)) cite.internal = true;
      else cite.authority = statute(key, cite, '');
    } else if (cite.type === 'supra') {
      if (cite.volume) {
        const key = `${cite.volume} ${squeeze(cite.reporter)}`;
        cite.authority = caseIn(volumes.get(key) || [], cite, key);
      }
      cite.authority ||= cite.antecedent ? byName(cite.antecedent) : null;
    } else if (cite.type === 'id' && !cite.quoted) {
      // In "A; B. Id. at 4" the id. could mean A or B; in "A; id. at 4" it is A.
      if ((!cite.joined && string?.sources.size > 1) || last?.lost?.ambiguous) {
        cite.ambiguous = true;
      } else if (last?.record) cite.record = last.record;
      else if (last?.unparsed) {
        cite.unparsed = last.unparsed;
        cite.authority = last.unparsed.authority;
      } else if (last?.lost) cite.lost = last.lost;
      else if (last?.authority) {
        const at = cite.text.indexOf('§');
        const was = last.authority;
        const article = cite.text.match(OTHER_ARTICLE);
        const constitution =
          article && was.group === 'statutes'
            ? (was.cites.find(other => other.type === 'statute')?.text || was.code || '').match(
                CONSTITUTION,
              )
            : null;
        if (constitution) {
          // "Id. art. II, § 3" after "U.S. Const. art. I, § 8, cl. 3" is article II of
          // that constitution: "U.S. Const. art. II, § 3".
          const text = `${constitution[0]} ${article[1]}`;
          const key = citationKey({ type: 'statute', text });
          const section = text.indexOf('§');
          cite.authority =
            key === was.key
              ? was
              : section < 0
                ? statute(key, { ...cite, text: '' }, text)
                : statute(key, cite, text.slice(0, section));
        } else if (at >= 0 && was.group === 'statutes' && was.key.includes('§')) {
          // "Id. § 12926(m)" after "Cal. Gov’t Code § 12940(m)" is § 12926 of that code.
          const section = citationKey({ type: 'section', text: cite.text.slice(at) });
          const key = was.key.slice(0, was.key.indexOf('§')) + section;
          cite.authority = key === was.key ? was : statute(key, cite, was.code);
        } else cite.authority = was;
        cite.inheritedPin = hasPin(last.cite);
      }
    }
    if (!cite.quoted && !cite.nested) {
      if (cite.ambiguous) last = { lost: cite };
      else if (isRecord(cite)) last = { record: cite.record || cite };
      else if (isUnparsed(cite)) last = { unparsed: cite.unparsed || cite };
      else if (cite.lost) last = { lost: cite.lost };
      else if (cite.authority && (CITABLE.has(cite.type) || cite.type === 'id')) {
        // A short form for a case never cited in full still names the case an id. after
        // it means, so it counts; the id. then shows as unresolved, as the short form does.
        last = { authority: cite.authority, cite };
      } else if (['short', 'supra', 'id'].includes(cite.type)) last = { lost: cite };
      // The sources of the citation sentence so far: a string citation adds to them.
      const source = sourceOf(cite);
      if (cite.joined && string) string.sources.add(source);
      else string = { sources: new Set([source]) };
    }
    cite.authority?.cites.push(cite);
  }
  return byKey;
}

// The one source a citation cites, so a string citation can tell whether it cites more
// than one: an authority, a record document ("Compl." for "Compl. ¶ 4" and "Compl. ¶ 6"),
// or the citation itself when nothing resolves it.
function sourceOf(cite) {
  if (cite.authority) return cite.authority;
  if (cite.record || isRecord(cite)) return `record:${recordSource((cite.record || cite).text)}`;
  return cite;
}

// ---------------------------------------------------------------------------
// Support and flags
// ---------------------------------------------------------------------------

// Record citations the parser did not read as citations, in a fact's own words.
const RECORD =
  /\b(?:Ex\.|Exh\.|Compl\.|Dep\.|Decl\.|Aff\.|Tr\.|R\. at|ECF No\.)|\b\d*\s*(?:CT|RT|AA)\s+\d/;
const OPEN_ITEM = /\[cite\]|\bTK\b|needs? to confirm|confirm with client|\?\?\?/i;
const WEAK = new Set(['missing', 'incomplete', 'secondhand', 'contrary', 'unsourced']);
// Roles that state no law or fact, so need no source.
const SOURCELESS = new Set(['issue', 'roadmap', 'heading']);
// Words that say who is speaking: "she says", "Pruitt told me", "a customer calls",
// "according to". A plan that "calls for" something is not speaking.
const SPEECH =
  /\b(?:says|said|say|tells|told|explains|explained|adds|added|recalls|recalled|warns|warned|asks|asked|writes|wrote|notes|noted|replies|replied|answers|answered|insists|insisted|admits|admitted|jokes|joked|shouts|shouted|laughs|laughed|shrugs|shrugged|according to|call(?:s|ed)\b(?!\s+for\b))\b/i;

// What a sentence rests on, first match wins. A fact citing the record, or the section of
// a contract it describes, rests on the record; anything else rests on its legal
// citations, by their signals. A fact told in a story, a letter or a contract's clauses
// (`narrative`) needs no source, and rests on its legal citations before the sections of
// a contract it names. In a section with no analysis, such as a contract's own clauses
// (`clauses`), a cross-reference to another clause is no source at all.
function supportOf(sentence, context) {
  const { heading, caption, narrative, clauses, cites, own, secondhand, citedBelow } = context;
  if (heading || caption || SOURCELESS.has(sentence.role)) return 'n/a';
  if (sentence.kind === 'document-text') return 'n/a';
  const records = own.filter(cite => isRecord(cite) && !(clauses && isSection(cite)));
  const legal = own.filter(cite => !isRecord(cite) && !isUnparsed(cite));
  const record = records.some(cite => !isSection(cite));
  if (sentence.kind === 'client-fact' && (narrative ? record : records.length)) return 'record';
  if (legal.length) {
    const strengths = legal.map(cite => strengthOf(cite.signal));
    const support = strengths.every(strength => strength === 'contrary')
      ? 'contrary'
      : STRENGTHS.find(strength => strengths.includes(strength));
    if (legal.every(deficient)) return 'incomplete';
    // A case described through another court's citation of it.
    if (sentence.kind === 'precedent' && secondhand) return 'secondhand';
    return support;
  }
  if (records.length) return 'record';
  // A citation in a form the parser does not know: a client fact's is taken for its
  // record; anything else is cited, but how well is not judged.
  if (own.some(isUnparsed)) return sentence.kind === 'client-fact' ? 'record' : 'cited';
  if (sentence.kind === 'client-fact') {
    if (narrative) return 'n/a';
    return RECORD.test(sentence.text) ? 'record' : 'unsourced';
  }
  if (!sentence.kind) return 'unknown';
  if (['conclusion', 'framing', 'application'].includes(sentence.kind)) return 'n/a';
  if (cites.length) return 'secondhand';
  if (/:$/.test(sentence.text.trimEnd()) && citedBelow) return 'below';
  return 'missing';
}

// Drafting slips in citation form, which a reviewer fixes but which change no
// support: [id, text, test].
const FORM = [
  [
    'lowercase',
    'Starts in lowercase after a period',
    // Not on a new line, where a caption's "v." stands alone.
    ({ sentence, text }) =>
      sentence.index > 0 &&
      /^[a-z]/.test(sentence.text) &&
      !/\n[^\S\n]*$/.test(text.slice(Math.max(0, sentence.start - 40), sentence.start)),
  ],
  [
    'no-period',
    'Citation has no closing period',
    ({ sentence, own }) => own.at(-1)?.end === sentence.end && /[\d)]$/.test(sentence.text),
  ],
  [
    'no-punctuation-before-citation',
    'No punctuation between the quotation and the citation',
    ({ sentence, own, text }) =>
      own.some(cite =>
        /[^.!?,;:\s][”"]\s+$/.test(
          text.slice(Math.max(sentence.start, cite.start - 40), cite.start),
        ),
      ),
  ],
  [
    'footnote',
    'A footnote number is pasted into the text',
    ({ sentence }) => /[a-z][.!?]["”’]?\d{1,3}$/.test(sentence.text),
  ],
  ['doubled', 'Doubled closing punctuation', ({ sentence }) => /[.!?][”"’]\./.test(sentence.text)],
  ['stray-period', 'Stray period before a comma', ({ sentence }) => /\)\.,/.test(sentence.text)],
  [
    'missing-space',
    'No space after the period',
    // Only after a period, question mark or exclamation mark, so not between
    // sentences of scripts written without spaces ("裁判所は判断した。これは").
    ({ sentence, text }) =>
      /[.!?]["”’)\]]*$/.test(sentence.text) && /\S/.test(text[sentence.end] ?? ' '),
  ],
  ['statute', 'Statute not in Bluebook form', ({ sentence }) => STATUTE_FORM.test(sentence.text)],
  [
    'comma-before-court',
    'Stray comma before the court and year',
    ({ cites }) =>
      cites.some(cite => cite.type === 'docket' && /,\s*\((?:[^()]*\s)?\d{4}\)/.test(cite.text)),
  ],
];

// The position of a block's last “ that no ” closes, or -1.
function unclosedQuote(text) {
  const open = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '“') open.push(i);
    else if (text[i] === '”') open.pop();
  }
  return open.length ? open.at(-1) : -1;
}

function flagsOf(sentence, context) {
  const { heading, caption, narrative, quoted, attributed, cites, own, named, uncited } = context;
  const { text, unclosed } = context;
  const flags = [];
  const add = (id, label, attention) => flags.push({ id, text: label, attention });
  const kind = sentence.kind;
  if (quoted) add('quote', 'Quotation', false);
  // A quotation needs a source when it states law or a holding, or a fact the analysis
  // rests on; one the writer says someone spoke, or one in a story, does not. Without
  // labels it is noted but not counted, since it may be either, and so is one in a
  // question presented or a roadmap, whose sources come in the discussion.
  if (quoted && !own.length && !heading && !caption) {
    if (!kind || SOURCELESS.has(sentence.role)) {
      if (!attributed) add('quote-unsourced', 'Quotation with no source', false);
    } else if (
      kind === 'law' ||
      kind === 'precedent' ||
      (kind === 'client-fact' && !narrative && !attributed)
    ) {
      add('quote-unsourced', 'Quotation with no source', true);
    }
  }
  if (quoted && own.length && own.every(cite => !hasPin(cite))) {
    add('quote-no-pin', 'Quotation without a pin cite', true);
  }
  if (unclosed >= sentence.start && unclosed < sentence.end) {
    add('quote-unclosed', 'Quotation never closed', true);
  }
  if (OPEN_ITEM.test(sentence.text)) add('open', 'Open item', true);
  const cases = [...new Map(named.map(ref => [ref.authority.key, ref.authority])).values()];
  for (const authority of cases) {
    if (authority.nameless) add('never-full', `Never cited in full: ${authority.name}`, true);
    else if (later(authority.full, sentence)) {
      add('named-before-full', `Named before its full citation: ${authority.name}`, true);
    }
  }
  if (kind === 'precedent') {
    for (const { name } of uncited)
      add('uncited-case', `Describes ${name} without citing it`, true);
  }
  if (own.some(cite => cite.ambiguous)) {
    add('ambiguous-id', 'Id. after more than one source is ambiguous', true);
  }
  // The record needs no parenthetical: what it shows is the sentence's fact. Nor is a
  // citation in a form the parser does not know judged.
  const legal = own.filter(cite => !isRecord(cite) && !isUnparsed(cite));
  if (legal.some(cite => strengthOf(cite.signal) === 'indirect' && !cite.parentheticals?.length)) {
    add('needs-parenthetical', 'Add a parenthetical saying how it supports this', true);
  }
  if (kind === 'application' && !own.length) {
    for (const { name } of cases) {
      add('see-suggested', `Relies on ${name}: consider a See cite`, false);
    }
  }
  // The caption's lines are not prose, so their form is not checked.
  const items = caption
    ? []
    : FORM.filter(([, , test]) => test({ sentence, own, cites, text })).map(([id, label]) => ({
        id,
        text: label,
      }));
  if (items.length) {
    flags.push({
      id: 'form',
      text: 'Form',
      attention: false,
      title: items.map(item => item.text).join('\n'),
      items,
    });
  }
  return flags;
}

// Whether a full citation comes after a sentence.
const later = (cite, sentence) =>
  cite &&
  (cite.block > sentence.block || (cite.block === sentence.block && cite.start >= sentence.end));

// ---------------------------------------------------------------------------
// The analysis
// ---------------------------------------------------------------------------

// Quotations in a sentence's words, so what is said around them can be read alone.
const QUOTED = /“[^“”]*”|"[^"]*"/g;

export function analyzeLegal(blocks, labels) {
  blocks = withHeadings(blocks);
  const labeled = Array.isArray(labels) && labels.some(labelOf);
  const sections = sectionsOf(blocks);
  const type = typeOf(blocks, sections);
  const legal = legalShape(blocks, sections);
  const sectionOf = new Map();
  for (const section of sections) for (const block of section.blocks) sectionOf.set(block, section);
  const caption = new Set(
    sections.filter(section => section.part === 'caption').flatMap(section => section.blocks),
  );

  // Sentences, numbered through the document as DocumentModel.runs numbers them.
  const sentences = [];
  const byBlock = blocks.map((block, at) =>
    block.sentences.map((sentence, index) => {
      const section = sectionOf.get(at);
      const entry = {
        n: sentences.length + 1,
        block: at,
        index,
        start: sentence.start,
        end: sentence.end,
        text: sentence.text,
        section: section.index,
        ...labelsFor(labels?.[sentences.length], {
          labeled,
          heading: HEADING.test(block.kind),
          caption: caption.has(at),
        }),
      };
      sentences.push(entry);
      return entry;
    }),
  );
  if (labeled) reclassify(sections, sentences, legal);
  const tagOf = at => sectionOf.get(at)?.tag ?? '';
  const sentenceAt = (at, offset) =>
    byBlock[at].find(sentence => offset >= sentence.start && offset < sentence.end) || null;

  // Citations through the whole document, so short forms and id. resolve across
  // paragraphs, and the names cases go by in running text.
  const read = blocks.map(block => readBlock(block.text));
  const all = [];
  const citesOf = blocks.map((block, at) => {
    const own = read[at].cites.map(cite => ({ ...cite, block: at, authority: null }));
    all.push(...own);
    return own;
  });
  // The document's words outside its citations, for the names it calls cases by.
  const prose = blocks
    .map((block, at) =>
      citesOf[at]
        .filter(cite => !cite.nested)
        .reduceRight(
          (text, cite) => text.slice(0, cite.start) + ' ' + text.slice(cite.end),
          block.text,
        ),
    )
    .join('\n');
  const authorities = resolve(
    all,
    caption,
    cite => sentenceAt(cite.block, cite.start)?.kind ?? null,
    prose,
  );
  for (const authority of authorities.values()) {
    authority.full = authority.cites.find(cite => FULL_TYPES.has(cite.type));
  }
  // The caption's citations name no case the analysis relies on. A one-word name the
  // document also writes in lowercase ("brown") is not the case's, as the guard reads it.
  const counted = all.filter(cite => !caption.has(cite.block));
  const names = referenceNames(counted, blocks.map(block => block.text).join('\n'));
  const refsOf = blocks.map((block, at) =>
    findReferences(block.text, citesOf[at], names)
      .map(ref => ({
        block: at,
        start: ref.start,
        end: ref.end,
        text: ref.text,
        authority: counted[ref.refersTo]?.authority,
        quoted: read[at].quotes.some(([start, end]) => start < ref.start && ref.start < end),
      }))
      .filter(ref => ref.authority && !caption.has(at)),
  );
  for (const refs of refsOf) for (const ref of refs) ref.authority.refs.push(ref);

  // What each sentence cites and names.
  const inSentence = list => {
    const out = sentences.map(() => []);
    list.forEach((items, at) => {
      for (const item of items) {
        const sentence = sentenceAt(at, item.start);
        if (sentence) out[sentence.n - 1].push(item);
      }
    });
    return out;
  };
  // A document not laid out as legal analysis that never cites a record, such as a
  // letter, an email or an article, tells its facts without sources.
  const story = !legal && !all.some(cite => cite.type === 'record');
  const sentenceCites = inSentence(citesOf);
  const sentenceRefs = inSentence(refsOf);
  const ownOf = n => sentenceCites[n - 1].filter(cite => !cite.nested && !cite.quoted);
  const nextBlock = at => byBlock.slice(at + 1).find(own => own.length)?.[0];
  const previousBlock = at => byBlock.slice(0, at).findLast(own => own.length)?.[0]?.block;
  const unclosed = blocks.map(block => unclosedQuote(block.text));
  // A block quotation whose citation is the paragraph right after it rests on that
  // citation, as one that ends with it does.
  const borrowed = new Map();
  blocks.forEach((block, at) => {
    if (block.kind !== 'blockquote' || !block.sentences.length) return;
    const next = nextBlock(at);
    if (next && blocks[next.block].kind !== 'blockquote' && isCitationSentence(next.text)) {
      borrowed.set(at, ownOf(next.n));
    }
  });
  // Whether a case is cited in full in a paragraph or the one before it, so a sentence
  // there that names it needs no citation of its own to say which case it is.
  const citedNear = (authority, at) => {
    const near = [at, previousBlock(at)];
    return authority.cites.some(
      cite => FULL_TYPES.has(cite.type) && !cite.nested && near.includes(cite.block),
    );
  };

  // Dialogue: a quotation is attributed when its sentence names the speaker, or when it
  // carries on from one that did, in the same paragraph ("…," she says. "It's mostly
  // dishes."), as the second sentence of one quotation does.
  let speaking = null;
  for (const sentence of sentences) {
    const block = blocks[sentence.block];
    const section = sections[sentence.section];
    const heading = HEADING.test(block.kind);
    const continues =
      speaking?.block === sentence.block &&
      speaking.attributed &&
      (/^[“"]/.test(sentence.text) ||
        read[sentence.block].quotes.some(
          ([start, end]) => start < sentence.start && sentence.start < end,
        ));
    speaking = {
      block: sentence.block,
      attributed: SPEECH.test(sentence.text.replace(QUOTED, ' ')) || continues,
    };
    const inCaption = caption.has(sentence.block);
    const narrative = section.part === 'other' || story;
    const cites = sentenceCites[sentence.n - 1];
    const own = [...ownOf(sentence.n), ...(borrowed.get(sentence.block) || [])];
    const named = sentenceRefs[sentence.n - 1].filter(ref => !ref.quoted);
    const next = nextBlock(sentence.block);
    const quoted =
      block.kind === 'blockquote' ||
      read[sentence.block].quotes.some(
        ([start, end]) =>
          start < sentence.end && end > sentence.start && words(block.text.slice(start, end)) >= 4,
      );
    // Cases the sentence names but does not cite. One cited only inside its citation's
    // parenthetical ("(quoting …)"), or never cited in full, is described through the
    // case the sentence does cite; one cited in full nearby needs no citation to say
    // which case it is; any other is uncited.
    const keys = new Set(own.map(cite => cite.authority?.key));
    const nestedKeys = new Set(cites.filter(cite => cite.nested).map(cite => cite.authority?.key));
    const others = [
      ...new Map(
        named
          .filter(ref => !keys.has(ref.authority.key))
          .map(ref => [ref.authority.key, ref.authority]),
      ).values(),
    ];
    const through = authority =>
      nestedKeys.has(authority.key) || (authority.nameless && own.length > 0);
    const secondhand = others.some(through);
    const uncited = others.filter(
      authority => !through(authority) && !citedNear(authority, sentence.block),
    );
    sentence.support = supportOf(sentence, {
      heading,
      caption: inCaption,
      narrative,
      clauses: section.part === 'other',
      cites,
      own,
      secondhand,
      citedBelow: Boolean(next && (ownOf(next.n).length || borrowed.get(next.block)?.length)),
    });
    sentence.flags = flagsOf(sentence, {
      heading,
      caption: inCaption,
      narrative,
      quoted,
      attributed: speaking.attributed,
      cites,
      own,
      named,
      uncited,
      text: block.text,
      unclosed: unclosed[sentence.block],
    });
    sentence.cites = cites.map(cite => ({
      label: chipLabel(cite),
      state: stateOf(cite),
      start: cite.start,
      end: cite.end,
      key: cite.authority?.key ?? null,
      text: cite.text,
    }));
    // A reference to a section of the document is part of what the sentence says.
    const first = ownOf(sentence.n).find(cite => cite.type !== 'internal' && !cite.internal);
    const lead = first
      ? block.text.slice(sentence.start, first.start).trimEnd().replace(SIGNAL_BEFORE, '').trimEnd()
      : '';
    sentence.lead = lead || sentence.text;
    sentence.attention = WEAK.has(sentence.support) || sentence.flags.some(flag => flag.attention);
  }

  const runs = roleRuns(sections, sentences);
  for (const section of sections) {
    // A brief argues; how sure its words sound is advocacy, not a prediction.
    const confidence = labeled && type === 'memo' ? confidenceOf(section, sentences) : null;
    section.rank = confidence?.rank ?? null;
    section.phrase = confidence?.phrase ?? null;
    section.rail = labeled ? railOf(section, runs, sentences) : null;
  }
  const checks = labeled
    ? checksOf({ sections, sentences, runs, blocks, read, citesOf, ownOf, type, legal })
    : [];

  return {
    labeled,
    type,
    sentences,
    sections,
    runs,
    checks,
    authorities: tableOf(authorities, tagOf),
    unresolved: unresolvedOf(all, tagOf, caption),
    attentionCount: sentences.filter(sentence => sentence.attention).length,
  };
}

// ---------------------------------------------------------------------------
// Structure checks
// ---------------------------------------------------------------------------

const SEVERITY = { fail: 0, warn: 1, info: 2 };
// Spaces only, not line breaks: with \s each line start would look through every
// line after it, a pause of a fifth of a second on a block of empty lines.
const CLIENT_LINE = /^[^\S\n]*(?:RE|Re|Subject)[^\S\n]*:[^\S\n]*(.*)$/m;
// A party line in a brief's caption: "MARIA DELGADO, Plaintiff and Appellant,".
const PARTY =
  /^[^\S\n]*([A-Z][A-Z0-9 .,'’&-]*?),[^\S\n]+(?:Plaintiffs?|Defendants?|Petitioners?|Respondents?|Appellants?|Appellees?|Cross-[A-Za-z]+|Real[^\S\n]+Part(?:y|ies))\b/gm;
// Runs of capitalized words: names, or the words of a topic ("Title VII").
const CAPITALIZED = /[A-Z][\w'’&.-]*(?:[^\S\n]+(?:[A-Z][\w'’&.-]*|&))*/g;
// What comes before a party's name on a subject line: "claim of Marisol Alvarez against
// Brightwater Logistics, Inc.", "Smith v. Jones". Read on the few characters before it.
const BEFORE_PARTY = /\b(?:of|against|for|by|v\.?|vs\.?|and|with|from|client)\s+$/i;
// Lowercase words after a run that make it a topic ("Title VII retaliation claim"), not
// the connectors between parties ("Marisol Alvarez against Brightwater").
const TOPIC_AFTER = /^\s+(?!(?:of|against|for|by|v\.?|vs\.?|and|with|from|in|on|re)\b)[a-z]/;
// Entity endings, which are not part of the name the writer uses: "Inc.", "LLC,".
const ENTITY_WORD =
  /^(?:Inc|LLC|L\.L\.C|Corp|Co|Ltd|LLP|L\.P|LP|P\.C|PLLC|N\.A|plc|GmbH|S\.A)\.?,?$/i;
// A party's name has a few words; a longer run is a title or a topic.
const MAX_NAME_WORDS = 6;
const MAX_NAME_LENGTH = 80;
const MAX_NAMES = 8;

// A name without its entity endings, its words one space apart. Word by word, since a
// pattern anchored at the end would look through the whole text from every space.
function withoutEntity(name) {
  const words = name.split(/\s+/).filter(Boolean);
  while (words.length > 1 && ENTITY_WORD.test(words.at(-1))) words.pop();
  let last = words.pop() || '';
  while (last.endsWith(',') || last.endsWith('.')) last = last.slice(0, -1);
  return [...words, last]
    .join(' ')
    .replace(/,(?= |$)/g, '')
    .trim();
}

// Words of law and of topics, which name no party: "Title VII", "Accommodation Request".
const NOT_PARTY = new Set(
  `Title Act Code Section Rule Rules Amendment Amendments Constitution Statute Regulation
  Regulations Request Requests Accommodation Claim Claims Matter Definition Issue Issues
  Question Questions Memo Memorandum Re Subject Analysis Advice Update Opinion Letter Draft
  Termination Agreement Contract Lease Dispute Retaliation Discrimination Liability Privileged
  Confidential Attorney Client Communication The A An Our Your Federal State County City`.split(
    /\s+/,
  ),
);
const ROMAN = /^[IVXLC]+$/;
// The government is a party in its own name, not the client's.
const GOVERNMENT_PARTY = /^(?:the\s+)?(?:people|state|united\s+states|commonwealth)\b/i;

// The words of a name, as the document writes them: "MARIA DELGADO" is "Maria Delgado".
const titleCase = name =>
  name === name.toUpperCase()
    ? name
        .toLowerCase()
        .replace(/(^|[\s'’&-])(\p{L})/gu, (all, lead, letter) => lead + letter.toUpperCase())
    : name;

// A name as running text writes it: a capital first letter, then letters in any case,
// so the caption's "FRESHWAY MARKETS" finds "FreshWay", but "markets" is not a name.
const namePattern = (name, flags = 'u') =>
  new RegExp(
    String.raw`(?<![\p{L}\p{N}_])${escape(name[0])}${[...name.slice(1)]
      .map(char =>
        /\p{L}/u.test(char) ? `[${char.toLowerCase()}${char.toUpperCase()}]` : escape(char),
      )
      .join('')}(?![\p{L}\p{N}_])`,
    flags,
  );

// The client's names: the parties named on the RE or Subject line, in every one of its
// parts ("RE: Marisol Alvarez; Title VII retaliation claim against Brightwater
// Logistics, Inc."), and in a brief's caption ("MARIA DELGADO, Plaintiff and
// Appellant,"). A part of the line is a name when it is all of that part or comes after
// "of", "against", "v." and the like; topic words ("Title VII retaliation claim") are not.
// Each name is matched as a phrase ("Harbor Point Logistics"), and so is the shorter
// form the document calls it by elsewhere: its first words ("Harbor Point",
// "Brightwater") or its last ("Alvarez"). Phrases come first.
export function clientNames(blocks) {
  const runs = [];
  for (const block of blocks) {
    const line = block.text.match(CLIENT_LINE);
    if (!line) continue;
    for (const part of line[1].split(';')) {
      const plain = part.trim();
      for (const m of plain.matchAll(CAPITALIZED)) {
        const end = m.index + m[0].length;
        const whole =
          m.index === 0 &&
          /^[.,\s]*(?:(?:Inc|LLC|Corp|Co|Ltd|LLP|LP|plc)\.?)?$/i.test(plain.slice(end));
        const party =
          (m.index === 0 || BEFORE_PARTY.test(plain.slice(Math.max(0, m.index - 12), m.index))) &&
          !TOPIC_AFTER.test(plain.slice(end, end + 24));
        if (whole || party) runs.push(withoutEntity(m[0]));
      }
    }
    break;
  }
  // A brief's caption, before its first heading below the title.
  for (const block of blocks) {
    if (/^h[2-6]$/.test(block.kind)) break;
    for (const m of block.text.matchAll(PARTY)) {
      const name = withoutEntity(m[1]);
      if (!GOVERNMENT_PARTY.test(name)) runs.push(titleCase(name));
    }
  }
  const text = blocks.map(block => block.text).join('\n');
  const names = [];
  const forms = [];
  for (const run of runs) {
    const words = run.replace(/^(?:The|A|An) /, '').split(' ');
    // A run with a word of law or of a topic in it names no party.
    if (words.length > MAX_NAME_WORDS || names.length >= MAX_NAMES) continue;
    if (words.some(word => NOT_PARTY.has(word) || ROMAN.test(word))) continue;
    const phrase = words.join(' ');
    if (phrase.length < 3 || phrase.length > MAX_NAME_LENGTH || names.includes(phrase)) continue;
    names.push(phrase);
    if (words.length < 2) continue;
    let rest = text.replace(namePattern(phrase, 'gu'), ' ');
    const shorter = [
      ...words.slice(1).map((_, i) => words.slice(0, words.length - 1 - i).join(' ')),
      words.at(-1),
    ];
    for (const form of shorter) {
      if (form.length < 3 || forms.includes(form) || !namePattern(form).test(rest)) continue;
      // One word of a company's name that the document also writes as a plain word, or
      // that begins many names, is not the client alone: "Climbing" of "Summit Ascent
      // Climbing" in a brief about climbing.
      if (!form.includes(' ') && !distinctiveName(form, text)) continue;
      forms.push(form);
      rest = rest.replace(namePattern(form, 'gu'), ' ');
    }
  }
  return [...names, ...forms.filter(form => !names.includes(form))];
}

// Words that predict a claim or an element fails: "unlikely to show", "will fail", "cannot
// prove", "will lose", "is barred".
const FAILS =
  /\b(?:unlikely|not|cannot|fails?|failed|lose|loses|lost|barred|defeated|neither|nor)\b|n['’]t\b/i;

function checksOf({ sections, sentences, runs, blocks, read, citesOf, ownOf, type, legal }) {
  const checks = [];
  const span = n => {
    const { block, start, end } = sentences[n - 1];
    return { block, start, end };
  };
  const add = (id, severity, message, section, numbers) =>
    checks.push({
      id,
      severity,
      message,
      section: section ? section.index : null,
      where: section ? section.tag : '',
      sentences: numbers,
      spans: numbers.map(span),
    });
  // Only the analysis, its umbrellas and sub-issues, gets the IRAC checks: not a brief's
  // introduction or standard, not facts, and not a contract's clauses or a story.
  const analytic = section => section.part === 'sub-issue' || section.part === 'umbrella';
  const subIssues = sections.filter(section => section.part === 'sub-issue');
  const runsOf = section => runs.filter(run => run.parent === section.index);
  const sectionAt = n => sections[sentences[n - 1].section];
  const inAnalysis = sentence => analytic(sections[sentence.section]);
  const letter = (section, name) => section.rail?.find(item => item.letter === name)?.state;

  // facts-section: in a document laid out as a memo or brief, client facts that appear
  // only in the analysis, with no Statement of Facts. Reproduced text is not a fact.
  const shaped = legal || sections.some(section => section.part === 'conclusion');
  const facts = sentences.filter(
    sentence => sentence.kind === 'client-fact' && inAnalysis(sentence),
  );
  if (shaped && facts.length && !sections.some(section => section.part === 'facts')) {
    add(
      'facts-section',
      'fail',
      `No Statement of Facts: ${facts.length === 1 ? '1 client fact appears' : `${facts.length} client facts appear`} only in the analysis.`,
      null,
      facts.map(sentence => sentence.n),
    );
  }

  // umbrella: two or more sub-issues need an umbrella over them that predicts the
  // outcome, says the order of discussion and, in a memo, states a cited rule. An
  // umbrella that is only its heading, such as a brief's ARGUMENT over its point
  // headings, asks for none of these.
  sections.forEach((section, i) => {
    const top = item => item?.part === 'sub-issue' && item.parent === null;
    if (!top(section) || top(sections[i - 1])) return;
    let count = 0;
    while (top(sections[i + count])) count++;
    if (count >= 2) {
      add('umbrella', 'warn', 'There is no umbrella before the sub-issues.', section, [
        section.first,
      ]);
    }
  });
  for (const umbrella of sections) {
    if (umbrella.part !== 'umbrella' || !umbrella.rail) continue;
    const under = sections.filter(
      section => section.parent === umbrella.index && analytic(section),
    );
    if (under.length < 2) continue;
    const lacks = [
      letter(umbrella, 'P') === 'missing' && 'gives no overall prediction',
      letter(umbrella, 'M') === 'missing' && 'does not say the order of discussion',
      type === 'memo' && letter(umbrella, 'R') === 'missing' && 'states no cited rule',
    ].filter(Boolean);
    if (lacks.length) {
      const name = umbrella.tag === TAGS.umbrella ? 'The umbrella' : `The umbrella ${umbrella.tag}`;
      add('umbrella', 'warn', `${name} ${prose(lacks)}.`, umbrella, [umbrella.first]);
    }
  }

  for (const section of subIssues) {
    const own = runsOf(section);
    const { tag } = section;
    // opens-with-issue, after any greeting
    if (!['issue', 'conclusion', 'heading'].includes(openingRun(own).role)) {
      add('opens-with-issue', 'warn', `${tag} opens without stating its issue.`, section, [
        openingRun(own).first,
      ]);
    }
    // rule-before-application
    const rule = letter(section, 'R');
    if (rule === 'order') {
      const applying = own.find(run => does(run, APPLYING));
      const first = own.find(run => does(run, ['rule']));
      add(
        'rule-before-application',
        'warn',
        `${tag} applies the law before stating a rule.`,
        section,
        [applying.first, first.first],
      );
    } else if (rule === 'missing') {
      add('rule-before-application', 'warn', `${tag} states no rule.`, section, [section.first]);
    }
    // closes-with-conclusion
    if (letter(section, 'C') === 'missing') {
      add('closes-with-conclusion', 'warn', `${tag} ends without a conclusion.`, section, [
        closingRun(own).last,
      ]);
    }
    // alternating: explanation and application taking turns.
    const turns = [];
    for (const run of own) {
      const role = run.role === 'counter' ? 'application' : run.role;
      if (role !== 'explanation' && role !== 'application') continue;
      if (turns.at(-1)?.role !== role) turns.push({ role, first: run.first });
    }
    if (turns.length - 1 >= 3) {
      add(
        'alternating',
        'info',
        `${tag} moves between explanation and application ${turns.length - 1} times; consider explaining the cases before applying them.`,
        section,
        turns.map(turn => turn.first),
      );
    }
  }

  // new-law-in-application: an authority first cited while applying the law. A
  // counter-argument may bring in the other side's case, so it does not count, and a
  // citation in a form the parser does not know may well be the record.
  const explained = new Set();
  const reported = new Set();
  for (const sentence of sentences) {
    const keys = ownOf(sentence.n)
      .map(cite => cite.authority)
      .filter(authority => authority && !authority.unparsed);
    if (sentence.role === 'application' && inAnalysis(sentence)) {
      for (const authority of keys) {
        if (explained.has(authority.key) || reported.has(authority.key)) continue;
        reported.add(authority.key);
        add(
          'new-law-in-application',
          'warn',
          `${sectionAt(sentence.n).tag} brings in ${authority.name || authority.key} for the first time while applying it.`,
          sectionAt(sentence.n),
          [sentence.n],
        );
      }
    }
    if (sentence.role === 'rule' || sentence.role === 'explanation') {
      for (const authority of keys) explained.add(authority.key);
    }
  }

  // law-mentions-client: a rule or explanation in the analysis that names the client.
  // Reproduced contract text names the parties as a matter of course.
  const clients = clientNames(blocks).map(name => ({ name, pattern: namePattern(name) }));
  for (const sentence of sentences) {
    if (sentence.role !== 'rule' && sentence.role !== 'explanation') continue;
    if (sentence.kind === 'document-text' || !inAnalysis(sentence)) continue;
    const client = clients.find(({ pattern }) => pattern.test(sentence.text));
    if (!client) continue;
    const role = sentence.role === 'rule' ? 'a rule' : 'an explanation';
    add(
      'law-mentions-client',
      'warn',
      `${sectionAt(sentence.n).tag}: ${role} mentions ${client.name}; keep client facts in the application.`,
      sectionAt(sentence.n),
      [sentence.n],
    );
  }

  // The authorities a sentence and the rest of its paragraph cite, up to two: all the
  // generalization check needs, gathered once from the end of each paragraph.
  const ahead = new Array(sentences.length);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const same = sentences[i + 1]?.block === sentences[i].block;
    const list = same ? [...ahead[i + 1]] : [];
    for (const cite of ownOf(i + 1)) {
      if (cite.authority && list.length < 2 && !list.includes(cite.authority)) {
        list.push(cite.authority);
      }
    }
    ahead[i] = list;
  }

  // generalization: courts in general, as the sentence's subject, resting on one case or
  // none. "Federal law requires courts to …" speaks for the law, and one statute may
  // well say what every court must do.
  for (const sentence of sentences) {
    if (sentence.kind !== 'law' && sentence.kind !== 'precedent') continue;
    if (['caption', 'other'].includes(sectionAt(sentence.n).part)) continue;
    const subject = sentence.text.match(/^((?:[\w’'-]+\s+){0,2})courts\b/i);
    if (
      !subject ||
      /\b(?:requires?|allows?|permits?|directs?|tells?|lets?)\s+$/i.test(subject[1])
    ) {
      continue;
    }
    const cited = ahead[sentence.n - 1];
    if (cited.length > 1) continue;
    const [authority] = cited;
    // What a citation in a form the parser does not know is, a statute or a case, is unknown.
    if (authority?.group === 'statutes' || authority?.unparsed) continue;
    const basis = authority ? `one authority (${authority.name || authority.key})` : 'no authority';
    add(
      'generalization',
      'warn',
      `“${opening(sentence.text, 32)}” speaks for courts in general but rests on ${basis}.`,
      sectionAt(sentence.n),
      [sentence.n],
    );
  }

  // confidence: the conclusion sounds surer than its least sure part. A brief argues,
  // so it has no confidence to compare.
  const conclusion = sections.find(section => section.part === 'conclusion');
  if (conclusion && type === 'memo') {
    const surest = confidenceOf(conclusion, sentences, true);
    const rated = subIssues
      .map(section => ({ section, ...confidenceOf(section, sentences, false) }))
      .filter(({ rank }) => rank);
    const weakest = rated.reduce((low, item) => (!low || item.rank < low.rank ? item : low), null);
    // A conclusion that the claim fails needs only one part to fail, so it may be as sure as
    // the surest part that says so: "Borden will very likely lose" when B says Borden "will
    // very likely fail", though A says only that Borden is "unlikely" to show goodwill.
    const failing =
      surest &&
      FAILS.test(surest.sentence.text) &&
      rated.some(item => item.rank >= surest.rank && FAILS.test(item.sentence.text));
    const unsure =
      surest &&
      surest.rank > 1 &&
      sentences
        .slice(conclusion.first - 1, conclusion.last)
        .filter(sentence => sentence.role === 'conclusion')
        .map(sentence => ({ sentence, ...confidenceRank(sentence.text) }))
        .find(({ rank }) => rank === 1);
    const above = surest && weakest && surest.rank > weakest.rank && !failing;
    if (above || unsure) {
      const parts = [];
      const numbers = [];
      if (above) {
        parts.push(
          `The conclusion says “${surest.phrase}”, but ${weakest.section.tag} says only “${weakest.phrase}”.`,
        );
        numbers.push(surest.sentence.n, weakest.sentence.n);
      }
      if (unsure) {
        parts.push(`The conclusion ${above ? 'also ' : ''}calls a part “${unsure.phrase}”.`);
        numbers.push(unsure.sentence.n);
      }
      parts.push('If every part must be met, the whole is no surer than its weakest part.');
      add('confidence', 'warn', parts.join(' '), conclusion, numbers);
    }
  }

  // headings-predict: a point heading over a sub-issue, or over sub-issues of its own.
  for (const section of sections) {
    if (!analytic(section) || section.heading === null) continue;
    if (section.parent === null && !/^h[3-6]$/.test(blocks[section.heading].kind)) continue;
    const heading = sentences.filter(sentence => sentence.block === section.heading);
    if (!heading.length || heading.some(sentence => sentence.kind === 'conclusion')) continue;
    add(
      'headings-predict',
      'warn',
      `${section.tag}’s heading names a topic instead of predicting the answer.`,
      section,
      [heading[0].n],
    );
  }

  // quotation-share: how much of a sub-issue is other people's words.
  for (const section of subIssues) {
    let quoted = 0;
    let total = 0;
    for (const at of section.blocks) {
      const text = blocks[at].text;
      const cites = citesOf[at].filter(cite => !cite.nested);
      const citeWords = (start, end) =>
        cites
          .filter(cite => cite.start >= start && cite.end <= end)
          .reduce((sum, cite) => sum + words(cite.text), 0);
      const own = words(text) - citeWords(0, text.length);
      total += own;
      if (blocks[at].kind === 'blockquote') {
        quoted += own;
        continue;
      }
      const spans = read[at].quotes;
      for (const [start, end] of spans) {
        const outer = !spans.some(
          ([from, to]) => from <= start && end <= to && (from !== start || to !== end),
        );
        if (outer) quoted += words(text.slice(start, end)) - citeWords(start, end);
      }
    }
    const share = total ? Math.round((100 * quoted) / total) : 0;
    if (share >= 40) {
      const numbers = sentences
        .slice(section.first - 1, section.last)
        .filter(sentence => sentence.flags.some(flag => flag.id === 'quote'))
        .map(sentence => sentence.n);
      add('quotation-share', 'warn', `${section.tag} is ${share}% quotation.`, section, numbers);
    }
  }

  const order = id => STRUCTURE_CHECKS.indexOf(id);
  return checks.sort(
    (a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || order(a.id) - order(b.id),
  );
}

// ---------------------------------------------------------------------------
// Table of authorities
// ---------------------------------------------------------------------------

const GROUPS = ['cases', 'statutes', 'other'];
// The whole reporter: "U.S. App. D.C." starts like U.S. but is not the Supreme Court's.
const SUPREME = /^(?:U\.S\.|S\.Ct\.|L\.Ed\.(?:2d)?)$/;
// The states and territories as courts and official reporters name them, without spaces.
const STATES = new Set(
  `Ala. Alaska Ariz. Ark. Cal. Colo. Conn. Del. D.C. Fla. Ga. Haw. Idaho Ill. Ind. Iowa Kan.
  Ky. La. Me. Md. Mass. Mich. Minn. Miss. Mo. Mont. Neb. Nev. N.H. N.J. N.M. N.Y. N.C. N.D.
  Ohio Okla. Or. Pa. R.I. S.C. S.D. Tenn. Tex. Utah Vt. Va. Wash. W.Va. Wis. Wyo. Guam P.R.
  V.I.`.split(/\s+/),
);
// A state's highest court's own reporter: "Cal.4th", "N.Y.2d", "Ill.2d", "Ohio St.3d".
const STATE_REPORTER = /^(.+?)(?:2d|3d|4th|5th)?$/;
// An intermediate court of appeals: "Cal. App. 5th", "A.D.3d", "Ill. App. 3d", "(Ct. App.
// 2002)", "(N.Y. App. Div. 2005)", "Pa. Super.".
const STATE_APPEAL = /App\.|^A\.D\.|Super\./;
// England and Canada: the highest courts, and the courts of appeal.
const TOP_COURT = /^(?:UKSC|UKHL|HL|SCC|S\.C\.R\.|SCR)$/;
const APPEAL_COURT =
  /^(?:EWCA(?:Civ|Crim)?|CA|Civ|ONCA|BCCA|ABCA|QCCA|NSCA|NBCA|MBCA|SKCA|NLCA|PECA|FCA|CMAC)$/;

function levelOf(authority) {
  if (authority.group === 'statutes') return 'statute';
  const full = authority.full || {};
  const court = squeeze(full.court || '');
  const reporters = [
    full.reporter || authority.reporter || '',
    ...(full.parallel || []).map(p => p.reporter),
  ].map(squeeze);
  if (/Cir\.$/.test(court)) return 'circuit';
  // A federal district court ("S.D.N.Y.", "D. Mass.", "D.D.C."), not a state's court whose
  // name starts the same way ("N.D. Ct. App." for "2018 ND App 12", "D.C." for the
  // District of Columbia's highest court).
  if (/^(?:[NSEWMC]\.D\.|D\.)\S/.test(court) && court !== 'D.C.' && !STATE_APPEAL.test(court)) {
    return 'district';
  }
  if (reporters.some(reporter => SUPREME.test(reporter))) return 'supreme';
  // The courts of appeals' own reporters: "F. App'x", and "U.S. App. D.C." for the D.C. Circuit.
  if (/^(?:F\.App|U\.S\.App\.D\.C\.)/.test(reporters[0])) return 'circuit';
  if (TOP_COURT.test(court) || reporters.some(reporter => TOP_COURT.test(reporter)))
    return 'supreme';
  // "EWCA(Civ)" is the Court of Appeal's Civil Division.
  if (APPEAL_COURT.test(court.split('(')[0])) return 'appellate';
  if (court && STATES.has(court)) return 'state-supreme';
  // Texas's and Oklahoma's courts of last resort for crimes ("Tex. Crim. App.", "2018 OK CR
  // 12") are named as courts of appeals are.
  if (/^(?:Tex|Okla)\.Crim\.App\./.test(court)) return 'state-supreme';
  if (STATE_APPEAL.test(court) || STATE_APPEAL.test(reporters[0])) return 'state-appellate';
  const official = reporters[0].match(STATE_REPORTER)?.[1];
  if (STATES.has(official) || /^OhioSt\.$/.test(official)) return 'state-supreme';
  return 'unknown';
}

// A statute's title from its first mention in Bluebook form, with every
// subsection the document cites: "42 U.S.C. § 3602(b), (c)". The first mention
// that names the code, since a bare "§ 3602" may come before it; a section known only
// from "Id. § 12926(m)" takes its code from the citation before it. A session law or an
// executive order is titled by its number and where it starts in the Statutes at Large or
// the Federal Register, with its date ("Pub. L. No. 110-325, 122 Stat. 3553 (2008)",
// "Exec. Order No. 14,028, 86 Fed. Reg. 26,633 (May 12, 2021)"), and the Statutes at
// Large and the Federal Register by their first page and date ("76 Fed. Reg. 16,978 (Mar.
// 25, 2011)"), none of them with the section or page cited.
const SUBSECTION_GROUP = /\((?!\d{4}\))[0-9a-zA-Z]{1,4}\)(?:\s?\((?!\d{4}\))[0-9a-zA-Z]{1,4}\))*/g;
const DATE_AFTER = /\(([^()]*\d{4})\)$/;
function pagedTitle(cites) {
  const texts = cites.filter(cite => cite.type === 'statute').map(cite => cite.text.trim());
  const law = texts[0].match(LAW_NUMBER)?.[0];
  const start = texts.map(text => text.match(FIRST_PAGE)?.[0]).find(Boolean);
  const date = texts.map(text => text.match(DATE_AFTER)?.[1]).find(Boolean);
  const title = [law, start].filter(Boolean).join(', ') || texts[0].replace(YEAR_AFTER, '');
  return date ? `${title} (${date})` : title;
}
function statuteTitle(authority) {
  const cites = authority.cites;
  const named = cites.find(cite => cite.type === 'statute');
  // A provision known only from an id. ("Id. art. II") is its code alone.
  const section = cites[0].text.indexOf('§');
  const text = named
    ? named.text
    : `${authority.code || ''}${section < 0 && cites[0].type === 'id' ? '' : cites[0].text.slice(Math.max(0, section))}`;
  if (named && /^(?:Pub\.L\.|Exec\.Order|\d+(?:Stat\.|Fed\.Reg\.))/.test(authority.key)) {
    return pagedTitle(cites);
  }
  const base = text
    .replace(YEAR_AFTER, '')
    .replace(SUBDIVISIONS, '')
    .replace(SUBSECTION_GROUP, '')
    .replace(/(?<![\s,])[\s,]+$/, '')
    .replace(/U\.\s?S\.\s?Code\b/, 'U.S.C.')
    .trim();
  const subsections = cites.flatMap(
    cite =>
      cite.text
        .replace(YEAR_AFTER, '')
        .match(SUBSECTION_GROUP)
        ?.map(group => group.replace(/\s/g, '')) || [],
  );
  return base + [...new Set(subsections)].join(', ');
}

// A case's citation as the document gives it: Bluebook ("Bell Atl. Corp. v. Twombly,
// 550 U.S. 544, 127 S. Ct. 1955 (2007)"), California ("Aguilar v. Atlantic Richfield Co.
// (2001) 25 Cal.4th 826 [107 Cal.Rptr.2d 841]"), English ("Donoghue v Stevenson [1932] AC
// 562 (HL)") or Canadian ("R. v. Jordan, 2016 SCC 27").
// A case's subsequent history, as written: what goes inside its court parenthetical
// (Texas's "2003, pet. denied") and what comes after it (", aff’d, 535 U.S. 1 (2002)").
function historyOf(full) {
  const history = full.history || [];
  const year = full.date || full.year;
  const within = history.filter(item => year && full.text.includes(`${year}, ${item})`));
  return {
    inside: within.map(item => `, ${item}`).join(''),
    after: history
      .filter(item => !within.includes(item))
      .map(item => `, ${item}`)
      .join(''),
  };
}

function caseTitle(full) {
  const name = full.name || '';
  const neutral = isNeutral(full);
  // A public-domain citation as the document writes it: "2021-Ohio-1234".
  const core = neutral ? coreOf(full) : `${full.volume} ${full.reporter} ${full.page}`;
  const between = full.core
    ? full.text.slice(name.length, full.core[0] - full.start).replace(/\s+/g, ' ')
    : ', ';
  const parallels = (full.parallel || []).map(p => `${p.volume} ${p.reporter} ${p.page}`);
  const history = historyOf(full);
  if (/\(\s*(?:[^()]*\s)?\d{4}\)\s*$/.test(between)) {
    const title = `${name}${between}${core}${parallels.length ? ` [${parallels.join(', ')}]` : ''}`;
    return {
      title: title.trim() + history.inside + history.after,
      italic: name ? [0, name.length] : null,
    };
  }
  const separator = name ? (between.includes(',') ? ', ' : ' ') : '';
  // The court and date, unless the citation names its court already ("[2015] UKSC 31",
  // "2020 IL 124112") or gives its year in brackets ("[1932] AC 562 (HL)"). Ohio's
  // courts of appeals add their district, "2021-Ohio-1234 (8th Dist.)", and the High
  // Court its division, "[2019] EWHC 123 (Ch)".
  const paren = neutral
    ? full.court?.match(/\(([^()]+)\)$/)?.[1] || ''
    : /^\[/.test(full.volume)
      ? full.court || ''
      : [full.court, full.date || full.year].filter(Boolean).join(' ') + history.inside;
  const title = `${name}${separator}${[core, ...parallels].join(', ')}${paren ? ` (${paren})` : ''}`;
  return { title: title + history.after, italic: name ? [0, name.length] : null };
}

// An article's, book's or report's citation, without the pin: "Jane Roe, Rethinking
// Essential Functions, 100 Harv. L. Rev. 1 (1987)", its title in italics.
function sourceTitle(authority) {
  const cite = authority.full || authority.cites[0];
  if (cite.type === 'legislative') {
    // Its date as written: "(2008)", California's "(2019–2020 Reg. Sess.)". Each
    // parenthetical is read once, then tested for a year.
    const date =
      [...cite.text.matchAll(/\(([^()]*)\)/g)].map(m => m[1]).find(inner => /\d{4}/.test(inner)) ||
      (cite.year ? String(cite.year) : '');
    return { title: `${authority.name}${date ? ` (${date})` : ''}`, italic: null };
  }
  if (cite.type !== 'periodical' && cite.type !== 'secondary') {
    return { title: authority.name || cite.text, italic: null };
  }
  if (!cite.title) return { title: cite.text, italic: null };
  const lead = cite.author ? `${cite.author}, ` : '';
  // A book's edition, at the end or before California's topic and section: "6 Witkin,
  // Summary of Cal. Law (11th ed. 2017) Torts, § 1234".
  const edition =
    cite.text.match(YEAR_AFTER)?.[0] ?? cite.text.match(/\s*\([^()]*\d{4}\)/)?.[0] ?? '';
  const where =
    cite.type === 'periodical'
      ? `, ${cite.volume} ${cite.reporter} ${cite.page}${cite.year ? ` (${cite.year})` : ''}`
      : edition;
  return {
    title: `${lead}${cite.title}${where}`,
    italic: [lead.length, lead.length + cite.title.length],
  };
}

function titleOf(authority) {
  const full = authority.full;
  if (authority.group === 'statutes') return { title: statuteTitle(authority), italic: null };
  if (authority.group === 'other') return sourceTitle(authority);
  if (authority.nameless) {
    const where = authority.database || `${authority.volume} ${authority.reporter}`;
    return { title: `${authority.name}, ${where}`, italic: [0, authority.name.length] };
  }
  if (full.type === 'docket') {
    const name = full.name || '';
    const history = historyOf(full);
    const court = [full.court, full.date || full.year].filter(Boolean).join(' ') + history.inside;
    const rest = [full.docket, withoutPin(full.database)].filter(Boolean).join(', ');
    return {
      title: `${name}${name && rest ? ', ' : ''}${rest}${court ? ` (${court})` : ''}${history.after}`,
      italic: name ? [0, name.length] : null,
    };
  }
  return caseTitle(full);
}

function warningsOf(authority) {
  const warnings = [];
  const cites = authority.cites;
  if (authority.unparsed) warnings.push('Form not recognized: check it by hand');
  if (authority.nameless) warnings.push('No full citation in this document');
  const fulls = cites.filter(cite => cite.type === 'full');
  if (fulls.length && fulls.every(cite => cite.nested)) {
    warnings.push('Cited in full only inside “(quoting …)”');
  }
  if (authority.group === 'cases') {
    const dockets = cites.filter(cite => cite.type === 'docket');
    if (dockets.length && dockets.every(deficient)) {
      warnings.push('Unreported: add a database cite (WL or LEXIS), the full date, and a pin cite');
    } else if (!cites.some(hasPin)) warnings.push('No pin cite');
  }
  if (authority.group === 'statutes') {
    const texts = cites.filter(cite => cite.type !== 'id').map(cite => cite.text);
    for (const text of new Set(texts)) {
      if (STATUTE_FORM.test(text)) warnings.push(`Not in Bluebook form: ${text}`);
    }
  }
  return warnings;
}

function tableOf(authorities, tagOf) {
  const rows = [...authorities.values()].map(authority => {
    const mentions = [
      ...authority.cites.map(cite => ({
        block: cite.block,
        start: cite.start,
        end: cite.end,
        type: cite.type,
        state: stateOf(cite),
        section: tagOf(cite.block),
      })),
      ...authority.refs.map(ref => ({
        block: ref.block,
        start: ref.start,
        end: ref.end,
        type: 'reference',
        state: ref.quoted ? 'quoted' : 'named',
        section: tagOf(ref.block),
      })),
    ].sort((a, b) => a.block - b.block || a.start - b.start);
    return {
      key: authority.key,
      group: authority.group,
      name: authority.name,
      ...titleOf(authority),
      court: authority.full?.court || null,
      level: levelOf(authority),
      mentions,
      where: [...new Set(mentions.map(mention => mention.section).filter(Boolean))].join(' · '),
      warnings: warningsOf(authority),
      count: mentions.length,
    };
  });
  const compare = (a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  return rows.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group) || compare(a, b));
}

// Citations nothing resolves, each with why: a short form, supra or id. that names no
// case cited in full in this document, or an id. after a citation of more than one
// source. The record, the document's own sections, the caption and citations in a form
// the parser does not know are not cited authority it can resolve, so they are never
// listed.
function unresolvedOf(all, tagOf, caption) {
  const items = [];
  for (const cite of all) {
    if (!['id', 'supra', 'short'].includes(cite.type) || caption.has(cite.block)) continue;
    if (cite.record || (cite.authority && !cite.authority.nameless)) continue;
    const where = `${cite.text.replace(SIGNAL_START, '')} in ${tagOf(cite.block)}`;
    let why;
    if (cite.type === 'id') {
      if (cite.ambiguous) {
        why = `${where}: the citation before it cites more than one source, so it could mean any of them.`;
      } else if (cite.quoted) {
        why = `${where}, inside a quotation: it refers to the quoted court’s own earlier citation.`;
      } else if (cite.authority) {
        why = `${where}: it repeats ${cite.authority.name}, which has no full citation in this document.`;
      } else if (cite.lost) {
        why = `${where}: the citation before it, ${cite.lost.text.replace(SIGNAL_START, '')}, names no case cited in this document.`;
      } else why = `${where}: there is no earlier citation for it to refer to.`;
    } else if (cite.type === 'supra') {
      why = `${where}: no full citation in this document has that name.`;
    } else if (cite.database) {
      why = `${where}: no full citation in this document has this database number.`;
    } else {
      why = `${where}: no full citation in this document has this volume and reporter.`;
    }
    items.push({ text: why, span: { block: cite.block, start: cite.start, end: cite.end } });
  }
  return items;
}

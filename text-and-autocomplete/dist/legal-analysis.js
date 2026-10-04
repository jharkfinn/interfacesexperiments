import {
  findCitations,
  quoteSpans,
  referenceNames,
  findReferences,
  citationKey,
} from './legal-text.js';
import { ROLES, KINDS, ALLOWED, STRUCTURE_CHECKS } from './legal-core.js';

// What the app works out for itself about a legal document, from its text and
// Claude's labels: the sections its headings make, runs of sentences that do one
// job, the citations and what each sentence rests on, the structure checks, and
// a table of authorities. Claude only names each sentence's role and kind from
// fixed lists; every name, citation and quotation here is read from the
// document, so nothing Claude writes reaches the screen. No DOM, so the IRAC and
// Sourcing views and the tests share one reading.
//
// analyzeLegal(blocks, labels) takes the model's blocks, [{index, kind, text,
// sentences: [{start, end, text}]}], and Claude's labels, one per sentence
// through the document ({role, kind, also?, guess?} or [role, kind, also?]), or
// null. It returns:
// {
//   labeled,            // whether there were labels to read
//   sentences: [{       // one per sentence; n counts from 1 through the document
//     n, block, index, start, end, text,  // block number, place in it, offsets in its text
//     section,          // index into sections
//     role, kind, also, guess, conflict,  // labels after the app's overrides; null without labels
//     support,          // direct, inferential, indirect, background, contrary, secondhand,
//                       // incomplete, below, missing, unsourced, record, n/a or unknown
//     flags: [{id, text, attention, title?, items?}],  // items [{id, text}] on the one 'form' flag
//     cites: [{label, state, start, end, key, text}],  // state: own, quoted, nested or unresolved;
//                       // label has no state suffix; key is the authority's, or null
//     lead,             // the text before its first own citation
//     attention,        // weak support or a flag that counts toward "needs attention"
//   }],
//   sections: [{index, part, tag, label, heading, blocks, first, last, rank, phrase, rail}],
//                       // part: caption, question, answer, facts, umbrella, sub-issue or conclusion;
//                       // heading: the heading's block number or null; first, last: sentence numbers;
//                       // rank 1-3 and phrase: how sure it sounds, or null;
//                       // rail: null, or [{letter, roles, state, title}], state ok, missing or order
//   runs: [{first, last, label, method, parent, role, kind, also, guess, conflict}],
//                       // runs of sentences that share a role, as DocumentModel.runs takes them;
//                       // parent is the section's index
//   checks: [{id, severity, message, section, where, sentences, spans}],
//                       // severity fail, warn or info, sorted that way and then by STRUCTURE_CHECKS;
//                       // where: the section's tag or ''; spans: [{block, start, end}] it points at
//   authorities: [{key, group, name, title, italic, court, level, mentions, where, warnings, count}],
//                       // group cases, statutes or other; italic: [start, end] of the name in title;
//                       // level: supreme, circuit, district, statute or unknown;
//                       // mentions: [{block, start, end, type, state, section}], section a tag
//   unresolved: [{text, span}],  // citations nothing resolves, with {block, start, end}
//   attentionCount,
// }

export { ROLE_NAMES, KIND_NAMES, STRUCTURE_CHECKS } from './legal-core.js';

const words = text => (text.match(/\S+/gu) || []).length;
const squeeze = text => text.replace(/\s+/g, '').replace(/’/g, "'");
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HEADING = /^h[1-6]$/;

// The opening of a text, cut at a word near `limit` characters, as the views cut it.
export function opening(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${(space > limit / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')}…`;
}

// A list in prose: "a", "a and b", "a, b, and c".
const prose = items =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const PARTS = [
  [/^questions?\s+presented$/i, 'question'],
  [/^(?:brief|short)?\s*answers?$/i, 'answer'],
  [/^(?:statement\s+of\s+(?:the\s+)?facts|facts|background|factual\s+background)$/i, 'facts'],
  [/^conclusions?$/i, 'conclusion'],
];
const TAGS = {
  caption: 'Caption',
  question: 'Question',
  answer: 'Answer',
  facts: 'Facts',
  umbrella: 'Umbrella',
  conclusion: 'Conclusion',
};
const NUMERAL = /^\s*((?:[IVXLC]+|[A-Z]|\d{1,2}))[.)]\s/;
// "IV. Conclusion" is the conclusion, as "Conclusion" is.
const partOf = heading => {
  const text = heading.replace(NUMERAL, '').trim().replace(/[:.]$/, '').trim();
  return PARTS.find(([pattern]) => pattern.test(text))?.[1] || 'discussion';
};

// The memo's sections, taken from its headings: [{index, part, tag, label,
// heading, blocks, first, last}]. Blocks before the first h2-h6 are the caption;
// an h2 (or a later h1) starts a part, named by its heading; an h3-h6 in the
// discussion starts a sub-issue, and the discussion before sub-issues is their
// umbrella. A document with no such headings is one sub-issue, "Analysis".
export function sectionsOf(blocks) {
  const live = [];
  let count = 0;
  blocks.forEach(({ kind, text, sentences }, block) => {
    if (sentences.length) {
      live.push({ block, kind, text, first: count + 1, last: count + sentences.length });
    }
    count += sentences.length;
  });
  const sections = [];
  const open = (part, heading = null) => {
    const section = { part, heading, blocks: [], first: 0, last: 0 };
    sections.push(section);
    return section;
  };
  const start = live.findIndex(block => /^h[2-6]$/.test(block.kind));
  let current = null;
  let top = null;
  live.forEach((block, i) => {
    if (start < 0) {
      if (i === 0 && block.kind === 'h1') current = open('caption');
      else if (!current || current.part === 'caption') current = open('sub-issue');
    } else if (i < start) {
      current ||= open('caption');
    } else if (block.kind === 'h2' || block.kind === 'h1') {
      current = top = open(partOf(block.text), block);
    } else if (/^h[3-6]$/.test(block.kind) && (!top || top.part === 'discussion')) {
      // Under any other part, a subheading stays in that part.
      current = open('sub-issue', block);
    }
    current.blocks.push(block);
  });
  let part = 0;
  return sections.map((section, index) => {
    if (section.part === 'discussion') {
      section.part = sections[index + 1]?.part === 'sub-issue' ? 'umbrella' : 'sub-issue';
    }
    const heading = section.heading;
    const numeral = heading?.text.match(NUMERAL);
    const title = heading ? heading.text.slice(numeral ? numeral[0].length : 0).trim() : '';
    let tag = TAGS[section.part];
    if (section.part === 'sub-issue') {
      part++;
      tag = numeral ? numeral[1] : start < 0 ? 'Analysis' : `Part ${part}`;
    }
    return {
      index,
      part: section.part,
      tag,
      label: section.part === 'caption' ? 'Title and routing lines' : opening(title, 70),
      heading: heading ? heading.block : null,
      blocks: section.blocks.map(block => block.block),
      first: section.blocks[0].first,
      last: section.blocks.at(-1).last,
    };
  });
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
    let previous = null;
    for (const part of parts) {
      part.whole = parts.filter(other => other.block === part.block).length === 1;
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

// The letters over a section: I R A C for a sub-issue, P R M (prediction, cited
// rule, roadmap) for the umbrella, none for other parts. `runs` are all the
// document's runs; `sentences` are the analysis's.
export function railOf(section, runs, sentences) {
  const own = runs.filter(run => run.parent === section.index);
  const roles = own.map(run => run.role);
  if (section.part === 'sub-issue') {
    const firstApplying = roles.findIndex(role => APPLYING.includes(role));
    const lastApplying = roles.findLastIndex(role => APPLYING.includes(role));
    const firstRule = roles.indexOf('rule');
    const issue = roles.includes('issue') || roles.includes('heading') || roles[0] === 'conclusion';
    const rule =
      firstRule < 0 ? 'missing' : firstApplying >= 0 && firstRule > firstApplying ? 'order' : 'ok';
    const closes = roles.some((role, i) => role === 'conclusion' && i > lastApplying);
    return [
      step('I', ['issue', 'heading'], issue ? 'ok' : 'missing', {
        ok: 'Issue',
        missing: 'No issue stated',
      }),
      step('R', ['rule'], rule, {
        ok: 'Rule',
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
    const predicting = mine.filter(predicts);
    const cited = mine.some(
      sentence =>
        (sentence.role === 'rule' || sentence.also === 'rule') &&
        (sentence.support === 'direct' || sentence.support === 'inferential'),
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

const CONCESSION = /^(?:while|although|though|even if)\b[^,]*,\s*/i;
const RANKS = [
  [
    1,
    /\b(?:(?:more |quite |very )?(?:uncertain|unclear)|close question|cannot say for certain|may not|might not|unlikely)\b/i,
  ],
  [3, /\b(?:highly likely|very likely|almost certainly|high confidence|easily met|clearly)\b/i],
  [2, /\b(?:(?:most |more )?likely|probably|should)\b/i],
];

// How sure a prediction sounds: {rank, phrase}, from 1 (unsure) to 3 (sure), or
// null. A concession that opens the sentence ("While we cannot say for certain
// …, it is highly likely") is not the prediction, so it is skipped.
export function confidenceRank(text) {
  const prediction = text.replace(CONCESSION, '');
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
const SIGNAL_BEFORE =
  /(?<![A-Za-z])(See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Compare|Accord|Contra|E\.g\.,)\s*$/;

// A block's citations, each with `quoted` (inside the writer's quotation, so it is
// the quoted court's) and its `signal`, and its quotation spans. Callers copy
// the citations before adding anything to them.
function readBlock(text) {
  const cached = blockCache.get(text);
  if (cached) return cached;
  const quotes = quoteSpans(text);
  const cites = findCitations(text).map(cite => ({
    ...cite,
    quoted: quotes.some(([start, end]) => start < cite.start && cite.end <= end),
    signal:
      cite.signal ||
      text.slice(Math.max(0, cite.start - 24), cite.start).match(SIGNAL_BEFORE)?.[1] ||
      null,
  }));
  const read = { quotes, cites };
  if (blockCache.size >= BLOCK_CACHE) blockCache.delete(blockCache.keys().next().value);
  blockCache.set(text, read);
  return read;
}

const GOVERNMENT = /^(?:United States|State|People|Commonwealth)\b/;
const FULL_DATE =
  /\b(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s+\d{4}\)/;
// "U.S. Code", or a space before a subsection: "§ 3602 (b)". A space before the
// code's edition is Bluebook form: "§ 1332 (2018)", "§ 1332 (West 2020)".
const STATUTE_FORM = /\bU\.S\. Code\b|§\s*\d[\w.]*\s+\((?![^()]*\d{4}\))/;
const SUBSECTIONS = /(?:\s?\((?!\d{4}\))[0-9a-zA-Z]{1,4}\))+/;
// The code's edition after a statute: "(2018)".
const YEAR_AFTER = /\s*\([^()]*\d{4}\)$/;
const SIGNAL_START =
  /^(?:See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Compare|Accord|Contra|E\.g\.,)\s+/;
const STRENGTHS = ['direct', 'inferential', 'indirect', 'background'];

// How strongly a signal says the source supports the sentence.
function strengthOf(signal) {
  if (!signal || /^(?:E\.g\.,?|Accord)$/.test(signal)) return 'direct';
  if (/^See(?:,? e\.g\.,?)?$/.test(signal)) return 'inferential';
  if (/^(?:See also|Cf\.|Compare)$/.test(signal)) return 'indirect';
  if (signal === 'See generally') return 'background';
  if (/^(?:But see|But cf\.|Contra)$/.test(signal)) return 'contrary';
  return 'direct';
}

// The short name a case goes by: the plaintiff's first word ("Lakeside"), or
// the defendant when the government sues ("Columbus Country Club").
// A docket citation has a name but no parties of its own, so they are read from it.
function shortName(cite) {
  const [plaintiff, defendant] =
    cite.plaintiff || cite.defendant
      ? [cite.plaintiff, cite.defendant]
      : (cite.name || '').split(/\s+v\.\s+/);
  if (plaintiff && !GOVERNMENT.test(plaintiff) && !/^In re\b/.test(plaintiff)) {
    const first = plaintiff.split(/[\s,]+/)[0];
    return first.length > 2 ? first : plaintiff.replace(/,.*$/, '');
  }
  if (defendant) return defendant.replace(/,.*$/, '');
  if (cite.name || cite.antecedent) return (cite.name || cite.antecedent).replace(/,\s*$/, '');
  return cite.volume ? `${cite.volume} ${cite.reporter}` : cite.docket || cite.text;
}

// A statute from its section on ("§ 3602(b)"), since the code's name repeats
// through a document. A constitution's "§ 1" means nothing without its article or
// amendment, so it keeps them.
const fromSection = text =>
  /\bConst\./.test(text) ? text : text.slice(Math.max(0, text.indexOf('§')));

// A statute's name in chips and messages: its section, without subsections ("§ 3602").
const sectionName = cite => fromSection(cite.text).replace(YEAR_AFTER, '').replace(SUBSECTIONS, '');

const pinOf = cite => (cite.pin || '').replace(/^at\s+/, '');
const hasPin = cite => {
  if (cite.type === 'statute' || cite.type === 'section') return true;
  if (cite.type === 'docket' || cite.type === 'docket-number') {
    return /\bat\s+\*?\d/.test(cite.database || '');
  }
  if (cite.type === 'supra') return /\bat\s+\*?\d/.test(cite.text);
  return Boolean(pinOf(cite));
};
const unresolved = cite =>
  ['short', 'id', 'supra'].includes(cite.type) && (!cite.authority || cite.authority.nameless);

// Whether a citation cannot support the sentence as written: a full cite with no
// pin, an unreported case with no database cite or full date, or a short form
// nothing resolves.
function deficient(cite) {
  if (cite.type === 'full') return !pinOf(cite);
  if (cite.type === 'docket' || cite.type === 'docket-number') {
    return !cite.database || !FULL_DATE.test(cite.text);
  }
  return unresolved(cite);
}

const stateOf = cite =>
  cite.nested ? 'nested' : cite.quoted ? 'quoted' : unresolved(cite) ? 'unresolved' : 'own';

// What a citation chip says: the case's short name and pin, "Smith (docket)",
// "§ 3602(b)", or "id. → Lakeside".
function chipLabel(cite) {
  const authority = cite.authority;
  switch (cite.type) {
    case 'full':
      return `${authority.name} ${pinOf(cite) || cite.page}`;
    case 'short':
      return authority
        ? `${authority.name} ${pinOf(cite)}`
        : `${cite.volume} ${cite.reporter} at ${pinOf(cite)}`;
    case 'docket':
      return `${authority.name} (docket)`;
    case 'id': {
      const id = cite.text.match(/^[Ii](?:bi)?d\./)[0];
      return authority && !authority.nameless ? `${id} → ${authority.name}` : id;
    }
    case 'supra':
      return authority ? `${authority.name}, supra` : cite.text.replace(SIGNAL_START, '');
    case 'statute':
    case 'section':
      return fromSection(cite.text).replace(YEAR_AFTER, '').replace(/\s+\(/g, '(');
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
]);

// Citations that name an authority in full, with its court.
const FULL_TYPES = new Set(['full', 'docket', 'docket-number']);

// The page a pin starts on: "418–19" is 418, "*3" is 3.
const pinPage = cite => parseInt(String(cite.pin || '').replace(/^\D+/, ''), 10);

// The case a short form means among the cases cited in its volume and reporter.
// With one case cited in full, that one. With several (Celotex and Anderson are
// both in 477 U.S.), the one its name names, else the last to start before its
// pin, since a pin falls inside the case it cites. With none cited in full, a
// case never cited in full by the same name, or by any name if it gives none.
function caseIn(cases, cite) {
  const full = cases.filter(item => !item.nameless);
  const name = cite.antecedent ? shortName(cite) : null;
  if (!full.length) return cases.find(item => !name || item.name === name) || null;
  if (full.length === 1) return full[0];
  const named = name && full.find(item => item.name === name || item.caseName?.includes(name));
  if (named) return named;
  const pin = pinPage(cite);
  const before = full.filter(item => Number(item.page) <= pin);
  return before.sort((a, b) => Number(b.page) - Number(a.page))[0] || full[0];
}

// The authorities the citations point at. A full citation's key is its volume,
// reporter and first page, so two cases in one volume stay two; a statute's is
// legal-text's citationKey, which drops subsections. Full citations, dockets
// and statutes name their own; a short form resolves to a case cited in full in
// its volume and reporter anywhere in the document, or else stands for a case
// never cited in full ("Hovsons"); a bare section ("§ 3602(c)") joins the statute
// cited with that section; id. resolves to the last authority the writer cited,
// not one inside a quotation or a parenthetical.
function resolve(all) {
  const byKey = new Map();
  const authority = (key, make) => {
    if (!byKey.has(key)) byKey.set(key, { key, cites: [], refs: [], ...make() });
    return byKey.get(key);
  };
  // The cases cited in each volume and reporter, and the statutes, in order.
  const volumes = new Map();
  const inVolume = (cite, item) => {
    const list = volumes.get(citationKey(cite)) || [];
    if (!list.includes(item)) list.push(item);
    volumes.set(citationKey(cite), list);
    return item;
  };
  const statutes = [];
  for (const cite of all) {
    if (cite.type === 'full') {
      cite.authority = inVolume(
        cite,
        authority(`${citationKey(cite)} ${cite.page}`, () => ({
          group: 'cases',
          name: shortName(cite),
          caseName: cite.name,
          page: cite.page,
        })),
      );
    } else if (cite.type === 'docket') {
      cite.authority = authority(citationKey(cite), () => ({
        group: 'cases',
        name: shortName(cite),
      }));
    } else if (cite.type === 'statute') {
      cite.authority = authority(citationKey(cite), () => ({
        group: 'statutes',
        name: sectionName(cite),
      }));
      if (!statutes.includes(cite.authority)) statutes.push(cite.authority);
    } else if (cite.type === 'docket-number' || cite.type === 'database') {
      cite.authority = authority(cite.docket || cite.text, () => ({
        group: 'other',
        name: cite.docket || cite.text,
      }));
    }
  }
  let last = null;
  for (const cite of all) {
    if (cite.type === 'short') {
      const found = caseIn(volumes.get(citationKey(cite)) || [], cite);
      if (found) cite.authority = found;
      else if (cite.antecedent) {
        const name = shortName(cite);
        cite.authority = inVolume(
          cite,
          authority(`${citationKey(cite)} ${name}`, () => ({
            group: 'cases',
            name,
            nameless: true,
            volume: cite.volume,
            reporter: cite.reporter,
          })),
        );
      }
    } else if (cite.type === 'section') {
      const key = citationKey(cite);
      cite.authority =
        statutes.find(item => item.key.endsWith(key)) ||
        authority(key, () => ({ group: 'statutes', name: sectionName(cite) }));
    } else if (cite.type === 'supra') {
      // The supra pattern can take a signal into the name: "See Jones, supra".
      const name = cite.antecedent.replace(SIGNAL_START, '');
      const full = all.find(other => other.type === 'full' && other.name?.includes(name));
      cite.authority = full ? full.authority : null;
    } else if (cite.type === 'id') {
      cite.authority = cite.quoted ? null : last;
    }
    // A short form for a case never cited in full still names the case an id. after
    // it means, so it counts; the id. then shows as unresolved, as the short form does.
    const usable = cite.authority && !cite.quoted && !cite.nested && CITABLE.has(cite.type);
    if (usable) last = cite.authority;
    cite.authority?.cites.push(cite);
  }
  return byKey;
}

// ---------------------------------------------------------------------------
// Support and flags
// ---------------------------------------------------------------------------

const RECORD = /\b(?:Ex\.|Exh\.|Compl\.|Dep\.|Decl\.|Aff\.|R\. at|ECF No\.)/;
const OPEN_ITEM = /\[cite\]|\bTK\b|needs? to confirm|confirm with client|\?\?\?/i;
const WEAK = new Set(['missing', 'incomplete', 'secondhand', 'contrary', 'unsourced']);

// What a sentence rests on, first match wins.
function supportOf(sentence, { heading, cites, own, named, citedBelow }) {
  if (heading) return 'n/a';
  if (own.length) {
    const strengths = own.map(cite => strengthOf(cite.signal));
    const support = strengths.every(strength => strength === 'contrary')
      ? 'contrary'
      : STRENGTHS.find(strength => strengths.includes(strength));
    if (own.every(deficient)) return 'incomplete';
    // A case described through another court's citation of it.
    const keys = new Set(own.map(cite => cite.authority?.key));
    if (sentence.kind === 'precedent' && named.some(ref => !keys.has(ref.authority.key))) {
      return 'secondhand';
    }
    return support;
  }
  if (sentence.kind === 'client-fact') return RECORD.test(sentence.text) ? 'record' : 'unsourced';
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
    ({ sentence }) => sentence.index > 0 && /^[a-z]/.test(sentence.text),
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
      own.some(cite => /[^.!?,;:\s][”"]\s+$/.test(text.slice(sentence.start, cite.start))),
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
  const { heading, quoted, cites, own, named, text, unclosed } = context;
  const flags = [];
  const add = (id, label, attention) => flags.push({ id, text: label, attention });
  const kind = sentence.kind;
  if (quoted) add('quote', 'Quotation', false);
  if (quoted && !own.length && !heading && kind !== 'conclusion' && kind !== 'framing') {
    add('quote-unsourced', 'Quotation with no source', true);
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
  if (kind === 'precedent' && !own.length) {
    for (const { name } of cases) add('uncited-case', `Describes ${name} without citing it`, true);
  }
  if (own.some(cite => strengthOf(cite.signal) === 'indirect' && !cite.parentheticals?.length)) {
    add('needs-parenthetical', 'Add a parenthetical saying how it supports this', true);
  }
  if (kind === 'application' && !own.length) {
    for (const { name } of cases) {
      add('see-suggested', `Relies on ${name}: consider a See cite`, false);
    }
  }
  const items = FORM.filter(([, , test]) => test({ sentence, own, cites, text })).map(
    ([id, label]) => ({ id, text: label }),
  );
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

export function analyzeLegal(blocks, labels) {
  const labeled = Array.isArray(labels) && labels.some(labelOf);
  const sections = sectionsOf(blocks);
  const sectionOf = new Map();
  for (const section of sections) for (const block of section.blocks) sectionOf.set(block, section);

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
          caption: section.part === 'caption',
        }),
      };
      sentences.push(entry);
      return entry;
    }),
  );
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
  const authorities = resolve(all);
  for (const authority of authorities.values()) {
    authority.full = authority.cites.find(cite => FULL_TYPES.has(cite.type));
  }
  const names = referenceNames(all);
  const refsOf = blocks.map((block, at) =>
    findReferences(block.text, citesOf[at], names)
      .map(ref => ({
        block: at,
        start: ref.start,
        end: ref.end,
        text: ref.text,
        authority: all[ref.refersTo]?.authority,
        quoted: read[at].quotes.some(([start, end]) => start < ref.start && ref.start < end),
      }))
      .filter(ref => ref.authority),
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
  const sentenceCites = inSentence(citesOf);
  const sentenceRefs = inSentence(refsOf);
  const ownOf = n => sentenceCites[n - 1].filter(cite => !cite.nested && !cite.quoted);
  const nextBlock = at => byBlock.slice(at + 1).find(own => own.length)?.[0];
  const unclosed = blocks.map(block => unclosedQuote(block.text));

  for (const sentence of sentences) {
    const block = blocks[sentence.block];
    const heading = HEADING.test(block.kind);
    const cites = sentenceCites[sentence.n - 1];
    const own = ownOf(sentence.n);
    const named = sentenceRefs[sentence.n - 1].filter(ref => !ref.quoted);
    const next = nextBlock(sentence.block);
    const quoted =
      block.kind === 'blockquote' ||
      read[sentence.block].quotes.some(
        ([start, end]) =>
          start < sentence.end && end > sentence.start && words(block.text.slice(start, end)) >= 4,
      );
    sentence.support = supportOf(sentence, {
      heading,
      cites,
      own,
      named,
      citedBelow: Boolean(next && ownOf(next.n).length),
    });
    sentence.flags = flagsOf(sentence, {
      heading,
      quoted,
      cites,
      own,
      named,
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
    const lead = own.length
      ? block.text
          .slice(sentence.start, own[0].start)
          .trimEnd()
          .replace(SIGNAL_BEFORE, '')
          .trimEnd()
      : '';
    sentence.lead = lead || sentence.text;
    sentence.attention = WEAK.has(sentence.support) || sentence.flags.some(flag => flag.attention);
  }

  const runs = roleRuns(sections, sentences);
  for (const section of sections) {
    const confidence = labeled ? confidenceOf(section, sentences) : null;
    section.rank = confidence?.rank ?? null;
    section.phrase = confidence?.phrase ?? null;
    section.rail = labeled ? railOf(section, runs, sentences) : null;
  }
  const checks = labeled
    ? checksOf({ sections, sentences, runs, blocks, read, citesOf, ownOf })
    : [];

  return {
    labeled,
    sentences,
    sections,
    runs,
    checks,
    authorities: tableOf(authorities, tagOf),
    unresolved: unresolvedOf(all, tagOf),
    attentionCount: sentences.filter(sentence => sentence.attention).length,
  };
}

// ---------------------------------------------------------------------------
// Structure checks
// ---------------------------------------------------------------------------

const SEVERITY = { fail: 0, warn: 1, info: 2 };
// Spaces only, not line breaks: with \s each line start would look through every
// line after it, a pause of a fifth of a second on a block of empty lines.
const CLIENT_LINE = /^[^\S\n]*RE[^\S\n]*:[^\S\n]*(.*)$/im;

// The client's names: capitalized words of three or more letters at the start of
// the RE line, before its first ";" or ",".
export function clientNames(blocks) {
  for (const block of blocks) {
    const line = block.text.match(CLIENT_LINE);
    if (line) return line[1].split(/[;,]/)[0].match(/\b[A-Z][A-Za-z'’-]{2,}/g) || [];
  }
  return [];
}

function checksOf({ sections, sentences, runs, blocks, read, citesOf, ownOf }) {
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
  const subIssues = sections.filter(section => section.part === 'sub-issue');
  const runsOf = section => runs.filter(run => run.parent === section.index);
  const sectionAt = n => sections[sentences[n - 1].section];
  const letter = (section, name) => section.rail?.find(item => item.letter === name)?.state;

  // facts-section
  const facts = sentences.filter(sentence => sentence.kind === 'client-fact');
  if (facts.length && !sections.some(section => section.part === 'facts')) {
    add(
      'facts-section',
      'fail',
      `No Statement of Facts: ${facts.length === 1 ? '1 client fact appears' : `${facts.length} client facts appear`} only in the analysis.`,
      null,
      facts.map(sentence => sentence.n),
    );
  }

  // umbrella: two or more sub-issues in a row need an umbrella before them.
  sections.forEach((section, i) => {
    if (section.part !== 'sub-issue' || sections[i - 1]?.part === 'sub-issue') return;
    let count = 0;
    while (sections[i + count]?.part === 'sub-issue') count++;
    if (count < 2) return;
    const umbrella = sections[i - 1]?.part === 'umbrella' ? sections[i - 1] : null;
    if (!umbrella) {
      add('umbrella', 'warn', 'There is no umbrella before the sub-issues.', section, [
        section.first,
      ]);
      return;
    }
    const lacks = [
      letter(umbrella, 'P') === 'missing' && 'gives no overall prediction',
      letter(umbrella, 'M') === 'missing' && 'does not say the order of discussion',
      letter(umbrella, 'R') === 'missing' && 'states no cited rule',
    ].filter(Boolean);
    if (lacks.length) {
      add('umbrella', 'warn', `The umbrella ${prose(lacks)}.`, umbrella, [umbrella.first]);
    }
  });

  for (const section of subIssues) {
    const own = runsOf(section);
    const { tag } = section;
    // opens-with-issue
    if (!['issue', 'conclusion', 'heading'].includes(own[0].role)) {
      add('opens-with-issue', 'warn', `${tag} opens without stating its issue.`, section, [
        section.first,
      ]);
    }
    // rule-before-application
    const rule = letter(section, 'R');
    if (rule === 'order') {
      const applying = own.find(run => APPLYING.includes(run.role));
      const first = own.find(run => run.role === 'rule');
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
        section.last,
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

  // new-law-in-application: an authority first cited while applying the law.
  const explained = new Set();
  const reported = new Set();
  for (const sentence of sentences) {
    const keys = ownOf(sentence.n)
      .map(cite => cite.authority)
      .filter(Boolean);
    if (APPLYING.includes(sentence.role)) {
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

  // law-mentions-client
  const clients = clientNames(blocks);
  for (const sentence of sentences) {
    if (sentence.role !== 'rule' && sentence.role !== 'explanation') continue;
    const name = clients.find(client =>
      new RegExp(String.raw`(?<![\w])${escape(client)}(?![\w])`).test(sentence.text),
    );
    if (!name) continue;
    const role = sentence.role === 'rule' ? 'a rule' : 'an explanation';
    add(
      'law-mentions-client',
      'warn',
      `${sectionAt(sentence.n).tag}: ${role} mentions ${name}; keep client facts in the application.`,
      sectionAt(sentence.n),
      [sentence.n],
    );
  }

  // generalization: "courts" in general, resting on one authority or none.
  for (const sentence of sentences) {
    if (sentence.kind !== 'law' && sentence.kind !== 'precedent') continue;
    if (!/\bcourts\b/i.test(sentence.text.split(/\s+/).slice(0, 4).join(' '))) continue;
    const rest = sentences.filter(other => other.block === sentence.block && other.n >= sentence.n);
    const cited = new Map();
    for (const other of rest) {
      for (const cite of ownOf(other.n)) {
        if (cite.authority) cited.set(cite.authority.key, cite.authority);
      }
    }
    if (cited.size > 1) continue;
    const [authority] = cited.values();
    const basis = authority ? `one authority (${authority.name || authority.key})` : 'no authority';
    add(
      'generalization',
      'warn',
      `“${opening(sentence.text, 32)}” speaks for courts in general but rests on ${basis}.`,
      sectionAt(sentence.n),
      [sentence.n],
    );
  }

  // confidence: the conclusion sounds surer than its least sure part.
  const conclusion = sections.find(section => section.part === 'conclusion');
  if (conclusion) {
    const surest = confidenceOf(conclusion, sentences, true);
    const weakest = subIssues
      .map(section => ({ section, ...confidenceOf(section, sentences, false) }))
      .filter(({ rank }) => rank)
      .reduce((low, item) => (!low || item.rank < low.rank ? item : low), null);
    const unsure =
      surest &&
      surest.rank > 1 &&
      sentences
        .slice(conclusion.first - 1, conclusion.last)
        .filter(sentence => sentence.role === 'conclusion')
        .map(sentence => ({ sentence, ...confidenceRank(sentence.text) }))
        .find(({ rank }) => rank === 1);
    const above = surest && weakest && surest.rank > weakest.rank;
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

  // headings-predict
  for (const section of subIssues) {
    if (section.heading === null || !/^h[3-6]$/.test(blocks[section.heading].kind)) continue;
    const heading = sentences.filter(sentence => sentence.block === section.heading);
    if (heading.some(sentence => sentence.kind === 'conclusion')) continue;
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

function levelOf(authority) {
  if (authority.group === 'statutes') return 'statute';
  const court = authority.full?.court || '';
  if (/\bCir\.$/.test(court)) return 'circuit';
  if (/^(?:[NSEWMC]\.D\.|D\.)\s?\S/.test(court)) return 'district';
  const reporter = authority.full?.reporter || authority.reporter || '';
  if (SUPREME.test(squeeze(reporter))) return 'supreme';
  return 'unknown';
}

// A statute's title from its first mention in Bluebook form, with every
// subsection the document cites: "42 U.S.C. § 3602(b), (c)". The first mention
// that names the code, since a bare "§ 3602" may come before it.
function statuteTitle(cites) {
  const base = (cites.find(cite => cite.type === 'statute') || cites[0]).text
    .replace(YEAR_AFTER, '')
    .replace(SUBSECTIONS, '')
    .replace(/U\.\s?S\.\s?Code\b/, 'U.S.C.')
    .trim();
  const subsections = cites.map(cite => cite.text.match(SUBSECTIONS)?.[0].replace(/\s/g, ''));
  return base + [...new Set(subsections.filter(Boolean))].join(', ');
}

function titleOf(authority) {
  const full = authority.full;
  const court = (cite = {}) => [cite.court, cite.year].filter(Boolean).join(' ');
  if (authority.group === 'statutes') return { title: statuteTitle(authority.cites), italic: null };
  if (authority.group === 'other') return { title: authority.cites[0].text, italic: null };
  let name;
  let rest;
  if (authority.nameless) {
    name = authority.name;
    rest = `, ${authority.volume} ${authority.reporter}`;
  } else if (full.type === 'docket') {
    name = full.name;
    rest = `, ${[full.docket, full.database].filter(Boolean).join(', ')}`;
    if (court(full)) rest += ` (${court(full)})`;
  } else {
    name = full.name || '';
    rest = `${name ? ', ' : ''}${full.volume} ${full.reporter} ${full.page}`;
    if (court(full)) rest += ` (${court(full)})`;
  }
  return { title: name + rest, italic: name ? [0, name.length] : null };
}

function warningsOf(authority) {
  const warnings = [];
  const cites = authority.cites;
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

// Citations nothing resolves, each with why.
function unresolvedOf(all, tagOf) {
  const items = [];
  for (const cite of all) {
    if (cite.authority || !['id', 'supra', 'short'].includes(cite.type)) continue;
    const where = `${cite.text.replace(SIGNAL_START, '')} in ${tagOf(cite.block)}`;
    const why =
      cite.type === 'id'
        ? cite.quoted
          ? `${where}, inside a quotation: it refers to the quoted court’s own earlier citation.`
          : `${where}: there is no earlier citation for it to refer to.`
        : cite.type === 'supra'
          ? `${where}: no full citation in this document has that name.`
          : `${where}: no full citation in this document has this volume and reporter.`;
    items.push({ text: why, span: { block: cite.block, start: cite.start, end: cite.end } });
  }
  return items;
}

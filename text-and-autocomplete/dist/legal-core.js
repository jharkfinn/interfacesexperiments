import { numbered, readObject, DOCUMENT_SHAPE, DATA_ONLY } from './segment-core.js';
import { textResponse } from './compose-core.js';

// Claude labels each sentence of a legal document with the job it does in the
// analysis (its role) and what it asserts (its kind). Claude returns only
// sentence numbers and words from fixed lists, never text of its own, so a
// label can never carry an invented case name, citation or quotation into the
// app. Everything else, sections, checks and citations, the app works out
// itself from the text and these labels.

export const ROLES = [
  'issue',
  'conclusion',
  'rule',
  'explanation',
  'application',
  'counter',
  'roadmap',
  'heading',
  'facts',
  'other',
];
export const KINDS = ['law', 'precedent', 'client-fact', 'application', 'conclusion', 'framing'];
// The checks the IRAC view can run, in the order it shows them.
export const STRUCTURE_CHECKS = [
  'facts-section',
  'umbrella',
  'opens-with-issue',
  'rule-before-application',
  'closes-with-conclusion',
  'alternating',
  'new-law-in-application',
  'law-mentions-client',
  'generalization',
  'confidence',
  'headings-predict',
  'quotation-share',
];

export const ROLE_NAMES = {
  issue: 'Issue',
  conclusion: 'Conclusion',
  rule: 'Rule',
  explanation: 'Explanation',
  application: 'Application',
  counter: 'Counter',
  roadmap: 'Roadmap',
  heading: 'Heading',
  facts: 'Facts',
  other: 'Other',
};
export const KIND_NAMES = {
  law: 'Law',
  precedent: 'Precedent',
  'client-fact': 'Client fact',
  application: 'Application',
  conclusion: 'Conclusion',
  framing: 'Framing',
};

// The kinds a sentence in each role can assert. A pair outside these means
// Claude's two labels disagree, so one of them may be wrong.
export const ALLOWED = {
  rule: ['law'],
  explanation: ['precedent', 'law'],
  application: ['application', 'client-fact'],
  counter: ['application', 'client-fact', 'precedent', 'law'],
  conclusion: ['conclusion'],
  issue: ['framing', 'law'],
  roadmap: ['framing', 'law'],
  heading: ['framing', 'conclusion'],
  facts: ['client-fact'],
  other: ['framing'],
};
// The most likely kind for a role, and role for a kind, when Claude gives only
// one of the two.
export const DEFAULT_KIND = {
  rule: 'law',
  explanation: 'precedent',
  application: 'application',
  counter: 'application',
  conclusion: 'conclusion',
  facts: 'client-fact',
  issue: 'framing',
  roadmap: 'framing',
  heading: 'framing',
  other: 'framing',
};
export const DEFAULT_ROLE = {
  law: 'rule',
  precedent: 'explanation',
  'client-fact': 'facts',
  application: 'application',
  conclusion: 'conclusion',
  framing: 'other',
};

export const LEGAL_INSTRUCTIONS = `You label each sentence of a legal document, such as an office memo or a brief, by the job it does in the legal analysis, the way a supervising attorney reviews it.
The input has "paragraphs". ${DOCUMENT_SHAPE} A sentence may end with the citations that support it, such as "Lakeside, 455 F.3d at 159."; judge the sentence by what its words do. A sentence may carry "prior": the role and kind it had in an earlier reading.
Return one JSON object and nothing else, in this shape:
{"tags":[[1,"heading","framing"],[7,"issue","law"],[20,"application","application","explanation"]]}
Give every sentence exactly one entry, in order: [n, role, kind], or [n, role, kind, also] when the sentence clearly does two jobs.
"role" is the sentence's job in the analysis, one of:
- issue: states the legal question a section answers. Cues: "whether", "the question is", "the key term".
- conclusion: predicts how a court will decide the issue, a sub-issue, or the whole matter, or restates that prediction. Cues: "likely", "probably", "therefore", "thus".
- rule: states the governing law in general terms: statutory text, a test, elements, factors, a definition, or a burden. No client facts.
- explanation: shows how courts have interpreted or applied the rule: a decided case's facts, holding, or reasoning. No client facts.
- application: applies the rule or a decided case to the client's facts, directly or by comparison. Cues: "Here", "Like", "Unlike", "Similarly".
- counter: states a contrary argument, an adverse fact, or an adverse case, and answers it. Cues: "Although", "However", "falls short".
- roadmap: says what the discussion covers next, or in what order.
- heading: a heading or point heading.
- facts: states facts about the client or the matter without applying law to them.
- other: anything else, such as a caption line (TO, FROM, DATE, RE) or a transition.
"kind" is what the sentence asserts, one of:
- law: a legal rule, test, element, definition, or a general statement about what courts do.
- precedent: what a specific court found, held, or reasoned.
- client-fact: a fact about the client, the parties, documents, or events in this matter.
- application: a connection between law and the client's facts.
- conclusion: a prediction, or a restatement of one.
- framing: a heading, caption line, transition, roadmap, or question that asserts no law or fact.
"also" is a second role from the same list, only when the sentence clearly does two jobs, such as explanation and application.
Rules:
- Label what the writer uses the sentence for. A quotation that states the rule is a rule; a quotation that describes what a court did is an explanation.
- A heading that predicts an outcome has role "heading" and kind "conclusion"; a heading that only names a topic has kind "framing".
- Keep a sentence's "prior" labels unless its words now clearly do a different job.
- Return only sentence numbers and the words listed above. Never write a case name, citation, quotation, explanation, or any other text, and never judge whether a citation is correct; the app checks citations itself.
${DATA_ONLY}`;

const isPair = entry =>
  Array.isArray(entry) &&
  entry.length === 2 &&
  ROLES.includes(entry[0]) &&
  KINDS.includes(entry[1]);

// The request for the legal labels. `prior` is the labels from the last
// reading, one [role, kind] pair or null per sentence, so that Claude keeps
// them unless a sentence now does a different job; without it, a small edit
// could relabel sentences nobody touched.
export function legalEvent(id, { paragraphs, prior = null }) {
  const input = numbered(paragraphs);
  if (prior != null) {
    const total = input.reduce((sum, paragraph) => sum + paragraph.sentences.length, 0);
    if (
      !Array.isArray(prior) ||
      prior.length !== total ||
      !prior.every(entry => entry === null || isPair(entry))
    ) {
      throw new Error('Expected one prior entry per sentence.');
    }
    for (const paragraph of input) {
      for (const sentence of paragraph.sentences) {
        const pair = prior[sentence.n - 1];
        if (pair) sentence.prior = [pair[0], pair[1]];
      }
    }
  }
  return textResponse(id, {
    operation: 'legal',
    maxOutputTokens: 4096,
    instructions: LEGAL_INSTRUCTIONS,
    input: { paragraphs: input },
  });
}

// Words Claude may use for a role or kind instead of the listed ones, written
// as normalize() leaves them.
const ROLE_SYNONYMS = {
  'rule explanation': 'explanation',
  proof: 'explanation',
  holding: 'explanation',
  'case illustration': 'explanation',
  analysis: 'application',
  analogy: 'application',
  distinction: 'application',
  counterargument: 'counter',
  'counter argument': 'counter',
  'counter analysis': 'counter',
  rebuttal: 'counter',
  prediction: 'conclusion',
  thesis: 'conclusion',
  answer: 'conclusion',
  'brief answer': 'conclusion',
  question: 'issue',
  'question presented': 'issue',
  fact: 'facts',
  background: 'facts',
  'statement of facts': 'facts',
  transition: 'other',
  caption: 'other',
  'point heading': 'heading',
  title: 'heading',
};
const KIND_SYNONYMS = {
  fact: 'client-fact',
  facts: 'client-fact',
  'client fact': 'client-fact',
  client: 'client-fact',
  rule: 'law',
  authority: 'law',
  statute: 'law',
  legal: 'law',
  case: 'precedent',
  holding: 'precedent',
  heading: 'framing',
  transition: 'framing',
  roadmap: 'framing',
  prediction: 'conclusion',
};

// One of `list`, read from a word Claude wrote, or null.
function word(value, list, synonyms) {
  if (typeof value !== 'string') return null;
  const plain = value
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, ' ');
  const name = (synonyms[plain] ?? plain).replace(/ /g, '-');
  return list.includes(name) ? name : null;
}

// A tag {role, kind, also?} from one entry of Claude's reply, or null. When
// only one of role and kind is there, the other is the usual one for it.
function readTag(entry) {
  const [rawRole, rawKind, rawAlso] = Array.isArray(entry)
    ? entry.slice(1)
    : [entry?.role, entry?.kind, entry?.also];
  let role = word(rawRole, ROLES, ROLE_SYNONYMS);
  let kind = word(rawKind, KINDS, KIND_SYNONYMS);
  if (!role && !kind) return null;
  role ??= DEFAULT_ROLE[kind];
  kind ??= DEFAULT_KIND[role];
  const also = word(rawAlso, ROLES, ROLE_SYNONYMS);
  return also && also !== role ? { role, kind, also } : { role, kind };
}

// One label per sentence, in document order. `found` has the labels Claude
// gave or that were carried over, with a hole for each sentence without one.
// A sentence without a label takes the one before it in its paragraph, else
// the next one found in its paragraph, else other/framing, and is marked as a
// guess.
function fillGaps(found, paragraphs) {
  const tags = [];
  let index = 0;
  for (const paragraph of paragraphs) {
    const first = index;
    const last = first + paragraph.sentences.length;
    for (const text of paragraph.sentences) {
      const tag = found[index];
      if (tag) {
        tags.push({ text, ...tag });
      } else {
        const before = index > first ? tags[index - 1] : null;
        const after = found.slice(index + 1, last).find(Boolean);
        const { role, kind, also } = before ?? after ?? { role: 'other', kind: 'framing' };
        tags.push(
          also ? { text, role, kind, also, guess: true } : { text, role, kind, guess: true },
        );
      }
      index++;
    }
  }
  return tags;
}

// Claude's reply as {tags: [{text, role, kind, also?, guess?}]}, one tag per
// sentence in order, with `partial: true` when 30% or more of them are
// guessed. Anything but a sentence number and words from the lists is
// dropped, so no text Claude wrote reaches the app. Returns null when the
// reply has no usable label.
export function parseLegal(raw, paragraphs) {
  const total = paragraphs.reduce((sum, paragraph) => sum + paragraph.sentences.length, 0);
  if (!total) return { tags: [] };
  const data = readObject(raw);
  if (!Array.isArray(data?.tags)) return null;
  const found = new Array(total).fill(null);
  let count = 0;
  for (const entry of data.tags) {
    const n = Math.round(Number(Array.isArray(entry) ? entry[0] : entry?.n));
    if (!Number.isFinite(n) || n < 1 || n > total || found[n - 1]) continue;
    const tag = readTag(entry);
    if (!tag) continue;
    found[n - 1] = tag;
    count++;
  }
  if (!count) return null;
  const tags = fillGaps(found, paragraphs);
  return total - count >= 0.3 * total ? { tags, partial: true } : { tags };
}

// Labels from an earlier reading, carried to the document as it is now: one
// tag per sentence, in order. A sentence keeps the tag stored with its text;
// a new or changed sentence is labelled as fillGaps() labels a gap, and is
// always a guess. Returns null with nothing stored.
export function remapLegal(stored, paragraphs) {
  if (!Array.isArray(stored?.tags) || !stored.tags.length) return null;
  const owners = new Map();
  for (const tag of stored.tags) {
    if (!owners.has(tag.text)) owners.set(tag.text, []);
    owners.get(tag.text).push(tag);
  }
  const found = paragraphs
    .flatMap(paragraph => paragraph.sentences)
    .map(text => {
      const tag = owners.get(text)?.shift();
      if (!tag) return null;
      const { role, kind, also, guess } = tag;
      return { role, kind, ...(also ? { also } : {}), ...(guess ? { guess } : {}) };
    });
  return fillGaps(found, paragraphs);
}

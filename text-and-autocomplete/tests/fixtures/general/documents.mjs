// Eight legal and non-legal documents unlike the sample memo, so the tests check that
// the IRAC and Sourcing views read writing in general and not one memo:
//   state-brief           a California Court of Appeal brief in California Style Manual form
//   state-brief-bluebook  the same brief in Bluebook form
//   illinois-brief        an Illinois Appellate Court brief under Supreme Court Rule 341, with
//                         public-domain citations, record citations in Bluepages and Illinois
//                         form, subsequent history, court and local rules, and Restatements
//   federal-motion        a Southern District of New York motion to dismiss
//   full-memo             a Title VII retaliation memo with record citations
//   statutory             an ADA memo citing statutes, regulations, legislative history,
//                         a law review and a treatise
//   informal              an email to a client, with an excerpt of the contract it discusses
//   non-legal             a magazine profile that cites English, Canadian and US law
// Their people and companies are invented, as are some of the authorities they cite.
// Each document's labels are what Claude is expected to say about each sentence under
// LEGAL_INSTRUCTIONS (so the email's contract excerpt is document text, and its own
// "Section 4.2(b) lets Kestrel terminate …" is a rule), kept by the sentence's text rather
// than its place, so a change in how the text splits shows as a sentence with no label
// instead of every later label moving one place.
import { readFileSync } from 'node:fs';
import { sentencesIn } from '../../../dist/doc-model.js';

export const DOCUMENTS = [
  'state-brief',
  'state-brief-bluebook',
  'illinois-brief',
  'federal-motion',
  'full-memo',
  'statutory',
  'informal',
  'non-legal',
];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) =>
    name[0] === '#'
      ? String.fromCodePoint(
          name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
        )
      : (ENTITIES[name] ?? whole),
  );

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

// The document's blocks as the document model reads them: {index, kind, text, sentences},
// with each list item a block of its own and a <br> as "\n" in its block's text.
export function blocksOf(key) {
  return [...read(`${key}.html`).matchAll(/<(h[1-6]|p|blockquote|li)>(.*?)<\/\1>/gs)].map(
    ([, kind, html], index) => {
      const text = decode(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''));
      return { index, kind, text, sentences: sentencesIn(text, 'en') };
    },
  );
}

// The labels for these blocks, one [role, kind] or [role, kind, also] per sentence, in
// order. A sentence the stored labels do not know is an error that names it.
export function labelsOf(key, blocks = blocksOf(key)) {
  const stored = JSON.parse(read(`${key}.labels.json`));
  return blocks.flatMap(block =>
    block.sentences.map(sentence => {
      const label = stored[sentence.text];
      if (!label) throw new Error(`${key}: no label for the sentence "${sentence.text}"`);
      return label;
    }),
  );
}

// The whole text, one block to a line, as the guard reads the document.
export const documentText = blocks => blocks.map(block => block.text).join('\n');

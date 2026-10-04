// The sample legal memo, read from the editor in dist/index.html so the tests
// always check the document a fresh profile opens.
import { readFileSync } from 'node:fs';
import { sentencesIn } from '../../dist/doc-model.js';

const INDEX = readFileSync(new URL('../../dist/index.html', import.meta.url), 'utf8');

// The editor's innerHTML. The editor is kept on one line, so it ends at the first
// "</div>" after its opening tag (it holds no divs of its own).
export const MEMO_HTML = INDEX.match(/<div id="editor"[^>]*>(.*?)<\/div>/s)[1];

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) =>
    name[0] === '#'
      ? String.fromCodePoint(
          name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)),
        )
      : (ENTITIES[name] ?? whole),
  );

// The memo's blocks as the document model reads them: {kind, text, sentences}.
// A <br> is a soft line break, "\n" in the block's text.
export function memoBlocks() {
  return [...MEMO_HTML.matchAll(/<(h[1-6]|p|blockquote)>(.*?)<\/\1>/gs)].map(([, kind, html]) => {
    const text = decode(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ''));
    return { kind, text, sentences: sentencesIn(text, 'en') };
  });
}

// What Claude is expected to say about each of the 46 sentences: [role, kind].
export const MEMO_TAGS = [
  ['heading', 'framing'], // S1 MEMORANDUM OF LAW
  ['other', 'framing'], // S2-S5 the caption
  ['other', 'framing'],
  ['other', 'framing'],
  ['other', 'framing'],
  ['heading', 'framing'], // S6 the umbrella heading
  ['issue', 'law'],
  ['rule', 'law'],
  ['rule', 'law'],
  ['rule', 'law'],
  ['rule', 'law'],
  ['issue', 'law'],
  ['rule', 'law'],
  ['rule', 'law'],
  ['heading', 'conclusion'], // S15 heading I
  ['rule', 'law'],
  ['conclusion', 'conclusion'],
  ['facts', 'client-fact'],
  ['explanation', 'precedent'],
  ['application', 'application'],
  ['explanation', 'precedent'],
  ['explanation', 'precedent'],
  ['explanation', 'precedent'],
  ['application', 'application'],
  ['conclusion', 'conclusion'],
  ['heading', 'conclusion'], // S26 heading II
  ['explanation', 'precedent'],
  ['explanation', 'precedent'],
  ['explanation', 'precedent'],
  ['conclusion', 'conclusion'],
  ['application', 'client-fact'],
  ['application', 'application'],
  ['counter', 'application'],
  ['counter', 'client-fact'],
  ['counter', 'application'],
  ['rule', 'law'],
  ['explanation', 'precedent'],
  ['application', 'application'],
  ['conclusion', 'conclusion'],
  ['heading', 'framing'], // S40 Conclusion
  ['conclusion', 'conclusion'],
  ['conclusion', 'conclusion'],
  ['conclusion', 'conclusion'],
  ['conclusion', 'conclusion'],
  ['conclusion', 'conclusion'],
  ['conclusion', 'conclusion'],
];

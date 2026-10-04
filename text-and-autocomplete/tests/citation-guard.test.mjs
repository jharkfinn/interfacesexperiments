import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACEHOLDER,
  protectedSpans,
  citationContext,
  cutAtCitation,
  guardInsertion,
  guardDraft,
  guardReplacement,
  selectionRefusal,
  combineRefusal,
  guardMessage,
} from '../dist/citation-guard.js';
import { memoBlocks } from './fixtures/memo.mjs';

const blocks = memoBlocks();
const DOC = blocks.map(b => b.text).join('\n');
// The memo's 46 sentences: S[1] is S1.
const S = [null, ...blocks.flatMap(b => b.sentences.map(s => s.text))];

// A selection of `selected` inside the memo, at its first occurrence.
function select(selected, from = 0) {
  const at = DOC.indexOf(selected, from);
  assert.ok(at >= 0, `memo contains ${selected}`);
  return [DOC.slice(0, at), selected, DOC.slice(at + selected.length)];
}

test('the memo fixture has the sentences these tests use', () => {
  assert.equal(S.length, 47);
  assert.match(S[16], /^To an individual plaintiff/);
  assert.match(S[19], /^Courts “have not defined/);
  assert.match(S[21], /^Lakeside clarified that/);
  assert.match(S[37], /^Even in cases where/);
  assert.match(S[43], /^The second and qualitative/);
});

test('cutAtCitation stops an insertion before a citation, signal or quotation', () => {
  assert.equal(cutAtCitation('…the test.', ' See Lakeside'), '');
  assert.equal(cutAtCitation('as held in Smith', ' v. Jones'), '');
  assert.equal(cutAtCitation('The stay', ' was significant. See id.'), ' was significant.');
  assert.equal(cutAtCitation('x', ' say "hello"'), ' say');
  assert.equal(cutAtCitation('x', ' [cite]'), ' [cite]');
  assert.equal(
    cutAtCitation('The court', ' agreed with the plaintiff.'),
    ' agreed with the plaintiff.',
  );
  // A citation that ends before the insertion does not cut it.
  assert.equal(cutAtCitation('Lakeside, 455 F.3d at 159.', ' The stay'), ' The stay');
  assert.equal(cutAtCitation('Lakeside, 455 F.3d at', ' 159.'), '');
});

test('citationContext finds a caret inside a citation or a quotation', () => {
  assert.equal(citationContext('Lakeside, 455 F.3d at'), 'inside-citation');
  assert.equal(
    citationContext(
      'District courts have allowed cases to proceed with a lower standard than “even',
    ),
    'inside-quotation',
  );
  assert.equal(citationContext('See'), 'inside-citation');
  assert.equal(citationContext('The court agreed.'), null);
  assert.equal(citationContext('as defined in 42 U.S.C. §'), 'inside-citation');
  assert.equal(citationContext('They said "the'), 'inside-quotation');
  assert.equal(citationContext('Lakeside, 455 F.3d at 159'), 'inside-citation');
  assert.equal(citationContext('Lakeside, 455 F.3d at 159. The'), null);
  assert.equal(citationContext('the “even longer” stays'), null);
});

test('protectedSpans covers citations, quotations, open items and case names', () => {
  // S19: the whole quotation (with the citations inside it) and the citation after it.
  assert.deepEqual(
    protectedSpans(S[19]).map(([s, e, type]) => [S[19].slice(s, e), type]),
    [
      [S[19].slice(7, S[19].indexOf('” Lakeside') + 1), 'quotation'],
      ['Lakeside, 455 F.3d at 159', 'citation'],
    ],
  );
  assert.deepEqual(
    protectedSpans(S[34]).map(([s, e, type]) => [S[34].slice(s, e), type]),
    [['(need to confirm with client)', 'placeholder']],
  );
  const spans = protectedSpans(S[21]);
  assert.deepEqual(spans[0], [0, 8, 'name']);
  for (let k = 1; k < spans.length; k++) assert.ok(spans[k - 1][1] <= spans[k][0]);
  assert.equal(
    protectedSpans('Add [cite] and TK here.').filter(([, , t]) => t === 'placeholder').length,
    2,
  );
});

test('guardInsertion refuses new citations, quotations and case names', () => {
  assert.equal(guardInsertion(DOC, ' and the stay was long.'), null);
  assert.equal(guardInsertion(DOC, ' See 42 U.S.C. § 3604(f)(1).'), 'new-citation');
  assert.equal(guardInsertion(DOC, ' See Lakeside, 455 F.3d at 160.'), null);
  assert.equal(guardInsertion(DOC, ' a “home”'), 'new-quotation');
  assert.equal(guardInsertion(DOC, ' as in Schwarz v. City'), 'new-case-name');
  assert.equal(guardInsertion(DOC, ' as in DeFiore v. City'), null);
});

test('guardDraft also refuses numbers the document does not have', () => {
  assert.equal(guardDraft(DOC, 'Doe stayed for 4 weeks of the 4 months.'), null);
  assert.equal(guardDraft(DOC, 'Doe stayed for 6 weeks.'), 'new-number');
  assert.equal(
    guardDraft(DOC, 'See Schwarz v. City of Treasure Island, 544 F.3d 1201.'),
    'new-citation',
  );
});

test('guardReplacement keeps citations, quotations and open items exact', () => {
  const s21 = S[21];
  assert.equal(guardReplacement(DOC, s21, s21.replace('at 159.', 'at 160.')), 'citation-changed');
  const s32 = S[32];
  assert.equal(
    guardReplacement(DOC, s32, s32.replace('receive mail', 'get mail')),
    'quotation-changed',
  );
  const open = 'The stay was long [cite].';
  assert.equal(guardReplacement(DOC + open, open, 'The stay was long.'), 'placeholder-removed');
  assert.equal(
    guardReplacement(
      DOC,
      S[36],
      `${S[36]} See Schwarz v. City of Treasure Island, 544 F.3d 1201 (11th Cir. 2008).`,
    ),
    'new-citation',
  );
  assert.equal(
    guardReplacement(DOC, S[36], `Lakeside held that ${S[36][0].toLowerCase()}${S[36].slice(1)}`),
    'holding-claim',
  );
  // The memo's own "Lakeside clarified" is not a new claim.
  assert.equal(
    guardReplacement(DOC, s21, s21.replace('Lakeside clarified that', 'As Lakeside clarified,')),
    null,
  );
  // S37 with its prose shortened and both citations and quotations verbatim.
  const s37 = S[37];
  assert.match(s37, /995 F\. Supp\. 2d 413/);
  const shorter = s37
    .replace('Even in cases where residents have', 'Even where residents had')
    .replace('the court found it could still qualify given', 'it qualified given');
  assert.notEqual(shorter, s37);
  assert.equal(guardReplacement(DOC, s37, shorter), null);
  // Reordered citations count as changed.
  assert.equal(
    guardReplacement(
      DOC,
      'A, Lakeside, 455 F.3d at 159; B, 42 U.S.C. § 3602(c).',
      'B, 42 U.S.C. § 3602(c); A, Lakeside, 455 F.3d at 159.',
    ),
    'citation-changed',
  );
  // A new quotation mark, and a case name the memo never uses.
  assert.equal(guardReplacement(DOC, S[33], `${S[33]} It is "short".`), 'new-quotation');
  assert.equal(guardReplacement(DOC, S[33], `${S[33]} Unlike Roe v. Wade.`), 'new-case-name');
});

test('selectionRefusal keeps selections off part of a citation or quotation', () => {
  assert.equal(
    selectionRefusal(...select('Lakeside, 455', DOC.indexOf('status.”')), false),
    'Select the whole citation or quotation, or none of it.',
  );
  assert.equal(
    selectionRefusal(...select('access to a communal kitchen, communal bathrooms'), false),
    'Citations and quotations keep their exact words.',
  );
  assert.equal(
    selectionRefusal(...select('“even longer”', DOC.indexOf("Doe' actual stay")), true),
    'Citations and quotations keep their exact words.',
  );
  assert.equal(
    selectionRefusal(...select(S[19]), false),
    'This selection is mostly citation or quotation, which keep their exact words.',
  );
  // The same selection may be rephrased: only its prose changes.
  assert.equal(selectionRefusal(...select(S[19]), true), null);
  assert.equal(
    selectionRefusal(...select('Lakeside', DOC.indexOf('Lakeside clarified')), true),
    'Case names keep their exact words.',
  );
  assert.equal(selectionRefusal(...select('While 4 weeks seems well below'), false), null);
  // A whole quotation and case name, with the prose around them, may be resized.
  assert.equal(selectionRefusal(...select(S[24]), false), null);
  // S21 is mostly quotation.
  assert.match(selectionRefusal(...select(S[21]), false), /^This selection is mostly/);
});

test('combineRefusal leaves sentences with evidence uncombined', () => {
  assert.equal(
    combineRefusal(S[16], S[17]),
    'Sentences with citations, quotations, or open items are not combined, so their words stay exact. Move them instead.',
  );
  assert.equal(combineRefusal(S[43], S[44]), null);
  assert.ok(combineRefusal(S[33], S[34])); // (need to confirm with client)
  assert.equal(combineRefusal(S[24], S[25]), null); // “even longer” is a two-word quotation
  assert.ok(combineRefusal(S[30], S[31])); // a long quotation
});

test('guardMessage names the operation and the reason', () => {
  assert.equal(
    guardMessage('citation-changed', 'The rewrite'),
    'The rewrite changed a citation, so it was not used.',
  );
  assert.equal(
    guardMessage('new-citation', 'The new wording'),
    'The new wording added a citation that is not in the document, so it was not used.',
  );
  assert.equal(
    guardMessage('placeholder-removed', 'The combined sentence'),
    'The combined sentence removed an open item such as [cite], so it was not used.',
  );
  assert.equal(
    guardMessage('holding-claim', 'The rewrite'),
    'The rewrite said what a court held in words the document does not use, so it was not used.',
  );
  for (const reason of ['quotation-changed', 'new-quotation', 'new-case-name'])
    assert.match(guardMessage(reason, 'The rewrite'), /^The rewrite .+, so it was not used\.$/);
});

test('PLACEHOLDER matches open items once each', () => {
  const text = 'A [cite] B TK C (need to confirm with client) D confirm with client.';
  assert.deepEqual(text.match(PLACEHOLDER), [
    '[cite]',
    'TK',
    '(need to confirm with client)',
    'confirm with client',
  ]);
});

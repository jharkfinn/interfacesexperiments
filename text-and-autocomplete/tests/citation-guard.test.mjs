import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACEHOLDER,
  CITATION_START,
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
  // A citation the memo has, copied word for word, may stay; one with a pin cite the memo
  // never gives may not, though the memo cites 455 F.3d.
  assert.equal(guardInsertion(DOC, ' See Lakeside, 455 F.3d at 159.'), null);
  assert.equal(guardInsertion(DOC, ' See Lakeside, 455 F.3d at 160.'), 'new-citation');
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
  assert.equal(combineRefusal(S[20], S[24]), null); // “even longer” is a two-word quotation
  // S25 quotes the test in single quotes: ‘significant period of time’.
  assert.ok(combineRefusal(S[24], S[25]));
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

test('cutAtCitation also cuts a citation the insertion stops partway into', () => {
  // The reply ends before the pin cite, or a streamed reply has not reached it yet.
  assert.equal(
    cutAtCitation('The test.', ' It applies in Lakeside, 455 F.3d at'),
    ' It applies in Lakeside',
  );
  assert.equal(cutAtCitation('The test.', ' as in Smith v.'), ' as in Smith');
  // A signal and the case name of the citation go with it.
  assert.equal(cutAtCitation('The test.', ' See, e.g., Lakeside, 455 F.3d at 159.'), '');
  assert.equal(
    cutAtCitation('The test.', ' It applies, see Lakeside, 455 F.3d at 159.'),
    ' It applies',
  );
  assert.equal(cutAtCitation('The test.', ' It applies, see id. at 5.'), ' It applies');
  // Citations the pattern does not begin at, but the parser knows.
  assert.equal(cutAtCitation('A home', ' is defined in 42 U.S.C. § 3602(b).'), ' is defined in');
  assert.equal(cutAtCitation('Dismissal', ' under Fed. R. Civ. P. 12(b)(6) fails.'), ' under');
});

test('cutAtCitation and citationContext leave ordinary prose alone', () => {
  for (const [before, insertion] of [
    ['Thanks for the update.', ' See you on Monday.'],
    ['Can we meet', ' at 3 PM on Tuesday?'],
    ['Call me', ' at 555-1234 tomorrow.'],
    ['The launch is', ' on 5 May 2024 in Austin.'],
    ['Bake', ' at 180 C for 25 minutes.'],
    ['Please', ' compare the two quotes.'],
    ['Use a', ' 9" pan and a 5" ramekin.'],
  ])
    assert.equal(cutAtCitation(before, insertion), insertion, insertion);
  for (const before of [
    'Can we meet at 3 PM',
    'The launch is on 5 May',
    'The 3 Musketeers',
    'Step 3 Mix',
    'Use a 9" pan',
  ])
    assert.equal(citationContext(before), null, before);
  // A quotation in single quotes, or straight ones after an inch mark, is still open.
  assert.equal(citationContext('the facility was ‘intended or'), 'inside-quotation');
  assert.equal(citationContext('the club’s ‘intended or designed’ use'), null);
  assert.equal(citationContext('Use a 9" pan, which they call "the'), 'inside-quotation');
});

test('the citation patterns stay fast on long runs of capitals', () => {
  // These took seconds: every split of the capitals was tried.
  let at = performance.now();
  assert.equal(
    citationContext('See section 12 GOVERNING LAW AND JURISDICTION OF THE COURTS, the'),
    null,
  );
  assert.ok(performance.now() - at < 100, 'citationContext');
  at = performance.now();
  [...` 5 ${'A'.repeat(400)}b`.matchAll(CITATION_START)];
  [...`${'Smith '.repeat(2000)}supra`.matchAll(CITATION_START)];
  assert.ok(performance.now() - at < 100, 'CITATION_START');
});

test('guardDraft refuses a citation or quotation the memo does not have word for word', () => {
  // 881 is in the memo, but never as a pin cite to Lakeside.
  assert.equal(guardDraft(DOC, 'The stay counts. Lakeside, 455 F.3d at 881.'), 'new-citation');
  assert.equal(guardDraft(DOC, 'Courts call it a ‘permanent home’ here.'), 'new-quotation');
  assert.equal(guardDraft(DOC, 'Use a 9" pan.'), 'new-number');
  assert.equal(guardDraft('Bake in a 9" pan.', 'Use a 9" pan.'), null);
});

test('guardReplacement refuses citations added to a rewrite', () => {
  assert.equal(
    guardReplacement(DOC, S[43], `${S[43]} See Lakeside, 455 F.3d at 159.`),
    'citation-changed',
  );
  assert.equal(
    guardReplacement(DOC, S[21], S[21].replace('at 159.', 'at 159, 881.')),
    'citation-changed',
  );
  // The same citation twice.
  assert.equal(
    guardReplacement(DOC, S[22], `${S[22]} Lakeside, 455 F.3d at 159.`),
    'citation-changed',
  );
});

test('guardReplacement keeps quotations whose marks are off', () => {
  // S29: a stray space after the opening straight quote.
  assert.equal(
    guardReplacement(DOC, S[29], S[29].replace('handicapped elderly', 'disabled older')),
    'quotation-changed',
  );
  // S27: a quotation that never closes.
  assert.equal(
    guardReplacement(DOC, S[27], S[27].replace('as homes', 'as their homes')),
    'quotation-changed',
  );
  // S25: single quotes.
  assert.equal(
    guardReplacement(DOC, S[25], S[25].replace('significant period of time', 'long time')),
    'quotation-changed',
  );
  assert.equal(
    guardReplacement(DOC, S[25], S[25].replace('To him, therefore,', 'So for him,')),
    null,
  );
  assert.equal(guardReplacement(DOC, S[33], `${S[33]} It is ‘short’.`), 'new-quotation');
});

test('guardReplacement refuses a changed open item', () => {
  assert.equal(
    guardReplacement(
      DOC,
      S[34],
      S[34].replace('(need to confirm with client)', '(need to check the lease)'),
    ),
    'placeholder-removed',
  );
});

test('guardReplacement lets the words before a case name change', () => {
  const cited = 'In Smith v. Jones, 1 F.3d 2 (3d Cir. 2000), the court agreed.';
  assert.equal(
    guardReplacement(cited, cited, cited.replace('In', 'Under').replace('agreed', 'concurred')),
    null,
  );
  assert.equal(guardReplacement(cited, cited, cited.replace('Smith', 'Smyth')), 'citation-changed');
  const named = 'As United States v. Columbus Country Club shows, it counts.';
  assert.equal(
    guardReplacement(
      DOC + named,
      named,
      'Under United States v. Columbus Country Club, it counts.',
    ),
    null,
  );
  // Ordinary prose with "v." in it.
  const game = 'The Lakers v. Celtics game is on Friday.';
  assert.equal(guardReplacement(game, game, 'A Lakers v. Celtics game is on Friday.'), null);
});

test('guards pass ordinary prose: a recipe and an email', () => {
  const recipe = 'Preheat the oven to 350 F. Use a 9" pan. Bake at 180 C for 25 minutes.';
  const email = 'Hi Sam, see you on 5 May at 3 PM. Compare the two quotes first. Thanks!';
  for (const text of [recipe, email]) {
    assert.equal(selectionRefusal('', text, '', false), null);
    assert.equal(combineRefusal(text, 'The weather was nice.'), null);
    assert.equal(guardReplacement(text, text, text.replace(/\. /g, '; ')), null);
  }
});

test('selectionRefusal protects case names far from their citations and block quotations', () => {
  // The Conclusion names Lakeside and DeFiore, far from where they are cited.
  for (const [name, from] of [
    ['Lakeside', 'figures in Lakeside'],
    ['DeFiore', 'that in DeFiore'],
    ['Columbus Country Club', 'In Columbus Country Club the'],
  ])
    assert.equal(
      selectionRefusal(...select(name, DOC.indexOf(from)), true),
      'Case names keep their exact words.',
    );
  // Inside S29's quotation, whose opening quote has a stray space after it.
  assert.equal(
    selectionRefusal(...select('handicapped elderly'), true),
    'Citations and quotations keep their exact words.',
  );
  // Words of a <blockquote> are quotation though no quotation marks show it.
  assert.equal(
    selectionRefusal(...select('any building, structure'), true, true),
    'Citations and quotations keep their exact words.',
  );
  assert.equal(selectionRefusal(...select('any building, structure'), true), null);
  // The end of a quotation that opened long before the selection.
  const long = `The court wrote: “${'The facility is a home. '.repeat(30)}It is.” That settles it.`;
  const at = long.indexOf('It is.”');
  assert.equal(
    selectionRefusal(long.slice(0, at), 'It is', long.slice(at + 5), true),
    'Citations and quotations keep their exact words.',
  );
  assert.equal(selectionRefusal(long.slice(0, -11), 'settles it', '.', true), null);
  assert.ok(combineRefusal(S[43], S[44], true));
});

test('a „German“ quotation closes with “', () => {
  const text = 'Er sagte „Das Haus ist sein Zuhause“ und ging nach Hause.';
  assert.equal(citationContext(text), null);
  assert.equal(citationContext('Er sagte „Das Haus'), 'inside-quotation');
  assert.equal(selectionRefusal('', text, '', true), null);
  assert.equal(selectionRefusal(...[text.slice(0, 46), 'nach Hause', text.slice(56)], true), null);
  assert.equal(guardReplacement(text, text, text.replace('und ging', 'dann ging er')), null);
  assert.equal(
    guardReplacement(text, text, text.replace('sein Zuhause', 'sein Heim')),
    'quotation-changed',
  );
});

test('no one-letter change to a memo citation or quotation gets through, and prose edits do', () => {
  let seed = 11;
  const random = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  let changes = 0;
  for (const sentence of S.slice(1)) {
    const spans = protectedSpans(sentence);
    for (const [start, end, type] of spans) {
      if (type !== 'citation' && type !== 'quotation') continue;
      const letters = [...sentence.slice(start, end).matchAll(/[A-Za-z0-9]/g)];
      for (let k = 0; k < 6; k++) {
        const at = start + letters[random(letters.length)].index;
        const swapped = /\d/.test(sentence[at]) ? String((+sentence[at] + 1) % 10) : '~';
        const changed = sentence.slice(0, at) + swapped + sentence.slice(at + 1);
        assert.ok(guardReplacement(DOC, sentence, changed), changed);
        changes++;
      }
      assert.ok(guardReplacement(DOC, sentence, sentence.slice(0, start) + sentence.slice(end)));
    }
    // A word of prose outside every protected span may change.
    const word = [...sentence.matchAll(/\b[a-z]{4,}\b/g)].find(
      m => !spans.some(([s, e]) => m.index < e && m.index + m[0].length > s),
    );
    if (word) {
      const changed =
        sentence.slice(0, word.index) +
        word[0].toUpperCase() +
        sentence.slice(word.index + word[0].length);
      assert.equal(guardReplacement(DOC, sentence, changed), null, changed);
    }
  }
  assert.ok(changes > 100);
});

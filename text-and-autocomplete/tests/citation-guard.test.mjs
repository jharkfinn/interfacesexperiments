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
import { findCitations } from '../dist/legal-text.js';
import { sentencesIn } from '../dist/doc-model.js';
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
  // never gives may not, though the memo cites 455 F.3d. Its signal is part of its words:
  // the memo cites Lakeside at 159 only without one, so "See" is new (GD-1).
  assert.equal(guardInsertion(DOC, ' Lakeside, 455 F.3d at 159.'), null);
  assert.equal(guardInsertion(DOC, ' See Lakeside, 455 F.3d at 159.'), 'new-citation');
  assert.equal(guardInsertion(DOC, ' Lakeside, 455 F.3d at 160.'), 'new-citation');
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

// ---------------------------------------------------------------------------
// Other documents: the guard must hold for any legal writing, not the sample memo's forms,
// and leave ordinary prose alone. Each is an excerpt, one paragraph per line.
// ---------------------------------------------------------------------------

// A California Court of Appeal brief, cited in California Style Manual form.
const CSM_BRIEF = [
  'FreshWay’s written safety policy requires an employee to walk every aisle and complete a “floor sweep” log at least once every 30 minutes. (2 CT 360.) The log for February 2 shows that aisle 7 was last swept at 2:05 p.m.; Delgado fell at 3:01 p.m. (2 CT 362; RT 9:14-18.) The assistant manager, Kevin Ostrander, testified that the 2:35 p.m. sweep “probably just didn’t get done” because the store was short-staffed that day. (2 CT 371 [Ostrander depo. at 44:3-19].) He agreed that a leaking jug of detergent “would make a puddle that size in maybe twenty minutes, maybe more.” (2 CT 373.)',
  'A trial court properly grants summary judgment only when “all the papers submitted show that there is no triable issue as to any material fact and that the moving party is entitled to a judgment as a matter of law.” (Code Civ. Proc., § 437c, subd. (c).) This court reviews the grant of summary judgment de novo. (Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826, 860 [107 Cal.Rptr.2d 841, 24 P.3d 493] (Aguilar).) It considers all the evidence the parties submitted, except evidence to which objections were properly sustained, and views that evidence and the reasonable inferences from it in the light most favorable to the opposing party. (Id. at p. 843; Saelzler v. Advanced Group 400 (2001) 25 Cal.4th 763, 768 [107 Cal.Rptr.2d 617, 23 P.3d 1143] (Saelzler).) Rulings on evidentiary objections made in connection with a summary judgment motion are generally reviewed for abuse of discretion, although the Supreme Court has left open whether a de novo standard applies. (See Reid v. Google, Inc. (2010) 50 Cal.4th 512, 535 [113 Cal.Rptr.3d 327, 235 P.3d 988].)',
  'A store owner must use ordinary care to keep its premises reasonably safe for customers. (Civ. Code, § 1714, subd. (a); Ortega v. Kmart Corp. (2001) 26 Cal.4th 1200, 1205 [114 Cal.Rptr.2d 470, 36 P.3d 11] (Ortega).) To hold an owner liable for a dangerous condition it did not create, the plaintiff must show that the owner had actual or constructive knowledge of the condition in time to correct it. (Ortega, supra, 26 Cal.4th at p. 1206.) FreshWay’s motion rested entirely on the absence of direct evidence of how long the detergent was on the floor. (1 CT 31-33.) That is not the law, and FreshWay’s own records supply the inference the trial court found missing.',
  'In Ortega, the Supreme Court rejected the argument that a plaintiff must prove exactly how long a hazard existed. (Ortega, supra, 26 Cal.4th at pp. 1210-1211.) The court explained that “[w]hether a dangerous condition has existed long enough for a reasonably prudent person to have discovered it is a question of fact for the jury.” (Id. at p. 1207, internal quotation marks omitted.) It added that a plaintiff may raise that inference “by showing that the site had not been inspected within a reasonable period of time.” (Id. at p. 1210.) Courts have applied the same rule to grocery spills. (See, e.g., Hatfield v. Levy Brothers (1941) 18 Cal.2d 798, 806 [117 P.2d 841]; Louie v. Hagstrom’s Food Stores, Inc. (1947) 81 Cal.App.2d 601, 608 [184 P.2d 708].)',
  'Here, FreshWay’s policy required a sweep of aisle 7 every 30 minutes, and its log shows that none occurred for 56 minutes before Delgado fell. (2 CT 360, 362.) Like the store in Ortega, FreshWay cannot rely on its own failure to inspect to defeat the inference of notice. (See Ortega, supra, 26 Cal.4th at p. 1210.) A jury could reasonably find that an employee walking the aisle at 2:35 p.m. would have seen a 30-inch blue puddle and cleaned it up before 3:01 p.m. The trial court therefore erred in finding no triable issue on constructive notice.',
  'On summary judgment, a court may not weigh the evidence or decide which competing inference is more persuasive. (Aguilar, supra, 25 Cal.4th at p. 856.) Instead, it must deny the motion if the evidence would allow a reasonable trier of fact to find the contested fact in favor of the opposing party. (Id. at p. 850; see Saelzler, supra, 25 Cal.4th at p. 781, citing Aguilar, supra, 25 Cal.4th at p. 850.) The trial court did the opposite. It reasoned that the detergent “could just as easily have spilled thirty seconds before plaintiff arrived.” (RT 12:3-9.) That speculation favors the moving party, and it ignores Ostrander’s own estimate that a puddle of that size takes about twenty minutes to form. (2 CT 373.) In Saelzler, by contrast, the plaintiff offered nothing but speculation about who attacked her and how; here the record contains the defendant’s own admissions. (See Saelzler, supra, 25 Cal.4th at pp. 775-776.)',
].join('\n');
// The same brief in Bluebook form.
const BLUEBOOK_BRIEF = [
  'In Ortega, the Supreme Court rejected the argument that a plaintiff must prove exactly how long a hazard existed. Id. at 1210–11. The court explained that “[w]hether a dangerous condition has existed long enough for a reasonably prudent person to have discovered it is a question of fact for the jury.” Id. at 1207 (internal quotation marks omitted). It added that a plaintiff may raise that inference “by showing that the site had not been inspected within a reasonable period of time.” Id. at 1210. Courts have applied the same rule to grocery spills. See, e.g., Hatfield v. Levy Bros., 18 Cal. 2d 798, 806, 117 P.2d 841 (1941); Louie v. Hagstrom’s Food Stores, Inc., 81 Cal. App. 2d 601, 608, 184 P.2d 708 (1947).',
].join('\n');
// A federal motion to dismiss: record, docket, Westlaw and parallel citations.
const MOTION = [
  'Corvina distributes fresh seafood to restaurants in the New York metropolitan area. Compl. ¶ 6. On March 3, 2025, Corvina and Halvorsen signed a Master Transportation Agreement (the “Agreement”) under which Halvorsen agreed to haul Corvina’s product between Portland, Maine and the Bronx. Id. ¶¶ 12–14; see also Decl. of Tomas Reyes, ECF No. 12, Ex. A. The Agreement requires Halvorsen to keep each load between 32 and 38 degrees Fahrenheit and caps Halvorsen’s liability for spoiled cargo at $25,000 per shipment. Agreement §§ 4.2, 9.1.',
  'According to the Complaint, a Halvorsen sales representative told Corvina’s owner in early 2025 that Halvorsen operated “a fully temperature-controlled fleet with real-time monitoring on every trailer.” (Compl. ¶ 9.) On August 14, 2025, a trailer carrying 11,000 pounds of Corvina’s product lost refrigeration near Hartford, Connecticut, and the load spoiled. (Id. ¶¶ 21–23.) Corvina alleges that Halvorsen knew some of its older trailers lacked monitoring units. (Id. ¶ 27.) The Complaint does not name the representative, give the date or place of the conversation, or allege any fact suggesting that the statement was false when it was made.',
  'To survive a motion to dismiss under Fed. R. Civ. P. 12(b)(6), a complaint must plead “enough facts to state a claim to relief that is plausible on its face.” Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570, 127 S. Ct. 1955, 167 L. Ed. 2d 929 (2007). The Supreme Court has explained the standard this way:',
  'A claim has facial plausibility when the plaintiff pleads factual content that allows the court to draw the reasonable inference that the defendant is liable for the misconduct alleged. The plausibility standard is not akin to a “probability requirement,” but it asks for more than a sheer possibility that a defendant has acted unlawfully.',
  'Ashcroft v. Iqbal, 556 U.S. 662, 678, 129 S. Ct. 1937, 173 L. Ed. 2d 868 (2009) (citation omitted). The Court accepts well-pleaded factual allegations as true, but it does not credit “[t]hreadbare recitals of the elements of a cause of action, supported by mere conclusory statements.” Id. In Iqbal, the Court applied that standard to dismiss a complaint whose allegations of discriminatory purpose were conclusory. The Court may also consider documents incorporated by reference in the complaint or integral to it, such as the Agreement. Chambers v. Time Warner, Inc., 282 F.3d 147, 152–53 (2d Cir. 2002).',
  'A party alleging fraud “must state with particularity the circumstances constituting fraud.” Fed. R. Civ. P. 9(b). To satisfy the rule, a complaint must “(1) specify the statements that the plaintiff contends were fraudulent, (2) identify the speaker, (3) state where and when the statements were made, and (4) explain why the statements were fraudulent.” Lerner v. Fleet Bank, N.A., 459 F.3d 273, 290 (2d Cir. 2006) (internal quotation marks omitted). Courts in this District routinely dismiss fraud claims that attribute a statement to an unnamed “representative” on an unspecified date. See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (JPO), 2019 WL 1234567, at *3 (S.D.N.Y. Mar. 5, 2019) (dismissing fraud claim against carrier where shipper alleged only that “a salesperson” promised refrigerated service “in or around 2017”); see also Rombach v. Chang, 355 F.3d 164, 170 (2d Cir. 2004) (applying Rule 9(b) to any claim that “sounds in fraud”). But see Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6 (S.D.N.Y. Sept. 27, 2021) (sustaining fraud claim where the plaintiff identified the speaker by title and the statement by month).',
  'Corvina’s allegations fail each of these requirements. The Complaint attributes the “fully temperature-controlled fleet” statement to an unnamed “sales representative” and places it only “in early 2025.” (Compl. ¶ 9.) Like the shipper in Meridian Produce, Corvina does not say who spoke, when, or where. Meridian Produce, 2019 WL 1234567, at *3. Unlike the plaintiff in Kessler, Corvina does not even give the speaker’s title. Its allegation that Halvorsen “knew” some trailers lacked monitoring units is a bare assertion of the kind Iqbal disregards. See Iqbal, 556 U.S. at 678; Twombly, 550 U.S. at 555. And it pleads no facts suggesting the statement was false when made: a single refrigeration failure months later says nothing about the state of Halvorsen’s fleet in early 2025. Cf. Arista Records, LLC v. Doe 3, 604 F.3d 110, 120 (2d Cir. 2010) (noting that pleading on information and belief is permitted only where the facts are peculiarly within the defendant’s possession). The fraud claim should therefore be dismissed.',
].join('\n');
// An office memo with exhibits and depositions.
const RETALIATION_MEMO = [
  'Alvarez has worked as a shift lead at Brightwater’s Elmhurst distribution center since 2019. Alvarez Dep. 8:2-11. Her supervisor, Grant Hollis, repeatedly told her in front of her crew that “women don’t belong on the loading dock.” Id. at 14:3-9. On March 3, 2025, Alvarez submitted a written complaint to Brightwater’s human resources department describing Hollis’s remarks. Ex. A at 1. Hollis learned of the complaint on March 6, when the HR manager interviewed him. Hollis Dep. 22:15-23:4.',
  'On April 7, 2025, Brightwater transferred Alvarez to the overnight shift at its Joliet facility, forty miles from her home, at the same hourly rate. Ex. B at 3. Hollis recommended the transfer in an email to the regional director. Ex. D at 2. Brightwater’s operations plan, dated February 10, 2025, called for “rebalancing experienced leads across facilities,” but it did not name Alvarez or any other employee. Ex. C at 4. Alvarez, a single parent of two school-age children, told us that the overnight schedule has left her without child care. (Need to confirm with client whether she has records of the added child-care costs.)',
  'An employee’s internal complaint about conduct she reasonably believes violates Title VII is protected activity under the statute’s opposition clause. See Crawford v. Metro. Gov’t of Nashville & Davidson Cnty., 555 U.S. 271, 276 (2009). In Crawford, the Supreme Court held that an employee who described a supervisor’s harassment in answer to an internal investigator’s questions had “opposed” the practice, because to oppose means “to resist or antagonize . . . ; to contend against; to confront; resist; withstand.” Id. (quoting Webster’s New International Dictionary 1710 (2d ed. 1957)). The employee need not prove that the conduct was actually unlawful, only that she held a good-faith, reasonable belief that it was. Kwan v. Andalex Grp. LLC, 737 F.3d 834, 843 (2d Cir. 2013).',
  'An action is materially adverse if it “well might have dissuaded a reasonable worker from making or supporting a charge of discrimination.” Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 68 (2006) (internal quotation marks omitted). The standard is objective, but “context matters,” and a change that is trivial for one employee may matter greatly to another. Id. at 69. The Court gave as its example a schedule change that “may make little difference to many workers, but may matter enormously to a young mother with school-age children.” Id. In Burlington Northern itself, the Court held that reassigning a forklift operator to dirtier and more arduous track-laborer duties was materially adverse even though both jobs fell within the same job description and paid the same. Id. at 70-71.',
  'Here, Brightwater moved Alvarez from days to overnights and added a forty-mile commute. Ex. B at 3. Like the reassignment in Burlington Northern, the transfer kept her pay the same but made her job materially worse, and Alvarez is precisely the parent of school-age children that the Court described. Brightwater may argue that a lateral transfer at equal pay is not adverse. See Galabya v. N.Y.C. Bd. of Educ., 202 F.3d 636, 640 (2d Cir. 2000). But Galabya applied the stricter standard for discrimination claims, which Burlington Northern rejected for retaliation claims. 548 U.S. at 64. The transfer is therefore likely a materially adverse action.',
  'A retaliation plaintiff must ultimately prove that her protected activity was a but-for cause of the adverse action. Univ. of Tex. Sw. Med. Ctr. v. Nassar, 570 U.S. 338, 360 (2013). At the prima facie stage, however, she may show causation indirectly, by showing that the protected activity was followed closely in time by the adverse action. Gorzynski v. JetBlue Airways Corp., 596 F.3d 93, 110 (2d Cir. 2010). The Supreme Court has said that temporal proximity alone suffices only when it is “very close,” and it held that a twenty-month gap showed no causality at all. Clark Cnty. Sch. Dist. v. Breeden, 532 U.S. 268, 273-74 (2001) (per curiam). Courts in this Circuit have not drawn a bright line, but they have treated gaps of a few weeks as sufficient. See Kwan, 737 F.3d at 845 (three weeks); Gorzynski, 596 F.3d at 110. An employer that proceeds “along lines previously contemplated” before it learns of a complaint, however, offers no evidence of causality. Breeden, 532 U.S. at 272.',
  'Here, Brightwater transferred Alvarez five weeks after her complaint and about four and a half weeks after Hollis learned of it. Ex. B at 3; Hollis Dep. 22:15-23:4. That gap is close to the three weeks found sufficient in Kwan and far shorter than the twenty months rejected in Breeden. Hollis, the subject of the complaint, also recommended the transfer himself. Ex. D at 2.',
].join('\n');
// A statutory memo: codes, regulations, legislative history, articles, guidance.
const STATUTORY_MEMO = [
  'Congress added these rules of construction to reject the demanding standard of Toyota Motor Mfg., Ky., Inc. v. Williams, 534 U.S. 184, 198 (2002), which had required that an impairment limit activities “of central importance to most people’s daily lives.” See Pub. L. No. 110-325, § 2(b)(4), 122 Stat. at 3554; H.R. Rep. No. 110-730, pt. 1, at 5 (2008). The EEOC’s regulations implement that mandate: “substantially limits” is “not meant to be a demanding standard,” 29 C.F.R. § 1630.2(j)(1)(i), and an impairment need not prevent or severely restrict a major life activity to qualify, id. § 1630.2(j)(1)(ii). The regulations list impairments that will “in virtually all cases” substantially limit a major life activity, and the list is illustrative rather than exhaustive. See 29 C.F.R. § 1630.2(j)(3)(iii); 76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011). In Summers v. Altarum Institute, Corp., 740 F.3d 325, 329 (4th Cir. 2014), the Fourth Circuit held that even a temporary impairment may qualify if it is sufficiently severe, because Congress meant the amendments to make coverage easier to establish.',
  'Here, Whitcombe’s flares substantially limit the operation of her digestive and bowel functions, and her symptoms are episodic in the way § 12102(4)(D) contemplates. Like the plaintiff in Summers, she need not show a permanent limitation, and the regulations direct that mitigating measures such as her biologic medication be disregarded. 29 C.F.R. § 1630.2(j)(1)(vi). Harbor Point is therefore very likely to concede, or a court to find, that she has a disability.',
  'A reasonable accommodation may include “job restructuring, part-time or modified work schedules,” and similar measures. 42 U.S.C. § 12111(9)(B). The employer must engage in an “informal, interactive process” with the employee to identify an effective accommodation. 29 C.F.R. § 1630.2(o)(3); see also 29 C.F.R. pt. 1630, app. § 1630.9. The EEOC’s guidance treats telework as a form of reasonable accommodation where the essential functions can be performed at home. EEOC, Enforcement Guidance: Reasonable Accommodation and Undue Hardship Under the Americans with Disabilities Act, Question 34 (Oct. 17, 2002). Courts have disagreed, however, about how much weight an employer’s judgment about in-person attendance deserves. In EEOC v. Ford Motor Co., 782 F.3d 753, 762–63 (6th Cir. 2015) (en banc), the Sixth Circuit held that regular in-person attendance was an essential function of a resale buyer’s job, deferring to the employer’s judgment that the role required face-to-face collaboration. Id. at 762. The Supreme Court has explained that an accommodation is reasonable if it “seems reasonable on its face, i.e., ordinarily or in the run of cases.” US Airways, Inc. v. Barnett, 535 U.S. 391, 401–02 (2002). Commentators have argued that post-pandemic experience undercuts employer claims that physical presence is essential. Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1, 15 (1987); see also 1 Barbara T. Lindemann et al., Employment Discrimination Law § 13.03 (5th ed. 2012).',
  'Here, Harbor Point’s denial rests on the same kind of judgment the employer asserted in Ford Motor, but the record is different. Unlike the employer there, Harbor Point allowed every dispatcher to work remotely for more than two years, and its on-time rate improved. Ex. B at 2. That history is relevant evidence that in-office presence is not essential, see Fed. R. Evid. 401, and it suggests the request is reasonable “in the run of cases.” Barnett, 535 U.S. at 401. Harbor Point might argue that real-time coordination with drivers requires a dispatcher on the floor. However, its two-line denial reflects no interactive process at all, which weakens any claim of undue hardship under the statutory factors:',
  'California’s Fair Employment and Housing Act makes it unlawful to fail to make reasonable accommodation for a known disability and, separately, to fail to engage in the interactive process. Cal. Gov’t Code § 12940(m), (n). FEHA defines physical disability more broadly than the ADA, requiring only that the condition “limit” a major life activity. Id. § 12926(m)(1)(B); see Cal. Gov’t Code § 12926.1(c). Commentators read that choice as a deliberate rejection of federal narrowing. Roe, supra note 4, at 22; Lindemann et al., supra note 6, § 13.03. The New York State Human Rights Law likewise bars disability discrimination, N.Y. Exec. Law § 296(1)(a), and defines disability more broadly, id. § 292(21). New York’s highest court has held that an employer must engage in a good-faith interactive process before denying an accommodation. Jacobsen v. N.Y.C. Health & Hosps. Corp., 22 N.Y.3d 824, 835 (2014). But the NYSHRL protects a nonresident only when the challenged conduct has an impact within New York. Hoffman v. Parade Publ’ns, 15 N.Y.3d 285, 289 (2010). Because Whitcombe works in Oakland, a court would likely apply FEHA rather than the NYSHRL, and FEHA’s separate interactive-process claim strengthens her position.',
].join('\n');
// A client email with a contract excerpt: a few citations, the rest prose and contract terms.
const EMAIL = [
  'Kestrel Analytics: Bluefin Termination Questions',
  'Privileged & Confidential | Attorney-Client Communication',
  'Email to Dana Okafor, General Counsel',
  'Dana,',
  'Thanks for sending over the Bluefin Master Services Agreement and last quarter’s invoices. You asked two questions: whether Kestrel can walk away from the contract before the term ends, and whether Bluefin can actually collect the $180,000 early termination fee if you do. The short answer is yes to the first and probably not to the full amount on the second, although the arbitration clause means a judge is unlikely to be the one who decides.',
  'Here is the background as I understand it. Kestrel signed the MSA on March 3, 2023, for a three-year term, and the platform has been down for more than 40 hours since June. Bluefin has issued service credits for some of those outages but not all of them. Your team has kept a log of each incident, which will matter a great deal.',
  'Start with termination. Section 4.2(b) lets Kestrel terminate “for convenience upon sixty (60) days’ prior written notice to Provider,” so you can leave without proving anything. Separately, § 4.3 allows termination for cause if Bluefin fails to cure a material breach within thirty days of notice. If the outage log shows Bluefin missed the uptime commitment in § 6.1 in three consecutive months, I think an arbitrator would very likely treat that as a material breach, and terminating for cause would avoid the fee entirely.',
  'The fee is the harder question. In California, a liquidated damages clause in a commercial contract is valid unless the party challenging it shows that it “was unreasonable under the circumstances existing at the time the contract was made.” Cal. Civ. Code § 1671(b). The California Supreme Court has held that an amount bearing no reasonable relationship to the range of actual damages the parties could have anticipated operates as a penalty and is unenforceable. Ridgley v. Topa Thrift & Loan Ass’n, 17 Cal. 4th 970, 977 (1998). Here, the fee equals every remaining monthly payment through the end of the term, with no discount for the costs Bluefin will no longer incur. That looks much more like a penalty than an estimate, and I would expect an arbitrator to cut it down, probably to Bluefin’s lost profit on the remaining months.',
  'One caution on forum. Section 12.2 sends any dispute to JAMS arbitration in San Francisco, and federal law requires courts to enforce arbitration agreements according to their terms. 9 U.S.C. § 2; AT&T Mobility LLC v. Concepcion, 563 U.S. 333, 344 (2011). Because the clause also delegates questions of arbitrability to the arbitrator, a court would likely send even a challenge to the clause itself to JAMS. See Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019); Rent-A-Center, W., Inc. v. Jackson, 561 U.S. 63, 68–70 (2010). That is not bad news for Kestrel, but it does mean the fee fight would be private and fairly quick, with limited appeal rights.',
  'As I see it, you have three realistic options:',
  'Terminate for convenience under Section 4.2(b), give sixty days’ notice, and contest the fee in arbitration if Bluefin invoices it.',
  'Send a notice of material breach under § 4.3, wait out the thirty-day cure period, and terminate for cause if the outages continue (i.e., if Bluefin does not cure).',
  'Use the breach notice as leverage to negotiate a mutual exit, e.g., a waiver of the fee in exchange for a release of Kestrel’s service-credit claims.',
  'My recommendation is the second option, with the third as the likely outcome. Bluefin’s counsel will see the same weaknesses in the fee that we do, and a negotiated exit avoids JAMS filing fees altogether. Please confirm with your operations team that the outage log matches Bluefin’s status page before we send anything.',
  'Best regards, Morgan Ellery',
  'Excerpt: Master Services Agreement',
  'This Master Services Agreement (this “Agreement”) is entered into as of March 3, 2023 (the “Effective Date”), by and between Bluefin Data Systems LLC, a Delaware limited liability company (“Provider”), and Kestrel Analytics, Inc., a California corporation (“Customer”).',
  '4. Term and Termination',
  '4.1 Term. This Agreement commences on the Effective Date and continues for thirty-six (36) months (the “Initial Term”), unless terminated earlier in accordance with this Section 4. Capitalized terms used but not defined in this Section 4 have the meanings given in § 1.',
  '4.2 Termination for Convenience. (a) Provider may not terminate this Agreement for convenience. (b) Customer may terminate this Agreement for convenience upon sixty (60) days’ prior written notice to Provider, subject to payment of the Early Termination Fee described in § 7.4.',
  '4.3 Termination for Cause. Either party may terminate this Agreement upon written notice if the other party materially breaches this Agreement and fails to cure such breach within thirty (30) days after receipt of notice thereof. For purposes of this Section 4.3, Provider’s failure to meet the Availability Commitment in any three (3) consecutive calendar months constitutes a material breach.',
  '4.4 Effect of Termination. Upon any termination, (i) Customer shall pay all undisputed Fees accrued through the effective date of termination, (ii) Provider shall return or destroy Customer Data in accordance with Section 9.3, and (iii) Sections 7, 9, 11 and 12 shall survive.',
  '6. Service Levels',
  '6.1 Availability. Provider shall make the Platform available at least 99.9% of the time in each calendar month, excluding Scheduled Maintenance (the “Availability Commitment”). “Scheduled Maintenance” means maintenance of which Provider gives at least forty-eight (48) hours’ notice and that occurs between 10:00 p.m. and 4:00 a.m. U.S. Pacific Time. Provider’s sole obligation for any failure to meet the Availability Commitment, other than as provided in Section 4.3, is to issue the service credits set forth in Exhibit B.',
  '7. Fees',
  '7.1 Fees. Customer shall pay the fees set forth in each Order Form, including Order Form No. 2023-014 (collectively, the “Fees”), in U.S. dollars within thirty (30) days after the invoice date. Late payments bear interest at the lesser of 1.0% per month and the maximum rate permitted by applicable law.',
  '7.4 Early Termination Fee. If Customer terminates this Agreement under Section 4.2(b), Customer shall pay Provider, as liquidated damages and not as a penalty, an amount equal to the Fees that would have become payable for the remainder of the Initial Term (the “Early Termination Fee”). The parties agree that Provider’s damages from an early termination would be difficult to determine (i.e., because Provider’s infrastructure costs are fixed for the Initial Term) and that the Early Termination Fee is a reasonable estimate of them. No Early Termination Fee is payable upon a termination under § 4.3.',
  '12. Governing Law; Dispute Resolution',
  '12.1 Governing Law. This Agreement is governed by the laws of the State of California, without regard to its conflict-of-laws rules.',
  '12.2 Arbitration. Any dispute arising out of or relating to this Agreement, including any question regarding its existence, validity, scope or arbitrability, shall be resolved by binding arbitration administered by JAMS in San Francisco, California, under its Comprehensive Arbitration Rules & Procedures. This Section 12.2 is governed by the Federal Arbitration Act, 9 U.S.C. § 1 et seq. Nothing in this § 12 prevents either party from seeking temporary injunctive relief from a court of competent jurisdiction (e.g., to protect its Confidential Information under Section 10.1).',
].join('\n');
// A magazine article: dialogue, a recipe, sports, and English and Canadian law.
const ARTICLE = [
  'The Sourdough Professor of St. Louis',
  'Dr. Ingrid Halvorsen at her bench on Cherokee St., 6:15 a.m.\nPhotograph by T. J. Okafor for Crumb Quarterly, Vol. 3, No. 2',
  'An Early Start',
  'At 5:40 a.m. on a Tuesday in March, Dr. Ingrid Halvorsen is already elbow-deep in rye. She earned her Ph.D. in chemistry at Washington University in St. Louis, spent nine years at a U.S. Department of Agriculture lab, and quit in 2019 to open a twelve-seat bakery called Halvorsen & Daughters. "People think it\'s romantic," she says. "It\'s mostly dishes." Her partner, Mr. Desmond Achterberg, handles the books; i.e., he is the one who noticed that the bakery\'s margins grew by 3.5 percent last year while flour prices rose. Achterberg grew up outside the U.S. He moved to Missouri at nineteen.',
  'The shop sits between a tattoo parlor and a church that still lists its Mass times as 7 a.m. and 9:30 a.m. on a hand-painted sign. It opens at 7 a.m. The line starts earlier. Regulars include a retired umpire, a nurse from St. Mary\'s, and Jonah Pruitt, who wore No. 5 for the minor-league River Otters and still orders a cardamom bun every morning at 7:15. "I\'ve had the No. 5 bun for six years," Pruitt told me. "Don\'t put that in the magazine." (I did.) "Is it ready yet?" a customer calls through the door at 6:58. Nobody answers.',
  'Halvorsen\'s approach is unapologetically empirical. She logs every bake in a spreadsheet she calls "Vol. 3" because the first two volumes, kept in notebooks, were lost in a 2021 basement flood. The current file runs to roughly 14,000 rows. She tracks hydration (e.g., 78 percent for the house loaf), ambient temperature, and the age of the starter, which she named Gus after her late uncle, Gustav Halvorsen Jr. When I ask whether all of this is overkill, she shrugs. "Is it? Ask me again when the loaf fails."',
  'Version 2.0',
  'The bakery\'s ordering app, now on version 2.0, was built by her nephew over a winter break. It crashed twice during the Cardinals v. Cubs home opener, when what felt like half of the U.S. Midwest wanted a pretzel. Achterberg says the update cut errors by roughly 40 percent. "The first version was a disaster. This one is merely bad." He laughs, then checks the order queue again. A 2023 profile on p. 14 of the Post-Dispatch food section called the app "charmingly broken."',
  'Not everything is data. Halvorsen keeps a framed letter from a customer in St. Paul, Minn., who drove six hours for a loaf in 2022. She also keeps, in a drawer, a cease-and-desist letter from a London firm, which is where this story takes an unexpected turn.',
  'The Recipe',
  'Halvorsen agreed to share a simplified version of the house cardamom bun. It makes about twelve buns.',
  '500 g (approx. 4 cups) bread flour, plus extra for dusting.',
  '1 tbsp. ground cardamom, freshly ground if possible.',
  '2 1/4 tsp. instant yeast and 75 g sugar.',
  '300 ml whole milk, warmed to about 37 °C (i.e., body temperature).',
  'Knead for 10 min. Rest the dough for 1 hr. at room temperature.',
  'Bake at 200 °C for 12–15 min. until deep golden.',
  '"Don\'t skimp on the cardamom," she warns. "The U.S. stuff in jars is mostly dust."',
  'A Brief Detour into Law',
  'The London letter came from solicitors for Halvorsen Bakeries Ltd., an unrelated English company that claims the family name as a trade mark. Halvorsen\'s lawyer, Priya Ramaswamy of Ramaswamy Legal LLC, was unimpressed. English courts protect an unregistered name through the tort of passing off, which requires goodwill, a misrepresentation, and damage. See Reckitt & Colman Products Ltd v Borden Inc [1990] 1 WLR 491 (HL) at 499. The UK Supreme Court has since held that the goodwill must be among customers in the jurisdiction, not merely a reputation there. Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47]. The letter leaned instead on [2019] UKSC 5 at [41] and on R v Smith [2004] EWCA Crim 631, a criminal appeal Ramaswamy called "beside the point."',
  'Here, Ramaswamy says, the English company is unlikely to succeed, because Halvorsen sells nothing in England and has no plans to. A Canadian claim would run under the Trademarks Act, RSC 1985, c T-13, s 19, and an appeal from the registrar would get the reasonableness review described in Canada (Minister of Citizenship and Immigration) v Vavilov, 2019 SCC 65 at para 23. In the U.S., the closest analogue is the Lanham Act, 15 U.S.C. § 1125(a). "They have no goodwill to protect here, and we have none there," she said. As of this writing, the firm has not replied.',
  'Last Bake',
  "By 11 a.m. the cases are nearly empty. Halvorsen wipes the bench, checks on Gus, and types the day's numbers into Vol. 3 of the spreadsheet. Tomorrow's plan is 79 percent hydration, i.e., wetter dough and a longer bake. \"If it works, that's version 2.1,\" she says. \"If it doesn't, it's a lesson.\" The pretzels, for the record, are excellent.",
].join('\n');
// The sentence of `doc` that holds `words`, as the document model splits it.
function sentenceWith(doc, words) {
  for (const paragraph of doc.split('\n'))
    for (const { text } of sentencesIn(paragraph, 'en')) if (text.includes(words)) return text;
  throw new Error(`no sentence holds ${words}`);
}
// guardReplacement of the sentence of `doc` that holds `words`, with `from` made `to`.
function rewrite(doc, words, from, to) {
  const sentence = sentenceWith(doc, words);
  assert.ok(sentence.includes(from), `${from} is in ${sentence}`);
  return guardReplacement(doc, sentence, sentence.replace(from, to));
}
// selectionRefusal for `selected` in `doc`, at its first occurrence after `from`.
function refusal(doc, selected, from = '', rephrase = false) {
  const at = doc.indexOf(selected, doc.indexOf(from));
  assert.ok(at >= 0, `${selected} is in the document`);
  return selectionRefusal(doc.slice(0, at), selected, doc.slice(at + selected.length), rephrase);
}

test('a rewrite keeps the signal before each citation (GD-1)', () => {
  const schein = sentenceWith(EMAIL, 'See Henry Schein');
  for (const signal of ['But see Henry', 'Henry', 'Cf. Henry'])
    assert.equal(
      guardReplacement(EMAIL, schein, schein.replace('See Henry', signal)),
      'citation-changed',
      signal,
    );
  assert.equal(
    rewrite(MOTION, 'see also Rombach', 'see also Rombach', 'but see Rombach'),
    'citation-changed',
  );
  assert.equal(
    rewrite(MOTION, 'see also Rombach', '; see also Rombach', '; Rombach'),
    'citation-changed',
  );
  assert.equal(
    rewrite(MOTION, 'But see Kessler', 'But see Kessler', 'See Kessler'),
    'citation-changed',
  );
  assert.equal(rewrite(RETALIATION_MEMO, 'See Kwan', 'See Kwan', 'Kwan'), 'citation-changed');
  assert.equal(rewrite(RETALIATION_MEMO, 'See Kwan', 'See Kwan', 'Cf. Kwan'), 'citation-changed');
  assert.equal(
    rewrite(CSM_BRIEF, 'See, e.g., Hatfield', '(See, e.g., Hatfield', '(Hatfield'),
    'citation-changed',
  );
  assert.equal(
    rewrite(STATUTORY_MEMO, 'See Pub. L.', 'See Pub. L.', 'Pub. L.'),
    'citation-changed',
  );
  assert.equal(rewrite(ARTICLE, 'See Reckitt', 'See Reckitt', 'Reckitt'), 'citation-changed');
  // The prose around the signals may change, and the case of a signal may follow its place.
  assert.equal(
    rewrite(EMAIL, 'See Henry Schein', 'a court would likely send', 'a court would probably send'),
    null,
  );
  assert.equal(
    rewrite(
      CSM_BRIEF,
      'See, e.g., Hatfield',
      'Courts have applied the same rule to grocery spills.',
      'Courts apply this rule to grocery spills too.',
    ),
    null,
  );
  // The signal is part of the citation's protected text, and of what an insertion copies.
  const spans = protectedSpans(schein).filter(([, , type]) => type === 'citation');
  assert.match(schein.slice(spans[0][0], spans[0][1]), /^See Henry Schein, Inc\. v\. /);
  assert.equal(guardInsertion(RETALIATION_MEMO, ' See Kwan, 737 F.3d at 845 (three weeks).'), null);
  assert.equal(
    guardInsertion(RETALIATION_MEMO, ' But see Kwan, 737 F.3d at 845 (three weeks).'),
    'new-citation',
  );
});

test('a rewrite relies on the same cases, named in the same words (GD-2)', () => {
  const like = sentenceWith(RETALIATION_MEMO, 'Like the reassignment in Burlington Northern');
  for (const other of ['Galabya', 'White', 'Burlington'])
    assert.equal(
      guardReplacement(RETALIATION_MEMO, like, like.replace('Burlington Northern', other)),
      'citation-changed',
      other,
    );
  assert.equal(
    rewrite(
      RETALIATION_MEMO,
      'That gap is close',
      ' found sufficient in Kwan',
      ' found sufficient',
    ),
    'citation-changed',
  );
  assert.equal(
    rewrite(
      MOTION,
      'Like the shipper in Meridian Produce',
      'shipper in Meridian Produce',
      'shipper in Kessler',
    ),
    'citation-changed',
  );
  assert.equal(
    guardReplacement(
      RETALIATION_MEMO,
      like,
      like.replace('kept her pay the same', 'left her pay unchanged'),
    ),
    null,
  );
  // A selection of a multi-word name, far from its citation, is a name.
  assert.equal(
    refusal(RETALIATION_MEMO, 'Burlington Northern', 'In Burlington Northern itself', true),
    'Case names keep their exact words.',
  );
  assert.equal(
    refusal(STATUTORY_MEMO, 'Ford Motor', 'employer asserted in', true),
    'Case names keep their exact words.',
  );
});

test('a rewrite may not change a number or a date (GD-3)', () => {
  assert.equal(
    rewrite(
      EMAIL,
      'Customer may terminate this Agreement for convenience upon sixty',
      'sixty (60)',
      'thirty (30)',
    ),
    'new-number',
  );
  assert.equal(
    rewrite(EMAIL, 'Kestrel signed the MSA', 'March 3, 2023', 'March 13, 2023'),
    'new-number',
  );
  assert.equal(rewrite(EMAIL, 'Kestrel signed the MSA', '40 hours', '400 hours'), 'new-number');
  assert.equal(rewrite(RETALIATION_MEMO, 'On April 7, 2025', 'April 7', 'April 9'), 'new-number');
  assert.equal(
    rewrite(ARTICLE, 'margins grew by 3.5 percent', '3.5 percent', '35 percent'),
    'new-number',
  );
  // Numbers may move between words and digits, and the prose around them may change.
  assert.equal(
    rewrite(EMAIL, 'Kestrel signed the MSA', 'for a three-year term', 'for a term of three years'),
    null,
  );
  assert.equal(
    rewrite(
      EMAIL,
      'Customer may terminate this Agreement for convenience upon sixty',
      'sixty (60) days’',
      '60 days’',
    ),
    null,
  );
  assert.equal(
    rewrite(ARTICLE, 'margins grew by 3.5 percent', 'he is the one who noticed', 'he noticed'),
    null,
  );
  assert.equal(
    guardMessage('new-number', 'The rewrite'),
    'The rewrite changed a number or date, so it was not used.',
  );
});

test('every kind of citation comes through a rewrite word for word (GD-4)', () => {
  for (const [doc, words, from, to] of [
    // California style: supra and id. pins, years, codes, subdivisions and the record.
    [CSM_BRIEF, 'To hold an owner liable', '1206', '1207'],
    [CSM_BRIEF, 'To hold an owner liable', '26 Cal.4th', '27 Cal.4th'],
    [CSM_BRIEF, 'To hold an owner liable', ', 26 Cal.4th at p. 1206', ''],
    [CSM_BRIEF, 'by showing that the site had not been inspected', '1210', '1211'],
    [CSM_BRIEF, 'A store owner must use ordinary care', '(2001)', '(2002)'],
    [CSM_BRIEF, 'A store owner must use ordinary care', 'Civ. Code', 'Gov. Code'],
    [CSM_BRIEF, 'A store owner must use ordinary care', 'subd. (a)', 'subd. (b)'],
    [CSM_BRIEF, 'The log for February 2', '2 CT 362', '2 CT 326'],
    [CSM_BRIEF, 'The log for February 2', ' (2 CT 362; RT 9:14-18.)', ''],
    [CSM_BRIEF, 'question of fact for the jury', ', internal quotation marks omitted', ''],
    [CSM_BRIEF, 'probably just didn’t get done', '44:3-19', '44:3-20'],
    [BLUEBOOK_BRIEF, 'question of fact for the jury', ' (internal quotation marks omitted)', ''],
    // Federal: Westlaw and docket cites, parentheticals, parallels, the record.
    [MOTION, 'See Meridian Produce Co.', 'at *3', 'at *5'],
    [MOTION, 'See Meridian Produce Co.', '(S.D.N.Y. Mar. 5, 2019)', '(E.D.N.Y. Mar. 5, 2018)'],
    [MOTION, 'See Meridian Produce Co.', 'dismissing fraud claim', 'sustaining fraud claim'],
    [MOTION, 'But see Kessler', 'at *6', 'at *9'],
    [MOTION, 'But see Kessler', 'Sept. 27, 2021', 'Sept. 7, 2021'],
    [MOTION, 'real-time monitoring on every trailer', '¶ 9', '¶ 19'],
    [MOTION, 'lost refrigeration near Hartford', '21–23', '21–29'],
    [MOTION, 'Ashcroft v. Iqbal', ' (citation omitted)', ''],
    [MOTION, 'Bell Atl. Corp. v. Twombly', '544, 570', '544, 556'],
    [MOTION, 'Bell Atl. Corp. v. Twombly', '127 S. Ct. 1955, ', ''],
    [MOTION, 'Agreement §§ 4.2, 9.1', '9.1', '9.2'],
    [MOTION, 'Decl. of Tomas Reyes', 'ECF No. 12', 'ECF No. 13'],
    [MOTION, 'Decl. of Tomas Reyes', 'Ex. A', 'Ex. B'],
    // A memo's exhibits, depositions and parentheticals.
    [RETALIATION_MEMO, 'On April 7, 2025', 'Ex. B at 3', 'Ex. B at 4'],
    [RETALIATION_MEMO, 'On April 7, 2025', 'Ex. B at 3', 'Ex. C at 3'],
    [RETALIATION_MEMO, 'On April 7, 2025', ' Ex. B at 3.', ''],
    [RETALIATION_MEMO, 'Hollis learned of the complaint', '22:15-23:4', '22:15-24:4'],
    [RETALIATION_MEMO, 'See Kwan', '(three weeks)', '(five weeks)'],
    [RETALIATION_MEMO, 'twenty-month gap', ' (per curiam)', ''],
    [RETALIATION_MEMO, 'In Crawford, the Supreme Court held', '(2d ed. 1957)', '(3d ed. 1961)'],
    // Statutes, regulations, legislative history, articles, treatises and guidance.
    [STATUTORY_MEMO, 'California’s Fair Employment', '(m), (n)', '(m), (o)'],
    [STATUTORY_MEMO, 'California’s Fair Employment', '(m), (n)', '(m)'],
    [STATUTORY_MEMO, 'The regulations list impairments', '16,981', '16,982'],
    [STATUTORY_MEMO, 'The regulations list impairments', 'Mar. 25, 2011', 'Mar. 26, 2011'],
    [STATUTORY_MEMO, 'Congress added these rules', 'at 5 (2008)', 'at 6 (2008)'],
    [STATUTORY_MEMO, 'Congress added these rules', 'pt. 1', 'pt. 2'],
    [STATUTORY_MEMO, 'Congress added these rules', 'Stat. at 3554', 'Stat. at 3555'],
    [STATUTORY_MEMO, 'Commentators have argued', '(5th ed. 2012)', '(6th ed. 2016)'],
    [STATUTORY_MEMO, 'Commentators have argued', 'Rethinking Essential', 'Reconsidering Essential'],
    [STATUTORY_MEMO, 'The EEOC’s guidance treats telework', 'Question 34', 'Question 35'],
    [STATUTORY_MEMO, 'The EEOC’s guidance treats telework', ' EEOC, Enforcement', ' Enforcement'],
    [STATUTORY_MEMO, 'Commentators read that choice', 'note 4', 'note 5'],
    [
      STATUTORY_MEMO,
      'Commentators read that choice',
      '; Lindemann et al., supra note 6, § 13.03',
      '',
    ],
    // English and Canadian citations.
    [ARTICLE, 'Starbucks (HK)', '[47]', '[52]'],
    [ARTICLE, 'Starbucks (HK)', '[2015] UKSC 31', '[2016] UKSC 13'],
    [ARTICLE, 'See Reckitt', '499', '501'],
    [ARTICLE, 'Vavilov', 'para 23', 'para 32'],
    [ARTICLE, 'R v Smith', '[2004]', '[2005]'],
    [
      ARTICLE,
      'Vavilov',
      ' in Canada (Minister of Citizenship and Immigration) v Vavilov, 2019 SCC 65 at para 23',
      '',
    ],
    [ARTICLE, 'Trademarks Act', 's 19', 's 20'],
    // A contract's own sections.
    [EMAIL, 'Section 4.2(b) lets Kestrel', 'Section 4.2(b)', 'Section 4.3(b)'],
    [EMAIL, 'Separately, § 4.3', '§ 4.3', '§ 4.4'],
  ])
    assert.ok(rewrite(doc, words, from, to), `${from} → ${to}`);
  // A citation sentence the rewrite drops, or one it adds.
  const guidance = sentenceWith(STATUTORY_MEMO, 'The EEOC’s guidance treats telework');
  assert.ok(
    guardReplacement(STATUTORY_MEMO, guidance, guidance.replace(/ EEOC, Enforcement.*$/, '')),
  );
  const goodwill = sentenceWith(ARTICLE, 'English courts protect');
  assert.equal(
    guardReplacement(
      ARTICLE,
      goodwill,
      `${goodwill} See Ivey v Genting Casinos (UK) Ltd [2017] UKSC 67 at [74].`,
    ),
    'new-citation',
  );
  // A citation the parser does not read keeps its date, and with it the citation: a rewrite
  // may not drop it or change it.
  for (const cite of [
    'Fed. Trade Comm’n, Policy Statement on Deception (Oct. 14, 1983).',
    'Model Rules of Pro. Conduct r. 1.7 cmt. 2 (Am. Bar Ass’n 2020).',
    'Letter from Jane Roe to John Doe (Mar. 3, 2023).',
  ]) {
    const passage = `The agency treats it as deceptive. ${cite}`;
    assert.equal(
      guardReplacement(passage, passage, 'The agency treats it as deceptive.'),
      'citation-changed',
      cite,
    );
    assert.ok(guardReplacement(passage, passage, passage.replace(/\d{4}\)/, '2021)')), cite);
    // Nor may an insertion bring one in.
    assert.equal(guardInsertion(STATUTORY_MEMO, ` ${cite}`), 'new-citation', cite);
    assert.equal(guardInsertion(passage, ` ${cite}`), null, cite);
  }
  const telework = sentenceWith(STATUTORY_MEMO, 'Courts have disagreed, however');
  assert.equal(
    guardReplacement(
      STATUTORY_MEMO,
      telework,
      `${telework} EEOC, Enforcement Guidance: Reasonable Accommodation and Undue Hardship Under the Americans with Disabilities Act, Question 35 (Oct. 17, 2002).`,
    ),
    'new-citation',
  );
  // Faithful rewordings pass.
  assert.equal(
    rewrite(
      STATUTORY_MEMO,
      'California’s Fair Employment',
      'makes it unlawful to fail',
      'bars failing',
    ),
    null,
  );
  assert.equal(
    rewrite(
      CSM_BRIEF,
      'probably just didn’t get done',
      'because the store was short-staffed',
      'because the store lacked staff',
    ),
    null,
  );
  assert.equal(
    rewrite(
      MOTION,
      'See Meridian Produce Co.',
      'Courts in this District routinely dismiss',
      'Courts here often dismiss',
    ),
    null,
  );
});

test('a selection takes every kind of citation whole or leaves it alone (GD-4)', () => {
  for (const [doc, selected, from] of [
    [CSM_BRIEF, 'Ortega v. Kmart Corp.', ''],
    [CSM_BRIEF, 'Kmart Corp. (2001)', ''],
    [CSM_BRIEF, '26 Cal.4th at p. 1206', 'To hold an owner'],
    [CSM_BRIEF, 'at p. 1210', 'by showing that the site'],
    [CSM_BRIEF, 'Civ. Code', ''],
    [CSM_BRIEF, 'CT 371 [Ostrander depo.', ''],
    [MOTION, 'at *3 (S.D.N.Y. Mar. 5, 2019)', ''],
    [MOTION, 'dismissing fraud claim against carrier', ''],
    [MOTION, 'Kessler v. Northgate Cold Storage', ''],
    [MOTION, 'spoiled. (Id. ¶¶ 21', ''],
    [RETALIATION_MEMO, 'Ex. B at', ''],
    [RETALIATION_MEMO, 'Dep. 22:15', ''],
    [STATUTORY_MEMO, '16,981 (Mar. 25, 2011)', ''],
    [STATUTORY_MEMO, 'pt. 1, at 5 (2008)', ''],
    [STATUTORY_MEMO, '122 Stat. at 3554', ''],
    [STATUTORY_MEMO, 'Reasonable Accommodation and Undue Hardship', 'EEOC, Enforcement'],
    [STATUTORY_MEMO, 'Jane Roe, Rethinking Essential Functions', ''],
    [STATUTORY_MEMO, '(5th ed. 2012)', ''],
    [STATUTORY_MEMO, 'Lindemann et al., supra note 6', ''],
    [STATUTORY_MEMO, ', (n)', ''],
    [ARTICLE, 'plc [2015] UKSC', ''],
    [ARTICLE, 'Vavilov, 2019 SCC', ''],
    [ARTICLE, '65 at para', ''],
    [EMAIL, 'Section 4.2(b)', 'Section 4.2(b) lets'],
    // A signal is part of its citation, and so is the date of one the parser does not read.
    [EMAIL, 'See', 'to JAMS. See Henry'],
    [MOTION, 'But see', ''],
    [`${EMAIL}\nFed. Trade Comm’n, Policy Statement on Deception (Oct. 14, 1983).`, 'Oct. 14', ''],
  ])
    assert.ok(refusal(doc, selected, from), selected);
  for (const [doc, selected] of [
    [MOTION, 'The Complaint does not name the representative'],
    [RETALIATION_MEMO, 'made her job materially worse'],
    [STATUTORY_MEMO, 'Harbor Point might argue that real-time coordination'],
    [EMAIL, 'Thanks for sending over the Bluefin Master Services Agreement'],
    [EMAIL, 'available at least 99.9% of the time'],
    [ARTICLE, 'Achterberg grew up outside the U.S. He moved to Missouri at nineteen.'],
    [ARTICLE, 'who wore No. 5 for the minor-league River Otters'],
    [ARTICLE, 'It crashed twice during the Cardinals v. Cubs home opener'],
  ])
    assert.equal(refusal(doc, selected), null, selected);
});

test('a holding claim is caught under the name a writer uses for the case (GD-5)', () => {
  // The names come from legal-text's referenceNames: Summers, Ford Motor, Ortega, Meridian
  // Produce and Kessler, but not a person who shares a case's first word (Henry Schein).
  assert.equal(
    rewrite(
      STATUTORY_MEMO,
      'Like the plaintiff in Summers',
      'Like the plaintiff in Summers, she need not show',
      'Summers held that she need not show',
    ),
    'holding-claim',
  );
  assert.equal(
    rewrite(
      STATUTORY_MEMO,
      'employer asserted in Ford Motor',
      'Here, Harbor Point’s denial rests on the same kind of judgment the employer asserted in Ford Motor',
      'Ford Motor held that such a judgment is insufficient',
    ),
    'holding-claim',
  );
  assert.equal(
    rewrite(
      CSM_BRIEF,
      'Like the store in Ortega',
      'Like the store in Ortega, FreshWay cannot',
      'As Ortega held, a store can never',
    ),
    'holding-claim',
  );
  assert.equal(
    rewrite(
      MOTION,
      'Like the shipper in Meridian Produce',
      'Like the shipper in Meridian Produce, Corvina does not',
      'As Meridian Produce held, a shipper must name the speaker, and Corvina does not',
    ),
    'holding-claim',
  );
  assert.equal(
    rewrite(
      MOTION,
      'Unlike the plaintiff in Kessler',
      'Unlike the plaintiff in Kessler, Corvina',
      'Kessler held that a title suffices, but Corvina',
    ),
    'holding-claim',
  );
  // "Henry Schein" is the case; "Henry Ortiz" is a person.
  const ortiz = 'Henry Ortiz, Kestrel’s CTO, kept the outage log.';
  assert.equal(guardReplacement(`${EMAIL}\n${ortiz}`, ortiz, ortiz.replace('kept', 'found')), null);
});

test('a known case name may follow any words in a rewrite (GD-6)', () => {
  const doc =
    'The rule is settled. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001). Smith v. Jones controls here.';
  const original = 'Smith v. Jones controls here.';
  assert.equal(
    guardReplacement(doc, original, 'Whether Smith v. Jones controls here is the question.'),
    null,
  );
  assert.equal(
    guardReplacement(doc, original, 'Once Smith v. Jones is applied, it controls here.'),
    null,
  );
  assert.equal(
    guardReplacement(doc, original, 'Whether Brown v. Board controls here is the question.'),
    'new-case-name',
  );
  const game = sentenceWith(ARTICLE, 'Cardinals v. Cubs');
  assert.equal(
    guardReplacement(
      ARTICLE,
      game,
      'During the Cardinals v. Cubs home opener it crashed twice, when what felt like half of the U.S. Midwest wanted a pretzel.',
    ),
    null,
  );
});

test('inserted words may not say what a court held (GD-7)', () => {
  const holding = ', the Supreme Court held that inspection timing is always a jury question.';
  assert.equal(guardInsertion(CSM_BRIEF, holding), 'holding-claim');
  assert.equal(guardInsertion(BLUEBOOK_BRIEF, holding), 'holding-claim');
  assert.equal(
    guardInsertion(MOTION, ' because, as the court held in Kessler, a title alone is not enough.'),
    'holding-claim',
  );
  assert.equal(
    guardDraft(MOTION, 'Kessler held that a title alone is not enough.'),
    'holding-claim',
  );
  assert.equal(
    guardDraft(MOTION, 'The Second Circuit found such claims duplicative.'),
    'holding-claim',
  );
  // Words the document already uses, and prose about other courts, may be inserted.
  assert.equal(
    guardInsertion(
      RETALIATION_MEMO,
      ' In Crawford, the Supreme Court held that an employee who described a supervisor’s harassment in answer to an internal investigator’s questions had',
    ),
    null,
  );
  assert.equal(guardInsertion(MOTION, ' and the Agreement says nothing more.'), null);
  assert.equal(guardInsertion(ARTICLE, ' The food court found itself crowded.'), null);
});

test('a record citation may not be inserted unless the document has it (GD-8)', () => {
  assert.equal(guardInsertion(CSM_BRIEF, '. (RT 44:2-9.)'), 'new-citation');
  assert.equal(guardInsertion(RETALIATION_MEMO, ' Ex. B at 4.'), 'new-citation');
  assert.equal(guardInsertion(RETALIATION_MEMO, ' Hollis Dep. 41:2-6.'), 'new-citation');
  assert.equal(guardInsertion(MOTION, ' (Compl. ¶ 22.)'), 'new-citation');
  assert.equal(guardInsertion(RETALIATION_MEMO, ' Ex. B at 3.'), null);
  // Autocomplete cuts them before they are offered.
  const before =
    'Here, Brightwater moved Alvarez from days to overnights and added a forty-mile commute.';
  for (const insertion of [
    ' Ex. B at 3.',
    ' Compl. ¶ 22.',
    ' Alvarez Dep. 31:2-9.',
    ' Ex. F at 2.',
  ])
    assert.equal(cutAtCitation(before, insertion), '', insertion);
  assert.equal(cutAtCitation('The trial court did the opposite', '. (RT 44:2-9.)'), '.');
  // So is a reply that stops partway into one, before its pin.
  for (const [insertion, kept] of [
    [' (Compl.', ''],
    [' Alvarez Dep.', ''],
    [' ECF No.', ''],
    [' Dkt. No.', ''],
    [' (2 CT', ''],
    [' The move was harsh (Ex.', ' The move was harsh'],
    [' The move was harsh. Hollis Dep.', ' The move was harsh.'],
  ])
    assert.equal(cutAtCitation(before, insertion), kept, insertion);
});

test('autocomplete is cut before citations in every form, leaving no fragment (GD-9, GD-11)', () => {
  for (const [before, insertion, kept] of [
    [
      'Rulings on evidentiary objections are',
      ' reviewed for abuse of discretion. (Evid. Code, § 352.)',
      ' reviewed for abuse of discretion.',
    ],
    [
      'Summary judgment is proper',
      ' only if no issue is triable. (Code Civ. Proc., § 437c, subd. (c).)',
      ' only if no issue is triable.',
    ],
    ['The statement was vague', ' (Compl. ¶ 9) or the date was missing.', ''],
    ['The declaration was filed as', ' ECF No. 12, as Exhibit A.', ''],
    [
      'Congress said so',
      ', as the House Report explains, H.R. Rep. No. 110-730, at 6.',
      ', as the House Report explains',
    ],
    ['The duty is', ' set out in Cal. Gov’t Code § 12940(m).', ' set out in'],
    [
      'Its assistant manager admitted',
      ' the sweep was skipped. (2 CT 371.)',
      ' the sweep was skipped.',
    ],
    ['Hollis knew', '. Hollis Dep. 22:15-23:4.', '.'],
    ['The record shows it', '. R. at 12.', '.'],
    [
      'Goodwill must be local.',
      ' Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47].',
      '',
    ],
    [
      'Review is for reasonableness.',
      ' Canada (Minister of Citizenship and Immigration) v Vavilov, 2019 SCC 65 at para 23.',
      '',
    ],
    ['The letter relied on', ' [2019] UKSC 5 at [41].', ''],
    ['The letter cited', ' R v Smith [2004] EWCA Crim 631.', ''],
    ['It is unfair competition', ' under Cal. Bus. & Prof. Code § 17200.', ' under'],
    ['Filed in', ' Case No. 5 last year.', ''],
    // A defined term's parenthetical goes whole, not as "(the".
    [
      'Provider shall make the Platform available at least 99.9% of the time',
      ' (the “Availability Commitment”).',
      '',
    ],
  ])
    assert.equal(cutAtCitation(before, insertion), kept, insertion);
});

test('citation patterns leave ordinary prose alone (GD-10)', () => {
  for (const [before, insertion] of [
    ['Jonah Pruitt, who', ' wore No. 5 for the River Otters and still orders a bun.'],
    [
      'It crashed twice during',
      ' the Cardinals v. Cubs home opener, when half the Midwest wanted a pretzel.',
    ],
    ['It crashed twice during', ' the Cardinals v Cubs home opener.'],
    ['The shop is easy to find.', ' See Halvorsen on Saturdays for the best rye.'],
    ['The shop is easy to find.', ' See Halvorsen, who bakes the rye, on Saturdays.'],
    ['Her rye is dense.', " Compare Achterberg's sourdough, which is lighter."],
    ['Customer shall pay', ' the fees in Order Form No. 2023-014 within thirty days.'],
    ['At the wedding, the pastor', ' read from 1 Cor. 13 and wept.'],
    ['Mix', ' the flour, 2 Tbsp. sugar and the salt.'],
  ]) {
    assert.equal(cutAtCitation(before, insertion), insertion, insertion);
    assert.equal(cutAtCitation(before, insertion, ARTICLE), insertion, insertion);
  }
  // A sentence that ends before a citation keeps its last word.
  const schein =
    ' See Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019).';
  assert.equal(cutAtCitation('The dispute goes to', ` JAMS.${schein}`), ' JAMS.');
  assert.equal(cutAtCitation('The case is in', ` Texas.${schein}`), ' Texas.');
  for (const before of [
    'Jonah Pruitt, who wore No.',
    'She has visited 48 U.S. ',
    'It crashed twice during the Cardinals v.',
    '2 Tbsp.',
    'Stir in 2 Tbsp.',
    'Mix well. 2 Tbsp.',
    'See Halvorsen on',
  ])
    assert.equal(citationContext(before), null, before);
  assert.equal(
    guardInsertion(ARTICLE, ' It also crashed during the Cardinals v. Brewers game.'),
    null,
  );
  // A signal before a case, a citation or a name the document cites still begins one.
  for (const insertion of [
    ' See Lakeside, 455 F.3d at 159.',
    ' See Smith v. Jones, 1 F.3d 2.',
    ' See also Lakeside on this point.',
    ' See Halvorsen, supra, at 4.',
  ])
    assert.equal(cutAtCitation('The test.', insertion, DOC), '', insertion);
});

test('citationContext is inside a citation partway into any form of one (GD-12)', () => {
  for (const before of [
    '…correct it. (Ortega, supra, 26 Cal.4th at p.',
    '…correct it. (Ortega, supra, 26 Cal.4th at p. 1206',
    '…of time.” (Id. at p.',
    'de novo. (Aguilar v. Atlantic Richfield Co. (2001)',
    'law.” (Code Civ. Proc.,',
    'arrived.” (RT 12:',
    'fell at 3:01 p.m. (2 CT',
    'Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570, ',
    'Twombly, 550 U.S. 544, 570, 127 S. Ct. 1955, ',
    'See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (JPO), ',
    'See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (JPO), 2019 WL 1234567, ',
    'But see Kessler v. Northgate Cold Storage, LLC, ',
    'every trailer.” (Compl. ',
    'motion to dismiss under Fed. R. Civ. P. ',
    'parallel duties, Cal. Gov’t Code',
    'see Fed. R.',
    'pt. 1; H.R. Rep.',
    'Clause, U.S. Const. amend.',
    'see also 29 C.F.R. pt. 1630, app.',
    'Roe, supra note 4, at',
    'EEOC, Enforcement Guidance',
    'Thompson v. N. Am. Stainless, LP, 562 U.S. 170,',
    'the applicable statutory definition is 42 U.S. ',
    'Jane Roe, Rethinking Essential Functions, 100 Harv.',
    'unless the accommodation would impose an undue hardship. 42 U.',
    'is “not meant to be a demanding standard,” 29 C.',
    '29 C.F.R. § 1630.2(o)(3); see also 29 C.',
    'Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev.',
    // An explanatory parenthetical still open after its citation.
    'See Rombach v. Chang, 355 F.3d 164, 170 (2d Cir. 2004) (applying Rule 9(b) to ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  for (const before of [
    'safe for customers. (Civ. Code, § 1714, subd. (a).)',
    'He moved (with his family) to ',
    'She paid (in cash',
    'Kestrel signed the MSA on March 3, 2023, ',
    'The fee is $180,000, ',
  ])
    assert.equal(citationContext(before), null, before);
  // A reply that stops at a reporter's first letter is cut before its volume.
  assert.equal(
    cutAtCitation('The test.', ' It held so in Lakeside, 455 F'),
    ' It held so in Lakeside',
  );
  assert.equal(cutAtCitation('Preheat', ' the oven to 350 F'), ' the oven to 350 F');
  // What a case applied, in an unclosed parenthetical, is not autocomplete's to write.
  assert.equal(
    cutAtCitation(
      'See Rombach v. Chang, 355 F.3d 164, 170 (2d Cir. 2004) (applying Rule 9(b) to ',
      'any claim premised on a knowing misstatement',
    ),
    '',
  );
});

test('no one-character change to any citation in the other documents gets through (GD-4)', () => {
  // Every citation the parser reads, of every type, in all six documents: a changed digit
  // or letter, the citation dropped, or a selection that takes part of it is refused.
  const types = new Set();
  for (const doc of [
    CSM_BRIEF,
    BLUEBOOK_BRIEF,
    MOTION,
    RETALIATION_MEMO,
    STATUTORY_MEMO,
    EMAIL,
    ARTICLE,
  ])
    for (const paragraph of doc.split('\n')) {
      const at = doc.indexOf(paragraph);
      for (const { text: sentence } of sentencesIn(paragraph, 'en')) {
        const start = at + paragraph.indexOf(sentence);
        for (const c of findCitations(sentence).filter(c => !c.nested)) {
          types.add(c.type);
          const swap = (i, by) => sentence.slice(0, i) + by + sentence.slice(i + 1);
          const digit = c.text.search(/\d/);
          if (digit >= 0) {
            const i = c.start + digit;
            assert.ok(
              guardReplacement(doc, sentence, swap(i, String((+sentence[i] + 1) % 10))),
              c.text,
            );
          }
          const letter = c.text.search(/[A-Za-z]/);
          if (letter >= 0)
            assert.ok(guardReplacement(doc, sentence, swap(c.start + letter, '~')), c.text);
          const dropped = sentence.slice(0, c.start) + sentence.slice(c.end);
          assert.ok(guardReplacement(doc, sentence, dropped), c.text);
          const half = start + c.start + Math.ceil(c.text.length / 2);
          if (/\S\S/.test(doc.slice(half - 1, half + 1)))
            assert.ok(
              selectionRefusal(doc.slice(0, start), doc.slice(start, half), doc.slice(half), true),
              c.text,
            );
        }
      }
    }
  for (const type of [
    'full',
    'short',
    'id',
    'supra',
    'statute',
    'section',
    'internal',
    'record',
    'docket',
    'legislative',
    'secondary',
    'periodical',
  ])
    assert.ok(types.has(type), type);
});

test('a rewrite may not move a date to another month or weekday (GD-3)', () => {
  const memo = `${RETALIATION_MEMO}\nHollis called her on Monday and again in March.`;
  const call = 'Hollis called her on Monday and again in March.';
  for (const [from, to] of [
    ['on Monday', 'on Tuesday'],
    ['in March', 'in April'],
  ])
    assert.equal(guardReplacement(memo, call, call.replace(from, to)), 'new-number', to);
  assert.equal(rewrite(RETALIATION_MEMO, 'On April 7, 2025', 'April 7', 'May 7'), 'new-number');
  // An abbreviation is the same month, a weekday or month may be dropped, and "May" the
  // verb is no month.
  assert.equal(rewrite(RETALIATION_MEMO, 'On April 7, 2025', 'April 7', 'Apr. 7'), null);
  assert.equal(guardReplacement(memo, call, 'Hollis called her twice.'), null);
  assert.equal(
    rewrite(RETALIATION_MEMO, 'Brightwater may argue', 'Brightwater may argue', 'It may argue'),
    null,
  );
  // "Two hundred" may become "200", but not "300".
  const hours = 'The platform was down for two hundred hours.';
  assert.equal(guardReplacement(hours, hours, 'The platform was down for 200 hours.'), null);
  assert.equal(
    guardReplacement(hours, hours, 'The platform was down for 300 hours.'),
    'new-number',
  );
});

test('a case name may become its possessive in a rewrite (GD-2)', () => {
  const like = sentenceWith(RETALIATION_MEMO, 'Like the reassignment in Burlington Northern');
  assert.equal(
    guardReplacement(
      RETALIATION_MEMO,
      like,
      like.replace(
        'Like the reassignment in Burlington Northern',
        'Like Burlington Northern’s reassignment',
      ),
    ),
    null,
  );
  assert.equal(
    guardReplacement(
      RETALIATION_MEMO,
      like,
      like.replace('Like the reassignment in Burlington Northern', 'Like Galabya’s reassignment'),
    ),
    'citation-changed',
  );
});

test('citationContext is inside a citation before its pin, court, part or section (GD-12)', () => {
  for (const before of [
    // A citation and the word that goes on with it.
    'The rule. Id. at',
    'The rule. Id. at ',
    '…of time.” (Id. at ',
    'The transfer was lateral. Ex. A at ',
    'Like the shipper here. Meridian Produce, 2019 WL 1234567, at ',
    'See H.R. Rep. No. 110-730, pt. 1, at ',
    'Review is deferential. 2019 SCC 65 at para ',
    'Goodwill must be local. [2015] UKSC 31 at ',
    'See 9 U.S.C. § 1 et ',
    // A court or a date still open in its parenthesis.
    'See Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6 (S.D.N.Y. ',
    'Smith v. Jones, No. 1:20-cv-1234, slip op. at 3 (D. Del. Jan. ',
    'Rombach v. Chang, 355 F.3d 164, 170 (2d Cir. 20',
    'EEOC, Enforcement Guidance: Reasonable Accommodation, Question 34 (Oct. ',
    // English and Canadian citations and statutes.
    'Goodwill must be local. [2015] UKSC ',
    'See Reckitt & Colman Products Ltd v Borden Inc [1990] 1 WLR ',
    'The letter cited R v Smith [2004] EWCA Crim ',
    'The rule is old. (1854) 9 Exch ',
    'Review is deferential. Vavilov, 2019 SCC ',
    'The rule is old. Donoghue v',
    'It is an offence under the Theft Act 1968, s ',
    'A claim would run under the Trademarks Act, RSC 1985, c T-13, s ',
    // Names, codes and authors partway through.
    'To survive, Bell Atl. Corp. v. Twombly, 550 ',
    'The court applied In re ',
    'The court applied In re Marriage of ',
    'See Pub. L. No. ',
    'See Restatement (Second) of ',
    'Commentators agree. Lindemann et al., ',
    'The record shows it. R. at ',
    '…correct it. (Ortega, supra, 26 ',
    'Owners must take care. (Civ. Code, ',
    'Jurisdiction is limited. (Cal. Const., art. VI, ',
    'It protects speech. U.S. Const. amend. XIV, ',
    'It is deceptive under N.Y. Gen. Bus. Law ',
    'The motion is timely. N.Y. C.P.L.R. ',
    'Congress agreed. 154 Cong. ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  for (const before of [
    'We met at',
    'Bring the kids at ',
    'She lives near the shop (Dr. ',
    'She grew up in Missouri (St. ',
    'He studied at Harvard Law ',
    'It crashed during the Cardinals v',
    'The bakery opened in 2019, ',
    'Her uncle, Gustav Halvorsen Jr. ',
    'The meeting is on Monday at ',
  ])
    assert.equal(citationContext(before), null, before);
});

test('autocomplete leaves no author, short name or code name before a cut citation (GD-9)', () => {
  for (const [before, insertion, kept] of [
    // A signal governs the author and title that lead into its citation.
    [
      'Dismissal is common',
      ', see 5 Charles Alan Wright & Arthur R. Miller, Federal Practice and Procedure § 1357 (3d ed. 2004).',
      '',
    ],
    // The name before a citation that names no case.
    ['Review is deferential', ' under Vavilov, 2019 SCC 65 at para 23.', ' under'],
    ['Review is deferential.', ' In Vavilov, 2019 SCC 65 at para 23, the Court agreed.', ''],
    // The name of a code before its section, and an article left at the end.
    ['Owners must take care', ' under California Civil Code § 1714.', ' under'],
    ['Owners must take care', ' under the California Civil Code § 1714.', ' under'],
    ['The court', ' called it the “safe harbor.”', ' called it'],
  ])
    assert.equal(cutAtCitation(before, insertion), kept, insertion);
  // "see" as an ordinary verb stays.
  assert.equal(
    cutAtCitation('Bring', ' your appetite and see the bakery.'),
    ' your appetite and see the bakery.',
  );
});

test('autocomplete does not finish a case name being written (GD-9)', () => {
  for (const [before, insertion] of [
    ['as held in Kessler v. Northgate', ' Cold Storage, the court'],
    ['as held in Kessler v. Northga', 'te Cold Storage'],
    ['The rule comes from Smith v. Bank of', ' America'],
  ])
    assert.equal(cutAtCitation(before, insertion), '', insertion);
  // What follows a finished name, a new sentence, or a game is prose.
  for (const [before, insertion] of [
    ['Smith v. Jones', ' is the leading case.'],
    ['The rule comes from Smith v. Jones', ' and the cases after it.'],
    ['The rule is settled. Twombly.', ' The court agreed.'],
    ['It crashed during the Cardinals v. Cubs', ' Opening Day game.'],
    ['Cardinals v. Cubs', ' Opening Day game drew a crowd.'],
  ])
    assert.equal(cutAtCitation(before, insertion), insertion, insertion);
});

test('an email and a magazine article pass the guards untouched', () => {
  let checked = 0;
  for (const doc of [EMAIL, ARTICLE])
    for (const paragraph of doc.split('\n')) {
      const cites = findCitations(paragraph);
      // Autocomplete is never silenced outside a citation or a quotation.
      for (const m of paragraph.matchAll(/\S+\s*/g)) {
        const before = paragraph.slice(0, m.index + m[0].length);
        const at = before.trimEnd().length;
        if (cites.some(c => c.start < at && at <= c.end + 2)) continue;
        if (/\b(?:See|see|Cf\.)\s*$/.test(before)) continue;
        assert.notEqual(citationContext(before), 'inside-citation', before);
      }
      let from = 0;
      for (const { text: sentence } of sentencesIn(paragraph, 'en')) {
        const start = paragraph.indexOf(sentence, from);
        from = start + sentence.length;
        if (findCitations(sentence).length || /[“”"‘]/.test(sentence)) continue;
        // A continuation of the sentence from any word is offered whole.
        for (const word of sentence.matchAll(/ \S+/g)) {
          const at = start + word.index;
          const insertion = paragraph.slice(at, from);
          assert.equal(cutAtCitation(paragraph.slice(0, at), insertion, doc), insertion);
          checked++;
        }
        // The sentence may be selected, reworded, and inserted again.
        assert.equal(
          selectionRefusal(paragraph.slice(0, start), sentence, paragraph.slice(from), false),
          null,
          sentence,
        );
        const reworded = sentence.replace(/\b(?:the|a)\b/, w => (w === 'the' ? 'this' : 'one'));
        assert.equal(guardReplacement(doc, sentence, reworded), null, reworded);
        assert.equal(guardInsertion(doc, ` ${sentence}`), null, sentence);
      }
    }
  assert.ok(checked > 500);
});

// A recipe and an office email, with the numbers, abbreviations and acronyms of ordinary
// prose, for the second round of generality tests.
const RECIPE = [
  'Makes 2 loaves. Prep time: approx. 45 min.; bake time 1 hr. 10 min.',
  'Preheat the oven to 350 F. (175 C.) and grease two 9" x 5" pans. Mix 3 cups rye flour, 2 Tbsp. caraway seeds, 1 tsp. salt and 1 1/2 tsp. yeast. Knead for 8–10 min. on a floured board.',
  'At 5,000 ft. or higher, cut the yeast by 1/4 tsp. and add 2 Tbsp. more water. Serves 12. See p. 4 of the booklet for the sourdough version.',
].join('\n');
const OFFICE = [
  'Subject: Q3 planning, Room No. 12-3, Thu. Oct. 9 at 10 a.m. EST',
  'Hi Dr. Ruiz and Ms. Patel, the Q3 numbers are in: revenue rose 4.5% to $1.2M, and the APAC team closed 14 deals (vs. 9 in Q2). Our CEO, Mr. Lee, wants the deck by Fri. Oct. 3, i.e., before the board meets at 9 a.m. PT.',
  'Please send the FY2025 budget (v. 2.1) and the ISO 9001 audit notes. The U.S. Dept. of Labor visit is set for Nov. 12 at 1200 Market St., Ste. 400. Call me at ext. 4417.',
  'Our 401(k) vendor moved us to Form 5500-SF, and Title IX training is due by Dec. 1. The Section 8 housing grant (Chapter 11 of the handbook) was approved; jersey No. 23 is retired. I bought 2 GB of storage for the team.',
].join('\n');

test('an insertion may not write a number the document does not have (2a)', () => {
  const doc = 'The lease ran 24 months from 2019. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).';
  // Autocomplete, a suggested paragraph and a draft bring no number of their own.
  assert.equal(guardInsertion(doc, ' and ended in 2021.'), 'new-number');
  assert.equal(guardInsertion(doc, ' The rent was $1,850.'), 'new-number');
  assert.equal(guardInsertion(doc, ' for 24 months after 2019.'), null);
  assert.equal(guardDraft(doc, 'The tenant paid rent for 30 months.'), 'new-number');
  // A citation-shaped span the document does not have is still a new citation.
  for (const insertion of [
    ' SAC ¶ 12.',
    ' Joint Stip. ¶ 4.',
    ' 735 ILCS 5/2-619.',
    ' Pl.’s Mot. Summ. J. 5.',
    ' Sup. Ct. R. 10.',
  ])
    assert.equal(guardInsertion(doc, insertion), 'new-citation', insertion);
  // A number the insertion finishes is read with the digits at the caret: "to 20" + "24"
  // writes 2024, which the document does not have, though it has 24.
  const before = 'The lease ran 24 months, from 2019 to 20';
  assert.equal(guardInsertion(before, '24.', before.length), 'new-number');
  assert.equal(guardInsertion(before, '24.'), null);
  assert.equal(guardInsertion(`${before}. It renewed in 2024.`, '24', before.length), null);
  assert.equal(guardInsertion('Section 4', '.2 applies', 9), 'new-number');
  // Ordinary prose that copies the document's own numbers passes.
  for (const text of [RECIPE, OFFICE])
    for (const sentence of sentencesIn(text.replace(/\n/g, ' '), 'en'))
      assert.equal(guardInsertion(text, ` ${sentence.text}`), null, sentence.text);
  assert.equal(
    guardMessage('new-number', 'The suggestion', true),
    'The suggestion added a number the document does not have, so it was not used.',
  );
  assert.equal(
    guardMessage('new-number', 'The rewrite'),
    'The rewrite changed a number or date, so it was not used.',
  );
  assert.equal(
    guardMessage('new-citation', 'The draft', true),
    'The draft added a citation that is not in the document, so it was not used.',
  );
});

test('a rewrite keeps every citation-shaped run and the history after a case (2b)', () => {
  const refused = [
    // Runs the parser reads only in part: the second rule of a pair, a later subsection.
    ['Both rules apply. Fed. R. Civ. P. 12(b)(6) and 9(b).', '9(b)', '9(c)'],
    ['The rule applies. See Tex. R. Civ. P. 91a.1, 91a.3(c).', '(c)', '(d)'],
    // History the parser leaves outside the citation, with no later decision cited.
    [
      'The rule is settled. Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990), vacated as moot.',
      'vacated',
      'remanded',
    ],
    // The verifier's forms: letters are part of a citation as much as digits are.
    ['The deadline is thirty days. Fed. R. App. P. 4(a)(1)(A).', '(A)', '(B)'],
    ['The deadline is thirty days. 12 C.F.R. pt. 1026, supp. I.', 'supp. I', 'supp. II'],
    ['The claim fails. SAC ¶ 12.', 'SAC', 'FAC'],
    ['The motion was untimely. Pl.’s Mot. Summ. J. 5.', 'Pl.’s', 'Def.’s'],
    [
      'It is settled. Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990), aff’d, 500 U.S. 1 (1991).',
      'aff’d',
      'rev’d',
    ],
    [
      'It is settled. Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990), cert. denied, 500 U.S. 1 (1991).',
      'cert. denied',
      'cert. granted',
    ],
    ['The facts are agreed. Joint Stip. ¶ 4(a).', '(a)', '(b)'],
  ];
  for (const [original, from, to] of refused) {
    const rewrite = original.replace(from, to);
    // Changed, or new to the document, which is the original here.
    assert.match(
      String(guardReplacement(original, original, rewrite)),
      /^(?:citation-changed|new-citation)$/,
      rewrite,
    );
    // The prose before it may still change.
    const prose = original.replace(/^\S+/, 'Here,');
    assert.equal(guardReplacement(original, original, prose), null, prose);
  }
  // A selection takes the whole run or leaves it alone, and a merge leaves it be.
  const rules = 'Both rules apply. See Fed. R. Evid. 401, 403. The court agreed.';
  const at = rules.indexOf('403');
  assert.equal(
    selectionRefusal(rules.slice(0, at), '403', rules.slice(at + 3), true),
    'Select the whole citation or quotation, or none of it.',
  );
  assert.ok(combineRefusal('Both rules apply. Fed. R. Civ. P. 12(b)(6) and 9(b).', 'Done.'));
  // The sentence before a record citation is not part of it, nor is the next sentence of a
  // citation with no space after it.
  const facts = 'Plaintiff lives in Queens. Compl. ¶ 9. She moved to Bronx. Id. ¶ 10.';
  for (const sentence of ['Plaintiff lives in Queens.', 'She moved to Bronx.']) {
    const start = facts.indexOf(sentence);
    assert.equal(
      selectionRefusal(facts.slice(0, start), sentence, facts.slice(start + sentence.length), true),
      null,
      sentence,
    );
  }
  const family = '"Family" includes a single individual. 42 U.S.C. § 3602(c).';
  assert.equal(selectionRefusal('', family, 'The key term is “reside.”', false), null);
  assert.equal(selectionRefusal(...select(S[25].slice(0, 20)), true), null);
});

test('citationContext is inside a citation partway into any citation-shaped run (2c)', () => {
  for (const before of [
    'People v. Doe, 2020 IL ',
    'State v. Doe, 2021-Ohio-',
    'The deadline applies. (Cal. Rules of Court, rule ',
    'The order is binding. Exec. Order No. ',
    'The aisle was wet. (Ibid',
    'The aisle was wet. (Id',
    'The motion was late. (AOB ',
    'The motion was late. Pl.’s Mot. Summ. J. ',
    'He said so. Trial Tr. vol. 2, ',
    'The claim is barred. Mass. Gen. Laws ch. ',
    'The rule applies. 735 ILCS ',
    'He admitted it. Resp. to Interrog. No. ',
    'The rule is settled. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), aff’d, ',
    'Smith v. Jones, 123 F.3d 456 (2d Cir. 2001), cert. denied, ',
    'Smith v. Jones, 123 F.3d 456 (2d Cir. 2001), abrogated on other grounds by ',
    'Coverage is broad. Pub. L. No. 110-325, § 2(b)(5), 122 ',
    'See Crawford v. Metro. Gov’t of ',
    'It was retaliation. Univ. of Tex. Sw. Med. Ctr. ',
    'See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (TZW), 2019 ',
    '…matter of law.” (Code Civ. Proc., § 437c, ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  for (const before of [
    'It rained during the Yankees v.',
    'The family lives in Section ',
    'The company filed for Chapter ',
    'She wore jersey No. ',
    'He called it Rule ',
    'The visit is set with the U.S. Dept. of Labor ',
    'Appeal from the Superior Court, No. 22CECG01957, Hon. Thomas R. ',
    'I. THE FRAUDULENT INDUCEMENT CLAIM (COUNT ',
    'a link can start with `#legal` (IRAC, ',
    'The code is released under the [MIT ',
    'The motion is under Fed. R. Civ. P. 12(b)(6) and ',
    'Under 9 U.S.C. § 1 et seq. Nothing ',
    'COVID 19 ',
    'I bought 2 GB ',
    'We use ISO 9001 ',
    'In 2020 IL ',
    'She has visited 48 U.S. ',
    'The meeting is at 10 a.m. EST ',
    'Dear Dr. Ruiz and Ms. Patel ',
    'The judgment was vacated ',
    'On May 3, 2020, the order was vacated, ',
    'She moved to Idaho. (Ida',
    'We stayed in Room No. 12-',
    'It cost $45 at ',
    'Please send the FY2025 budget (v. ',
    'The team closed 14 deals (vs. ',
    'The S&P 500 closed at 5,200 and NASDAQ: AAPL ',
    'He spoke about SDG 13 and COP 28 ',
    'Mix 3 cups rye flour, 2 Tbsp.',
  ])
    assert.equal(citationContext(before), null, before);
  // Every word of the recipe and the office email leaves autocomplete free.
  for (const text of [RECIPE, OFFICE])
    for (const paragraph of text.split('\n'))
      for (const m of paragraph.matchAll(/\S+\s*/g)) {
        const before = paragraph.slice(0, m.index + m[0].length);
        // A signal waits for the word after it ("See p. 4").
        if (/\bSee\s*$/.test(before)) continue;
        assert.notEqual(citationContext(before), 'inside-citation', before);
        assert.notEqual(citationContext(before.trimEnd()), 'inside-citation', before);
      }
  // A reply that stops partway into such a run is cut before it.
  assert.equal(cutAtCitation('The motion was untimely', ' as Pl.’s Mot. Summ. J.'), ' as');
  assert.equal(cutAtCitation('The order binds', ' under Exec. Order No.'), ' under');
  // History after a case is part of its citation, so autocomplete does not write it.
  const smith = 'The rule is settled. Smith v. Jones, 123 F.3d 456 (2d Cir. 2001)';
  for (const reply of [', aff’d,', ', vacated as moot.', ', cert. denied.'])
    assert.equal(cutAtCitation(smith, reply), '', reply);
  assert.equal(cutAtCitation(smith, ', which the court followed.'), ', which the court followed.');
});

test('reference names compare in any case, and a word the document uses is not one (2d)', () => {
  // "Brown" names a case, but where it starts a sentence it may become "brown" mid-sentence.
  const brown = 'Brown v. Bd. of Educ., 347 U.S. 483 (1954). Brown paper covered the exhibits.';
  const paper = 'Brown paper covered the exhibits.';
  assert.equal(guardReplacement(brown, paper, 'The exhibits were covered in brown paper.'), null);
  // The name is still the name: dropping it, or another case's name, is a change.
  assert.equal(guardReplacement(brown, paper, 'Paper covered the exhibits.'), 'citation-changed');
  // A one-word name the document also uses in lowercase is a word there.
  const hardy =
    'Hardy v. Smith, 1 F.3d 1 (2d Cir. 1990). These plants are hardy. Hardy plants live.';
  const at = hardy.lastIndexOf('Hardy');
  assert.equal(selectionRefusal(hardy.slice(0, at), 'Hardy', hardy.slice(at + 5), true), null);
  assert.deepEqual(protectedSpans('Hardy plants are hardy.', new Map()), []);
  // The verifier's rewrites in documents citing Chevron, Bonds and Friends of the Earth.
  for (const [doc, original, rewrite] of [
    [
      'Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837 (1984).',
      'Natural gas prices rose in 2022.',
      'Prices for natural gas rose in 2022.',
    ],
    [
      'In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).',
      'Marriage is a contract under state law.',
      'Under state law, marriage is a contract.',
    ],
    [
      'Friends of the Earth, Inc. v. Laidlaw Env’t Servs., 528 U.S. 167 (2000).',
      'Friends of the plaintiff testified at trial.',
      'At trial, friends of the plaintiff testified.',
    ],
  ])
    assert.equal(guardReplacement(`${doc} ${original}`, original, rewrite), null, rewrite);
});

test('a cut stays fast before a citation that ends a long insertion', () => {
  // Each unclosed parenthesis or article left before the citation was stripped in a pass
  // over the whole insertion: half a second for 20,000 characters.
  for (const unit of ['(the ', '(A. B. ', 'the ', ', ', 'see ']) {
    const insertion = `${unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000)} 455 F.3d 154.`;
    cutAtCitation('x', insertion);
    const at = performance.now();
    cutAtCitation('x', insertion);
    assert.ok(performance.now() - at < 50, `${unit}: ${performance.now() - at} ms`);
  }
});

test('a named docket number waits for its court, and cut history leaves no word behind', () => {
  // "No. 13-114-J," after a case name: the court and date (or a database cite) come next.
  for (const before of [
    'The rule is settled. Smith v. Salvation Army, No. 13-114-J, ',
    'See Doe v. Roe, Nos. 20-1, 20-2, ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  // A finished docket citation, and a docket-shaped number in prose, are not.
  assert.equal(
    citationContext('Smith v. Salvation Army, No. 13-114-J, 2015 WL 1, at *2 (W.D. Pa. 2015). '),
    null,
  );
  assert.equal(citationContext('She wore jersey No. 23, '), null);
  // History words go with the later decision they introduce.
  for (const insertion of [
    ', aff’d, 535 U.S. 1 (2002).',
    ', cert. denied, 535 U.S. 1000 (2002).',
    ', rev’d on other grounds, 535 U.S. 1 (2002).',
    ', vacated, 535 U.S. 1 (2002).',
  ])
    assert.equal(cutAtCitation('The motion was untimely', insertion), '', insertion);
  assert.equal(
    cutAtCitation('The motion', ' was vacated, and the case went on. Smith v. Jones, 1 F.3d 1.'),
    ' was vacated, and the case went on.',
  );
});

test('California’s "Accord," is kept as written', () => {
  const doc = 'The rule is settled. (Accord, Doe v. Roe (1990) 2 Cal.4th 2, 3.)';
  assert.equal(guardReplacement(doc, doc, doc.replace('Accord, ', '')), 'citation-changed');
  assert.equal(guardReplacement(doc, doc, doc.replace('Accord, ', 'See ')), 'citation-changed');
  assert.equal(
    guardReplacement(doc, doc, doc.replace('The rule is settled.', 'The rule is clear.')),
    null,
  );
});

test('the guards stay fast on long adversarial text', () => {
  // A cut that stepped back one "v." at a time took over half a second on 20,000
  // characters; every call now takes a few milliseconds, the parser's time included.
  const doc =
    'Lakeside Village v. Smith, 455 F.3d 154, 159 (3d Cir. 2006). Lakeside held that the stay counts.';
  for (const unit of [
    'v. ',
    'Smith v. ',
    'Kessler v. Northgate Cold Storage, ',
    '(the ',
    'See Smith ',
    'Code ',
    'Compl. ',
    '455 F. ',
    'EEOC, Enforcement Guidance ',
    '2 CT ',
    '[2015] UKSC ',
    'sixty ',
    'A. ',
    'Case No. ',
    ' ',
    '(S.D.N.Y. ',
    '[2015] ',
    'Theft Act 1968, ',
    'Id. at ',
    'Kessler v. Northgate ',
    'see 5 Charles ',
    'Vavilov, ',
    'California Civil Code ',
    'January 3, ',
    'two hundred ',
    // Citation-shaped runs, history and names (2b-2d).
    'Pl.’s Mot. ',
    'SAC ¶ ',
    '2020 IL ',
    '2021-Ohio-',
    '(AOB ',
    '1990), aff’d, ',
    'cert. denied, ',
    'Mass. Gen. Laws ch. ',
    'Exec. Order No. ',
    'Bronx. Id. ',
    '(Ibid ',
    '(1st) ',
    'Joint Stip. ¶ 4 ',
    'v. Doe, 2020 ',
    'Lakeside ',
    '1,2,',
    // The third round: docket numbers, history, paragraph short forms, articles, addresses.
    'Smith v. Doe, No. 1-2, ',
    ', aff’d',
    'Jones at [',
    'Doe at para ',
    'Id. art. II, § ',
    'CA 94103, ',
    'Queens. Compl. ',
  ]) {
    const text = unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000);
    for (const [name, call, limit] of [
      ['CITATION_START', () => [...text.matchAll(CITATION_START)], 50],
      ['citationContext', () => citationContext(text), 100],
      ['cutAtCitation', () => cutAtCitation('x', text, doc), 100],
      ['cutAtCitation', () => cutAtCitation(text.slice(0, 10000), text.slice(10000), doc), 100],
      ['guardInsertion', () => guardInsertion(doc, text), 100],
      ['guardInsertion at', () => guardInsertion(text, ' 12 more', 10000), 100],
      ['guardReplacement', () => guardReplacement(`${doc}\n${text}`, doc, doc), 100],
      ['guardReplacement long', () => guardReplacement(doc, text, text), 100],
      [
        'selectionRefusal',
        () => selectionRefusal(text.slice(0, 10000), 'x', text.slice(10000)),
        100,
      ],
    ]) {
      const at = performance.now();
      call();
      assert.ok(performance.now() - at < limit, `${name} on ${unit}: ${performance.now() - at} ms`);
    }
  }
});

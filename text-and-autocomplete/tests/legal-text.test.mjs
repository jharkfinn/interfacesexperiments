import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  legalSentences,
  isCitationSentence,
  findCitations,
  resolveCitations,
  referenceNames,
  findReferences,
  quoteSpans,
  citationKey,
  unseenCitations,
} from '../dist/legal-text.js';
import { sentencesIn } from '../dist/doc-model.js';
import { memoBlocks } from './fixtures/memo.mjs';

// Sentences that trip a plain sentence splitter in legal writing:
// [text, expected sentences, options?]
const TRICKY = [
  ['Dr. Smith went home. He slept.', ['Dr. Smith went home.', 'He slept.']],
  ['The Court held so. Id. at 5.', ['The Court held so.', 'Id. at 5.']],
  ['See id.', ['See id.']],
  [
    'The court agreed. See id. The next point follows.',
    ['The court agreed.', 'See id.', 'The next point follows.'],
  ],
  [
    'The claim arises under 42 U.S.C. The statute was amended in 1988.',
    ['The claim arises under 42 U.S.C.', 'The statute was amended in 1988.'],
  ],
  [
    'See, e.g., Smith v. Jones, 1 F.3d 2 (3d Cir. 2000). It held so.',
    ['See, e.g., Smith v. Jones, 1 F.3d 2 (3d Cir. 2000).', 'It held so.'],
  ],
  [
    'Some facilities, e.g. Hotels, are excluded. Others are not.',
    ['Some facilities, e.g. Hotels, are excluded.', 'Others are not.'],
  ],
  [
    'The key term, i.e. Residence, is undefined. We look elsewhere.',
    ['The key term, i.e. Residence, is undefined.', 'We look elsewhere.'],
  ],
  [
    'The test is the threshold, i.e., whether it is a dwelling. The next part follows.',
    ['The test is the threshold, i.e., whether it is a dwelling.', 'The next part follows.'],
  ],
  [
    'Smith v. Salvation Army, No. 13-114-J, (W.D. Pa. 2015). The court agreed.',
    ['Smith v. Salvation Army, No. 13-114-J, (W.D. Pa. 2015).', 'The court agreed.'],
  ],
  [
    'United States v. Columbus Country Club, 915 F.2d 877, 881 (3d Cir. 1990). It held so.',
    ['United States v. Columbus Country Club, 915 F.2d 877, 881 (3d Cir. 1990).', 'It held so.'],
  ],
  [
    'Lakeside, 455 F.3d at 158 (quoting United States v. Columbus Country Club, 915 F.2d 877, 881 (3d Cir. 1990)). It held so.',
    [
      'Lakeside, 455 F.3d at 158 (quoting United States v. Columbus Country Club, 915 F.2d 877, 881 (3d Cir. 1990)).',
      'It held so.',
    ],
  ],
  [
    'DeFiore v. City Rescue Mission, 995 F. Supp. 2d 413 (W.D. Pa. 2013). It held so.',
    ['DeFiore v. City Rescue Mission, 995 F. Supp. 2d 413 (W.D. Pa. 2013).', 'It held so.'],
  ],
  ['DeFiore, 995 F. Supp. 2d at 418–19. Next.', ['DeFiore, 995 F. Supp. 2d at 418–19.', 'Next.']],
  [
    'Bush v. Gore, 531 U.S. 98, 121 S. Ct. 525, 148 L. Ed. 2d 388 (2000). It held so.',
    ['Bush v. Gore, 531 U.S. 98, 121 S. Ct. 525, 148 L. Ed. 2d 388 (2000).', 'It held so.'],
  ],
  ['The court sits in the W.D. Pa. It is busy.', ['The court sits in the W.D. Pa.', 'It is busy.']],
  [
    'The opinion was written by J. Smith. He wrote well.',
    ['The opinion was written by J. Smith.', 'He wrote well.'],
  ],
  ['We prefer Plan B. It is cheaper.', ['We prefer Plan B.', 'It is cheaper.']],
  ['See Exhibit A. The contract is attached.', ['See Exhibit A.', 'The contract is attached.']],
  [
    'The plaintiff sued Acme Inc. The company denied it.',
    ['The plaintiff sued Acme Inc.', 'The company denied it.'],
  ],
  [
    'The plaintiff sued Acme Corp. Smith v. Jones, 1 F.3d 2 (3d Cir. 2000), controls.',
    ['The plaintiff sued Acme Corp.', 'Smith v. Jones, 1 F.3d 2 (3d Cir. 2000), controls.'],
  ],
  [
    'Reno v. Am. Civil Liberties Union, 521 U.S. 844 (1997). Next.',
    ['Reno v. Am. Civil Liberties Union, 521 U.S. 844 (1997).', 'Next.'],
  ],
  [
    'In Am. Civil Liberties Union v. Reno, the Court struck the statute. Next.',
    ['In Am. Civil Liberties Union v. Reno, the Court struck the statute.', 'Next.'],
  ],
  [
    "Smith v. Bd. of Cnty. Comm'rs, 1 F.3d 2 (10th Cir. 1993). Next.",
    ["Smith v. Bd. of Cnty. Comm'rs, 1 F.3d 2 (10th Cir. 1993).", 'Next.'],
  ],
  [
    "Smith v. Dep't of Hous. & Urban Dev., 5 F.3d 6 (2d Cir. 1994). Next.",
    ["Smith v. Dep't of Hous. & Urban Dev., 5 F.3d 6 (2d Cir. 1994).", 'Next.'],
  ],
  [
    'Gen. Motors Corp. v. Smith, 1 F.3d 2 (6th Cir. 2000). Next.',
    ['Gen. Motors Corp. v. Smith, 1 F.3d 2 (6th Cir. 2000).', 'Next.'],
  ],
  [
    'Hovsons, Inc. v. Twp. of Brick, 89 F.3d 1096, 1102 (3d Cir. 1996). Next.',
    ['Hovsons, Inc. v. Twp. of Brick, 89 F.3d 1096, 1102 (3d Cir. 1996).', 'Next.'],
  ],
  [
    'Smith v. John Q. Public Co., 1 F.3d 2 (2000). Next.',
    ['Smith v. John Q. Public Co., 1 F.3d 2 (2000).', 'Next.'],
  ],
  [
    'The power is limited by U.S. Const. art. III, § 2. It says so.',
    ['The power is limited by U.S. Const. art. III, § 2.', 'It says so.'],
  ],
  [
    'The Act protects the . . . facility of its residential status. Next.',
    ['The Act protects the . . . facility of its residential status.', 'Next.'],
  ],
  [
    'The court said the facility . . . Residents return there. Next.',
    ['The court said the facility . . . Residents return there.', 'Next.'],
  ],
  [
    'See 42 U.S.C. § 3601 et seq. The Act is broad.',
    ['See 42 U.S.C. § 3601 et seq.', 'The Act is broad.'],
  ],
  ['Id. § 3602(c). The definition is broad.', ['Id. § 3602(c).', 'The definition is broad.']],
  ['He lives in St. Louis. It is hot.', ['He lives in St. Louis.', 'It is hot.']],
  ['He lives on Main St. It is quiet.', ['He lives on Main St.', 'It is quiet.']],
  ['The answer is No. The court disagreed.', ['The answer is No.', 'The court disagreed.']],
  [
    'Fed. R. Civ. P. 12(b)(6). The motion fails.',
    ['Fed. R. Civ. P. 12(b)(6).', 'The motion fails.'],
  ],
  [
    'Smith v. Jones, No. 2:13-cv-00114, 2015 WL 1234567, at *3 (W.D. Pa. Jan. 5, 2015). Next.',
    ['Smith v. Jones, No. 2:13-cv-00114, 2015 WL 1234567, at *3 (W.D. Pa. Jan. 5, 2015).', 'Next.'],
  ],
  [
    'They felt at home there.10 Similarly, we noted it.',
    ['They felt at home there.10', 'Similarly, we noted it.'],
  ],
  [
    'The hearing is at 9 a.m. The judge will attend.',
    ['The hearing is at 9 a.m.', 'The judge will attend.'],
  ],
  ['The hearing is at 9 a.m. on Monday. Next.', ['The hearing is at 9 a.m. on Monday.', 'Next.']],
  ['It was decided Jan. 5, 2015. Next.', ['It was decided Jan. 5, 2015.', 'Next.']],
  [
    'Doe v. Roe, 50 Mass. App. Ct. 1 (2000). Next.',
    ['Doe v. Roe, 50 Mass. App. Ct. 1 (2000).', 'Next.'],
  ],
  ['See pp. 5–6. Next.', ['See pp. 5–6.', 'Next.']],
  ['Smith et al. filed suit. They lost.', ['Smith et al. filed suit.', 'They lost.']],
  [
    'The rule differs. Cf. Smith v. Jones, 1 F.3d 2 (2000). Next.',
    ['The rule differs.', 'Cf. Smith v. Jones, 1 F.3d 2 (2000).', 'Next.'],
  ],
  [
    '“First, we decide. Second, we determine.” Lakeside, 455 F.3d at 158.',
    ['“First, we decide. Second, we determine.”', 'Lakeside, 455 F.3d at 158.'],
  ],
  [
    '“First, we decide. Second, we determine.” Lakeside, 455 F.3d at 158.',
    ['“First, we decide.', 'Second, we determine.”', 'Lakeside, 455 F.3d at 158.'],
    { keepQuotes: false },
  ],
  [
    'Id. at 575 (“The District Court began. It then addressed § 3553(a).”). Next.',
    ['Id. at 575 (“The District Court began. It then addressed § 3553(a).”).', 'Next.'],
  ],
  [
    'The case went to the U.S. Supreme Court. It lost.',
    ['The case went to the U.S. Supreme Court.', 'It lost.'],
  ],
  [
    'The firm moved to the U.S. The partners followed.',
    ['The firm moved to the U.S.', 'The partners followed.'],
  ],
  [
    "Employee's Annual Bonus shall be calculated pursuant to Sec. 4.3(c), subject to the limitations of I.R.C. § 409A(a)(2)(B)(i). The bonus is due.",
    [
      "Employee's Annual Bonus shall be calculated pursuant to Sec. 4.3(c), subject to the limitations of I.R.C. § 409A(a)(2)(B)(i).",
      'The bonus is due.',
    ],
  ],
  [
    'Restatement (Second) of Torts § 1 cmt. a (Am. L. Inst. 1965). Next.',
    ['Restatement (Second) of Torts § 1 cmt. a (Am. L. Inst. 1965).', 'Next.'],
  ],
  ['1. The first point. 2. The second point.', ['1. The first point.', '2. The second point.']],
  ['Is it a dwelling? Yes. It is.', ['Is it a dwelling?', 'Yes.', 'It is.']],
  [
    'Lakeside, 455 F.3d at 159 While 4 weeks seems short, it counts.',
    ['Lakeside, 455 F.3d at 159', 'While 4 weeks seems short, it counts.'],
  ],
  [
    'Lakeside, 455 F.3d at 159. given that it is so.',
    ['Lakeside, 455 F.3d at 159.', 'given that it is so.'],
  ],
  [
    'United States ex rel. Smith v. Jones, 1 F.3d 2 (2000). Next.',
    ['United States ex rel. Smith v. Jones, 1 F.3d 2 (2000).', 'Next.'],
  ],
  [
    'See Entick v. Carrington, 95 Eng. Rep. 807 (C.P. 1765). Next.',
    ['See Entick v. Carrington, 95 Eng. Rep. 807 (C.P. 1765).', 'Next.'],
  ],
  [
    'See 144 Cong. Rec. S3021 (1998) (statement of Sen. Leahy). Next.',
    ['See 144 Cong. Rec. S3021 (1998) (statement of Sen. Leahy).', 'Next.'],
  ],
  [
    'The defendant, Smith Bros. Co., appealed. It lost.',
    ['The defendant, Smith Bros. Co., appealed.', 'It lost.'],
  ],
  [
    'The firm is Smith Bros. The partners are brothers.',
    ['The firm is Smith Bros.', 'The partners are brothers.'],
  ],
  ['He cited 42 U.S.C.§3602. Next.', ['He cited 42 U.S.C.§3602.', 'Next.']],
  ['The tenant, Mr. Brown, left. He returned.', ['The tenant, Mr. Brown, left.', 'He returned.']],
  ['The Third Cir. Court agreed. Next.', ['The Third Cir. Court agreed.', 'Next.']],
  ['See Smith, supra, at 5. Next.', ['See Smith, supra, at 5.', 'Next.']],
  ['Id. at 5 n.3. Next.', ['Id. at 5 n.3.', 'Next.']],
  [
    'He went to Washington, D.C. The next day he left.',
    ['He went to Washington, D.C.', 'The next day he left.'],
  ],
  ['The D.C. Circuit agreed. Next.', ['The D.C. Circuit agreed.', 'Next.']],
  [
    'In N.Y. Times Co. v. Sullivan, 376 U.S. 254 (1964), the Court held so. Next.',
    ['In N.Y. Times Co. v. Sullivan, 376 U.S. 254 (1964), the Court held so.', 'Next.'],
  ],
  [
    'The U.S. Court of Appeals for the Third Circuit agreed. Next.',
    ['The U.S. Court of Appeals for the Third Circuit agreed.', 'Next.'],
  ],
  ['Plaintiff sued John Doe Jr. He lost.', ['Plaintiff sued John Doe Jr.', 'He lost.']],
  [
    'Smith v. Jones, 1 F.3d 2, 5 n.3 (3d Cir. 2000). Next.',
    ['Smith v. Jones, 1 F.3d 2, 5 n.3 (3d Cir. 2000).', 'Next.'],
  ],
  [
    'This is fine. (See the attached letter.) Next.',
    ['This is fine.', '(See the attached letter.)', 'Next.'],
  ],
  [
    'The facility (i.e., the residence) offers rooms. Next.',
    ['The facility (i.e., the residence) offers rooms.', 'Next.'],
  ],
  ['See Fed. R. Evid. 401. Next.', ['See Fed. R. Evid. 401.', 'Next.']],
  [
    'The term “U.S.” and the term “State” differ. Next.',
    ['The term “U.S.” and the term “State” differ.', 'Next.'],
  ],
  [
    'United States v. 50 Acres of Land, 469 U.S. 24 (1984). Next.',
    ['United States v. 50 Acres of Land, 469 U.S. 24 (1984).', 'Next.'],
  ],
  [
    'The firm is Smith Bros. 2019 was a good year.',
    ['The firm is Smith Bros.', '2019 was a good year.'],
  ],
  [
    'He worked at Acme Inc. (a Delaware corporation). Next.',
    ['He worked at Acme Inc. (a Delaware corporation).', 'Next.'],
  ],
  [
    'The case is on appeal to the 3d Cir. The briefs are due.',
    ['The case is on appeal to the 3d Cir.', 'The briefs are due.'],
  ],
  ['The Act applies. . . . The court agreed.', ['The Act applies. . . .', 'The court agreed.']],
  [
    'Pa. Stat. Ann. tit. 43, § 955 (West 2020). Next.',
    ['Pa. Stat. Ann. tit. 43, § 955 (West 2020).', 'Next.'],
  ],
  ['Cal. Civ. Code § 1714(a). Next.', ['Cal. Civ. Code § 1714(a).', 'Next.']],
  ['IV. Conclusion', ['IV. Conclusion']],
  ['A. The facility was designed for long stays', ['A. The facility was designed for long stays']],
  ['He got an A. Then he left.', ['He got an A.', 'Then he left.']],
  [
    'See Lakeside, 455 F.3d at 158–59 (citing Hovsons, Inc. v. Twp. of Brick, 89 F.3d 1096, 1102 (3d Cir. 1996)). Next.',
    [
      'See Lakeside, 455 F.3d at 158–59 (citing Hovsons, Inc. v. Twp. of Brick, 89 F.3d 1096, 1102 (3d Cir. 1996)).',
      'Next.',
    ],
  ],
  [
    'The statute uses the word “dwelling.” and nothing else.',
    ['The statute uses the word “dwelling.”', 'and nothing else.'],
  ],
  ['She asked, “Why?” and left. Next.', ['She asked, “Why?” and left.', 'Next.']],
  [
    'The rule is clear. Smith v. Jones, 1 F.3d 2 (2000). Next.',
    ['The rule is clear.', 'Smith v. Jones, 1 F.3d 2 (2000).', 'Next.'],
  ],
  [
    'The rule is clear. Smith v. Jones, 1 F.3d 2 (2000). Next.',
    ['The rule is clear. Smith v. Jones, 1 F.3d 2 (2000).', 'Next.'],
    { attachCitations: true },
  ],
  ['He met Prof. Jones at 5 p.m. Monday.', ['He met Prof. Jones at 5 p.m. Monday.']],
  [
    'The court cited Bd. of Educ. v. Earls, 536 U.S. 822 (2002). Next.',
    ['The court cited Bd. of Educ. v. Earls, 536 U.S. 822 (2002).', 'Next.'],
  ],
  [
    'The U.S. Dep’t of Hous. & Urban Dev. issued a rule. Next.',
    ['The U.S. Dep’t of Hous. & Urban Dev. issued a rule.', 'Next.'],
  ],
];

// Without a list of entity names, "Bros." before a number cannot be told from "Bros." in
// the middle of a name ("Smith Bros. 2019 Holdings").
const TODO = 'The firm is Smith Bros. 2019 was a good year.';

const texts = sentences => sentences.map(({ text }) => text);

for (const [text, expected, options] of TRICKY) {
  const name = `${text}${options ? ` ${JSON.stringify(options)}` : ''}`;
  if (text === TODO) {
    test.todo(name, () => assert.deepEqual(texts(legalSentences(text, 'en', options)), expected));
    continue;
  }
  test(name, () => assert.deepEqual(texts(legalSentences(text, 'en', options)), expected));
}

const blocks = memoBlocks();
const sentences = blocks.flatMap(block => block.sentences);

test('the memo has 57 sentences by default, 11 of them only citations', () => {
  const split = blocks.map(block => legalSentences(block.text, 'en'));
  assert.equal(split.flat().length, 57);
  assert.deepEqual(
    split.map(list => list.length),
    [1, 4, 1, 2, 2, 1, 4, 2, 1, 4, 9, 2, 1, 4, 7, 4, 1, 1, 6],
  );
  const citationOnly = split
    .flat()
    .map((sentence, k) => (isCitationSentence(sentence.text) ? k + 1 : 0))
    .filter(Boolean);
  assert.deepEqual(citationOnly, [10, 13, 17, 20, 24, 27, 29, 31, 38, 42, 48]);
});

test('with citations attached to their claims the memo has 46 sentences', () => {
  assert.equal(sentences.length, 46);
  assert.deepEqual(
    blocks.map(block => block.sentences.length),
    [1, 4, 1, 2, 1, 1, 3, 1, 1, 3, 5, 2, 1, 3, 6, 3, 1, 1, 6],
  );
  assert.ok(sentences[13].text.endsWith('(3d Cir. 1990))'));
  assert.ok(sentences[18].text.endsWith('Lakeside, 455 F.3d at 159'));
  // S16 is the whole first claim of its paragraph, with the Smith citation.
  const paragraph = blocks.find(block => block.sentences.includes(sentences[15]));
  const claim = paragraph.text.slice(0, paragraph.text.indexOf('(W.D. Pa. 2015).') + 16);
  assert.equal(sentences[15].text, claim);
  assert.ok(sentences[36].text.includes('418–19 (W.D. Pa. 2013)., the court found'));
});

test('no memo sentence ends inside a citation, and every span matches its text', () => {
  for (const sentence of sentences) {
    assert.doesNotMatch(sentence.text, /(?:^|\s)(?:v|F|Cir|Bd|No|Pa|Twp|Supp)\.$/);
  }
  for (const block of blocks) {
    let last = 0;
    for (const { start, end, text } of block.sentences) {
      assert.equal(block.text.slice(start, end), text);
      assert.ok(start >= last && end > start);
      last = end;
    }
  }
});

test('breaks the segmenter misses are forced, and say why', () => {
  const forced = k => legalSentences(blocks[k].text, 'en').forced.map(({ why }) => why);
  // Blocks 10, 13 and 14 are paragraphs 13, 16 and 17 (the caption counts four lines).
  assert.deepEqual(forced(10), [
    'citation without period',
    'lowercase after citation',
    'lowercase after citation',
    'citation after quotation without period',
  ]);
  assert.deepEqual(forced(13), ['footnote']);
  assert.deepEqual(forced(14), ['lowercase after quotation']);
});

test('a citation after a soft line break stays its own sentence', () => {
  assert.equal(
    legalSentences('A claim.\n42 U.S.C. § 1.', 'en', { attachCitations: true }).length,
    2,
  );
  assert.equal(
    legalSentences('A claim. 42 U.S.C. § 1.', 'en', { attachCitations: true }).length,
    1,
  );
});

test('the memo cites 17 times, and names its cases 15 times in running text', () => {
  const cites = blocks.map(block => resolveCitations(block.text, findCitations(block.text)));
  const all = cites.flat();
  assert.equal(all.length, 17);
  const count = (type, nested = false) =>
    all.filter(cite => cite.type === type && Boolean(cite.nested) === nested).length;
  assert.equal(count('statute'), 3);
  assert.equal(count('full'), 2);
  assert.equal(count('full', true), 1);
  assert.equal(count('docket'), 1);
  assert.equal(count('short'), 9);
  assert.equal(count('id'), 1);

  const whole = blocks.map(block => block.text).join('\n');
  const names = referenceNames(findCitations(whole));
  const references = blocks.flatMap((block, k) => {
    const quotes = quoteSpans(block.text);
    return findReferences(block.text, cites[k], names).map(reference => ({
      block: k,
      text: reference.text,
      quoted: quotes.some(([start, end]) => start < reference.start && reference.end <= end),
    }));
  });
  assert.equal(references.length, 15);
  assert.deepEqual(
    references.filter(reference => reference.quoted),
    [{ block: 10, text: 'Columbus Country Club', quoted: true }],
  );

  const [code, usc] = all.filter(cite => cite.type === 'statute' && cite.text.includes('3602'));
  assert.equal(code.text, '42 U.S. Code § 3602 (b)');
  assert.equal(
    citationKey(code),
    citationKey(all.find(cite => cite.text === '42 U.S.C. § 3602(c)')),
  );
  assert.equal(citationKey(code), citationKey(usc));
});

test('a suggestion that cites authority the document does not cite is caught', () => {
  const memo = blocks.map(block => block.text).join('\n');
  const unseen = suggestion => unseenCitations(memo, suggestion).map(cite => cite.text);
  assert.deepEqual(unseen('The Act bars it. 42 U.S.C. § 3604(f)(1).'), ['42 U.S.C. § 3604(f)(1)']);
  assert.deepEqual(unseen('See Schwarz v. City of Treasure Island, 544 F.3d 1201.'), [
    'Schwarz v. City of Treasure Island, 544 F.3d 1201',
  ]);
  assert.deepEqual(unseen('It counts. Lakeside, 455 F.3d at 160.'), []);
});

test('the document model splits legal text the same way, and reuses an unchanged block', () => {
  const text = 'The rule is clear. Smith v. Jones, 1 F.3d 2 (2000). Next.';
  assert.deepEqual(texts(sentencesIn(text, 'en')), [
    'The rule is clear. Smith v. Jones, 1 F.3d 2 (2000).',
    'Next.',
  ]);
  assert.equal(sentencesIn(text, 'en'), sentencesIn(text, 'en'));
  assert.deepEqual(sentencesIn('', ''), []);
});

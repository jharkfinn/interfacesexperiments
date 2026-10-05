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
  shortName,
  stripLead,
  NOT_NAME,
  CASE_NAME_WORDS,
  citationRuns,
  citationTokenClass,
  distinctiveName,
} from '../dist/legal-text.js';
import { sentencesIn } from '../dist/doc-model.js';
import { memoBlocks } from './fixtures/memo.mjs';
import { blocksOf, documentText } from './fixtures/general/documents.mjs';

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

test('a long block splits in time linear in its length', () => {
  // Near the 16,000-character limit. Each of these took half a second or more when a
  // pattern was retried from every character, or every break rescanned its sentence.
  const cases = {
    chinese: '这是一个句子。'.repeat(2000),
    'one long word': 'a'.repeat(15900),
    'unclosed parentheses': '('.repeat(15000),
    initials: Array.from({ length: 2000 }, (_, k) => String.fromCharCode(65 + (k % 26)) + '.').join(
      ' ',
    ),
    'one id. after another': 'Id. '.repeat(2000),
    'capitals after a number':
      `See Exhibit 5 ${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3)} here. `.repeat(20),
  };
  for (const [name, text] of Object.entries(cases)) {
    const at = performance.now();
    legalSentences(text, 'en', { attachCitations: true });
    findCitations(text);
    assert.ok(performance.now() - at < 200, name);
  }
  assert.equal(legalSentences('这是一个句子。'.repeat(3), 'zh').length, 3);
});

// ---------------------------------------------------------------------------
// Generality: forms the sample memo does not use (problem IDs from the generality report)
// ---------------------------------------------------------------------------

const attached = text => texts(legalSentences(text, 'en', { attachCitations: true }));
const only = text => {
  const cites = findCitations(text).filter(cite => !cite.nested);
  assert.equal(cites.length, 1, JSON.stringify(cites.map(cite => cite.text)));
  return cites[0];
};

test('LT-1: record citations are citations, and attach to the fact they support', () => {
  const records = [
    'Compl. ¶ 6',
    'Am. Compl. ¶¶ 34–58',
    'Ex. A at 1',
    'Ex. C',
    'Tr. 45:3-7',
    'R. at 12',
    'Smith Decl. ¶ 5',
    'Whitcombe Decl. ¶¶ 3–5',
    'Alvarez Dep. 8:2-11',
    'Hollis Dep. 22:15-23:4',
    'ECF No. 12',
    'Dkt. No. 45, at 3',
    'J.A. 45',
    "Pl.'s Mot. at 5",
  ];
  for (const record of records) {
    const cite = only(`${record}.`);
    assert.equal(cite.type, 'record', record);
    assert.equal(cite.text, record);
    assert.equal(citationKey(cite), `record:${record.replace(/\s+/g, '')}`);
    assert.deepEqual(attached(`The fact. ${record}.`), [`The fact. ${record}.`], record);
    assert.ok(isCitationSentence(`(${record}.)`), record);
  }
  // "Decl. of Tomas Reyes, ECF No. 12, Ex. A" is three record citations in one sentence.
  assert.deepEqual(
    findCitations('Id. ¶¶ 12–14; see also Decl. of Tomas Reyes, ECF No. 12, Ex. A.').map(cite => [
      cite.type,
      cite.text,
    ]),
    [
      ['id', 'Id. ¶¶ 12–14'],
      ['record', 'Decl. of Tomas Reyes'],
      ['record', 'ECF No. 12'],
      ['record', 'Ex. A'],
    ],
  );
  // California's record: clerk's and reporter's transcripts.
  assert.deepEqual(
    findCitations('Delgado fell at 3:01 p.m. (2 CT 362; RT 9:14-18.)').map(cite => cite.text),
    ['2 CT 362', 'RT 9:14-18'],
  );
  assert.equal(
    only('(2 CT 371 [Ostrander depo. at 44:3-19].)').text,
    '2 CT 371 [Ostrander depo. at 44:3-19]',
  );
  assert.deepEqual(attached('Delgado fell. (1 CT 52, 58.)'), ['Delgado fell. (1 CT 52, 58.)']);
  // Without a volume, a line or an opening bracket, "ER 3" is prose.
  assert.deepEqual(findCitations('He went to the ER 3 times.'), []);
  assert.deepEqual(attached('The timing proves nothing. Breeden, 532 U.S. at 272; Ex. C at 4.'), [
    'The timing proves nothing. Breeden, 532 U.S. at 272; Ex. C at 4.',
  ]);
});

test('LT-2: parallel citations are one case, keyed by the first reporter', () => {
  const twombly = only(
    'Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570, 127 S. Ct. 1955, 167 L. Ed. 2d 929 (2007).',
  );
  assert.equal(twombly.name, 'Bell Atl. Corp. v. Twombly');
  assert.deepEqual(
    [twombly.volume, twombly.reporter, twombly.page, twombly.pin],
    ['550', 'U.S.', '544', '570'],
  );
  assert.equal(twombly.year, '2007');
  assert.equal(citationKey(twombly), '550 U.S.');
  assert.deepEqual(twombly.parallel, [
    { volume: '127', reporter: 'S. Ct.', page: '1955', pin: null },
    { volume: '167', reporter: 'L. Ed. 2d', page: '929', pin: null },
  ]);
  const aguilar = only(
    'Aguilar v. Atl. Richfield Co., 25 Cal. 4th 826, 860, 24 P.3d 493, 518, 107 Cal. Rptr. 2d 841 (2001).',
  );
  assert.equal(aguilar.name, 'Aguilar v. Atl. Richfield Co.');
  assert.deepEqual(
    aguilar.parallel.map(p => p.pin),
    ['518', null],
  );
  // Short forms in a parallel reporter, and a short form with its own parallel.
  const short = only('Twombly, 550 U.S. at 555, 127 S. Ct. at 1965.');
  assert.deepEqual([short.type, short.antecedent, short.pin], ['short', 'Twombly', '555']);
  assert.deepEqual(short.parallel, [
    { volume: '127', reporter: 'S. Ct.', page: null, pin: '1965' },
  ]);
  const text = `${twombly.text}. Labels will not do. Twombly, 127 S. Ct. at 1965.`;
  const cites = resolveCitations(text, findCitations(text));
  assert.equal(cites[1].refersTo, 0);
});

test('LT-3: California Style Manual citations have a name, a year, parallels and a short title', () => {
  const text =
    '(Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826, 860 [107 Cal.Rptr.2d 841, 24 P.3d 493] (Aguilar).)';
  const cite = only(text);
  assert.equal(cite.type, 'full');
  assert.equal(cite.name, 'Aguilar v. Atlantic Richfield Co.');
  assert.deepEqual([cite.plaintiff, cite.defendant], ['Aguilar', 'Atlantic Richfield Co.']);
  assert.deepEqual([cite.year, cite.court, cite.pin], ['2001', null, '860']);
  assert.deepEqual(
    cite.parallel.map(p => `${p.volume} ${p.reporter} ${p.page}`),
    ['107 Cal.Rptr.2d 841', '24 P.3d 493'],
  );
  assert.equal(cite.shortTitle, 'Aguilar');
  assert.deepEqual(cite.parentheticals, []);
  assert.ok(isCitationSentence(text));
  // A court before the year, and "hereafter" titles.
  const federal = only('(Smith v. Jones (9th Cir. 2001) 250 F.3d 1, 5 (hereafter Smith).)');
  assert.deepEqual(
    [federal.court, federal.year, federal.shortTitle],
    ['9th Cir.', '2001', 'Smith'],
  );
  assert.equal(
    only('Restatement (Second) of Torts § 1 (Am. L. Inst. 1965) [hereinafter Restatement].').type,
    'secondary',
  );
  assert.equal(
    only('Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2000) [hereinafter Smith I].').shortTitle,
    'Smith I',
  );
  // An explanatory parenthetical that does not name the case is not a short title.
  assert.equal(only('Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2000) (Smyth).').shortTitle, null);
});

test('LT-4: California pins (at p., at pp.) in id., supra and short forms', () => {
  const supra = only('(Ortega, supra, 26 Cal.4th at p. 1206.)');
  assert.deepEqual(
    [supra.type, supra.antecedent, supra.volume, supra.reporter, supra.pin],
    ['supra', 'Ortega', '26', 'Cal.4th', '1206'],
  );
  assert.equal(only('(Saelzler, supra, 25 Cal.4th at pp. 775-776.)').pin, '775-776');
  assert.deepEqual(
    [only('(Id. at p. 843.)').text, only('(Id. at p. 843.)').pin],
    ['Id. at p. 843', '843'],
  );
  assert.equal(only('(Id. at pp. 843-844.)').pin, '843-844');
  const short = only('(Ortega, 26 Cal.4th at p. 1206.)');
  assert.deepEqual([short.type, short.pin, short.antecedent], ['short', '1206', 'Ortega']);
  for (const text of ['(Id. at p. 1207.)', '(Ortega, supra, 26 Cal.4th at p. 1206.)'])
    assert.ok(isCitationSentence(text), text);
  // California's notes after a comma, inside the parentheses.
  const noted = only('(Id. at p. 1207, internal quotation marks omitted.)');
  assert.deepEqual(noted.parentheticals, ['internal quotation marks omitted']);
  assert.ok(isCitationSentence('(Id. at p. 1207, internal quotation marks omitted.)'));
});

test('LT-5: a full citation’s pin before the sentence’s period is kept', () => {
  assert.equal(
    only('A store owner must inspect. (Ortega v. Kmart Corp. (2001) 26 Cal.4th 1200, 1206.)').pin,
    '1206',
  );
  assert.equal(only('Smith v. Jones, 1 F.3d 2, 5.').pin, '5');
  // A parallel citation's volume is not a pin.
  assert.equal(only('Smith v. Jones, 1 U.S. 2, 3 S. Ct. 4 (1990).').pin, null);
});

test('LT-6: California code citations keep their code and subdivision', () => {
  const cites = findCitations(
    'Rule. (Evid. Code, § 452, subd. (d).) Other rule. (Code Civ. Proc., § 452.) Third. (Gov. Code, § 810.)',
  );
  assert.deepEqual(
    cites.map(cite => [cite.type, cite.text, citationKey(cite)]),
    [
      ['statute', 'Evid. Code, § 452, subd. (d)', 'Evid.Code§452'],
      ['statute', 'Code Civ. Proc., § 452', 'CodeCiv.Proc.§452'],
      ['statute', 'Gov. Code, § 810', 'Gov.Code§810'],
    ],
  );
  assert.equal(
    only('(Code Civ. Proc., § 437c, subd. (c).)').text,
    'Code Civ. Proc., § 437c, subd. (c)',
  );
  assert.equal(only('(Bus. & Prof. Code, § 17200.)').text, 'Bus. & Prof. Code, § 17200');
  assert.equal(
    only('(Welf. & Inst. Code, § 300, subds. (a) & (b).)').text,
    'Welf. & Inst. Code, § 300, subds. (a) & (b)',
  );
  // The California and Bluebook forms of a constitution share a key.
  assert.equal(
    citationKey(only('(Cal. Const., art. VI, § 13.)')),
    citationKey(only('Cal. Const. art. VI, § 13.')),
  );
  assert.equal(only('Cal. Rules of Court, rule 8.204(a)(1).').type, 'statute');
});

test('LT-7: a docket citation runs through its judge, date and parentheticals', () => {
  const text =
    'Courts dismiss such claims. See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (JPO), 2019 WL 1234567, at *3 (S.D.N.Y. Mar. 5, 2019) (dismissing fraud claim).';
  const cite = only(text);
  assert.equal(cite.type, 'docket');
  assert.equal(cite.name, 'Meridian Produce Co. v. Talbot Freight Sys., Inc.');
  assert.deepEqual(
    [cite.plaintiff, cite.defendant],
    ['Meridian Produce Co.', 'Talbot Freight Sys., Inc.'],
  );
  assert.equal(cite.signal, 'See');
  assert.deepEqual(
    [cite.docket, cite.database, cite.pin],
    ['No. 18-cv-7702', '2019 WL 1234567, at *3', '*3'],
  );
  assert.deepEqual([cite.court, cite.date, cite.year], ['S.D.N.Y.', 'Mar. 5, 2019', '2019']);
  assert.deepEqual(cite.parentheticals, ['dismissing fraud claim']);
  assert.ok(cite.text.endsWith('(dismissing fraud claim)'));
  assert.equal(citationKey(cite), '2019 WL 1234567');
  assert.equal(attached(text).length, 1);
  assert.deepEqual([...referenceNames([cite]).keys()], ['Meridian Produce', 'Meridian', 'Talbot']);
});

test('LT-8: a case cited only by its Westlaw number is a named case keyed by that number', () => {
  const text =
    'Some courts disagree, but see Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6 (S.D.N.Y. Sept. 27, 2021).';
  const cite = only(text);
  assert.deepEqual(
    [cite.type, cite.docket, cite.name, cite.pin, cite.court, cite.date, cite.signal],
    [
      'docket',
      null,
      'Kessler v. Northgate Cold Storage, LLC',
      '*6',
      'S.D.N.Y.',
      'Sept. 27, 2021',
      'but see',
    ],
  );
  assert.equal(citationKey(cite), '2021 WL 4410382');
  assert.ok(referenceNames([cite]).has('Kessler'));
  // Its short form, which resolves to it, and a bare database cite.
  const short = only('Meridian Produce, 2019 WL 1234567, at *3.');
  assert.deepEqual(
    [short.type, short.antecedent, short.database, short.pin, citationKey(short)],
    ['short', 'Meridian Produce', '2019 WL 1234567, at *3', '*3', '2019 WL 1234567'],
  );
  assert.deepEqual(
    attached('Corvina does not say who spoke. Meridian Produce, 2019 WL 1234567, at *3.').length,
    1,
  );
  const both =
    'Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702, 2019 WL 1234567, at *3 (S.D.N.Y. Mar. 5, 2019). Corvina is silent. Meridian Produce, 2019 WL 1234567, at *4.';
  const resolved = resolveCitations(both, findCitations(both));
  assert.equal(resolved[1].refersTo, 0);
  const bare = only('See 2018 WL 3456789, at *4.');
  assert.deepEqual([bare.type, bare.pin, citationKey(bare)], ['database', '*4', '2018 WL 3456789']);
});

test('LT-9: case names never start with the sentence’s words', () => {
  assert.equal(
    only('In Summers v. Altarum Inst., Corp., 740 F.3d 325, 329 (4th Cir. 2014), the court held X.')
      .name,
    'Summers v. Altarum Inst., Corp.',
  );
  assert.equal(
    only(
      'The standard of Toyota Motor Mfg., Ky., Inc. v. Williams, 534 U.S. 184, 198 (2002), was rejected.',
    ).name,
    'Toyota Motor Mfg., Ky., Inc. v. Williams',
  );
  const under = only('Under United States v. Smith, 1 F.3d 1, 2 (2d Cir. 1990), x.');
  assert.equal(under.name, 'United States v. Smith');
  assert.ok(under.text.startsWith('United States'));
  assert.equal(only('In re Smith, 1 B.R. 2 (Bankr. D. Del. 2000).').name, 'In re Smith');
  assert.equal(only('In Lakeside, 455 F.3d at 159, it held so.').antecedent, 'Lakeside');
  assert.equal(only('See Jones, supra, at 5.').antecedent, 'Jones');
  assert.equal(stripLead('Under the United States'), 'United States');
  assert.ok(NOT_NAME.has('Under'));
});

test('a declaration’s name ends at the end of its sentence, and keeps its initials', () => {
  assert.deepEqual(
    findCitations('The plan was signed. Decl. of Tomas Reyes. He then left. Id. ¶ 4.').map(cite => [
      cite.type,
      cite.text,
    ]),
    [
      ['record', 'Decl. of Tomas Reyes'],
      ['id', 'Id. ¶ 4'],
    ],
  );
  for (const record of [
    'Decl. of Tomas R. Reyes ¶ 3',
    'Aff. of J. Smith at 4',
    'Decl. of Ann Lee, Jr. ¶ 2',
    'Dep. of Mary Jones 4:2-9',
  ])
    assert.equal(only(`Signed. ${record}. Then the Court ruled.`).text, record);
  assert.deepEqual(attached('It was signed. Decl. of Tomas Reyes. He then left.'), [
    'It was signed. Decl. of Tomas Reyes.',
    'He then left.',
  ]);
});

test('LT-10: a curly possessive does not cut the case name', () => {
  assert.equal(
    only(
      'Oswego Laborers’ Local 214 Pension Fund v. Marine Midland Bank, N.A., 85 N.Y.2d 20, 25 (1995).',
    ).name,
    'Oswego Laborers’ Local 214 Pension Fund v. Marine Midland Bank, N.A.',
  );
  assert.equal(
    only('Teamsters’ Pension Fund v. Acme Corp., 1 F.3d 1, 2 (2d Cir. 1990).').name,
    'Teamsters’ Pension Fund v. Acme Corp.',
  );
  assert.equal(
    only('Louie v. Hagstrom’s Food Stores, Inc., 81 Cal. App. 2d 601 (1947).').name,
    'Louie v. Hagstrom’s Food Stores, Inc.',
  );
});

test('LT-11: id. keeps paragraph ranges and deposition lines', () => {
  assert.deepEqual(
    [only('Id. ¶¶ 30–31.').text, only('Id. ¶¶ 30–31.').pin],
    ['Id. ¶¶ 30–31', '¶¶ 30–31'],
  );
  assert.equal(only('Id. ¶¶ 3, 5–7.').text, 'Id. ¶¶ 3, 5–7');
  assert.deepEqual(
    [only('Id. at 14:3-9.').text, only('Id. at 14:3-9.').pin],
    ['Id. at 14:3-9', '14:3-9'],
  );
  assert.equal(only('Id. § 12102(2)(B).').pin, '§ 12102(2)(B)');
});

test('LT-12: a contract’s or document’s sections are internal, not statutes', () => {
  const internal = text => findCitations(text).map(cite => [cite.type, cite.text]);
  assert.deepEqual(internal('Agreement § 4.2.'), [['internal', 'Agreement § 4.2']]);
  assert.deepEqual(internal('Agreement §§ 4.2, 9.1.'), [['internal', 'Agreement §§ 4.2, 9.1']]);
  assert.deepEqual(internal('Separately, § 4.3 of the MSA lets Kestrel leave.'), [
    ['internal', '§ 4.3'],
  ]);
  assert.deepEqual(internal('Nothing in this § 12 prevents relief.'), [['internal', '§ 12']]);
  assert.deepEqual(internal('Section 4.2(b) lets Kestrel terminate.'), [
    ['internal', 'Section 4.2(b)'],
  ]);
  assert.deepEqual(internal('in accordance with this Section 4.'), [['internal', 'Section 4']]);
  // Statutes are not internal, and a bare "Section 349" is prose.
  assert.deepEqual(internal('Section 349 prohibits deception.'), []);
  assert.deepEqual(internal('Under § 1983, a plaintiff may sue.'), [['section', '§ 1983']]);
  assert.deepEqual(internal('Federal law requires it. 9 U.S.C. § 2.'), [
    ['statute', '9 U.S.C. § 2'],
  ]);
  // "§§" and "§" share a key; a section list is kept whole.
  assert.equal(citationKey(only('See §§ 4.2.')), citationKey(only('See § 4.2.')));
  assert.equal(only('42 U.S.C. §§ 1981, 1983.').text, '42 U.S.C. §§ 1981, 1983');
  assert.deepEqual(attached('Corvina distributes seafood. Agreement § 9.1.'), [
    'Corvina distributes seafood. Agreement § 9.1.',
  ]);
});

test('LT-13: statutes, regulations and session laws in their usual forms', () => {
  const reg = only('76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011).');
  assert.deepEqual(
    [reg.type, reg.text, citationKey(reg)],
    ['statute', '76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011)', '76Fed.Reg.16,978'],
  );
  const law = only('Pub. L. No. 110-325, § 2(b)(5), 122 Stat. 3553, 3554 (2008).');
  assert.equal(law.text, 'Pub. L. No. 110-325, § 2(b)(5), 122 Stat. 3553, 3554 (2008)');
  assert.equal(
    citationKey(law),
    citationKey(only('Pub. L. No. 110-325, § 2(b)(4), 122 Stat. at 3554.')),
  );
  for (const text of [
    '29 C.F.R. pt. 1630, app. § 1630.9',
    'Cal. Code Regs. tit. 2, § 11068(a) (2024)',
    'N.Y. C.P.L.R. 3211(a)(7) (McKinney 2024)',
    'Cal. Gov’t Code § 12940(m) (West 2024)',
    'Tex. Lab. Code Ann. § 21.128 (West 2023)',
    'Cal. Gov’t Code § 12940(m), (n)',
    '42 U.S.C. § 12102(1)(A), (2)(B)',
    'Cal. Bus. & Prof. Code § 17200',
    'Tex. Civ. Prac. & Rem. Code Ann. § 16.003',
    'Fla. R. Civ. P. 1.140(b)',
    'Cal. R. Ct. 8.204(a)',
    '9 U.S.C. § 1 et seq.',
  ]) {
    const cite = only(`See ${text}.`);
    assert.deepEqual([cite.type, cite.text], ['statute', text]);
  }
  assert.equal(citationKey(only('Cal. Gov’t Code § 12940(m), (n).')), "Cal.Gov'tCode§12940");
  const guidance = only(
    'EEOC, Enforcement Guidance: Reasonable Accommodation and Undue Hardship Under the Americans with Disabilities Act, Question 34 (Oct. 17, 2002).',
  );
  assert.deepEqual(
    [guidance.type, guidance.author, guidance.pin, guidance.year],
    ['secondary', 'EEOC', 'Question 34', '2002'],
  );
  for (const text of [
    'See Pub. L. No. 110-325, § 2(b)(4), 122 Stat. at 3554; H.R. Rep. No. 110-730, pt. 1, at 5 (2008).',
    '29 C.F.R. § 1630.2(o)(3); see also 29 C.F.R. pt. 1630, app. § 1630.9.',
    'See 29 C.F.R. § 1630.2(j)(3)(iii); 76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011).',
  ])
    assert.ok(isCitationSentence(text), text);
});

test('LT-14: law reviews, treatises, Restatements and their supras', () => {
  const article = only('Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1, 15 (1987).');
  assert.deepEqual(
    [
      article.type,
      article.author,
      article.title,
      article.volume,
      article.reporter,
      article.page,
      article.pin,
      article.year,
    ],
    [
      'periodical',
      'Jane Roe',
      'Rethinking Essential Functions',
      '100',
      'Harv. L. Rev.',
      '1',
      '15',
      '1987',
    ],
  );
  assert.equal(citationKey(article), '100 Harv.L.Rev. 1');
  const treatise = only(
    'See also 1 Barbara T. Lindemann et al., Employment Discrimination Law § 13.03 (5th ed. 2012).',
  );
  assert.deepEqual(
    [treatise.type, treatise.author, treatise.title, treatise.pin, treatise.year],
    [
      'secondary',
      'Barbara T. Lindemann et al.',
      'Employment Discrimination Law',
      '§ 13.03',
      '2012',
    ],
  );
  assert.equal(
    treatise.text,
    '1 Barbara T. Lindemann et al., Employment Discrimination Law § 13.03 (5th ed. 2012)',
  );
  const wright = only(
    '5B Charles Alan Wright & Arthur R. Miller, Federal Practice and Procedure § 1357 (3d ed. 2004).',
  );
  assert.equal(wright.title, 'Federal Practice and Procedure');
  const restatement = only('Restatement (Second) of Torts § 402A (Am. L. Inst. 1965).');
  assert.deepEqual(
    [restatement.type, restatement.title, restatement.pin],
    ['secondary', 'Restatement (Second) of Torts', '§ 402A'],
  );
  const supra = only('Lindemann et al., supra note 6, § 13.03.');
  assert.deepEqual([supra.antecedent, supra.note, supra.pin], ['Lindemann et al.', '6', '§ 13.03']);
  assert.deepEqual(
    [only('Roe, supra note 4, at 22.').note, only('Roe, supra note 4, at 22.').pin],
    ['4', '22'],
  );
  // A dictionary quoted inside an id.'s parenthetical is a nested source.
  const [id, dictionary] = findCitations(
    'Id. (quoting Webster’s New International Dictionary 1710 (2d ed. 1957)).',
  );
  assert.deepEqual(
    [id.type, dictionary.type, dictionary.nested, dictionary.title],
    ['id', 'secondary', true, 'Webster’s New International Dictionary'],
  );
  // An edition after prose is not a citation.
  assert.deepEqual(findCitations('As explained in the textbook (3d ed. 2004), it works.'), []);
  assert.ok(
    isCitationSentence(
      'Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1, 15 (1987); see also 1 Barbara T. Lindemann et al., Employment Discrimination Law § 13.03 (5th ed. 2012).',
    ),
  );
});

test('LT-15: a bare No. N-N is a docket only with docket context; legislative history', () => {
  assert.deepEqual(
    findCitations(
      'Customer shall pay the fees in Order Form No. 2023-014 within thirty (30) days.',
    ),
    [],
  );
  assert.deepEqual(findCitations('He wore No. 5 and later No. 12-3 for the team.'), []);
  assert.deepEqual(findCitations('Order No. 4471-B shipped.'), []);
  assert.equal(only('No. 1:26-cv-03317 (LGS)').type, 'docket-number');
  assert.equal(only('Case No. 12-345 is pending.').type, 'docket-number');
  assert.equal(only('Smith v. Jones, No. 13-114-J, (W.D. Pa. 2015).').type, 'docket');
  const report = only('H.R. Rep. No. 110-730, pt. 1, at 5 (2008).');
  assert.deepEqual([report.type, report.pin, report.year], ['legislative', '5', '2008']);
  assert.equal(only('S. Rep. No. 101-116, at 20 (1989).').type, 'legislative');
  const record = only('See 144 Cong. Rec. S3021 (1998) (statement of Sen. Leahy).');
  assert.deepEqual(
    [record.type, record.parentheticals],
    ['legislative', ['statement of Sen. Leahy']],
  );
});

test('LT-16: an unknown reporter needs a case name or a court', () => {
  assert.deepEqual(findCitations('The pastor read from 1 Cor. 13 at the wedding.'), []);
  assert.deepEqual(findCitations('She quoted 2 Tim. 4 often.'), []);
  assert.equal(
    only('See Entick v. Carrington, 95 Eng. Rep. 807 (C.P. 1765).').name,
    'Entick v. Carrington',
  );
  assert.equal(only('95 Eng. Rep. 807 (C.P. 1765).').court, 'C.P.');
  assert.equal(only('Smith v. Jones, 1 F.3d 2.').known, true);
});

test('LT-17: English and Canadian citations, with their courts and pins', () => {
  const cases = [
    [
      'See Reckitt & Colman Products Ltd v Borden Inc [1990] 1 WLR 491 (HL) at 499.',
      'Reckitt & Colman Products Ltd v Borden Inc',
      '[1990] 1',
      'WLR',
      '491',
      'HL',
      '499',
    ],
    [
      'Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47].',
      'Starbucks (HK) Ltd v British Sky Broadcasting Group plc',
      '[2015]',
      'UKSC',
      '31',
      'UKSC',
      '[47]',
    ],
    [
      'R v Smith [2004] EWCA Crim 631.',
      'R v Smith',
      '[2004]',
      'EWCA Crim',
      '631',
      'EWCA Crim',
      null,
    ],
    [
      'Canada (Minister of Citizenship and Immigration) v Vavilov, 2019 SCC 65 at para 23.',
      'Canada (Minister of Citizenship and Immigration) v Vavilov',
      '2019',
      'SCC',
      '65',
      'SCC',
      'para 23',
    ],
    [
      'Donoghue v Stevenson [1932] AC 562.',
      'Donoghue v Stevenson',
      '[1932]',
      'AC',
      '562',
      null,
      null,
    ],
    ['Hadley v Baxendale (1854) 9 Exch 341.', 'Hadley v Baxendale', '9', 'Exch', '341', null, null],
    [
      'Reckitt & Colman Prods. Ltd. v. Borden Inc., [1990] 1 W.L.R. 491, 499 (H.L.).',
      'Reckitt & Colman Prods. Ltd. v. Borden Inc.',
      '[1990] 1',
      'W.L.R.',
      '491',
      'H.L.',
      '499',
    ],
  ];
  for (const [text, name, volume, reporter, page, court, pin] of cases) {
    const cite = only(text);
    assert.deepEqual(
      [cite.type, cite.name, cite.volume, cite.reporter, cite.page, cite.court, cite.pin],
      ['full', name, volume, reporter, page, court, pin],
      text,
    );
    assert.ok(isCitationSentence(text), text);
  }
  const jordan = only('R. v. Jordan, 2016 SCC 27, [2016] 1 S.C.R. 631, at para. 5.');
  assert.deepEqual(
    [jordan.pin, jordan.parallel],
    ['para. 5', [{ volume: '[2016] 1', reporter: 'S.C.R.', page: '631', pin: null }]],
  );
  assert.equal(only('[2019] UKSC 5 at [41]').year, '2019');
  for (const statute of [
    'Trademarks Act, RSC 1985, c T-13, s 19',
    'Criminal Code, R.S.C. 1985, c. C-46, s. 348',
    'Theft Act 1968, s 1(1)',
  ])
    assert.deepEqual([only(`${statute}.`).type, only(`${statute}.`).text], ['statute', statute]);
  assert.deepEqual(
    attached(
      'Goodwill must be local. See Reckitt & Colman Products Ltd v Borden Inc [1990] 1 WLR 491 (HL) at 499.',
    ).length,
    1,
  );
});

test('LT-18: id. takes parentheticals, and lowercase signals still make a citation sentence', () => {
  for (const text of [
    'Id. at 1207 (internal quotation marks omitted).',
    'Id. at 5 (emphasis added).',
    'Id. (citation omitted).',
    'Id. (quoting Webster’s Third New International Dictionary 1710 (1961)).',
    'Burlington, 548 U.S. at 69 (alteration in original).',
  ])
    assert.ok(isCitationSentence(text), text);
  assert.deepEqual(only('Id. at 1207 (internal quotation marks omitted).').parentheticals, [
    'internal quotation marks omitted',
  ]);
  for (const signal of ['but see', 'cf.', 'see also', 'but cf.', 'see, e.g.,']) {
    const text = `A rule. Doe v. Roe, 100 F.3d 1, 5 (2d Cir. 1996); ${signal} Poe v. Moe, 101 F.3d 1, 5 (2d Cir. 1996).`;
    assert.equal(attached(text).length, 1, signal);
    assert.equal(findCitations(text)[1].signal, signal);
  }
  assert.equal(only('(See Reid v. Google, Inc. (2010) 50 Cal.4th 512, 535.)').signal, 'See');
  assert.equal(only('They oversee Smith v. Jones, 1 F.3d 2.').signal, null);
  assert.ok(isCitationSentence('Smith v. Jones, 1 F.3d 2 (2d Cir. 2000), aff’d, 5 U.S. 1 (2001).'));
});

test('LT-20: a statute’s key is the same with either apostrophe', () => {
  assert.equal(
    citationKey(only("Cal. Gov't Code § 12940(m).")),
    citationKey(only('Cal. Gov’t Code § 12940(m).')),
  );
});

test('LT-21: a lettered subsection after a period starts a sentence', () => {
  assert.deepEqual(
    attached('4.2 Termination. (a) Provider may not terminate. (b) Customer may terminate.'),
    ['4.2 Termination.', '(a) Provider may not terminate.', '(b) Customer may terminate.'],
  );
  assert.deepEqual(attached('Provider shall comply. (iv) Customer shall pay.'), [
    'Provider shall comply.',
    '(iv) Customer shall pay.',
  ]);
  // After an abbreviation the period is not a sentence's.
  assert.deepEqual(attached('The rule is in subd. (c) The court agreed.'), [
    'The rule is in subd. (c) The court agreed.',
  ]);
});

test('LT-22: a.m. and p.m. before a time zone', () => {
  assert.deepEqual(
    attached(
      'Maintenance occurs between 10:00 p.m. and 4:00 a.m. U.S. Pacific Time. Provider shall notify Customer.',
    ),
    [
      'Maintenance occurs between 10:00 p.m. and 4:00 a.m. U.S. Pacific Time.',
      'Provider shall notify Customer.',
    ],
  );
  assert.deepEqual(attached('The window ends at 5:00 p.m. Eastern Time. Next.'), [
    'The window ends at 5:00 p.m. Eastern Time.',
    'Next.',
  ]);
});

test('LT-23: a Commonwealth section, s. 348', () => {
  assert.deepEqual(attached('The offence is in s. 348. It carries a life term.'), [
    'The offence is in s. 348.',
    'It carries a life term.',
  ]);
  assert.deepEqual(attached('See r. 3.4 of the rules. Next.'), [
    'See r. 3.4 of the rules.',
    'Next.',
  ]);
});

test('LT-24: U.S. before ordinary nouns, military titles, approx. before money', () => {
  assert.deepEqual(attached('She lives in the U.S. Virgin Islands now.'), [
    'She lives in the U.S. Virgin Islands now.',
  ]);
  assert.deepEqual(attached('Half of the U.S. Midwest wanted a pretzel.'), [
    'Half of the U.S. Midwest wanted a pretzel.',
  ]);
  assert.deepEqual(attached('Gen. Patton arrived.'), ['Gen. Patton arrived.']);
  assert.deepEqual(attached('The cost was approx. $40. That was cheap.'), [
    'The cost was approx. $40.',
    'That was cheap.',
  ]);
  assert.deepEqual(attached('He moved outside the U.S. He moved back.'), [
    'He moved outside the U.S.',
    'He moved back.',
  ]);
});

test('LT-25: a quoted passage standing alone holds sentences of its own', () => {
  assert.deepEqual(attached('She shrugs. "Is it? Ask me again when the loaf fails."'), [
    'She shrugs.',
    '"Is it?',
    'Ask me again when the loaf fails."',
  ]);
  // A quotation with its citation after it is still one sentence.
  assert.deepEqual(
    attached('“First, we decide. Second, we determine.” Lakeside, 455 F.3d at 158.'),
    ['“First, we decide. Second, we determine.” Lakeside, 455 F.3d at 158.'],
  );
});

test('AN-13: the name a case goes by', () => {
  const doc = [
    'Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570 (2007).',
    'Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).',
    'Univ. of Tex. Sw. Med. Ctr. v. Nassar, 570 U.S. 338, 360 (2013).',
    'Clark Cnty. Sch. Dist. v. Breeden, 532 U.S. 268, 273 (2001).',
    'EEOC v. Ford Motor Co., 782 F.3d 753, 762 (6th Cir. 2015).',
    'Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019).',
    'US Airways, Inc. v. Barnett, 535 U.S. 391, 401 (2002).',
    'United States v. Columbus Country Club, 915 F.2d 877, 881 (3d Cir. 1990).',
    'State Farm Mut. Auto. Ins. Co. v. Campbell, 538 U.S. 408, 419 (2003).',
    'R v Smith [2004] EWCA Crim 631.',
    'Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31.',
    '(Sargon Enterprises, Inc. v. University of Southern California (2012) 55 Cal.4th 747, 771 (Sargon).)',
    'Twombly, 550 U.S. at 555.',
  ].join(' ');
  const cites = findCitations(doc);
  const fulls = cites.filter(cite => cite.type === 'full');
  assert.deepEqual(
    fulls.map(cite => shortName(cite, cites)),
    [
      'Twombly',
      'Ashcroft',
      'Nassar',
      'Breeden',
      'Ford Motor',
      'Henry Schein',
      'Barnett',
      'Columbus Country Club',
      'State Farm',
      'Smith',
      'Starbucks',
      'Sargon',
    ],
  );
  // Without the document, Twombly goes by its plaintiff, with the region its name
  // abbreviates spelled out (Bluebook table T6: "Atl." is "Atlantic"); a nameless cite by
  // its book.
  assert.equal(shortName(fulls[0]), 'Bell Atlantic');
  assert.equal(shortName(only('1 F.3d 2.')), '1 F.3d');
  const names = referenceNames(cites);
  for (const name of [
    'Twombly',
    'Iqbal',
    'Ashcroft',
    'Nassar',
    'Breeden',
    'Ford Motor',
    'Henry Schein',
    'Columbus Country Club',
    'Columbus',
    'Starbucks',
    'Sargon',
    'Smith',
  ])
    assert.ok(names.has(name), name);
  // Not the agency, the institution, a given name, or a common word.
  for (const name of [
    'EEOC',
    'Clark',
    'Henry',
    'Bell',
    'Univ.',
    'United',
    'US Airways',
    'In',
    'State',
  ])
    assert.ok(!names.has(name), name);
  const summers = findCitations(
    'In Summers v. Altarum Inst., Corp., 740 F.3d 325, 329 (4th Cir. 2014), the court held X.',
  );
  assert.ok(referenceNames(summers).has('Summers'));
});

test('findCitations stays fast on long adversarial text', () => {
  // Each of these took a tenth of a second or more before: a long run of parallel
  // citations or Westlaw numbers was walked again from each, and a case name was read back
  // through every word before it.
  const fill = unit => unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000);
  for (const unit of [
    '1 F.3d 2, ',
    '1 F.3d at 2, ',
    '2019 WL 1, ',
    '1 CT 1, ',
    '1 Harv. L. Rev. 1, ',
    'Abc (5th ed. 2012) ',
    '§ 1 ',
    'No. 1-1 ',
    'Abc Dep. ',
    'EEOC, Abc, ',
    'Abc Act 1999, s ',
    // The forms of the second generality round, and the citation-shaped runs.
    '2020 IL ',
    '2021-Ohio-',
    '1-ER-',
    '2019 SCC ',
    'Abc. Def. 1 ',
    'Abc. 1 Abc. 1 ',
    "Pl.'s Mot. Summ. J. Abc ",
    'Resp. to Interrog. ',
    '(1 Abc. ',
    'SAC ¶ 1, ',
    ', aff’d in part, ',
    'Smith v. Jones, 1 F.3d 1 (2d Cir. 1990), aff’d, ',
    'The Lease says § 1. ',
    '§ 1 of the Statement of Work of ',
    'S.D.N.Y. Local Civ. R. ',
    'U.C.C. § 1 (Am. ',
    'Witkin, Abc (1st ed. 2017) Abc, ',
    'This Court in ',
    'ABC ABC 1 ',
    // The third round: paragraph short forms, articles, bills, addresses, run edges.
    'Jones Smith Doe at [',
    'Abc Def at para 1 ',
    'Id. art. I, § ',
    'H.R. 1, 1st Cong. § ',
    'Exec. Order No. 1,234, § 1, ',
    'CA 94103 ',
    'Abc. Compl. ',
    '1.Abc ',
    '(S.D.N.Y. filed ',
    // Unclosed parentheticals after citations, each once read to the end of the text.
    'Id. at 1 (',
    'Smith, supra, at 1 (',
    'Abc v. Def, 1 F.3d 1 (',
    // The fourth round: unclosed parentheses after marks, titles before citations, and the
    // forms read since (Tax Court, PTAB, patents, slip opinions, jury instructions).
    '§ 1 (',
    '¶ 1 (',
    'Case C-1/12, ',
    'ECLI:EU:C:2014:317, ',
    'ROA.1234 ',
    'Abc Corp., 1 NLRB No. 1, slip op. at ',
    'T.C. Memo. 2020-',
    '123 T.C.M. (CCH) ',
    'IPR2019-01234, Paper ',
    'U.S. Patent No. 9,876,543 col. ',
    'Abc Def Ghi of Jkl, ',
    'Matter of A-B-, ',
    '(No 2) (1992) ',
    '1 U.S. ___, ___ (2023) (slip op., at ',
    'Ill. Pattern Jury Instr., ',
    'Op. 27 No. ',
    'May 23, 1969, ',
  ]) {
    const text = fill(unit);
    findCitations(text);
    citationRuns(text);
    // The best of three runs, so a test file running beside others does not time a pause.
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const at = performance.now();
      findCitations(text);
      citationRuns(text);
      best = Math.min(best, performance.now() - at);
    }
    assert.ok(best < 100, `${unit}: ${best} ms`);
  }
});

// ---------------------------------------------------------------------------
// Generality, second round: the forms the verifier's break tests found unread, and the
// citation-shaped fallback that keeps the guard and the views safe from the next ones
// ---------------------------------------------------------------------------

const types = text => findCitations(text).map(cite => [cite.type, cite.text]);
// A recipe and an office email: prose with numbers, abbreviations and acronyms in it.
const RECIPE = `Grandma's Apple Cake
Serves 8. Prep 20 min.; bake 45 min. at 350 F. (175 °C).
Ingredients: 2 1/4 cups (280 g) flour, 1 tsp. baking soda, 1/2 tsp. salt, 2 Tbsp. butter, 3 large eggs, 1 lb. apples (about 4 medium), 12 oz. sour cream, and approx. 3/4 cup sugar.
Step 1. Heat the oven to 350°F. Grease a 9 x 13 in. pan.
Step 2. Beat the butter for 2 min. on medium, then add the eggs one at a time.
Step 3. Bake 45 to 50 min., until a toothpick comes out clean. Cool for 1 hr. 15 min.
Note: at high altitude (above 3,000 ft.), add 2 Tbsp. flour. Keeps 3 days at room temp. or 1 wk. in the fridge.
From Vol. 2, No. 7 of the church cookbook, p. 14 (1987 ed.), via Mrs. Dalton at St. Mark's.`;
const EMAIL = `Subject: Re: Q3 offsite, Fri. Oct. 13
Hi team,
We're booked at the Hilton, 1234 Market St., Ste. 500, San Francisco, CA 94103, from 9 a.m. to 5 p.m. PT on Fri., Oct. 13, 2023. Room No. 12-3 is ours all day; the A/V tech (Ext. 4471) arrives at 8:30 AM.
Budget: $12,500 total (about $250/person for 50 people), i.e. 15% under FY 2023. The COVID 19 policy is unchanged, and the ISO 9001:2015 audit moved to Nov. 2.
Agenda: 9:00 kickoff with Dr. Patel; 10:30 the 2024 roadmap (v. 2.1 of the deck, slides 4-12); 2:00 breakouts in Rooms 3A and 3B. Bring your W-2 questions, and the 401(k) folks will be there too.
Call me at (415) 555-0199 or Tel. 415-555-0100. Our new office is at 50 Fremont St., Washington, D.C. 20001, Apt. 4B.
Section 8 of the handbook covers travel; Chapter 11 of last year's report is a good read too. Title IX training is due by Dec. 1. She wore jersey No. 23, and the U.S. 50 states map is on p. 3. He met Pat. 3 of us left. I read Gen. 1:1 and 2 GB of MP3 files. He scored 30 PTS and 12 REB.
Thanks,
Jordan R. Lee, Ph.D.
VP, Operations | ACME Corp. | 2 Embarcadero Ctr., 10th Fl. | Tel. (415) 555-0123`;

test('a citation in a form the parser does not know is kept as unparsed', () => {
  // Citation-shaped runs: numbers, marks, abbreviations and acronyms together.
  for (const [text, run] of [
    ['The parties agree. Joint Stip. ¶ 4.', 'Joint Stip. ¶ 4'],
    ['Congress acted. H.R. 1234.', 'H.R. 1234'],
    ['The record shows it. Admin. R. 45.', 'Admin. R. 45'],
    ['The court so ordered. Order Granting Mot. ¶ 3.', 'Order Granting Mot. ¶ 3'],
  ]) {
    const cites = findCitations(text).filter(cite => cite.type === 'unparsed');
    assert.deepEqual(
      cites.map(cite => cite.text),
      [run],
      text,
    );
    assert.equal(citationKey(cites[0]), `unparsed:${run.replace(/\s+/g, '')}`);
    // It attaches to the claim it supports, like any citation.
    assert.equal(attached(text).length, 1, text);
    assert.ok(isCitationSentence(text.slice(text.indexOf(run))), run);
  }
  // An unparsed run never overlaps a citation the parser read.
  assert.deepEqual(types('Smith v. Jones, 1 F.3d 2, 3 (2d Cir. 1990); Admin. R. 45.'), [
    ['full', 'Smith v. Jones, 1 F.3d 2, 3 (2d Cir. 1990)'],
    ['unparsed', 'Admin. R. 45'],
  ]);
  // Nor does the title before it run back into a sentence word or the sentence before.
  assert.deepEqual(types('In Joint Stip. ¶ 4, they agreed.'), [['unparsed', 'Joint Stip. ¶ 4']]);
  assert.deepEqual(types('The Joint Stip. ¶ 4 says so.'), [['unparsed', 'Joint Stip. ¶ 4']]);
  // A string of them is two, split at the semicolon, and a signal is read as for any other.
  const two = findCitations('See Joint Stip. ¶ 4; Admin. R. 45.');
  assert.deepEqual(
    two.map(cite => [cite.type, cite.text, cite.signal]),
    [
      ['unparsed', 'Joint Stip. ¶ 4', 'See'],
      ['unparsed', 'Admin. R. 45', null],
    ],
  );
  // An id. after one refers to it.
  const id = 'The record shows it. Admin. R. 45. The agency agreed. Id. at 46.';
  const resolved = resolveCitations(id, findCitations(id));
  assert.equal(resolved.at(-1).refersTo, 0);
  // A suggestion with a new one is caught as unseen.
  assert.deepEqual(
    unseenCitations('The record shows it. Admin. R. 45.', 'It agreed. Admin. R. 46.').map(
      cite => cite.text,
    ),
    ['Admin. R. 46'],
  );
});

test('ordinary prose has no citation-shaped runs', () => {
  for (const text of [RECIPE, EMAIL]) assert.deepEqual(types(text), [], text.slice(0, 30));
  // The informal and non-legal fixtures: every citation in them is one the parser reads.
  for (const key of ['informal', 'non-legal'])
    assert.deepEqual(
      findCitations(documentText(blocksOf(key))).filter(cite => cite.type === 'unparsed'),
      [],
      key,
    );
  for (const phrase of [
    'The family lives in Section 8 housing.',
    'The company filed for Chapter 11 protection.',
    'She called the Title IX coordinator.',
    'Its Form 10-K reports the loss.',
    'He rolled over his 401(k) plan.',
    'She wore jersey No. 23 in the final.',
    'They met in Room No. 12-3 on the third floor.',
    'It closes at 3 p.m. on Mar. 3, 2023, and costs $40, or 5% more.',
    'Bake at 350 F. for 20 min.',
    'She has visited 48 U.S. states.',
    'He was born in the U.S. 2020 was hard.',
    'He met Smith. 5 days later he left.',
  ])
    assert.deepEqual(types(phrase), [], phrase);
  // No sentence of them reads as a citation to attach to the one before.
  for (const text of [RECIPE, EMAIL])
    assert.deepEqual(attached(text), texts(legalSentences(text, 'en')));
});

test('citationRuns finds every citation-shaped run, read or not', () => {
  const text = 'The deadline is thirty days. Fed. R. App. P. 4(a)(1)(A). See SAC ¶ 12.';
  assert.deepEqual(
    citationRuns(text).map(([start, end]) => text.slice(start, end)),
    ['Fed. R. App. P. 4(a)(1)(A)', 'SAC ¶ 12'],
  );
  // A parenthetical with a number sits inside a run; one without ends it.
  const code = 'Model Penal Code § 2.02 (Am. L. Inst. 1985) (defining mens rea).';
  assert.deepEqual(
    citationRuns(code).map(([start, end]) => code.slice(start, end)),
    ['§ 2.02 (Am. L. Inst. 1985)'],
  );
  assert.deepEqual(
    ['45:3-9', '§', 'Pl.’s', 'Stip.', 'ILCS', 'at', 'the', 'p.m.', '$40', 'Dr.'].map(
      citationTokenClass,
    ),
    ['num', 'mark', 'abbr', 'word.', 'acro', 'inside', null, null, null, null],
  );
});

test('R1: record citations in Bluepages and other forms', () => {
  for (const record of [
    "Pl.'s Mot. Summ. J. 5",
    'Def.’s Mem. Supp. Mot. Dismiss 12',
    "Appellant's Opening Br. 12",
    'Trial Tr. vol. 2, 45:3-9',
    'Tr. of Oral Arg. 12:4',
    'SAC ¶ 12',
    'FAC ¶¶ 3–5',
    'Answer ¶ 5',
    'Second Am. Compl. ¶ 12',
    'Doc. 45 at 3',
    'ECF No. 45-2, at 3',
    'ECF No. 12, PageID.345',
    'PX 12 at 3',
    "Pl.'s Ex. 5 at 2",
    '2-ER-123',
    'App. 45',
    "Pl.'s Resp. to Interrog. No. 3",
    'Resp. to Interrog. No. 3',
    "Def.'s Resp. to Req. for Admis. No. 4",
  ]) {
    const cite = only(`${record}.`);
    assert.equal(cite.type, 'record', record);
    assert.equal(cite.text, record);
    assert.deepEqual(attached(`The motion was filed late. ${record}.`).length, 1, record);
  }
  assert.deepEqual(types('The motion was filed late. (R. 45.)'), [['record', 'R. 45']]);
  assert.deepEqual(types("Pl.'s Reply 5."), [['record', "Pl.'s Reply 5"]]);
  assert.deepEqual(types("Plaintiff's Reply 3 days late was struck."), []);
  // Facts with Bluepages record cites are two sentences, each with its record.
  assert.deepEqual(
    attached("Doe signed in 2020. Pl.'s Mot. Summ. J. 5. Roe never paid. SAC ¶ 9."),
    ["Doe signed in 2020. Pl.'s Mot. Summ. J. 5.", 'Roe never paid. SAC ¶ 9.'],
  );
  // A court's "App." and a page in prose are not the appendix or the record.
  assert.deepEqual(
    types('Smith v. Jones, 123 Cal. App. 4th 45, 50 (2004).').map(([type]) => type),
    ['full'],
  );
  assert.deepEqual(types('He met John R. 45 times.'), []);
});

test('R2: US public-domain citations, slip opinions, Lexis short forms and history', () => {
  const doe = only('People v. Doe, 2020 IL 124112, ¶ 20.');
  assert.deepEqual(
    [doe.type, doe.name, doe.volume, doe.reporter, doe.page, doe.pin, doe.court, doe.year],
    ['full', 'People v. Doe', '2020', 'IL', '124112', '¶ 20', 'Ill.', '2020'],
  );
  assert.equal(doe.neutral, true);
  assert.equal(citationKey(doe), '2020 IL 124112');
  const ohio = only('State v. Doe, 2021-Ohio-1234, ¶ 15 (8th Dist.).');
  assert.deepEqual(
    [ohio.reporter, ohio.page, ohio.pin, ohio.court],
    ['Ohio', '1234', '¶ 15', 'Ohio Ct. App. (8th Dist.)'],
  );
  assert.equal(only('People v. Roe, 2019 IL App (1st) 123456-U, ¶ 12.').court, 'Ill. App. Ct.');
  const roe = only('State v. Roe, 2015 WI 50, ¶ 10, 362 Wis. 2d 1, 864 N.W.2d 1.');
  assert.deepEqual(
    [roe.name, roe.pin, roe.court, roe.parallel.map(p => `${p.volume} ${p.reporter} ${p.page}`)],
    ['State v. Roe', '¶ 10', 'Wis.', ['362 Wis. 2d 1', '864 N.W.2d 1']],
  );
  // Its short form repeats it after the name, and resolves to it.
  const text = 'People v. Doe, 2020 IL 124112, ¶ 20. The rule holds. Doe, 2020 IL 124112, ¶ 22.';
  const cites = resolveCitations(text, findCitations(text));
  assert.deepEqual(
    cites.map(cite => [cite.type, cite.antecedent, cite.pin, cite.refersTo]),
    [
      ['full', null, '¶ 20', undefined],
      ['short', 'Doe', '¶ 22', 0],
    ],
  );
  // Different decisions of one year are different authorities.
  assert.notEqual(citationKey(only('2019 SCC 65.')), citationKey(only('2019 SCC 66.')));
  // A slip opinion's page; a Lexis cite is a database number, so its short form resolves.
  const slip = only('Smith v. Jones, No. 21-1234, slip op. at 5 (2d Cir. Mar. 3, 2022).');
  assert.deepEqual(
    [slip.type, slip.docket, slip.pin, slip.court],
    ['docket', 'No. 21-1234', '5', '2d Cir.'],
  );
  const lexis =
    'Doe v. Roe, 2021 U.S. Dist. LEXIS 12345, at *5 (D. Mass. Jan. 5, 2021). Doe, 2021 U.S. Dist. LEXIS 12345, at *7.';
  const read = resolveCitations(lexis, findCitations(lexis));
  assert.deepEqual(
    read.map(cite => [cite.type, citationKey(cite), cite.refersTo]),
    [
      ['docket', '2021 U.S. Dist. LEXIS 12345', undefined],
      ['short', '2021 U.S. Dist. LEXIS 12345', 0],
    ],
  );
  // Subsequent history is part of the citation it follows.
  const history = only(
    'Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), aff’d in part, rev’d in part, 535 U.S. 1 (2002), cert. denied, 536 U.S. 2 (2003).',
  );
  assert.deepEqual(
    [history.name, citationKey(history), history.pin, history.history],
    [
      'Smith v. Jones',
      '123 F.3d',
      '460',
      ['aff’d in part, rev’d in part, 535 U.S. 1 (2002)', 'cert. denied, 536 U.S. 2 (2003)'],
    ],
  );
  assert.deepEqual(only('Smith v. Jones, 123 F.3d 456 (2d Cir. 2001), cert. denied.').history, [
    'cert. denied',
  ]);
  const abrogated = only(
    'See Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990), abrogated on other grounds by Poe v. Moe, 2 F.3d 2 (2d Cir. 1991).',
  );
  assert.deepEqual(abrogated.history, [
    'abrogated on other grounds by Poe v. Moe, 2 F.3d 2 (2d Cir. 1991)',
  ]);
  // Texas's petition history stays in the court parenthetical, and the court is read.
  const texas = only(
    'Smith v. Jones, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] 2003, pet. denied).',
  );
  assert.deepEqual(
    [texas.court, texas.year, texas.history],
    ['Tex. App.—Houston [14th Dist.]', '2003', ['pet. denied']],
  );
  assert.equal(only('Hadley v Baxendale [1854] EWHC J70 (Exch).').name, 'Hadley v Baxendale');
});

test('R3: California footnotes, notes, opinions, treatises and jury instructions attach', () => {
  const full = 'The duty is owed to invitees. (Smith v. Jones (2001) 1 Cal.4th 1, 5.)';
  for (const cite of [
    '(Id. at p. 6, fn. 3.)',
    '(Smith, supra, 1 Cal.4th at p. 6, italics added.)',
    '(Smith, supra, 1 Cal.4th at pp. 6–7, conc. opn. of Kennard, J.)',
    '(See generally 6 Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234.)',
    '(Weil & Brown, Cal. Practice Guide: Civil Procedure Before Trial (The Rutter Group 2020) ¶ 9:123.)',
    '(CACI No. 1001.)',
    '(Rest.2d Torts, § 402A, com. c.)',
  ])
    assert.equal(attached(`${full} Further, the rule is settled. ${cite}`).length, 2, cite);
  assert.equal(only('Id. at p. 6, fn. 3.').pin, '6, fn. 3');
  const supra = only('Smith, supra, 1 Cal.4th at pp. 6–7, conc. opn. of Kennard, J.');
  assert.deepEqual(supra.parentheticals, ['conc. opn. of Kennard, J.']);
  const witkin = only('6 Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234.');
  assert.deepEqual(
    [witkin.type, witkin.author, witkin.title, witkin.pin, witkin.year],
    ['secondary', 'Witkin', 'Summary of Cal. Law', '§ 1234', '2017'],
  );
});

test('R4: case names after a court, ex parte, family matters, firms, and common words', () => {
  assert.equal(
    only('This Court in Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990), held otherwise.').name,
    'Smith v. Jones',
  );
  const called = text => {
    const cites = findCitations(text);
    return [cites[0].name, shortName(cites[0], cites), [...referenceNames(cites).keys()]];
  };
  assert.deepEqual(called('See Ex parte Young, 209 U.S. 123, 159 (1908).'), [
    'Ex parte Young',
    'Young',
    ['Young'],
  ]);
  assert.deepEqual(called('In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).'), [
    'In re Marriage of Bonds',
    'Bonds',
    ['Bonds', 'Marriage of Bonds'],
  ]);
  assert.equal(
    called('NLRB v. Jones & Laughlin Steel Corp., 301 U.S. 1, 30 (1937).')[1],
    'Jones & Laughlin',
  );
  // A common word that begins a case name is not a name on its own; the whole name is.
  for (const [text, not, is] of [
    [
      'Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837, 842 (1984).',
      'Natural',
      'Chevron',
    ],
    ['In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).', 'Marriage', 'Marriage of Bonds'],
    [
      'Am. Express Co. v. Italian Colors Rest., 570 U.S. 228, 233 (2013).',
      'Italian',
      'Italian Colors Rest.',
    ],
    [
      'Friends of the Earth, Inc. v. Laidlaw Env’t Servs., 528 U.S. 167, 180 (2000).',
      'Friends',
      'Friends of the Earth',
    ],
    ['Citizens United v. FEC, 558 U.S. 310, 340 (2010).', 'Citizens', 'Citizens United'],
    [
      'Students for Fair Admissions, Inc. v. President & Fellows of Harvard Coll., 600 U.S. 181, 200 (2023).',
      'Students',
      'Students for Fair Admissions',
    ],
  ]) {
    const names = referenceNames(findCitations(text));
    assert.ok(!names.has(not), not);
    assert.ok(names.has(is), is);
  }
  assert.ok(CASE_NAME_WORDS.has('Natural') && CASE_NAME_WORDS.has('County'));
  assert.equal(distinctiveName('Natural'), false);
  assert.equal(distinctiveName('Natural Res. Def. Council'), true);
  assert.equal(distinctiveName('Lakeside'), true);
  // A one-word name the document also uses in lowercase is a word there, not a name.
  const brown = 'Brown v. Bd. of Educ., 347 U.S. 483, 495 (1954). He wore brown shoes.';
  assert.equal(distinctiveName('Brown', brown), false);
  assert.ok(referenceNames(findCitations(brown)).has('Brown'));
  assert.ok(!referenceNames(findCitations(brown), brown).has('Brown'));
});

test('R5: a document’s sections are internal; "Claim No." is no docket', () => {
  for (const [text, internal] of [
    ['Under Code of Conduct § 2, employees must report gifts.', 'Conduct § 2'],
    ['Statement of Work § 3 lists the deliverables.', 'Work § 3'],
    ['Term Sheet § 2 sets the valuation.', 'Sheet § 2'],
    ['Terms of Service § 4 bars scraping.', 'Service § 4'],
    ['Under § 4.2 of the Statement of Work, the vendor must deliver.', '§ 4.2'],
    ['The Lease says the deposit is forfeited under § 3.', '§ 3'],
  ])
    assert.deepEqual(types(text), [['internal', internal]], text);
  // A sentence that also names a code, or a statute's acronym, keeps the section a statute's.
  assert.deepEqual(types('Under the Lease and Penal Code § 1671, the deposit is forfeited.'), [
    ['section', '§ 1671'],
  ]);
  assert.deepEqual(types('The Plan violated ERISA § 404.'), [['section', '§ 404']]);
  assert.deepEqual(types('Claim No. 2023-0045 was denied by the insurer.'), []);
});

test('R9: rules, regulations and other authority in their usual forms', () => {
  for (const [text, type] of [
    ['Fed. R. App. P. 4(a)(1)(A)', 'statute'],
    ['Sup. Ct. R. 10', 'statute'],
    ['S.D.N.Y. Local Civ. R. 6.3', 'statute'],
    ['N.D. Cal. Civ. L.R. 7-3', 'statute'],
    ['Treas. Reg. § 1.162-1(a) (2023)', 'statute'],
    ['12 C.F.R. pt. 1026, supp. I', 'statute'],
    ['735 Ill. Comp. Stat. 5/2-619 (2022)', 'statute'],
    ['735 ILCS 5/2-619(a)(9)', 'statute'],
    ['Mass. Gen. Laws ch. 93A', 'statute'],
    ['G.L. c. 93A, § 2', 'statute'],
    ['U.C.C. § 2-207 (Am. L. Inst. & Unif. L. Comm’n 2022)', 'statute'],
    ['Model Penal Code § 2.02 (Am. L. Inst. 1985)', 'statute'],
    ['Exec. Order No. 14,028, 86 Fed. Reg. 26,633 (May 12, 2021)', 'statute'],
    ['Stats. 2019, ch. 296, § 2', 'statute'],
    ['Assem. Bill No. 5 (2019–2020 Reg. Sess.) § 2', 'legislative'],
    ['Rev. Rul. 2004-1, 2004-1 C.B. 1', 'secondary'],
  ]) {
    const cite = only(`(${text}.)`);
    assert.deepEqual([cite.type, cite.text], [type, text]);
    assert.deepEqual(attached(`The deadline is thirty days. ${text}.`).length, 1, text);
  }
  const key = text => citationKey(only(text));
  assert.equal(key('735 ILCS 5/2-619.'), key('735 Ill. Comp. Stat. 5/2-619 (2022).'));
  assert.notEqual(key('735 ILCS 5/2-619.'), key('735 ILCS 5/2-615.'));
  assert.notEqual(key('Mass. Gen. Laws ch. 93A, § 2.'), key('Mass. Gen. Laws ch. 93, § 2.'));
  assert.equal(key('Exec. Order No. 14,028.'), key('Exec. Order 14028, 86 Fed. Reg. 26,633.'));
  const bill = only('Assem. Bill No. 5 (2019–2020 Reg. Sess.) § 2.');
  assert.deepEqual([bill.pin, bill.year], ['§ 2', '2019']);
});

// ---------------------------------------------------------------------------
// The long tail, third round (tests/long-tail.test.mjs has the verifier's cases)
// ---------------------------------------------------------------------------

test('a court parenthetical’s "filed" is not the court, and old English divisions are read', () => {
  const docket = only('Doe v. Roe, No. 1:20-cv-1234 (S.D.N.Y. filed Jan. 5, 2021).');
  assert.deepEqual([docket.court, docket.date, docket.year], ['S.D.N.Y.', 'Jan. 5, 2021', '2021']);
  assert.equal(
    only('Smith v. Jones, 1 F.3d 1, 2 (2d Cir. decided Mar. 3, 1990).').court,
    '2d Cir.',
  );
  // A retrospective neutral citation keeps its court, as "[2019] EWHC 123 (Ch)" does.
  const hadley = only('Hadley v Baxendale [1854] EWHC J70 (Exch).');
  assert.deepEqual(
    [hadley.court, hadley.text],
    ['EWHC (Exch)', 'Hadley v Baxendale [1854] EWHC J70 (Exch)'],
  );
});

test('California’s "Accord," is a signal, with or without its comma', () => {
  assert.equal(only('(Accord, Doe v. Roe (1990) 2 Cal.4th 2, 3.)').signal, 'Accord');
  assert.equal(only('(Accord Doe v. Roe (1990) 2 Cal.4th 2, 3.)').signal, 'Accord');
  assert.equal(only('Accord Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990).').signal, 'Accord');
});

test('English and Canadian short forms give the name and a paragraph', () => {
  for (const [text, antecedent, pin, signal] of [
    ['Doe at para 6.', 'Doe', 'para 6', null],
    ['See Jones at [47]–[48].', 'Jones', '[47]–[48]', 'See'],
    ['In Oakes at paras 5–7, the Court said so.', 'Oakes', 'paras 5–7', null],
  ]) {
    const cite = only(text);
    assert.deepEqual(
      [cite.type, cite.antecedent, cite.volume, cite.pin, cite.signal],
      ['supra', antecedent, null, pin, signal],
      text,
    );
  }
  // It stands for the case its name names, and attaches to the claim before it.
  const text =
    'The rule is settled. Jones v Smith [2020] EWCA Civ 1234 at [45]. It applies. Jones at [47].';
  assert.equal(resolveCitations(text, findCitations(text)).at(-1).refersTo, 0);
  assert.deepEqual(attached('It applies. Doe at para 6.'), ['It applies. Doe at para 6.']);
  // A letter or a number is no case's name, and neither is prose.
  for (const prose of [
    'Annex B at para 4 says so.',
    'Schedule 2 at [3] lists them.',
    'They met at [the] park.',
  ])
    assert.deepEqual(types(prose), [], prose);
});

test('short names spell out a direction and keep "Estate of"', () => {
  const short = text => {
    const cites = findCitations(text);
    return shortName(cites[0], cites);
  };
  assert.equal(
    short('Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 68 (2006).'),
    'Burlington Northern',
  );
  assert.equal(short('Union Pac. R.R. Co. v. Price, 360 U.S. 601, 602 (1959).'), 'Union Pacific');
  assert.equal(short('Estate of Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).'), 'Estate of Smith');
  assert.equal(
    short('Estate of John Gonzalez v. Hickman, 1 F.3d 1 (9th Cir. 1990).'),
    'Estate of John Gonzalez',
  );
  // Another word after the first is not spelled out, and "Burlington Indus." stays "Burlington".
  assert.equal(
    short('Burlington Indus., Inc. v. Ellerth, 524 U.S. 742, 765 (1998).'),
    'Burlington',
  );
  const names = referenceNames(
    findCitations('Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 68 (2006).'),
  );
  assert.ok(names.has('Burlington Northern') && names.has('Burlington'));
});

test('an executive order’s section and a bill by its Congress stay one citation', () => {
  const order = only('Exec. Order No. 14,028, § 2, 86 Fed. Reg. 26,633, 26,634 (May 12, 2021).');
  assert.deepEqual(
    [order.type, order.text, citationKey(order)],
    [
      'statute',
      'Exec. Order No. 14,028, § 2, 86 Fed. Reg. 26,633, 26,634 (May 12, 2021)',
      'Exec.OrderNo.14028',
    ],
  );
  for (const [text, pin, year] of [
    ['H.R. 1234, 117th Cong. § 3 (2021)', '§ 3', '2021'],
    ['S. 1, 118th Cong. (2023)', null, '2023'],
    ['H.R.J. Res. 7, 117th Cong. § 2(a) (2021)', '§ 2(a)', '2021'],
  ]) {
    const bill = only(`Congress tried. ${text}.`);
    assert.deepEqual([bill.type, bill.text, bill.pin, bill.year], ['legislative', text, pin, year]);
  }
  // A bill with no Congress is still a citation, in a form the parser does not know.
  assert.deepEqual(types('Congress acted. H.R. 1234.'), [['unparsed', 'H.R. 1234']]);
});

test('Virgin Islands and unhyphenated New Mexico public-domain citations', () => {
  for (const [text, court, key] of [
    ['Smith v. Jones, 2018 VI 12, ¶ 5.', 'V.I.', '2018 VI 12'],
    ['State v. Doe, 2018 NMSC 12, ¶ 5.', 'N.M.', '2018 NMSC 12'],
    ['State v. Doe, 2018 NMCA 3, ¶ 9.', 'N.M. Ct. App.', '2018 NMCA 3'],
  ]) {
    const cite = only(text);
    assert.deepEqual(
      [cite.type, cite.court, cite.pin, citationKey(cite)],
      ['full', court, cite.pin, key],
    );
    assert.equal(cite.text, text.slice(0, -1));
  }
});

test('an id. may cite a constitution’s other article or amendment', () => {
  for (const [text, id, pin] of [
    ['The President executes the laws. Id. art. II, § 3.', 'Id. art. II, § 3', 'art. II, § 3'],
    ['The Senate tries impeachments. Id. art. I.', 'Id. art. I', 'art. I'],
    ['The States may not deny it. Id. amend. XIV, § 1.', 'Id. amend. XIV, § 1', 'amend. XIV, § 1'],
    [
      'Speech is protected. (Id., art. I, § 2, subd. (a).)',
      'Id., art. I, § 2, subd. (a)',
      'art. I, § 2, subd. (a)',
    ],
  ]) {
    const cite = only(text);
    assert.deepEqual([cite.type, cite.text, cite.pin], ['id', id, pin], text);
  }
  assert.deepEqual(types('Id. articles were filed.'), [['id', 'Id.']]);
});

test('citation-shaped runs: the sentence before, a missing space, and an address', () => {
  const runs = text => citationRuns(text).map(([start, end]) => text.slice(start, end));
  // The word that ends the sentence before a citation is not part of it.
  assert.deepEqual(runs('She lives in Queens. Compl. ¶ 9.'), ['Compl. ¶ 9']);
  assert.deepEqual(runs('He worked in the Bronx. Id. ¶¶ 12–14.'), ['Id. ¶¶ 12–14']);
  // An unlisted abbreviation still counts beside a mark or after a listed one.
  assert.deepEqual(runs('The parties agree. Joint Stip. ¶ 4.'), ['Joint Stip. ¶ 4']);
  assert.deepEqual(runs('He answered. Resp. to Interrog. No. 3.'), ['Resp. to Interrog. No. 3']);
  // A sentence written with no space after a citation does not run into it.
  assert.deepEqual(runs('The rule is in § 3602(c).The court agreed.'), ['§ 3602(c)']);
  assert.deepEqual(runs('See SAC ¶ 12.The court agreed.'), ['SAC ¶ 12']);
  // A state's postal code and a ZIP code are an address, not a citation.
  for (const text of [
    'Mail it to San Francisco, CA 94103, U.S.A.',
    'Send it to 1 Main St., San Francisco, CA 94103, U.S.A. today.',
    'Our office is at 10 Wacker Dr., Chicago, IL 60606-1234.',
  ]) {
    assert.deepEqual(runs(text), [], text);
    assert.deepEqual(types(text), [], text);
  }
  // A public-domain citation is no address.
  assert.deepEqual(
    types('People v. Doe, 2020 IL 12411.').map(([type]) => type),
    ['full'],
  );
});

test('Illinois briefs: the record by its volume letter, and court and local rules', () => {
  // The common-law record, the report of proceedings, the appendix and supplements.
  assert.deepEqual(types('Raman fell. (C. 45-47; R. 12.)'), [
    ['record', 'C. 45-47'],
    ['record', 'R. 12'],
  ]);
  for (const record of ['A. 3', 'Sup. C. 3', 'SR 4'])
    assert.deepEqual(types(`Raman fell. (${record}.)`), [['record', record]], record);
  assert.deepEqual(attached('Raman fell. (C. 45.)'), ['Raman fell. (C. 45.)']);
  // A letter and a number in parentheses with words after them is prose.
  assert.deepEqual(types('He ate the rest (C. 45 apples).'), []);
  // A complaint's exhibit, by page or paragraph.
  assert.deepEqual(types('It says so. (Compl. Ex. A, at 2.)'), [['record', 'Compl. Ex. A, at 2']]);
  assert.deepEqual(types('It says so. (Compl. Ex. A ¶ 7.)'), [['record', 'Compl. Ex. A ¶ 7']]);
  // Illinois Supreme Court and Appellate Court rules, with their effective dates.
  for (const [rule, key] of [
    ['Ill. S. Ct. R. 341(h)(7) (eff. Oct. 1, 2020)', 'Ill.S.Ct.R.341'],
    ['Ill. S. Ct. R. 303', 'Ill.S.Ct.R.303'],
    ['Ill. App. Ct. R. 1', 'Ill.App.Ct.R.1'],
    // A local court's rules, by its place and level.
    ['Cook Cnty. Cir. Ct. R. 2.1(c) (eff. Jan. 1, 2017)', 'CookCnty.Cir.Ct.R.2.1'],
    ['Cook County Cir. Ct. R. 2.1', 'CookCountyCir.Ct.R.2.1'],
    ['Cir. Ct. Cook Cnty. R. 2.3', 'Cir.Ct.CookCnty.R.2.3'],
    ['L.A. Super. Ct. Local R. 3', 'L.A.Super.Ct.LocalR.3'],
    ['D.C. Super. Ct. Civ. R. 12(b)', 'D.C.Super.Ct.Civ.R.12'],
  ]) {
    const cite = only(`The rule applies. ${rule}.`);
    assert.deepEqual([cite.type, cite.text, citationKey(cite)], ['statute', rule, key], rule);
    assert.deepEqual(attached(`The rule applies. ${rule}.`).length, 1, rule);
  }
  // A Restatement's subsection is part of its section.
  const restatement = only('Restatement (Second) of Contracts § 195(1) (Am. L. Inst. 1981).');
  assert.deepEqual(
    [restatement.text, restatement.pin],
    ['Restatement (Second) of Contracts § 195(1) (Am. L. Inst. 1981)', '§ 195(1)'],
  );
});

test('statutes, rules, books and the record take their explanatory parentheticals', () => {
  for (const [text, body, parenthetical] of [
    [
      '28 U.S.C. § 1291 (granting jurisdiction over final decisions)',
      '28 U.S.C. § 1291',
      'granting jurisdiction over final decisions',
    ],
    [
      'Fed. R. Civ. P. 12(b)(6) (allowing dismissal)',
      'Fed. R. Civ. P. 12(b)(6)',
      'allowing dismissal',
    ],
    [
      'Restatement (Second) of Torts § 343 (Am. L. Inst. 1965) (duty to invitees)',
      'Restatement (Second) of Torts § 343 (Am. L. Inst. 1965)',
      'duty to invitees',
    ],
    [
      'Black’s Law Dictionary (11th ed. 2019) (defining “release”)',
      'Black’s Law Dictionary (11th ed. 2019)',
      'defining “release”',
    ],
    ['Compl. ¶ 9 (alleging the fall)', 'Compl. ¶ 9', 'alleging the fall'],
    ['Joint Stip. ¶ 4 (agreeing to the facts)', 'Joint Stip. ¶ 4', 'agreeing to the facts'],
    ['Civ. Code, § 1714, subd. (a) [duty of care]', 'Civ. Code, § 1714, subd. (a)', 'duty of care'],
  ]) {
    const sentence = `The rule is settled. ${text}.`;
    const cite = only(sentence);
    assert.deepEqual(
      [cite.text, cite.body, cite.parentheticals.at(-1)],
      [text, body, parenthetical],
    );
    // Its key is its body's, so a later mention without the parenthetical is the same one.
    assert.equal(citationKey(cite), citationKey(only(`${body}.`)), text);
    assert.deepEqual(attached(sentence), [sentence], text);
  }
  // A citation inside the parenthetical is nested in it.
  const quoting = findCitations(
    '28 U.S.C. § 1291 (quoting Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990)).',
  );
  assert.deepEqual(
    quoting.map(cite => [cite.type, Boolean(cite.nested)]),
    [
      ['statute', false],
      ['full', true],
    ],
  );
  // A string citation ending in one stays with its claim.
  const string =
    'Releases of reckless conduct are void. Doe v. Roe, 2019 IL 124321, ¶ 30; see also Restatement (Second) of Contracts § 195(1) (Am. L. Inst. 1981) (a term exempting a party from liability for reckless harm is unenforceable).';
  assert.deepEqual(attached(string), [string]);
});

test('shortName takes the name the document uses in running text', () => {
  const cites = findCitations('Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).');
  assert.equal(shortName(cites[0], cites), 'Ashcroft');
  assert.equal(shortName(cites[0], cites, 'Under Iqbal, a claim must be plausible.'), 'Iqbal');
  assert.equal(shortName(cites[0], cites, 'Ashcroft and Iqbal both appear.'), 'Ashcroft');
  // The writer's own short form still wins.
  const twombly = findCitations(
    'Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570 (2007). Twombly, 550 U.S. at 555.',
  );
  assert.equal(shortName(twombly[0], twombly, 'Bell Atlantic argued otherwise.'), 'Twombly');
});

test('legalSentences stays fast on thousands of breaks after initials', () => {
  // Each break once split the last 400 characters into words to read the last two; on
  // "A. A. A. …" that took 60 ms. The best of three runs is well under 40 ms now.
  for (const unit of ['A. ', 'A. 1 ', 'C. 1 ', 'J. Smith. ']) {
    const text = unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000);
    legalSentences(text, 'en', { attachCitations: true });
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const at = performance.now();
      legalSentences(text, 'en', { attachCitations: true });
      best = Math.min(best, performance.now() - at);
    }
    assert.ok(best < 40, `${unit}: ${best} ms`);
  }
});

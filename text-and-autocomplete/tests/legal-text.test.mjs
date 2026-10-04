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
  // Without the document, Twombly goes by its plaintiff; a nameless cite by its book.
  assert.equal(shortName(fulls[0]), 'Bell');
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
  ]) {
    const text = fill(unit);
    findCitations(text);
    const at = performance.now();
    findCitations(text);
    assert.ok(performance.now() - at < 100, unit);
  }
});

// Regression tests for the long tail of legal forms. After the first generality round an
// independent verifier wrote break tests in ten clusters (R1–R10): record citations, case
// grammar, California forms, names, sections and numbers, headings, id., signals and
// history, non-case authorities, and the guard. It also found four of the first round's
// problems only partly fixed (AN-12, AN-13, LT-12/AN-17 and LT-25). Each test below states
// the result a careful reviewer expects, so a form that works today keeps working, and one
// that a later change breaks shows which form it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findCitations,
  citationKey,
  shortName,
  referenceNames,
  citationRuns,
} from '../dist/legal-text.js';
import { analyzeLegal, sectionsOf } from '../dist/legal-analysis.js';
import {
  citationContext,
  combineRefusal,
  cutAtCitation,
  guardInsertion,
  guardReplacement,
  selectionRefusal,
} from '../dist/citation-guard.js';
import { completionAnchor, inspectCompletion } from '../dist/compose-core.js';
import { sentencesIn } from '../dist/doc-model.js';

const S = text => sentencesIn(text, 'en').map(sentence => sentence.text);
const doc = list =>
  list.map(([kind, text], index) => ({ index, kind, text, sentences: sentencesIn(text, 'en') }));
const paragraphs = list => doc(list.map(text => ['p', text]));
// The citations of `text` that are not inside another's parenthetical, as [type, text].
const cites = text =>
  findCitations(text)
    .filter(cite => !cite.nested)
    .map(cite => [cite.type, cite.text]);
const chips = sentence => sentence.cites.map(cite => `${cite.label}{${cite.state}}`);
const rows = reading =>
  reading.authorities.map(row => `${row.group} | ${row.title} | n=${row.count}`);
// The guard on rewriting `original` (the whole document) as `replacement`.
const rewrite = (original, replacement) => guardReplacement(original, original, replacement);

// ---------------------------------------------------------------------------
// R1 – record citations
// ---------------------------------------------------------------------------

test('R1: record citations in every common form attach to their claim, whole', () => {
  const claim = 'The motion was filed late.';
  for (const [form, expected] of [
    ["Pl.'s Mot. Summ. J. 5.", [['record', "Pl.'s Mot. Summ. J. 5"]]],
    ['Def.’s Mem. Supp. Mot. Dismiss 12.', [['record', 'Def.’s Mem. Supp. Mot. Dismiss 12']]],
    ['Trial Tr. vol. 2, 45:3-9.', [['record', 'Trial Tr. vol. 2, 45:3-9']]],
    ['SAC ¶ 12.', [['record', 'SAC ¶ 12']]],
    ['FAC ¶¶ 3–5.', [['record', 'FAC ¶¶ 3–5']]],
    ['Second Am. Compl. ¶ 12.', [['record', 'Second Am. Compl. ¶ 12']]],
    ['Answer ¶ 5.', [['record', 'Answer ¶ 5']]],
    ['Doc. 45 at 3.', [['record', 'Doc. 45 at 3']]],
    ['ECF No. 45-2, at 3.', [['record', 'ECF No. 45-2, at 3']]],
    ['PX 12 at 3.', [['record', 'PX 12 at 3']]],
    ["Pl.'s Ex. 5 at 2.", [['record', "Pl.'s Ex. 5 at 2"]]],
    ['2-ER-123.', [['record', '2-ER-123']]],
    ['App. 45.', [['record', 'App. 45']]],
    ['Resp. to Interrog. No. 3.', [['record', 'Resp. to Interrog. No. 3']]],
    ['Doe Dep. 45:3–46:2.', [['record', 'Doe Dep. 45:3–46:2']]],
    ['Smith Aff. ¶ 4.', [['record', 'Smith Aff. ¶ 4']]],
    ['(R. 45.)', [['record', 'R. 45']]],
    [
      '(1 RT 45:3-9; 2 CT 300.)',
      [
        ['record', '1 RT 45:3-9'],
        ['record', '2 CT 300'],
      ],
    ],
    ['(AOB 12.)', [['record', 'AOB 12']]],
    ['See Ex. D at 2.', [['record', 'Ex. D at 2']]],
    ['Tr. of Oral Arg. 12:4.', [['record', 'Tr. of Oral Arg. 12:4']]],
    ['(Clerk’s Tr. 45.)', [['record', 'Clerk’s Tr. 45']]],
    ['Hearing Tr. 12:4-9.', [['record', 'Hearing Tr. 12:4-9']]],
  ]) {
    const text = `${claim} ${form}`;
    assert.deepEqual(S(text), [text], form);
    assert.deepEqual(cites(text), expected, form);
  }
});

test('R1: facts resting on record citations are record, and an id. names the document', () => {
  const facts = analyzeLegal(
    doc([
      ['h2', 'Statement of Facts'],
      ['p', "Doe signed in 2020. Pl.'s Mot. Summ. J. 5. Roe never paid. SAC ¶ 9."],
    ]),
    [
      ['heading', 'framing'],
      ['facts', 'client-fact'],
      ['facts', 'client-fact'],
    ],
  );
  assert.deepEqual(
    facts.sentences.map(sentence => [sentence.text, sentence.support, ...chips(sentence)]),
    [
      ['Statement of Facts', 'n/a'],
      ["Doe signed in 2020. Pl.'s Mot. Summ. J. 5.", 'record', "Pl.'s Mot. Summ. J. 5{own}"],
      ['Roe never paid. SAC ¶ 9.', 'record', 'SAC ¶ 9{own}'],
    ],
  );
  assert.equal(facts.attentionCount, 0);
  assert.deepEqual(facts.authorities, []);
  const withId = analyzeLegal(
    doc([
      ['h2', 'Statement of Facts'],
      [
        'p',
        "Doe signed the lease in 2020. FAC ¶ 3. Roe never paid. Id. ¶ 9. The landlord sued. Pl.'s Mot. Summ. J. 5.",
      ],
    ]),
    [
      ['heading', 'framing'],
      ['facts', 'client-fact'],
      ['facts', 'client-fact'],
      ['facts', 'client-fact'],
    ],
  );
  assert.deepEqual(
    withId.sentences.slice(1).map(sentence => [sentence.support, ...chips(sentence)]),
    [
      ['record', 'FAC ¶ 3{own}'],
      ['record', 'Id. → FAC{own}'],
      ['record', "Pl.'s Mot. Summ. J. 5{own}"],
    ],
  );
  assert.equal(withId.attentionCount, 0);
});

// ---------------------------------------------------------------------------
// R2 – case grammar
// ---------------------------------------------------------------------------

test('R2: reporters, public-domain, database, slip, CSM and Commonwealth case forms', () => {
  const claim = 'The duty is owed to invitees.';
  const read = form => {
    const text = `${claim} ${form}`;
    assert.deepEqual(S(text), [text], form);
    const found = findCitations(text).filter(cite => !cite.nested);
    assert.equal(found.length, 1, form);
    const [cite] = found;
    // The citation runs from its name to its end, without the sentence's period or a
    // California citation's closing parenthesis.
    const written = form.startsWith('(') ? form.slice(1, -2) : form.slice(0, -1);
    assert.equal(cite.text, written, form);
    return {
      type: cite.type,
      name: cite.name,
      pin: cite.pin,
      court: cite.court,
      key: citationKey(cite),
      ...(cite.history ? { history: cite.history } : {}),
    };
  };
  const full = (name, pin, court, key, more = {}) => ({
    type: 'full',
    name,
    pin,
    court,
    key,
    ...more,
  });
  const docket = (name, pin, court, key) => ({ type: 'docket', name, pin, court, key });
  for (const [form, expected] of [
    [
      'Smith v. Jones, 45 F.4th 100, 105 (9th Cir. 2022).',
      full('Smith v. Jones', '105', '9th Cir.', '45 F.4th'),
    ],
    [
      'Doe v. Roe, 600 F. Supp. 3d 100, 105 (S.D.N.Y. 2022).',
      full('Doe v. Roe', '105', 'S.D.N.Y.', '600 F.Supp.3d'),
    ],
    [
      'People v. Doe, 2020 IL 124112, ¶ 20.',
      full('People v. Doe', '¶ 20', 'Ill.', '2020 IL 124112'),
    ],
    ['State v. Doe, 2021-Ohio-1234, ¶ 15.', full('State v. Doe', '¶ 15', 'Ohio', '2021 Ohio 1234')],
    [
      'State v. Roe, 2015 WI 50, ¶ 10, 362 Wis. 2d 1, 864 N.W.2d 1.',
      full('State v. Roe', '¶ 10', 'Wis.', '2015 WI 50'),
    ],
    [
      'Smith v. Jones, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] 2003, pet. denied).',
      full('Smith v. Jones', '460', 'Tex. App.—Houston [14th Dist.]', '123 S.W.3d', {
        history: ['pet. denied'],
      }),
    ],
    [
      'Doe v. Roe, No. 20-cv-1234, 2021 U.S. Dist. LEXIS 12345, at *5 (D. Mass. Jan. 5, 2021).',
      docket('Doe v. Roe', '*5', 'D. Mass.', '2021 U.S. Dist. LEXIS 12345'),
    ],
    [
      'Doe v. Roe, 2021 U.S. App. LEXIS 1234, at *3 (2d Cir. Jan. 5, 2021).',
      docket('Doe v. Roe', '*3', '2d Cir.', '2021 U.S. App. LEXIS 1234'),
    ],
    [
      'Smith v. Jones, No. 21-1234, slip op. at 5 (2d Cir. Mar. 3, 2022).',
      docket('Smith v. Jones', '5', '2d Cir.', 'No. 21-1234'),
    ],
    [
      'Doe v. Roe, No. 2:20-cv-01234-ABC-DEF, 2021 WL 123456, at *2 (C.D. Cal. Jan. 5, 2021).',
      docket('Doe v. Roe', '*2', 'C.D. Cal.', '2021 WL 123456'),
    ],
    // "filed" says when the case was filed; it is not part of the court.
    [
      'Doe v. Roe, No. 1:20-cv-1234 (S.D.N.Y. filed Jan. 5, 2021).',
      docket('Doe v. Roe', null, 'S.D.N.Y.', 'No. 1:20-cv-1234'),
    ],
    [
      '(Smith v. Jones (2d Cir. 2001) 123 F.3d 456, 460.)',
      full('Smith v. Jones', '460', '2d Cir.', '123 F.3d'),
    ],
    [
      '(Doe v. Roe (N.D.Cal. 2019) 400 F.Supp.3d 1, 5.)',
      full('Doe v. Roe', '5', 'N.D.Cal.', '400 F.Supp.3d'),
    ],
    [
      'Commonwealth v. Smith, 456 Mass. 1, 5, 920 N.E.2d 1 (2010).',
      full('Commonwealth v. Smith', '5', null, '456 Mass.'),
    ],
    ['Smith v. Jones, 597 U.S. 1, 5 (2022).', full('Smith v. Jones', '5', null, '597 U.S.')],
    [
      'Smith v. Jones, 142 S. Ct. 2111, 2125 (2022).',
      full('Smith v. Jones', '2125', null, '142 S.Ct.'),
    ],
    // A retrospective neutral citation keeps its division, as a modern one does.
    [
      'Hadley v Baxendale [1854] EWHC J70 (Exch).',
      full('Hadley v Baxendale', null, 'EWHC (Exch)', '[1854] EWHC J70'),
    ],
    [
      'Jones v Smith [2020] EWCA Civ 1234 at [45].',
      full('Jones v Smith', '[45]', 'EWCA Civ', '[2020] EWCACiv 1234'),
    ],
    ['R v Doe, 2015 ONCA 123 at para 4.', full('R v Doe', 'para 4', 'ONCA', '2015 ONCA 123')],
    ['R v Oakes, [1986] 1 SCR 103 at 138.', full('R v Oakes', '138', null, '[1986] 1 SCR')],
    ['Re Smith [2019] UKSC 1.', full('Re Smith', null, 'UKSC', '[2019] UKSC 1')],
  ])
    assert.deepEqual(read(form), expected, form);
});

test('R2: subsequent history is part of the citation it follows, and one authority', () => {
  const claim = 'The duty is owed to invitees.';
  for (const [history, later] of [
    ['aff’d', '535 U.S. 1 (2002)'],
    ['cert. denied', '535 U.S. 1000 (2002)'],
    ['rev’d on other grounds', '535 U.S. 1 (2002)'],
  ]) {
    const form = `Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), ${history}, ${later}.`;
    const text = `${claim} ${form}`;
    assert.deepEqual(S(text), [text]);
    const found = findCitations(text);
    assert.equal(found.length, 1, form);
    assert.equal(found[0].text, form.slice(0, -1));
    assert.deepEqual(found[0].history, [`${history}, ${later}`]);
  }
  const reading = analyzeLegal(
    paragraphs([
      'A rule. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), aff’d, 535 U.S. 1 (2002).',
    ]),
    null,
  );
  assert.deepEqual(rows(reading), [
    'cases | Smith v. Jones, 123 F.3d 456 (2d Cir. 2001), aff’d, 535 U.S. 1 (2002) | n=1',
  ]);
  assert.deepEqual(reading.authorities[0].warnings, []);
});

test('R2: short forms of public-domain, Lexis, Texas and Commonwealth cases resolve', () => {
  const after = (full, short) => {
    const reading = analyzeLegal(paragraphs([`A rule. ${full} Another rule. ${short}`]), null);
    const sentence = reading.sentences.at(-1);
    return [sentence.text, sentence.support, ...chips(sentence), reading.authorities.length];
  };
  assert.deepEqual(after('People v. Doe, 2020 IL 124112, ¶ 20.', 'Doe, 2020 IL 124112, ¶ 22.'), [
    'Another rule. Doe, 2020 IL 124112, ¶ 22.',
    'direct',
    'Doe ¶ 22{own}',
    1,
  ]);
  assert.deepEqual(
    after(
      'Doe v. Roe, 2021 U.S. Dist. LEXIS 12345, at *5 (D. Mass. Jan. 5, 2021).',
      'Doe, 2021 U.S. Dist. LEXIS 12345, at *7.',
    ),
    ['Another rule. Doe, 2021 U.S. Dist. LEXIS 12345, at *7.', 'direct', 'Doe *7{own}', 1],
  );
  assert.deepEqual(
    after(
      'Smith v. Jones, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] 2003, pet. denied).',
      'Smith, 123 S.W.3d at 461.',
    ),
    ['Another rule. Smith, 123 S.W.3d at 461.', 'direct', 'Smith 461{own}', 1],
  );
  assert.deepEqual(
    after('Smith v. Jones, 45 F.4th 100, 105 (9th Cir. 2022).', 'Smith, 45 F.4th at 106.'),
    ['Another rule. Smith, 45 F.4th at 106.', 'direct', 'Smith 106{own}', 1],
  );
  // Canadian (McGill) and English (OSCOLA) short forms give the name and a paragraph.
  assert.deepEqual(after('R v Doe, 2015 ONCA 123 at para 4.', 'Doe at para 6.'), [
    'Another rule. Doe at para 6.',
    'direct',
    'Doe para 6{own}',
    1,
  ]);
  assert.deepEqual(after('Jones v Smith [2020] EWCA Civ 1234 at [45].', 'Jones at [47].'), [
    'Another rule. Jones at [47].',
    'direct',
    'Jones [47]{own}',
    1,
  ]);
});

// ---------------------------------------------------------------------------
// R3 – Bluebook and California forms that must attach
// ---------------------------------------------------------------------------

test('R3: Bluebook id., short forms, signals and history attach to the next claim', () => {
  const full = 'The duty is owed to invitees. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001).';
  const A = 'Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990)';
  for (const [form, expected] of [
    ['Id. at 461 n.3.', [['id', 'Id. at 461 n.3', null, '461 n.3']]],
    ['See id. at 461 & n.4.', [['id', 'id. at 461 & n.4', 'See', '461 & n.4']]],
    [
      'Id. at 461 (Walker, J., concurring).',
      [['id', 'Id. at 461 (Walker, J., concurring)', null, '461']],
    ],
    [
      'Id. at 461 (alterations in original) (citation omitted).',
      [['id', 'Id. at 461 (alterations in original) (citation omitted)', null, '461']],
    ],
    ['Smith, 123 F.3d at 461 n.5.', [['short', 'Smith, 123 F.3d at 461 n.5', null, '461 n.5']]],
    [
      `Smith, 123 F.3d at 461 (quoting ${A}).`,
      [['short', `Smith, 123 F.3d at 461 (quoting ${A})`, null, '461']],
    ],
    [`Accord ${A}.`, [['full', A, 'Accord', '2']]],
    [`Contra ${A}.`, [['full', A, 'Contra', '2']]],
    [`See generally ${A}.`, [['full', A, 'See generally', '2']]],
    [`E.g., ${A}.`, [['full', A, 'E.g.,', '2']]],
    [`See, e.g., ${A}.`, [['full', A, 'See, e.g.,', '2']]],
    [`But cf. ${A}.`, [['full', A, 'But cf.', '2']]],
    [
      `Compare ${A}, with Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991).`,
      [
        ['full', A, 'Compare', '2'],
        ['full', 'Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991)', null, '3'],
      ],
    ],
    [`See ${A} (en banc).`, [['full', `${A} (en banc)`, 'See', '2']]],
    [`${A} (per curiam).`, [['full', `${A} (per curiam)`, null, '2']]],
    [
      `See ${A} (holding that the duty runs to invitees), abrogated on other grounds by Poe v. Moe, 2 F.3d 2 (2d Cir. 1991).`,
      [
        [
          'full',
          `${A} (holding that the duty runs to invitees), abrogated on other grounds by Poe v. Moe, 2 F.3d 2 (2d Cir. 1991)`,
          'See',
          '2',
        ],
      ],
    ],
  ]) {
    const claim = `Further, the rule is settled. ${form}`;
    assert.deepEqual(S(`${full} ${claim}`), [full, claim], form);
    assert.deepEqual(
      findCitations(claim)
        .filter(cite => !cite.nested)
        .map(cite => [cite.type, cite.text, cite.signal, cite.pin]),
      expected,
      form,
    );
  }
});

test('R3: California id., supra, opinion, treatise and signal forms attach', () => {
  const full = 'The duty is owed to invitees. (Smith v. Jones (2001) 1 Cal.4th 1, 5.)';
  const B = 'Doe v. Roe (1990) 2 Cal.4th 2, 3';
  for (const [form, expected] of [
    ['(See also id. at p. 12.)', ['id', 'id. at p. 12', 'See also', '12']],
    [`(Accord, ${B}.)`, ['full', B, 'Accord', '3']],
    ['(Ibid.)', ['id', 'Ibid.', null, null]],
    ['(Id. at p. 6, fn. 3.)', ['id', 'Id. at p. 6, fn. 3', null, '6, fn. 3']],
    [
      '(Smith, supra, 1 Cal.4th at p. 6, italics added.)',
      ['supra', 'Smith, supra, 1 Cal.4th at p. 6, italics added', null, '6'],
    ],
    [
      '(Smith, supra, 1 Cal.4th at pp. 6–7, conc. opn. of Kennard, J.)',
      ['supra', 'Smith, supra, 1 Cal.4th at pp. 6–7, conc. opn. of Kennard, J.', null, '6–7'],
    ],
    [
      '(See generally 6 Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234.)',
      [
        'secondary',
        '6 Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234',
        'See generally',
        '§ 1234',
      ],
    ],
    [`(Cf. ${B}.)`, ['full', B, 'Cf.', '3']],
    [`(But see ${B}.)`, ['full', B, 'But see', '3']],
  ]) {
    const claim = `Further, the rule is settled. ${form}`;
    assert.deepEqual(S(`${full} ${claim}`), [full, claim], form);
    assert.deepEqual(
      findCitations(claim)
        .filter(cite => !cite.nested)
        .map(cite => [cite.type, cite.text, cite.signal ?? null, cite.pin ?? null]),
      [expected],
      form,
    );
  }
  // California's ", italics added" and ", conc. opn. of …" are the supra's parentheticals.
  assert.deepEqual(
    findCitations('(Smith, supra, 1 Cal.4th at p. 6, italics added.)')[0].parentheticals,
    ['italics added'],
  );
});

// ---------------------------------------------------------------------------
// R4 – names
// ---------------------------------------------------------------------------

test('R4: a case’s name starts at its first party, after any sentence words', () => {
  const nameOf = text => findCitations(text).filter(cite => !cite.nested)[0]?.name;
  for (const [text, name] of [
    [
      'Because Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990), controls, the claim fails.',
      'Smith v. Jones',
    ],
    ['Plaintiff relies on Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).', 'Smith v. Jones'],
    [
      'The Court’s decision in Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990), is narrow.',
      'Smith v. Jones',
    ],
    ['Following Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990), courts agree.', 'Smith v. Jones'],
    [
      'Workers’ Comp. Appeals Bd. v. Smith, 1 Cal. 3d 1, 5 (1970).',
      'Workers’ Comp. Appeals Bd. v. Smith',
    ],
    ['Children’s Hosp. v. Smith, 1 Cal. 3d 1, 5 (1970).', 'Children’s Hosp. v. Smith'],
    ['See Ex parte Young, 209 U.S. 123, 159 (1908).', 'Ex parte Young'],
    ['Smith ex rel. Doe v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).', 'Smith ex rel. Doe v. Jones'],
    [
      'The rule comes from In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).',
      'In re Marriage of Bonds',
    ],
    [
      'As the Court explained in Brown v. Bd. of Educ., 347 U.S. 483, 495 (1954), separate is unequal.',
      'Brown v. Bd. of Educ.',
    ],
    ['This Court in Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990), held otherwise.', 'Smith v. Jones'],
    ['Defendants cite Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).', 'Smith v. Jones'],
    [
      'The Ninth Circuit’s opinion in Smith v. Jones, 1 F.3d 1, 2 (9th Cir. 1990), controls.',
      'Smith v. Jones',
    ],
  ])
    assert.equal(nameOf(text), name, text);
});

test('R4: short names follow Bluebook practice', () => {
  const short = text => {
    const found = findCitations(text);
    return shortName(found[0], found);
  };
  for (const [text, name] of [
    ['In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).', 'Bonds'],
    ['United States v. Microsoft Corp., 253 F.3d 34, 50 (D.C. Cir. 2001).', 'Microsoft'],
    ['NLRB v. Jones & Laughlin Steel Corp., 301 U.S. 1, 30 (1937).', 'Jones & Laughlin'],
    ['Ex parte Young, 209 U.S. 123, 159 (1908).', 'Young'],
    [
      'Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837, 842 (1984).',
      'Chevron',
    ],
    // An estate keeps "Estate of", and a railroad its direction spelled out.
    ['Estate of Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).', 'Estate of Smith'],
    ['Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 68 (2006).', 'Burlington Northern'],
  ])
    assert.equal(short(text), name, text);
});

test('R4: common words that begin case names are not names on their own', () => {
  const names = text => [...referenceNames(findCitations(text)).keys()];
  for (const [text, expected] of [
    [
      'Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837, 842 (1984).',
      ['Chevron'],
    ],
    ['In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000).', ['Bonds', 'Marriage of Bonds']],
    ['Brown v. Bd. of Educ., 347 U.S. 483, 495 (1954).', ['Brown']],
    [
      'Friends of the Earth, Inc. v. Laidlaw Env’t Servs., 528 U.S. 167, 180 (2000).',
      ['Friends of the Earth', 'Laidlaw'],
    ],
    ['Citizens United v. FEC, 558 U.S. 310, 340 (2010).', ['Citizens United']],
    [
      'Students for Fair Admissions, Inc. v. President & Fellows of Harvard Coll., 600 U.S. 181, 200 (2023).',
      ['Students for Fair Admissions'],
    ],
  ])
    assert.deepEqual(names(text), expected, text);
  for (const [document, original, replacement] of [
    [
      'Agency deference is gone. Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837, 842 (1984). Natural gas prices rose in 2022.',
      'Natural gas prices rose in 2022.',
      'Prices for natural gas rose in 2022.',
    ],
    [
      'Support follows the child. In re Marriage of Bonds, 24 Cal. 4th 1, 5 (2000). Marriage is a contract under state law.',
      'Marriage is a contract under state law.',
      'Under state law, marriage is a contract.',
    ],
    [
      'Standing needs injury. Friends of the Earth, Inc. v. Laidlaw Env’t Servs., 528 U.S. 167, 180 (2000). Friends of the plaintiff testified at trial.',
      'Friends of the plaintiff testified at trial.',
      'At trial, friends of the plaintiff testified.',
    ],
  ])
    assert.equal(guardReplacement(document, original, replacement), null, original);
  const reading = analyzeLegal(
    paragraphs([
      'Agency deference is gone. Chevron U.S.A. Inc. v. Natural Res. Def. Council, Inc., 467 U.S. 837, 842 (1984).',
      'Natural gas prices rose sharply in 2022.',
    ]),
    [
      ['rule', 'law'],
      ['facts', 'client-fact'],
    ],
  );
  assert.deepEqual(reading.sentences[1].cites, []);
  assert.deepEqual(reading.sentences[1].flags, []);
});

// ---------------------------------------------------------------------------
// R5 – sections and numbers
// ---------------------------------------------------------------------------

test('R5: business numbers and contract sections are not authorities', () => {
  const types = text => findCitations(text).map(cite => `${cite.type}: ${cite.text}`);
  for (const text of [
    'Purchase Order No. 2023-114 lists the price.',
    'Invoice No. 4471-22 was paid on time.',
    'The seller shipped Lot No. 5-12 in June.',
    'Ticket No. 12-345 was closed without a fix.',
    'Claim No. 2023-0045 was denied by the insurer.',
    'Under Article 5 of the Agreement, either party may assign.',
    'Its Form 10-K reports the loss.',
    'She rolled over her 401(k) plan.',
    'The family lives in Section 8 housing.',
    'The company filed for Chapter 11 protection.',
  ])
    assert.deepEqual(types(text), [], text);
  for (const [text, section] of [
    ['Under Code of Conduct § 2, employees must report gifts.', '§ 2'],
    ['Statement of Work § 3 lists the deliverables.', '§ 3'],
    ['Term Sheet § 2 sets the valuation.', '§ 2'],
    ['Terms of Service § 4 bars scraping.', '§ 4'],
    ['The Operating Agreement § 7.3 requires consent.', '§ 7.3'],
    ['Under § 4.2 of the Statement of Work, the vendor must deliver.', '§ 4.2'],
  ]) {
    const found = findCitations(text);
    assert.equal(found.length, 1, text);
    assert.equal(found[0].type, 'internal', text);
    assert.ok(found[0].text.endsWith(section), text);
  }
});

test('R5: a contract’s section in a client fact does not merge with the statute', () => {
  const merge = (rule, fact) => {
    const reading = analyzeLegal(paragraphs([rule, fact]), [
      ['rule', 'law'],
      ['facts', 'client-fact'],
    ]);
    return [rows(reading), reading.sentences.at(-1).support];
  };
  assert.deepEqual(
    merge(
      'Federal law requires enforcement of arbitration agreements. 9 U.S.C. § 2.',
      'The Fees are payable as provided in § 2.',
    ),
    [['statutes | 9 U.S.C. § 2 | n=1'], 'record'],
  );
  assert.deepEqual(
    merge(
      'Federal law requires enforcement of arbitration agreements. 9 U.S.C. § 2.',
      'The Fees are payable as provided in Section 2.',
    ),
    [['statutes | 9 U.S.C. § 2 | n=1'], 'n/a'],
  );
  assert.deepEqual(
    merge(
      'Liquidated damages must be reasonable. Cal. Civ. Code § 1671(b).',
      'The Lease says the deposit is forfeited under § 3.',
    ),
    [['statutes | Cal. Civ. Code § 1671(b) | n=1'], 'record'],
  );
});

test('R5: caption numbers are not authorities and need no attention', () => {
  for (const line of [
    'Index No. 123456/2024',
    'Civil Action No. 1:24-cv-00123',
    'Case No. 2:24-cv-01234-ABC-DEF',
    'Docket No. A-1234-22',
    'Cause No. 2024-12345',
  ]) {
    const reading = analyzeLegal(
      doc([
        ['p', `UNITED STATES DISTRICT COURT\n${line}`],
        ['h2', 'Argument'],
        ['p', 'The claim fails.'],
      ]),
      null,
    );
    assert.deepEqual(reading.authorities, [], line);
    assert.equal(reading.attentionCount, 0, line);
  }
});

// ---------------------------------------------------------------------------
// R6 – section headings
// ---------------------------------------------------------------------------

test('R6: brief, memo and complaint headings name their parts', () => {
  const partOf = heading =>
    sectionsOf(
      doc([
        ['h1', 'BRIEF'],
        ['h2', heading],
        ['p', 'x.'],
        ['h2', 'Argument'],
        ['p', 'y.'],
      ]),
    ).find(section => section.heading === 1)?.part;
  for (const [heading, part] of [
    ['STATEMENT OF THE ISSUES', 'question'],
    ['ISSUES PRESENTED FOR REVIEW', 'question'],
    ['SUMMARY OF THE ARGUMENT', 'introduction'],
    ['STATEMENT REGARDING ORAL ARGUMENT', 'other'],
    ['CERTIFICATE OF COMPLIANCE', 'other'],
    ['CERTIFICATE OF SERVICE', 'other'],
    ['TABLE OF CONTENTS', 'other'],
    ['TABLE OF AUTHORITIES', 'other'],
    ['PRAYER FOR RELIEF', 'conclusion'],
    ['NATURE OF THE CASE', 'introduction'],
    ['COUNTERSTATEMENT OF FACTS', 'facts'],
    ['FACTUAL ALLEGATIONS', 'facts'],
    ['RELEVANT BACKGROUND', 'facts'],
    ['Executive Summary', 'answer'],
    ['Short Answers', 'answer'],
    ['JURISDICTIONAL STATEMENT', 'other'],
    ['STATEMENT OF APPEALABILITY', 'other'],
    ['INTEREST OF AMICUS CURIAE', 'other'],
    ['Applicable Law', 'standard'],
    ['Next Steps', 'other'],
    ['Recommendations', 'conclusion'],
    ['RELIEF REQUESTED', 'conclusion'],
    ['Assumptions', 'other'],
  ])
    assert.equal(partOf(heading), part, heading);
});

test('R6: point headings are tagged by their numerals at every level', () => {
  const tags = list => sectionsOf(doc(list)).map(section => `${section.part}/${section.tag}`);
  assert.deepEqual(
    tags([
      ['h2', 'ARGUMENT'],
      ['h3', 'POINT I: THE CLAIM FAILS'],
      ['p', 'a.'],
      ['h3', 'POINT II: THE DEFENSE APPLIES'],
      ['p', 'b.'],
    ]),
    ['umbrella/Umbrella', 'sub-issue/I', 'sub-issue/II'],
  );
  assert.deepEqual(
    tags([
      ['h2', 'ARGUMENT'],
      ['h3', 'I. First'],
      ['p', 'a.'],
      ['h4', 'A. Sub'],
      ['p', 'b.'],
      ['h5', '1. Subsub'],
      ['p', 'c.'],
      ['h5', '2. Subsub'],
      ['p', 'd.'],
      ['h4', 'B. Sub'],
      ['p', 'e.'],
    ]),
    [
      'umbrella/Umbrella',
      'umbrella/I',
      'umbrella/I.A',
      'sub-issue/I.A.1',
      'sub-issue/I.A.2',
      'sub-issue/I.B',
    ],
  );
  assert.deepEqual(
    tags([
      ['h2', 'Analysis'],
      ['p', 'Two issues.'],
      ['h3', '1. Disability'],
      ['p', 'a.'],
      ['h3', '2. Accommodation'],
      ['p', 'b.'],
    ]),
    ['umbrella/Umbrella', 'sub-issue/Part 1', 'sub-issue/Part 2'],
  );
});

test('R6: headings typed as paragraphs, with no heading styles, are still headings', () => {
  const sections = sectionsOf(
    paragraphs([
      'ARGUMENT',
      'I. THE CLAIM FAILS',
      'Fraud needs particularity.',
      'II. THE DEFENSE APPLIES',
      'Res judicata bars it.',
    ]),
  );
  assert.deepEqual(
    sections.map(section => [section.part, section.tag, section.heading]),
    [
      ['umbrella', 'Umbrella', 0],
      ['sub-issue', 'I', 1],
      ['sub-issue', 'II', 3],
    ],
  );
});

test('R6: a brief’s issues, summary and certificate draw no checks outside the argument', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'STATEMENT OF THE ISSUES'],
      ['p', 'Whether the claim is timely.'],
      ['h2', 'SUMMARY OF THE ARGUMENT'],
      ['p', 'The claim is untimely. The rule is clear.'],
      ['h2', 'ARGUMENT'],
      ['h3', 'I. The claim is untimely'],
      [
        'p',
        'A claim must be filed in two years. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990). Doe filed in year three. The claim is untimely.',
      ],
      ['h2', 'CERTIFICATE OF SERVICE'],
      ['p', 'I served this brief on all counsel on May 1, 2024.'],
    ]),
    [
      ['heading', 'framing'],
      ['issue', 'framing'],
      ['heading', 'framing'],
      ['conclusion', 'conclusion'],
      ['rule', 'law'],
      ['heading', 'framing'],
      ['heading', 'conclusion'],
      ['rule', 'law'],
      ['application', 'application'],
      ['conclusion', 'conclusion'],
      ['heading', 'framing'],
      ['other', 'framing'],
    ],
  );
  assert.ok(
    reading.checks.every(check => /^I$|Umbrella/.test(check.where)),
    reading.checks.map(check => check.where).join(', '),
  );
});

test('R6: facts and answer headings a memo may use are read as such', () => {
  const HF = ['heading', 'framing'];
  for (const heading of [
    'Factual Allegations',
    'Counterstatement of Facts',
    'Statement of Facts',
  ]) {
    const reading = analyzeLegal(
      doc([
        ['h2', 'Question Presented'],
        ['p', 'Whether Doe can recover.'],
        ['h2', heading],
        ['p', 'Doe slipped on ice. Compl. ¶ 4. The store knew. Compl. ¶ 5.'],
        ['h2', 'Discussion'],
        [
          'p',
          'A store owes invitees care. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990). Here the store knew of the ice. Doe can likely recover.',
        ],
        ['h2', 'Conclusion'],
        ['p', 'Doe can likely recover.'],
      ]),
      [
        HF,
        ['issue', 'framing'],
        HF,
        ['facts', 'client-fact'],
        ['facts', 'client-fact'],
        HF,
        ['rule', 'law'],
        ['application', 'application'],
        ['conclusion', 'conclusion'],
        HF,
        ['conclusion', 'conclusion'],
      ],
    );
    assert.equal(reading.sections[1].part, 'facts', heading);
    assert.ok(!reading.checks.some(check => check.id === 'facts-section'), heading);
  }
  for (const heading of ['Executive Summary', 'Brief Answer']) {
    const sections = sectionsOf(
      doc([
        ['h2', 'Question Presented'],
        ['p', 'Whether Doe can recover.'],
        ['h2', heading],
        ['p', 'Probably yes.'],
      ]),
    );
    assert.equal(sections[1].part, 'answer', heading);
  }
});

// ---------------------------------------------------------------------------
// R7 – id.
// ---------------------------------------------------------------------------

test('R7: id. and ibid. point to the right source, or are flagged when they cannot', () => {
  const last = (texts, labels = null) => {
    const reading = analyzeLegal(paragraphs(texts), labels);
    const sentence = reading.sentences.at(-1);
    return {
      cite: [sentence.support, ...chips(sentence), ...sentence.flags.map(flag => flag.id)],
      rows: rows(reading),
    };
  };
  assert.deepEqual(
    last([
      'The duty runs to invitees. (Smith v. Jones (2001) 1 Cal.4th 1, 5.) The store must inspect. (Ibid.)',
    ]).cite,
    ['direct', 'Ibid. → Smith{own}'],
  );
  assert.deepEqual(last(['Delgado fell at 3:01. (2 CT 362.) The aisle was wet. (Ibid.)']).cite, [
    'record',
    'Ibid. → 2 CT{own}',
  ]);
  // Bluebook rule 4.1: id. after a citation of more than one source could mean either.
  assert.deepEqual(
    last([
      'The duty runs to invitees. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991). The store must inspect. Id. at 4.',
    ]).cite,
    ['incomplete', 'Id.{unresolved}', 'ambiguous-id'],
  );
  assert.deepEqual(
    last([
      'The duty runs to invitees. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990) (quoting Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991)). The store must inspect. Id. at 6.',
    ]).cite,
    ['direct', 'Id. → Smith{own}'],
  );
  // "Id. art. II, § 3" after the Constitution's article I is its article II.
  assert.deepEqual(
    last([
      'Congress may regulate commerce. U.S. Const. art. I, § 8, cl. 3. The President executes the laws. Id. art. II, § 3.',
    ]),
    {
      cite: ['direct', 'Id. → U.S. Const. art. II, § 3{own}'],
      rows: [
        'statutes | U.S. Const. art. I, § 8, cl. 3 | n=1',
        'statutes | U.S. Const. art. II, § 3 | n=1',
      ],
    },
  );
  assert.deepEqual(
    last([
      'Disability is defined broadly. 42 U.S.C. § 12102(1). The ADA bars discrimination. Id. § 12112(a).',
    ]),
    {
      cite: ['direct', 'Id. → § 12112{own}'],
      rows: ['statutes | 42 U.S.C. § 12102(1) | n=1', 'statutes | 42 U.S.C. § 12112(a) | n=1'],
    },
  );
  assert.deepEqual(
    last([
      'The duty runs to invitees. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990). The store must inspect. Id. at 5 n.2.',
    ]).cite,
    ['direct', 'Id. → Smith{own}'],
  );
  assert.deepEqual(
    last([
      'The rule is settled. Doe v. Roe, 2021 WL 123456, at *3 (S.D.N.Y. Jan. 5, 2021). It applies here. Id. at *4.',
    ]).cite,
    ['direct', 'Id. → Doe{own}'],
  );
  assert.deepEqual(
    last(
      [
        'The rule is settled. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990).',
        'Smith limited the rule. Id. at 6.',
      ],
      [
        ['rule', 'law'],
        ['explanation', 'precedent'],
      ],
    ).cite,
    ['direct', 'Id. → Smith{own}'],
  );
  assert.deepEqual(
    last(['The rule is settled. Fed. R. Civ. P. 12(b)(6). It applies here. Id. 12(c).']),
    {
      cite: ['direct', 'Id. → Fed. R. Civ. P. 12{own}'],
      rows: ['statutes | Fed. R. Civ. P. 12(b)(6) | n=2'],
    },
  );
  assert.deepEqual(
    last([
      'Treaties bind. Restatement (Third) of Foreign Relations Law § 111 (Am. L. Inst. 1987). They are federal law. Id. § 111 cmt. d.',
    ]).rows,
    ['other | Restatement (Third) of Foreign Relations Law (Am. L. Inst. 1987) | n=2'],
  );
});

// ---------------------------------------------------------------------------
// R8 – signals and history words
// ---------------------------------------------------------------------------

test('R8: each signal gives the support it signals', () => {
  const A = 'Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990)';
  const support = text => analyzeLegal(paragraphs([text]), [['rule', 'law']]).sentences[0].support;
  for (const [text, expected] of [
    [`The rule is settled. Contra ${A}.`, 'contrary'],
    [`The rule is settled. But cf. ${A}.`, 'contrary'],
    [`The rule is settled. See generally ${A}.`, 'background'],
    [`The rule is settled. Accord ${A}.`, 'direct'],
    [`The rule is settled. E.g., ${A}.`, 'direct'],
    [`The rule is settled. See, e.g., ${A}.`, 'inferential'],
    [`The rule is settled. Cf. ${A}.`, 'indirect'],
    ['The rule is settled. (See generally Doe v. Roe (1990) 2 Cal.4th 2, 3.)', 'background'],
    ['The rule is settled. (But see Doe v. Roe (1990) 2 Cal.4th 2, 3.)', 'contrary'],
    ['The rule is settled. (Accord, Doe v. Roe (1990) 2 Cal.4th 2, 3.)', 'direct'],
    [
      `Some courts disagree. But see ${A} (holding otherwise); Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991).`,
      'contrary',
    ],
  ])
    assert.equal(support(text), expected, text);
  const signals = text =>
    findCitations(text)
      .filter(cite => !cite.nested)
      .map(cite => cite.signal);
  assert.deepEqual(
    signals(
      `The rule is settled. See ${A}; Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991); cf. Coe v. Zoe, 3 F.3d 3, 4 (2d Cir. 1992).`,
    ),
    ['See', null, 'cf.'],
  );
  assert.deepEqual(
    signals(
      `The rule is unsettled. Compare ${A} (holding X), with Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991) (holding not X).`,
    ),
    ['Compare', null],
  );
});

test('R8: the guard refuses edits to signals, parentheticals and history words', () => {
  const A = 'Doe v. Roe, 1 F.3d 1, 2 (2d Cir. 1990)';
  const texas =
    'The rule is settled. Smith v. Jones, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] 2003, pet. denied).';
  const csm = 'The rule is settled. (Smith v. Jones (2001) 1 Cal.4th 1, 5.) Further. ';
  for (const [original, from, to] of [
    [`The rule is settled. See generally ${A}.`, 'See generally', 'See'],
    [`The rule is settled. Accord ${A}.`, 'Accord ', ''],
    [`The rule is settled. E.g., ${A}.`, 'E.g., ', ''],
    [`The rule is settled. But cf. ${A}.`, 'But cf.', 'Cf.'],
    [`The rule is settled. See, e.g., ${A}.`, 'See, e.g.,', 'See'],
    ['The rule is settled. (See also Doe v. Roe (1990) 2 Cal.4th 2, 3.)', 'See also', 'See'],
    ['The rule is settled. (Accord, Doe v. Roe (1990) 2 Cal.4th 2, 3.)', 'Accord, ', ''],
    [`The rule is settled. ${A} (en banc).`, ' (en banc)', ''],
    [`The rule is settled. ${A} (per curiam).`, ' (per curiam)', ''],
    [`The rule is settled. ${A} (Sotomayor, J., concurring).`, 'concurring', 'dissenting'],
    [`The rule is settled. ${A}, aff’d, 500 U.S. 1 (1991).`, 'aff’d', 'rev’d'],
    [
      `The rule is settled. ${A}, cert. denied, 500 U.S. 1 (1991).`,
      'cert. denied',
      'cert. granted',
    ],
    [texas, 'pet. denied', 'pet. granted'],
    [texas, 'Houston', 'Dallas'],
    [`${csm}(Smith, supra, 1 Cal.4th at p. 6, italics added.)`, ', italics added', ''],
  ])
    assert.equal(
      rewrite(original, original.replace(from, to)),
      'citation-changed',
      `${from} → ${to}`,
    );
  const compare = `The rule is unsettled. Compare ${A} (holding X), with Poe v. Moe, 2 F.3d 2, 3 (2d Cir. 1991) (holding not X).`;
  assert.equal(
    rewrite(compare, compare.replace('Compare ', '').replace(', with Poe', '; Poe')),
    'citation-changed',
  );
});

// ---------------------------------------------------------------------------
// R9 – rules, regulations, statutes and secondary sources
// ---------------------------------------------------------------------------

test('R9: rules, regulations, codes, bills and secondary sources are read whole', () => {
  const claim = 'The deadline is thirty days.';
  for (const [form, type, key] of [
    ['Fed. R. App. P. 4(a)(1)(A).', 'statute', 'Fed.R.App.P.4'],
    ['Fed. R. Crim. P. 11(b)(1).', 'statute', 'Fed.R.Crim.P.11'],
    ['Fed. R. Bankr. P. 2004(a).', 'statute', 'Fed.R.Bankr.P.2004'],
    ['(Cal. Rules of Court, rule 8.204(c)(1).)', 'statute', 'Cal.RulesofCourtrule8.204'],
    ['Sup. Ct. R. 10.', 'statute', 'Sup.Ct.R.10'],
    ['S.D.N.Y. Local Civ. R. 6.3.', 'statute', 'S.D.N.Y.LocalCiv.R.6.3'],
    ['Treas. Reg. § 1.162-1(a) (2023).', 'statute', 'Treas.Reg.§1.162-1'],
    ['(Cal. Code Regs., tit. 22, § 12000.)', 'statute', 'Cal.CodeRegs.tit.22§12000'],
    ['12 C.F.R. pt. 1026, supp. I.', 'statute', '12C.F.R.pt.1026supp.I'],
    ['H.R. Conf. Rep. No. 104-458, at 3 (1996).', 'legislative', 'H.R.Conf.Rep.No.104-458'],
    ['(Assem. Bill No. 5 (2019–2020 Reg. Sess.) § 2.)', 'legislative', 'Assem.BillNo.5'],
    ['(Stats. 2019, ch. 296, § 2.)', 'statute', 'Stats.2019ch.296§2'],
    [
      'Restatement (Third) of Agency § 7.03 (Am. L. Inst. 2006).',
      'secondary',
      'secondary:Restatement(Third)ofAgency§7.03(Am.L.Inst.2006)',
    ],
    [
      'Black’s Law Dictionary (11th ed. 2019).',
      'secondary',
      "secondary:Black'sLawDictionary(11thed.2019)",
    ],
    [
      'Note, The Limits of Arbitration, 130 Harv. L. Rev. 1, 5 (2016).',
      'periodical',
      '130 Harv.L.Rev. 1',
    ],
    ['Jane Doe, A Title, 70 Stan. L. Rev. 1, 5 (2018).', 'periodical', '70 Stan.L.Rev. 1'],
    ['John Smith, A Title, 128 Yale L.J. 1, 3 (2019).', 'periodical', '128 YaleL.J. 1'],
    [
      'Exec. Order No. 14,028, 86 Fed. Reg. 26,633 (May 12, 2021).',
      'statute',
      'Exec.OrderNo.14028',
    ],
    ['In re Smith, 25 I. & N. Dec. 1, 5 (B.I.A. 2009).', 'full', '25 I.&N.Dec.'],
    ['Rev. Rul. 2004-1, 2004-1 C.B. 1.', 'secondary', 'secondary:Rev.Rul.2004-1,2004-1C.B.1'],
    ['U.S. Const. art. I, § 8, cl. 3.', 'statute', 'U.S.Const.art.I§8cl.3'],
    ['(Cal. Const., art. I, § 7, subd. (a).)', 'statute', 'Cal.Const.art.I§7'],
    ['N.Y. Const. art. I, § 12.', 'statute', 'N.Y.Const.art.I§12'],
    ['Tex. Bus. & Com. Code Ann. § 17.46 (West 2021).', 'statute', 'Tex.Bus.&Com.CodeAnn.§17.46'],
    ['Fla. Stat. § 768.81 (2023).', 'statute', 'Fla.Stat.§768.81'],
    ['735 Ill. Comp. Stat. 5/2-619 (2022).', 'statute', '735Ill.Comp.Stat.5/2-619'],
    ['735 ILCS 5/2-619.', 'statute', '735Ill.Comp.Stat.5/2-619'],
    ['Mass. Gen. Laws ch. 93A, § 2.', 'statute', 'Mass.Gen.Lawsch.93A§2'],
    ['N.J. Stat. Ann. § 2A:14-1 (West 2023).', 'statute', 'N.J.Stat.Ann.§2A:14-1'],
    ['42 Pa. Cons. Stat. § 5524 (2023).', 'statute', '42Pa.Cons.Stat.§5524'],
    ['U.C.C. § 2-207 (Am. L. Inst. & Unif. L. Comm’n 2022).', 'statute', 'U.C.C.§2-207'],
    ['Model Penal Code § 2.02 (Am. L. Inst. 1985).', 'statute', 'ModelPenalCode§2.02'],
    ['28 U.S.C. § 1291.', 'statute', '28U.S.C.§1291'],
    ['Cal. Civ. Proc. Code § 340.5 (West 2023).', 'statute', 'Cal.Civ.Proc.Code§340.5'],
  ]) {
    const text = `${claim} ${form}`;
    assert.deepEqual(S(text), [text], form);
    const found = findCitations(text).filter(cite => !cite.nested);
    assert.deepEqual(
      found.map(cite => [cite.type, cite.text, citationKey(cite)]),
      [[type, form.replace(/^\(/, '').replace(/\.\)$|\.$/, ''), key]],
      form,
    );
  }
});

test('R9: distinct sections keep distinct keys, and secondary sources sit in “other”', () => {
  assert.deepEqual(
    [
      '735 ILCS 5/2-619.',
      '735 ILCS 5/2-615.',
      'Mass. Gen. Laws ch. 93A, § 2.',
      'Mass. Gen. Laws ch. 93, § 2.',
    ].map(text => citationKey(findCitations(text)[0])),
    [
      '735Ill.Comp.Stat.5/2-619',
      '735Ill.Comp.Stat.5/2-615',
      'Mass.Gen.Lawsch.93A§2',
      'Mass.Gen.Lawsch.93§2',
    ],
  );
  const reading = analyzeLegal(
    paragraphs([
      'Scholars agree. Note, The Limits of Arbitration, 130 Harv. L. Rev. 1, 5 (2016). Courts follow it. Restatement (Third) of Agency § 7.03 (Am. L. Inst. 2006). Agencies agree. Rev. Rul. 2004-1, 2004-1 C.B. 1.',
    ]),
    null,
  );
  assert.deepEqual(rows(reading), [
    'other | Note, The Limits of Arbitration, 130 Harv. L. Rev. 1 (2016) | n=1',
    'other | Restatement (Third) of Agency (Am. L. Inst. 2006) | n=1',
    'other | Rev. Rul. 2004-1 | n=1',
  ]);
});

test('R9: an executive order’s section and a bill’s Congress stay in one citation', () => {
  assert.deepEqual(
    cites(
      'The order applies. Exec. Order No. 14,028, § 2, 86 Fed. Reg. 26,633, 26,634 (May 12, 2021).',
    ),
    [['statute', 'Exec. Order No. 14,028, § 2, 86 Fed. Reg. 26,633, 26,634 (May 12, 2021)']],
  );
  assert.deepEqual(cites('Congress tried. H.R. 1234, 117th Cong. § 3 (2021).'), [
    ['legislative', 'H.R. 1234, 117th Cong. § 3 (2021)'],
  ]);
});

// ---------------------------------------------------------------------------
// R10 – the guard and autocomplete
// ---------------------------------------------------------------------------

test('R10: autocomplete stays quiet partway into a citation of any form', () => {
  for (const before of [
    'The rule is settled. See Smith v. Jones, 45 F.4th ',
    'Smith v. Jones, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] ',
    'People v. Doe, 2020 IL ',
    'State v. Doe, 2021-Ohio-',
    'The deadline applies. (Cal. Rules of Court, rule ',
    'The deduction is allowed. Treas. Reg. § ',
    'Agents bind principals. Restatement (Third) of Agency § ',
    'The order is binding. Exec. Order No. ',
    'The aisle was wet. (Ibid',
    'The motion was late. (AOB ',
    'The motion was late. Pl.’s Mot. Summ. J. ',
    'He said so. Trial Tr. vol. 2, ',
    'The rule applies. 735 Ill. Comp. Stat. ',
    'The claim is barred. Mass. Gen. Laws ch. ',
    'The rule is settled. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), aff’d, ',
    'He admitted it. SAC ¶ ',
    // A docket number needs its court and date (or database cite) after it.
    'The rule is settled. Smith v. Salvation Army, No. 13-114-J, ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  for (const before of [
    'It rained during the Yankees v.',
    'The family lives in Section ',
    'The company filed for Chapter ',
    'She wore jersey No. ',
    'He called it Rule ',
  ])
    assert.equal(citationContext(before), null, before);
});

test('R10: a completion is cut before a citation it would add, leaving no fragment', () => {
  for (const insertion of [
    ' (See Cal. Rules of Court, rule 8.204(c).)',
    ' Hr’g Tr. 12:4-9.',
    ' Pl.’s Mot. Summ. J. 5.',
    ' Doc. 45 at 3.',
    ' Treas. Reg. § 1.162-1.',
    ' People v. Doe, 2020 IL 124112, ¶ 20.',
    ' (Ibid.)',
    ' 735 ILCS 5/2-619.',
    ' Mass. Gen. Laws ch. 93A, § 2.',
    ' SAC ¶ 12.',
    ' Rev. Rul. 2004-1.',
    ' Sup. Ct. R. 10.',
    // The history word goes with the citation it introduces.
    ', aff’d, 535 U.S. 1 (2002).',
  ])
    assert.equal(cutAtCitation('The motion was untimely', insertion), '', insertion);
  const before = 'The motion was untimely';
  for (const insertion of [
    ' SAC ¶ 12.',
    ' Pl.’s Mot. Summ. J. 5.',
    ' (Ibid.)',
    ' 735 ILCS 5/2-619.',
    ' Sup. Ct. R. 10.',
  ])
    assert.deepEqual(
      inspectCompletion(completionAnchor(before) + insertion, before, ''),
      { text: '', reason: 'citation-cut' },
      insertion,
    );
  for (const [before, insertion] of [
    ['It rained during', ' the Yankees v. Red Sox game on Sunday.'],
    ['The family lives in', ' Section 8 housing near the river.'],
    ['The company filed for', ' Chapter 11 protection last year.'],
    ['She called', ' the Title IX coordinator twice.'],
    ['He rolled over', ' his 401(k) plan into an IRA.'],
    ['The retailer disclosed it in', ' its Form 10-K for 2023.'],
    ['They met in', ' Room No. 12-3 on the third floor.'],
    ['She wore', ' jersey No. 23 in the final.'],
  ])
    assert.equal(cutAtCitation(before, insertion), insertion, insertion);
});

test('R10: an inserted citation in a form the parser does not know is refused', () => {
  const document = 'The motion was untimely. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990).';
  for (const insertion of [
    ' SAC ¶ 12.',
    ' Pl.’s Mot. Summ. J. 5.',
    ' 735 ILCS 5/2-619.',
    ' Sup. Ct. R. 10.',
    ' Rev. Rul. 2004-1, 2004-1 C.B. 1.',
    ' People v. Doe, 2020 IL 124112, ¶ 20.',
  ])
    assert.equal(guardInsertion(document, insertion), 'new-citation', insertion);
});

test('R10: rewrites keep every letter of a rule, regulation or record citation', () => {
  for (const [original, from, to, reason] of [
    ['The deadline is thirty days. Fed. R. App. P. 4(a)(1)(A).', '(A)', '(B)', 'citation-changed'],
    [
      'The deadline is thirty days. 12 C.F.R. pt. 1026, supp. I.',
      'supp. I',
      'supp. II',
      'new-citation',
    ],
    [
      'The claim is barred. U.C.C. § 2-207 (Am. L. Inst. & Unif. L. Comm’n 2022).',
      ' (Am. L. Inst. & Unif. L. Comm’n 2022)',
      '',
      'citation-changed',
    ],
    ['The claim fails. SAC ¶ 12.', 'SAC', 'FAC', 'new-citation'],
    ['The motion was untimely. Pl.’s Mot. Summ. J. 5.', 'Pl.’s', 'Def.’s', 'new-citation'],
  ])
    assert.equal(rewrite(original, original.replace(from, to)), reason, `${from} → ${to}`);
});

// ---------------------------------------------------------------------------
// Citation-shaped runs and ordinary prose
// ---------------------------------------------------------------------------

test('citation-shaped runs start at the citation and stop at the sentence', () => {
  const runs = text => citationRuns(text).map(([start, end]) => text.slice(start, end));
  // The word that ends the sentence before is not part of the citation after it.
  assert.deepEqual(runs('She lives in Queens. Compl. ¶ 9.'), ['Compl. ¶ 9']);
  assert.deepEqual(runs('He worked in the Bronx. Id. ¶¶ 12–14.'), ['Id. ¶¶ 12–14']);
  // A missing space after a citation does not carry it into the next sentence.
  assert.deepEqual(runs('The rule is in § 3602(c).The court agreed.'), ['§ 3602(c)']);
  // A postal address is not a citation.
  assert.deepEqual(runs('Mail it to San Francisco, CA 94103, U.S.A.'), []);
  assert.deepEqual(cites('Send it to 1 Main St., San Francisco, CA 94103, U.S.A. today.'), []);
});

test('runs end at the sentence, so the sentence before a record citation is plain prose', () => {
  // The guard once had to trim "Queens." off "Compl. ¶ 9"; now the parser does not take it.
  const text = 'She moved there in 2019 and lives in Queens. Compl. ¶ 9. Her lease began in March.';
  const sentence = 'She moved there in 2019 and lives in Queens.';
  assert.equal(selectionRefusal('', sentence, text.slice(sentence.length), true), null);
  // An address is no citation, so its sentence may be merged with the next.
  assert.equal(
    combineRefusal(
      'Mail the check to our office at 1 Main St., San Francisco, CA 94103, U.S.A.',
      'It must arrive by Friday.',
    ),
    null,
  );
  assert.ok(combineRefusal('She lives in Queens.', 'Compl. ¶ 9.'));
});

// ---------------------------------------------------------------------------
// The first round's problems the verifier found partly fixed
// ---------------------------------------------------------------------------

test('AN-13: a case goes by the name the document uses, else by its first party', () => {
  const name = text => analyzeLegal(paragraphs([text]), null).authorities[0].name;
  // Alone, "Ashcroft v. Iqbal" goes by its first party, as Bluebook rule 10.9 has it; the
  // parser cannot know that practice calls this case "Iqbal" unless the writer does.
  assert.equal(
    name('A claim must be plausible. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).'),
    'Ashcroft',
  );
  assert.equal(
    name(
      'A claim must be plausible. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Iqbal requires facts.',
    ),
    'Iqbal',
  );
  assert.equal(
    name(
      'A claim must be plausible. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Iqbal, 556 U.S. at 679.',
    ),
    'Iqbal',
  );
  assert.equal(
    name(
      'Retaliation is broad. Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 68 (2006).',
    ),
    'Burlington Northern',
  );
});

test('AN-12: a conclusion that the claim fails may be as sure as its surest failing part', () => {
  const HF = ['heading', 'framing'];
  const RL = ['rule', 'law'];
  const AA = ['application', 'application'];
  const CC = ['conclusion', 'conclusion'];
  const reading = analyzeLegal(
    doc([
      ['h2', 'Discussion'],
      ['p', 'Two parts.'],
      ['h3', 'A. Goodwill'],
      [
        'p',
        'Rule. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001). Here none. Borden is unlikely to show goodwill.',
      ],
      ['h3', 'B. Confusion'],
      [
        'p',
        'Rule. Smith v. Jones, 123 F.3d 456, 461 (2d Cir. 2001). Here none. Borden will very likely fail.',
      ],
      ['h2', 'Conclusion'],
      ['p', 'Borden will very likely lose.'],
    ]),
    [HF, ['roadmap', 'framing'], HF, RL, AA, CC, HF, RL, AA, CC, HF, CC],
  );
  // "Unlikely" ranks as a confident prediction (2), "very likely" as the surest (3), and
  // Borden loses if either part fails: B's "very likely fail" carries the conclusion.
  assert.deepEqual(
    reading.sections.map(section => [section.tag, section.rank]),
    [
      ['Umbrella', null],
      ['A', 2],
      ['B', 3],
      ['Conclusion', 3],
    ],
  );
  assert.ok(!reading.checks.some(check => check.id === 'confidence'));
});

test('LT-25: a quotation that ends its sentence splits from the words after it', () => {
  assert.deepEqual(
    S(
      '“The first version was a disaster. This one is merely bad.” He laughs, then checks the queue.',
    ),
    [
      '“The first version was a disaster. This one is merely bad.”',
      'He laughs, then checks the queue.',
    ],
  );
  assert.deepEqual(S('"The first version was a disaster. This one is merely bad." He laughs.'), [
    '"The first version was a disaster. This one is merely bad."',
    'He laughs.',
  ]);
});

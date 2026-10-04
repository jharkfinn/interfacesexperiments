// Regression tests on seven documents unlike the sample memo (tests/fixtures/general):
// two copies of a California appellate brief, a federal motion, a retaliation memo, a
// statutory memo, a client email with a contract excerpt, and a magazine profile. Each
// test states what a careful reviewer expects of the IRAC and Sourcing views and of the
// citation guard on that document, so the legal views stay general rather than fitted
// to the memo the editor opens on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeLegal, clientNames, confidenceRank } from '../dist/legal-analysis.js';
import { findCitations, isCitationSentence } from '../dist/legal-text.js';
import {
  citationContext,
  cutAtCitation,
  guardInsertion,
  guardReplacement,
  selectionRefusal,
} from '../dist/citation-guard.js';
import { sentencesIn } from '../dist/doc-model.js';
import { DOCUMENTS, blocksOf, labelsOf, documentText } from './fixtures/general/documents.mjs';

// Each document read once, with its labels and without (offline).
const cache = new Map();
function read(key) {
  if (!cache.has(key)) {
    const blocks = blocksOf(key);
    const labels = labelsOf(key, blocks);
    cache.set(key, {
      blocks,
      labels,
      doc: documentText(blocks),
      reading: analyzeLegal(blocks, labels),
      bare: analyzeLegal(blocks, null),
    });
  }
  return cache.get(key);
}

// The one sentence that contains `fragment`.
function sentenceWith(reading, fragment) {
  const found = reading.sentences.filter(sentence => sentence.text.includes(fragment));
  assert.equal(found.length, 1, `one sentence contains “${fragment}”`);
  return found[0];
}
const textOf = (key, fragment) => sentenceWith(read(key).reading, fragment).text;
const sectionList = reading =>
  reading.sections.map(
    section =>
      `${section.part} ${section.tag}${section.parent === null ? '' : ` < ${reading.sections[section.parent].tag}`}`,
  );
const checkList = reading => reading.checks.map(check => `${check.id} ${check.where}`);
const attention = reading =>
  reading.sentences.filter(sentence => sentence.attention).map(sentence => sentence.n);
const flagIds = sentence => sentence.flags.map(flag => flag.id);
const chips = sentence => sentence.cites.map(cite => cite.label);
const row = (reading, key) => {
  const found = reading.authorities.find(authority => authority.key === key);
  assert.ok(found, `an authority keyed ${key}`);
  return found;
};
const numbersOf = (reading, fragments) =>
  fragments.map(fragment => sentenceWith(reading, fragment).n);

// The guard on a rewrite of `original` inside the document: the reason it is refused, or null.
const rewrite = (key, original, replacement) =>
  guardReplacement(read(key).doc, original, replacement);
// A selection of `selected`, found in the document after `from`.
function selection(key, selected, from = '') {
  const { doc } = read(key);
  const at = doc.indexOf(selected, from ? doc.indexOf(from) : 0);
  assert.ok(at >= 0, `the document has “${selected}”`);
  return selectionRefusal(doc.slice(0, at), selected, doc.slice(at + selected.length), false);
}

// ---------------------------------------------------------------------------
// Every document
// ---------------------------------------------------------------------------

test('each document splits into the sentences its labels were given for', () => {
  const counts = {
    'state-brief': 67,
    'state-brief-bluebook': 67,
    'federal-motion': 66,
    'full-memo': 63,
    statutory: 66,
    informal: 66,
    'non-legal': 67,
  };
  for (const key of DOCUMENTS) {
    const { blocks, labels, reading } = read(key);
    assert.equal(reading.sentences.length, counts[key], key);
    assert.equal(labels.length, counts[key], key);
    // A sentence that is only citations belongs to the claim before it, in every form:
    // record, California Style Manual, docket and Westlaw, English and Canadian. A
    // caption's lines, such as its docket number, stand on their own.
    for (const block of blocks) {
      block.sentences.forEach((sentence, i) => {
        if (i === 0 || block.text.slice(block.sentences[i - 1].end, sentence.start).includes('\n'))
          return;
        assert.ok(!isCitationSentence(sentence.text), `${key}: ${sentence.text}`);
      });
    }
  }
});

test('no document gets a failing check, and none fails offline either', () => {
  for (const key of DOCUMENTS) {
    const { reading, bare } = read(key);
    assert.deepEqual(
      reading.checks.filter(check => check.severity === 'fail').map(check => check.message),
      [],
      key,
    );
    // Without labels there are no checks or rails, and little needs attention: a "see
    // also" with no parenthetical, an open item.
    assert.deepEqual(bare.checks, [], key);
    assert.ok(
      bare.sections.every(section => section.rail === null),
      key,
    );
    assert.ok(bare.attentionCount <= 3, `${key}: ${bare.attentionCount}`);
    assert.deepEqual(bare.unresolved, [], key);
  }
});

test('briefs are read as briefs and everything else as memos', () => {
  assert.deepEqual(
    DOCUMENTS.map(key => [key, read(key).reading.type]),
    [
      ['state-brief', 'brief'],
      ['state-brief-bluebook', 'brief'],
      ['federal-motion', 'brief'],
      ['full-memo', 'memo'],
      ['statutory', 'memo'],
      ['informal', 'memo'],
      ['non-legal', 'memo'],
    ],
  );
});

// ---------------------------------------------------------------------------
// The California brief, in California Style Manual form
// ---------------------------------------------------------------------------

test('state brief: brief sections, with point I the umbrella over I.A and I.B', () => {
  const { reading } = read('state-brief');
  assert.deepEqual(sectionList(reading), [
    'caption Caption',
    'introduction Introduction',
    'facts Facts',
    'facts Facts',
    'standard Standard',
    'umbrella Umbrella',
    'umbrella I < Umbrella',
    'sub-issue I.A < I',
    'sub-issue I.B < I',
    'sub-issue II < Umbrella',
    'conclusion Conclusion',
  ]);
  // ARGUMENT is only its heading: no rail, so no umbrella checks.
  assert.equal(reading.sections[5].rail, null);
  // The report expected no umbrella or conclusion checks at all. Two are right: point I
  // never says it will take up A and then B, and I.B ends on the Saelzler comparison
  // with no sentence that concludes. None of the earlier false ones remain: no missing
  // Statement of Facts, no "states no rule", no umbrella over ARGUMENT, no topic headings.
  assert.deepEqual(checkList(reading), ['umbrella I', 'closes-with-conclusion I.B']);
  assert.match(reading.checks[0].message, /does not say the order of discussion\.$/);
  // A brief argues; it has no confidence to rank.
  assert.ok(reading.sections.every(section => section.rank === null));
});

test('state brief: eight named cases and four statutes, each with its code', () => {
  const { reading } = read('state-brief');
  const cases = reading.authorities.filter(authority => authority.group === 'cases');
  assert.deepEqual(
    cases.map(authority => [authority.name, authority.key, authority.level]),
    [
      ['Aguilar', '25 Cal.4th 826', 'state-supreme'],
      ['Fernandez', '31 Cal.App.5th 770', 'state-appellate'],
      ['Hatfield', '18 Cal.2d 798', 'state-supreme'],
      ['Louie', '81 Cal.App.2d 601', 'state-appellate'],
      ['Ortega', '26 Cal.4th 1200', 'state-supreme'],
      ['Reid', '50 Cal.4th 512', 'state-supreme'],
      ['Saelzler', '25 Cal.4th 763', 'state-supreme'],
      ['Sargon', '55 Cal.4th 747', 'state-supreme'],
    ],
  );
  // Each with its year and its parallel citations, and no reporter-only rows.
  assert.equal(
    row(reading, '25 Cal.4th 826').title,
    'Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826 [107 Cal.Rptr.2d 841, 24 P.3d 493]',
  );
  assert.equal(row(reading, '26 Cal.4th 1200').count, 9);
  assert.deepEqual(
    reading.authorities
      .filter(authority => authority.group === 'statutes')
      .map(authority => authority.title),
    [
      'Cal. Const., art. VI, § 13',
      'Civ. Code, § 1714(a)',
      'Code Civ. Proc., § 437c(c)',
      'Evid. Code, § 801(b)',
    ],
  );
  assert.equal(reading.authorities.length, 12);
  assert.ok(reading.authorities.every(authority => authority.warnings.length === 0));
  assert.deepEqual(reading.unresolved, []);
});

test('state brief: record citations support the facts, and pins come through', () => {
  const { reading } = read('state-brief');
  for (const section of reading.sections.filter(section => section.part === 'facts')) {
    for (const sentence of reading.sentences.slice(section.first - 1, section.last)) {
      if (sentence.role === 'heading') continue;
      assert.equal(sentence.support, 'record', sentence.text);
      assert.equal(sentence.attention, false, sentence.text);
    }
  }
  // The supra's volume and pin, the id.'s pin, and a pin before the sentence's period.
  const supra = findCitations(textOf('state-brief', 'actual or constructive knowledge'));
  assert.deepEqual(
    supra.map(cite => [cite.type, cite.volume, cite.reporter, cite.pin]),
    [['supra', '26', 'Cal.4th', '1206']],
  );
  const id = findCitations(textOf('state-brief', 'It considers all the evidence'));
  assert.deepEqual(
    id.map(cite => [cite.type, cite.pin]),
    [
      ['id', '843'],
      ['full', '768'],
    ],
  );
  assert.deepEqual(chips(sentenceWith(reading, 'It considers all the evidence')), [
    'Id. → Aguilar',
    'Saelzler 768',
  ]);
  assert.equal(sentenceWith(reading, 'Rulings on evidentiary objections').support, 'inferential');
  // A California statute's chip keeps its subdivision as written.
  assert.deepEqual(chips(sentenceWith(reading, 'A trial court properly grants')), [
    'Code Civ. Proc., § 437c, subd. (c)',
  ]);
});

test('state brief: only the introduction’s unsourced lines need attention', () => {
  const { reading } = read('state-brief');
  const ortega = sentenceWith(reading, 'But as the Supreme Court made clear in Ortega');
  assert.ok(flagIds(ortega).includes('named-before-full'));
  // The introduction tells the story without record citations, and names Ortega before
  // citing it. Nothing else in the brief needs attention.
  assert.deepEqual(
    attention(reading),
    numbersOf(reading, [
      'Maria Delgado fell in a FreshWay',
      'The trial court granted summary judgment because',
      'But as the Supreme Court made clear in Ortega',
    ]),
  );
  assert.ok(reading.attentionCount >= 2 && reading.attentionCount <= 4);
});

test('state brief: the guard keeps California citations exact', () => {
  const key = 'state-brief';
  const supra = textOf(key, 'actual or constructive knowledge');
  assert.equal(
    rewrite(
      key,
      supra,
      'A plaintiff must show that the owner actually or constructively knew of a dangerous condition it did not create in time to correct it. (Ortega, supra, 26 Cal.4th at p. 1206.)',
    ),
    null,
  );
  for (const [from, to] of [
    ['1206', '1207'],
    ['26 Cal.4th', '27 Cal.4th'],
    [', 26 Cal.4th at p. 1206', ''],
    [' (Ortega, supra, 26 Cal.4th at p. 1206.)', ''],
  ])
    assert.ok(rewrite(key, supra, supra.replace(from, to)), `${from} → ${to}`);
  const full = textOf(key, 'A store owner must use ordinary care');
  for (const [from, to] of [
    [', 1205 [', ', 1206 ['],
    ['Ortega v. Kmart Corp. (2001)', 'Ortega v. Target Corp. (2001)'],
    ['(2001)', '(2002)'],
    ['Civ. Code, § 1714', 'Gov. Code, § 1714'],
    ['subd. (a)', 'subd. (b)'],
  ])
    assert.ok(rewrite(key, full, full.replace(from, to)), `${from} → ${to}`);
  const id = textOf(key, 'It added that a plaintiff may raise');
  assert.ok(rewrite(key, id, id.replace('1210', '1211')));
  const record = textOf(key, 'The log for February 2 shows');
  assert.ok(rewrite(key, record, record.replace('2 CT 362', '2 CT 326')));
  assert.equal(
    rewrite(
      key,
      textOf(key, 'Like the store in Ortega'),
      'As Ortega held, a store can never rely on a skipped inspection. (See Ortega, supra, 26 Cal.4th at p. 1210.)',
    ),
    'holding-claim',
  );
  // Selections take a citation whole or leave it alone.
  assert.ok(selection(key, 'Ortega v. Kmart Corp.'));
  assert.ok(selection(key, '26 Cal.4th at p. 1206'));
  assert.ok(selection(key, 'Civ. Code'));
  assert.ok(selection(key, 'CT 371 [Ostrander depo.'));
  assert.equal(selection(key, 'reasonably safe for customers'), null);
  assert.equal(selection(key, 'because the store was short-staffed that day'), null);
});

test('state brief: autocomplete stays quiet partway into a California citation', () => {
  for (const before of [
    'correct it. (Ortega, supra, 26 Cal.4th at p.',
    'correct it. (Ortega, supra, 26 Cal.4th at p. 1206',
    'of time.” (Id. at p.',
    'de novo. (Aguilar v. Atlantic Richfield Co. (2001)',
    'law.” (Code Civ. Proc.,',
    'fell at 3:01 p.m. (2 CT',
    'arrived.” (RT 12:',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  assert.equal(citationContext('safe for customers. (Civ. Code, § 1714, subd. (a).)'), null);
  assert.equal(citationContext('A store owner must use ordinary care to keep its premises'), null);
  assert.equal(
    cutAtCitation(
      'A store owner must use ordinary care',
      ' to keep its premises safe. (Rowland v. Christian (1968) 69 Cal.2d 108, 113.)',
    ),
    ' to keep its premises safe.',
  );
  assert.equal(
    cutAtCitation(
      'Rulings on evidentiary objections are',
      ' reviewed for abuse of discretion. (Evid. Code, § 352.)',
    ),
    ' reviewed for abuse of discretion.',
  );
  assert.equal(
    cutAtCitation('Its assistant manager admitted', ' the sweep was skipped. (2 CT 371.)'),
    ' the sweep was skipped.',
  );
  assert.equal(
    guardInsertion(
      read('state-brief').doc,
      ', the Supreme Court held that inspection timing is a jury question.',
    ),
    'holding-claim',
  );
});

// ---------------------------------------------------------------------------
// The same brief in Bluebook form
// ---------------------------------------------------------------------------

test('Bluebook brief: the same sentences, sections, cases and checks as the California copy', () => {
  const csm = read('state-brief');
  const bluebook = read('state-brief-bluebook');
  assert.deepEqual(bluebook.labels, csm.labels);
  assert.deepEqual(sectionList(bluebook.reading), sectionList(csm.reading));
  assert.deepEqual(checkList(bluebook.reading), checkList(csm.reading));
  // The quotation and its "Id. at 1207 (internal quotation marks omitted)." are one sentence.
  assert.match(
    textOf('state-brief-bluebook', 'question of fact for the jury'),
    /jury\.” Id\. at 1207 \(internal quotation marks omitted\)\.$/,
  );
  // Eight cases keyed by the official reporter, as in the California copy, with pins.
  const keys = reading =>
    reading.authorities
      .filter(authority => authority.group === 'cases')
      .map(authority => authority.key);
  assert.deepEqual(keys(bluebook.reading), keys(csm.reading));
  assert.equal(
    row(bluebook.reading, '25 Cal.4th 826').title,
    'Aguilar v. Atl. Richfield Co., 25 Cal. 4th 826, 24 P.3d 493, 107 Cal. Rptr. 2d 841 (2001)',
  );
  assert.deepEqual(chips(sentenceWith(bluebook.reading, 'reviews the grant of summary')), [
    'Aguilar 860',
  ]);
  // No nameless duplicates, no "No full citation" or "No pin cite", no new law in II.
  assert.equal(bluebook.reading.authorities.length, 12);
  assert.ok(bluebook.reading.authorities.every(authority => authority.warnings.length === 0));
  assert.ok(!checkList(bluebook.reading).some(check => check.startsWith('new-law')));
  assert.deepEqual(bluebook.reading.unresolved, []);
  // A case's chips read the same in both forms, a California supra as the Bluebook short
  // form ("Ortega 1206"), down to the first page of each pin. The three sentences the
  // Bluebook copy cites to the record by mistake are the next test's.
  const slip = [
    'In Ortega, the Supreme Court rejected',
    'question of fact for the jury',
    'It added that',
  ];
  const caseChips = (reading, n) =>
    reading.sentences[n - 1].cites
      .filter(cite => reading.authorities.find(a => a.key === cite.key)?.group === 'cases')
      .map(cite => cite.label.replace(/(\d+)[-–]\d+$/, '$1'));
  for (const sentence of csm.reading.sentences) {
    if (slip.some(fragment => sentence.text.includes(fragment))) continue;
    assert.deepEqual(
      caseChips(bluebook.reading, sentence.n),
      caseChips(csm.reading, sentence.n),
      sentence.text,
    );
  }
});

test('Bluebook brief: an id. after a record citation means the record', () => {
  // The Bluebook copy turned “(Ortega, supra, … at pp. 1210-1211.)” into “Id. at
  // 1210–11.” right after “(1 CT 31-33.)”. An id. repeats the citation just before it,
  // so this one cites the clerk's transcript: a slip in the brief, and the sentence that
  // names Ortega is flagged for it. The California copy has no such slip.
  const { reading } = read('state-brief-bluebook');
  const slip = sentenceWith(reading, 'In Ortega, the Supreme Court rejected');
  assert.equal(slip.cites[0].key, null);
  assert.match(slip.cites[0].label, /^Id\. → 1 CT/);
  assert.ok(flagIds(slip).includes('uncited-case'));
  assert.equal(slip.attention, true);
  assert.deepEqual(
    attention(reading),
    numbersOf(reading, [
      'Maria Delgado fell in a FreshWay',
      'The trial court granted summary judgment because',
      'But as the Supreme Court made clear in Ortega',
      'In Ortega, the Supreme Court rejected',
    ]),
  );
});

test('Bluebook brief: the guard keeps parentheticals, parallels and pins', () => {
  const key = 'state-brief-bluebook';
  const quote = textOf(key, 'question of fact for the jury');
  assert.ok(rewrite(key, quote, quote.replace(' (internal quotation marks omitted)', '')));
  assert.ok(rewrite(key, quote, quote.replace('1207', '1208')));
  const parallel = textOf(key, 'reviews the grant of summary');
  assert.equal(
    rewrite(
      key,
      parallel,
      parallel.replace(
        'This court reviews the grant of summary judgment de novo.',
        'Review of a summary judgment grant is de novo.',
      ),
    ),
    null,
  );
  assert.ok(rewrite(key, parallel, parallel.replace(', 860,', ', 861,')));
  assert.ok(rewrite(key, parallel, parallel.replace('24 P.3d 493, ', '')));
  const citing = textOf(key, 'Instead, it must deny the motion');
  assert.ok(rewrite(key, citing, citing.replace('at 850)', 'at 851)')));
  const supra = textOf(key, 'In Saelzler, by contrast');
  assert.ok(rewrite(key, supra, supra.replace('775–76', '775–77')));
});

// ---------------------------------------------------------------------------
// The federal motion to dismiss
// ---------------------------------------------------------------------------

test('federal motion: brief sections, and the caption’s docket is not an authority', () => {
  const { reading } = read('federal-motion');
  assert.deepEqual(sectionList(reading), [
    'caption Caption',
    'introduction Introduction',
    'facts Facts',
    'standard Standard',
    'umbrella Umbrella',
    'umbrella I < Umbrella',
    'sub-issue I.A < I',
    'sub-issue I.B < I',
    'sub-issue II < Umbrella',
    'conclusion Conclusion',
  ]);
  const caption = sentenceWith(reading, 'No. 1:26-cv-03317');
  assert.equal(caption.support, 'n/a');
  assert.deepEqual(
    caption.cites.map(cite => cite.key),
    [null],
  );
  assert.ok(!reading.authorities.some(authority => /03317/.test(authority.key)));
  assert.ok(reading.authorities.every(authority => authority.group !== 'other'));
  assert.deepEqual(reading.unresolved, []);
});

test('federal motion: parallel, docket and Westlaw cases are each one authority', () => {
  const { reading } = read('federal-motion');
  const cases = Object.fromEntries(
    reading.authorities
      .filter(authority => authority.group === 'cases')
      .map(authority => [authority.name, authority]),
  );
  assert.deepEqual(
    ['Twombly', 'Iqbal', 'Oswego', 'Meridian Produce', 'Kessler'].map(name => [
      name,
      cases[name]?.key,
      cases[name]?.level,
    ]),
    [
      ['Twombly', '550 U.S. 544', 'supreme'],
      ['Iqbal', '556 U.S. 662', 'supreme'],
      ['Oswego', '85 N.Y.2d 20', 'state-supreme'],
      ['Meridian Produce', '2019 WL 1234567', 'district'],
      ['Kessler', '2021 WL 4410382', 'district'],
    ],
  );
  assert.match(
    cases.Oswego.title,
    /^Oswego Laborers’ Local 214 Pension Fund v\. Marine Midland Bank, N\.A\., 85 N\.Y\.2d 20/,
  );
  assert.match(cases['Meridian Produce'].title, /\(S\.D\.N\.Y\. Mar\. 5, 2019\)$/);
  assert.ok(Object.values(cases).every(authority => authority.warnings.length === 0));
  assert.deepEqual(chips(sentenceWith(reading, 'To survive a motion to dismiss')), [
    'Fed. R. Civ. P. 12(b)(6)',
    'Twombly 570',
  ]);
  assert.deepEqual(chips(sentenceWith(reading, 'Ashcroft v. Iqbal, 556 U.S. 662')), ['Iqbal 678']);
  assert.deepEqual(chips(sentenceWith(reading, 'as a threshold matter')), ['Oswego 25']);
  assert.ok(!reading.authorities.some(authority => /4\.2/.test(authority.key)));
});

test('federal motion: a docket citation runs through its date and parenthetical', () => {
  const string = textOf('federal-motion', 'Courts in this District routinely dismiss');
  const [meridian, rombach, kessler] = findCitations(string);
  assert.equal(meridian.type, 'docket');
  assert.equal(meridian.name, 'Meridian Produce Co. v. Talbot Freight Sys., Inc.');
  assert.deepEqual(
    [meridian.pin, meridian.court, meridian.date, meridian.signal],
    ['*3', 'S.D.N.Y.', 'Mar. 5, 2019', 'See'],
  );
  assert.match(meridian.parentheticals[0], /^dismissing fraud claim against carrier/);
  assert.equal(rombach.signal, 'see also');
  // Kessler is the contrary authority. Its "But see" citation sentence follows the
  // claim and belongs to it, so the sentence's support is the strongest signal, "See";
  // Kessler's own signal stays "But see".
  assert.equal(kessler.name, 'Kessler v. Northgate Cold Storage, LLC');
  assert.deepEqual([kessler.pin, kessler.signal], ['*6', 'But see']);
  const { reading } = read('federal-motion');
  assert.deepEqual(chips(sentenceWith(reading, 'Courts in this District routinely')), [
    'Meridian Produce *3',
    'Rombach 170',
    'Kessler *6',
  ]);
  assert.equal(sentenceWith(reading, 'Courts in this District routinely').support, 'inferential');
});

test('federal motion: facts rest on the record, and the analysis needs no new-law fixes', () => {
  const { reading } = read('federal-motion');
  for (const fragment of [
    'Corvina distributes fresh seafood',
    'signed a Master Transportation Agreement',
    'The Agreement requires Halvorsen',
    'According to the Complaint',
    'lost refrigeration near Hartford',
    'some of its older trailers lacked',
    'The damages Corvina seeks',
    'a negotiated, multi-year freight agreement',
  ])
    assert.equal(sentenceWith(reading, fragment).support, 'record', fragment);
  // An id. of the complaint names the complaint, not the paragraph the citation before
  // it gave.
  assert.deepEqual(chips(sentenceWith(reading, 'lost refrigeration near Hartford')), [
    'Id. → Compl.',
  ]);
  assert.deepEqual(chips(sentenceWith(reading, 'signed a Master Transportation Agreement')), [
    'Id. → Compl.',
    'Decl. of Tomas Reyes',
    'ECF No. 12',
    'Ex. A',
  ]);
  // The block quotation is sourced by the citation paragraph after it, and the bare
  // "Id." after a pinned citation needs no pin of its own.
  assert.equal(sentenceWith(reading, 'A claim has facial plausibility').support, 'direct');
  const threadbare = sentenceWith(reading, '[t]hreadbare recitals');
  assert.ok(!flagIds(threadbare).includes('quote-no-pin'));
  // The only new law in an application is Arista Records, which point I.A does bring in
  // for the first time while applying it. Iqbal, Twombly, the Westlaw cases and the
  // Agreement's sections are not new law.
  assert.deepEqual(checkList(reading), ['umbrella I', 'new-law-in-application I.A']);
  assert.match(reading.checks[1].message, /Arista Records/);
});

test('federal motion: attention only where a fact or a holding has no source', () => {
  const { reading } = read('federal-motion');
  // Three facts with no record citation, and a description of Iqbal's holding with no
  // pin cite. The report counted only the facts; a holding described without a
  // citation needs one as much.
  assert.deepEqual(
    attention(reading),
    numbersOf(reading, [
      'Corvina alleges that a refrigerated trailer failed',
      'The Complaint does not name the representative',
      'Halvorsen moves to dismiss Counts II and III only',
      'In Iqbal, the Court applied that standard',
    ]),
  );
  assert.ok(reading.attentionCount >= 3 && reading.attentionCount <= 5);
});

test('federal motion: the guard keeps docket, Westlaw and record citations exact', () => {
  const key = 'federal-motion';
  const string = textOf(key, 'Courts in this District routinely dismiss');
  assert.equal(
    rewrite(
      key,
      string,
      string.replace('Courts in this District routinely dismiss', 'Judges here regularly dismiss'),
    ),
    null,
  );
  for (const [from, to] of [
    ['at *3', 'at *5'],
    ['(S.D.N.Y. Mar. 5, 2019)', '(E.D.N.Y. Mar. 5, 2018)'],
    ['dismissing fraud claim against carrier', 'sustaining fraud claim against carrier'],
    ['But see Kessler', 'See Kessler'],
    ['; see also Rombach', '; but see Rombach'],
    ['at *6', 'at *9'],
    ['Sept. 27, 2021', 'Sept. 7, 2021'],
  ])
    assert.ok(rewrite(key, string, string.replace(from, to)), `${from} → ${to}`);
  const complaint = textOf(key, 'According to the Complaint');
  assert.ok(rewrite(key, complaint, complaint.replace('¶ 9', '¶ 19')));
  const id = textOf(key, 'lost refrigeration near Hartford');
  assert.ok(rewrite(key, id, id.replace('21–23', '21–29')));
  const bridgestone = textOf(key, 'Under New York law, a fraud claim');
  assert.ok(rewrite(key, bridgestone, `${bridgestone} See Bridgestone/Firestone, 98 F.3d at 25.`));
  assert.ok(selection(key, 'at *3 (S.D.N.Y. Mar. 5, 2019)'));
  assert.ok(selection(key, 'dismissing fraud claim against carrier'));
  assert.ok(selection(key, 'Kessler v. Northgate Cold Storage'));
  assert.ok(selection(key, 'Twombly, 550 U.S.'));
  assert.equal(selection(key, 'This is a contract dispute dressed up as a fraud case.'), null);
  assert.equal(
    guardInsertion(read(key).doc, ' because, as the court held in Kessler, a title is enough.'),
    'holding-claim',
  );
});

test('federal motion: autocomplete stays quiet partway into a docket or record citation', () => {
  for (const before of [
    'Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570, ',
    'Twombly, 550 U.S. 544, 570, 127 S. Ct. 1955, ',
    'Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (TZW), ',
    'No. 18-cv-7702 (TZW), 2019 WL 1234567, ',
    'But see Kessler v. Northgate Cold Storage, LLC, ',
    'with real-time monitoring on every trailer.” (Compl. ',
    'motion to dismiss under Fed. R. Civ. P. ',
    'see also Decl. of Tomas Reyes, ECF No. ',
    'Rombach v. Chang, 355 F.3d 164, 170 (2d Cir. 2004) (applying Rule 9(b) to ',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
  assert.equal(citationContext('This is a contract dispute dressed up as '), null);
  assert.equal(cutAtCitation('Corvina ships seafood', ' (Compl. ¶ 9) to restaurants.'), '');
  assert.equal(cutAtCitation('The Agreement is attached', ' as ECF No. 12, Exhibit A.'), ' as');
});

// ---------------------------------------------------------------------------
// The retaliation memo
// ---------------------------------------------------------------------------

test('retaliation memo: only the interview fact and the open item need attention', () => {
  const { reading } = read('full-memo');
  assert.deepEqual(sectionList(reading), [
    'caption Caption',
    'question Question',
    'answer Answer',
    'facts Facts',
    'umbrella Umbrella',
    'sub-issue A < Umbrella',
    'sub-issue B < Umbrella',
    'sub-issue C < Umbrella',
    'conclusion Conclusion',
  ]);
  assert.deepEqual(
    attention(reading),
    numbersOf(reading, ['told us that the overnight schedule', '(Need to confirm with client']),
  );
  // The question presented needs no authority; the Galabya counter rests on Burlington.
  assert.equal(sentenceWith(reading, 'Under Title VII’s anti-retaliation').support, 'n/a');
  const galabya = sentenceWith(reading, 'But Galabya applied the stricter standard');
  assert.equal(galabya.support, 'direct');
  assert.equal(galabya.attention, false);
  // No new-law check on the counter-argument's case, and no other check.
  assert.deepEqual(checkList(reading), []);
});

test('retaliation memo: short names are the ones lawyers use', () => {
  const { reading, blocks } = read('full-memo');
  assert.deepEqual(chips(sentenceWith(reading, 'must ultimately prove')), ['Nassar 360']);
  assert.deepEqual(chips(sentenceWith(reading, 'along lines previously contemplated')), [
    'Breeden 272',
  ]);
  assert.deepEqual(
    reading.authorities.filter(authority => authority.group === 'cases').map(a => a.name),
    ['Burlington', 'Breeden', 'Crawford', 'Galabya', 'Gorzynski', 'Hicks', 'Kwan', 'Nassar'],
  );
  // The client is Alvarez against Brightwater, not the statute in the RE line.
  assert.deepEqual(clientNames(blocks), [
    'Marisol Alvarez',
    'Brightwater Logistics',
    'Alvarez',
    'Brightwater',
  ]);
  // Record citations support the facts; an id. names the record it repeats.
  assert.equal(
    sentenceWith(reading, 'Hollis recommended the transfer in an email').support,
    'record',
  );
  assert.equal(sentenceWith(reading, 'Her supervisor, Grant Hollis').support, 'record');
});

test('retaliation memo: the guard keeps record cites, dates, signals and case names', () => {
  const key = 'full-memo';
  const transfer = textOf(key, 'On April 7, 2025, Brightwater transferred');
  assert.equal(
    rewrite(
      key,
      transfer,
      'Brightwater moved Alvarez to the overnight shift at its Joliet facility on April 7, 2025, forty miles from her home, at the same hourly rate. Ex. B at 3.',
    ),
    null,
  );
  for (const [from, to] of [
    ['Ex. B at 3', 'Ex. B at 4'],
    ['Ex. B at 3', 'Ex. C at 3'],
    [' Ex. B at 3.', ''],
    ['April 7', 'April 9'],
  ])
    assert.ok(rewrite(key, transfer, transfer.replace(from, to)), `${from} → ${to}`);
  const courts = textOf(key, 'Courts in this Circuit have not drawn');
  assert.ok(rewrite(key, courts, courts.replace('See Kwan', 'Kwan')));
  assert.ok(rewrite(key, courts, courts.replace('See Kwan', 'Cf. Kwan')));
  assert.ok(rewrite(key, courts, courts.replace('(three weeks)', '(five weeks)')));
  const like = textOf(key, 'Like the reassignment in Burlington Northern');
  assert.ok(rewrite(key, like, like.replace('Burlington Northern', 'Galabya')));
  assert.ok(rewrite(key, like, like.replace('Burlington Northern', 'White')));
  const dep = textOf(key, 'Here, Brightwater transferred Alvarez five weeks');
  assert.ok(rewrite(key, dep, dep.replace('22:15-23:4', '22:15-24:4')));
  assert.ok(selection(key, 'Burlington Northern', 'In Burlington Northern itself'));
  assert.ok(selection(key, 'Ex. B at'));
  assert.ok(selection(key, 'Dep. 22:15'));
  assert.equal(selection(key, 'made her job materially worse'), null);
});

// ---------------------------------------------------------------------------
// The statutory memo
// ---------------------------------------------------------------------------

test('statutory memo: “Relevant Facts” is the facts, so nothing fails', () => {
  const { reading } = read('statutory');
  assert.deepEqual(sectionList(reading), [
    'caption Caption',
    'question Question',
    'answer Answer',
    'facts Facts',
    'umbrella Umbrella',
    'sub-issue A < Umbrella',
    'sub-issue B < Umbrella',
    'sub-issue C < Umbrella',
    'conclusion Conclusion',
  ]);
  // Two authorities brought in while applying the law, and a conclusion surer of the
  // whole than part B is of itself: all three right.
  assert.deepEqual(checkList(reading), [
    'new-law-in-application Umbrella',
    'new-law-in-application B',
    'confidence Conclusion',
  ]);
  assert.match(reading.checks[0].message, /U\.S\. Const\. amend\. XIV, § 1/);
  assert.match(reading.checks[1].message, /Fed\. R\. Evid\. 401/);
});

test('statutory memo: cases by their short names, and statutes, regulations and secondary sources', () => {
  const { reading } = read('statutory');
  const cases = reading.authorities.filter(authority => authority.group === 'cases');
  assert.deepEqual(
    cases.map(authority => [authority.name, authority.level]),
    [
      ['Ford Motor', 'circuit'],
      ['Hoffman', 'state-supreme'],
      ['Jacobsen', 'state-supreme'],
      ['Summers', 'circuit'],
      ['Toyota', 'supreme'],
      ['Barnett', 'supreme'],
    ],
  );
  assert.match(row(reading, '740 F.3d 325').title, /^Summers v\. Altarum Institute, Corp\., /);
  assert.match(row(reading, '534 U.S. 184').title, /^Toyota Motor Mfg\., Ky\., Inc\. v\. Williams/);
  assert.match(row(reading, '782 F.3d 753').title, /^EEOC v\. Ford Motor Co\., /);
  // One row for § 12940 though the memo writes Gov't and Gov’t, and § 12926(m) and
  // § 292(21) as rows of their own, since an id. names a new section.
  assert.equal(row(reading, "Cal.Gov'tCode§12940").count, 2);
  assert.equal(row(reading, "Cal.Gov'tCode§12926").title, "Cal. Gov't Code § 12926(m)(1)(B)");
  assert.equal(row(reading, 'N.Y.Exec.Law§292').title, 'N.Y. Exec. Law § 292(21)');
  // The Federal Register with its date, the session law as one row, legislative history
  // and secondary sources under "other".
  assert.equal(row(reading, '76Fed.Reg.16,978').title, '76 Fed. Reg. 16,978 (Mar. 25, 2011)');
  assert.deepEqual(chips(sentenceWith(reading, 'list impairments that will')), [
    '§ 1630.2(j)(3)(iii)',
    '76 Fed. Reg. 16,978, 16,981',
  ]);
  assert.equal(row(reading, 'Pub.L.No.110-325').count, 2);
  assert.ok(!reading.authorities.some(authority => /Stat\.\d/.test(authority.key)));
  const other = reading.authorities.filter(authority => authority.group === 'other');
  assert.deepEqual(
    other.map(authority => authority.name),
    ['EEOC', 'H.R. Rep. No. 110-730, pt. 1', 'Castellano', 'Roe'],
  );
  assert.equal(
    row(reading, '100 Harv.L.Rev. 1').title,
    'Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1 (1987)',
  );
  assert.deepEqual(reading.unresolved, []);
});

test('statutory memo: id. with a section has its pin, and issues need no source', () => {
  const { reading } = read('statutory');
  for (const fragment of ['the operation of a major bodily function', 'episodic or in remission'])
    assert.ok(!flagIds(sentenceWith(reading, fragment)).includes('quote-no-pin'), fragment);
  assert.equal(sentenceWith(reading, 'turns on two questions').support, 'n/a');
  assert.deepEqual(chips(sentenceWith(reading, 'FEHA defines physical disability')), [
    "Id. → Cal. Gov't Code § 12926",
    'Cal. Gov’t Code § 12926.1(c)',
  ]);
  // Barnett, cited with no signal, supports the sentence directly; the "see" before the
  // rule of evidence in mid-sentence makes that citation only inferential support.
  const history = sentenceWith(reading, 'That history is relevant evidence');
  assert.equal(history.support, 'direct');
  assert.deepEqual(
    findCitations(history.text).map(cite => cite.signal),
    ['see', null],
  );
  assert.deepEqual(
    attention(reading),
    numbersOf(reading, [
      'Whitcombe has worked for Harbor Point',
      'Her symptoms are controlled most weeks',
      'informal, interactive process',
      'Courts have disagreed, however',
      'Commentators have argued',
      'TK: confirm',
    ]),
  );
  assert.ok(reading.attentionCount >= 4 && reading.attentionCount <= 8);
});

test('statutory memo: the client is Whitcombe and Harbor Point, not “Accommodation”', () => {
  const { blocks, labels } = read('statutory');
  assert.deepEqual(clientNames(blocks), [
    'Dana Whitcombe',
    'Harbor Point Logistics',
    'Whitcombe',
    'Harbor Point',
  ]);
  // A rule that names the employer is flagged; the EEOC guidance's title is not a client.
  const at = blocks.findIndex(block => block.text.startsWith('A reasonable accommodation may'));
  const text = 'Harbor Point must engage in the interactive process. 29 C.F.R. § 1630.2(o)(3).';
  const added = [
    ...blocks.slice(0, at + 1),
    { kind: 'p', text, sentences: sentencesIn(text, 'en') },
    ...blocks.slice(at + 1),
  ];
  const before = blocks.slice(0, at + 1).reduce((sum, block) => sum + block.sentences.length, 0);
  const reading = analyzeLegal(added, [
    ...labels.slice(0, before),
    ['rule', 'law'],
    ...labels.slice(before),
  ]);
  assert.deepEqual(
    reading.checks.filter(check => check.id === 'law-mentions-client').map(check => check.message),
    ['B: a rule mentions Harbor Point; keep client facts in the application.'],
  );
});

test('statutory memo: the guard keeps statutes, regulations and secondary sources exact', () => {
  const key = 'statutory';
  const congress = textOf(key, 'Congress added these rules of construction');
  for (const [from, to] of [
    ['at 5 (2008)', 'at 7 (2008)'],
    ['pt. 1', 'pt. 2'],
    ['3554', '3555'],
    [', 122 Stat. at 3554', ''],
    ['; H.R. Rep. No. 110-730, pt. 1, at 5 (2008)', ''],
  ])
    assert.ok(rewrite(key, congress, congress.replace(from, to)), `${from} → ${to}`);
  const fedReg = textOf(key, 'list impairments that will');
  assert.equal(
    rewrite(
      key,
      fedReg,
      fedReg.replace(
        'and the list is illustrative rather than exhaustive',
        'and the list is only illustrative',
      ),
    ),
    null,
  );
  assert.ok(rewrite(key, fedReg, fedReg.replace('16,981', '16,982')));
  assert.ok(rewrite(key, fedReg, fedReg.replace('Mar. 25, 2011', 'Mar. 25, 2012')));
  const commentators = textOf(key, 'Commentators have argued');
  for (const [from, to] of [
    ['1, 15', '1, 16'],
    ['5th ed. 2012', '6th ed. 2019'],
    ['Rethinking Essential Functions', 'Essential Functions Reconsidered'],
    [
      '; see also 1 Helen R. Castellano et al., Workplace Accommodation Law § 13.03 (5th ed. 2012)',
      '',
    ],
  ])
    assert.ok(rewrite(key, commentators, commentators.replace(from, to)), `${from} → ${to}`);
  const guidance = textOf(key, 'The EEOC’s guidance treats telework');
  assert.ok(rewrite(key, guidance, guidance.replace('Question 34', 'Question 35')));
  assert.ok(rewrite(key, guidance, guidance.replace(/ EEOC, Enforcement[^]*$/, '')));
  const accommodation = textOf(key, 'A reasonable accommodation may include');
  assert.ok(
    rewrite(
      key,
      accommodation,
      `${accommodation} See EEOC, Enforcement Guidance on Disability-Related Inquiries (July 27, 2000).`,
    ),
  );
  const feha = textOf(key, 'California’s Fair Employment and Housing Act');
  assert.ok(rewrite(key, feha, feha.replace('(m), (n)', '(m), (o)')));
  assert.ok(rewrite(key, feha, feha.replace(', (n)', '')));
  for (const selected of [
    '16,981 (Mar. 25, 2011)',
    'pt. 1, at 5 (2008)',
    '122 Stat. at 3554',
    'Enforcement Guidance: Reasonable Accommodation',
    'Jane Roe, Rethinking Essential Functions',
    '(5th ed. 2012)',
    'Castellano et al., supra note 6',
    ', (n)',
  ])
    assert.ok(selection(key, selected), selected);
  assert.equal(selection(key, 'Courts have disagreed, however, about how much weight'), null);
  for (const before of [
    'FEHA requires accommodation. Cal. Gov’t Code',
    'That history is relevant evidence, see Fed. R.',
    'Congress rejected that standard. H.R. Rep.',
    'The Equal Protection Clause, U.S. Const. amend.',
    'The regulations list impairments. See 29 C.F.R. pt. 1630, app.',
    'Commentators agree. Roe, supra note 4, at',
    'The agency agrees. EEOC, Enforcement Guidance',
  ])
    assert.equal(citationContext(before), 'inside-citation', before);
});

// ---------------------------------------------------------------------------
// The client email with a contract excerpt
// ---------------------------------------------------------------------------

test('client email: lettered clauses split, and a time zone does not', () => {
  const { reading } = read('informal');
  sentenceWith(reading, '(a) Provider may not terminate');
  sentenceWith(reading, '(b) Customer may terminate');
  assert.equal(
    sentenceWith(reading, '4.2 Termination for Convenience.').text,
    '4.2 Termination for Convenience.',
  );
  assert.match(
    textOf('informal', 'Scheduled Maintenance” means'),
    /4:00 a\.m\. U\.S\. Pacific Time\.$/,
  );
});

test('client email: the contract’s clauses get no rails, checks or authority rows', () => {
  const { reading } = read('informal');
  assert.deepEqual(sectionList(reading), [
    'caption Caption',
    'sub-issue Part 1',
    'other Part 2',
    'other Part 4 < Part 2',
    'other Part 6 < Part 2',
    'other Part 7 < Part 2',
    'other Part 12 < Part 2',
  ]);
  assert.ok(reading.sections.slice(2).every(section => section.rail === null));
  assert.deepEqual(reading.checks, []);
  // Contract sections and the order form are internal references, never statutes or
  // dockets; the Federal Arbitration Act is a statute.
  assert.deepEqual(
    reading.authorities.map(authority => [authority.group, authority.name]),
    [
      ['cases', 'Concepcion'],
      ['cases', 'Henry Schein'],
      ['cases', 'Rent-A-Center'],
      ['cases', 'Ridgley'],
      ['statutes', '§ 1 et seq.'],
      ['statutes', '§ 2'],
      ['statutes', 'Cal. Civ. Code § 1671'],
    ],
  );
  // A reference to a section of the contract is not where the sentence's claim begins.
  const separately = sentenceWith(reading, 'Separately, § 4.3 allows');
  assert.equal(separately.lead, separately.text);
  assert.deepEqual(chips(separately), ['§ 4.3']);
  // The advice is "probably" sure: "unlikely" in its trailing concession does not count.
  assert.deepEqual([reading.sections[1].rank, reading.sections[1].phrase], [2, 'probably']);
  assert.equal(reading.attentionCount, 0);
  for (const sentence of reading.sentences.slice(reading.sections[2].first - 1)) {
    assert.equal(sentence.support, 'n/a', sentence.text);
  }
});

test('client email: clauses labelled as client facts still need no source', () => {
  // A labeller that calls the agreement's clauses client facts, as the instructions did
  // before they had document text: a contract's own clauses are no claim to source.
  const { blocks, labels, reading } = read('informal');
  const excerpt = reading.sections[2].first - 1;
  const asFacts = labels.map((label, i) =>
    i >= excerpt && label[1] === 'document-text' ? ['facts', 'client-fact'] : label,
  );
  const facts = analyzeLegal(blocks, asFacts);
  assert.equal(facts.attentionCount, 0);
  assert.deepEqual(facts.checks, []);
});

test('client email: the guard keeps signals and numbers, and lets the prose through', () => {
  const key = 'informal';
  const schein = textOf(key, 'Because the clause also delegates');
  assert.ok(rewrite(key, schein, schein.replace('See Henry', 'But see Henry')));
  assert.ok(rewrite(key, schein, schein.replace('See Henry', 'Henry')));
  assert.ok(rewrite(key, schein, schein.replace('524, 529', '524, 530')));
  const notice = textOf(key, '(b) Customer may terminate');
  assert.equal(
    rewrite(key, notice, notice.replace('subject to payment of', 'provided it pays')),
    null,
  );
  assert.ok(rewrite(key, notice, notice.replace('sixty (60)', 'thirty (30)')));
  const signed = textOf(key, 'Kestrel signed the MSA');
  assert.ok(rewrite(key, signed, signed.replace('March 3, 2023', 'March 13, 2023')));
  assert.ok(rewrite(key, signed, signed.replace('40 hours', '400 hours')));
  const fees = textOf(key, 'Customer shall pay the fees set forth');
  assert.equal(
    rewrite(key, fees, fees.replace('within thirty (30) days', 'no later than thirty (30) days')),
    null,
  );
  assert.ok(rewrite(key, fees, fees.replace('2023-014', '2023-015')));
  // A cut before a citation keeps the word that ends the sentence before it.
  const scheinCite =
    ' See Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019).';
  assert.equal(cutAtCitation('The dispute goes to', ` JAMS.${scheinCite}`), ' JAMS.');
  assert.equal(cutAtCitation('The claim was filed in', ` Texas.${scheinCite}`), ' Texas.');
  // An order form number and a contract section are not citations to cut.
  const order = ' in Order Form No. 2023-014 within thirty (30) days.';
  assert.equal(cutAtCitation('Customer shall pay the fees set forth', order), order);
  assert.equal(
    citationContext(
      'Customer shall pay the fees set forth in each Order Form, including Order Form No.',
    ),
    null,
  );
  assert.equal(
    selection(
      key,
      'Bluefin has issued service credits for some of those outages but not all of them.',
    ),
    null,
  );
  assert.equal(
    selection(key, 'Section 4.2'),
    'Select the whole citation or quotation, or none of it.',
  );
});

// ---------------------------------------------------------------------------
// The magazine profile
// ---------------------------------------------------------------------------

test('magazine profile: English and Canadian authorities are read', () => {
  const { reading } = read('non-legal');
  assert.deepEqual(
    reading.authorities.map(authority => [authority.group, authority.name, authority.level]),
    [
      ['cases', '[2019] UKSC 5', 'supreme'],
      ['cases', 'Vavilov', 'supreme'],
      ['cases', 'Smith', 'appellate'],
      ['cases', 'Reckitt', 'supreme'],
      ['cases', 'Starbucks', 'supreme'],
      ['statutes', '§ 1125', 'statute'],
      ['statutes', 'Trademarks Act, RSC 1985, c T-13, s 19', 'statute'],
    ],
  );
  assert.deepEqual(
    ['English courts protect', 'The UK Supreme Court has since held', 'A Canadian claim'].map(
      fragment => sentenceWith(reading, fragment).support,
    ),
    ['inferential', 'direct', 'direct'],
  );
  assert.deepEqual(chips(sentenceWith(reading, 'The UK Supreme Court has since held')), [
    'Starbucks [47]',
  ]);
  // A neutral citation's number names the case; it is no page to show as a pin.
  assert.deepEqual(chips(sentenceWith(reading, 'The letter leaned instead')), [
    '[2019] UKSC 5 [41]',
    'Smith',
  ]);
  assert.deepEqual(chips(sentenceWith(reading, 'A Canadian claim')), [
    'Trademarks Act, RSC 1985, c T-13, s 19',
    'Vavilov para 23',
  ]);
});

test('magazine profile: the story gets no rails or checks, and its dialogue no flags', () => {
  const { reading, bare, blocks } = read('non-legal');
  // "U.S. Midwest" stays in its sentence; a quotation of two sentences is two.
  assert.match(
    textOf('non-legal', 'Cardinals v. Cubs'),
    /half of the U\.S\. Midwest wanted a pretzel\.$/,
  );
  assert.equal(sentenceWith(reading, '"Is it?').text, '"Is it?');
  const detour = reading.sections.find(
    section =>
      section.heading !== null && blocks[section.heading].text === 'A Brief Detour into Law',
  );
  assert.equal(detour.part, 'sub-issue');
  for (const section of reading.sections) {
    if (section === detour) continue;
    assert.equal(section.rail, null, section.tag);
  }
  // The report asked for no rails on the story. The legal detour is not story but
  // analysis, by its labels (a rule, a case, the other side's cases, a prediction), so
  // it keeps its rail; it ends on the lawyer's own words after its prediction, and the
  // one check says so. No missing Statement of Facts, no general claim about courts.
  assert.deepEqual(checkList(reading), [`closes-with-conclusion ${detour.tag}`]);
  for (const sentence of [...reading.sentences, ...bare.sentences])
    assert.ok(!flagIds(sentence).includes('quote-unsourced'), sentence.text);
  assert.equal(reading.attentionCount, 0);
  assert.equal(bare.attentionCount, 0);
  // "Unlikely" is a prediction as sure as "likely".
  assert.deepEqual(confidenceRank(textOf('non-legal', 'is unlikely to succeed')), {
    rank: 2,
    phrase: 'unlikely',
  });
  assert.deepEqual([detour.rank, detour.phrase], [2, 'unlikely']);
});

test('magazine profile: the guard keeps English and Canadian pins, and leaves the story alone', () => {
  const key = 'non-legal';
  const starbucks = textOf(key, 'The UK Supreme Court has since held');
  assert.ok(rewrite(key, starbucks, starbucks.replace('[47]', '[52]')));
  assert.ok(rewrite(key, starbucks, starbucks.replace('[2015] UKSC 31', '[2016] UKSC 13')));
  assert.ok(rewrite(key, starbucks, starbucks.replace(/ Starbucks[^]*$/, '')));
  const canada = textOf(key, 'A Canadian claim');
  assert.ok(rewrite(key, canada, canada.replace('para 23', 'para 32')));
  assert.ok(
    rewrite(
      key,
      canada,
      canada.replace(
        ' described in Canada (Minister of Citizenship and Immigration) v Vavilov, 2019 SCC 65 at para 23',
        '',
      ),
    ),
  );
  const reckitt = textOf(key, 'English courts protect');
  assert.ok(rewrite(key, reckitt, reckitt.replace('at 499', 'at 501')));
  assert.ok(
    rewrite(key, reckitt, `${reckitt} Ivey v Genting Casinos (UK) Ltd [2017] UKSC 67 at [74].`),
  );
  const smith = textOf(key, 'The letter leaned instead');
  assert.ok(rewrite(key, smith, smith.replace('[2004]', '[2005]')));
  const crashed = textOf(key, 'Cardinals v. Cubs');
  assert.equal(
    rewrite(
      key,
      crashed,
      'During the Cardinals v. Cubs home opener it crashed twice, when half of the U.S. Midwest wanted a pretzel.',
    ),
    null,
  );
  assert.equal(
    guardInsertion(read(key).doc, ' It also crashed during the Cardinals v. Brewers game.'),
    null,
  );
  // A jersey number and a ball game are not citations.
  const jersey = ' wore No. 5 for the River Otters and still orders a bun.';
  assert.equal(cutAtCitation('Regulars include Jonah Pruitt, who', jersey), jersey);
  const game = ' the Cardinals v. Cubs home opener last April.';
  assert.equal(cutAtCitation('It crashed twice during', game), game);
  assert.equal(citationContext('Regulars include Jonah Pruitt, who wore No.'), null);
  assert.equal(citationContext('It crashed twice during the Cardinals v.'), null);
  assert.equal(selection(key, 'wore No. 5 for the minor-league River Otters'), null);
  // English and Canadian citations are cut from autocomplete like any other.
  assert.equal(
    cutAtCitation(
      'Goodwill must be local.',
      ' Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47].',
    ),
    '',
  );
  assert.equal(cutAtCitation('The letter relied on', ' [2019] UKSC 5 at [41].'), '');
  assert.ok(selection(key, 'plc [2015] UKSC'));
  assert.ok(selection(key, 'Vavilov, 2019 SCC'));
  assert.ok(selection(key, '65 at para'));
});

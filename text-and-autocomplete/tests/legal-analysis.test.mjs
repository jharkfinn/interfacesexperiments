import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeLegal,
  sectionsOf,
  roleRuns,
  railOf,
  confidenceRank,
  clientNames,
  opening,
  STRUCTURE_CHECKS,
} from '../dist/legal-analysis.js';
import { sentencesIn } from '../dist/doc-model.js';
import { memoBlocks, MEMO_TAGS } from './fixtures/memo.mjs';

// The memo with Claude's expected labels, and the memo with none (offline).
const BLOCKS = memoBlocks();
const MEMO = analyzeLegal(BLOCKS, MEMO_TAGS);
const BARE = analyzeLegal(BLOCKS, null);

const sentence = n => MEMO.sentences[n - 1];
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const span = ({ role, first, last }) => `${role} S${first}${last > first ? `-${last}` : ''}`;
const runsIn = (reading, tag) => {
  const section = reading.sections.find(item => item.tag === tag);
  return reading.runs.filter(run => run.parent === section.index).map(span);
};
const SUFFIX = {
  own: '',
  quoted: ' · in quotation',
  nested: ' · inside (quoting …)',
  unresolved: ' · unresolved',
};
const chips = (n, reading = MEMO) =>
  reading.sentences[n - 1].cites.map(cite => cite.label + SUFFIX[cite.state]);
const flagIds = item =>
  item.flags.flatMap(flag => (flag.id === 'form' ? flag.items.map(i => `form ${i.id}`) : flag.id));
const rail = section => Object.fromEntries(section.rail.map(step => [step.letter, step.state]));
const tagged = tag => MEMO.sections.find(section => section.tag === tag);

// A small document from [kind, text] pairs, split the way the model splits it.
const doc = list =>
  list.map(([kind, text]) => ({ kind, text, sentences: sentencesIn(text, 'en') }));

test('the memo has a caption, an umbrella, two sub-issues and a conclusion', () => {
  assert.deepEqual(
    MEMO.sections.map(({ index, part, tag, first, last }) => [index, part, tag, first, last]),
    [
      [0, 'caption', 'Caption', 1, 5],
      [1, 'umbrella', 'Umbrella', 6, 14],
      [2, 'sub-issue', 'I', 15, 25],
      [3, 'sub-issue', 'II', 26, 39],
      [4, 'conclusion', 'Conclusion', 40, 46],
    ],
  );
  assert.equal(MEMO.sections[0].label, 'Title and routing lines');
  assert.equal(MEMO.sections[1].label, 'Discussion');
  assert.ok(MEMO.sections[2].label.startsWith('The Residence Co. facility was'));
  assert.ok(MEMO.sections[2].label.length <= 71);
  assert.deepEqual(
    MEMO.sections.map(section => section.heading),
    [null, 2, 8, 12, 17],
  );
  // Sections come from the headings alone, so they are the same without labels.
  assert.deepEqual(
    BARE.sections.map(section => section.tag),
    MEMO.sections.map(section => section.tag),
  );
  assert.equal(MEMO.sentences.length, 46);
  assert.ok(MEMO.labeled);
  assert.ok(!BARE.labeled);
});

test('sections without h2 to h6 headings, and subheadings outside the discussion', () => {
  const plain = sectionsOf(
    doc([
      ['p', 'One. Two.'],
      ['p', 'Three.'],
    ]),
  );
  assert.deepEqual(
    plain.map(({ part, tag, first, last }) => [part, tag, first, last]),
    [['sub-issue', 'Analysis', 1, 3]],
  );
  const titled = sectionsOf(
    doc([
      ['h1', 'Memo'],
      ['p', 'One.'],
      ['p', 'Two.'],
    ]),
  );
  assert.deepEqual(
    titled.map(({ part, tag }) => [part, tag]),
    [
      ['caption', 'Caption'],
      ['sub-issue', 'Analysis'],
    ],
  );
  const parts = sectionsOf(
    doc([
      ['h1', 'Memo'],
      ['p', 'TO: Partner'],
      ['h2', 'Question Presented'],
      ['p', 'Whether it is a dwelling.'],
      ['h2', 'Brief Answer.'],
      ['p', 'Probably yes.'],
      ['h2', 'Statement of Facts'],
      ['h3', 'A. The lease'],
      ['p', 'He leased a room.'],
      ['p', ''],
      ['h2', 'Discussion'],
      ['p', 'The rule.'],
      ['h2', 'Conclusion:'],
      ['p', 'Yes.'],
    ]),
  );
  // A subheading under Facts stays in Facts; a discussion with no sub-issues
  // after it is a sub-issue of its own; the blank paragraph belongs to nothing.
  assert.deepEqual(
    parts.map(({ part, tag, blocks }) => [part, tag, blocks]),
    [
      ['caption', 'Caption', [0, 1]],
      ['question', 'Question', [2, 3]],
      ['answer', 'Answer', [4, 5]],
      ['facts', 'Facts', [6, 7, 8]],
      ['sub-issue', 'Part 1', [10, 11]],
      ['conclusion', 'Conclusion', [12, 13]],
    ],
  );
});

test('runs split by role inside a paragraph and join whole paragraphs', () => {
  assert.equal(MEMO.runs.length, 30);
  assert.deepEqual(runsIn(MEMO, 'Caption'), ['heading S1', 'other S2-5']);
  assert.deepEqual(runsIn(MEMO, 'Umbrella'), [
    'heading S6',
    'issue S7',
    'rule S8',
    'rule S9-10',
    'rule S11',
    'issue S12',
    'rule S13',
    'rule S14',
  ]);
  assert.deepEqual(runsIn(MEMO, 'I'), [
    'heading S15',
    'rule S16',
    'conclusion S17',
    'facts S18',
    'explanation S19',
    'application S20',
    'explanation S21-23',
    'application S24',
    'conclusion S25',
  ]);
  assert.deepEqual(runsIn(MEMO, 'II'), [
    'heading S26',
    'explanation S27-29',
    'conclusion S30',
    'application S31-32',
    'counter S33-35',
    'rule S36',
    'explanation S37',
    'application S38',
    'conclusion S39',
  ]);
  assert.deepEqual(runsIn(MEMO, 'Conclusion'), ['heading S40', 'conclusion S41-46']);
  // S9-10 is a block quotation and the paragraph after it, both whole.
  assert.notEqual(sentence(9).block, sentence(10).block);
  // Every run is inside one block or covers whole blocks.
  for (const run of MEMO.runs) {
    const head = sentence(run.first);
    const tail = sentence(run.last);
    const whole = head.index === 0 && tail.index === BLOCKS[tail.block].sentences.length - 1;
    assert.ok(head.block === tail.block || whole, span(run));
  }
  const first = MEMO.runs[0];
  assert.deepEqual(first, {
    first: 1,
    last: 1,
    label: 'heading',
    method: '',
    parent: 0,
    role: 'heading',
    kind: 'framing',
    also: null,
    guess: false,
    conflict: false,
  });
  assert.equal(MEMO.runs.find(run => run.first === 15).kind, 'conclusion');
  // roleRuns gives the same runs from the sections and sentences.
  assert.deepEqual(roleRuns(MEMO.sections, MEMO.sentences), MEMO.runs);
});

test('without labels each paragraph is one run with no role', () => {
  assert.equal(BARE.runs.length, 19);
  assert.ok(BARE.runs.every(run => run.role === null && run.label === ''));
  for (const run of BARE.runs) {
    const head = BARE.sentences[run.first - 1];
    const tail = BARE.sentences[run.last - 1];
    assert.equal(head.block, tail.block);
    assert.equal(head.index, 0);
    assert.equal(tail.index, BLOCKS[tail.block].sentences.length - 1);
  }
  assert.ok(BARE.sentences.every(item => item.role === null && item.kind === null));
  assert.ok(BARE.sections.every(section => section.rail === null && section.rank === null));
  assert.deepEqual(BARE.checks, []);
});

test('each sentence carries where it is and its labels after the overrides', () => {
  const s16 = sentence(16);
  assert.deepEqual(
    {
      n: s16.n,
      block: s16.block,
      index: s16.index,
      section: s16.section,
      role: s16.role,
      kind: s16.kind,
    },
    { n: 16, block: 9, index: 0, section: 2, role: 'rule', kind: 'law' },
  );
  assert.equal(BLOCKS[9].text.slice(s16.start, s16.end), s16.text);
  // Headings are headings: S15's kind is conclusion because Claude said so.
  assert.deepEqual([sentence(15).role, sentence(15).kind], ['heading', 'conclusion']);
  assert.deepEqual([sentence(40).role, sentence(40).kind], ['heading', 'framing']);
  // The caption only frames, whatever Claude says; a heading in it stays a heading.
  const labels = MEMO_TAGS.map(pair => [...pair]);
  labels[2] = ['rule', 'law'];
  labels[0] = ['conclusion', 'conclusion'];
  const relabeled = analyzeLegal(BLOCKS, labels);
  assert.deepEqual(
    [relabeled.sentences[2].role, relabeled.sentences[2].kind],
    ['other', 'framing'],
  );
  assert.deepEqual(
    [relabeled.sentences[0].role, relabeled.sentences[0].kind],
    ['heading', 'conclusion'],
  );
});

test('labels may come as the objects parseLegal returns, with also, guess and conflicts', () => {
  const objects = MEMO_TAGS.map(([role, kind], i) => ({ text: sentence(i + 1).text, role, kind }));
  objects[19] = { ...objects[19], also: 'explanation' };
  objects[35] = { role: 'rule', kind: 'precedent', guess: true };
  const reading = analyzeLegal(BLOCKS, objects);
  assert.equal(reading.sentences[19].also, 'explanation');
  assert.equal(reading.runs.find(run => run.first === 20).also, 'explanation');
  const s36 = reading.sentences[35];
  assert.ok(s36.guess && s36.conflict);
  const run = reading.runs.find(item => item.first === 36);
  assert.ok(run.guess && run.conflict);
  // also is dropped when it repeats the role, and a label outside the lists is no label.
  const odd = analyzeLegal(doc([['p', 'One. Two.']]), [
    { role: 'rule', kind: 'law', also: 'rule' },
    { role: 'rules', kind: 'law' },
  ]);
  assert.equal(odd.sentences[0].also, null);
  assert.deepEqual([odd.sentences[1].role, odd.sentences[1].kind], [null, null]);
  assert.ok(!analyzeLegal(doc([['p', 'One.']]), [['bogus', 'law']]).labeled);
});

test('support for each sentence of the memo', () => {
  const expected = {
    'n/a': [...range(1, 6), 15, 17, 20, 24, 25, 26, 30, 33, 35, 38, 39, ...range(40, 46)],
    missing: [7, 12, 27, 28, 36],
    direct: [8, 9, 11, 14, 19, 21, 22, 23, 32, 37],
    below: [10, 13],
    incomplete: [16],
    unsourced: [18, 31, 34],
    secondhand: [29],
  };
  const actual = {};
  for (const item of MEMO.sentences) (actual[item.support] ||= []).push(item.n);
  assert.deepEqual(actual, expected);
});

test('flags for each sentence of the memo', () => {
  // The spec's table, plus "quote" on S21-S23: each quotes Lakeside at length,
  // which is what the quote flag marks; the table listed only the notable flags.
  const expected = {
    8: ['form statute'],
    9: ['quote'],
    11: ['form missing-space'],
    13: ['named-before-full', 'named-before-full'],
    14: ['quote', 'form no-period'],
    16: ['quote', 'quote-no-pin', 'form comma-before-court'],
    19: ['quote', 'form no-period'],
    21: ['quote'],
    22: ['quote', 'form lowercase', 'form doubled'],
    23: ['quote', 'form lowercase', 'form no-punctuation-before-citation'],
    24: ['see-suggested'],
    27: ['quote-unclosed', 'uncited-case'],
    28: ['form footnote'],
    29: ['never-full'],
    31: ['quote', 'quote-unsourced'],
    32: ['quote', 'form lowercase'],
    33: ['see-suggested'],
    34: ['open'],
    37: ['quote', 'form no-punctuation-before-citation', 'form stray-period'],
  };
  for (const item of MEMO.sentences) {
    assert.deepEqual(flagIds(item), expected[item.n] || [], `S${item.n}`);
  }
  const texts = n => sentence(n).flags.map(flag => flag.text);
  assert.deepEqual(texts(13), [
    'Named before its full citation: Columbus Country Club',
    'Named before its full citation: Lakeside',
  ]);
  assert.deepEqual(texts(24), ['Relies on Lakeside: consider a See cite']);
  assert.deepEqual(texts(33), ['Relies on Lakeside: consider a See cite']);
  assert.deepEqual(texts(27), [
    'Quotation never closed',
    'Describes Columbus Country Club without citing it',
  ]);
  assert.deepEqual(texts(29), ['Never cited in full: Hovsons']);
  assert.deepEqual(texts(31), ['Quotation', 'Quotation with no source']);
  assert.deepEqual(texts(34), ['Open item']);
  assert.deepEqual(texts(16), ['Quotation', 'Quotation without a pin cite', 'Form']);
  // The one Form flag is muted, and its title lists what is wrong.
  const form = sentence(37).flags.find(flag => flag.id === 'form');
  assert.equal(form.attention, false);
  assert.equal(
    form.title,
    'No punctuation between the quotation and the citation\nStray period before a comma',
  );
  assert.deepEqual(sentence(8).flags[0].items, [
    { id: 'statute', text: 'Statute not in Bluebook form' },
  ]);
  const starred = MEMO.sentences.flatMap(item =>
    item.flags.filter(flag => flag.attention).map(flag => flag.id),
  );
  assert.ok(!starred.includes('quote') && !starred.includes('form'));
  assert.ok(!starred.includes('see-suggested'));
});

test('citation chips name the authority and say where the citation stands', () => {
  assert.deepEqual(chips(14), [
    'Columbus Country Club 881 · in quotation',
    'Lakeside 158',
    'Columbus Country Club 881 · inside (quoting …)',
  ]);
  assert.deepEqual(chips(19), [
    'id. · in quotation',
    'Hovsons 1102 · in quotation',
    'Lakeside 159',
  ]);
  assert.deepEqual(chips(16), ['Smith (docket)']);
  assert.deepEqual(chips(8), ['§ 3602(b)']);
  assert.deepEqual(chips(11), ['§ 3602(c)']);
  assert.deepEqual(chips(32), ['Lakeside 159–60']);
  assert.deepEqual(chips(37), ['DeFiore 418–19', 'DeFiore 418–19']);
  // A chip's span is the citation's own text in its block, and it carries the key.
  for (const item of MEMO.sentences) {
    for (const cite of item.cites) {
      assert.equal(BLOCKS[item.block].text.slice(cite.start, cite.end), cite.text);
      assert.ok(cite.start >= item.start && cite.end <= item.end);
    }
  }
  assert.deepEqual(
    sentence(14).cites.map(cite => cite.key),
    ['915 F.2d 877', '455 F.3d 154', '915 F.2d 877'],
  );
  assert.equal(sentence(19).cites[0].key, null);
  // Without labels the citations are the same.
  assert.deepEqual(
    BARE.sentences.map(item => item.cites),
    MEMO.sentences.map(item => item.cites),
  );
});

test('the lead is what a sentence says before its first own citation', () => {
  assert.equal(
    sentence(8).lead,
    'For the purposes of defining a dwelling under the FHA, the applicable statutory definition is',
  );
  assert.ok(sentence(14).lead.startsWith('“First, we must decide'));
  assert.ok(sentence(14).lead.endsWith('during that period.”'));
  assert.ok(
    sentence(37).lead.endsWith('are not allowed to personalize or decorate their sleeping space”'),
  );
  assert.equal(sentence(7).lead, sentence(7).text);
  const signal = analyzeLegal(
    doc([['p', 'The rule is settled. See Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).']]),
    null,
  );
  assert.equal(signal.sentences[0].lead, 'The rule is settled.');
});

test('needs attention: weak support or a starred flag', () => {
  const attention = reading => reading.sentences.filter(item => item.attention).map(item => item.n);
  assert.equal(MEMO.attentionCount, 11);
  assert.deepEqual(attention(MEMO), [7, 12, 13, 16, 18, 27, 28, 29, 31, 34, 36]);
  assert.equal(BARE.attentionCount, 6);
  assert.deepEqual(attention(BARE), [13, 16, 27, 29, 31, 34]);
  // Without labels S29 is not known to describe a case, so its cite is direct.
  assert.equal(BARE.sentences[28].support, 'direct');
  assert.equal(BARE.sentences[6].support, 'unknown');
  assert.equal(BARE.sentences[0].support, 'n/a');
});

test('signals set how strongly a citation supports the sentence', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Rule one. See Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Rule two. See also Doe v. Roe, 5 F.4th 10, 12 (9th Cir. 2020). Rule three. But see Kay v. Lee, 3 F.3d 4, 6 (3d Cir. 1999). Rule four. See generally Ash v. Elm, 7 F.4th 1, 2 (1st Cir. 2021). Rule five. Cf. Oak v. Fir, 8 F.4th 1, 3 (1st Cir. 2021) (holding that oaks grow). The tenant left in May (Compl. ¶ 12). Rule six. Smith, 1 F.3d 2.',
      ],
    ]),
    [...Array(5).fill(['rule', 'law']), ['facts', 'client-fact'], ['rule', 'law'], ['rule', 'law']],
  );
  assert.deepEqual(
    reading.sentences.map(item => item.support),
    [
      'inferential',
      'indirect',
      'contrary',
      'background',
      'indirect',
      'record',
      'missing',
      'incomplete',
    ],
  );
  // See also with no parenthetical needs one; Cf. with one does not.
  assert.deepEqual(flagIds(reading.sentences[1]), ['needs-parenthetical']);
  assert.ok(reading.sentences[1].flags[0].attention);
  assert.deepEqual(flagIds(reading.sentences[4]), []);
  assert.ok(reading.sentences[2].attention);
});

test('rails: I R A C for each sub-issue, P R M for the umbrella', () => {
  assert.deepEqual(rail(tagged('Umbrella')), { P: 'missing', R: 'ok', M: 'missing' });
  assert.deepEqual(rail(tagged('I')), { I: 'ok', R: 'ok', A: 'ok', C: 'ok' });
  assert.deepEqual(rail(tagged('II')), { I: 'ok', R: 'order', A: 'ok', C: 'ok' });
  assert.equal(tagged('Caption').rail, null);
  assert.equal(tagged('Conclusion').rail, null);
  const titles = section => section.rail.map(step => [step.letter, step.title]);
  assert.deepEqual(titles(tagged('II')), [
    ['I', 'Issue'],
    ['R', 'The rule comes after the application'],
    ['A', 'Application'],
    ['C', 'Conclusion'],
  ]);
  assert.deepEqual(titles(tagged('Umbrella')), [
    ['P', 'No overall prediction'],
    ['R', 'Cited rule'],
    ['M', 'No roadmap'],
  ]);
  assert.deepEqual(
    tagged('I').rail.map(step => step.roles),
    [['issue', 'heading'], ['rule'], ['application', 'counter'], ['conclusion']],
  );
  // railOf gives the same rail from the runs.
  assert.deepEqual(railOf(tagged('II'), MEMO.runs, MEMO.sentences), tagged('II').rail);
  // A sub-issue with no heading that opens on a rule and never concludes.
  const bare = analyzeLegal(
    doc([
      ['p', 'A landlord must mitigate. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).'],
      ['p', 'Here the landlord did nothing.'],
    ]),
    [
      ['rule', 'law'],
      ['application', 'application'],
    ],
  );
  assert.deepEqual(
    bare.sections[0].rail.map(step => [step.letter, step.state, step.title]),
    [
      ['I', 'missing', 'No issue stated'],
      ['R', 'ok', 'Rule'],
      ['A', 'ok', 'Application'],
      ['C', 'missing', 'No closing conclusion'],
    ],
  );
  const empty = analyzeLegal(
    doc([
      ['h2', 'Discussion'],
      ['p', 'Courts agree.'],
      ['h3', 'A. One'],
      ['p', 'It is so.'],
      ['h3', 'B. Two'],
      ['p', 'It is so.'],
    ]),
    [
      ['heading', 'framing'],
      ['roadmap', 'framing'],
      ['heading', 'framing'],
      ['facts', 'client-fact'],
      ['heading', 'framing'],
      ['facts', 'client-fact'],
    ],
  );
  assert.deepEqual(
    empty.sections[0].rail.map(step => [step.letter, step.state, step.title]),
    [
      ['P', 'missing', 'No overall prediction'],
      ['R', 'missing', 'No cited rule'],
      ['M', 'ok', 'Roadmap'],
    ],
  );
  assert.deepEqual(
    empty.sections[1].rail.map(step => [step.letter, step.state, step.title]),
    [
      ['I', 'ok', 'Issue'],
      ['R', 'missing', 'No rule'],
      ['A', 'missing', 'No application to the client’s facts'],
      ['C', 'missing', 'No closing conclusion'],
    ],
  );
});

test('how sure each section sounds', () => {
  assert.deepEqual(
    MEMO.sections.map(section => [section.tag, section.rank, section.phrase]),
    [
      ['Caption', null, null],
      ['Umbrella', null, null],
      ['I', 3, 'highly likely'],
      ['II', 2, 'most likely'],
      ['Conclusion', 3, 'highly likely'],
    ],
  );
  assert.deepEqual(
    confidenceRank(
      'While we cannot say for certain that the court will find it above the mark, it is highly likely that it does.',
    ),
    { rank: 3, phrase: 'highly likely' },
  );
  assert.deepEqual(confidenceRank(sentence(43).text), { rank: 1, phrase: 'more uncertain' });
  assert.deepEqual(confidenceRank(sentence(42).text), { rank: 3, phrase: 'easily met' });
  assert.deepEqual(confidenceRank('Doe would most likely win.'), {
    rank: 2,
    phrase: 'most likely',
  });
  assert.deepEqual(confidenceRank('It should be met.'), { rank: 2, phrase: 'should' });
  assert.deepEqual(confidenceRank('It is a close question.'), {
    rank: 1,
    phrase: 'close question',
  });
  assert.equal(confidenceRank('The court held so.'), null);
});

test('structure checks on the memo', () => {
  const count = severity => MEMO.checks.filter(check => check.severity === severity).length;
  assert.deepEqual([count('fail'), count('warn'), count('info')], [1, 6, 2]);
  assert.deepEqual(
    MEMO.checks.map(check => [check.id, check.where, check.message]),
    [
      ['facts-section', '', 'No Statement of Facts: 3 client facts appear only in the analysis.'],
      [
        'umbrella',
        'Umbrella',
        'The umbrella gives no overall prediction and does not say the order of discussion.',
      ],
      ['rule-before-application', 'II', 'II applies the law before stating a rule.'],
      [
        'generalization',
        'I',
        '“Courts “have not defined what…” speaks for courts in general but rests on one authority (Lakeside).',
      ],
      [
        'generalization',
        'II',
        '“District courts have allowed…” speaks for courts in general but rests on one authority (DeFiore).',
      ],
      [
        'confidence',
        'Conclusion',
        'The conclusion says “highly likely”, but II says only “most likely”. The conclusion also calls a part “more uncertain”. If every part must be met, the whole is no surer than its weakest part.',
      ],
      // I is 154 of 328 words. The sample names the building "Residence Co.",
      // two words, which is why this is not the 48% a one-word name gives.
      ['quotation-share', 'I', 'I is 47% quotation.'],
      [
        'alternating',
        'I',
        'I moves between explanation and application 3 times; consider explaining the cases before applying them.',
      ],
      [
        'alternating',
        'II',
        'II moves between explanation and application 3 times; consider explaining the cases before applying them.',
      ],
    ],
  );
  const ids = MEMO.checks.map(check => check.id);
  for (const id of [
    'opens-with-issue',
    'closes-with-conclusion',
    'new-law-in-application',
    'law-mentions-client',
    'headings-predict',
  ]) {
    assert.ok(!ids.includes(id), id);
  }
  // II is 29% quotation, under the 40% line.
  assert.ok(!MEMO.checks.some(check => check.id === 'quotation-share' && check.where === 'II'));
  assert.deepEqual(clientNames(BLOCKS), ['Doe']);
  // Each check points at sentences, and at their text in the document.
  const where = id => MEMO.checks.find(check => check.id === id);
  assert.deepEqual(where('facts-section').sentences, [18, 31, 34]);
  assert.deepEqual(where('rule-before-application').sentences, [31, 36]);
  assert.deepEqual(where('confidence').sentences, [41, 26, 43]);
  assert.deepEqual(where('generalization').spans, [
    { block: sentence(19).block, start: sentence(19).start, end: sentence(19).end },
  ]);
  for (const check of MEMO.checks) {
    assert.ok(STRUCTURE_CHECKS.includes(check.id));
    assert.equal(check.spans.length, check.sentences.length);
  }
});

test('structure checks that the memo passes fire on documents that fail them', () => {
  const reading = analyzeLegal(
    doc([
      ['h1', 'Memo'],
      ['p', 'RE: Acme Widgets, Inc.; lease'],
      ['h3', 'I. Damages'],
      [
        'p',
        'Acme must show harm under the rule. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Acme lost its lease. See Poe v. Moe, 3 F.3d 4, 6 (3d Cir. 2002). Acme will probably recover.',
      ],
      ['h3', 'II. Fees'],
      ['p', 'Here the lease shifts fees. Fees are therefore likely.'],
    ]),
    [
      ['heading', 'framing'],
      ['other', 'framing'],
      ['heading', 'framing'],
      ['rule', 'law'],
      ['application', 'application'],
      ['conclusion', 'conclusion'],
      ['heading', 'framing'],
      ['application', 'application'],
      ['conclusion', 'conclusion'],
    ],
  );
  assert.deepEqual(clientNames(doc([['p', 'TO: X\nRE: Acme Widgets, Inc.; lease']])), [
    'Acme',
    'Widgets',
  ]);
  assert.deepEqual(
    reading.checks.map(check => check.message),
    [
      'There is no umbrella before the sub-issues.',
      'II states no rule.',
      'I brings in Poe for the first time while applying it.',
      'I: a rule mentions Acme; keep client facts in the application.',
      'I’s heading names a topic instead of predicting the answer.',
      'II’s heading names a topic instead of predicting the answer.',
    ],
  );
  const opens = analyzeLegal(
    doc([
      ['p', 'A landlord must mitigate. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).'],
      ['p', 'Here the landlord did nothing.'],
    ]),
    [
      ['rule', 'law'],
      ['application', 'application'],
    ],
  );
  assert.deepEqual(
    opens.checks.map(check => check.message),
    ['Analysis opens without stating its issue.', 'Analysis ends without a conclusion.'],
  );
  const conclusion = analyzeLegal(
    doc([
      ['h2', 'Discussion'],
      ['p', 'We take each part in turn.'],
      ['h3', 'A. One'],
      ['p', 'It is unlikely.'],
      ['h3', 'B. Two'],
      ['p', 'It is clearly met.'],
      ['h2', 'Conclusion'],
      ['p', 'It is likely. The first part is unclear.'],
    ]),
    [
      ['heading', 'framing'],
      ['roadmap', 'framing'],
      ['heading', 'conclusion'],
      ['conclusion', 'conclusion'],
      ['heading', 'conclusion'],
      ['conclusion', 'conclusion'],
      ['heading', 'framing'],
      ['conclusion', 'conclusion'],
      ['conclusion', 'conclusion'],
    ],
  );
  assert.deepEqual(
    conclusion.checks
      .filter(check => check.id !== 'rule-before-application')
      .map(check => check.message),
    [
      'The umbrella gives no overall prediction and states no cited rule.',
      'The conclusion says “likely”, but A says only “unlikely”. The conclusion also calls a part “unclear”. If every part must be met, the whole is no surer than its weakest part.',
    ],
  );
});

test('the table of authorities', () => {
  const rows = MEMO.authorities.map(row => ({
    group: row.group,
    title: row.title,
    level: row.level,
    count: row.count,
    where: row.where,
    warnings: row.warnings,
  }));
  assert.deepEqual(rows, [
    {
      group: 'cases',
      title: 'DeFiore v. City Rescue Mission of New Castle, 995 F. Supp. 2d 413 (W.D. Pa. 2013)',
      level: 'district',
      count: 4,
      where: 'II · Conclusion',
      warnings: [],
    },
    {
      group: 'cases',
      title: 'Hovsons, 89 F.3d',
      level: 'unknown',
      count: 2,
      where: 'I · II',
      warnings: ['No full citation in this document'],
    },
    {
      group: 'cases',
      title:
        'Lakeside Resort Enters., LP v. Bd. of Supervisors of Palmyra Twp., 455 F.3d 154 (3d Cir. 2006)',
      level: 'circuit',
      count: 16,
      where: 'Umbrella · I · II · Conclusion',
      warnings: [],
    },
    {
      group: 'cases',
      title: 'Smith v. Salvation Army, No. 13-114-J (W.D. Pa. 2015)',
      level: 'district',
      count: 1,
      where: 'I',
      warnings: ['Unreported: add a database cite (WL or LEXIS), the full date, and a pin cite'],
    },
    {
      group: 'cases',
      title: 'United States v. Columbus Country Club, 915 F.2d 877 (3d Cir. 1990)',
      level: 'circuit',
      count: 5,
      where: 'Umbrella · I · II',
      warnings: ['Cited in full only inside “(quoting …)”'],
    },
    {
      group: 'statutes',
      title: '42 U.S.C. § 3602(b), (c)',
      level: 'statute',
      count: 3,
      where: 'Umbrella',
      warnings: ['Not in Bluebook form: 42 U.S. Code § 3602 (b)'],
    },
  ]);
  const lakeside = MEMO.authorities[2];
  assert.equal(lakeside.key, '455 F.3d 154');
  assert.equal(lakeside.name, 'Lakeside');
  assert.equal(lakeside.court, '3d Cir.');
  assert.equal(
    lakeside.title.slice(...lakeside.italic),
    'Lakeside Resort Enters., LP v. Bd. of Supervisors of Palmyra Twp.',
  );
  assert.equal(MEMO.authorities[1].title.slice(...MEMO.authorities[1].italic), 'Hovsons');
  assert.equal(MEMO.authorities[5].italic, null);
  // Mentions: 1 full and 6 short citations, and 9 references by name.
  const types = {};
  for (const mention of lakeside.mentions) types[mention.type] = (types[mention.type] || 0) + 1;
  assert.deepEqual(types, { reference: 9, full: 1, short: 6 });
  for (const mention of lakeside.mentions) {
    assert.ok(BLOCKS[mention.block].text.slice(mention.start, mention.end).startsWith('Lakeside'));
  }
  const columbus = MEMO.authorities[4];
  assert.deepEqual(
    columbus.mentions.map(mention => [mention.type, mention.state, mention.section]),
    [
      ['reference', 'named', 'Umbrella'],
      ['short', 'quoted', 'Umbrella'],
      ['full', 'nested', 'Umbrella'],
      ['reference', 'quoted', 'I'],
      ['reference', 'named', 'II'],
    ],
  );
  assert.deepEqual(MEMO.unresolved, [
    {
      text: 'id. in I, inside a quotation: it refers to the quoted court’s own earlier citation.',
      span: { block: 10, start: 119, end: 122 },
    },
  ]);
  // The table is worked out from the text alone.
  assert.deepEqual(BARE.authorities, MEMO.authorities);
});

test('short forms, id. and supra resolve through the document', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'As noted, id. at 2, the rule stands.'],
      ['p', 'Courts award damages. 28 U.S.C. § 1332(a) (2018). Id. § 1332(b).'],
      ['p', 'A case held so. Jones v. Ray, 9 F.3d 1, 4 (2d Cir. 2001). Id. at 5.'],
      ['p', 'It was later followed. Jones, supra, at 6. Lee, supra, at 7.'],
      ['p', 'It differs. Ray, 10 F.3d at 3. Id. at 4.'],
    ]),
    null,
  );
  const labels = reading.sentences.flatMap(item =>
    item.cites.map(cite => `${cite.label}/${cite.state}`),
  );
  assert.deepEqual(labels, [
    'id./unresolved',
    '§ 1332(a)/own',
    'Id. → § 1332/own',
    'Jones 4/own',
    'Id. → Jones/own',
    'Jones, supra/own',
    'Lee, supra, at 7/unresolved',
    // An id. after a case never cited in full means that case, so it is unresolved too.
    'Ray 3/unresolved',
    'Id./unresolved',
  ]);
  assert.deepEqual(
    reading.authorities.map(row => [row.group, row.title, row.count, row.warnings]),
    [
      ['cases', 'Jones v. Ray, 9 F.3d 1 (2d Cir. 2001)', 3, []],
      ['cases', 'Ray, 10 F.3d', 2, ['No full citation in this document']],
      ['statutes', '28 U.S.C. § 1332(a), (b)', 2, []],
    ],
  );
  assert.deepEqual(
    reading.unresolved.map(item => item.text),
    [
      'id. at 2 in Analysis: there is no earlier citation for it to refer to.',
      'Lee, supra, at 7 in Analysis: no full citation in this document has that name.',
    ],
  );
});

test('a block read once gives the same reading every time', () => {
  const again = analyzeLegal(memoBlocks(), MEMO_TAGS);
  assert.deepEqual(again, MEMO);
  // Another document between two readings shares no state with them.
  const edited = memoBlocks();
  edited[18] = { ...edited[18], text: 'Edited.', sentences: sentencesIn('Edited.', 'en') };
  analyzeLegal(edited, null);
  assert.deepEqual(analyzeLegal(memoBlocks(), MEMO_TAGS), MEMO);
  assert.deepEqual(analyzeLegal([], null), {
    labeled: false,
    sentences: [],
    sections: [],
    runs: [],
    checks: [],
    authorities: [],
    unresolved: [],
    attentionCount: 0,
  });
});

test('opening cuts at a word', () => {
  assert.equal(opening('short', 10), 'short');
  assert.equal(opening('The key term over which the plain text', 20), 'The key term over…');
});

test('two cases in one reporter volume stay two authorities', () => {
  // Celotex and Anderson are both in 477 U.S., and summary judgment briefs cite them together.
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Summary judgment is proper when no material fact is in dispute. Celotex Corp. v. Catrett, 477 U.S. 317, 322 (1986). A dispute is genuine if a jury could find for the nonmovant. Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986).',
      ],
      [
        'p',
        'The movant bears the first burden. Celotex, 477 U.S. at 323. The court views the evidence for the nonmovant. Anderson, 477 U.S. at 255. It does not weigh it. Id. at 256. Nor does it find facts. 477 U.S. at 249.',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    [
      'Celotex 322',
      'Anderson 248',
      'Celotex 323',
      'Anderson 255',
      'Id. → Anderson',
      // With no name, the pin falls inside Anderson (242 on), not Celotex (317 on).
      'Anderson 249',
    ],
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.title, row.count, row.level]),
    [
      ['Anderson v. Liberty Lobby, Inc., 477 U.S. 242 (1986)', 4, 'supreme'],
      ['Celotex Corp. v. Catrett, 477 U.S. 317 (1986)', 2, 'supreme'],
    ],
  );
  // Two cases never cited in full from one volume are two rows as well.
  const nameless = analyzeLegal(
    doc([['p', 'One rule. Hovsons, 89 F.3d at 1102. Another rule. Smith, 89 F.3d at 40.']]),
    null,
  );
  assert.deepEqual(
    nameless.authorities.map(row => row.title),
    ['Hovsons, 89 F.3d', 'Smith, 89 F.3d'],
  );
});

test('a bare section joins the statute it is a section of', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Claims arise under § 1983. 42 U.S.C. § 1983 (2018).'],
      ['p', 'Under § 1983(a), a plaintiff must show a deprivation. Id.'],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.title, row.count, row.warnings]),
    [['42 U.S.C. § 1983(a)', 4, []]],
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    ['§ 1983', '§ 1983', '§ 1983(a)', 'Id. → § 1983'],
  );
});

test('a statute with its code edition is in Bluebook form', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'The court has jurisdiction. 28 U.S.C. § 1332 (2018). It may hear related claims. 28 U.S.C. § 1367 (West 2020).',
      ],
    ]),
    null,
  );
  assert.deepEqual(reading.sentences.map(flagIds), [[], []]);
  assert.deepEqual(
    reading.authorities.map(row => row.warnings),
    [[], []],
  );
  // A space before a subsection is still flagged.
  const spaced = analyzeLegal(doc([['p', 'It is defined. 42 U.S.C. § 3602 (b).']]), null);
  assert.deepEqual(spaced.sentences.map(flagIds), [['form statute']]);
});

test('a constitution keeps its article or amendment in chips and the table', () => {
  const reading = analyzeLegal(
    doc([['p', 'The state may not deny equal protection. U.S. Const. amend. XIV, § 1.']]),
    [['rule', 'law']],
  );
  assert.deepEqual(chips(1, reading), ['U.S. Const. amend. XIV, § 1']);
  assert.equal(reading.authorities[0].name, 'U.S. Const. amend. XIV, § 1');
});

test('numbered top headings still name their parts', () => {
  const sections = sectionsOf(
    doc([
      ['h1', 'Memorandum'],
      ['h2', 'I. Question Presented'],
      ['p', 'Whether it is a dwelling.'],
      ['h2', 'II. Brief Answer'],
      ['p', 'Probably yes.'],
      ['h2', 'III. Statement of Facts'],
      ['p', 'He leased a room.'],
      ['h2', 'IV. Discussion'],
      ['p', 'Two parts.'],
      ['h3', 'A. Intent'],
      ['p', 'It was intended.'],
      ['h3', 'B. Return'],
      ['p', 'He returned.'],
      ['h2', 'V. CONCLUSION'],
      ['p', 'Yes.'],
    ]),
  );
  assert.deepEqual(
    sections.map(({ part, tag }) => [part, tag]),
    [
      ['caption', 'Caption'],
      ['question', 'Question'],
      ['answer', 'Answer'],
      ['facts', 'Facts'],
      ['umbrella', 'Umbrella'],
      ['sub-issue', 'A'],
      ['sub-issue', 'B'],
      ['conclusion', 'Conclusion'],
    ],
  );
});

test('court levels, dockets with no name, and short forms nothing resolves', () => {
  // A reporter that starts like U.S. is not the Supreme Court's.
  const levels = analyzeLegal(
    doc([['p', 'The rule. Doe v. Roe, 5 U.S. App. D.C. 10, 12 (1950).']]),
    null,
  );
  assert.equal(levels.authorities[0].level, 'unknown');
  // An id. after a bare docket number means that docket, whose court is stated.
  const docket = analyzeLegal(
    doc([['p', 'A rule. No. 13-114-J (W.D. Pa. 2015). Another rule. Id. at 4.']]),
    null,
  );
  assert.deepEqual(chips(2, docket), ['Id. → No. 13-114-J']);
  assert.deepEqual(docket.unresolved, []);
  assert.deepEqual(
    [docket.authorities[0].court, docket.authorities[0].level],
    ['W.D. Pa.', 'district'],
  );
  // A short form with no name and no full citation reads as one, not as a page.
  const short = analyzeLegal(doc([['p', 'The rule. 455 F.3d at 158.']]), null);
  assert.deepEqual(chips(1, short), ['455 F.3d at 158 · unresolved']);
});

test('no space after the period applies to scripts that put spaces between sentences', () => {
  const reading = analyzeLegal(doc([['p', '裁判所は判断した。これは重要だ。']]), null);
  assert.equal(reading.sentences.length, 2);
  assert.deepEqual(reading.sentences.map(flagIds), [[], []]);
  assert.deepEqual(flagIds(sentence(11)), ['form missing-space']);
});

test('looking for the client line takes no longer as empty lines are added', () => {
  // Each line start once looked through every line after it for "RE:".
  const blank = { kind: 'p', text: `${'\n'.repeat(12000)}x`, sentences: [] };
  const started = performance.now();
  assert.deepEqual(clientNames([blank]), []);
  assert.ok(performance.now() - started < 50);
  // The line must start with RE, not merely come after a blank line that does not.
  assert.deepEqual(clientNames(doc([['p', 'TO: Partner\n\nRE: Acme Widgets; lease']])), [
    'Acme',
    'Widgets',
  ]);
  assert.deepEqual(clientNames(doc([['p', 'TO: Partner\nAREA: Acme']])), []);
});

test('generalization with no authority says so', () => {
  const reading = analyzeLegal(
    doc([['p', 'Most courts reject this argument. The client should settle.']]),
    [
      ['rule', 'law'],
      ['conclusion', 'conclusion'],
    ],
  );
  assert.deepEqual(
    reading.checks.filter(check => check.id === 'generalization').map(check => check.message),
    ['“Most courts reject this…” speaks for courts in general but rests on no authority.'],
  );
});

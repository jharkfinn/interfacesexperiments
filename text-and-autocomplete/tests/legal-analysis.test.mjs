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
  // S7 and S12 state the issue, so they need no authority (AN-20).
  const expected = {
    'n/a': [...range(1, 7), 12, 15, 17, 20, 24, 25, 26, 30, 33, 35, 38, 39, ...range(40, 46)],
    missing: [27, 28, 36],
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
  // S7 and S12, the issues, once counted as missing authority (AN-20).
  assert.equal(MEMO.attentionCount, 9);
  assert.deepEqual(attention(MEMO), [13, 16, 18, 27, 28, 29, 31, 34, 36]);
  // Without labels S31's quotation may be a fact or a story's, so it is noted but not
  // counted (AN-19).
  assert.equal(BARE.attentionCount, 5);
  assert.deepEqual(attention(BARE), [13, 16, 27, 29, 34]);
  assert.deepEqual(flagIds(BARE.sentences[30]), ['quote', 'quote-unsourced']);
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
    // Sub-issues that explain a case but state no rule (one holding only facts is no
    // sub-issue at all, so it gets no rail: see the AN-3 test).
    [
      ['heading', 'framing'],
      ['roadmap', 'framing'],
      ['heading', 'framing'],
      ['explanation', 'precedent'],
      ['heading', 'framing'],
      ['explanation', 'precedent'],
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
  // A name is matched as a phrase, and by a word of it only where the document uses that
  // word alone (AN-9).
  assert.deepEqual(clientNames(doc([['p', 'TO: X\nRE: Acme Widgets, Inc.; lease']])), [
    'Acme Widgets',
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
      ['p', 'It may not be met.'],
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
      'The conclusion says “likely”, but A says only “may not”. The conclusion also calls a part “unclear”. If every part must be met, the whole is no surer than its weakest part.',
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
  // A short form for a case never cited in full is listed too (AN-28).
  assert.deepEqual(MEMO.unresolved, [
    {
      text: 'id. in I, inside a quotation: it refers to the quoted court’s own earlier citation.',
      span: { block: 10, start: 119, end: 122 },
    },
    {
      text: 'Hovsons, 89 F.3d at 1102 in I: no full citation in this document has this volume and reporter.',
      span: { block: 10, start: 189, end: 213 },
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
    // A supra with a pin reads as a short form does.
    'Jones 6/own',
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
      // A case never cited in full, and the id. that repeats it (AN-28).
      'Ray, 10 F.3d at 3 in Analysis: no full citation in this document has this volume and reporter.',
      'Id. at 4 in Analysis: it repeats Ray, which has no full citation in this document.',
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
    type: 'memo',
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
  // A reporter that starts like U.S. is not the Supreme Court's: it is the D.C. Circuit's
  // (it read as unknown before AN-26 gave reporters their courts).
  const levels = analyzeLegal(
    doc([['p', 'The rule. Doe v. Roe, 5 U.S. App. D.C. 10, 12 (1950).']]),
    null,
  );
  assert.equal(levels.authorities[0].level, 'circuit');
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
    'Acme Widgets',
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

// ---------------------------------------------------------------------------
// Generality: briefs, letters, contracts, stories, and citation forms beyond the memo's.
// The IDs are the generality report's.
// ---------------------------------------------------------------------------

// Labels from "role/kind" words: tags('rule/law application/application').
const tags = text => text.split(/\s+/).map(pair => pair.split('/'));
const shape = reading => reading.sections.map(({ part, tag }) => `${part} ${tag}`);
const supports = reading => reading.sentences.map(item => item.support);
const rows = reading =>
  reading.authorities.map(row => `${row.group} | ${row.title} | ${row.level}`);

test('brief and variant headings name their parts, which get no rails or IRAC checks (AN-1)', () => {
  const partFor = heading =>
    sectionsOf(
      doc([
        ['h1', 'Memo'],
        ['h2', heading],
        ['p', 'Text.'],
        ['h2', 'Discussion'],
        ['p', 'Rule.'],
      ]),
    )[1].part;
  const expected = {
    introduction: ['Introduction', 'Preliminary Statement', 'SUMMARY OF THE ARGUMENT'],
    standard: ['Legal Standard', 'STANDARD OF REVIEW', 'Standards of Decision'],
    facts: [
      'Statement of the Case',
      'Procedural History',
      'Relevant Facts',
      'Facts and Procedural History',
      'Factual and Procedural Background',
      'Factual Summary',
      'Background Facts',
      'BACKGROUND',
    ],
    question: ['Issue Presented', 'Issues', 'Statement of the Issues'],
    conclusion: ['Conclusion and Recommendation', 'Recommendations'],
    other: ['Statement of Jurisdiction', 'I. Jurisdiction', 'The Story'],
  };
  for (const [part, headings] of Object.entries(expected)) {
    for (const heading of headings) assert.equal(partFor(heading), part, heading);
  }
  const brief = analyzeLegal(
    doc([
      ['h2', 'Introduction'],
      ['p', 'The claim fails. The Court should dismiss it.'],
      ['h2', 'Legal Standard'],
      [
        'p',
        'A complaint must state a plausible claim. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).',
      ],
      ['h2', 'Argument'],
      [
        'p',
        'The claim fails. A claim needs a duty. Doe v. Roe, 2 F.3d 3, 4 (2d Cir. 2002). Here there was no duty. The claim therefore fails.',
      ],
      ['h2', 'Conclusion'],
      ['p', 'The Court should dismiss.'],
    ]),
    tags(
      'heading/framing conclusion/conclusion conclusion/conclusion heading/framing rule/law heading/framing conclusion/conclusion rule/law application/application conclusion/conclusion heading/framing conclusion/conclusion',
    ),
  );
  assert.deepEqual(shape(brief), [
    'introduction Introduction',
    'standard Standard',
    'sub-issue Part 1',
    'conclusion Conclusion',
  ]);
  assert.deepEqual(
    brief.sections.map(section => Boolean(section.rail)),
    [false, false, true, false],
  );
  assert.deepEqual(brief.checks, []);
});

test('point headings nest: a heading with headings under it is their umbrella (AN-2)', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Argument'],
      ['h3', 'I. The claim fails'],
      ['p', 'A claim needs a duty and a breach. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).'],
      ['h4', 'A. No duty'],
      ['p', 'Here there was no duty. So the first element fails.'],
      ['h4', 'B. No breach'],
      ['p', 'Here there was no breach. So the second element fails.'],
      ['h3', 'II. No damages'],
      ['p', 'Damages need proof. Doe v. Roe, 2 F.3d 3, 4 (2d Cir. 2002). Here there is none.'],
      ['p', 'So damages fail.'],
    ]),
    tags(
      'heading/framing heading/conclusion rule/law heading/conclusion application/application conclusion/conclusion heading/conclusion application/application conclusion/conclusion heading/conclusion rule/law application/application conclusion/conclusion',
    ),
  );
  assert.deepEqual(
    reading.sections.map(({ part, tag, parent }) => `${part} ${tag} ${parent}`),
    [
      'umbrella Umbrella null',
      'umbrella I 0',
      'sub-issue I.A 1',
      'sub-issue I.B 1',
      'sub-issue II 0',
    ],
  );
  // ARGUMENT is only its heading, so it has no rail and asks for nothing.
  assert.equal(reading.sections[0].rail, null);
  // I.A and I.B take their rule from I, the umbrella over them.
  assert.deepEqual(rail(reading.sections[2]), { I: 'ok', R: 'ok', A: 'ok', C: 'ok' });
  assert.equal(reading.sections[2].rail[1].title, 'Rule stated in the umbrella');
  assert.deepEqual(
    reading.checks.map(check => check.message),
    ['The umbrella I does not say the order of discussion.'],
  );
});

test('sections with no analysis get no rails or checks; without labels only Discussion is the discussion (AN-3, AN-4)', () => {
  const contract = analyzeLegal(
    doc([
      ['h2', 'Email to Dana'],
      [
        'p',
        'Can Kestrel end the contract early? Section 4.2 lets the customer terminate on notice. Here Kestrel can give notice. So it can end the contract.',
      ],
      ['h2', 'Excerpt: Services Agreement'],
      ['h3', '4. Term and Termination'],
      ['p', 'This Agreement lasts three years. Customer may terminate on sixty days’ notice.'],
      ['h3', '12. Governing Law'],
      ['p', 'This Agreement is governed by California law.'],
    ]),
    tags(
      'heading/framing issue/framing rule/law application/application conclusion/conclusion heading/framing heading/framing facts/client-fact facts/client-fact heading/framing facts/client-fact',
    ),
  );
  assert.deepEqual(shape(contract), [
    'sub-issue Part 1',
    'other Part 2',
    'other Part 4',
    'other Part 12',
  ]);
  assert.deepEqual(
    contract.sections.map(section => Boolean(section.rail)),
    [true, false, false, false],
  );
  assert.deepEqual(contract.checks, []);
  // The clauses tell facts that need no source.
  assert.deepEqual(supports(contract).slice(6), ['n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
  assert.equal(contract.attentionCount, 0);
  // A story's sections, labeled as facts, are not a Statement of Facts or sub-issues.
  const story = analyzeLegal(
    doc([
      ['h2', 'An Early Start'],
      ['p', 'She starts baking at five. “People think it’s romantic,” she says.'],
      ['h2', 'The Recipe'],
      ['p', 'The dough rests overnight.'],
    ]),
    tags('heading/framing facts/client-fact facts/client-fact heading/framing facts/client-fact'),
  );
  assert.deepEqual(shape(story), ['other Part 1', 'other Part 2']);
  assert.deepEqual(story.checks, []);
  assert.equal(story.attentionCount, 0);
  // Without labels an h2 is the discussion only if it says so; one before it is a part
  // of its own and one after it a point heading under it, whose digits read "Part 4".
  assert.deepEqual(
    sectionsOf(
      doc([
        ['h2', 'The Story'],
        ['p', 'Once.'],
        ['h2', 'Analysis'],
        ['p', 'The rule.'],
        ['h2', '4. Fees'],
        ['p', 'Here.'],
        ['h2', '12. Venue'],
        ['p', 'There.'],
      ]),
    ).map(({ part, tag, parent }) => `${part} ${tag} ${parent}`),
    ['other Other null', 'umbrella Umbrella null', 'sub-issue Part 4 1', 'sub-issue Part 12 1'],
  );
});

test('facts-section runs only on a memo or brief, on facts told in the analysis (AN-5)', () => {
  const ids = reading => reading.checks.map(check => check.id);
  // An email has no Statement of Facts to miss.
  const email = analyzeLegal(
    doc([
      ['p', 'Can Kestrel leave the contract?'],
      [
        'p',
        'Kestrel signed the contract in March. The rule allows termination. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Here Kestrel may leave. So it can.',
      ],
    ]),
    tags('issue/framing facts/client-fact rule/law application/application conclusion/conclusion'),
  );
  assert.ok(!ids(email).includes('facts-section'));
  // "Relevant Facts" is the memo's Statement of Facts.
  const memo = analyzeLegal(
    doc([
      ['h2', 'Relevant Facts'],
      ['p', 'Kestrel signed in March.'],
      ['h2', 'Discussion'],
      [
        'p',
        'Whether Kestrel may leave. The rule allows it. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Here Kestrel gave notice. So it may.',
      ],
    ]),
    tags(
      'heading/framing facts/client-fact heading/framing issue/framing rule/law application/client-fact conclusion/conclusion',
    ),
  );
  assert.ok(!ids(memo).includes('facts-section'));
  // A memo with none counts only the facts its analysis tells.
  const missing = analyzeLegal(
    doc([
      ['h2', 'Question Presented'],
      ['p', 'Whether Kestrel may leave.'],
      ['h2', 'Discussion'],
      [
        'p',
        'Whether Kestrel may leave. Kestrel signed in March. The rule allows it. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). So it may.',
      ],
    ]),
    tags(
      'heading/framing issue/framing heading/framing issue/framing facts/client-fact rule/law conclusion/conclusion',
    ),
  );
  assert.deepEqual(
    missing.checks.filter(check => check.id === 'facts-section').map(check => check.message),
    ['No Statement of Facts: 1 client fact appears only in the analysis.'],
  );
});

test('a greeting and a sign-off are not where an analysis opens or closes (AN-6)', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Dana,'],
      [
        'p',
        'Whether Kestrel may leave. It probably may. The rule allows termination. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Here Kestrel gave notice. So it may leave.',
      ],
      ['p', 'Best regards, Morgan'],
    ]),
    tags(
      'other/framing issue/framing conclusion/conclusion rule/law application/application conclusion/conclusion other/framing',
    ),
  );
  assert.deepEqual(rail(reading.sections[0]), { I: 'ok', R: 'ok', A: 'ok', C: 'ok' });
  assert.deepEqual(reading.checks, []);
});

test('a counter-argument may bring in the other side’s case (AN-7)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A transfer is adverse if it would deter a reasonable worker. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Here the transfer added a long commute. The employer may argue that a lateral transfer is not adverse. See Galabya v. N.Y.C. Bd. of Educ., 202 F.3d 636, 640 (2d Cir. 2000). The transfer is therefore adverse.',
      ],
    ]),
    tags('rule/law application/application counter/application conclusion/conclusion'),
  );
  assert.deepEqual(
    reading.checks.filter(check => check.id === 'new-law-in-application'),
    [],
  );
});

test('a rule a statute states is no generalization about courts (AN-8)', () => {
  const messages = text =>
    analyzeLegal(doc([['p', text]]), tags('rule/law conclusion/conclusion'))
      .checks.filter(check => check.id === 'generalization')
      .map(check => check.message);
  assert.deepEqual(
    messages(
      'Federal law requires courts to enforce arbitration agreements. 9 U.S.C. § 2. The clause stands.',
    ),
    [],
  );
  assert.deepEqual(
    messages('Courts enforce arbitration clauses. 9 U.S.C. § 2. The clause stands.'),
    [],
  );
  assert.deepEqual(
    messages(
      'Courts enforce arbitration clauses. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). The clause stands.',
    ),
    [
      '“Courts enforce arbitration…” speaks for courts in general but rests on one authority (Smith).',
    ],
  );
});

test('the client’s names come from every part of the RE or Subject line and a brief’s caption (AN-9)', () => {
  const names = text => clientNames(doc([['p', text]]));
  assert.deepEqual(
    names('RE: Title VII retaliation claim of Marisol Alvarez against Brightwater Logistics, Inc.'),
    ['Marisol Alvarez', 'Brightwater Logistics'],
  );
  assert.deepEqual(
    names('RE: Accommodation Request of Dana Whitcombe; Harbor Point Logistics, Inc.'),
    ['Dana Whitcombe', 'Harbor Point Logistics'],
  );
  assert.deepEqual(names('Subject: Smith v. Jones; Lease review'), ['Smith', 'Jones']);
  assert.deepEqual(names('RE: Doe; Dwelling definition under FHA'), ['Doe']);
  assert.deepEqual(
    names(
      'MARIA DELGADO, Plaintiff and Appellant,\nv.\nFRESHWAY MARKETS, INC., Defendant and Respondent.',
    ),
    ['Maria Delgado', 'Freshway Markets'],
  );
  assert.deepEqual(
    names('THE PEOPLE, Plaintiff and Respondent,\nv.\nJOHN ROE, Defendant and Appellant.'),
    ['John Roe'],
  );
  // The shorter name the document uses, and the rule that uses it.
  const reading = analyzeLegal(
    doc([
      ['p', 'RE: Accommodation Request of Dana Whitcombe; Harbor Point Logistics, Inc.'],
      ['h2', 'Discussion'],
      [
        'p',
        'Whether Harbor Point must accommodate Whitcombe. Under Title VII an employer must accommodate. Harbor Point must engage in the interactive process. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). So it must.',
      ],
    ]),
    tags('other/framing heading/framing issue/framing rule/law rule/law conclusion/conclusion'),
  );
  assert.deepEqual(
    clientNames(
      doc([
        ['p', 'RE: Harbor Point Logistics, Inc.'],
        ['p', 'Harbor Point agreed.'],
      ]),
    ),
    ['Harbor Point Logistics', 'Harbor Point'],
  );
  assert.deepEqual(
    reading.checks.filter(check => check.id === 'law-mentions-client').map(check => check.message),
    ['Part 1: a rule mentions Harbor Point; keep client facts in the application.'],
  );
});

test('a brief argues: no confidence ranks, and its umbrella need not state the rule (AN-10)', () => {
  const blocks = (caption, heading) =>
    doc([
      ['p', caption],
      ['h2', heading],
      ['p', 'The claims fail.'],
      ['h3', 'I. The fraud claim should be dismissed'],
      [
        'p',
        'Fraud needs particularity. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). Here there is none. The claim should therefore be dismissed.',
      ],
      ['h3', 'II. The statutory claim should be dismissed'],
      [
        'p',
        'The statute needs consumer conduct. Doe v. Roe, 2 F.3d 3, 4 (2d Cir. 2002). Here there is none. The claim should therefore be dismissed.',
      ],
    ]);
  const labels = tags(
    'other/framing other/framing other/framing heading/framing conclusion/conclusion heading/conclusion rule/law application/application conclusion/conclusion heading/conclusion rule/law application/application conclusion/conclusion',
  );
  const caption = 'CORVINA FOODS, LLC, Plaintiff,\nv.\nHALVORSEN LOGISTICS, INC., Defendant.';
  const reading = analyzeLegal(blocks(caption, 'Discussion'), labels);
  assert.equal(reading.type, 'brief');
  assert.deepEqual(
    reading.sections.map(section => section.rank),
    [null, null, null, null],
  );
  assert.deepEqual(
    reading.checks.map(check => check.message),
    ['The umbrella does not say the order of discussion.'],
  );
  // An Argument heading makes a brief too.
  assert.equal(analyzeLegal(blocks('TO: Partner', 'Argument'), null).type, 'brief');
  // A memo may name the parties' roles on its RE line; a caption's party line starts with
  // the party.
  assert.equal(
    analyzeLegal(blocks('TO: Partner\nRE: Jane Doe, Plaintiff, v. Acme Corp.', 'Discussion'), null)
      .type,
    'memo',
  );
  // The same text as a memo ranks how sure it sounds and asks for the cited rule.
  const memo = analyzeLegal(blocks('TO: Partner', 'Discussion'), labels.slice(2));
  assert.equal(memo.type, 'memo');
  assert.deepEqual(
    memo.sections.map(section => section.rank),
    [null, null, 2, 2],
  );
  assert.deepEqual(
    memo.checks.map(check => check.message),
    ['The umbrella does not say the order of discussion and states no cited rule.'],
  );
});

test('a sentence’s second role counts on the sub-issue rail (AN-11)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Whether it is a disability. The ADA covers episodic impairments. 42 U.S.C. § 12102(4)(D). Her flares therefore limit digestion.',
      ],
    ]),
    [
      ['issue', 'framing'],
      ['rule', 'law'],
      ['conclusion', 'conclusion', 'application'],
    ],
  );
  assert.deepEqual(rail(reading.sections[0]), { I: 'ok', R: 'ok', A: 'ok', C: 'ok' });
});

test('“unlikely” predicts as surely as “likely”, and a trailing concession is not the prediction (AN-12)', () => {
  assert.deepEqual(confidenceRank('A court is unlikely to enforce the fee.'), {
    rank: 2,
    phrase: 'unlikely',
  });
  assert.deepEqual(confidenceRank('A court is highly unlikely to enforce it.'), {
    rank: 3,
    phrase: 'highly unlikely',
  });
  assert.deepEqual(
    confidenceRank(
      'Probably yes to the first, although a judge is unlikely to be the one who decides.',
    ),
    { rank: 2, phrase: 'Probably' },
  );
  assert.deepEqual(confidenceRank('It may not be met.'), { rank: 1, phrase: 'may not' });
});

test('a case goes by the name the writer calls it, from legal-text’s shortName (AN-13)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A claim must be plausible. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Labels will not do. Iqbal, 556 U.S. at 679.',
      ],
      [
        'p',
        'Timing alone rarely suffices. Clark Cnty. Sch. Dist. v. Breeden, 532 U.S. 268, 273 (2001). An employer may proceed as planned. Breeden, 532 U.S. at 272.',
      ],
      [
        'p',
        'Telework may be required. EEOC v. Ford Motor Co., 782 F.3d 753, 762 (6th Cir. 2015). Arbitrability goes to the arbitrator. Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019).',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    ['Iqbal 678', 'Iqbal 679', 'Breeden 273', 'Breeden 272', 'Ford Motor 762', 'Henry Schein 529'],
  );
});

test('an id. after a citation nothing resolves is unresolved too (AN-14)', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Rule one. Hatfield v. Levy Bros., 18 Cal. 2d 798, 806 (1941).'],
      ['p', 'Rule two. Aguilar, supra, at 856. Rule three. Id. at 850.'],
    ]),
    null,
  );
  assert.deepEqual(chips(3, reading), ['Id. · unresolved']);
  assert.deepEqual(
    reading.unresolved.map(item => item.text),
    [
      'Aguilar, supra, at 856 in Analysis: no full citation in this document has that name.',
      'Id. at 850 in Analysis: the citation before it, Aguilar, supra, at 856, names no case cited in this document.',
    ],
  );
});

test('the record supports facts but is no authority, and an id. after it is the record (AN-15)', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Deceptive acts are unlawful. N.Y. Gen. Bus. Law § 349.'],
      [
        'p',
        'Corvina ships seafood. Compl. ¶ 12. It sued in May. Id. ¶¶ 30–31. Hollis recommended the transfer. Ex. D at 2.',
      ],
    ]),
    tags(
      'rule/law rule/law facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact',
    ),
  );
  assert.deepEqual(
    reading.sentences.map(item => [item.support, ...chips(item.n, reading)]),
    [
      ['direct', 'N.Y. Gen. Bus. Law § 349'],
      ['record', 'Compl. ¶ 12'],
      // The id. names the complaint, not ¶ 12, which is the earlier citation's pin.
      ['record', 'Id. → Compl.'],
      ['record', 'Ex. D at 2'],
    ],
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.key)),
    ['N.Y.Gen.Bus.Law§349', null, null, null],
  );
  assert.deepEqual(rows(reading), ['statutes | N.Y. Gen. Bus. Law § 349 | statute']);
  assert.equal(reading.authorities[0].count, 1);
  assert.deepEqual(reading.unresolved, []);
  assert.equal(reading.attentionCount, 0);
  // A quotation of the complaint, cited to it, has its source.
  const quoted = analyzeLegal(
    doc([
      [
        'p',
        'The representative promised a “fully temperature-controlled fleet with continuous monitoring,” Compl. ¶ 9, and nothing more.',
      ],
    ]),
    tags('facts/client-fact'),
  );
  assert.deepEqual(flagIds(quoted.sentences[0]), ['quote']);
  assert.equal(quoted.sentences[0].support, 'record');
});

test('“Id. § X” after a code is another section of that code (AN-16)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'FEHA bars failing to accommodate. Cal. Gov’t Code § 12940(m). It defines disability broadly. Id. § 12926(m).',
      ],
    ]),
    null,
  );
  assert.deepEqual(chips(2, reading), ['Id. → Cal. Gov’t Code § 12926']);
  assert.deepEqual(rows(reading), [
    'statutes | Cal. Gov’t Code § 12926(m) | statute',
    'statutes | Cal. Gov’t Code § 12940(m) | statute',
  ]);
});

test('an id. takes the pin of the citation it repeats, and “Id. § X” is its own pin (AN-18)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Labels will not do. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001). The court will not credit “threadbare recitals of the elements.” Id.',
      ],
      ['p', 'Disability includes “the operation of a major bodily function.” Id. § 12102(2)(B).'],
    ]),
    tags('rule/law explanation/precedent rule/law'),
  );
  assert.deepEqual(reading.sentences.map(flagIds), [[], ['quote'], ['quote']]);
});

test('a quotation needs a source when it states law or a fact the analysis rests on (AN-19)', () => {
  const dialogue = doc([
    [
      'p',
      '“People think it’s romantic,” she says. “It is not romantic at all,” he says. “The rule is strict in every case.” Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001). The court said “no exceptions apply to this rule” in that case.',
    ],
  ]);
  const labeled = analyzeLegal(
    dialogue,
    tags('facts/client-fact facts/client-fact rule/law rule/law'),
  );
  assert.deepEqual(labeled.sentences.map(flagIds), [
    ['quote'],
    ['quote'],
    ['quote'],
    ['quote', 'quote-unsourced'],
  ]);
  // Without labels the flag is noted but not counted.
  const bare = analyzeLegal(
    doc([['p', 'The handbook has “no exceptions to the rule at all” in it.']]),
    null,
  );
  assert.deepEqual(flagIds(bare.sentences[0]), ['quote', 'quote-unsourced']);
  assert.equal(bare.sentences[0].attention, false);
  // A contract section cited for its words is their source.
  const contract = analyzeLegal(
    doc([
      ['p', 'Agreement § 4.2(b) lets Kestrel terminate “for convenience upon sixty days’ notice.”'],
    ]),
    tags('rule/law'),
  );
  assert.deepEqual(flagIds(contract.sentences[0]), ['quote']);
});

test('dialogue that carries on from a named speaker is attributed too', () => {
  // A magazine profile read without labels: the second line of each exchange has no
  // "she says" of its own, but it is the same speaker, as is the second sentence of one
  // quotation. A plan that "calls for" something still needs its source.
  const story = analyzeLegal(
    doc([
      [
        'p',
        '“I’ve had the No. 5 bun for six years,” Pruitt told me. “Don’t put that in the magazine.”',
      ],
      ['p', '“Is it ready yet?” a customer calls through the door at the bakery.'],
      [
        'p',
        'When I ask whether all of this is overkill, she shrugs. “Is it? Ask me again when the loaf fails.”',
      ],
      ['p', 'Achterberg says the update cut errors. “The first version was a disaster at launch.”'],
      ['p', 'The plan called for “rebalancing experienced leads across facilities” that spring.'],
      ['p', 'He was moved in April. “The rule is strict in every single case.”'],
    ]),
    null,
  );
  assert.deepEqual(
    story.sentences.map(item => flagIds(item).includes('quote-unsourced')),
    [false, false, false, false, false, false, false, false, true, false, true],
  );
});

test('an issue, a roadmap and a heading need no authority (AN-20)', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Question Presented'],
      ['p', 'Under Title VII, can Alvarez establish retaliation after complaining?'],
      ['h2', 'Discussion'],
      [
        'p',
        'The question is whether the transfer was adverse. This memo first takes protected activity.',
      ],
    ]),
    tags('heading/framing issue/law heading/framing issue/law roadmap/law'),
  );
  assert.deepEqual(supports(reading), ['n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
  assert.equal(reading.attentionCount, 0);
});

test('a case named near its full citation is not secondhand or uncited (AN-21)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A lateral transfer is not adverse in this Circuit. Galabya v. N.Y.C. Bd. of Educ., 202 F.3d 636, 640 (2d Cir. 2000).',
      ],
      [
        'p',
        'But Galabya applied the stricter standard for discrimination claims, which Burlington Northern rejected for retaliation. Burlington N. & Santa Fe Ry. Co. v. White, 548 U.S. 53, 64 (2006).',
      ],
      [
        'p',
        'Poe held so first. Doe v. Roe, 2 F.3d 3, 4 (2d Cir. 2002) (quoting Poe v. Moe, 9 F.3d 1, 2 (2d Cir. 1990)).',
      ],
    ]),
    tags('explanation/precedent counter/precedent explanation/precedent'),
  );
  // Galabya is cited in full in the paragraph before; Poe only inside Doe's parenthetical.
  assert.deepEqual(supports(reading), ['direct', 'direct', 'secondhand']);
  assert.deepEqual(reading.sentences.map(flagIds), [[], [], []]);
});

test('a block quotation rests on the citation in the paragraph after it (AN-22)', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Legal Standard'],
      ['p', 'The Court explained the standard this way:'],
      [
        'blockquote',
        'A claim has facial plausibility when the pleaded facts allow a reasonable inference of liability.',
      ],
      ['p', 'Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001).'],
    ]),
    tags('heading/framing rule/law rule/law rule/law'),
  );
  assert.deepEqual(supports(reading), ['n/a', 'below', 'direct', 'direct']);
  assert.deepEqual(flagIds(reading.sentences[2]), ['quote']);
  assert.equal(reading.attentionCount, 0);
});

test('the caption’s citations are no authority and need no attention (AN-23, AN-29)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'UNITED STATES DISTRICT COURT\nCORVINA FOODS, LLC, Plaintiff,\nv.\nHALVORSEN LOGISTICS, INC., Defendant.\nNo. 1:26-cv-03317 (LGS)',
      ],
      ['h2', 'Argument'],
      ['p', 'The claim fails. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001).'],
    ]),
    null,
  );
  const caption = reading.sentences.filter(item => item.section === 0);
  assert.ok(caption.every(item => item.support === 'n/a' && !item.attention));
  assert.deepEqual(caption.map(flagIds).flat(), []);
  assert.deepEqual(
    caption.flatMap(item => item.cites.map(cite => [cite.text, cite.key])),
    [['No. 1:26-cv-03317 (LGS)', null]],
  );
  assert.deepEqual(rows(reading), ['cases | Smith v. Jones, 1 F.3d 2 (2d Cir. 2001) | circuit']);
  assert.equal(reading.attentionCount, 0);
});

test('signals in any case, carried through string citations (AN-25)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Prior remote work is relevant evidence, see Fed. R. Evid. 401, and courts consider it. Some courts disagree, but see Poe v. Moe, 101 F.3d 1, 5 (2d Cir. 1996). The rule is old. (See Reid v. Google, Inc. (2010) 50 Cal.4th 512, 535 [110 Cal.Rptr.3d 129].) Arbitrability goes to the arbitrator. See Henry Schein, Inc. v. Archer & White Sales, Inc., 139 S. Ct. 524, 529 (2019); Rent-A-Center, W., Inc. v. Jackson, 561 U.S. 63, 68 (2010). It is settled. Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 2001); see also Brown v. Green, 300 F.3d 1, 5 (9th Cir. 2002).',
      ],
    ]),
    tags('rule/law rule/law rule/law rule/law rule/law'),
  );
  assert.deepEqual(supports(reading), [
    'inferential',
    'contrary',
    'inferential',
    'inferential',
    'direct',
  ]);
  assert.deepEqual(reading.sentences.map(flagIds), [[], [], [], [], ['needs-parenthetical']]);
});

test('state and foreign courts have their levels (AN-26)', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'One. Ortega v. Kmart Corp. (2001) 26 Cal.4th 1200, 1206. Two. Reid v. Smith (2019) 31 Cal.App.5th 100, 104. Three. Doe v. Roe, 85 N.Y.2d 20, 25 (1995). Four. Poe v. Moe, 22 N.E.3d 1, 4 (Ill. 2014). Five. Fox v. Hen, 5 P.3d 1, 2 (Cal. Ct. App. 2002). Six. Ash v. Oak, 9 A.D.3d 1, 3 (2004). Seven. Donoghue v Stevenson [1932] AC 562 (HL). Eight. Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47]. Nine. R v Smith [2004] EWCA Crim 631 at [12]. Ten. R. v. Jordan, 2016 SCC 27, [2016] 1 S.C.R. 631, at para. 5. Eleven. R v Cole, 2012 ONCA 5 at para 9.',
      ],
    ]),
    null,
  );
  const level = name => reading.authorities.find(row => row.title.startsWith(name)).level;
  assert.deepEqual(
    [
      'Ortega',
      'Reid',
      'Doe',
      'Poe',
      'Fox',
      'Ash',
      'Donoghue',
      'Starbucks',
      'R v Smith',
      'R. v. Jordan',
      'R v Cole',
    ].map(level),
    [
      'state-supreme',
      'state-appellate',
      'state-supreme',
      'state-supreme',
      'state-appellate',
      'state-appellate',
      'supreme',
      'supreme',
      'appellate',
      'supreme',
      'appellate',
    ],
  );
  // Titles follow the document's form: California's year first, English and Canadian
  // neutral citations with no court after them.
  const title = name => reading.authorities.find(row => row.title.startsWith(name)).title;
  assert.equal(title('Ortega'), 'Ortega v. Kmart Corp. (2001) 26 Cal.4th 1200');
  assert.equal(title('Donoghue'), 'Donoghue v Stevenson [1932] AC 562 (HL)');
  assert.equal(title('R. v. Jordan'), 'R. v. Jordan, 2016 SCC 27, [2016] 1 S.C.R. 631');
});

test('a short form with no full citation is listed as unresolved (AN-28)', () => {
  const reading = analyzeLegal(doc([['p', 'Labels will not do. Twombly, 550 U.S. at 555.']]), null);
  assert.deepEqual(
    reading.unresolved.map(item => item.text),
    [
      'Twombly, 550 U.S. at 555 in Analysis: no full citation in this document has this volume and reporter.',
    ],
  );
});

test('a note after a statute is not a subsection out of form (AN-30)', () => {
  const form = text => flagIds(analyzeLegal(doc([['p', text]]), null).sentences[0]);
  assert.deepEqual(form('Corvina sues under N.Y. Gen. Bus. Law § 349 (Count III).'), []);
  assert.deepEqual(form('It applies. 42 U.S.C. § 3602 (b).'), ['form statute']);
});

test('parallel citations are one case, found by a short form in any of its reporters', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A claim must be plausible. Bell Atl. Corp. v. Twombly, 550 U.S. 544, 570, 127 S. Ct. 1955, 167 L. Ed. 2d 929 (2007).',
      ],
      [
        'p',
        'Labels will not do. Twombly, 550 U.S. at 555. Nor will conclusions. Twombly, 127 S. Ct. at 1965.',
      ],
      [
        'p',
        'A store must inspect. (Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826, 860 [107 Cal.Rptr.2d 841, 24 P.3d 493] (Aguilar).) The court may not weigh evidence. (Aguilar, supra, 25 Cal.4th at p. 856.)',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label + SUFFIX[cite.state])),
    ['Twombly 570', 'Twombly 555', 'Twombly 1965', 'Aguilar 860', 'Aguilar 856'],
  );
  assert.deepEqual(rows(reading), [
    'cases | Aguilar v. Atlantic Richfield Co. (2001) 25 Cal.4th 826 [107 Cal.Rptr.2d 841, 24 P.3d 493] | state-supreme',
    'cases | Bell Atl. Corp. v. Twombly, 550 U.S. 544, 127 S. Ct. 1955, 167 L. Ed. 2d 929 (2007) | supreme',
  ]);
  assert.deepEqual(
    reading.authorities.map(row => row.key),
    ['25 Cal.4th 826', '550 U.S. 544'],
  );
  assert.deepEqual(reading.unresolved, []);
});

test('unreported cases are named authorities with their dates', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Vague claims fail. See Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702 (JPO), 2019 WL 1234567, at *3 (S.D.N.Y. Mar. 5, 2019) (dismissing fraud claim).',
      ],
      [
        'p',
        'A title alone is not enough. Meridian Produce, 2019 WL 1234567, at *4. Some courts disagree, but see Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6 (S.D.N.Y. Sept. 27, 2021).',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    ['Meridian Produce *3', 'Meridian Produce *4', 'Kessler *6'],
  );
  assert.deepEqual(supports(reading), ['inferential', 'direct', 'contrary']);
  assert.deepEqual(rows(reading), [
    'cases | Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382 (S.D.N.Y. Sept. 27, 2021) | district',
    'cases | Meridian Produce Co. v. Talbot Freight Sys., Inc., No. 18-cv-7702, 2019 WL 1234567 (S.D.N.Y. Mar. 5, 2019) | district',
  ]);
  assert.ok(reading.authorities.every(row => !row.warnings.length));
});

test('chips show the pin a citation gives, in any citation form', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A store must inspect. (Ortega v. Kmart Corp. (2001) 26 Cal.4th 1200, 1205 [114 Cal.Rptr.2d 470] (Ortega).) Notice is required. (Ortega, supra, 26 Cal.4th at p. 1206.) Timing is for the jury. (Ortega, supra.)',
      ],
      [
        'p',
        'Corvina ships seafood. Compl. ¶ 12. It sued in May. Id. ¶¶ 30–31. He testified. Alvarez Dep. 8:2-11. He said so again. Id. at 14:3-9. The log is clear. (2 CT 371 [Ostrander depo. at 44:3-19].) It was skipped. (Id. at 372.) It was filed. ECF No. 12, at 3. It was served. Id. at 4.',
      ],
      [
        'p',
        'Summary judgment needs no triable issue. (Code Civ. Proc., § 437c, subd. (c).) FEHA bars both. Cal. Gov’t Code § 12940(m), (n). The Act reaches it. 42 U.S.C. § 1983 (a).',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    [
      'Ortega 1205',
      // A supra with a pin reads as the Bluebook short form does; one without stays a supra.
      'Ortega 1206',
      'Ortega, supra',
      // An id. of the record names the record document, not the earlier citation's pin.
      'Compl. ¶ 12',
      'Id. → Compl.',
      'Alvarez Dep. 8:2-11',
      'Id. → Alvarez Dep.',
      '2 CT 371 [Ostrander depo. at 44:3-19]',
      'Id. → 2 CT',
      'ECF No. 12, at 3',
      'Id. → ECF No. 12',
      // A subsection closes up to its section, but "subd. (c)" and "(m), (n)" keep their spaces.
      'Code Civ. Proc., § 437c, subd. (c)',
      'Cal. Gov’t Code § 12940(m), (n)',
      '§ 1983(a)',
    ],
  );
});

test('a neutral citation’s number is not shown as a page', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'The letter relied on R v Smith [2004] EWCA Crim 631. Review is for reasonableness. Canada v Vavilov, 2019 SCC 65. It cited [2019] UKSC 5. Goodwill must be local. Starbucks (HK) Ltd v British Sky Broadcasting Group plc [2015] UKSC 31 at [47]. A case reported in a volume. Smith v. Jones, 9 F.3d 1 (2d Cir. 2001).',
      ],
    ]),
    null,
  );
  // Without a pin a chip gives a reported case's first page, but "631" in "[2004] EWCA
  // Crim 631" numbers the case.
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    ['Smith', 'Vavilov', '[2019] UKSC 5', 'Starbucks [47]', 'Smith 1'],
  );
});

test('articles, books, guidance and legislative history are other authorities', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Commentators agree. Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1, 15 (1987); 1 Barbara T. Lindemann et al., Employment Discrimination Law § 13.03 (5th ed. 2012). Congress meant it. H.R. Rep. No. 110-730, pt. 1, at 5 (2008). Later work agrees. Roe, supra note 4, at 22.',
      ],
    ]),
    null,
  );
  assert.deepEqual(rows(reading), [
    'other | Barbara T. Lindemann et al., Employment Discrimination Law (5th ed. 2012) | unknown',
    'other | H.R. Rep. No. 110-730, pt. 1 (2008) | unknown',
    'other | Jane Roe, Rethinking Essential Functions, 100 Harv. L. Rev. 1 (1987) | unknown',
  ]);
  const roe = reading.authorities.find(row => row.name === 'Roe');
  assert.equal(roe.title.slice(...roe.italic), 'Rethinking Essential Functions');
  assert.equal(roe.count, 2);
  assert.deepEqual(chips(3, reading), ['Roe 22']);
});

test('a contract’s sections are never statutes', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Federal law requires courts to enforce arbitration agreements. 9 U.S.C. § 2.'],
      [
        'p',
        'Kestrel may terminate under Agreement § 4.2. Separately, § 4.3 allows termination for cause. The fees are payable as provided in § 2.',
      ],
    ]),
    tags('rule/law rule/law rule/law facts/client-fact'),
  );
  assert.deepEqual(rows(reading), ['statutes | 9 U.S.C. § 2 | statute']);
  assert.equal(reading.authorities[0].count, 1);
  assert.deepEqual(supports(reading), ['direct', 'record', 'record', 'record']);
  assert.ok(reading.sentences.every(item => !item.attention));
  assert.equal(reading.sentences[2].lead, reading.sentences[2].text);
  // With no contract cited by name, a section numbered as a contract's is still no statute,
  // while a code's section is.
  const bare = analyzeLegal(
    doc([
      ['p', 'Separately, § 4.3 allows termination for cause. Section 1983 claims differ. § 1983.'],
    ]),
    null,
  );
  assert.deepEqual(rows(bare), ['statutes | § 1983 | statute']);
  assert.deepEqual(chips(1, bare), ['§ 4.3']);
  assert.equal(bare.sentences[0].cites[0].key, null);
});

test('reproduced document text is its own source and no analysis (LC-1)', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'RE: Kestrel Analytics; termination'],
      ['h2', 'Discussion'],
      [
        'p',
        'Whether Kestrel may terminate. Kestrel may terminate for convenience on notice. Kestrel gave notice in May. So it may terminate.',
      ],
      ['h2', 'Excerpt'],
      [
        'p',
        'Kestrel may terminate this Agreement upon sixty (60) days’ notice. Fees are due monthly.',
      ],
    ]),
    tags(
      'other/framing heading/framing issue/framing rule/document-text application/application conclusion/conclusion heading/framing rule/document-text facts/document-text',
    ),
  );
  assert.deepEqual(supports(reading).slice(3), ['n/a', 'n/a', 'n/a', 'n/a', 'n/a', 'n/a']);
  // The clause the analysis relies on is its rule, but names the client as a contract does.
  assert.equal(rail(reading.sections[1]).R, 'ok');
  assert.ok(!reading.checks.some(check => check.id === 'law-mentions-client'));
  // The excerpt is not analysis, and its text is no client fact.
  assert.deepEqual(shape(reading), ['caption Caption', 'sub-issue Analysis', 'other Part 1']);
  assert.ok(!reading.checks.some(check => check.id === 'facts-section'));
});

test('session laws, the Statutes at Large and the Federal Register are titled without pins', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Congress amended the Act. Pub. L. No. 110-325, § 2(b)(5), 122 Stat. 3553, 3554 (2008). It meant it. See Pub. L. No. 110-325, § 2(b)(4), 122 Stat. at 3554. The agency agreed. 76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011). Congress also acted later. 123 Stat. 1200, 1205 (2009).',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.name, row.title]),
    [
      ['76 Fed. Reg. 16,978', '76 Fed. Reg. 16,978 (Mar. 25, 2011)'],
      ['123 Stat. 1200', '123 Stat. 1200 (2009)'],
      ['Pub. L. No. 110-325', 'Pub. L. No. 110-325, 122 Stat. 3553 (2008)'],
    ],
  );
  // A session law's chip names the section cited, not every page of it.
  assert.deepEqual(
    [1, 2].flatMap(n => chips(n, reading)),
    ['Pub. L. No. 110-325, § 2(b)(5)', 'Pub. L. No. 110-325, § 2(b)(4)'],
  );
  // A report's part makes it a report of its own, so its name keeps it.
  const report = analyzeLegal(
    doc([['p', 'Congress meant it. H.R. Rep. No. 110-730, pt. 1, at 5 (2008).']]),
    null,
  );
  assert.equal(report.authorities[0].name, 'H.R. Rep. No. 110-730, pt. 1');
});

test('a cross-reference in a contract’s own clauses is no source, while the analysis rests on the clause it names', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Email'],
      [
        'p',
        'Whether Kestrel may leave. Separately, § 4.3 allows termination for cause. So Kestrel may leave.',
      ],
      ['h2', 'Excerpt'],
      ['h3', '4. Termination'],
      ['p', 'Either party may terminate under this Section 4.3 on notice. See also § 7.4.'],
    ]),
    tags(
      'heading/framing issue/framing facts/client-fact conclusion/conclusion heading/framing heading/framing facts/client-fact',
    ),
  );
  assert.deepEqual(supports(reading), ['n/a', 'n/a', 'record', 'n/a', 'n/a', 'n/a', 'n/a']);
  assert.equal(reading.attentionCount, 0);
});

test('no two sections share a tag when headings number some of them', () => {
  assert.deepEqual(
    sectionsOf(
      doc([
        ['h2', 'Email to Dana'],
        ['p', 'Here is my view.'],
        ['h2', 'Excerpt'],
        ['h3', '2. Definitions'],
        ['p', 'Terms mean what they say.'],
        ['h3', '3. Fees'],
        ['p', 'Fees are due monthly.'],
      ]),
    ).map(section => section.tag),
    ['Part 1', 'Part 4', 'Part 2', 'Part 3'],
  );
});

test('a case cited only by its neutral citation is named by all of it', () => {
  const reading = analyzeLegal(
    doc([['p', 'The letter leaned on [2019] UKSC 5 at [41]. It cited [2019] UKSC 5 again.']]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.name, row.title, row.level]),
    [['[2019] UKSC 5', '[2019] UKSC 5', 'supreme']],
  );
  assert.deepEqual(
    [1, 2].flatMap(n => chips(n, reading)),
    ['[2019] UKSC 5 [41]', '[2019] UKSC 5'],
  );
});

// ---------------------------------------------------------------------------
// The second generality round: forms the parser does not know, and the forms it learned
// ---------------------------------------------------------------------------

test('a citation in a form the parser does not know is shown, listed and never judged', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Statement of Facts'],
      [
        'p',
        'The parties agreed on the price. Joint Stip. ¶ 4. They agreed on delivery too. Id. ¶ 5.',
      ],
      ['h2', 'Discussion'],
      [
        'p',
        'Congress meant to reach these sales. H.R. 1234. Courts read the bill broadly. H.R. 1234. The bill reaches “every sale of goods in commerce.” H.R. 1234. Other bills agree. See also H.R. 5678. Here the sale is covered. Id. The seller is likely liable.',
      ],
    ]),
    tags(
      'heading/framing facts/client-fact facts/client-fact heading/framing rule/law rule/law rule/law rule/law application/application conclusion/conclusion',
    ),
  );
  // A client fact's citation is taken for its record; anything else is cited, unjudged.
  assert.deepEqual(supports(reading), [
    'n/a',
    'record',
    'record',
    'n/a',
    'cited',
    'cited',
    'cited',
    'cited',
    'cited',
    'n/a',
  ]);
  // No pin, parenthetical, new-law or generalization complaint rests on a form the app
  // cannot read, and nothing needs attention for it.
  assert.deepEqual(
    reading.sentences.map(item => flagIds(item).filter(id => id !== 'quote')),
    reading.sentences.map(() => []),
  );
  assert.deepEqual(reading.checks, []);
  assert.equal(reading.attentionCount, 0);
  // An id. after one repeats it, and is not unresolved.
  assert.deepEqual(chips(3, reading), ['Id. → Joint Stip. ¶ 4']);
  assert.deepEqual(chips(9, reading), ['Id. → H.R. 5678']);
  assert.deepEqual(reading.unresolved, []);
  assert.deepEqual(
    reading.authorities.map(row => [
      row.group,
      row.name,
      row.title,
      row.level,
      row.count,
      row.warnings,
    ]),
    [
      ['other', 'H.R. 1234', 'H.R. 1234', 'unknown', 3, ['Form not recognized: check it by hand']],
      ['other', 'H.R. 5678', 'H.R. 5678', 'unknown', 2, ['Form not recognized: check it by hand']],
      [
        'other',
        'Joint Stip. ¶ 4',
        'Joint Stip. ¶ 4',
        'unknown',
        2,
        ['Form not recognized: check it by hand'],
      ],
    ],
  );
  // A rule an umbrella cites in such a form is a cited rule.
  const umbrella = analyzeLegal(
    doc([
      ['h2', 'Discussion'],
      [
        'p',
        'The seller is likely liable. The bill reaches every sale. H.R. 1234. We address coverage, then remedies.',
      ],
      ['h3', 'A. Coverage'],
      ['p', 'The bill covers it. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990). Here it is covered.'],
      ['h3', 'B. Remedies'],
      ['p', 'Damages follow. Smith, 1 F.3d at 6. Here damages follow.'],
    ]),
    tags(
      'heading/framing conclusion/conclusion rule/law roadmap/framing heading/conclusion rule/law application/application heading/conclusion rule/law application/application',
    ),
  );
  assert.deepEqual(rail(umbrella.sections[0]), { P: 'ok', R: 'ok', M: 'ok' });
});

test('an id. right after a citation of more than one source is ambiguous (Bluebook 4.1)', () => {
  const lastOf = text => {
    const reading = analyzeLegal(doc([['p', text]]), null);
    return { reading, item: reading.sentences.at(-1) };
  };
  for (const text of [
    'The duty runs to invitees. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991). The store must inspect. Id. at 4.',
    'The duty runs. See Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); see also Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991) (holding so). The store must inspect. Id. at 4.',
    'The duty runs. (Smith v. Jones (2001) 1 Cal.4th 1, 5; Doe v. Roe (2002) 2 Cal.4th 2, 3.) The store must inspect. (Ibid.)',
    'Courts split. Compare Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990), with Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991). The store must inspect. Id. at 4.',
  ]) {
    const { reading, item } = lastOf(text);
    assert.deepEqual(flagIds(item), ['ambiguous-id'], text);
    assert.equal(item.flags[0].text, 'Id. after more than one source is ambiguous');
    assert.ok(item.cites[0].state === 'unresolved' && item.attention, text);
    assert.match(
      reading.unresolved[0].text,
      /: the citation before it cites more than one source, so it could mean any of them\.$/,
    );
  }
  // An id. after it is no clearer.
  const twice = analyzeLegal(
    doc([
      [
        'p',
        'The duty runs. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991). It must inspect. Id. at 4. It must warn. Id. at 5.',
      ],
    ]),
    null,
  );
  assert.deepEqual(chips(3, twice), ['Id. · unresolved']);
  assert.deepEqual(flagIds(twice.sentences[2]), ['ambiguous-id']);
  // One source cited twice, an id. inside the string, a case it quotes, or two record
  // citations of one document leave the id. clear.
  assert.deepEqual(
    chips(
      2,
      lastOf(
        'The duty runs. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); Smith, 1 F.3d at 7. The store must inspect. Id. at 4.',
      ).reading,
    ),
    ['Id. → Smith'],
  );
  assert.deepEqual(
    chips(
      1,
      lastOf(
        'The duty runs. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990); id. at 7; Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991).',
      ).reading,
    ),
    ['Smith 5', 'id. → Smith', 'Doe 3'],
  );
  assert.deepEqual(
    chips(
      2,
      lastOf(
        'The duty runs. Smith v. Jones, 1 F.3d 1, 5 (2d Cir. 1990) (quoting Doe v. Roe, 2 F.3d 2, 3 (2d Cir. 1991)). The store must inspect. Id. at 4.',
      ).reading,
    ),
    ['Id. → Smith'],
  );
  const record = analyzeLegal(
    doc([
      ['h2', 'Facts'],
      ['p', 'Doe slipped. Compl. ¶ 4; Ex. A at 2. The aisle was wet. Id. at 3.'],
      ['p', 'The floor was mopped. Compl. ¶ 4; Compl. ¶ 6. It was wet. Id. ¶ 7.'],
    ]),
    tags('heading/framing facts/client-fact facts/client-fact facts/client-fact facts/client-fact'),
  );
  assert.deepEqual(flagIds(record.sentences[2]), ['ambiguous-id']);
  assert.deepEqual(chips(5, record), ['Id. → Compl.']);
  assert.equal(record.sentences[4].support, 'record');
});

test('headings for a prayer for relief, the nature of the case, a counterstatement and more', () => {
  const partFor = heading =>
    sectionsOf(
      doc([
        ['h1', 'Brief'],
        ['h2', heading],
        ['p', 'Text.'],
        ['h2', 'Argument'],
        ['p', 'Rule.'],
      ]),
    )[1].part;
  const expected = {
    conclusion: ['PRAYER FOR RELIEF', 'RELIEF REQUESTED', 'Request for Relief', 'Relief Sought'],
    introduction: ['NATURE OF THE CASE', 'Nature of the Action'],
    facts: ['COUNTERSTATEMENT OF FACTS', 'Counter-Statement of the Facts', 'FACTUAL ALLEGATIONS'],
    answer: ['Executive Summary'],
    standard: ['Applicable Law', 'II. The Applicable Law'],
    other: ['Next Steps', 'Assumptions', 'Statement Regarding Oral Argument'],
  };
  for (const [part, headings] of Object.entries(expected)) {
    for (const heading of headings) assert.equal(partFor(heading), part, heading);
  }
  // A memo with an Executive Summary and Factual Allegations has its answer and facts.
  const memo = analyzeLegal(
    doc([
      ['h2', 'Question Presented'],
      ['p', 'Whether Doe can recover.'],
      ['h2', 'Executive Summary'],
      ['p', 'Probably yes.'],
      ['h2', 'Factual Allegations'],
      ['p', 'Doe slipped on ice. Compl. ¶ 4.'],
      ['h2', 'Discussion'],
      [
        'p',
        'A store owes invitees care. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990). Here the store knew of the ice. Doe can likely recover.',
      ],
    ]),
    tags(
      'heading/framing issue/framing heading/framing conclusion/conclusion heading/framing facts/client-fact heading/framing rule/law application/application conclusion/conclusion',
    ),
  );
  assert.deepEqual(shape(memo), [
    'question Question',
    'answer Answer',
    'facts Facts',
    'sub-issue Part 1',
  ]);
  assert.ok(!memo.checks.some(check => check.id === 'facts-section'));
});

test('New York’s “POINT I:” headings take their numerals', () => {
  const points = sectionsOf(
    doc([
      ['h2', 'ARGUMENT'],
      ['h3', 'POINT I: THE CLAIM FAILS'],
      ['p', 'a.'],
      ['h3', 'POINT II — THE DEFENSE APPLIES'],
      ['p', 'b.'],
      ['h3', 'Point III\nTHE FEE CLAIM FAILS'],
      ['p', 'c.'],
      ['h3', 'Pointless Delay'],
      ['p', 'd.'],
    ]),
  );
  assert.deepEqual(
    points.map(section => [section.tag, section.label]),
    [
      ['Umbrella', 'ARGUMENT'],
      ['I', 'THE CLAIM FAILS'],
      ['II', 'THE DEFENSE APPLIES'],
      ['III', 'THE FEE CLAIM FAILS'],
      ['Part 4', 'Pointless Delay'],
    ],
  );
});

test('US public-domain citations: keyed and titled as written, with their courts’ levels', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'One. People v. Doe, 2020 IL 124112, ¶ 20. Two. Doe, 2020 IL 124112, ¶ 22. Three. Smith v. Jones, 2020 IL App (1st) 123456, ¶ 5. Four. State v. Roe, 2021-Ohio-1234, ¶ 15 (8th Dist.). Five. State v. Poe, 2015 WI 50, ¶ 10, 362 Wis. 2d 1, 864 N.W.2d 1. Six. Moe v. Hoe, 2018 ND App 12, ¶ 3. Seven. Fox v. State, 2018 OK CR 12, ¶ 4. Eight. It leaned on 2019-NMSC-012.',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.key, row.name, row.title, row.level]),
    // Sorted by title, so the number of the one cited by its number alone comes first.
    [
      ['2019 NMSC 012', '2019-NMSC-012', '2019-NMSC-012', 'state-supreme'],
      ['2018 OKCR 12', 'Fox', 'Fox v. State, 2018 OK CR 12', 'state-supreme'],
      ['2018 NDApp 12', 'Moe', 'Moe v. Hoe, 2018 ND App 12', 'state-appellate'],
      ['2020 IL 124112', 'Doe', 'People v. Doe, 2020 IL 124112', 'state-supreme'],
      [
        '2020 ILApp(1st) 123456',
        'Smith',
        'Smith v. Jones, 2020 IL App (1st) 123456',
        'state-appellate',
      ],
      [
        '2015 WI 50',
        'Poe',
        'State v. Poe, 2015 WI 50, 362 Wis. 2d 1, 864 N.W.2d 1',
        'state-supreme',
      ],
      ['2021 Ohio 1234', 'Roe', 'State v. Roe, 2021-Ohio-1234 (8th Dist.)', 'state-appellate'],
    ],
  );
  // Its number names the case, so a chip without a pin shows none.
  assert.deepEqual(
    reading.sentences.flatMap(item => item.cites.map(cite => cite.label)),
    [
      'Doe ¶ 20',
      'Doe ¶ 22',
      'Smith ¶ 5',
      'Roe ¶ 15',
      'Poe ¶ 10',
      'Moe ¶ 3',
      'Fox ¶ 4',
      '2019-NMSC-012',
    ],
  );
  // Other courts named like a federal district court or a court of appeals.
  const levels = analyzeLegal(
    doc([
      [
        'p',
        'One. Doe v. Roe, 1 A.3d 1, 5 (D.C. 2010). Two. Poe v. State, 1 S.W.3d 1, 5 (Tex. Crim. App. 2010). Three. Fox v. Hen, 1 F. Supp. 3d 1, 5 (D.D.C. 2010). Four. Ash v. Oak, 2018 Guam 12, ¶ 3.',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    levels.authorities.map(row => [row.name, row.level]),
    [
      ['Ash', 'state-supreme'],
      ['Doe', 'state-supreme'],
      ['Fox', 'district'],
      ['Poe', 'state-supreme'],
    ],
  );
});

test('titles keep subsequent history, an English report its court, and the High Court its division', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'One. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001), aff’d, 535 U.S. 1 (2002). Two. Smith v. Roe, 123 S.W.3d 456, 460 (Tex. App.—Houston [14th Dist.] 2003, pet. denied). Three. Doe v. Roe, 2021 U.S. Dist. LEXIS 12345, at *5 (D. Mass. Jan. 5, 2021), aff’d, 1 F.4th 1 (1st Cir. 2022). Four. Donoghue v Stevenson [1932] AC 562 (HL). Five. Poe v Moe [2019] EWHC 123 (Ch).',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => row.title),
    [
      'Doe v. Roe, 2021 U.S. Dist. LEXIS 12345 (D. Mass. Jan. 5, 2021), aff’d, 1 F.4th 1 (1st Cir. 2022)',
      'Donoghue v Stevenson [1932] AC 562 (HL)',
      'Poe v Moe [2019] EWHC 123 (Ch)',
      'Smith v. Jones, 123 F.3d 456 (2d Cir. 2001), aff’d, 535 U.S. 1 (2002)',
      'Smith v. Roe, 123 S.W.3d 456 (Tex. App.—Houston [14th Dist.] 2003, pet. denied)',
    ],
  );
  // The later decision is part of the citation, not a row of its own; a report's page is a
  // page, but a neutral citation's number is not.
  assert.equal(reading.authorities.length, 5);
  assert.deepEqual(
    [4, 5].flatMap(n => chips(n, reading)),
    ['Donoghue 562', 'Poe'],
  );
});

test('a slip opinion’s page and full date make a complete citation', () => {
  const reading = analyzeLegal(
    doc([['p', 'Courts split. Smith v. Roe, No. 21-1234, slip op. at 5 (2d Cir. Mar. 3, 2022).']]),
    null,
  );
  assert.equal(reading.sentences[0].support, 'direct');
  assert.deepEqual(chips(1, reading), ['Smith slip op. 5']);
  assert.deepEqual(reading.authorities[0].warnings, []);
  assert.equal(reading.authorities[0].level, 'circuit');
});

test('executive orders and California bills are named and titled by their numbers', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'Agencies must act. Exec. Order No. 14,028, 86 Fed. Reg. 26,633 (May 12, 2021). The bill says so. (Assem. Bill No. 5 (2019–2020 Reg. Sess.) § 2.)',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.group, row.name, row.title]),
    [
      [
        'statutes',
        'Exec. Order No. 14,028',
        'Exec. Order No. 14,028, 86 Fed. Reg. 26,633 (May 12, 2021)',
      ],
      ['other', 'Assem. Bill No. 5', 'Assem. Bill No. 5 (2019–2020 Reg. Sess.)'],
    ],
  );
  assert.deepEqual(chips(1, reading), ['Exec. Order No. 14,028']);
});

test('a short section a client fact cites is the client’s document, not a statute elsewhere', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Federal law requires enforcement of arbitration agreements. 9 U.S.C. § 2.'],
      ['p', 'The Fees are payable as provided in § 2.'],
      ['p', 'Delgado sued under § 12940.'],
      ['p', 'Retaliation is barred. Cal. Gov’t Code § 12940(h).'],
    ]),
    tags('rule/law facts/client-fact facts/client-fact rule/law'),
  );
  assert.deepEqual(supports(reading), ['direct', 'record', 'direct', 'direct']);
  assert.deepEqual(
    reading.authorities.map(row => [row.title, row.count]),
    [
      ['9 U.S.C. § 2', 1],
      ['Cal. Gov’t Code § 12940(h)', 2],
    ],
  );
  // In the statute's own paragraph it is the statute's.
  const same = analyzeLegal(
    doc([
      [
        'p',
        'Federal law requires enforcement of arbitration agreements. 9 U.S.C. § 2. The Fees are payable as provided in § 2.',
      ],
    ]),
    tags('rule/law facts/client-fact'),
  );
  assert.equal(same.authorities[0].count, 2);
});

test('record citations in the forms the parser learned support facts, and an id. names them', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Statement of Facts'],
      ['p', "Doe signed in 2020. Pl.'s Mot. Summ. J. 5. Roe never paid. SAC ¶ 9."],
      [
        'p',
        'The jury heard it. Trial Tr. vol. 2, 45:3-9. Then again. Id. at 50:1. The order issued. Doc. 45 at 3. It was entered. Id. at 4. The photo shows it. PX 12 at 3. It is clear. Id. at 4.',
      ],
    ]),
    tags(
      'heading/framing facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact facts/client-fact',
    ),
  );
  assert.equal(reading.sentences.length, 9);
  assert.deepEqual(supports(reading).slice(1), Array(8).fill('record'));
  assert.equal(reading.attentionCount, 0);
  assert.deepEqual(reading.authorities, []);
  assert.deepEqual(
    [5, 7, 9].flatMap(n => chips(n, reading)),
    ['Id. → Trial Tr. vol. 2', 'Id. → Doc. 45', 'Id. → PX 12'],
  );
});

test('a one-word case name the document also writes in lowercase is not a reference to it', () => {
  const reading = analyzeLegal(
    doc([
      ['p', 'Schools may not segregate. Brown v. Bd. of Educ., 347 U.S. 483, 495 (1954).'],
      ['p', 'Brown paint covered the classroom floor, so the school was on notice.'],
      ['p', 'The paint was brown and wet.'],
    ]),
    tags('rule/law application/application facts/client-fact'),
  );
  assert.deepEqual(flagIds(reading.sentences[1]), []);
  assert.equal(reading.authorities[0].count, 1);
});

test('California treatises are titled with their editions', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'The duty is settled. (6 Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234.) The motion may be heard. (Weil & Brown, Cal. Practice Guide: Civil Procedure Before Trial (The Rutter Group 2020) ¶ 9:123.)',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.name, row.title]),
    [
      [
        'Weil & Brown',
        'Weil & Brown, Cal. Practice Guide: Civil Procedure Before Trial (The Rutter Group 2020)',
      ],
      ['Witkin', 'Witkin, Summary of Cal. Law (11th ed. 2017)'],
    ],
  );
  assert.deepEqual(
    [1, 2].flatMap(n => chips(n, reading)),
    ['Witkin § 1234', 'Weil & Brown ¶ 9:123'],
  );
});

// ---------------------------------------------------------------------------
// The long tail, third round (tests/long-tail.test.mjs has the verifier's cases)
// ---------------------------------------------------------------------------

test('an id. of a constitution’s other article is that article, with its own row', () => {
  const read = text => analyzeLegal(doc([['p', text]]), null);
  const federal = read(
    'Congress may regulate commerce. U.S. Const. art. I, § 8, cl. 3. The President executes the laws. Id. art. II, § 3. He also commands the army. Id. art. II.',
  );
  assert.deepEqual(
    [2, 3].flatMap(n => chips(n, federal)),
    ['Id. → U.S. Const. art. II, § 3', 'Id. → U.S. Const. art. II'],
  );
  assert.deepEqual(
    federal.authorities.map(row => [row.title, row.count]),
    [
      ['U.S. Const. art. I, § 8, cl. 3', 1],
      ['U.S. Const. art. II', 1],
      ['U.S. Const. art. II, § 3', 1],
    ],
  );
  // California's comma after "Const." and "Id." stays, and the same article is the same row.
  const state = read(
    'Privacy is protected. (Cal. Const., art. I, § 1.) Speech is too. (Id., art. I, § 2, subd. (a).) So is privacy at home. (Id., art. I, § 1.)',
  );
  assert.deepEqual(
    [2, 3].flatMap(n => chips(n, state)),
    ['Id. → Cal. Const., art. I, § 2', 'Id. → Cal. Const., art. I, § 1'],
  );
  assert.deepEqual(
    state.authorities.map(row => [row.title, row.count]),
    [
      ['Cal. Const., art. I, § 1', 2],
      ['Cal. Const., art. I, § 2(a)', 1],
    ],
  );
});

test('headings typed as paragraphs are read when a document has no heading styles', () => {
  const tags = list => sectionsOf(doc(list)).map(section => `${section.part} ${section.tag}`);
  // A brief pasted from a word processor: its parts and point headings are bold paragraphs.
  const brief = [
    ['p', 'IN THE APPELLATE COURT OF ILLINOIS'],
    ['p', 'NATURE OF THE CASE'],
    ['p', 'Raman appeals a dismissal.'],
    ['p', 'STATEMENT OF FACTS'],
    ['p', 'Raman fell. (R. 12.)'],
    ['p', 'ARGUMENT'],
    ['p', 'I. THE RELEASE DOES NOT REACH THE DEVICE.'],
    ['p', 'A release is read narrowly.'],
    ['p', 'A. The words of the release'],
    ['p', 'The release names falls.'],
    ['p', 'II. Willful and wanton conduct is never released'],
    ['p', 'Public policy forbids it.'],
    ['p', 'CONCLUSION'],
    ['p', 'The judgment should be reversed.'],
  ];
  assert.deepEqual(tags(brief), [
    'caption Caption',
    'introduction Introduction',
    'facts Facts',
    'umbrella Umbrella',
    'umbrella I',
    'sub-issue I.A',
    'sub-issue II',
    'conclusion Conclusion',
  ]);
  const reading = analyzeLegal(doc(brief), null);
  assert.equal(reading.type, 'brief');
  assert.equal(reading.sentences.find(s => s.text === 'ARGUMENT').support, 'n/a');
  // A document with heading styles keeps only those.
  assert.deepEqual(
    tags([
      ['h2', 'Discussion'],
      ['p', 'ARGUMENT'],
      ['p', 'I. THE CLAIM FAILS'],
      ['p', 'Fraud needs particularity.'],
    ]),
    ['sub-issue Part 1'],
  );
  // A numbered list of sentences stays a list, and a caption line stays a line.
  assert.deepEqual(
    tags([
      ['p', 'UNITED STATES DISTRICT COURT'],
      ['p', 'Discussion'],
      ['p', '1. Call the client.'],
      ['p', '2. File the motion by Friday.'],
    ]),
    ['caption Caption', 'sub-issue Part 1'],
  );
  // Before the discussion, a numbered line is no point heading.
  assert.deepEqual(
    tags([
      ['p', 'Facts'],
      ['p', '1. The lease'],
      ['p', 'Doe signed it.'],
    ]),
    ['facts Facts'],
  );
  // Ordinary paragraphs, with no part's name among them, are left alone.
  assert.deepEqual(
    tags([
      ['p', 'Dear Ms. Alvarez,'],
      ['p', 'I. Thanks for the call'],
      ['p', 'We will file on Friday.'],
    ]),
    ['sub-issue Analysis'],
  );
});

test('English and Canadian short forms resolve to the case their name names', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'A rule. Jones v Smith [2020] EWCA Civ 1234 at [45]. Another rule. Jones at [47]. A third. R v Doe, 2015 ONCA 123 at para 4. A fourth. Doe at paras 6–7.',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    [1, 2, 3, 4].flatMap(n => chips(n, reading)),
    ['Jones [45]', 'Jones [47]', 'Doe para 4', 'Doe paras 6–7'],
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.title, row.count]),
    [
      ['Jones v Smith [2020] EWCA Civ 1234', 2],
      ['R v Doe, 2015 ONCA 123', 2],
    ],
  );
  assert.deepEqual(reading.unresolved, []);
});

test('a statute’s or book’s explanatory parenthetical is its own, not its name', () => {
  const reading = analyzeLegal(
    doc([
      [
        'p',
        'The court has jurisdiction. 28 U.S.C. § 1291 (granting jurisdiction over final decisions). Some agree. See also Restatement (Second) of Torts § 343 (Am. L. Inst. 1965) (duty to invitees). The rule is old. 28 U.S.C. § 1291.',
      ],
    ]),
    null,
  );
  assert.deepEqual(
    [1, 2, 3].flatMap(n => chips(n, reading)),
    ['§ 1291', 'Restatement (Second) of Torts § 343', '§ 1291'],
  );
  assert.deepEqual(
    reading.authorities.map(row => [row.title, row.count]),
    [
      ['28 U.S.C. § 1291', 2],
      ['Restatement (Second) of Torts (Am. L. Inst. 1965)', 1],
    ],
  );
  // "See also" with a parenthetical says how the source supports the claim.
  assert.deepEqual(flagIds(reading.sentences[1]), []);
});

test('a client’s one-word name is not a word the document uses in lowercase', () => {
  const blocks = doc([
    [
      'p',
      'PRIYA RAMAN, Plaintiff-Appellant,\nv.\nSUMMIT ASCENT CLIMBING, LLC, Defendant-Appellee.',
    ],
    ['h2', 'Facts'],
    [
      'p',
      'Raman fell while climbing at Summit Ascent. Climbing gyms must inspect their gear. Other gyms, like Ridgecrest Climbing Ctr., do.',
    ],
  ]);
  assert.deepEqual(clientNames(blocks), [
    'Priya Raman',
    'Summit Ascent Climbing',
    'Raman',
    'Summit Ascent',
  ]);
});

test('a quotation in a question presented is noted, not counted', () => {
  const reading = analyzeLegal(
    doc([
      ['h2', 'Issues Presented'],
      ['p', 'Whether a release of “the inherent risks of climbing” bars the claim.'],
      ['h2', 'Argument'],
      ['p', 'The release says “the inherent risks of climbing.”'],
    ]),
    [
      ['heading', 'framing'],
      ['issue', 'law'],
      ['heading', 'framing'],
      ['rule', 'law'],
    ],
  );
  assert.deepEqual(flagIds(reading.sentences[1]), ['quote', 'quote-unsourced']);
  assert.equal(reading.sentences[1].attention, false);
  // The same quotation stated as law still needs its source.
  assert.equal(reading.sentences[3].attention, true);
});

test('a case goes by the party name the document itself uses (AN-13)', () => {
  const read = text => analyzeLegal(doc([['p', text]]), null);
  const iqbal = read(
    'A complaint must state a plausible claim. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009). Iqbal requires more than labels.',
  );
  assert.deepEqual(chips(1, iqbal), ['Iqbal 678']);
  assert.equal(iqbal.authorities[0].name, 'Iqbal');
  // On its own, a case goes by its first party (Bluebook rule 10.9), and a document that
  // uses the first party's name, or both, keeps it.
  assert.deepEqual(
    chips(1, read('A complaint must state a claim. Ashcroft v. Iqbal, 556 U.S. 662, 678 (2009).')),
    ['Ashcroft 678'],
  );
  assert.equal(
    read(
      'The rule is settled. Smith v. Jones, 1 F.3d 1, 2 (2d Cir. 1990). Smith held so, and Jones lost.',
    ).authorities[0].name,
    'Smith',
  );
  // A government or institution is never what a case is called.
  assert.equal(
    read('Segregation is unequal. Brown v. Bd. of Educ., 347 U.S. 483, 495 (1954). The Board lost.')
      .authorities[0].name,
    'Brown',
  );
});

test('a conclusion that a claim fails may be as sure as its surest failing part (AN-12)', () => {
  const HF = ['heading', 'framing'];
  const memo = (a, b, conclusion) =>
    analyzeLegal(
      doc([
        ['h2', 'Discussion'],
        ['p', 'Two parts.'],
        ['h3', 'A. Goodwill'],
        ['p', `Rule. Smith v. Jones, 123 F.3d 456, 460 (2d Cir. 2001). Here none. ${a}`],
        ['h3', 'B. Confusion'],
        ['p', `Rule. Smith v. Jones, 123 F.3d 456, 461 (2d Cir. 2001). Here none. ${b}`],
        ['h2', 'Conclusion'],
        ['p', conclusion],
      ]),
      [
        HF,
        ['roadmap', 'framing'],
        HF,
        ['rule', 'law'],
        ['application', 'application'],
        ['conclusion', 'conclusion'],
        HF,
        ['rule', 'law'],
        ['application', 'application'],
        ['conclusion', 'conclusion'],
        HF,
        ['conclusion', 'conclusion'],
      ],
    ).checks.filter(check => check.id === 'confidence').length;
  // Borden loses if either part fails, and B says it very likely will.
  assert.equal(
    memo(
      'Borden is unlikely to show goodwill.',
      'Borden will very likely fail.',
      'Borden will very likely lose.',
    ),
    0,
  );
  // No part fails as surely as the conclusion says the claim does.
  assert.equal(
    memo(
      'Borden is unlikely to show goodwill.',
      'Borden will probably fail.',
      'Borden will very likely lose.',
    ),
    1,
  );
  // A claim that succeeds needs every part, so it is no surer than the weakest.
  assert.equal(
    memo(
      'Borden will probably show goodwill.',
      'Borden will very likely show confusion.',
      'Borden will very likely win.',
    ),
    1,
  );
});

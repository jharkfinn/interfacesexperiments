import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROLES,
  KINDS,
  STRUCTURE_CHECKS,
  ALLOWED,
  DEFAULT_KIND,
  DEFAULT_ROLE,
  ROLE_NAMES,
  KIND_NAMES,
  LEGAL_INSTRUCTIONS,
  legalEvent,
  parseLegal,
  remapLegal,
} from '../dist/legal-core.js';
import { memoBlocks, MEMO_TAGS } from './fixtures/memo.mjs';

const REPLY = readFileSync(new URL('./fixtures/memo-legal-reply.json', import.meta.url), 'utf8');

// The memo as the app sends it: [{kind, sentences: [text]}].
const MEMO = memoBlocks().map(({ kind, sentences }) => ({
  kind,
  sentences: sentences.map(sentence => sentence.text),
}));
const TOTAL = MEMO.reduce((sum, paragraph) => sum + paragraph.sentences.length, 0);
const reply = tags => JSON.stringify({ tags });
const memoReply = keep =>
  reply(MEMO_TAGS.map(([role, kind], index) => [index + 1, role, kind]).filter(keep));
const pairs = tags => tags.map(({ role, kind }) => [role, kind]);
const inputOf = event => JSON.parse(event.response.input[0].content[0].text);

test('the lists agree with each other', () => {
  assert.equal(STRUCTURE_CHECKS.length, 12);
  assert.ok(STRUCTURE_CHECKS.includes('opens-with-issue'));
  assert.ok(!STRUCTURE_CHECKS.includes('opens-with-conclusion'));
  assert.deepEqual(Object.keys(ALLOWED).sort(), [...ROLES].sort());
  assert.deepEqual(Object.keys(DEFAULT_KIND).sort(), [...ROLES].sort());
  assert.deepEqual(Object.keys(DEFAULT_ROLE).sort(), [...KINDS].sort());
  assert.deepEqual(Object.keys(ROLE_NAMES), ROLES);
  assert.deepEqual(Object.keys(KIND_NAMES), KINDS);
  for (const role of ROLES) {
    assert.ok(ALLOWED[role].every(kind => KINDS.includes(kind)));
    assert.ok(ALLOWED[role].includes(DEFAULT_KIND[role]), role);
  }
  for (const kind of KINDS) assert.ok(ALLOWED[DEFAULT_ROLE[kind]].includes(kind), kind);
  assert.equal(KIND_NAMES['client-fact'], 'Client fact');
});

test('a legal request numbers the 46 memo sentences and asks for labels only', () => {
  const event = legalEvent('id', { paragraphs: MEMO });
  assert.equal(event.response.metadata.operation, 'legal');
  assert.equal(event.response.max_output_tokens, 4096);
  assert.equal(event.response.instructions, LEGAL_INSTRUCTIONS);
  assert.ok(LEGAL_INSTRUCTIONS.includes('Never write a case name, citation, quotation'));
  const sentences = inputOf(event).paragraphs.flatMap(paragraph => paragraph.sentences);
  assert.equal(sentences.length, 46);
  assert.deepEqual(
    sentences.map(sentence => sentence.n),
    Array.from({ length: 46 }, (_, index) => index + 1),
  );
  assert.ok(sentences.every(sentence => !('prior' in sentence)));
});

test('prior labels go only on the sentences given a pair', () => {
  const prior = new Array(TOTAL).fill(null);
  prior[0] = ['heading', 'framing'];
  prior[16] = ['conclusion', 'conclusion'];
  const sentences = inputOf(legalEvent('id', { paragraphs: MEMO, prior })).paragraphs.flatMap(
    paragraph => paragraph.sentences,
  );
  assert.deepEqual(sentences[0].prior, ['heading', 'framing']);
  assert.deepEqual(sentences[16].prior, ['conclusion', 'conclusion']);
  assert.deepEqual(
    sentences.filter(sentence => sentence.prior).map(sentence => sentence.n),
    [1, 17],
  );
});

test('a legal request refuses prior labels that do not fit the sentences', () => {
  const message = /^Error: Expected one prior entry per sentence\.$/;
  const fill = pair => new Array(TOTAL).fill(pair);
  assert.throws(() => legalEvent('id', { paragraphs: MEMO, prior: fill(null).slice(1) }), message);
  assert.throws(() => legalEvent('id', { paragraphs: MEMO, prior: [] }), message);
  assert.throws(() => legalEvent('id', { paragraphs: MEMO, prior: 'x' }), message);
  assert.throws(
    () => legalEvent('id', { paragraphs: MEMO, prior: fill(['rules', 'law']) }),
    message,
  );
  assert.throws(
    () => legalEvent('id', { paragraphs: MEMO, prior: fill(['rule', 'law', 'extra']) }),
    message,
  );
  assert.doesNotThrow(() => legalEvent('id', { paragraphs: MEMO, prior: fill(['rule', 'law']) }));
});

test('the fixture reply gives every memo sentence its tag', () => {
  assert.ok(REPLY.length < 2000, `${REPLY.length} characters`);
  const parsed = parseLegal(REPLY, MEMO);
  assert.equal(parsed.tags.length, 46);
  assert.equal(parsed.partial, undefined);
  assert.deepEqual(pairs(parsed.tags), MEMO_TAGS);
  assert.ok(parsed.tags.every(tag => !tag.guess && !tag.also));
  assert.deepEqual(
    parsed.tags.map(tag => tag.text),
    MEMO.flatMap(paragraph => paragraph.sentences),
  );
});

test('a reply in a code fence parses', () => {
  const parsed = parseLegal('```json\n' + REPLY + '\n```', MEMO);
  assert.deepEqual(pairs(parsed.tags), MEMO_TAGS);
});

test('synonyms, missing halves and the second role are read', () => {
  const parsed = parseLegal(
    memoReply(([n]) => n < 7 || n > 10).replace(
      '"tags":[',
      '"tags":[[7,"Rule Explanation","holding"],[8,"rule"],[9,null,"fact"],[10,"Counter_Argument","Client Fact","analogy"],',
    ),
    MEMO,
  );
  const [s7, s8, s9, s10] = parsed.tags.slice(6, 10);
  assert.deepEqual([s7.role, s7.kind], ['explanation', 'precedent']);
  assert.deepEqual([s8.role, s8.kind], ['rule', 'law']);
  assert.deepEqual([s9.role, s9.kind], ['facts', 'client-fact']);
  assert.deepEqual([s10.role, s10.kind, s10.also], ['counter', 'client-fact', 'application']);
  assert.equal(parsed.partial, undefined);
});

test('a second role equal to the first, or not a role, is dropped', () => {
  const parsed = parseLegal(
    reply([
      [1, 'heading', 'framing', 'heading'],
      [2, 'other', 'framing', 'law'],
      [3, 'rule', 'nonsense'],
      [4, 'nonsense', 'nonsense'],
    ]),
    [{ kind: 'p', sentences: ['One.', 'Two.', 'Three.', 'Four.'] }],
  );
  assert.deepEqual(parsed.tags, [
    { text: 'One.', role: 'heading', kind: 'framing' },
    { text: 'Two.', role: 'other', kind: 'framing' },
    { text: 'Three.', role: 'rule', kind: 'law' },
    { text: 'Four.', role: 'rule', kind: 'law', guess: true },
  ]);
});

test('numbers out of range are dropped and the first entry for a number wins', () => {
  const parsed = parseLegal(
    memoReply(() => true).replace(
      '"tags":[',
      '"tags":[[99,"rule","law"],[0,"rule","law"],["2.4","facts","client-fact"],',
    ),
    MEMO,
  );
  assert.equal(parsed.tags.length, 46);
  assert.deepEqual(pairs([parsed.tags[1]]), [['facts', 'client-fact']]);
  assert.deepEqual(pairs(parsed.tags.slice(2)), MEMO_TAGS.slice(2));
});

test('object entries are accepted', () => {
  const tags = MEMO_TAGS.map(([role, kind], index) => ({ n: index + 1, role, kind }));
  tags[19].also = 'explanation';
  const parsed = parseLegal(JSON.stringify({ tags }), MEMO);
  assert.deepEqual(pairs(parsed.tags), MEMO_TAGS);
  assert.equal(parsed.tags[19].also, 'explanation');
});

test('a sentence Claude skipped takes its neighbour’s labels as a guess', () => {
  const parsed = parseLegal(
    memoReply(([n]) => n !== 12),
    MEMO,
  );
  // S11 and S12 share a paragraph (block 7, S11 to S13).
  assert.deepEqual(parsed.tags[11], {
    ...parsed.tags[10],
    text: parsed.tags[11].text,
    guess: true,
  });
  assert.equal(parsed.tags[11].role, 'rule');
  // The first sentence of a paragraph takes the next labelled one in it.
  const first = parseLegal(
    memoReply(([n]) => n !== 41),
    MEMO,
  );
  assert.deepEqual(pairs([first.tags[40]]), [['conclusion', 'conclusion']]);
  assert.equal(first.tags[40].guess, true);
  // A paragraph with no labels at all is other/framing.
  const alone = parseLegal(
    memoReply(([n]) => n !== 40),
    MEMO,
  );
  assert.deepEqual(pairs([alone.tags[39]]), [['other', 'framing']]);
  assert.equal(alone.tags[39].guess, true);
});

test('no text Claude writes reaches the result', () => {
  const parsed = parseLegal(
    JSON.stringify({
      note: 'Smith',
      tags: [
        [1, 'rule', 'law', 'See Smith v. Jones, 1 F.3d 1'],
        { n: 2, role: 'explanation', kind: 'precedent', label: 'See Smith v. Jones, 1 F.3d 1' },
        [3, 'Smith', 'Smith'],
      ],
    }),
    [{ kind: 'p', sentences: ['The law is plain.', 'A court said so.', 'It applies here.'] }],
  );
  assert.ok(!JSON.stringify(parsed).includes('Smith'));
  assert.equal(parsed.tags.length, 3);
  assert.deepEqual(Object.keys(parsed.tags[1]).sort(), ['kind', 'role', 'text']);
});

test('a reply that leaves 30% of the sentences out is partial', () => {
  const fourteen = parseLegal(
    memoReply(([n]) => n > 14),
    MEMO,
  );
  assert.equal(fourteen.tags.length, 46);
  assert.equal(fourteen.partial, true);
  assert.equal(fourteen.tags.filter(tag => tag.guess).length, 14);
  const thirteen = parseLegal(
    memoReply(([n]) => n > 13),
    MEMO,
  );
  assert.equal(thirteen.partial, undefined);
});

test('a reply without usable labels gives null', () => {
  assert.equal(parseLegal('{"tags":[]}', MEMO), null);
  assert.equal(parseLegal('nonsense', MEMO), null);
  assert.equal(parseLegal('{"tags":{"1":"rule"}}', MEMO), null);
  assert.equal(parseLegal('{"tags":[[1,"x","y"],[99,"rule","law"]]}', MEMO), null);
  assert.deepEqual(parseLegal('nonsense', []), { tags: [] });
});

test('stored labels follow their sentences when sentences move', () => {
  const stored = parseLegal(REPLY, MEMO);
  // Swap S17 and S18 (block 11 holds S17 and S18, from MEMO index 10).
  const swapped = MEMO.map(paragraph => ({ ...paragraph, sentences: [...paragraph.sentences] }));
  const at = swapped.findIndex(paragraph => paragraph.sentences.includes(stored.tags[16].text));
  const sentences = swapped[at].sentences;
  const i = sentences.indexOf(stored.tags[16].text);
  [sentences[i], sentences[i + 1]] = [sentences[i + 1], sentences[i]];
  assert.equal(sentences[i], stored.tags[17].text);
  const tags = remapLegal(stored, swapped);
  assert.equal(tags.length, 46);
  assert.deepEqual(pairs([tags[16], tags[17]]), [MEMO_TAGS[17], MEMO_TAGS[16]]);
  assert.ok(tags.every(tag => !tag.guess));
});

test('an edited sentence takes its neighbour’s labels as a guess', () => {
  const stored = parseLegal(REPLY, MEMO);
  const edited = MEMO.map(paragraph => ({
    ...paragraph,
    sentences: paragraph.sentences.map(text =>
      text === stored.tags[40].text ? `${text} Indeed.` : text,
    ),
  }));
  const tags = remapLegal(stored, edited);
  // S41 opens its paragraph, so it takes S42's labels.
  assert.deepEqual(pairs([tags[40]]), [MEMO_TAGS[41]]);
  assert.equal(tags[40].guess, true);
  assert.equal(tags.filter(tag => tag.guess).length, 1);
});

test('a new paragraph is labelled as a guess, and a split paragraph keeps its labels', () => {
  const stored = parseLegal(REPLY, MEMO);
  const added = [
    ...MEMO.slice(0, 12),
    { kind: 'p', sentences: ['A new thought.', 'Another one.'] },
    ...MEMO.slice(12),
  ];
  const tags = remapLegal(stored, added);
  assert.equal(tags.length, 48);
  const fresh = tags.filter(tag => tag.guess);
  assert.deepEqual(
    fresh.map(tag => [tag.text, tag.role, tag.kind]),
    [
      ['A new thought.', 'other', 'framing'],
      ['Another one.', 'other', 'framing'],
    ],
  );
  // Splitting the last paragraph in two keeps every label.
  const last = MEMO.at(-1).sentences;
  const split = [
    ...MEMO.slice(0, -1),
    { kind: 'p', sentences: last.slice(0, 3) },
    { kind: 'p', sentences: last.slice(3) },
  ];
  assert.deepEqual(pairs(remapLegal(stored, split)), MEMO_TAGS);
});

test('stored duplicates are matched in order, and stored guesses stay guesses', () => {
  const paragraphs = [{ kind: 'p', sentences: ['Same.', 'Other.', 'Same.'] }];
  const stored = {
    tags: [
      { text: 'Same.', role: 'rule', kind: 'law' },
      { text: 'Other.', role: 'facts', kind: 'client-fact', guess: true },
      { text: 'Same.', role: 'application', kind: 'application', also: 'counter' },
    ],
  };
  assert.deepEqual(remapLegal(stored, paragraphs), stored.tags);
  assert.equal(remapLegal({ tags: [] }, paragraphs), null);
  assert.equal(remapLegal(null, paragraphs), null);
});

test('stored labels this version could not have made are left out', () => {
  const paragraphs = [{ kind: 'p', sentences: ['A.', 'B.', 'C.'] }];
  // As an older version, or a damaged store, might have saved them.
  const stored = {
    tags: [
      null,
      { text: 'A.', role: 'thesis', kind: 'law' },
      { text: 'B.', role: 'rule', kind: 'law', also: 'nonsense', guess: 'yes' },
      { text: 'C.', role: 'facts', kind: 'facts' },
    ],
  };
  const tags = remapLegal(stored, paragraphs);
  assert.deepEqual(tags, [
    { text: 'A.', role: 'rule', kind: 'law', guess: true },
    { text: 'B.', role: 'rule', kind: 'law' },
    { text: 'C.', role: 'rule', kind: 'law', guess: true },
  ]);
  // Every label carried over is one a request can send back as prior.
  const prior = tags.map(tag => (tag.guess ? null : [tag.role, tag.kind]));
  assert.doesNotThrow(() => legalEvent('id', { paragraphs, prior }));
  assert.equal(
    remapLegal({ tags: [null, { text: 'A.', role: 'x', kind: 'y' }] }, paragraphs),
    null,
  );
});

// A small seeded generator, so a failure can be reproduced.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

test('any reply gives one tag per sentence from the lists', () => {
  const next = random(7);
  const pick = list => list[Math.floor(next() * list.length)];
  const roles = [...ROLES, 'Rule Explanation', 'COUNTER-ARGUMENT', 'title', 'junk', '', null, 3];
  const kinds = [...KINDS, 'client_fact', 'Holding', 'facts', 'junk', null, {}];
  const texts = MEMO.flatMap(paragraph => paragraph.sentences);
  for (let round = 0; round < 200; round++) {
    const entries = Array.from({ length: Math.floor(next() * 60) }, () => {
      const n = pick([Math.floor(next() * 50), `${Math.floor(next() * 47)}`, -1, 1.6, 'x', null]);
      const entry = [n, pick(roles), pick(kinds)];
      if (next() < 0.2) entry.push(pick(roles));
      return next() < 0.3 ? { n, role: entry[1], kind: entry[2], also: entry[3] } : entry;
    });
    // One entry that is sure to be usable, somewhere in the list.
    entries.splice(Math.floor(next() * (entries.length + 1)), 0, [
      1 + Math.floor(next() * 46),
      pick(ROLES),
    ]);
    const parsed = parseLegal(JSON.stringify({ tags: entries }), MEMO);
    assert.equal(parsed.tags.length, 46, `round ${round}`);
    parsed.tags.forEach((tag, index) => {
      assert.equal(tag.text, texts[index]);
      assert.ok(ROLES.includes(tag.role), `round ${round}: ${tag.role}`);
      assert.ok(KINDS.includes(tag.kind), `round ${round}: ${tag.kind}`);
      if ('also' in tag) assert.ok(ROLES.includes(tag.also) && tag.also !== tag.role);
      if ('guess' in tag) assert.equal(tag.guess, true);
      assert.ok(
        Object.keys(tag).every(key => ['text', 'role', 'kind', 'also', 'guess'].includes(key)),
      );
    });
    const guessed = parsed.tags.filter(tag => tag.guess).length;
    assert.equal(parsed.partial === true, guessed >= 0.3 * 46, `round ${round}`);
  }
});

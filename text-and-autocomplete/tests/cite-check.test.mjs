import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVER,
  planChecks,
  questionsFor,
  searchInput,
  sectionCitation,
  quotationText,
  fragmentsOf,
  matchQuotation,
  pagesIn,
  sameCaseName,
  readCase,
  readLaw,
  failureOf,
  pickCase,
  pickLaw,
  CiteCheck,
} from '../dist/cite-check.js';
import { analyzeLegal } from '../dist/legal-analysis.js';
import { sentencesIn } from '../dist/doc-model.js';
import { memoBlocks, MEMO_TAGS } from './fixtures/memo.mjs';

// The stand-in answers below have Midpage's shapes with invented cases, so no
// real result is copied into the repository.
const blocksOf = (...items) =>
  items.map(item => {
    const [kind, text] = Array.isArray(item) ? item : ['p', item];
    return { kind, text, sentences: sentencesIn(text, 'en') };
  });
const plansOf = (blocks, labels = null) => {
  const reading = analyzeLegal(blocks, labels);
  return new Map(planChecks(reading, blocks).map(plan => [plan.key, plan]));
};

const MEMO = memoBlocks();
const MEMO_PLANS = plansOf(MEMO, MEMO_TAGS);
const plan = name => [...MEMO_PLANS.values()].find(item => item.name === name);

test('the memo: cases and the statute, each with how to look it up', () => {
  const lakeside = plan('Lakeside');
  assert.equal(lakeside.how, 'citation');
  assert.equal(lakeside.citation, '455 F.3d 154');
  assert.equal(lakeside.year, '2006');
  assert.equal(lakeside.court, '3d Cir.');
  assert.deepEqual(
    lakeside.pins.map(pin => [pin.pin, pin.first, pin.last]),
    [
      ['158', 158, 158],
      ['159', 159, 159],
      ['159–60', 159, 160],
    ],
  );
  assert.equal(lakeside.quotes.length, 6);
  assert.equal(lakeside.quotes[0].pin, '158');
  assert.ok(lakeside.quotes[0].text.startsWith('First, we must decide'));
  // The block quotation is sent without its citation.
  assert.ok(!lakeside.quotes[0].text.includes('455 F.3d'));
  assert.equal(plan('DeFiore').citation, '995 F. Supp. 2d 413');
  assert.equal(plan('Hovsons').how, 'search');
  assert.deepEqual(plan('Hovsons').find, { name: 'Hovsons', volume: '89', reporter: 'F.3d' });
  assert.equal(plan('Smith').how, 'search');
  assert.equal(plan('Smith').find.docket, 'No. 13-114-J');
  const statute = plan('§ 3602');
  assert.equal(statute.kind, 'law');
  assert.equal(statute.citation, '42 U.S.C. § 3602');
  assert.ok(statute.quotes[0].text.startsWith('‘Dwelling’ means any building'));
});

test('the memo: nothing sent names the client or the facility', () => {
  for (const item of MEMO_PLANS.values()) {
    const sent = [
      ...questionsFor(item).map(question => question.question),
      item.how === 'search' ? JSON.stringify(searchInput(item)) : '',
      item.citation || '',
    ].join('\n');
    assert.doesNotMatch(sent, /\bDoe\b|Residence Co/, item.name);
  }
});

test('a quotation is sent only when its sentence cites that one authority', () => {
  const plans = plansOf(
    blocksOf(
      'The rule is settled. Acme Corp. v. Widget Co., 123 F.3d 456, 460 (2d Cir. 2001).',
      'The court held that “a lease of five months is a long stay for this purpose.” Acme, 123 F.3d at 461.',
      'Both courts agree that “the stay must be measured by its design.” Acme, 123 F.3d at 462; Baker v. Carr Co., 456 F.3d 789, 790 (3d Cir. 2006).',
      'The tenant said “we will never leave this place at all” to the manager. Compl. ¶ 4; Acme, 123 F.3d at 463.',
      'The owner called it “a home for every resident of the building.” Acme, 123 F.3d at 464.',
    ),
    [
      ['rule', 'law'],
      ['rule', 'law'],
      ['explanation', 'precedent'],
      ['rule', 'precedent'],
      ['application', 'client-fact'],
    ],
  );
  const acme = plans.get('123 F.3d 456');
  assert.deepEqual(
    acme.quotes.map(quote => [quote.text, quote.pin]),
    [['a lease of five months is a long stay for this purpose.', '461']],
  );
  assert.deepEqual(
    acme.skipped.map(item => item.why),
    [
      'Its sentence cites more than one source.',
      'Its sentence also cites the record or a source with no full citation.',
      'It is in a statement of the client’s facts.',
    ],
  );
  const sent = questionsFor(acme)
    .map(question => question.question)
    .join('\n');
  assert.doesNotMatch(sent, /never leave|every resident|measured by its design/);
});

test('short quotations are terms, not passages, and are not sent', () => {
  const plans = plansOf(
    blocksOf(
      'The key word is “residence.” Acme Corp. v. Widget Co., 123 F.3d 456, 460 (2d Cir. 2001).',
    ),
  );
  assert.deepEqual(plans.get('123 F.3d 456').quotes, []);
});

test('a long quotation goes in parts, and questions stay short', () => {
  const long = Array.from(
    { length: 40 },
    (_, i) => `Sentence ${i} of the opinion says a thing.`,
  ).join(' ');
  const plans = plansOf(
    blocksOf(['blockquote', `${long} Acme Corp. v. Widget Co., 123 F.3d 456, 460 (2d Cir. 2001).`]),
  );
  const acme = plans.get('123 F.3d 456');
  assert.equal(acme.quotes.length, 1);
  assert.ok(acme.quotes[0].parts.length > 1);
  assert.ok(acme.quotes[0].parts.every(part => part.length <= 600));
  assert.equal(acme.quotes[0].parts.join(' '), acme.quotes[0].text);
  for (const question of questionsFor(acme)) assert.ok(question.question.length < 4000);
});

test('section citations', () => {
  const cases = {
    '42 U.S.C. § 3602(b), (c)': '42 U.S.C. § 3602',
    'Cal. Civ. Code § 1714(a) (West 2020)': 'Cal. Civ. Code § 1714',
    '735 ILCS 5/2-619(a)(9)': '735 ILCS 5/2-619',
    '42 U.S.C. §§ 3601–3619': '42 U.S.C. § 3601',
    'U.S. Const. art. I, § 8': 'U.S. Const. art. I, § 8',
    '24 C.F.R. § 100.201 (2023)': '24 C.F.R. § 100.201',
    'N.J. Stat. Ann. § 2A:14-1 (West)': 'N.J. Stat. Ann. § 2A:14-1',
    '42 U.S.C. § 2000e-2(a)(1)': '42 U.S.C. § 2000e-2',
    'See 42 U.S.C. §§ 3601, 3604': '42 U.S.C. § 3601',
    'the statute': null,
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(sectionCitation(text), want, text);
});

test('quotation text: enclosing marks off, inner marks single', () => {
  assert.equal(quotationText('“It is the period that matters.”'), 'It is the period that matters.');
  assert.equal(quotationText('“Dwelling” means any building'), '‘Dwelling’ means any building');
  assert.equal(
    quotationText('have not defined a "significant period" yet'),
    'have not defined a ‘significant period’ yet',
  );
});

test('matching a quotation with the passages Midpage returns', () => {
  const passage =
    'Here, in contrast, we require only that the facility be intended for occupancy as a residence, and nothing more.';
  assert.equal(
    matchQuotation('we require only that the facility be intended', [passage]).state,
    'exact',
  );
  // Spaces and the kind of quotation mark or dash do not count.
  assert.equal(
    matchQuotation('we require only that the  facility be “intended”', [passage]).state,
    'exact',
  );
  assert.equal(
    matchQuotation('We require only, that the facility be intended', [passage]).state,
    'words',
  );
  // Brackets and ellipses mark the writer's changes.
  assert.equal(
    matchQuotation('[W]e require only that the [place] be intended … as a residence', [passage])
      .state,
    'exact',
  );
  const partial = matchQuotation(
    'we require only that the facility be intended for occupancy as a permanent home of the family',
    [passage],
  );
  assert.equal(partial.state, 'partial');
  assert.match(partial.missing, /permanent home/);
  assert.equal(
    matchQuotation('an entirely different sentence about boats', [passage]).state,
    'missing',
  );
  assert.equal(matchQuotation('anything at all here', []).state, 'missing');
  assert.deepEqual(fragmentsOf('[T]he stay . . . must be long'), ['he stay', 'must be long']);
});

test('page numbers in Midpage’s words', () => {
  assert.deepEqual(pagesIn('The opinion spans pages 154-162 of the reporter.'), {
    range: [154, 162],
    pages: [],
  });
  assert.deepEqual(pagesIn('The passage is on page 159.').pages, [159]);
  assert.deepEqual(pagesIn('It appears at reporter page number 160.').pages, [160]);
  assert.deepEqual(pagesIn('No page numbers here.'), { range: null, pages: [] });
});

test('case names compare by their words and abbreviations', () => {
  assert.equal(
    sameCaseName(
      'Lakeside Resort Enters., LP v. Bd. of Supervisors of Palmyra Twp.',
      'Lakeside Resort Enterprises, LP v. Board of Supervisors of Palmyra Township',
    ),
    true,
  );
  assert.equal(sameCaseName('Twombly', 'Bell Atlantic Corp. v. Twombly'), true);
  assert.equal(sameCaseName('Acme Corp. v. Widget Co.', 'Baker v. Carr'), false);
  assert.equal(sameCaseName('v.', 'Baker v. Carr'), null);
  // Each party has to match its own.
  assert.equal(sameCaseName('Smith v. Salvation Army', 'Brown v. Salvation Army'), false);
});

const ACME = {
  key: '123 F.3d 456',
  name: 'Acme',
  kind: 'case',
  how: 'citation',
  citation: '123 F.3d 456',
  caseName: 'Acme Corp. v. Widget Co.',
  court: '2d Cir.',
  year: '2001',
  pins: [{ pin: '460', first: 460, last: 460, span: { block: 0, start: 0, end: 5 } }],
  quotes: [
    {
      text: 'a lease of five months is a long stay',
      pin: '461',
      first: 461,
      last: 461,
      parts: ['a lease of five months is a long stay'],
      span: { block: 1, start: 4, end: 30 },
    },
  ],
  skipped: [],
  signature: 'acme',
};
const answer = (over = {}) => ({
  status: 'ok',
  case: {
    caseName: 'Acme Corporation v. Widget Company',
    court: '2d Cir.',
    dateFiled: '2001-03-02',
  },
  document: {
    documentId: 'doc-1',
    url: 'https://app.midpage.ai/document/acme',
    opinion: {
      citation: 'Acme Corporation v. Widget Company, 123 F.3d 456 (2d Cir. 2001)',
      dateDecided: '2001-03-02',
      treatment: { status: 'Neutral', negative: 0, caution: 0, history: [] },
    },
  },
  answer: 'The opinion spans pages 456-470.',
  supportedPropositions: [
    {
      proposition: 'The opinion contains the words, on page 461.',
      quote: 'We hold that a lease of five months is a long stay under the Act.',
      quoteTruncated: false,
      deeplinkUrl: 'https://app.midpage.ai/document/acme?lines=10-10',
    },
  ],
  doesNotAddress: [],
  sourceWarnings: [],
  ...over,
});

test('reading a case: found, pins inside, quotation word for word on its page', () => {
  const result = readCase(ACME, [answer()]);
  assert.equal(result.verdict, 'ok');
  assert.equal(result.url, 'https://app.midpage.ai/document/acme');
  const texts = result.lines.map(item => `${item.state}: ${item.text}`);
  assert.deepEqual(texts, [
    'ok: Found in Midpage: Acme Corporation v. Widget Company, 123 F.3d 456 (2d Cir. 2001)',
    'ok: Pin 460 is within the opinion’s pages, 456–470, as Midpage gives them.',
    'ok: Quotation found word for word: “a lease of five months is a long stay”',
    'ok: Midpage puts it on page 461, the page cited.',
    'info: Midpage lists no negative or caution treatment. Its list is not a full citator.',
  ]);
  assert.equal(result.lines[2].url, 'https://app.midpage.ai/document/acme?lines=10-10');
});

test('reading a case: the wrong case, the wrong year, another court, negative treatment', () => {
  const result = readCase(ACME, [
    answer({
      case: { caseName: 'Baker v. Carr', court: 'S.D.N.Y.', dateFiled: '1999-01-01' },
      document: {
        url: 'javascript:alert(1)',
        opinion: {
          citation: 'Baker v. Carr, 123 F.3d 456 (S.D.N.Y. 1999)',
          dateDecided: '1999-01-01',
          treatment: {
            negative: 1,
            caution: 0,
            history: [
              { category: 'Negative', citation: 'Doe v. Roe, 1 F.4th 1', reason: 'Overruled.' },
            ],
          },
        },
      },
      answer: 'The text has no reporter page numbers.',
      supportedPropositions: [],
    }),
  ]);
  assert.equal(result.verdict, 'problem');
  assert.equal(result.url, null);
  const texts = result.lines.map(item => `${item.state}: ${item.text}`);
  assert.ok(
    texts.includes('problem: This citation leads to Baker v. Carr, not Acme Corp. v. Widget Co..'),
  );
  assert.ok(
    texts.includes('problem: Midpage dates the decision 1999-01-01; the document says 2001.'),
  );
  assert.ok(
    texts.includes('warn: Midpage gives the court as S.D.N.Y.; the document says 2d Cir..'),
  );
  assert.ok(
    texts.includes('unknown: Pins not checked against the opinion’s pages: Midpage gave none.'),
  );
  assert.ok(
    texts.includes(
      'problem: Quotation not found in the passages Midpage returned: “a lease of five months is a long stay”',
    ),
  );
  const negative = result.lines.find(item => item.text.includes('negatively'));
  assert.deepEqual(negative.items, [{ text: 'Doe v. Roe, 1 F.4th 1: Overruled.', url: null }]);
});

test('reading a statute', () => {
  const law = {
    ...ACME,
    kind: 'law',
    citation: '42 U.S.C. § 3602',
    pins: [],
    quotes: [{ ...ACME.quotes[0], text: 'any building which is occupied as a residence' }],
  };
  const result = readLaw(law, [
    {
      citation: '42 U.S.C. § 3602',
      title: 'Definitions',
      isCurrent: false,
      isHistorical: false,
      url: 'https://app.midpage.ai/laws/x',
      analysis: {
        passages: [
          {
            quote:
              '(b) “Dwelling” means any building which is occupied as a residence by one or more families.',
          },
        ],
      },
    },
  ]);
  assert.equal(result.verdict, 'warn');
  assert.deepEqual(
    result.lines.map(item => item.state),
    ['ok', 'warn', 'ok'],
  );
});

test('failures: Midpage’s own status, page-level codes, retryable ones', () => {
  const notFound = failureOf({
    code: 'tool_error',
    message: 'failed',
    result: { content: [{ type: 'text', text: '{"status":"not_found","message":"No case."}' }] },
  });
  assert.equal(notFound.status, 'not_found');
  assert.equal(notFound.message, 'No case.');
  assert.equal(notFound.page, null);
  const law = failureOf({
    code: 'tool_error',
    result: { payload: { error: 'No document matched.' } },
  });
  assert.equal(law.status, 'not_found');
  const reauth = failureOf({ code: 'needs_reauth', message: 'expired' });
  assert.match(reauth.page, /Reconnect Midpage Legal Research/);
  assert.equal(reauth.deny, true);
  const busy = failureOf({ code: 'server_unavailable', retryable: true, retryAfterMs: 999999 });
  assert.equal(busy.retry, true);
  assert.equal(busy.wait, 60000);
  assert.equal(failureOf(null).code, 'upstream_error');
});

test('picking the search hit and the statute', () => {
  const hit = (name, citation, extra = {}) => ({
    case: { caseName: name, court: 'W.D. Pa.', docketNumber: '', ...extra },
    document: { documentId: name, opinion: { citation, dateDecided: '2015-02-03' } },
  });
  const docket = {
    find: {
      name: 'Smith v. Salvation Army',
      docket: 'No. 13-114-J',
      court: 'W.D. Pa.',
      year: '2015',
    },
  };
  assert.equal(
    pickCase(docket, [
      hit('Brown v. Salvation Army', 'x'),
      hit('Smith v. Salvation Army', 'y', { docketNumber: '2:13-cv-00114' }),
      hit('Smith v. The Salvation Army', 'z', { docketNumber: '13-114' }),
    ])?.document.documentId,
    'Smith v. Salvation Army',
  );
  assert.equal(
    pickCase(docket, [hit('Smith v. Salvation Army', 'y', { docketNumber: '2:13-cv-01145' })]),
    null,
  );
  const short = { find: { name: 'Hovsons', volume: '89', reporter: 'F.3d' } };
  assert.equal(
    pickCase(short, [
      hit(
        'Hovsons, Inc. v. Township of Brick',
        'Hovsons, Inc. v. Township of Brick, 89 F.3d 1096 (3d Cir. 1996)',
      ),
    ])?.document.documentId,
    'Hovsons, Inc. v. Township of Brick',
  );
  assert.equal(pickCase(short, [hit('Hovsons v. Brick', '12 F.3d 1')]), null);
  const statute = { citation: 'Cal. Civ. Code § 1714' };
  assert.equal(
    pickLaw(statute, [
      { id: 'a', citation: 'Cal. Penal Code § 1714' },
      { id: 'b', citation: 'Cal. Civ. Code § 1714' },
    ])?.id,
    'b',
  );
  assert.equal(
    pickLaw({ citation: 'Tex. Bus. & Com. Code Ann. § 17.46' }, [
      { id: 'c', citation: 'Tex. Bus. & Com. Code § 17.46' },
    ])?.id,
    'c',
  );
});

// A stand-in for the page's `mcp` namespace: answers by tool, records calls.
function standIn(
  answers,
  { servers = [{ server: SERVER, authStatus: 'unknown', tools: [] }] } = {},
) {
  const calls = [];
  const mcp = {
    calls,
    listTools: async () => ({ servers }),
    callTool: async (server, tool, input, options) => {
      calls.push({ server, tool, input, options });
      const next = answers[tool];
      const value = typeof next === 'function' ? await next(input, options) : next;
      if (value instanceof Error || value?.code) throw value;
      return { content: [], payload: value };
    },
  };
  return mcp;
}
class Store {
  constructor() {
    this.items = new Map();
  }
  getItem(key) {
    return this.items.get(key) ?? null;
  }
  setItem(key, value) {
    this.items.set(key, String(value));
  }
}
const ready = async check => {
  await check.loading;
  return check;
};

test('no connectors on this page: not available, nothing called', async () => {
  const check = await ready(new CiteCheck({ load: async () => null }));
  assert.equal(check.available, false);
  await check.check(ACME);
  assert.equal(check.state(ACME).status, 'idle');
});

test('Midpage not connected: a notice, and Check can still ask', async () => {
  const mcp = standIn({ analyzeCaseDocument: answer() }, { servers: [] });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  assert.equal(check.available, true);
  assert.match(check.notice, /Add the Midpage Legal Research connector/);
});

test('a check: one call by citation, the result kept and restored', async () => {
  const mcp = standIn({ analyzeCaseDocument: answer() });
  const storage = new Store();
  const check = await ready(new CiteCheck({ load: async () => mcp, storage, now: () => 1000 }));
  const seen = [];
  check.on(() => seen.push(check.state(ACME).status));
  await check.check(ACME);
  assert.deepEqual(seen, ['running', 'done']);
  assert.equal(mcp.calls.length, 1);
  assert.equal(mcp.calls[0].server, SERVER);
  assert.equal(mcp.calls[0].input.citation, '123 F.3d 456');
  assert.match(
    mcp.calls[0].input.question,
    /Quotation 1: .*"a lease of five months is a long stay"/,
  );
  assert.match(mcp.calls[0].input.question, /pages A-B/);
  assert.equal(mcp.calls[0].options.cache.refresh, false);
  const { status, result } = check.state(ACME);
  assert.equal(status, 'done');
  assert.equal(result.verdict, 'ok');
  assert.equal(result.checkedAt, 1000);
  // Kept in this browser; a changed document makes it stale.
  const again = await ready(new CiteCheck({ load: async () => mcp, storage }));
  assert.equal(again.state(ACME).status, 'done');
  assert.equal(again.state({ ...ACME, signature: 'changed' }).status, 'stale');
  // Check again asks Midpage afresh.
  await check.check(ACME, { fresh: true });
  assert.equal(mcp.calls[1].options.cache.refresh, true);
});

test('a case cited by docket is found by search first', async () => {
  const smith = plan('Smith');
  const mcp = standIn({
    search: {
      status: 'ok',
      results: [
        {
          case: {
            caseName: 'Smith v. Salvation Army',
            court: 'W.D. Pa.',
            docketNumber: '3:13-cv-114-J',
          },
          document: {
            documentId: 'doc-smith',
            opinion: { citation: 'Smith v. Salvation Army', dateDecided: '2015-05-01' },
          },
        },
      ],
    },
    analyzeCaseDocument: answer({
      case: { caseName: 'Smith v. Salvation Army', court: 'W.D. Pa.', dateFiled: '2015-05-01' },
      document: {
        documentId: 'doc-smith',
        url: 'https://app.midpage.ai/document/smith',
        opinion: { dateDecided: '2015-05-01' },
      },
      answer: '',
      supportedPropositions: [],
    }),
  });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  await check.check(smith);
  assert.deepEqual(
    mcp.calls.map(call => call.tool),
    ['search', 'analyzeCaseDocument'],
  );
  assert.equal(mcp.calls[1].input.documentId, 'doc-smith');
  assert.equal(mcp.calls[1].input.citation, undefined);
  const { result } = check.state(smith);
  assert.ok(result.lines.some(item => item.text.startsWith('Found by name')));
  // Its one quotation was not in what Midpage returned.
  assert.equal(result.verdict, 'problem');
});

test('a case Midpage does not have', async () => {
  const mcp = standIn({
    analyzeCaseDocument: {
      code: 'tool_error',
      message: 'tool failed',
      result: {
        content: [
          { type: 'text', text: '{"status":"not_found","message":"Could not find a case."}' },
        ],
      },
    },
  });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  await check.check(ACME);
  const { result } = check.state(ACME);
  assert.equal(result.verdict, 'problem');
  assert.match(result.lines[0].text, /Midpage has no case at 123 F\.3d 456/);
});

test('a statute in a form Midpage does not match is found by search', async () => {
  const statute = { ...plan('§ 3602'), citation: '42 U.S. Code § 3602', signature: 'law' };
  let first = true;
  const mcp = standIn({
    analyzeLaw: input => {
      if (first) {
        first = false;
        return {
          code: 'tool_error',
          result: { payload: { error: 'No document matched citation.' } },
        };
      }
      assert.equal(input.id, 'law-1');
      return {
        citation: '42 U.S.C. § 3602',
        title: 'Definitions',
        isCurrent: true,
        url: 'https://app.midpage.ai/laws/3602',
        analysis: { passages: [] },
      };
    },
    searchLaws: { results: [{ id: 'law-1', citation: '42 U.S.C. § 3602' }] },
  });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  await check.check(statute);
  assert.deepEqual(
    mcp.calls.map(call => call.tool),
    ['analyzeLaw', 'searchLaws', 'analyzeLaw'],
  );
  assert.equal(
    check.state(statute).result.lines[0].text,
    'Found in Midpage: 42 U.S.C. § 3602 · Definitions',
  );
});

test('a busy server is retried once, then reported', async () => {
  let tries = 0;
  const waits = [];
  const mcp = standIn({
    analyzeCaseDocument: () => {
      tries++;
      return { code: 'server_unavailable', retryable: true, retryAfterMs: 20 };
    },
  });
  const check = await ready(
    new CiteCheck({ load: async () => mcp, wait: async ms => waits.push(ms) }),
  );
  await check.check(ACME);
  assert.equal(tries, 2);
  assert.deepEqual(waits, [20]);
  assert.equal(check.state(ACME).result.verdict, 'error');
  assert.match(check.state(ACME).result.lines[0].text, /did not answer/);
});

test('a lapsed connection stops check-all, says how to fix it, and drops kept results', async () => {
  const storage = new Store();
  const good = standIn({ analyzeCaseDocument: answer() });
  const first = await ready(new CiteCheck({ load: async () => good, storage }));
  await first.check(ACME);
  assert.equal(first.state(ACME).status, 'done');
  const lapsed = standIn({ analyzeCaseDocument: { code: 'needs_reauth', message: 'expired' } });
  const check = await ready(new CiteCheck({ load: async () => lapsed, storage }));
  const plans = [
    ACME,
    { ...ACME, key: 'b', signature: 'b' },
    { ...ACME, key: 'c', signature: 'c' },
  ];
  await check.checkAll(plans);
  assert.match(check.notice, /Reconnect Midpage Legal Research/);
  assert.ok(lapsed.calls.length <= 2);
  assert.equal(check.running, null);
  assert.equal(check.state(ACME).status, 'idle');
  assert.equal(storage.getItem('text-and-autocomplete.cite-check'), '[]');
});

test('check-all runs two at a time and can be stopped', async () => {
  let inFlight = 0;
  let most = 0;
  const release = [];
  const mcp = standIn({
    analyzeCaseDocument: (input, options) =>
      new Promise((resolve, reject) => {
        inFlight++;
        most = Math.max(most, inFlight);
        const done = () => {
          inFlight--;
          resolve(answer());
        };
        release.push(done);
        options.signal.addEventListener('abort', () => {
          inFlight--;
          reject({ code: 'cancelled' });
        });
      }),
  });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  const plans = ['a', 'b', 'c', 'd'].map(key => ({ ...ACME, key, signature: key }));
  const all = check.checkAll(plans);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(most, 2);
  assert.deepEqual(check.running, { done: 0, total: 4 });
  release.shift()();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(most, 2);
  check.stop();
  await all;
  assert.equal(check.running, null);
  assert.equal(check.state(plans[0]).status, 'done');
  // Stopped checks leave no result.
  assert.equal(plans.filter(item => check.state(item).status === 'done').length, 1);
});

test('the memo through a stand-in Midpage: every call carries only citations and quotations', async () => {
  const mcp = standIn({
    analyzeCaseDocument: answer({ supportedPropositions: [] }),
    analyzeLaw: { citation: '42 U.S.C. § 3602', isCurrent: true, analysis: { passages: [] } },
    search: { results: [] },
    searchLaws: { results: [] },
  });
  const check = await ready(new CiteCheck({ load: async () => mcp }));
  await check.checkAll([...MEMO_PLANS.values()]);
  assert.ok(mcp.calls.length >= 6);
  const texts = new Set(MEMO.flatMap(block => block.sentences.map(sentence => sentence.text)));
  for (const call of mcp.calls) {
    const sent = JSON.stringify(call.input);
    assert.doesNotMatch(sent, /\bDoe\b|Residence Co/);
    // No whole sentence of the memo goes out unless it is all quotation.
    for (const text of texts) {
      if (text.length > 60 && !/^[“"]/.test(text)) assert.ok(!sent.includes(text), text);
    }
  }
  // Every case and the statute has a result.
  for (const item of MEMO_PLANS.values()) assert.ok(check.state(item).result, item.name);
});

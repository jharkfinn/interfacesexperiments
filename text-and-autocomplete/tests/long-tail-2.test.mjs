// Regression tests for the fourth verification round. An independent verifier ran 82 legal
// citation forms, each after a claim, and 80 sentences of ordinary prose through the
// splitter, the analysis and the guards. It found prose read as citations (W9, M4), letters
// of citations that rewrites, drafts and autocomplete could change (S1–S4), claims cut off
// from their citations (W1), forms split or unread (W2, W3, W6, W7), table rows titled from
// the middle of a citation or made from its pins (W4, W5), wrong types and names (W8), and
// smaller slips (M2, M3, M5). Each test states what a careful reviewer expects.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  citationKey,
  citationRuns,
  citationSourceWord,
  findCitations,
  quoteSpans,
} from '../dist/legal-text.js';
import { analyzeLegal } from '../dist/legal-analysis.js';
import {
  citationContext,
  combineRefusal,
  cutAtCitation,
  guardDraft,
  guardInsertion,
  guardReplacement,
  selectionRefusal,
} from '../dist/citation-guard.js';
import { completionAnchor, inspectCompletion } from '../dist/compose-core.js';
import { sentencesIn } from '../dist/doc-model.js';

const S = text => sentencesIn(text, 'en').map(sentence => sentence.text);
const doc = list =>
  list.map(([kind, text], index) => ({ index, kind, text, sentences: sentencesIn(text, 'en') }));
const cites = text =>
  findCitations(text)
    .filter(cite => !cite.nested)
    .map(cite => [cite.type, cite.text]);
const rows = reading =>
  reading.authorities.map(row => `${row.group} | ${row.title} | n=${row.count}`);
// What autocomplete keeps when the model writes `insertion` after `before`.
const complete = (before, insertion, after = '') =>
  inspectCompletion(completionAnchor(before) + insertion, before, after);
const RULE = ['rule', 'law'];
const FACT = ['facts', 'client-fact'];
const HEAD = ['heading', 'framing'];

// The verifier's forms: [id, citation, kind of claim, a change of letters only that cites
// something else]. Public case names and placeholders only.
const FORMS = [
  ['A1', 'ROA.1234.', 'record', ['ROA', 'SOA']],
  ['A2', 'ROA.1234-36.', 'record', ['ROA', 'SOA']],
  ['A3', 'Pet. App. 12a.', 'record', ['Pet.', 'Resp.']],
  ['A4', 'J.A. 45–46.', 'record', ['J.A.', 'S.A.']],
  ['A5', 'Dkt. 45-3 at 7.', 'record', ['Dkt.', 'Doc.']],
  ['A6', 'Hr’g Tr. 14:2–9, Mar. 3, 2023.', 'record', ['Hr’g Tr.', 'Trial Tr.']],
  ['A7', 'PSR ¶ 34.', 'record', ['PSR', 'PSI']],
  ['A8', '(2 RR 45.)', 'record', ['RR', 'CR']],
  ['A9', '(VRP (Mar. 3, 2021) at 12.)', 'record', ['VRP', 'RP']],
  ['A10', '(1-SER-45.)', 'record', ['SER', 'ER']],
  ['A11', 'Appellant’s Br. 12.', 'record', ['Appellant’s', 'Appellee’s']],
  ['A12', 'Gov’t Br. 23–24.', 'record', ['Gov’t', 'Def.’s']],
  ['A13', 'Decl. of Jane Roe ¶ 5, ECF No. 22-1.', 'record', ['Jane Roe', 'John Roe']],
  ['A14', 'GX 101 at 3.', 'record', ['GX', 'DX']],
  ['A15', 'Mem. Op. & Order 5, ECF No. 30.', 'record', ['Mem. Op. & Order', 'Order']],
  [
    'A16',
    'Def.’s Answers to Pl.’s First Set of Interrogs. No. 4.',
    'record',
    ['Def.’s Answers', 'Pl.’s Answers'],
  ],
  ['A17', 'Sent. Tr. 12:4–6.', 'record', ['Sent. Tr.', 'Plea Tr.']],
  ['A18', '(Supp. CT 12.)', 'record', ['Supp. CT', 'CT']],
  ['B1', 'Starbucks Corp., 372 NLRB No. 50, slip op. at 3 (2023).', 'law', ['NLRB', 'FLRA']],
  [
    'B2',
    'Exchange Act Release No. 94524, 87 Fed. Reg. 21,334 (Apr. 11, 2022).',
    'law',
    ['Exchange Act', 'Securities Act'],
  ],
  [
    'B3',
    'Apple Inc., SEC No-Action Letter, 2019 WL 1234567 (Dec. 1, 2019).',
    'law',
    ['Apple Inc.', 'Google LLC'],
  ],
  ['B4', 'In re Facebook, Inc., 169 F.T.C. 1, 12 (2020).', 'law', ['F.T.C.', 'F.C.C.']],
  [
    'B5',
    'Priv. Ltr. Rul. 202012003 (Mar. 20, 2020).',
    'law',
    ['Priv. Ltr. Rul.', 'Tech. Adv. Mem.'],
  ],
  ['B6', 'Rev. Proc. 2020-23, 2020-18 I.R.B. 749.', 'law', ['Rev. Proc.', 'Rev. Rul.']],
  ['B7', 'I.R.S. Notice 2020-18, 2020-15 I.R.B. 590.', 'law', ['Notice', 'Announcement']],
  ['B8', 'Matter of A-B-, 27 I&N Dec. 316, 320 (A.G. 2018).', 'law', ['A-B-', 'L-E-A-']],
  [
    'B9',
    'In re Restoring Internet Freedom, 33 FCC Rcd 311, ¶ 20 (2018).',
    'law',
    ['FCC Rcd', 'F.C.C.R.'],
  ],
  [
    'B10',
    'Smith v. Dep’t of the Army, 120 M.S.P.R. 1, ¶ 5 (2013).',
    'law',
    ['the Army', 'the Navy'],
  ],
  ['B11', '37 Op. Att’y Gen. 1, 4 (1933).', 'law', ['Op. Att’y Gen.', 'Op. O.L.C.']],
  ['B12', 'T.D. 9947, 86 Fed. Reg. 1,234 (Jan. 5, 2021).', 'law', ['T.D.', 'T.A.M.']],
  ['C1', 'Fed. R. Bankr. P. 7012(b).', 'law', ['Bankr.', 'Civ.']],
  ['C2', '9th Cir. R. 36-3(a).', 'law', ['R. 36', 'I.O.P. 36']],
  ['C3', '3d Cir. I.O.P. 5.7.', 'law', ['I.O.P.', 'L.A.R.']],
  ['C4', 'CALCRIM No. 220.', 'law', ['CALCRIM', 'CALJIC']],
  ['C5', 'Ill. Pattern Jury Instr., Civ., No. 15.01 (2023).', 'law', ['Civ.', 'Crim.']],
  ['C6', 'Tex. R. App. P. 38.1(i).', 'law', ['App.', 'Civ.']],
  ['C7', 'Pa. R.A.P. 1925(b).', 'law', ['R.A.P.', 'R.C.P.']],
  ['C8', 'E.D. Va. Loc. Civ. R. 7(F)(1).', 'law', ['Civ.', 'Crim.']],
  [
    'C9',
    'Ninth Circuit Manual of Model Criminal Jury Instructions No. 4.1 (2022).',
    'law',
    ['Criminal', 'Civil'],
  ],
  ['C10', 'N.Y. Pattern Jury Instr.—Civil 2:10.', 'law', ['Civil', 'Criminal']],
  ['D1', 'In re Smith, 600 B.R. 123, 130 (Bankr. S.D.N.Y. 2019).', 'law', ['S.D.N.Y.', 'E.D.N.Y.']],
  ['D2', 'In re Doe, 500 B.R. 1, 5 (B.A.P. 9th Cir. 2013).', 'law', ['B.A.P.', 'Bankr.']],
  ['D3', 'Smith v. Commissioner, 150 T.C. 1, 5 (2018).', 'law', ['T.C.', 'B.T.A.']],
  ['D4', 'Jones v. Commissioner, T.C. Memo. 2020-45, at *3.', 'law', ['Memo.', 'Summ. Op.']],
  ['D5', 'Roe v. Commissioner, T.C. Summary Opinion 2015-10.', 'law', ['Summary Opinion', 'Memo.']],
  ['D6', 'Doe v. Commissioner, 123 T.C.M. (CCH) 1050, 1052 (2022).', 'law', ['CCH', 'RIA']],
  ['D7', '11 U.S.C. § 362(a)(3).', 'law', ['(a)(3)', '(b)(3)']],
  ['D8', 'Treas. Reg. § 301.7701-3(b)(1)(i).', 'law', ['(b)(1)(i)', '(c)(1)(i)']],
  [
    'E1',
    'Navajo Nation v. Smith, No. SC-CV-12-15, slip op. at 4 (Nav. Sup. Ct. 2016).',
    'law',
    ['Nav. Sup. Ct.', 'Nav. Ct. App.'],
  ],
  [
    'E2',
    'Smith v. Jones, 5 Am. Tribal Law 123, 125 (Mashantucket Pequot Tribal Ct. 2004).',
    'law',
    ['Mashantucket Pequot', 'Mohegan'],
  ],
  [
    'E3',
    'United States v. Smith, 79 M.J. 1, 5 (C.A.A.F. 2019).',
    'law',
    ['C.A.A.F.', 'A. Ct. Crim. App.'],
  ],
  ['E4', 'United States v. Roe, 30 C.M.R. 12, 14 (C.M.A. 1960).', 'law', ['C.M.A.', 'A.B.R.']],
  ['E5', 'R.C.M. 707(a).', 'law', ['R.C.M.', 'M.C.M.']],
  ['E6', 'Mil. R. Evid. 304(a).', 'law', ['Mil.', 'Fed.']],
  ['E7', 'Article 120, UCMJ, 10 U.S.C. § 920.', 'law', ['UCMJ', 'MCM']],
  [
    'F1',
    'Smith v. Jones, 598 U.S. ___, ___ (2023) (slip op., at 5).',
    'law',
    ['slip op.', 'mem. op.'],
  ],
  ['F2', 'Smith v. Jones, No. 22-123 (U.S. argued Jan. 10, 2023).', 'law', ['argued', 'decided']],
  [
    'F3',
    'Tr. of Oral Arg. 12:4–9, Smith v. Jones, No. 22-123 (U.S. Jan. 10, 2023).',
    'law',
    ['Oral Arg.', 'Hr’g'],
  ],
  [
    'F4',
    'Brief for Petitioner at 12, Smith v. Jones, No. 22-123 (U.S. filed Nov. 1, 2022).',
    'law',
    ['Petitioner', 'Respondent'],
  ],
  ['F5', 'Pet. for Cert. 5, Smith v. Jones, No. 22-123.', 'law', ['Pet. for Cert.', 'Br. in Opp.']],
  ['F6', 'Smith v. Jones, 143 S. Ct. 1 (2023) (mem.).', 'law', ['(mem.)', '(per curiam)']],
  [
    'G1',
    'U.S. Patent No. 9,876,543 col. 4 ll. 5–20 (filed Jan. 2, 2015).',
    'law',
    ['Patent', 'Trademark'],
  ],
  ['G2', '’543 patent col. 3 ll. 12–20.', 'record', ['patent', 'application']],
  ['G3', 'U.S. Trademark Reg. No. 4,567,890.', 'law', ['Trademark', 'Patent']],
  ['G4', 'In re Smith, 2019 USPQ2d 12345, at *3 (T.T.A.B. 2019).', 'law', ['T.T.A.B.', 'P.T.A.B.']],
  ['G5', 'MPEP § 2111 (9th ed. Rev. 10.2019, June 2020).', 'law', ['MPEP', 'TMEP']],
  ['G6', 'IPR2019-01234, Paper 12 at 5 (P.T.A.B. Mar. 3, 2020).', 'law', ['IPR', 'PGR']],
  ['G7', 'TMEP § 1207.01 (Nov. 2023).', 'law', ['TMEP', 'MPEP']],
  [
    'H1',
    'Smith v. Jones, AAA Case No. 01-19-0001-2345 (2020) (Roe, Arb.).',
    'law',
    ['AAA', 'JAMS'],
  ],
  [
    'H2',
    'Acme Corp., 123 Lab. Arb. Rep. (BNA) 456, 460 (2008) (Brown, Arb.).',
    'law',
    ['Lab. Arb. Rep.', 'Lab. Rel. Rep.'],
  ],
  [
    'H3',
    'Philip Morris v. Uruguay, ICSID Case No. ARB/10/7, Award, ¶ 399 (July 8, 2016).',
    'law',
    ['ICSID', 'UNCITRAL'],
  ],
  ['H4', 'FINRA Arb. No. 19-01234, at 5 (2020).', 'law', ['FINRA', 'NASD']],
  [
    'I1',
    'Case C-131/12, Google Spain SL v. AEPD, ECLI:EU:C:2014:317, ¶ 94 (May 13, 2014).',
    'law',
    ['ECLI:EU:C', 'ECLI:EU:T'],
  ],
  ['I2', 'Regulation (EU) 2016/679, art. 6(1)(f), 2016 O.J. (L 119) 1.', 'law', ['O.J.', 'E.C.R.']],
  [
    'I3',
    'Military and Paramilitary Activities in and against Nicaragua (Nicar. v. U.S.), Judgment, 1986 I.C.J. 14, ¶ 202 (June 27).',
    'law',
    ['I.C.J.', 'P.C.I.J.'],
  ],
  [
    'I4',
    'Vienna Convention on the Law of Treaties art. 31(1), May 23, 1969, 1155 U.N.T.S. 331.',
    'law',
    ['U.N.T.S.', 'U.S.T.'],
  ],
  ['I5', 'S.C. Res. 1373, ¶ 2 (Sept. 28, 2001).', 'law', ['S.C. Res.', 'G.A. Res.']],
  [
    'I6',
    'Big Brother Watch v. United Kingdom, App. No. 58170/13, ¶ 50 (Eur. Ct. H.R. May 25, 2021).',
    'law',
    ['Eur. Ct. H.R.', 'Eur. Comm’n H.R.'],
  ],
  ['I7', 'Mabo v Queensland (No 2) (1992) 175 CLR 1, 42.', 'law', ['CLR', 'ALR']],
  [
    'I8',
    'Appellate Body Report, United States—Import Prohibition of Certain Shrimp, ¶ 129, WT/DS58/AB/R (Oct. 12, 1998).',
    'law',
    ['Appellate Body Report', 'Panel Report'],
  ],
  ['I9', 'Council Directive 93/13/EEC, art. 3, 1993 O.J. (L 95) 29.', 'law', ['EEC', 'EC']],
  ['I10', 'AIR 1973 SC 1461.', 'law', ['SC', 'SCC']],
];
const claimOf = kind =>
  kind === 'record' ? 'The motion was filed late.' : 'The rule applies here.';

// Ordinary prose: the verifier's 80 sentences and more of the same kinds.
const PROSE = [
  'The Yankees beat the Red Sox 5-3 on Sunday, and the Knicks won 102-98 in overtime.',
  'Send the package to 1600 Pennsylvania Ave. NW, Washington, DC 20500, by Friday.',
  'Our office moved to Suite 400, 123 Main St., Apt. 4B, Springfield, IL 62704.',
  'She bought a Canon EOS R5 and a Sony A7 IV, plus an iPhone 15 Pro Max.',
  'The Boeing 737 MAX 8 and the Airbus A320neo seat about 180 passengers.',
  'John 3:16 is quoted often, as are Gen. 1:1 and 1 Cor. 13:4-7.',
  'The sermon drew on Ps. 23:1-4 and Matt. 5:9 to make its point.',
  'Upgrade to Node v20.11.1 and Python 3.12.1 before release 4.2.0-rc.1 ships.',
  'The patch fixes CVE-2024-3094 in xz 5.6.1 on Ubuntu 24.04 LTS.',
  'The sample held 6.022 × 10^23 molecules, about 3.2e-5 mol/L, at pH 7.4.',
  'As Fig. 3B shows, the effect was significant (p < 0.05, n = 12) in E. coli K-12.',
  'She played Beethoven’s Symphony No. 9 in D minor, Op. 125, and Chopin’s Op. 27 No. 2.',
  'Flight UA 857 departs at 10:45 a.m. from Gate B12, Terminal 3.',
  'AAPL rose 2.3% to $189.50, and the S&P 500 closed at 4,783.45 on Jan. 5.',
  'The 101st Airborne Div. landed in Normandy on June 6, 1944, near Ste. Mère-Église.',
  'Read Vol. 2, Ch. 7, pp. 112-15 of the series before Tuesday.',
  'Call 1-800-555-0199 ext. 12 or text 555-0123 before 5 p.m.',
  'Room 214B hosts Chem. 101 and Bio. 210 on Mon. and Wed. at 9 a.m.',
  'Psalm 23:4 and Rev. 21:4 comfort the grieving.',
  'Version 2.3.1 of the API (released 2024-03-15) deprecates the v1 endpoints.',
  'The thermostat reads 72°F; set it to 68 at 11 p.m. tonight.',
  'Messi scored in the 23rd and 87th minutes as Inter Miami won 2-1, its 5th straight win.',
  'Order No. 5512 shipped via UPS Ground on Oct. 3 with tracking no. 1Z999AA10123456784.',
  'He scored 3 TDs in Super Bowl LVIII, and the Chiefs won 25-22 in OT.',
  'Take 1 tab. of Tylenol 500 mg every 6 hrs. as needed for pain.',
  'See you at 5 p.m. in Bldg. 4, Rm. 210, for the review.',
  'Avogadro’s number is 6.02 x 10^23, and c = 3.00 × 10^8 m/s.',
  'Mark 12:30-31 and Luke 10:27 repeat Deut. 6:5 almost word for word.',
  'Apollo 11 landed on July 20, 1969, and Apollo 13 never did.',
  'The laptop runs Windows 11 Pro and iOS 17.2 on the tablet.',
  'Gen. Patton’s 3rd Army crossed the Rhine in March 1945.',
  'Mt. Everest is 8,849 m tall, per the 2020 survey.',
  'Take Hwy. 101 north to Exit 432, then Rte. 66 east.',
  'Mail it to P.O. Box 123, St. Louis, MO 63101.',
  'U.K. GDP grew 0.3% in Q2, the O.N.S. said.',
  'Dr. Smith, M.D., Ph.D., saw 12 patients on Tues.',
  'Col. Mustard was in Rm. 3 with the wrench.',
  'Mozart wrote K. 525 in 1787, and Bach wrote BWV 1007 earlier.',
  'Read Rom. 8:28 and Prov. 3:5-6 before bed.',
  'Ex. 20:3 and Lev. 19:18 are often quoted.',
  'Is. 40:31 and 1 Sam. 17:45 were on the bulletin.',
  'Jn. 1:1 opens the Gospel of John.',
  'The Fed. raised rates by 0.25 pts. in Dec. 2023.',
  'Sgt. Pepper (1967) sold 32 million copies.',
  'The Model 3 and Model Y outsold the F-150 in Q3 2023.',
  'He bought 2 lbs. of beef and 3 oz. of cheese.',
  'Use a No. 2 pencil on Form A, Pt. 3.',
  'The Rev. Martin Luther King Jr. spoke on Aug. 28, 1963.',
  'Rev. 2 of the spec fixed Fig. 4 and Eq. 7.',
  'See Tbl. 2 and Fig. 3B for the p-values.',
  'The H.M.S. Victory was launched in 1765.',
  'Inc. 5000 ranked the startup No. 12 in 2022.',
  'My flight is AA 100 from JFK to LAX at 9 a.m.',
  'NASA’s JWST saw galaxy GN-z11 at z = 10.6.',
  'The vote was 52-48 in the Sen. and 220-212 in the House.',
  'Pres. Lincoln gave the address on Nov. 19, 1863.',
  'He ran the 100 m in 9.58 sec. at the 2009 Worlds.',
  'Vol. 3, No. 2 of the newsletter came out in Feb.',
  'The ISO 9001 audit and SOC 2 Type II report are due.',
  'Our Q3 OKRs target 15% growth and NPS 60.',
  'Blood pressure was 120/80 mm Hg, and HbA1c was 5.4%.',
  'The USB-C port supports PD 3.1 at 240 W.',
  'Hurricane Katrina (Cat. 5) struck on Aug. 29, 2005.',
  'Lt. Gov. Smith met Sen. Brown in Rm. 214 at 3 p.m.',
  'Beethoven’s Op. 131 and Schubert’s D. 956 were played.',
  'The Ford Model T sold 15 million units by 1927.',
  'Ch. 4 and App. B of the manual cover setup.',
  'The meeting is in Bldg. 7, Fl. 3, Ste. 300.',
  'His GPA was 3.9, and his SAT was 1520.',
  'COVID-19 cases fell 12% in Wk. 34.',
  'The Boeing 787-9 and A350-1000 fly the route.',
  'Mark 4:39 says the wind ceased.',
  'Section 3 of the syllabus lists 12 readings for Wk. 2.',
  'Gate C17 at Terminal 2 opens at 6 a.m.',
  'The 2024 Toyota RAV4 XLE gets 30 mpg.',
  'PS5 and Xbox Series X sales hit 50 M units.',
  'He holds U.S. Pat. Pending status for the gadget.',
  // More of the same kinds: models, flights, music, scripture, courses, addresses.
  'We took a Boeing 777 ER 200 to Tokyo, then flew Delta DL 275 at 4 p.m.',
  'She sang Bach’s BWV 147 No. 10 and Handel’s HWV 56 No. 44 at the concert.',
  'Haydn’s Op. 76 No. 3 and Brahms’s Op. 98 close the season.',
  'Phys. 201 and Math. 151 meet in Hall C at 10 a.m.',
  'Read Ch. 3 and App. C before the exam, then Ch. 9.',
  'Joshua 1:9 and Isaiah 41:10 are on the card.',
  'Gal. 5:22 and Eph. 4:32 were read at the service.',
  'The Lumix S5 II and Nikon Z 6 III are on sale for $1,999.',
  'He drives a 2019 BMW X5 M50i with 42,000 miles on it.',
  'The Pixel 8 Pro and Galaxy S24 Ultra ship with Android 14.',
  'The kit uses an ESP32 S3 board and a BME 280 sensor.',
  'Route 66 runs 2,448 miles from Chicago to Santa Monica.',
  'Our team won Game 7 at 9 p.m., 4-3 in OT.',
  'Unit 12B at 45 Elm St., Ste. 200, is ours from Mon. to Fri.',
  'Take Exit 12 off I-95, then turn left on Rte. 1 at the light.',
  'The 3M N95 masks and Model 8210 filters arrived on Mar. 2.',
  'Revision 3 of Fig. 7 and Table 2 is due Thursday.',
  'Lot 14, Block C, was sold in 1998 for $45,000.',
  'Their NPS was 72 in Q1 and 68 in Q2.',
  'Bring Form W-9 and Form 1099 to Rm. 4 by noon.',
];

// Sentences the splitter still breaks after an initialism before a capitalized word, which
// may as well start a sentence ("…in the U.K. GDP grew"): the parts are prose all the same.
const SPLITS = new Set([
  'U.K. GDP grew 0.3% in Q2, the O.N.S. said.',
  'The H.M.S. Victory was launched in 1765.',
  'He holds U.S. Pat. Pending status for the gadget.',
]);

test('W9: ordinary prose is never read as a citation, refused, cut or flagged', () => {
  for (const text of PROSE) {
    assert.deepEqual(cites(text), [], text);
    assert.deepEqual(citationRuns(text), [], text);
    if (!SPLITS.has(text)) assert.deepEqual(S(text), [text], text);
    assert.equal(combineRefusal(text, 'That was all.'), null, text);
    assert.equal(guardReplacement(text, text, `Notably, ${text}`), null, text);
    assert.equal(selectionRefusal('', text, '', false), null, text);
    for (const space of text.matchAll(/\s/g)) {
      const before = text.slice(0, space.index + 1);
      // "Ex. " may as well open an exhibit's citation as Exodus: autocomplete waits.
      if (before !== 'Ex. ') assert.equal(citationContext(before), null, before);
    }
    // Autocomplete may write the rest of the sentence when the document has its numbers.
    const words = text.split(' ');
    const k = Math.max(2, Math.floor(words.length / 3));
    const before = `${text}\n${words.slice(0, k).join(' ')}`;
    const rest = ` ${words.slice(k).join(' ')}`;
    assert.equal(complete(before, rest).text, rest, text);
    // Told as a client's fact, it rests on nothing and lists no authority.
    const blocks = doc([
      ['h2', 'Background'],
      ['p', text],
    ]);
    const reading = analyzeLegal(blocks, [HEAD, ...blocks[1].sentences.map(() => FACT)]);
    assert.deepEqual(reading.authorities, [], text);
    assert.ok(
      reading.sentences.every(sentence => sentence.support !== 'record'),
      text,
    );
  }
  // The words that count only beside a source word name none themselves.
  assert.deepEqual(
    ['Chem.', 'Op.', 'Ch.', 'Rev.', 'W.', 'Bio.', 'R.A.P.', 'Bankr.', 'Def.’s', '¶'].map(
      citationSourceWord,
    ),
    [false, false, false, false, false, false, true, true, true, true],
  );
});

test('M4: a paragraph that opens with "See " is not yet a citation', () => {
  assert.equal(citationContext('See '), null);
  assert.equal(citationContext('See you '), null);
  assert.equal(citationContext('Thanks.\nSee '), null);
  // After a sentence it is a signal, and a bare "See" still waits for its space.
  assert.equal(citationContext('The rule applies. See '), 'inside-citation');
  assert.equal(citationContext('See'), 'inside-citation');
  // Only prose may follow it: a name or a number there begins a citation.
  const memo = 'Lakeside Resort Enters., LP v. Bd. of Supervisors, 455 F.3d 154 (3d Cir. 2006).';
  assert.equal(cutAtCitation('See ', 'you at 5 p.m.', memo), 'you at 5 p.m.');
  assert.equal(cutAtCitation('See ', 'Lakeside, 455 F.3d at 159.', memo), '');
  assert.equal(complete('See', ' you at the review.').text, ' you at the review.');
});

test('W1: each claim and its citation are one sentence, the citation read whole', () => {
  for (const [id, cite, kind] of FORMS) {
    const claim = claimOf(kind);
    const text = `${claim} ${cite}`;
    assert.deepEqual(S(text), [text], id);
    // Every letter and number of the citation is inside a citation.
    const found = findCitations(text).filter(item => !item.nested);
    for (let at = claim.length + 1; at < text.length; at++)
      if (/[A-Za-z0-9]/.test(text[at]))
        assert.ok(
          found.some(item => item.start <= at && at < item.end),
          `${id}: ${text.slice(at, at + 12)}`,
        );
    // The claim rests on it: a fact on the record, a rule on its authority, with no
    // attention needed for the split.
    const reading = analyzeLegal(
      doc([
        ['h2', kind === 'record' ? 'Statement of Facts' : 'Argument'],
        ['p', text],
      ]),
      [HEAD, kind === 'record' ? FACT : RULE],
    );
    assert.equal(reading.sentences.length, 2, id);
    assert.ok(
      (kind === 'record' ? ['record'] : ['direct', 'cited', 'incomplete']).includes(
        reading.sentences[1].support,
      ),
      `${id}: ${reading.sentences[1].support}`,
    );
  }
  // The verifier's repro.
  assert.deepEqual(
    S(
      'The rule applies here. Case C-131/12, Google Spain SL v. AEPD, ECLI:EU:C:2014:317, ¶ 94 (May 13, 2014).',
    ).length,
    1,
  );
  // A short international brief needs attention nowhere.
  const brief = [
    ['h2', 'Argument'],
    [
      'p',
      `Data subjects may object. ${FORMS.find(f => f[0] === 'I1')[1]} Processing needs a basis. ${FORMS.find(f => f[0] === 'I2')[1]} Force is barred. ${FORMS.find(f => f[0] === 'I3')[1]} Treaties are read in good faith. ${FORMS.find(f => f[0] === 'I4')[1]}`,
    ],
  ];
  const reading = analyzeLegal(doc(brief), [HEAD, RULE, RULE, RULE, RULE]);
  assert.equal(reading.attentionCount, 0);
});

test('S1–S3: no letter of a citation changes in a rewrite, a selection, a merge, a draft or a completion', () => {
  for (const [id, cite, kind, [from, to]] of FORMS) {
    const claim = claimOf(kind);
    const text = `${claim} ${cite}`;
    const changed = cite.replace(from, to);
    assert.notEqual(changed, cite, id);
    // A rewrite that changes only letters inside the citation.
    assert.notEqual(guardReplacement(text, text, `${claim} ${changed}`), null, id);
    // One that rewords only the claim passes.
    assert.equal(
      guardReplacement(text, text, `In short, ${claim.toLowerCase()} ${cite}`),
      null,
      id,
    );
    // A selection of part of the citation, but not of the claim alone.
    const at = text.indexOf(from, claim.length);
    assert.notEqual(
      selectionRefusal(text.slice(0, at), from, text.slice(at + from.length), true),
      null,
      id,
    );
    assert.equal(selectionRefusal('', claim, ` ${cite}`, true), null, id);
    assert.notEqual(combineRefusal(text, 'The court agreed.'), null, id);
    // A drafted paragraph or an insertion with the letters changed, though the document has
    // its numbers.
    assert.notEqual(guardDraft(text, `The point holds again. ${changed}`), null, id);
    assert.notEqual(guardInsertion(text, ` ${changed}`), null, id);
    // Autocomplete keeps no part of it.
    const before = `${text} The point holds again`;
    assert.equal(complete(before, `. ${changed}`).text.replace(/^[.\s]+/, ''), '', id);
    assert.equal(complete(claim.slice(0, -1), `. ${cite}`).text.replace(/^[.\s]+/, ''), '', id);
  }
  // The report's repros.
  const brief =
    'The rule applies here. Brief for Petitioner at 12, Smith v. Jones, No. 22-123 (U.S. filed Nov. 1, 2022).';
  assert.notEqual(guardReplacement(brief, brief, brief.replace('Petitioner', 'Respondent')), null);
  assert.notEqual(
    guardDraft(
      'The rule applies here. TMEP § 1207.01 (Nov. 2023).',
      'Again. MPEP § 1207.01 (Nov. 2023).',
    ),
    null,
  );
  const before = 'The motion was filed late. ROA.1234. The point holds again';
  assert.equal(complete(before, '. SOA.1234.').text.replace(/^[.\s]+/, ''), '');
});

test('S2–S3: a number the document has only in a citation is written only as that citation', () => {
  const record = 'The motion was filed late. Pet. App. 12a.';
  assert.equal(guardDraft(record, 'It was late again. Xet. App. 12a.'), 'new-citation');
  assert.equal(guardDraft(record, 'It was late again. Pet. App. 12a.'), null);
  const jury =
    'The rule applies here. Ninth Circuit Manual of Model Criminal Jury Instructions No. 4.1 (2022).';
  assert.equal(
    guardDraft(
      jury,
      'Again. Ninth Circuit Manual of Model Civil Jury Instructions No. 4.1 (2022).',
    ),
    'new-citation',
  );
  // A sentence that shares no word with the citation is prose: "1 Cor. 13" is no "c T-13".
  const article = 'A Canadian claim would run under the Trademarks Act, RSC 1985, c T-13, s 19.';
  assert.equal(
    cutAtCitation('At the wedding, the pastor', ' read from 1 Cor. 13 and wept.', article),
    ' read from 1 Cor. 13 and wept.',
  );
  assert.equal(guardInsertion(article, ' She read Cor. 13 aloud.'), null);
});

test('S4: autocomplete keeps no title or name of a citation it cuts', () => {
  for (const id of ['B1', 'B2', 'B3', 'C5', 'C9', 'F4', 'G3', 'H2', 'I2', 'I3', 'I8', 'I9']) {
    const [, cite, kind] = FORMS.find(form => form[0] === id);
    const claim = claimOf(kind).slice(0, -1);
    assert.equal(complete(claim, `. ${cite}`).text.replace(/^[.\s]+/, ''), '', id);
  }
  // A sentence the insertion begins goes with the citation that ends it; prose before a
  // citation in a sentence the paragraph began stays.
  assert.equal(
    cutAtCitation(
      'The rule applies here',
      '. Appellate Body Report, United States—Import Prohibition of Certain Shrimp, ¶ 129, WT/DS58/AB/R (Oct. 12, 1998).',
    ),
    '.',
  );
  assert.equal(
    cutAtCitation('The rule applies', ' here, see Smith v. Jones, 1 F.3d 2, 5 (2d Cir. 1990).'),
    ' here',
  );
});

test('W6: a ¶ pin after an agency’s reporter is the case’s pin', () => {
  for (const [cite, name, pin] of [
    [
      'Smith v. Dep’t of the Army, 120 M.S.P.R. 1, ¶ 5 (2013).',
      'Smith v. Dep’t of the Army',
      '¶ 5',
    ],
    [
      'In re Restoring Internet Freedom, 33 FCC Rcd 311, ¶ 20 (2018).',
      'In re Restoring Internet Freedom',
      '¶ 20',
    ],
  ]) {
    const found = findCitations(cite);
    assert.deepEqual(
      found.map(item => [item.type, item.name, item.pin]),
      [['full', name, pin]],
      cite,
    );
    const reading = analyzeLegal(doc([['p', `The rule applies here. ${cite}`]]), [RULE]);
    assert.equal(reading.authorities.length, 1, cite);
    assert.deepEqual(reading.authorities[0].warnings, [], cite);
    assert.equal(reading.sentences[0].support, 'direct', cite);
  }
});

test('W7: a Supreme Court slip opinion keeps its pin, and two unpaged cases stay two', () => {
  const text =
    'Agencies get no deference. Loper Bright Enters. v. Raimondo, 603 U.S. ___, ___ (2024) (slip op., at 35). The major-questions rule applies. West Virginia v. EPA, 597 U.S. ___, ___ (2022) (slip op., at 20). Standing needs injury. Doe v. Roe, 603 U.S. ___ (2024).';
  assert.equal(S(text).length, 3);
  const found = findCitations(text);
  assert.deepEqual(
    found.map(item => [item.type, item.page, item.pin, item.parentheticals]),
    [
      ['full', '___', 'slip op., at 35', []],
      ['full', '___', 'slip op., at 20', []],
      ['full', '___', null, []],
    ],
  );
  const reading = analyzeLegal(doc([['p', text]]), null);
  assert.deepEqual(
    reading.authorities.map(row => [row.name, row.count]),
    [
      ['Doe', 1],
      ['Loper', 1],
      ['EPA', 1],
    ],
  );
  assert.deepEqual(
    reading.sentences.map(sentence => sentence.cites.map(cite => cite.label)),
    [['Loper slip op., at 35'], ['EPA slip op., at 20'], ['Doe ___']],
  );
});

test('W2, W3, M5: the long-tail forms are read whole', () => {
  for (const [text, expected] of [
    ['ROA.1234-36.', [['record', 'ROA.1234-36']]],
    ['(VRP (Mar. 3, 2021) at 12.)', [['unparsed', 'VRP (Mar. 3, 2021) at 12']]],
    ['Hr’g Tr. 14:2–9, Mar. 3, 2023.', [['record', 'Hr’g Tr. 14:2–9, Mar. 3, 2023']]],
    [
      'Ninth Circuit Manual of Model Criminal Jury Instructions No. 4.1 (2022).',
      [['secondary', 'Ninth Circuit Manual of Model Criminal Jury Instructions No. 4.1 (2022)']],
    ],
    [
      'N.Y. Pattern Jury Instr.—Civil 2:10.',
      [['secondary', 'N.Y. Pattern Jury Instr.—Civil 2:10']],
    ],
    [
      'Doe v. Commissioner, 123 T.C.M. (CCH) 1050, 1052 (2022).',
      [['full', 'Doe v. Commissioner, 123 T.C.M. (CCH) 1050, 1052 (2022)']],
    ],
    [
      'Roe v. Commissioner, T.C. Summary Opinion 2015-10.',
      [['docket', 'Roe v. Commissioner, T.C. Summary Opinion 2015-10']],
    ],
    [
      'In re Smith, 2019 USPQ2d 12345, at *3 (T.T.A.B. 2019).',
      [['full', 'In re Smith, 2019 USPQ2d 12345, at *3 (T.T.A.B. 2019)']],
    ],
    [
      'IPR2019-01234, Paper 12 at 5 (P.T.A.B. Mar. 3, 2020).',
      [['docket-number', 'IPR2019-01234, Paper 12 at 5 (P.T.A.B. Mar. 3, 2020)']],
    ],
    [
      'In re Facebook, Inc., FTC Docket No. C-4365, at 3 (July 27, 2012) (decision and order).',
      [
        [
          'unparsed',
          'In re Facebook, Inc., FTC Docket No. C-4365, at 3 (July 27, 2012) (decision and order)',
        ],
      ],
    ],
    [
      'Navajo Nation v. Smith, No. SC-CV-12-15, slip op. at 4 (Nav. Sup. Ct. 2016).',
      [['docket', 'Navajo Nation v. Smith, No. SC-CV-12-15, slip op. at 4 (Nav. Sup. Ct. 2016)']],
    ],
    [
      'I.R.S. Chief Couns. Mem. 201830011 (July 27, 2018).',
      [['secondary', 'I.R.S. Chief Couns. Mem. 201830011 (July 27, 2018)']],
    ],
    [
      'Priv. Ltr. Rul. 202012003 (Mar. 20, 2020).',
      [['secondary', 'Priv. Ltr. Rul. 202012003 (Mar. 20, 2020)']],
    ],
    [
      'T.D. 9947, 86 Fed. Reg. 1,234 (Jan. 5, 2021).',
      [['secondary', 'T.D. 9947, 86 Fed. Reg. 1,234 (Jan. 5, 2021)']],
    ],
  ])
    assert.deepEqual(cites(`The rule applies here. ${text}`), expected, text);
  // A slip opinion's or a Board paper's page stands in for a database cite, a Tax Court
  // memorandum opinion's number for its date, a pending case's docket for both, and a
  // memorandum decision needs no pin.
  for (const cite of [
    'Jones v. Commissioner, T.C. Memo. 2020-45, at *3.',
    'IPR2019-01234, Paper 12 at 5 (P.T.A.B. Mar. 3, 2020).',
    'Smith v. Jones, No. 22-123 (U.S. argued Jan. 10, 2023).',
    'Smith v. Jones, 143 S. Ct. 1 (2023) (mem.).',
  ]) {
    const reading = analyzeLegal(doc([['p', `The rule applies here. ${cite}`]]), [RULE]);
    assert.equal(reading.sentences[0].support, 'direct', cite);
  }
});

test('W4, W5: a row is titled from its citation’s start, and its pins and short forms make no rows', () => {
  const titles = text =>
    analyzeLegal(doc([['p', text]]), null).authorities.map(row => [row.title, row.count]);
  assert.deepEqual(
    titles(
      'The rule applies. Starbucks Corp., 372 NLRB No. 50, slip op. at 3 (2023). It applies again. Id., slip op. at 4.',
    ),
    [['Starbucks Corp., 372 NLRB No. 50 (2023)', 2]],
  );
  assert.deepEqual(
    titles(
      'The rule applies. Jones v. Commissioner, T.C. Memo. 2020-45, at *3. It applies again. Jones, T.C. Memo. 2020-45, at *4.',
    ),
    [['Jones v. Commissioner, T.C. Memo. 2020-45', 2]],
  );
  for (const [full, short] of [
    [
      'Case C-131/12, Google Spain SL v. AEPD, ECLI:EU:C:2014:317, ¶ 94 (May 13, 2014).',
      'Google Spain, ECLI:EU:C:2014:317, ¶ 95.',
    ],
    [
      'Military and Paramilitary Activities in and against Nicaragua (Nicar. v. U.S.), Judgment, 1986 I.C.J. 14, ¶ 202 (June 27).',
      'Nicaragua, 1986 I.C.J. ¶ 203.',
    ],
    [
      'U.S. Patent No. 9,876,543 col. 4 ll. 5–20 (filed Jan. 2, 2015).',
      '’543 patent col. 5 ll. 1–3.',
    ],
    ['PSR ¶ 34.', 'PSR ¶ 35.'],
  ]) {
    const rowsOf = titles(`The rule applies. ${full} It applies again. ${short}`);
    assert.equal(rowsOf.length, 1, full);
    assert.equal(rowsOf[0][1], 2, full);
    assert.ok(rowsOf[0][0].startsWith(full.split(' ')[0]), rowsOf[0][0]);
  }
});

test('W8: forms read as what they are, named as they are', () => {
  const one = text => findCitations(text).filter(cite => !cite.nested);
  // A no-action letter and a filing in another case are no case.
  assert.equal(
    one('Apple Inc., SEC No-Action Letter, 2019 WL 1234567 (Dec. 1, 2019).')[0].type,
    'unparsed',
  );
  assert.equal(
    one('Tr. of Oral Arg. 12:4–9, Smith v. Jones, No. 22-123 (U.S. Jan. 10, 2023).')[0].type,
    'unparsed',
  );
  // A manual's section is the manual's, not a bare statute's.
  const tmep = one('TMEP § 1207.01 (Nov. 2023).')[0];
  const mpep = one('MPEP § 1207.01 (Nov. 2023).')[0];
  assert.equal(tmep.type, 'statute');
  assert.notEqual(citationKey(tmep), citationKey(mpep));
  // The number of a ruling is whole, and an arbitration award with its parties is one.
  assert.equal(
    one('Priv. Ltr. Rul. 202012003 (Mar. 20, 2020).')[0].title,
    'Priv. Ltr. Rul. 202012003',
  );
  assert.deepEqual(
    one('Smith v. Jones, AAA Case No. 01-19-0001-2345 (2020) (Roe, Arb.).').map(cite => cite.type),
    ['unparsed'],
  );
  const named = text =>
    analyzeLegal(doc([['p', `The rule applies. ${text}`]]), null).authorities.map(row => row.name);
  assert.deepEqual(named('Matter of A-B-, 27 I&N Dec. 316, 320 (A.G. 2018).'), ['A-B-']);
  assert.deepEqual(named('Mabo v Queensland (No 2) (1992) 175 CLR 1, 42.'), ['Mabo']);
  assert.deepEqual(named('Acme Corp., 123 Lab. Arb. Rep. (BNA) 456, 460 (2008) (Brown, Arb.).'), [
    'Acme',
  ]);
});

test('a statute takes in the name that leads into it, keyed as before', () => {
  const [act] = findCitations(
    'Fraud is barred. Securities Exchange Act of 1934, 15 U.S.C. § 78j(b).',
  );
  assert.equal(act.text, 'Securities Exchange Act of 1934, 15 U.S.C. § 78j(b)');
  assert.equal(act.body, '15 U.S.C. § 78j(b)');
  assert.equal(citationKey(act), citationKey(findCitations('15 U.S.C. § 78j(b)')[0]));
  // A rewrite keeps the name; one of the claim alone passes.
  const text = 'Fraud is barred. See Securities Exchange Act of 1934, 15 U.S.C. § 78j(b).';
  assert.notEqual(guardReplacement(text, text, text.replace('Securities', 'Commodity')), null);
  assert.equal(
    guardReplacement(text, text, text.replace('Fraud is barred.', 'Fraud is forbidden.')),
    null,
  );
  // Sentence words and a case's short form are no lead.
  assert.deepEqual(cites('Separately, § 4.3 allows a refund.'), [['section', '§ 4.3']]);
  assert.deepEqual(cites('Rule six. Smith, 1 F.3d 2.'), [['full', '1 F.3d 2']]);
  assert.deepEqual(cites('In Joint Stip. ¶ 4, they agreed.'), [['unparsed', 'Joint Stip. ¶ 4']]);
});

test('M2: bankruptcy courts, the Tax Court and the military appeals court have levels', () => {
  const level = text =>
    analyzeLegal(doc([['p', `The rule applies. ${text}`]]), null).authorities[0].level;
  assert.equal(level('In re Smith, 600 B.R. 123, 130 (Bankr. S.D.N.Y. 2019).'), 'district');
  assert.equal(level('Smith v. Commissioner, 150 T.C. 1, 5 (2018).'), 'district');
  assert.equal(level('Jones v. Commissioner, T.C. Memo. 2020-45, at *3.'), 'district');
  assert.equal(level('United States v. Smith, 79 M.J. 1, 5 (C.A.A.F. 2019).'), 'circuit');
});

test('quoteSpans: a straight quotation that opens with a stray space before an alteration', () => {
  const text =
    'Similarly, we noted in Hovsons that, " [t]o the handicapped elderly persons who would reside there, [the nursing facility] would be their home, very often for the rest of their lives." Lakeside, 455 F.3d at 159.';
  assert.deepEqual(
    quoteSpans(text).map(([start, end]) => text.slice(start, end)),
    [text.slice(text.indexOf('"'), text.indexOf('lives."') + 7)],
  );
  // A quotation mark alone between spaces is still no quotation.
  assert.deepEqual(quoteSpans('a " b'), []);
});

test('the analysis stays fast on long runs of citations in forms the parser does not know', () => {
  // Each one is compared with those before it for the short forms that repeat one.
  for (const unit of [
    '¶ 1 (',
    '2 RR 45, ',
    'Abc, 1986 I.C.J. ¶ 1, ',
    'ECLI:EU:C:2014:317, ¶ 1; ',
  ]) {
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const text = `${unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000)} ${k}`;
      const blocks = [
        { index: 0, kind: 'p', text, sentences: [{ start: 0, end: text.length, text }] },
      ];
      const at = performance.now();
      analyzeLegal(blocks, null);
      best = Math.min(best, performance.now() - at);
    }
    assert.ok(best < 150, `${unit}: ${best} ms`);
  }
});

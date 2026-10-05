// Legal-aware sentences and citations, on top of Intl.Segmenter. Zero dependencies.
// doc-model.js splits every block with legalSentences, so all views, operations and the
// Claude prompts see the same sentences.

// ---------------------------------------------------------------------------
// Abbreviation data
// ---------------------------------------------------------------------------

// Never end a sentence: a break after one of these is always joined.
export const ALWAYS_JOIN = [
  'v.',
  'vs.',
  'e.g.',
  'E.g.',
  'i.e.',
  'I.e.',
  'cf.',
  'Cf.',
  'viz.',
  'rel.', // ex rel.
  'Mr.',
  'Mrs.',
  'Ms.',
  'Messrs.',
  'Mmes.',
  'Dr.',
  'Drs.',
  'Prof.',
  'Profs.',
  'Hon.',
  'Msgr.',
  'Sen.',
  'Gov.',
  'Lt.',
  'Sgt.',
  'Capt.',
  'Cpl.',
  'Pvt.',
  'Cmdr.',
  'Supt.',
  'Gen.',
  'Col.',
  'Maj.',
  'Adm.',
  '&c.',
];

// Abbreviations that join only when the next word could not start a sentence
// (St. Louis vs. Main St.). They join unless a capitalized name comes right before.
export const PREFIX_UNLESS_AFTER_NAME = ['St.', 'Mt.', 'Ft.'];

// Ambiguous: may end a sentence ("... under 42 U.S.C." / "... sued Acme Inc."), so a
// break after one is joined only when the next segment continues it (see continues()).
export const ABBREVIATIONS = [
  // Case-name words (Bluebook T6; LII Basic Legal Citation 4-100), with plurals
  'Acad.',
  'Acct.',
  'Admin.',
  'Advert.',
  'Agric.',
  'All.',
  'Alt.',
  'Am.',
  'Arb.',
  'Assoc.',
  'Atl.',
  'Auth.',
  'Auto.',
  'Ave.',
  'Bankr.',
  'Bd.',
  'Broad.',
  'Bhd.',
  'Bros.',
  'Bldg.',
  'Bus.',
  'Cap.',
  'Cas.',
  'Cath.',
  'Ctr.',
  'Cent.',
  'Chem.',
  'Child.',
  'Coal.',
  'Coll.',
  'Com.',
  'Comm.',
  'Cmty.',
  'Co.',
  'Cos.',
  'Comp.',
  'Comput.',
  'Condo.',
  'Cong.',
  'Consol.',
  'Constr.',
  'Cont.',
  'Coop.',
  'Corp.',
  'Corr.',
  'Cnty.',
  'Def.',
  'Det.',
  'Dev.',
  'Dig.',
  'Dir.',
  'Distrib.',
  'Dist.',
  'Div.',
  'Econ.',
  'Educ.',
  'Elec.',
  'Emp.',
  'Enter.',
  'Enters.',
  'Equal.',
  'Equip.',
  'Est.',
  'Exch.',
  'Exec.',
  'Expl.',
  'Exp.',
  'Fed.',
  'Fid.',
  'Fin.',
  'Found.',
  'Glob.',
  'Grp.',
  'Guar.',
  'Hosp.',
  'Hosps.',
  'Hous.',
  'Hum.',
  'Immigr.',
  'Imp.',
  'Inc.',
  'Indem.',
  'Indep.',
  'Indus.',
  'Info.',
  'Inj.',
  'Inst.',
  'Ins.',
  'Int.',
  'Inv.',
  'Just.',
  'Lab.',
  'Liab.',
  'Ltd.',
  'Litig.',
  'Mach.',
  'Maint.',
  'Mgmt.',
  'Mfr.',
  'Mfrs.',
  'Mfg.',
  'Mar.',
  'Mkt.',
  'Mktg.',
  'Mech.',
  'Med.',
  'Merch.',
  'Metro.',
  'Mortg.',
  'Mun.',
  'Mut.',
  'Nat.',
  'Ne.',
  'Nw.',
  'No.',
  'Nos.',
  'Off.',
  'Op.',
  'Ord.',
  'Org.',
  'Pac.',
  'Par.',
  'Pers.',
  'Pharm.',
  'Pol.',
  'Prac.',
  'Pres.',
  'Prob.',
  'Prod.',
  'Prop.',
  'Prot.',
  'Pub.',
  'Ry.',
  'Rec.',
  'Ref.',
  'Reg.',
  'Regul.',
  'Rehab.',
  'Rel.',
  'Reprod.',
  'Rsch.',
  'Res.',
  'Rest.',
  'Ret.',
  'Rts.',
  'Rd.',
  'Sav.',
  'Sch.',
  'Sci.',
  'Sec.',
  'Serv.',
  'Servs.',
  'Soc.',
  'Sol.',
  'Se.',
  'Sw.',
  'Subcomm.',
  'Sur.',
  'Sys.',
  'Tchr.',
  'Tech.',
  'Telecomm.',
  'Tel.',
  'Temp.',
  'Twp.',
  'Transcon.',
  'Transp.',
  'Tr.',
  'Unif.',
  'Univ.',
  'Urb.',
  'Util.',
  'Vill.',
  'Jr.',
  'Sr.',
  'Assocs.',
  'Ests.',
  // States and places (Bluebook T10; LII 4-500)
  'Ala.',
  'Ariz.',
  'Ark.',
  'Cal.',
  'Colo.',
  'Conn.',
  'Del.',
  'Fla.',
  'Ga.',
  'Haw.',
  'Ill.',
  'Ind.',
  'Kan.',
  'Ky.',
  'La.',
  'Me.',
  'Md.',
  'Mass.',
  'Mich.',
  'Minn.',
  'Miss.',
  'Mo.',
  'Mont.',
  'Neb.',
  'Nev.',
  'Okla.',
  'Or.',
  'Pa.',
  'Tenn.',
  'Tex.',
  'Vt.',
  'Va.',
  'Wash.',
  'Wis.',
  'Wyo.',
  'Phila.',
  'Pitt.',
  'Balt.',
  'Cin.',
  'Chi.',
  // Courts (Bluebook T7; courts-db citation strings)
  'Cir.',
  'Ct.',
  'Cts.',
  'App.',
  'Super.',
  'Sup.',
  'Cl.',
  'Ch.',
  'Crim.',
  'Civ.',
  'Fam.',
  'Juv.',
  'Surr.',
  'Commw.',
  'Mil.',
  'Vet.',
  'Jud.',
  'Multidist.',
  'Lit.',
  // Reporters (Bluebook T1; reporters-db edition words)
  'F.',
  'Supp.',
  'Ed.',
  'So.',
  'Rptr.',
  'Misc.',
  'Rep.',
  'Dec.',
  'Wheat.',
  'Pet.',
  'How.',
  'Wall.',
  'Dall.',
  'Cranch.',
  'Abb.',
  'Unrep.',
  'Cust.',
  'Pat.',
  // Statutes, rules, legislative and record material
  'Stat.',
  'Ann.',
  'Const.',
  'Rev.',
  'Regs.',
  'Cons.',
  'Laws.',
  'Sess.',
  'Doc.',
  'Rept.',
  'Proc.',
  'Evid.',
  'Treas.',
  'Rul.',
  'R.',
  'P.',
  'L.',
  'J.',
  'Q.',
  'Amend.',
  'Art.',
  'Pt.',
  'Tit.',
  'Vol.',
  'Bk.',
  'Ex.',
  'Exh.',
  'Exs.',
  'Pl.',
  'Pls.',
  'Defs.',
  'Mot.',
  'Mem.',
  'Br.',
  'Compl.',
  'Aff.',
  'Decl.',
  'Dep.',
  'Resp.',
  'Summ.',
  'Dkt.',
  // Discovery, briefs and bills: "Resp. to Interrog. No. 3", "Assem. Bill No. 5"
  'Interrog.',
  'Interrogs.',
  'Req.',
  'Reqs.',
  'Admis.',
  'Ans.',
  'Countercl.',
  'Assem.',
  'Stats.',
  'Prelim.',
  'Ltr.',
  'art.',
  'arts.',
  'amend.',
  'cl.',
  'ch.',
  'chs.',
  'pt.',
  'pts.',
  'tit.',
  'sec.',
  'secs.',
  'subch.',
  'subsec.',
  'subd.',
  'subdiv.',
  'para.',
  'paras.',
  'vol.',
  'ed.',
  'eds.',
  'n.',
  'nn.',
  'p.',
  'pp.',
  'pg.',
  'fn.',
  'fns.',
  // California's opinions: "conc. opn. of Kennard, J.", "dis. opn."
  'opn.',
  'conc.',
  'dis.',
  // Commonwealth sections, rules, regulations and schedules: "s. 348", "r. 3.4"
  's.',
  'ss.',
  'r.',
  'rr.',
  'reg.',
  'regs.',
  'sch.',
  'cert.',
  'op.',
  'cit.',
  'loc.',
  // Latin and general
  'id.',
  'Id.',
  'ibid.',
  'Ibid.',
  'al.',
  'seq.',
  'seqq.',
  'etc.',
  'approx.',
  'ca.',
  'c.',
  'a.m.',
  'p.m.',
  'U.S.',
  'Jan.',
  'Feb.',
  'Apr.',
  'Jun.',
  'Jul.',
  'Aug.',
  'Sep.',
  'Sept.',
  'Oct.',
  'Nov.',
  'Assn.',
  'Dept.',
  'Govt.',
  'Natl.',
  'Intl.',
  // Found missing on the Savelka et al. gold set
  'cmt.',
  'cmts.',
  'illus.',
  'Arg.',
  'Bl.',
  'Amer.',
  'Journ.',
  'Cert.',
  'Pp.',
  'Opp.',
  'Elecs.',
  'Comms.',
  'Reh.',
  'Globe.',
  'Conf.',
  'div.',
  'app.',
  'l.',
  'll.',
  'col.',
  'cols.',
  'cc.',
];

// Contractions that stand for words in case names (T6). They carry no period
// but tell us the next segment is still a name.
export const CONTRACTIONS = [
  "Adm'r",
  "Adm'x",
  "Ass'n",
  "Att'y",
  "Comm'n",
  "Comm'r",
  "Commc'n",
  "Cont'l",
  "Dep't",
  "Emp'r",
  "Emp't",
  "Enf't",
  "Eng'r",
  "Eng'g",
  "Entm't",
  "Env't",
  "Exam'r",
  "Ex'r",
  "Fed'n",
  "Gov't",
  "Int'l",
  "Mem'l",
  "Nat'l",
  "P'ship",
  "Prof'l",
  "Publ'n",
  "Publ'g",
  "Reg'l",
  "S'holder",
  "Sec'y",
  "Soc'y",
  "Tax'n",
  "App'x",
  "Opp'n",
  "Hr'g",
  "Pol'y",
];

// Words that make an entity name end: "Acme Corp. Smith v. Jones" breaks after Corp.
export const ENTITY_SUFFIXES = [
  'Inc.',
  'Corp.',
  'Co.',
  'Cos.',
  'Ltd.',
  'Bros.',
  'Jr.',
  'Sr.',
  'Assocs.',
  'L.P.',
  'L.L.C.',
  'L.L.P.',
  'P.C.',
  'P.A.',
  'N.A.',
  'S.A.',
  'P.L.L.C.',
];

// A capital letter after these words is a label ("Exhibit A."), not an initial.
export const LABEL_WORDS = [
  'exhibit',
  'exh.',
  'ex.',
  'appendix',
  'app.',
  'schedule',
  'annex',
  'attachment',
  'part',
  'article',
  'section',
  'plan',
  'class',
  'form',
  'tab',
  'rule',
  'phase',
  'group',
  'type',
  'count',
  'option',
  'choice',
  'grade',
  'step',
  'item',
  'category',
  'level',
  'tier',
  'unit',
  'zone',
  'lot',
  'parcel',
  'tract',
  'figure',
  'fig.',
  'table',
  'model',
  'series',
  'track',
  'division',
  'subpart',
  'clause',
  'question',
  'answer',
  'box',
  'line',
  'room',
  'suite',
  'apartment',
  'building',
  'vitamin',
  'title',
  'chapter',
  'volume',
  'book',
  'a',
  'an',
];

// Abbreviations that start sentences. A segment starting with one is not a continuation.
export const SENTENCE_STARTERS = [
  'Id.',
  'Ibid.',
  'Mr.',
  'Mrs.',
  'Ms.',
  'Messrs.',
  'Dr.',
  'Prof.',
  'Hon.',
  'Cf.',
  'E.g.',
  'I.e.',
  'Gov.',
];

// Words that only occur inside citations, so a segment starting with one continues it.
export const CITATION_WORDS = [
  'Code',
  'Codes',
  'Laws',
  'LEXIS',
  'WL',
  'Stat',
  'Supp',
  'Globe',
  'Dismiss',
  'Compel',
  'Strike',
];

// Nouns a place abbreviation modifies: "the U.S. | Supreme Court", "the D.C. | Circuit".
export const PLACE_NOUNS = [
  'Supreme',
  'District',
  'Court',
  'Courts',
  'Circuit',
  'Attorney',
  'Attorneys',
  'Department',
  'Government',
  'Congress',
  'Senate',
  'House',
  'Army',
  'Navy',
  'Marshal',
  'Marshals',
  'Trustee',
  'Bankruptcy',
  'Magistrate',
  'Postal',
  'Constitution',
  'Statutes',
  'Legislature',
  'Assembly',
  'Bar',
  'Board',
  'Commission',
  'Agency',
  'Treasury',
  'Customs',
  'Census',
  'Embassy',
  'Citizenship',
  'Immigration',
  'Patent',
  'Copyright',
  'Sentencing',
  'Secretary',
  'Office',
  'Supreme',
  'Appellate',
  'Superior',
  'Commonwealth',
  'Rules',
  'Rule',
  'Reports',
  'Reporter',
  'Midwest',
  'Northeast',
  'Northwest',
  'Southeast',
  'Southwest',
  'Virgin',
  'Open',
  'Air',
  'Marine',
  'Coast',
  'Forest',
  'Mint',
  'Military',
  'Geological',
  'Olympic',
];

// Division words before a roman numeral: "U.S. Const. art. III, § 2".
const DIVISIONS = new Set([
  'art.',
  'Art.',
  'arts.',
  'amend.',
  'Amend.',
  'pt.',
  'Pt.',
  'tit.',
  'Tit.',
  'ch.',
  'Ch.',
  'vol.',
  'Vol.',
  'Bk.',
  'cl.',
  'Cl.',
  'Title',
  'Part',
  'app.',
  'App.',
  'Ex.',
  'Exh.',
  'Exs.',
  'cc.',
  'div.',
]);

const always = new Set(ALWAYS_JOIN);
const plural = list => list.filter(a => /^[A-Z][a-z]+\.$/.test(a)).map(a => a.slice(0, -1) + 's.');
const prefixUnlessName = new Set(PREFIX_UNLESS_AFTER_NAME);
const abbreviations = new Set([
  ...ABBREVIATIONS,
  ...plural(ABBREVIATIONS),
  ...ALWAYS_JOIN,
  ...PREFIX_UNLESS_AFTER_NAME,
]);
const contractions = new Set(
  CONTRACTIONS.flatMap(c => [c, c + 's', c.replace("'", '’'), c.replace("'", '’') + 's']),
);
const entitySuffixes = new Set(ENTITY_SUFFIXES);
const labelWords = new Set(LABEL_WORDS);
const starters = new Set(SENTENCE_STARTERS);
const citationWords = new Set(CITATION_WORDS);
const placeNouns = new Set(PLACE_NOUNS);
const COURT_WORDS = new Set(['Cir.', 'Dist.', 'Ct.', 'App.', 'Super.', 'Sup.', 'Bankr.', 'Fed.']);
const STATES = new Set([
  'Ala.',
  'Ariz.',
  'Ark.',
  'Cal.',
  'Colo.',
  'Conn.',
  'Del.',
  'Fla.',
  'Ga.',
  'Haw.',
  'Ill.',
  'Ind.',
  'Kan.',
  'Ky.',
  'La.',
  'Me.',
  'Md.',
  'Mass.',
  'Mich.',
  'Minn.',
  'Miss.',
  'Mo.',
  'Mont.',
  'Neb.',
  'Nev.',
  'Okla.',
  'Or.',
  'Pa.',
  'Tenn.',
  'Tex.',
  'Vt.',
  'Va.',
  'Wash.',
  'Wis.',
  'Wyo.',
]);

const INITIAL = /^[A-Z]\.$/; // J. / F. / S.
const INITIALISM = /^(?:[A-Z]\.){2,}[A-Z]?$/; // U.S. / W.D. / S.D.N.Y. / U.S.C.
const COMPACT = /^(?:[A-Z][A-Za-z']{0,6}\.){2,}(?:\d[a-z]{1,2}\.?)?$/; // S.Ct. / L.Ed.2d / F.Supp.
const ROMAN = /^(?:[IVXLC]+)[,;.)]?$/;
const ENUMERATOR =
  /^(?:[IVXLC]+|[A-Z]|\d{1,3}|[a-z])[.)]$|^\((?:[IVXLCivxlc]+|[A-Za-z]|\d{1,3})\)$/;

// "MR." / "NO." in headings and captions count as Mr. / No.
const titleCase = t =>
  t.length > 2 && t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t;

export function isAbbreviation(token) {
  return (
    abbreviations.has(token) ||
    abbreviations.has(titleCase(token)) ||
    INITIALISM.test(token) ||
    INITIAL.test(token) ||
    COMPACT.test(token)
  );
}

// ---------------------------------------------------------------------------
// Reporters (Bluebook T1 / reporters-db). Compared with spaces removed, so
// "F. Supp. 2d", "F.Supp.2d" and "F. Supp.2d" are the same reporter.
// ---------------------------------------------------------------------------

export const REPORTERS = [
  'U.S.',
  'S. Ct.',
  'L. Ed.',
  'L. Ed. 2d',
  'U.S.L.W.',
  'F.',
  'F.2d',
  'F.3d',
  'F.4th',
  'F. Supp.',
  'F. Supp. 2d',
  'F. Supp. 3d',
  "F. App'x",
  'F.R.D.',
  'B.R.',
  'Fed. Cl.',
  'Ct. Cl.',
  'Cl. Ct.',
  'T.C.',
  'M.J.',
  'Vet. App.',
  "Ct. Int'l Trade",
  'F. Cas.',
  'Fed. R. Serv.',
  'Fed. R. Serv. 2d',
  'Fed. R. Serv. 3d',
  'A.',
  'A.2d',
  'A.3d',
  'P.',
  'P.2d',
  'P.3d',
  'N.E.',
  'N.E.2d',
  'N.E.3d',
  'N.W.',
  'N.W.2d',
  'N.W.3d',
  'S.E.',
  'S.E.2d',
  'S.W.',
  'S.W.2d',
  'S.W.3d',
  'So.',
  'So. 2d',
  'So. 3d',
  'Cal. Rptr.',
  'Cal. Rptr. 2d',
  'Cal. Rptr. 3d',
  'N.Y.S.',
  'N.Y.S.2d',
  'N.Y.S.3d',
  'Cal.',
  'Cal. 2d',
  'Cal. 3d',
  'Cal. 4th',
  'Cal. 5th',
  'Cal. App.',
  'Cal. App. 2d',
  'Cal. App. 3d',
  'Cal. App. 4th',
  'Cal. App. 5th',
  'N.Y.',
  'N.Y.2d',
  'N.Y.3d',
  'A.D.',
  'A.D.2d',
  'A.D.3d',
  'Misc.',
  'Misc. 2d',
  'Misc. 3d',
  'Ill.',
  'Ill. 2d',
  'Ill. App.',
  'Ill. App. 2d',
  'Ill. App. 3d',
  'Ill. Dec.',
  'Mass.',
  'Mass. App. Ct.',
  'N.J.',
  'N.J. Super.',
  'Pa.',
  'Pa. Super.',
  'Pa. Commw.',
  'Pa. D. & C.',
  'Pa. D. & C.2d',
  'Pa. D. & C.3d',
  'Pa. D. & C.4th',
  'Pa. D. & C.5th',
  'Ohio St.',
  'Ohio St. 2d',
  'Ohio St. 3d',
  'Ohio App.',
  'Ohio App. 2d',
  'Ohio App. 3d',
  'Tex.',
  'Wis. 2d',
  'Wash. 2d',
  'Wash. App.',
  'Mich.',
  'Mich. App.',
  'Minn.',
  'Conn.',
  'Conn. App.',
  'Md.',
  'Md. App.',
  'Va.',
  'Va. App.',
  'Ga.',
  'Ga. App.',
  'N.C.',
  'N.C. App.',
  'S.C.',
  'Ariz.',
  'Colo.',
  'Kan.',
  'Or.',
  'Or. App.',
  'Haw.',
  'Idaho',
  'Iowa',
  'Utah',
  'Utah 2d',
  'Neb.',
  'Nev.',
  'N.M.',
  'Mont.',
  'Wyo.',
  'Vt.',
  'Me.',
  'N.H.',
  'R.I.',
  'Del.',
  'Del. Ch.',
  'Fla.',
  'Ala.',
  'Ark.',
  'Ky.',
  'La.',
  'Miss.',
  'Mo.',
  'Okla.',
  'Tenn.',
  'W. Va.',
  'Alaska',
  'N.D.',
  'S.D.',
  'Wheat.',
  'Pet.',
  'How.',
  'Black',
  'Wall.',
  'Dall.',
  'Cranch',
  'I. & N. Dec.',
  'Bankr.',
  'Bankr. L. Rep.',
];
const squeeze = s => s.replace(/\s+/g, '').replace(/’/g, "'");
let reporterSet = new Set(REPORTERS.map(squeeze));
// The full reporters-db list (3,389 editions and variations without LEXIS/WL, 47 KB as
// JSON) can replace the curated one with setReporters(list).
export function setReporters(list) {
  reporterSet = new Set(list.map(squeeze));
}
export function isReporter(name) {
  return reporterSet.has(squeeze(name));
}

// ---------------------------------------------------------------------------
// Citations
// ---------------------------------------------------------------------------

const DASH = '[-–—]';
// A section number; a period inside it (1630.2) is kept, a period after it is the sentence's.
const SEC = String.raw`\d(?:[\w:–-]|\.(?=\w))*`;
// Subsections, "(b)(4)" or "(b) (4)", and more after a comma: "§ 12940(m), (n)".
const SUBSECTIONS = String.raw`(?:\s?\([0-9a-zA-Z]{1,4}\))*(?:,\s*(?:\([0-9a-zA-Z]{1,4}\))+)*`;
// One section or a range: "§ 3602(b)" / "§ 3601–3619".
const ONE_SECTION = String.raw`${SEC}(?:\s*${DASH}\s*${SEC})?${SUBSECTIONS}`;
// After "§§", a list: "§§ 4.2, 9.1" / "§§ 1981 and 1983".
const SECTIONS = String.raw`(?:§§\s*${ONE_SECTION}(?:(?:,\s*|,?\s+(?:and|&)\s+)${ONE_SECTION})*|§\s*${ONE_SECTION})`;
// California's subdivisions: "subd. (d)" / "subds. (a) & (b)" / "par. (3)".
const SUBDIVISIONS = String.raw`(?:,\s*(?:subds?|pars?|paras?)\.\s*(?:\([0-9a-zA-Z]{1,4}\))+(?:(?:,\s*|\s+(?:&|and)\s+)(?:\([0-9a-zA-Z]{1,4}\))+)*)?`;
const YEAR = String.raw`(?:1[6-9]\d\d|20\d\d)`;
const MONTH = String.raw`(?:Jan\.|Feb\.|Mar\.|Apr\.|May|June?\.?|July?\.?|Aug\.|Sept?\.|Oct\.|Nov\.|Dec\.|January|February|March|April|August|September|October|November|December)`;
// The code's edition or year after a statute: "(2018)" / "(West 2024)" / "(Supp. V 2017)".
const EDITION = String.raw`(?:\s*\((?:[A-Z][A-Za-z.]*\s+){0,2}(?:Supp\.\s?[IVX]*\s?)?${YEAR}\))?`;
// A rule's effective date, as Illinois cites its rules: "(eff. Oct. 1, 2020)".
const EFFECTIVE = String.raw`(?:\s*\(eff\.\s+(?:${MONTH}\s+\d{1,2},\s+)?${YEAR}\))?`;
// A page, or a deposition's page and line: 158 / *3 / 14:3.
const PAGE = String.raw`\*{0,4}\d+(?::\d+)?`;
// A pin: 158 / 418–19 / *3 / 5 n.2 / 12-13 & n.4 / 22:15-23:4 / California's 6, fn. 3
const PIN = String.raw`${PAGE}(?:\s*${DASH}\s*${PAGE})?(?:\s*(?:&\s*)?nn?\.\s*\d+(?:\s*${DASH}\s*\d+)?)?(?:,\s*fns?\.\s*\d+(?:\s*${DASH}\s*\d+)?)?`;
// A reporter: 1-6 tokens like F. / Supp. / 2d / App'x / S. / Ct. / & / Idaho. A word is
// taken whole, so a long run of capitals after a number is not tried in every split.
const REPORTER = String.raw`(?:(?:[A-Z][A-Za-z'’]{0,12}(?![A-Za-z'’])\.?|\d(?:d|th|st|nd|rd)|&)\s?){1,6}?`;
// A list of numbers, paragraphs or pages: 9 / 3–5 / 12, 14. An item may not be a volume
// ("¶ 9, 12 F.3d").
const NUMBERS = String.raw`\d+(?:\s*${DASH}\s*\d+)?(?:,\s*\d+(?:\s*${DASH}\s*\d+)?(?![\d:]|\s+[A-Z]))*`;
// Deposition or transcript pages and lines: 8:2-11 / 22:15-23:4.
const LINES = String.raw`\d+:\d+(?:\s*${DASH}\s*(?:\d+:)?\d+)?(?:,\s*\d+:\d+(?:\s*${DASH}\s*(?:\d+:)?\d+)?)*`;

// VOLUME REPORTER PAGE, or VOLUME REPORTER at PIN (short form), "at p." in California.
const CASE_CORE = new RegExp(
  String.raw`(?<![\w.])(\d{1,4})\s+(${REPORTER})\s*(,\s*at(?:\s+pp?\.)?|at(?:\s+pp?\.)?)?\s+(\d{1,6}|_{2,})(?![\w.]*\.\w)`,
  'g',
);
// English reports and UK neutral citations: [1990] 1 WLR 491 / [1932] AC 562 /
// [2015] UKSC 31 / [2004] EWCA Crim 631 / [1854] EWHC J70 (a retrospective one).
const BRACKET_CORE = new RegExp(
  String.raw`(?<![\w.])\[(${YEAR})\]\s+(?:(\d{1,4})\s+)?((?:[A-Z][A-Za-z'’.]*\s+){0,2}[A-Z][A-Za-z'’.]*)\s+([A-Z]?\d{1,6})(?!\w)`,
  'g',
);
// Canadian neutral citations: 2019 SCC 65 / 2016 ONCA 12.
const NEUTRAL_CORE = new RegExp(
  String.raw`(?<![\w.\[])(${YEAR})\s+(SCC|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|NBCA|MBCA|SKCA|NLCA|PECA|YKCA|NWTCA|NUCA|ONSC|BCSC|ABQB|ABKB|QCCS|NSSC|NBQB|NBKB|MBQB|MBKB|SKQB|SKKB|TCC|CMAC|ONCJ|BCPC|ABPC|CanLII)\s+(\d{1,6})(?!\w)`,
  'g',
);
// US public-domain citations: 2020 IL 124112 / 2020 IL App (1st) 123456-U / 2015 WI 50 /
// 2015 WI App 12 / 2019 ND 12 / 2018 OK 45 / 2017 UT App 12 / 2019 COA 12 / 2010 Ark. 123 /
// 2018 VI 12, and Ohio's and New Mexico's hyphenated ones: 2021-Ohio-1234 / 2011-NMSC-001
// (and New Mexico's without hyphens, as some briefs write it: 2018 NMSC 12).
const US_NEUTRAL_CORE = new RegExp(
  String.raw`(?<![\w.\[-])(${YEAR})(?:\s+(IL(?:\s+App\s+\((?:1st|2d|3d|4th|5th)\))?|WI(?:\s+App)?|ND(?:\s+App)?|SD|S\.D\.|ME|MT|VT|WY|UT(?:\s+App)?|OK(?:\s+CIV\s+APP|\s+CR)?|CO|COA|NH|Ark\.(?:\s+App\.)?|PA\s+Super|Guam|VI|NMSC|NMCA)\s+|-(Ohio|NMSC|NMCA|NMCERT)-)(\d{1,6}(?:-U)?)(?![\w-])`,
  'g',
);
// The court each names, as a court parenthetical would ("Ill. App. Ct."). Ohio's is the
// Supreme Court's unless a district follows: "2021-Ohio-1234, ¶ 15 (8th Dist.)".
const US_NEUTRAL_COURTS = {
  IL: 'Ill.',
  'IL App': 'Ill. App. Ct.',
  WI: 'Wis.',
  'WI App': 'Wis. Ct. App.',
  ND: 'N.D.',
  'ND App': 'N.D. Ct. App.',
  SD: 'S.D.',
  'S.D.': 'S.D.',
  ME: 'Me.',
  MT: 'Mont.',
  VT: 'Vt.',
  WY: 'Wyo.',
  UT: 'Utah',
  'UT App': 'Utah Ct. App.',
  OK: 'Okla.',
  'OK CIV APP': 'Okla. Civ. App.',
  'OK CR': 'Okla. Crim. App.',
  CO: 'Colo.',
  COA: 'Colo. App.',
  NH: 'N.H.',
  'Ark.': 'Ark.',
  'Ark. App.': 'Ark. Ct. App.',
  'PA Super': 'Pa. Super. Ct.',
  Guam: 'Guam',
  VI: 'V.I.',
  Ohio: 'Ohio',
  NMSC: 'N.M.',
  NMCA: 'N.M. Ct. App.',
  NMCERT: 'N.M.',
};
// Courts that a neutral citation names: [2015] UKSC 31 is the Supreme Court's.
const NEUTRAL_COURTS =
  /^(?:UKSC|UKPC|UKHL|UKUT|UKFTT|EWCA(?:\s+(?:Civ|Crim))?|EWHC|EWCOP|EWFC|CSIH|CSOH|HCJAC|NICA|NIQB|NIKB|IESC|IECA|IEHC|SCC|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|NBCA|MBCA|SKCA|NLCA|PECA|YKCA|NWTCA|NUCA|ONSC|BCSC|ABQB|ABKB|QCCS|NSSC|NBQB|NBKB|MBQB|MBKB|SKQB|SKKB|TCC|CMAC|ONCJ|BCPC|ABPC|CanLII)$/;
// Statute books and databases that look like reporters after a number ("2021 U.S. Dist.
// LEXIS 12345" is a database number, read below).
const NOT_REPORTER = /^(?:U\.S\.C|C\.F\.R|Stat\.|Fed\.Reg|WL|LEXIS|Cong\.Rec|Pub\.L)|LEXIS/;
// Law reviews and journals: Harv. L. Rev. / Yale L.J. / J. Legal Stud. / Wash. U. L.Q.
const JOURNAL = /L\.\s?(?:Rev|J|Q)\.|(?:^|\s)J\.|\bRev\.$|\bQ\.$|\bL\.$|\bF\.\s?Rev\.$/;

const sticky = source => new RegExp(source, 'y');
// The matches of global pattern `re` in `text`, as matchAll gives them, but read with the
// pattern itself: matchAll copies it first, which for a long pattern costs more than the
// search in a short sentence.
function* matchesOf(re, text) {
  re.lastIndex = 0;
  for (let m; (m = re.exec(text)); ) {
    if (!m[0]) re.lastIndex++;
    const at = re.lastIndex;
    yield m;
    re.lastIndex = at;
  }
  re.lastIndex = 0;
}
// A pattern matched at `i` only, so nothing rescans the rest of the text.
function matchAt(re, text, i) {
  re.lastIndex = i;
  return re.exec(text);
}

// What may follow a case's core. A pin may not run into a parallel citation's volume
// ("544, 127 S. Ct.") but may end the sentence ("1206.)").
const PINS_AFTER = sticky(String.raw`(?:,\s*(?:at\s+)?(?:pp?\.\s*)?${PIN}(?!\w|\.\d|\s+[A-Z]))+`);
const SHORT_MORE = sticky(
  String.raw`(?:\s*${DASH}\s*\d+)?(?:\s*(?:&\s*)?nn?\.\s*\d+(?:\s*${DASH}\s*\d+)?)?(?:,\s*(?:pp?\.\s*)?${PIN}(?!\w|\.\d|\s+[A-Z]))*`,
);
// Court and date: (3d Cir. 2006) / (W.D. Pa. 2013) / (1997) / (N.D. Ill. Jan. 5, 2015), and
// Texas's petition history after the year: (Tex. App.—Houston [14th Dist.] 2003, pet. denied)
// A word before the date says what happened then, not which court: (S.D.N.Y. filed Jan. 5,
// 2021).
const COURT_AFTER = sticky(
  String.raw`\s*\(([^()]{0,60}?)\s*(?:(?:filed|decided|argued|submitted|dated)\s+)?((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))(?:,\s*((?:no\s+)?(?:pet\.|writ|orig\.\s+proceeding|mand\.)[^()]{0,40}?))?\)`,
);
// California puts the court and year before the volume: "Ortega v. Kmart Corp. (2001) 26
// Cal.4th 1200"; old English reports do too: "(1854) 9 Exch 341".
const YEAR_BEFORE = new RegExp(
  String.raw`\(([^()]{0,60}?)\s*((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)\s*$`,
);
// An English court without a year, after a report: "(HL)" / "(H.L.)" / "(Ch)", and a
// retrospective neutral citation's old court: "[1854] EWHC J70 (Exch)".
const COURT_NO_YEAR = sticky(
  String.raw`\s*\(((?:[A-Z]{1,6}|(?:[A-Z][a-z]{0,4}\.\s?){1,3}|Ch|Fam|Comm|Admin|Civ|Crim|Pat|IPEC|TCC|Exch|Admlty|Costs))\)`,
);
// English and Canadian pins: at [47] / at para 23 / at paras. 5–7 / (HL) at 499.
const UK_PIN_AFTER = sticky(
  String.raw`(?:,\s*|\s+)(?:at\s+)?(\[\d{1,3}\](?:\s*${DASH}\s*\[\d{1,3}\])?|paras?\.?\s*\d+(?:\s*${DASH}\s*\d+)?)|,?\s+at\s+(\d+(?:\s*${DASH}\s*\d+)?)`,
);
// A public-domain citation's paragraph pin, "2020 IL 124112, ¶ 20", and an Ohio district.
const PARA_PIN = sticky(String.raw`,\s*(?:at\s+)?(¶¶?\s*${NUMBERS})`);
const OHIO_DISTRICT = sticky(String.raw`\s*\((\d+(?:st|nd|rd|th|d)\s+Dist\.)\)`);
const COMMA = sticky(String.raw`,\s*`);
const BRACKET_OPEN = sticky(String.raw`\s*\[`);
const BRACKET_CLOSE = sticky(String.raw`\s*\]`);
const PAREN_NEXT = sticky(String.raw`\s*(?=[(\[])`);
// California's notes after a comma, inside the citation's parentheses: "(Id. at p.
// 1207, internal quotation marks omitted.)", "(… at p. 6, italics added.)", and the
// opinion cited: "(… at pp. 6–7, conc. opn. of Kennard, J.)".
const NOTE_WORDS = String.raw`(?:internal\s+)?(?:quotation\s+marks|citations?|fns?\.|footnotes?|brackets|ellipses|alterations?|emphasis|italics)`;
const CSM_OPINION = String.raw`(?:conc\.\s+&\s+dis\.|conc\.|dis\.|maj\.|plur\.|lead)\s+opn\.(?:\s+of\s+[A-Z][\w'’.-]*(?:\s+[A-Z][\w'’.-]*){0,2},\s+(?:Acting\s+)?(?:P\.\s?|C\.\s?)?J\.)?`;
const CSM_NOTE = sticky(
  String.raw`,\s*(${NOTE_WORDS}(?:(?:,\s*|\s+and\s+)${NOTE_WORDS})*\s+(?:omitted|added|in\s+original)|original\s+italics|${CSM_OPINION})`,
);
// A judge's initials after a docket number: "No. 18-cv-7702 (JPO)".
const JUDGE = sticky(String.raw`(?:\s*\([A-Z]{2,5}\))+`);
// 2015 WL 123456 / 2013 U.S. Dist. LEXIS 1234
const DATABASE_SOURCE = String.raw`${YEAR}\s+(?:WL|U\.\s?S\.\s?(?:Dist\.|App\.)\s?LEXIS|[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*){0,3}\s?LEXIS)\s+\d+`;
const DATABASE = new RegExp(String.raw`(?<![\w.])${DATABASE_SOURCE}`, 'g');
const DATABASE_AFTER = sticky(String.raw`,\s*(${DATABASE_SOURCE})(?:,\s*at\s+(${PIN}))?`);
const DATABASE_PIN = sticky(String.raw`,\s*at\s+(${PIN})`);
// A slip opinion after its docket number: "No. 21-1234, slip op. at 5".
const SLIP_OP = sticky(String.raw`,\s*slip\s+op\.(?:\s+at\s+(${PIN}))?`);
const DOCKET_PAREN = sticky(String.raw`,?${COURT_AFTER.source}`);
// Subsequent history after a case: ", aff’d," / ", rev’d on other grounds," / ", cert.
// denied," / ", abrogated on other grounds by" / ", aff’d sub nom.". Read up to the citation
// of the later decision, or to the end of the clause when none follows.
const HISTORY_WORD = String.raw`(?:(?:aff|rev)['’](?:d|g)|vacated|remanded|modified|withdrawn|amended|overruled|abrogated|superseded|disapproved|cert\.\s+(?:denied|granted|dismissed)|reh['’]g(?:\s+en\s+banc)?\s+(?:denied|granted)|appeal\s+(?:dismissed|denied)|review\s+(?:denied|granted|dismissed)|petition\s+for\s+cert\.\s+filed|as\s+(?:stated|recognized)\s+in)`;
const HISTORY = sticky(
  String.raw`,\s*(${HISTORY_WORD}(?:(?:,\s*|\s+)(?:and|in\s+part|mem\.|per\s+curiam|on\s+other\s+grounds|en\s+banc|by(?:\s+statute)?|sub\s+nom\.|${HISTORY_WORD})){0,6})(?:,?\s+|(?=[.;)\]]|$))`,
);

const STATE = String.raw`(?:(?:Ala|Ariz|Ark|Cal|Colo|Conn|Del|Fla|Ga|Haw|Ill|Ind|Kan|Ky|La|Me|Md|Mass|Mich|Minn|Miss|Mo|Mont|Neb|Nev|Okla|Or|Pa|Tenn|Tex|Vt|Va|Wash|Wis|Wyo)\.|Alaska|Idaho|Iowa|Ohio|Utah|(?:D\.C|N\.H|N\.J|N\.M|N\.Y|N\.C|N\.D|R\.I|S\.C|S\.D|W\.\s?Va)\.)`;
// Each statute pattern with a word it cannot match without, tested first: most sentences
// cite no statute, and a test for one word is far cheaper than a scan with the pattern.
const STATUTE = [
  // 42 U.S.C. § 3602(b) / 42 U.S. Code § 3602 (b) / 29 C.F.R. §§ 1630.2–.3 / 26 U.S.C.A. § 1
  [
    /U\.\s?S\.\s?C|C\.\s?F\.\s?R/,
    String.raw`(?<![\w.])\d{1,3}\s+(?:U\.\s?S\.\s?C(?:ode|\.)(?:\s?[AS]\.)?|U\.\s?S\.\s?Code\s+Ann\.|C\.\s?F\.\s?R\.)\s*(?:${SECTIONS}|[Ss]ec(?:tion|s?\.)?\s*${ONE_SECTION})(?:\s+et\s+seq\.)?${EDITION}`,
  ],
  // 29 C.F.R. pt. 1630, app. § 1630.9 / 12 C.F.R. pt. 1026, supp. I, cmt. 2(a)-1
  [
    /C\.\s?F\.\s?R\.\s+(?:pt|Pt|part)\b/,
    String.raw`(?<![\w.])\d{1,3}\s+C\.\s?F\.\s?R\.\s+(?:pt|Pt|part)\.?\s+\d+(?:,\s*(?:app\.|subpt\.\s*[A-Z]+|supp\.\s*[IVX]+))?(?:,\s*(?:cmt\.|¶)\s*\d+(?:\([a-z0-9]{1,4}\))*(?:-\d+)?)?(?:,?\s*${SECTIONS})?${EDITION}`,
  ],
  // State codes, which open with the state: Cal. Civ. Code § 1714 / 43 Pa. Stat. Ann. § 955 /
  // N.Y. Exec. Law § 296(1) / Cal. Code Regs. tit. 2, § 11068 / Mass. Gen. Laws ch. 93A, § 2
  [
    /Codes?\b|Stat\.|Laws?\b|Ann\./,
    String.raw`(?<![\w.])(?:\d{1,3}\s+)?${STATE}\s+(?:(?:[A-Z][A-Za-z.'’]*|&)\s+){0,5}?(?:Codes?|Stat\.|Laws|Law|Ann\.|Rev\.\s?Stat\.|Comp\.\s?Laws|Gen\.\s?Laws|Cons\.\s?Stat\.)(?:\s+Ann\.)?(?:\s+R\.\s+&)?(?:\s+Regs\.)?(?:\s+(?:tit|ch)\.\s+\w+,)?\s*${SECTIONS}${EDITION}`,
  ],
  // N.Y. C.P.L.R. 3211(a)(7) (McKinney 2024)
  [
    /C\.?P\.?L\.?R/,
    String.raw`(?<![\w.])(?:N\.Y\.\s?C\.P\.L\.R\.|CPLR)\s+(?:§\s*|R\.\s*)?${SEC}${SUBSECTIONS}${EDITION}`,
  ],
  // State court rules: Fla. R. Civ. P. 1.140(b) / Cal. R. Ct. 8.204(a) / N.J. Ct. R. 4:6-2 /
  // Ill. S. Ct. R. 341(h)(7) (eff. Oct. 1, 2020) / Ill. App. Ct. R. 1
  [
    /R\.\s+(?:Civ|Crim|App)\.|R\.\s+(?:Evid|Ct)\.|Ct\.\s+R\./,
    String.raw`(?<![\w.])${STATE}\s+(?:R\.\s+(?:(?:Civ|Crim|App)\.\s+P\.|Evid\.|Ct\.)|(?:(?:S|Sup|App)\.\s?)?Ct\.\s+R\.)\s*${SEC}${SUBSECTIONS}${EDITION}${EFFECTIVE}`,
  ],
  // A local court's rules, by the court's place and level: Cook Cnty. Cir. Ct. R. 2.1(c) /
  // Cook County Cir. Ct. R. 2.1 / Cir. Ct. Cook Cnty. R. 2.1 / L.A. Super. Ct. Local R. 3.
  [
    /Ct\.\s+(?:(?:Loc\.|Local|Gen\.)\s+)?R\.|Ct\.\s+[A-Z][a-z]+\.?\s+(?:[A-Z][a-z]+\.?\s+)?R\./,
    String.raw`(?<![\w.])(?:(?:[A-Z][a-z]+\.?\s+|[A-Z]\.[A-Z]\.\s+){1,3}(?:Cir|Dist|Super|Mun|Prob|Juv|Fam|Chan|Ch|Cnty|Sup)\.\s+Ct\.\s+(?:(?:Loc\.|Local|Gen\.)\s+)?(?:(?:Civ|Crim|Prob|Fam)\.\s+)?|Cir\.\s+Ct\.\s+(?:[A-Z][a-z]+\.?\s+){1,3})R\.\s*${SEC}${SUBSECTIONS}${EDITION}${EFFECTIVE}`,
  ],
  // Model and uniform codes, with a comment and their publisher: I.R.C. § 409A / U.C.C. §
  // 2-207 cmt. 2 (Am. L. Inst. & Unif. L. Comm’n 2022) / Model Penal Code § 2.02 (Am. L.
  // Inst. 1985)
  [
    /I\.R\.C|U\.C\.C|Model/,
    String.raw`(?<![\w.])(?:I\.R\.C\.|U\.C\.C\.|Model\s+Penal\s+Code)\s*${SECTIONS}(?:\s+cmt\.\s*\d+[a-z]?)?(?:\s*\((?:[A-Z][\w.'’]*\s+|&\s+){0,8}${YEAR}\))?`,
  ],
  // Treasury regulations: Treas. Reg. § 1.162-1(a) (2023) / Temp. Treas. Reg. § 1.1
  [
    /Treas\.\s?Reg/,
    String.raw`(?<![\w.])(?:(?:Temp\.|Prop\.)\s+)?Treas\.\s?Reg\.\s*${SECTIONS}${EDITION}`,
  ],
  // Illinois: 735 ILCS 5/2-619(a)(9) / 735 Ill. Comp. Stat. 5/2-619 (2022)
  [
    /ILCS|Comp\.\s?Stat/,
    String.raw`(?<![\w.])\d{1,3}\s+(?:ILCS|Ill\.\s?Comp\.\s?Stat\.(?:\s+Ann\.)?)\s+\d+\/\d+(?:[-.]\d+)*[a-z]?${SUBSECTIONS}(?:\s+et\s+seq\.)?${EDITION}`,
  ],
  // Massachusetts by chapter: Mass. Gen. Laws ch. 93A / G.L. c. 93A, § 2 / M.G.L. c. 93A
  [
    /Gen\.\s?Laws\s+ch\.|G\.\s?L\.\s+c\./,
    String.raw`(?<![\w.])(?:Mass\.\s+Gen\.\s+Laws(?:\s+Ann\.)?\s+ch\.|(?:Mass\.\s+|M\.)?G\.\s?L\.\s+c\.)\s+\d+[A-Z]?(?:,\s*${SECTIONS})?${EDITION}`,
  ],
  // Rules of the Supreme Court and of district courts: Sup. Ct. R. 10 / S.D.N.Y. Local Civ.
  // R. 6.3 / N.D. Cal. Civ. L.R. 7-3 / D. Mass. L.R. 7.1 / Local Rule 56.1
  [/Ct\.\s?R\./, String.raw`(?<![\w.])Sup\.\s?Ct\.\s?R\.\s*\d+(?:\.\d+)*(?:\([A-Za-z0-9]{1,4}\))*`],
  [
    /Local\s|L\.\s?(?:Civ\.\s?|Cr\.\s?|Crim\.\s?)?R\./,
    String.raw`(?<![\w.])(?:(?:[NSEWMC]\.D\.|D\.)\s?(?:[A-Z]\.){0,3}(?:\s?[A-Z][a-z]{1,6}\.)?\s+)?(?:Local\s+(?:Civ(?:il|\.)?\s+|Crim(?:inal|\.)?\s+|Bankr(?:uptcy|\.)?\s+|Admiralty\s+)?R(?:ule|\.)|L\.\s?(?:Civ\.\s?|Cr\.\s?|Crim\.\s?)?R\.|(?:Civ|Crim)\.\s?L\.\s?R\.)\s*\d+(?:[.-]\d+)*(?:\([A-Za-z0-9]{1,4}\))*`,
  ],
  // Executive orders, with the section cited and where they are published: Exec. Order No.
  // 14,028, § 2, 86 Fed. Reg. 26,633 (May 12, 2021) / Exec. Order No. 12,866, 3 C.F.R. 638
  [
    /Exec\.\s?Order/,
    String.raw`(?<![\w.])Exec\.\s?Order\s+(?:No\.\s+)?\d{1,2},?\d{3}(?:,\s*§§?\s*\d{1,3}(?:\([0-9a-z]{1,4}\))*)?(?:,\s*(?:\d{1,3}\s+Fed\.\s?Reg\.\s+\d{1,3}(?:,\d{3})*(?:,\s*\d{1,3}(?:,\d{3})*(?![\d,]|\s+[A-Z]))?|3\s+C\.F\.R\.\s+\d+))?(?:\s*\((?:${MONTH}\s+\d{1,2},\s+)?${YEAR}(?:\s+comp\.)?\))?`,
  ],
  // California session laws: Stats. 2019, ch. 296, § 2
  [/Stats\.\s+\d/, String.raw`(?<![\w.])Stats\.\s+${YEAR},\s*ch\.\s+\d+(?:,\s*${SECTIONS})?`],
  // California style: (Evid. Code, § 452, subd. (d).) / (Code Civ. Proc., § 437c) /
  // (Bus. & Prof. Code, § 17200) / (Cal. Code Regs., tit. 2, § 11068)
  [
    /Code/,
    String.raw`(?<![\w.])(?:(?:[A-Z][a-z]{1,11}\.?\s+(?:&\s+)?){1,3}Code|Code\s+(?:Civ|Crim)\.\s+Proc\.|Cal\.\s+Code\s+Regs\.,\s*tit\.\s+\d+),\s*${SECTIONS}${SUBDIVISIONS}`,
  ],
  // Cal. Rules of Court, rule 8.204(a)(1)
  [
    /Rules of Court/,
    String.raw`(?<![\w.])Cal\.\s+Rules\s+of\s+Court,\s*rules?\s+${SEC}${SUBSECTIONS}${SUBDIVISIONS}`,
  ],
  // Statutes at Large and Public Laws, as one citation: Pub. L. No. 110-325, § 2(b)(5),
  // 122 Stat. 3553, 3554 (2008) / 122 Stat. at 3554
  [
    /Stat\./,
    String.raw`(?<![\w.])\d{1,4}\s+Stat\.\s+(?:at\s+)?\d+(?:,\s*\d+(?![\w]|\s+[A-Z]))?${EDITION}`,
  ],
  [
    /Pub\./,
    String.raw`Pub\.\s?L\.\s?(?:No\.\s?)?\d{1,3}${DASH}\d{1,4}(?:,\s*§\s*${ONE_SECTION})?(?:,\s*\d{1,4}\s+Stat\.\s+(?:at\s+)?\d+(?:,\s*\d+(?![\w]|\s+[A-Z]))?)?${EDITION}`,
  ],
  // Federal Register, with its pin and date: 76 Fed. Reg. 16,978, 16,981 (Mar. 25, 2011)
  [
    /Reg\./,
    String.raw`(?<![\w.])\d{1,3}\s+Fed\.\s?Reg\.\s+\d{1,3}(?:,\d{3})*(?:,\s*\d{1,3}(?:,\d{3})*(?![\d,]|\s+[A-Z]))?(?:\s*\((?:[a-z]+\s+)?(?:${MONTH}\s+\d{1,2},\s+)?${YEAR}\))?`,
  ],
  // Constitutions: U.S. Const. art. I, § 8, cl. 3 / U.S. Const. amend. XIV, § 1 /
  // Cal. Const., art. VI, § 13 / U.S. Const., 14th Amend.
  [
    /Const\./,
    String.raw`(?:U\.\s?S\.|(?:[A-Z]\.){1,2}|[A-Z][a-z]+\.)\s+Const\.,?\s+(?:art\.\s+[IVXL]+|amend\.\s+[IVXL]+|pmbl\.|\d+(?:st|nd|rd|th)\s+Amend\.)(?:,\s*§\s*\d+[a-z]?)?(?:,\s*(?:cl|subd|par)\.\s*(?:\d+|\([0-9a-z]{1,4}\)))?`,
  ],
  // Federal rules: Fed. R. Civ. P. 12(b)(6) / Fed. R. Evid. 401 / Fed. R. App. P. 4(a)(1)(A)
  [
    /Fed\.\s?R\./,
    String.raw`Fed\.\s?R\.\s?(?:Civ\.\s?P|Crim\.\s?P|App\.\s?P|Bankr\.\s?P|Evid)\.\s?\d+(?:\([A-Za-z0-9]{1,4}\))*`,
  ],
  // Canadian statutes: Trademarks Act, RSC 1985, c T-13, s 19 / R.S.C. 1985, c. C-46, s. 348
  [
    /\d{4},\s*c\b/,
    String.raw`(?<![\w.])(?:R\.?S\.?|S\.?)(?:C|O|B\.?C|A|Q|N\.?S|M|N\.?B)\.?\s+${YEAR},\s*c\.?\s*[A-Z]?-?\d+(?:[\w-]|\.(?=\w))*(?:,\s*(?:ss?\.?|art\.?|sch\.?)\s*${SEC}${SUBSECTIONS})?`,
  ],
  // UK Acts with a section: Theft Act 1968, s 1(1)
  [
    /Act\s+\d{4}/,
    String.raw`(?<![\w.])[A-Z][\w'’()-]*\s+(?:(?:[A-Z][\w'’()-]*|of|and|the|for|on|to)\s+){0,6}?Act\s+${YEAR},?\s+(?:ss?\.?|sch\.?|Sch\.?|section)\s*\d+[A-Z]?${SUBSECTIONS}(?:\s*${DASH}\s*\d+[A-Z]?)?`,
  ],
].map(([hint, source]) => [hint, new RegExp(source, 'g')]);
// The Act or Code a Canadian chapter belongs to: "Trademarks Act, RSC 1985, …"
const ACT_BEFORE =
  /(?:^|[^\w.])([A-Z][\w'’-]*(?:\s+(?:[A-Z][\w'’-]*|of|and|the|for|on)){0,6}\s+(?:Act|Code)),\s*$/;
// A bare section in running text or a short form: § 3602(c) / §§ 3601–3619 / §§ 4.2, 9.1.
// "Section 4.2(b)" is read too, as a reference to a part of a document (see internalAt).
const SECTION = new RegExp(
  String.raw`${SECTIONS}|(?<![\w.])Sections?\s+\d+(?:\.\d+)*(?:\([0-9a-zA-Z]{1,4}\))*`,
  'g',
);
// The documents a contract or brief refers to by section: "Agreement § 4.2", "§ 4.3 of the
// MSA", "this Section 4", and by the last word of their names: "Code of Conduct § 2",
// "Statement of Work § 3", "Term Sheet § 2", "Terms of Service § 4". Their sections are
// not statutes.
const DOCUMENTS = new Set(
  `Agreement Agreements Contract Lease MSA SOW NDA EULA LPA Policy Plan Bylaws Charter Amendment
  Addendum Schedule Order Indenture License Licence Terms Note Deed Trust Declaration
  Certificate Articles Handbook Manual Guidelines Protocol Memorandum Supplement Appendix
  Exhibit Settlement Award Warranty Guaranty Guarantee Mortgage Covenant Covenants Conduct
  Ethics Work Sheet Service Use Conditions Intent Understanding Sale Letter LOI MOU SLA TOS`.split(
    /\s+/,
  ),
);
// The documents whose name in a sentence makes a bare section in it the document's: "The
// Lease says the deposit is forfeited under § 3."
const DOCUMENT_NAMED =
  /(?<![\w'’-])(?:Lease|Agreement|Contract|Policy|Plan|Bylaws|Charter|MSA|SOW|NDA|EULA|LPA|Indenture|Handbook)(?![\w'’-])/g;
// A code or act named in a sentence, which a bare section there more likely belongs to.
const CODE_NAMED =
  /\b(?:Code|U\.\s?S\.\s?C|C\.\s?F\.\s?R|Stat|Laws?|Act|Rules?|Regs?)\b|[A-Z]{3,}\s*§/;
// Id. / id. at 5 / Id. at p. 843 / Id. § 3 / Id. ¶¶ 30–31 / Id. at 14:3-9 / ibid., and a
// constitution's other article or amendment: Id. art. II, § 3 / (Id., art. I, § 7, subd. (b).)
const ID = new RegExp(
  String.raw`(?<![\w.])(?:[Ii]d\.|[Ii]bid\.)(?:,?\s+at\s+(?:pp?\.\s*)?${PIN}(?:,\s*${PIN}(?!\w|\s+[A-Z]))*|\s+§§?\s*${SEC}(?:\([0-9a-zA-Z]{1,4}\))*(?:,\s*(?:\([0-9a-zA-Z]{1,4}\))+)*|\s+¶+\s*${NUMBERS}|,?\s+(?:arts?\.|amends?\.)\s+[IVXLC]+(?!\w)(?:,\s*§§?\s*${SEC}(?:,\s*cl\.\s*\d+)?)?(?:,\s*subd\.\s*\([0-9a-zA-Z]{1,4}\))?)?`,
  'g',
);
// Smith, supra, at 5 / Smith, supra note 3, at 5 / Lindemann et al., supra note 6, § 13.03 /
// Ortega, supra, 26 Cal.4th at p. 1206. The name is at most 9 words, so a long run of
// capitalized words is not scanned again from each of its words.
const SUPRA = new RegExp(
  String.raw`(?<![\w.])([A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|of|the|&)){0,8}?(?:\s+et\s+al\.)?),?\s+supra(?:,?\s+note\s+(\d+))?(?:,\s*(\d{1,4})\s+(${REPORTER})\s*at(?:\s+pp?\.)?\s+(${PIN})|,?\s+at(?:\s+pp?\.)?\s+(${PIN})|,?\s+(§§?\s*${ONE_SECTION}|¶+\s*${NUMBERS}))?`,
  'g',
);
// English and Canadian short forms give the case's name and a paragraph: "Jones at [47]",
// "Doe at para 6", "Oakes at paras 5–7". They name no volume, so they read as a supra
// does. The name is one to three capitalized words with no letter or number alone in it,
// so "Annex B at para 4" and "Schedule 2 at [3]" are not cases.
const PARA_SHORT = new RegExp(
  String.raw`(?<![\w.'’-])((?:[A-Z][a-z][\w'’-]*)(?:\s+(?:[A-Z][a-z][\w'’-]*|of|the|&)){0,2}?)\s+at\s+(\[\d{1,4}\](?:\s*${DASH}\s*\[\d{1,4}\])?|paras?\.?\s+\d{1,4}(?:\s*${DASH}\s*\d{1,4})?)(?![\w\]])`,
  'g',
);
// No. 13-114-J / No. 2:13-cv-00114 / Nos. 12-1, 12-2
const DOCKET = /(?<![\w.])Nos?\.\s+(?:\d+:)?\d{1,5}[-–][\w-]*/g;
// A number that is a court's docket number by its shape (1:26-cv-03317, 18-cv-7702) or by
// the word before it (Case No., Civ. No., Index No.).
const DOCKET_SHAPE = /\d:\d\d-[a-z]{2,4}-|[-–](?:cv|cr|mc|bk|md|ap|civ|crim|misc)[-–]/i;
const DOCKET_WORD =
  /\b(?:Case|Civ\.|Civil|Action|Dkt\.|Docket|Index|Appeal|Cause|Adv\.|Proc\.|Misc\.|Bankr\.|Crim\.|Petition)\s*$/;
// Legislative history: H.R. Rep. No. 110-730, pt. 1, at 5 (2008) / S. Rep. No. 101-116 /
// 144 Cong. Rec. S3021 (1998)
const LEGISLATIVE = [
  String.raw`(?<![\w.])(?:H\.\s?R\.|S\.)\s?(?:Conf\.\s?)?(?:Rep|Doc)\.\s?No\.\s?\d{1,3}${DASH}\d{1,5}(?:,\s*pt\.\s*\d+)?(?:,\s*at\s+(${PIN}))?(?:\s*\((?:[^()\n]{0,30}\s)?(${YEAR})\))?`,
  // A bill or resolution by its number and Congress, with the section cited: "H.R. 1234,
  // 117th Cong. § 3 (2021)", "S. 1, 118th Cong. (2023)", "H.R.J. Res. 7, 117th Cong.".
  String.raw`(?<![\w.])(?:H\.\s?R\.|S\.)(?:\s?(?:J\.|Con\.)?\s?Res\.)?\s?\d{1,5},\s*\d{1,3}(?:st|nd|rd|th|d)\s+Cong\.(?:\s*(§§?\s*${SEC}(?:\s?\((?!${YEAR}\))[0-9a-zA-Z]{1,4}\))*))?(?:\s*\((?:[^()\n]{0,30}\s)?(${YEAR})\))?`,
  String.raw`(?<![\w.])\d{1,3}\s+Cong\.\s?Rec\.\s+[HSE]?\d+(?:\s*${DASH}\s*[HSE]?\d+)?(?:,\s*([HSE]?\d+))?(?:\s*\((?:daily\s+ed\.\s+)?(?:${MONTH}\s+\d{1,2},\s+)?(${YEAR})\))?`,
].map(source => new RegExp(source, 'g'));
// California bills: (Assem. Bill No. 5 (2019–2020 Reg. Sess.) § 2) / (Sen. Bill No. 1)
const CA_BILL = new RegExp(
  String.raw`(?<![\w.])(?:Assem\.|Assembly|Sen\.|Senate)\s+(?:Bill|Const\.\s+Amend\.|Joint\s+Res\.|Conc\.\s+Res\.)\s+No\.\s+\d+(?:\s*\((${YEAR})(?:\s*${DASH}\s*${YEAR})?\s+(?:Reg\.|\d+(?:st|nd|rd|th|d)\s+Ex\.)\s+Sess\.\))?(?:,?\s*(§§?\s*${ONE_SECTION}))?`,
  'g',
);
// Revenue rulings and other IRS guidance: Rev. Rul. 2004-1, 2004-1 C.B. 1 / Rev. Proc.
// 2019-43 / I.R.S. Notice 2020-23 / Priv. Ltr. Rul. 2019-12-001 / T.D. 9876
const IRS_GUIDANCE = new RegExp(
  String.raw`(?<![\w.])(?:Rev\.\s?(?:Rul|Proc)\.|I\.R\.S\.\s+Notice|Priv\.\s?Ltr\.\s?Rul\.|T\.D\.)\s+\d{2,4}(?:-\d+){0,2}(?:,\s*\d{4}-\d+\s+(?:C\.B\.|I\.R\.B\.)\s+\d+(?:,\s*\d+(?![\d,]|\s+[A-Z]))?)?`,
  'g',
);
// Record citations: the complaint, depositions, declarations, transcripts, exhibits,
// the record and the docket. Each needs its paragraph, page or line, or a name.
const RECORD_PIN = String.raw`(?:¶¶?\s*${NUMBERS}|at\s+(?:pp?\.\s*)?(?:${LINES}|${NUMBERS})|${LINES}|pp?\.\s*${NUMBERS})`;
// A declarant's name: words and initials ("Tomas R. Reyes", "Ann Lee Jr."). A word's
// period ends the sentence unless the word is an initial, so "Decl. of Tomas Reyes. He
// then left." is the declaration alone.
const NAME_PART = String.raw`(?:[JS]r\.|[A-Z]\.|[A-Z][\w'’-]*)`;
const DECLARANT = String.raw`${NAME_PART}(?:\s+${NAME_PART}){0,3}(?:,\s+[JS]r\.)?`;
// A party, as a brief, an exhibit or a discovery response names it: "Pl.'s", "Defs.’",
// "Gov't", "Appellant's".
const PARTY = String.raw`(?:Pls?|Defs?|Resp(?:['’]t|s)?|Pet(?:['’]r|s)?|Gov['’]t|Appellants?|Appellees?|Plaintiffs?|Defendants?|Petitioners?|Respondents?)\.?(?:['’]s?)?`;
// A filing's title after its kind: "Summ. J.", "Supp. Mot. Dismiss", "in Supp. of Mot. to
// Dismiss". At most 8 words, so a long run of capitals is not read again from each.
const FILING_TITLE = String.raw`(?:\s+(?:[A-Z][\w'’.-]*|to|for|in|of|re|&|and)){0,8}?`;
// One pattern of alternatives behind one lookbehind, so the lookbehind is tested once at
// each place and not once for each form.
const RECORD = new RegExp(
  String.raw`(?<![\w.])(?:${[
    String.raw`(?:(?:First|Second|Third|Fourth|Fifth)\s+)?(?:Am\.\s+|Amended\s+)?(?:Compl\.|Complaint|Answer|Countercls?\.|Counterclaims?)\s*${RECORD_PIN}`,
    // Amended complaints by their initials: "SAC ¶ 12", "FAC ¶¶ 3–5".
    String.raw`(?:FAC|SAC|TAC|CAC|SCAC)\s*${RECORD_PIN}`,
    String.raw`(?<![\w'’-])(?:[A-Z][\w'’-]*\.?\s+){0,3}(?:[Dd]epo?|Decl|Aff|Tr|Hr['’]g\s+Tr|Trial\s+Tr)\.,?\s*(?:vol\.\s*[IVX\d]+,?\s*)?(?:${RECORD_PIN}|${NUMBERS})`,
    String.raw`Tr\.\s+of\s+Oral\s+Arg\.\s*(?:at\s+)?(?:${LINES}|${NUMBERS})`,
    String.raw`(?:Decl|Aff|[Dd]epo?)\.\s+of\s+${DECLARANT}(?:,?\s*${RECORD_PIN})?`,
    // An exhibit, a party's or a filing's: "Ex. A at 1", "Pl.'s Ex. 5", "Compl. Ex. A, at 2",
    // "Decl. Ex. 3 ¶ 7".
    String.raw`(?:${PARTY}\s+|(?:Joint|Trial|Hr['’]g)\s+|(?:(?:Am\.\s+)?Compl|Decl|Aff|Mot)\.\s+)?Exh?s?\.\s*[A-Z0-9]{1,4}(?:[-.]\d{1,3})?(?!\w)(?:,?\s+at\s+(?:pp?\.\s*)?(?:${LINES}|${NUMBERS})|,?\s+¶¶?\s*${NUMBERS})?`,
    // Trial exhibits: "PX 12 at 3", "DX-4".
    String.raw`(?:PX|DX|JX|GX|PTX|DTX)[-\s]?\d{1,4}(?:[-.]\d{1,3})?(?!\w)(?:,?\s+at\s+(?:pp?\.\s*)?(?:${LINES}|${NUMBERS}))?`,
    String.raw`(?:(?:Pls?|Defs?|Resp|Pet|Appellants?|Appellees?)\.?['’]s?\s+)?(?:Mot\.|Br\.|Mem\.|Opp['’]n|Reply|Ans\.)(?:\s+(?:to|for|in|of)\s+[A-Z][\w.'’]*(?:\s+[A-Z][\w.'’]*){0,3})?\s+at\s+${NUMBERS}`,
    // A party's filing by its page, without "at" (Bluepages B17): "Pl.'s Mot. Summ. J. 5",
    // "Def.’s Mem. Supp. Mot. Dismiss 12", "Appellant's Opening Br. 12", "Pl.'s Br. ¶ 4".
    String.raw`${PARTY}\s+(?:(?:Opening|Reply|Answering|Suppl\.|Supplemental)\s+)?(?:Mot\.|Br\.|Mem\.|Opp['’]n|Ans\.|Resp\.|Stmt\.)${FILING_TITLE}(?:,?\s+at\s+(?:pp?\.\s*)?|\s+(?:pp?\.\s*)?|\s+¶¶?\s*)${NUMBERS}`,
    // A reply only after an abbreviated party, since "Plaintiff's Reply 3 days late" is prose.
    String.raw`(?:Pls?|Defs?)\.['’]s?\s+Reply(?:,?\s+at)?\s+${NUMBERS}`,
    // Discovery: "Pl.'s Resp. to Interrog. No. 3", "Def.'s Resp. to Req. for Admis. No. 4".
    String.raw`(?:${PARTY}\s+)?(?:(?:Suppl\.|Supplemental|Am\.|Amended)\s+)?(?:(?:Objs?\.\s+&\s+)?Resps?\.|Responses?)\s+to\s+(?:${PARTY}\s+)?(?:(?:First|Second|Third)\s+(?:Set\s+of\s+)?)?(?:Interrogs?\.|Interrogator(?:y|ies)|Reqs?\.\s+for\s+(?:Admis{1,2}\.|Prod\.)|Requests?\s+for\s+(?:Admissions?|Production))\s+Nos?\.\s+\d+(?:\s*(?:${DASH}|,|&|and)\s*\d+)*`,
    String.raw`(?:Interrogs?\.|Interrogator(?:y|ies))\s+Nos?\.\s+\d+(?:\s*(?:${DASH}|,|&|and)\s*\d+)*`,
    String.raw`R\.\s+at\s+${NUMBERS}`,
    String.raw`J\.A\.\s+${NUMBERS}`,
    String.raw`Pet\.\s+App\.\s+\d+a(?:\s*${DASH}\s*\d+a)?`,
    // An appendix by its page, though not a court's "Cal. App." or "Pet. App.": "App. 45".
    String.raw`(?<![A-Z][a-z]{0,8}\.\s{0,2})App\.\s+\d+(?:\s*${DASH}\s*\d+)?(?!\w|\.\d)`,
    // The Ninth Circuit's excerpts of record: "2-ER-123", "1-SER-45–47".
    String.raw`\d{1,2}-(?:ER|SER|FER|EER)-\d+(?:\s*${DASH}\s*\d+)?`,
    // The docket: "ECF No. 45-2, at 3", "Dkt. 12 at 5", "Doc. 45 at 3", "R. Doc. 45",
    // "ECF No. 12, PageID.345".
    String.raw`(?:ECF|Dkt\.|(?:R\.\s+)?Doc\.)\s+(?:No\.\s+)?\d+(?:-\d+)?(?:,?\s*at\s+${NUMBERS})?(?:,?\s*Page\s?ID(?:\.|\s*#:?)\s*\d+(?:\s*${DASH}\s*\d+)?)?`,
  ]
    .map(source => `(?:${source})`)
    .join('|')})`,
  'g',
);
// California's record: (2 CT 360, 362) / (RT 14:2-22) / (2 CT 371 [Ostrander depo. at 44:3]).
// Without a volume or a line it must open a citation, so "the ER 3 times" is not one.
const RECORD_CSM = new RegExp(
  String.raw`(?<![\w.])(?:(\d{1,2})\s+)?(?:Supp\.\s*)?(?:CT|RT|AA|RA|JA|ER|SER|CR|AR|AOB|RB|ARB)\s+(\d+(?::\d+)?(?:\s*${DASH}\s*\d+(?::\d+)?)?(?:,\s*\d+(?::\d+)?(?:\s*${DASH}\s*\d+(?::\d+)?)?(?![\d:]|\s+[A-Z]))*)(?:,\s*¶\s*\d+)?(?:\s*\[[^\[\]\n]{1,80}\])?`,
  'g',
);
// The record by its page alone, where it opens a citation: "(R. 45.)", "(R. 45-46.)", and
// Illinois's common-law record, report of proceedings, appendix and supplements: "(C. 45;
// R. 12.)", "(A. 3.)", "(Sup. C. 3.)", "(SR 4.)". A word after the number ("(C. 45
// apples)") is prose.
const RECORD_PAGE = new RegExp(
  String.raw`(?<![\w.])(?:Sup\.\s+)?(?:R|C|A|SR|SC)\.?\s+${NUMBERS}(?!\w|\.\d|\s+[A-Za-z])`,
  'g',
);
// Treatises, dictionaries and other books, found by their edition: "(5th ed. 2012)".
const PARENTHESIS = /\(([^()\n]{1,60})\)/g;
const EDITION_NOTE =
  /(?:^|\s)(?:\d+(?:st|nd|rd|th|d)\s+|rev\.\s+)?eds?\.\s+(?:[^()]*\s)?(\d{4})$|^The\s+Rutter\s+Group\s+(\d{4})$/;
// California puts a treatise's topic and section after its edition: "6 Witkin, Summary of
// Cal. Law (11th ed. 2017) Torts, § 1234" / "… (The Rutter Group 2020) ¶ 9:123".
const BOOK_PIN_AFTER = sticky(
  String.raw`\s+(?:[A-Z][\w.'’]*(?:\s+(?:[A-Z][\w.'’]*|of|and|&|the|in|on)){0,5},\s+)?(§§?\s*${SEC}(?:\s*${DASH}\s*${SEC})?|¶¶?\s*\d+(?::\d+(?:\.\d+)?)?(?:\s*${DASH}\s*\d+(?::\d+(?:\.\d+)?)?)?)(?:,\s*pp?\.\s*\d+(?:-\d+)?(?:\s*${DASH}\s*\d+(?:-\d+)?)?)?`,
);
// California's jury instructions and Restatements: "CACI No. 1001", "Rest.2d Torts, §
// 402A, com. c".
const JURY_INSTRUCTION =
  /(?<![\w.])(?:CACI|CALCRIM|CALJIC|BAJI)\s+Nos?\.\s+\d+(?:\.\d+)?(?:\s*(?:[-–—,&]|and)\s*\d+(?:\.\d+)?)*/g;
const CSM_RESTATEMENT = new RegExp(
  String.raw`(?<![\w.])Rest\.\s?(?:2d|3d)?\s*[A-Z][\w.]*(?:\s+(?:[A-Z][\w.]*|of|and|&)){0,4},\s*§§?\s*${SEC}(?:,\s*(?:com\.|cmt\.|illus\.)\s*[a-z0-9]+)*`,
  'g',
);
// The section or page a book is cited at: "… Law § 13.03" / "… Dictionary 1710".
const BOOK_PIN = new RegExp(
  String.raw`\s+(§§?\s*${SEC}(?:\s*${DASH}\s*${SEC})?|\d+(?:\s*${DASH}\s*\d+)?)\s*$`,
);
// Restatement (Second) of Torts § 402A cmt. a (Am. L. Inst. 1965) / Restatement (Second) of
// Contracts § 195(1) (Am. L. Inst. 1981)
const RESTATEMENT = new RegExp(
  String.raw`(?<![\w.])Restatement\s+(?:\((?:First|Second|Third|Fourth)\)\s+)?of\s+(?:the\s+)?[A-Z][\w'’]*(?:\s+(?:[A-Z][\w'’]*|and|of|&|the)){0,6}?\s+§§?\s*${SEC}(?:\((?:\d{1,2}|[a-z]{1,3}|[A-Z])\))*(?:\s+cmts?\.\s*[a-z](?:,\s*illus\.\s*\d+)?)?(?:\s*\([^()\n]{0,40}(${YEAR})\))?`,
  'g',
);
// Agency guidance: an agency, a title, its question or part, and a date. "EEOC,
// Enforcement Guidance: Reasonable Accommodation …, Question 34 (Oct. 17, 2002)"
const TITLE_WORD = String.raw`(?:[A-Z][\w'’-]*|of|the|and|for|on|in|to|a|an|with|under|by)[:,]?`;
const GUIDANCE = new RegExp(
  String.raw`(?<![\w.])([A-Z]{2,8}),\s+(${TITLE_WORD}(?:\s+${TITLE_WORD}){1,30}?),?\s+(?:((?:Question|No\.|Part|pt\.|§|at)\s*[\w.*-]+),?\s+)?\(((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)`,
  'g',
);

// The signal right before a citation, in any case: "See", "but see", "See, e.g.,", "cf.",
// and California's "Accord," with its comma.
const SIGNAL_BEFORE =
  /(?:^|[\s;,(\[])((?:but\s+)?(?:see(?:\s+also|\s+generally|,\s*e\.g\.,)?|cf\.)|compare|accord,?|contra|e\.g\.,)\s+$/i;
const NAME_CONNECTORS = new Set([
  'of',
  'the',
  'for',
  'and',
  '&',
  'de',
  'la',
  'du',
  'van',
  'von',
  'ex',
  'parte', // "Ex parte Young"
  'rel.',
  'in',
  're',
  'In',
  'Re',
  'v.',
  'v', // English and Canadian style: "Donoghue v Stevenson"
  'vs.',
  'on',
  'behalf',
  'et',
  'al.',
  'al.,',
  'a/k/a',
  'd/b/a',
  'to',
  'by',
  'plc',
]);

// Capitalized words that begin sentences rather than case names. The parser walks back
// over them ("In Smith v. Jones, …", "Under United States v. …") and then drops them.
export const NOT_NAME = new Set(
  `A About According Accordingly After Again Also Although An And Applying As At Based Because
  Before Both But By Citing Compare Contra Despite Distinguishing Each Even Following For From
  Further Furthermore Given Here However In Indeed Like Likewise Moreover Notably Of On Only Or
  Per Quoting See Similarly Since So That The Then There These Thus This Those Though Through
  To Under Unlike When Where Whereas While With Within Yet`.split(/\s+/),
);

// A name with the sentence words in front of it removed: "Under United States" and "in
// Lakeside" become "United States" and "Lakeside". It keeps at least its last word, and
// "In re" stays whole.
export function stripLead(name) {
  for (;;) {
    const m = name.match(/^(\S+?),?\s+(?=\S)/);
    if (!m || /^In\s+re\b/.test(name)) return name;
    const word = m[1];
    const title = word[0].toUpperCase() + word.slice(1);
    if (!NOT_NAME.has(word) && !NOT_NAME.has(title) && !/^[a-z]/.test(word)) return name;
    name = name.slice(m[0].length);
  }
}

const MAX_PARENTHETICAL = 1500;
// The end of the balanced parenthesis or bracket that opens at i, or -1.
function closeOf(text, i) {
  const open = text[i];
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  // A parenthetical runs a few hundred characters at most; reading no further keeps a run
  // of unclosed ones after citations ("Id. at 1 (Id. at 1 (…") from each reading the rest.
  const last = Math.min(text.length, i + MAX_PARENTHETICAL);
  for (let j = i; j < last; j++) {
    if (text[j] === open) depth++;
    else if (text[j] === close && --depth === 0) return j + 1;
    else if (text[j] === '\n') return -1;
  }
  return -1;
}

// The words before `at`, read back as they are asked for: word(0) is the last, word(1)
// the one before it, each [text] with its `index`. A name is at most 24 words, so no more
// than 400 characters are read, and a word they cut is left out.
function wordsBefore(text, at) {
  const from = Math.max(0, at - 400);
  const read = [];
  let i = at;
  return k => {
    while (read.length <= k) {
      while (i > from && /\s/.test(text[i - 1])) i--;
      let j = i;
      while (j > from && !/\s/.test(text[j - 1])) j--;
      if (j === i || (j === from && from > 0 && !/\s/.test(text[from - 1]))) return undefined;
      const word = [text.slice(j, i)];
      word.index = j;
      read.push(word);
      i = j;
    }
    return read[k];
  };
}

// Whether the words from word(k) on, reading forward, start a known reporter ("127 | S.
// Ct. 1955").
function startsReporter(word, k) {
  let joined = '';
  for (let j = k; j >= 0 && j > k - 4; j--) {
    joined += word(j)[0].replace(/[,;]$/, '');
    if (isReporter(joined)) return true;
  }
  return false;
}

// How far back a parenthesized part of a name that ends at word(k) starts, or -1:
// "Starbucks (HK) Ltd", "Canada (Minister of Citizenship and Immigration) v Vavilov".
function nameParenthesis(word, k) {
  for (let j = k; j <= k + 8 && word(j); j++) {
    if (!word(j)[0].startsWith('(')) continue;
    const words = [];
    for (let m = j; m >= k; m--) words.push(word(m)[0].replace(/^\(|\)[,;]?$/g, ''));
    const named = words
      .filter(Boolean)
      .every(w => /^[A-Z][A-Za-z'’.&-]*$/.test(w) || NAME_CONNECTORS.has(w));
    return named && /^[A-Z]/.test(word(j + 1)?.[0] || '') ? j : -1;
  }
  return -1;
}

// Walks back from `at` over a case name ("Lakeside Resort Enters., LP v. Bd. of
// Supervisors of Palmyra Twp.,"). Returns the name's start, or `at` when there is none.
function nameStart(text, at, { needV = false, maxTokens = 24 } = {}) {
  const word = wordsBefore(text, at);
  let start = at;
  let sawV = false;
  let words = 0;
  for (let k = 0; word(k) && words < maxTokens; k++) {
    const raw = word(k)[0];
    const next = k > 0 ? word(k - 1)[0] : '';
    if (/\)[,;]?$/.test(raw) && /^(?:[A-Z]|v\.?$)/.test(next)) {
      const open = nameParenthesis(word, k);
      if (open >= 0) {
        start = word(open).index;
        words += open - k + 1;
        k = open;
        continue;
      }
    }
    if (/[:;]$/.test(raw)) break;
    const token = raw.replace(/,$/, '');
    // A quote or paren closes the sentence before, unless it ends a possessive inside the
    // name: "Hagstrom’s Food Stores", "Oswego Laborers’ Local 214".
    const possessive = /(?:['’]s|s['’])$/.test(token) && /^[A-Z0-9]/.test(next);
    if (/[”"’)\]]$/.test(token) && !possessive) break;
    const opener = token.match(/^[“"‘(\[]+/)?.[0] || '';
    const bare = token.slice(opener.length);
    // A docket number, a page or pin ("544,"), or a volume before its reporter is
    // citation, not name.
    if (/^Nos?\.$/.test(bare) && /^\d/.test(next)) break;
    if (/^\d+,$/.test(raw)) break;
    if (/^\d+$/.test(bare) && k > 0 && startsReporter(word, k - 1)) break;
    const capital = /^[A-Z0-9]/.test(bare);
    const connector = NAME_CONNECTORS.has(bare);
    if (!capital && !connector) break;
    if (/\.$/.test(bare) && !connector) {
      // A word with a period belongs to the name only if it is an abbreviation;
      // an entity suffix ends a name, so it cannot sit before a capitalized word.
      if (!isAbbreviation(bare) && !contractions.has(bare)) break;
      if (entitySuffixes.has(bare) && /^[A-Z]/.test(next) && !/^v\.?$/.test(next)) break;
    }
    if (/^(?:See|Cf\.|But|Compare|Accord|Contra|E\.g\.,?|Quoting|Citing)$/.test(bare)) break;
    if (/^(?:v\.?|vs\.|In|Re|rel\.|parte)$/.test(bare)) sawV = true;
    start = word(k).index + opener.length;
    words++;
    if (opener) break; // "(Smith v. Jones" or "“Smith": the name starts here
  }
  if (needV && !sawV) return at;
  return start;
}

// A court before "in" that leads into a case name: "This Court in Smith v. Jones", "the
// Ninth Circuit in …". The court is the sentence's, not the name's.
const COURT_IN =
  /^(?:[A-Z][\w'’.]*\s+){0,3}?(?:Court|Circuit|Board|Commission|Tribunal|Panel|Justices?|Judges?|Majority|Plurality|Congress|Legislature)['’]?s?\s+in\s+(?=[A-Z])/;

// The case name that ends at `end`, without the sentence words before it, or null.
function caseNameBefore(text, end, options) {
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  const s = nameStart(text, end, options);
  if (s >= end) return null;
  const raw = text.slice(s, end);
  let name = stripLead(raw);
  const court = name.match(COURT_IN);
  if (court && /\sv\.?\s|^(?:In\s+re|Ex\s+parte)\s/.test(name.slice(court[0].length)))
    name = name.slice(court[0].length);
  if (!(options.needV ? /^[A-Z0-9]/ : /^[A-Z]/).test(name)) return null;
  if (options.needV && !/\sv\.?\s|\svs\.\s|^(?:In\s+re|Re|Ex\s+parte)\s|\bex\s+rel\./.test(name))
    return null;
  return { start: end - name.length, name };
}

// A parenthetical that names the case for short: California's "(Aguilar)" or
// "(hereafter Aguilar)", Bluebook's "[hereinafter Restatement]".
function shortTitleOf(inner, name) {
  const after = inner.match(/^here(?:in)?after,?\s+[“"]?(.+?)[”"]?$/i);
  if (after) return after[1];
  const words = inner.match(/^[“"]?([A-Z][\w'’.&-]*(?:\s+[A-Z][\w'’.&-]*){0,2})[”"]?$/);
  if (!words || !name) return null;
  const re = new RegExp(
    String.raw`(?<!\w)${words[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\w)`,
  );
  return re.test(name) ? words[1] : null;
}

// The explanatory parentheticals after a citation, "(quoting …)" / "(emphasis added)", and
// California's ", internal quotation marks omitted". A first parenthetical that names the
// case is its short title instead.
function parentheticalsAfter(text, end, name = null) {
  const parentheticals = [];
  let shortTitle = null;
  for (;;) {
    const gap = matchAt(PAREN_NEXT, text, end);
    if (!gap) break;
    const open = end + gap[0].length;
    const close = closeOf(text, open);
    if (close < 0) break;
    const inner = text.slice(open + 1, close - 1);
    const title = shortTitle === null && !parentheticals.length ? shortTitleOf(inner, name) : null;
    if (title) shortTitle = title;
    else parentheticals.push(inner);
    end = close;
  }
  for (let note, k = 0; k < 3 && (note = matchAt(CSM_NOTE, text, end)); k++) {
    parentheticals.push(note[1]);
    end += note[0].length;
  }
  return { end, parentheticals, shortTitle };
}

// The pins after a case's core, from `end`: ", 860" / ", at 5" / ", 570".
function pinsAt(text, end, short, firstPage) {
  if (short) {
    const more = matchAt(SHORT_MORE, text, end);
    return { pin: firstPage + more[0], end: end + more[0].length };
  }
  const pins = matchAt(PINS_AFTER, text, end);
  if (!pins) return { pin: null, end };
  return { pin: pins[0].replace(/^,\s*(?:at\s+)?(?:pp?\.\s*)?/, ''), end: end + pins[0].length };
}

const SMALL_WORDS = /^(?:of|the|and|for|on|in|to|a|an|with|under|by|at|from|or|via|&)$/;
// A title capitalizes its words: "Rethinking Essential Functions", not "the textbook".
const titleLike = title =>
  title
    .split(/\s+/)
    .every(word => !/^[a-z]/.test(word) || SMALL_WORDS.test(word.replace(/[,:;]$/, '')));
// An author, with a volume before it for a treatise: "Jane Roe", "5B Charles Alan Wright &
// Arthur R. Miller", "Barbara T. Lindemann et al.".
const AUTHOR =
  /^(?:\d+[A-Z]?\s+)?[A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|&|and|et|al\.|de|van|von|der|la)){0,8}$/;

// The author and title before a law review article or a book, "Jane Roe, Rethinking
// Essential Functions" / "1 Barbara T. Lindemann et al., Employment Discrimination Law".
// They run back to the start of the clause: a semicolon, an opening bracket or quotation
// mark, the end of the sentence before, and then past a signal. Null when what is there
// is prose.
function sourceBefore(text, at) {
  const from = Math.max(0, at - 300);
  const window = text.slice(from, at);
  // The last boundary, read from the end so a long run of abbreviations is not re-read.
  const boundaries = [...window.matchAll(/[;(\[“"\n]|[.!?]["”’)]?\s+(?=[A-Z0-9])/g)];
  let cut = 0;
  for (let k = boundaries.length - 1; k >= 0; k--) {
    const m = boundaries[k];
    // "et al." and "Barbara T. Lindemann" do not end a sentence.
    if (m[0][0] === '.' && isAbbreviation(lastToken(window.slice(0, m.index + 1)))) continue;
    cut = m.index + m[0].length;
    break;
  }
  if (from > 0 && cut === 0) return null;
  let segment = window.slice(cut);
  const lead = segment.match(
    /^\s*(?:(?:(?:but\s+)?(?:see(?:\s+also|\s+generally|,?\s+e\.g\.,)?|cf\.)|compare|accord|contra|e\.g\.,|quoting|citing)\s+)?/i,
  )[0];
  segment = segment.slice(lead.length).trimEnd();
  let start = from + cut + lead.length;
  const parts = segment.match(/^([^,]{1,80}),\s+(\S[\s\S]*)$/);
  if (parts && AUTHOR.test(parts[1])) {
    if (!titleLike(parts[2])) return null;
    return { start, author: parts[1].replace(/^\d+[A-Z]?\s+/, ''), title: parts[2] };
  }
  if (parts && parts[1].split(/\s+/).some(w => /^[a-z]/.test(w) && !SMALL_WORDS.test(w))) {
    // "As one article explains, Rethinking …": the title starts after the prose.
    start += parts[0].length - parts[2].length;
    segment = parts[2];
  }
  if (!/^[A-Z0-9“"]/.test(segment) || !titleLike(segment)) return null;
  return { start, author: null, title: segment };
}

// A case has a few parallel citations at most; reading no more than this keeps a long run
// of them ("1 F.3d 2, 1 F.3d 2, …") from being walked again from each.
const MAX_PARALLELS = 6;

// A case citation from its core: the name before it, its pins and parallel citations,
// the court and date, and its parentheticals. Null when the core is not a citation. The
// parallel citations' cores go into `consumed` once the citation is read, so they are not
// read again as cases of their own.
function readCase(text, core, coreAt, consumed) {
  const { short } = core;
  let { pin, end } = pinsAt(text, core.end, short, core.page);
  const para = core.court ? matchAt(PARA_PIN, text, end) : null;
  if (para) {
    pin = para[1];
    end += para[0].length;
  }
  // Parallel citations: "550 U.S. 544, 570, 127 S. Ct. 1955, 167 L. Ed. 2d 929", and a
  // Canadian report after a neutral citation: "2016 SCC 27, [2016] 1 SCR 631".
  const parallel = [];
  const taken = [];
  while (parallel.length < MAX_PARALLELS) {
    const comma = matchAt(COMMA, text, end);
    const next = comma && coreAt.get(end + comma[0].length);
    if (!next || next.short !== short || consumed.has(next)) break;
    const read = pinsAt(text, next.end, short, next.page);
    parallel.push({
      volume: next.volume,
      reporter: next.reporter,
      page: short ? null : next.page,
      pin: read.pin,
    });
    taken.push(next);
    end = read.end;
  }
  // California's bracketed parallels: "25 Cal.4th 826, 860 [107 Cal.Rptr.2d 841, 24 P.3d 493]".
  const bracket = matchAt(BRACKET_OPEN, text, end);
  if (bracket && core.form === 'reporter') {
    const list = [];
    let at = end + bracket[0].length;
    while (list.length < MAX_PARALLELS) {
      const next = coreAt.get(at);
      if (!next || next.short || next.form !== 'reporter' || consumed.has(next)) break;
      const read = pinsAt(text, next.end, false, next.page);
      list.push({ core: next, pin: read.pin });
      const comma = matchAt(COMMA, text, read.end);
      if (comma && coreAt.has(read.end + comma[0].length)) {
        at = read.end + comma[0].length;
        continue;
      }
      const close = matchAt(BRACKET_CLOSE, text, read.end);
      if (close) {
        for (const item of list) {
          const { volume, reporter, page } = item.core;
          parallel.push({ volume, reporter, page, pin: item.pin });
          taken.push(item.core);
        }
        end = read.end + close[0].length;
      }
      break;
    }
  }
  // The name: after a comma (Bluebook, and neutral citations: "R v Oakes, 2019 SCC 65"),
  // before "(2001)" (California, old English reports), or right before a bracketed year
  // ("Donoghue v Stevenson [1932] AC 562").
  const lookFrom = Math.max(0, core.start - 120);
  const before = text.slice(lookFrom, core.start);
  let year = core.year || null;
  let court =
    core.court || (NEUTRAL_COURTS.test(core.reporter) ? core.reporter.replace(/\s+/g, ' ') : null);
  let date = null;
  let nameEnd = -1;
  let yearBefore = null;
  const comma = before.match(/,\s*$/);
  if (comma) nameEnd = core.start - comma[0].length;
  else if (core.form === 'reporter' && (yearBefore = before.match(YEAR_BEFORE))) {
    court = yearBefore[1].trim() || null;
    date = yearBefore[2];
    year = yearBefore[3];
    nameEnd = lookFrom + yearBefore.index;
  } else if (core.form === 'bracket') nameEnd = core.start;
  // An unknown reporter must look like one: a period and a case name or court ("95 Eng.
  // Rep. 807 (C.P. 1765)"), or a year before it ("(1854) 9 Exch 341"). "1 Cor. 13" is not.
  const known = core.form !== 'reporter' || isReporter(core.reporter);
  if (!known && !short && !/\./.test(core.reporter) && !yearBefore) return null;
  let start = yearBefore ? lookFrom + yearBefore.index : core.start;
  let name = null;
  // A public-domain citation's short form repeats it after the name: "Doe, 2020 IL
  // 124112, ¶ 22".
  let named = false;
  if (nameEnd >= 0) {
    let found = caseNameBefore(text, nameEnd, { needV: !short, maxTokens: short ? 5 : 24 });
    if (!found && core.court && comma) {
      found = caseNameBefore(text, nameEnd, { maxTokens: 5 });
      named = Boolean(found);
    }
    if (found) {
      start = found.start;
      name = found.name;
    }
  }
  const english = (core.form !== 'reporter' && !core.court) || (yearBefore && !known);
  if (!known) {
    const courtAfter = Boolean(matchAt(COURT_AFTER, text, end));
    const ok = short
      ? Boolean(name)
      : /\./.test(core.reporter)
        ? Boolean(name) || courtAfter || Boolean(yearBefore)
        : Boolean(yearBefore);
    if (!ok) return null;
  }
  let history = null;
  if (!yearBefore) {
    const paren = matchAt(COURT_AFTER, text, end);
    if (paren) {
      court = paren[1].trim() || court;
      date = paren[2];
      year = paren[3];
      if (paren[4]) history = [paren[4]]; // Texas's "pet. denied"
      end += paren[0].length;
    }
  }
  if (english) {
    const division = matchAt(COURT_NO_YEAR, text, end);
    if (division) {
      court = court ? `${court} (${division[1]})` : division[1];
      end += division[0].length;
    }
    const uk = matchAt(UK_PIN_AFTER, text, end);
    if (uk) {
      pin = [pin, uk[1] || uk[2]].filter(Boolean).join(', ');
      end += uk[0].length;
    }
  }
  const district = core.reporter === 'Ohio' ? matchAt(OHIO_DISTRICT, text, end) : null;
  if (district) {
    court = `Ohio Ct. App. (${district[1]})`;
    end += district[0].length;
  }
  const parenFrom = end;
  const after = parentheticalsAfter(text, end, name);
  end = after.end;
  const parties = named ? null : name?.split(/\s+v\.?\s+/);
  for (const other of taken) consumed.add(other);
  return {
    cite: {
      type: short || named ? 'short' : 'full',
      start,
      end,
      text: text.slice(start, end),
      core: [core.start, core.end],
      volume: core.volume,
      reporter: core.reporter,
      page: short ? null : core.page,
      pin,
      court,
      year,
      date,
      known,
      name,
      plaintiff: parties?.length === 2 ? parties[0] : null,
      defendant: parties?.length === 2 ? parties[1] : null,
      antecedent: short || named ? name : null,
      signal: null,
      parentheticals: after.parentheticals,
      parallel,
      shortTitle: after.shortTitle,
      ...(core.neutral ? { neutral: true } : {}),
      ...(history ? { history } : {}),
    },
    parenFrom,
  };
}

// A law review or journal article: "Jane Roe, Rethinking Essential Functions, 100 Harv. L.
// Rev. 1, 15 (1987)".
function readPeriodical(text, core) {
  let { pin, end } = pinsAt(text, core.end, false, core.page);
  let year = null;
  const paren = matchAt(COURT_AFTER, text, end);
  if (paren) {
    year = paren[3];
    end += paren[0].length;
  }
  const parenFrom = end;
  const after = parentheticalsAfter(text, end);
  const comma = text.slice(Math.max(0, core.start - 4), core.start).match(/,\s*$/);
  const source = comma ? sourceBefore(text, core.start - comma[0].length) : null;
  const start = source ? source.start : core.start;
  return {
    cite: {
      type: 'periodical',
      start,
      end: after.end,
      text: text.slice(start, after.end),
      core: [core.start, core.end],
      author: source?.author || null,
      title: source?.title || null,
      volume: core.volume,
      reporter: core.reporter,
      page: core.page,
      pin,
      year,
      signal: null,
      parentheticals: after.parentheticals,
    },
    parenFrom,
  };
}

// A section that refers to part of a document rather than a code: "Agreement § 4.2",
// "this Section 4", "§ 4.3 of the MSA", "Section 12.2". Returns the citation's start, or -1
// when the section is not internal. A bare "Section 349" is not read at all.
function internalAt(text, m) {
  const before = text.slice(Math.max(0, m.index - 40), m.index);
  const noun = before.match(/(?:^|[^\w.])([A-Z][A-Za-z]+)\s+$/);
  if (noun && DOCUMENTS.has(noun[1])) return m.index - noun[0].length + noun[0].indexOf(noun[1]);
  if (/\b(?:this|that|such|said|any|each)\s+$/i.test(before)) return m.index;
  const of = text.slice(m.index + m[0].length, m.index + m[0].length + 60);
  // "§ 4.2 of the Statement of Work": the name's last word, or its first ("of the Lease
  // Agreement", "of the Agreement of Sale").
  const owner = of.match(
    /^\s+of\s+(?:the|this|that|such|each)\s+([A-Z][A-Za-z]+(?:\s+(?:of|and|&)?\s*[A-Z][A-Za-z]+){0,3})/,
  );
  const named = owner?.[1].split(/\s+/).filter(word => /^[A-Z]/.test(word));
  if (named && (DOCUMENTS.has(named[0]) || DOCUMENTS.has(named.at(-1)))) return m.index;
  // Contract numbering: "Section 4.2(b)", "Section 12.2".
  if (/^Sections?\s+\d{1,2}\.\d{1,3}(?!\d)/.test(m[0])) return m.index;
  return -1;
}

// The sentence around [start, end], roughly: from the last sentence end before it, at most
// 300 characters back, to the next sentence end, at most 200 characters on.
function sentenceAround(text, start, end) {
  const from = Math.max(0, start - 300);
  const before = text.slice(from, start);
  // The last boundary, read from the end; a period after an abbreviation is none.
  const boundaries = [...before.matchAll(/[.!?]["”’)]?\s+(?=["“(]?[A-Z0-9])|\n/g)];
  let cut = 0;
  for (let k = boundaries.length - 1; k >= 0; k--) {
    const m = boundaries[k];
    const word = before.slice(Math.max(0, m.index - 24), m.index + 1).match(/[^\s“"‘(\[]*$/)[0];
    if (m[0][0] === '.' && isAbbreviation(word)) continue;
    cut = m.index + m[0].length;
    break;
  }
  const after = text.slice(end, end + 200);
  const stop = after.search(/[.!?](?:["”’)]*\s|$)|\n/);
  return text.slice(from + cut, stop < 0 ? end + after.length : end + stop);
}

// ---------------------------------------------------------------------------
// Citations in forms the parser does not know
// ---------------------------------------------------------------------------

// A citation in a form no pattern above reads still looks like one: numbers, section and
// paragraph marks, abbreviations and acronyms run together ("Resp. to Interrog. No. 3",
// "SAC ¶ 12", "735 ILCS 5/2-619"). findCitations keeps such a run as an 'unparsed'
// citation, so the guard and the views never depend on the parser knowing every form.

// Words that may sit inside a run without making it a citation: "at 5", "vol. 2", "ch.
// 93A", "rule 8.204", and "No. 23" ("jersey No. 23" is prose). Roman numerals, single
// letters ("Ex. A"), ordinals ("Cal. 4th"), a dash in a range and the titles before a
// name ("Gen. 1:1" is Genesis, and "Gen." a general) may sit inside too.
const RUN_INSIDE = new Set(
  `at of to and & et seq. vol. Vol. vols. no. No. nos. Nos. p. pp. n. nn. para para. paras.
  Para. supp. ch. Ch. chs. rule rules pt. Pt. pts. art. Art. arts. sec. Sec. secs. cl. fig.
  Fig. ed. eds. tit. Tit. - – Gen. Col. Lt. Sgt. Capt. Cpl. Pvt. Cmdr. Supt. Maj. Adm. Gov.
  Sen. Hon. Msgr. Prof. Profs.`.split(/\s+/),
);
// Abbreviations of ordinary prose, which end a run: times, Latin, honorifics, months,
// measures and addresses ("3 p.m.", "approx. 40", "Dr. Ruiz", "Mar. 3", "350 F.", "10
// min.", "Tel. 555-1234", "Apt. 4"), and the endings of a company's name.
const RUN_BREAKS = new Set(
  `a.m. p.m. A.M. P.M. AM PM EST EDT CST CDT MST MDT PST PDT ET PT UTC GMT etc. e.g. E.g. i.e.
  I.e. e.g., i.e., viz. approx. ca. c. v. vs. Dr. Drs. Mr. Mrs. Ms. Messrs. Mmes. St. Mt. Ft.
  Jan. Feb. Mar. Apr. Jun. Jul. Aug. Sep. Sept. Oct. Nov. Dec. in. ft. yd. yds. mi. oz. lb.
  lbs. tsp. tbsp. Tbsp. qt. qts. gal. gals. hr. hrs. min. mins. secs. mm. cm. km. kg. mg. ml.
  g. sq. cu. deg. doz. mph. pkg. pc. pcs. Tel. tel. Ph. Fax. Ext. ext. Apt. Ste. Rm. Fl.
  Bldg. Ave. Blvd. Rd. Hwy. Rte. Pkwy. Ln. LLC LLP LP PLC INC CORP LTD`.split(/\s+/),
);
const PLAIN_YEAR = /^(?:1[6-9]|20)\d\d$/;
// The states' postal codes, which with a ZIP code after them are an address.
const POSTAL_STATES = new Set(
  `AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ
  NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI`.split(/\s+/),
);

// A whitespace-delimited token: the opening brackets or quotes before it (`lead`), its core
// ([start, end]), and whether what follows its core ends a citation (`stop`): a sentence's
// period after a number ("45."), a semicolon, a closing quote, or a bracket it did not open.
function runToken(raw, at) {
  const lead = raw.match(/^[(\[“"‘]*/)[0];
  let body = raw.slice(lead.length);
  let stop = false;
  // A sentence that starts with no space after a citation's period ("§ 3602(c).The") is
  // not part of the citation.
  const glued = body.search(/[\d)\]]\.[A-Z][a-z]/);
  if (glued >= 0) {
    body = body.slice(0, glued + 1);
    stop = true;
  }
  let end = body.length;
  while (end > 0) {
    const c = body[end - 1];
    if (c === ',' || c === ':') end--;
    else if (c === ';' || c === '”' || c === '"') {
      end--;
      stop = true;
    } else if (c === ')' || c === ']') {
      const part = body.slice(0, end);
      const open = c === ')' ? '(' : '[';
      if (part.split(c).length <= part.split(open).length) break;
      end--;
      stop = true;
    } else if (c === '.' && /[\d)\]]/.test(body[end - 2] || '')) {
      end--;
      stop = true;
    } else break;
  }
  const core = body.slice(0, end);
  return { at, raw, lead, core, start: at + lead.length, end: at + lead.length + end, stop };
}

// What a token's core is in a run: 'num' (a digit: 45:3-9, 5/2-619, 2-ER-123, 14,028),
// 'mark' (§, ¶), 'abbr' (an abbreviation a list knows, "Pl.'s", "Opp'n"), 'word.' (a
// capitalized word with a period that no list knows, which is an abbreviation only beside
// one that is: "Resp. to Interrog."), 'acro' (SAC, ILCS, PX), 'inside' (RUN_INSIDE, a
// roman numeral, a letter), or null, which ends a run.
function runClass(core) {
  if (!core) return null;
  if (/^(?:§§?|¶¶?)$/.test(core)) return 'mark';
  if (/\d/.test(core)) {
    if (/^[$€£¥]|[%°]|\d(?:am|pm)$/i.test(core)) return null;
    if (/^\d+(?:st|nd|rd|th|d)$/.test(core)) return 'inside'; // "(11th ed.", "Cal. 4th"
    return /^[§¶]/.test(core) ? 'mark' : 'num';
  }
  if (RUN_BREAKS.has(core) || entitySuffixes.has(core)) return null;
  if (RUN_INSIDE.has(core) || /^(?:[IVXLC]{1,6}|[A-Z])$/.test(core)) return 'inside';
  if (core.endsWith('.')) {
    if (isAbbreviation(core)) return 'abbr';
    return /^[A-Z][a-z]{1,7}\.$/.test(core) ? 'word.' : null;
  }
  if (/^[A-Z][a-z]{0,6}\.['’]s?$/.test(core) || contractions.has(core)) return 'abbr';
  if (/^[A-Z][A-Z-]{1,7}$/.test(core) && core.replace(/-/g, '').length <= 6) return 'acro';
  return null;
}

// A run of acronyms and numbers with no abbreviation or mark is a citation only in the
// shapes citations take: a number right before and right after the acronym ("735 ILCS
// 5/2-619", "2020 IL 124112"), or a number and a pin after "at" ("PX 12 at 3"). "COVID 19",
// "ISO 9001", "2 GB of MP3" and "30 PTS and 12" are prose.
function acronymCitation(tokens) {
  const number = t => t?.cls === 'num' && /^\d/.test(t.core);
  return tokens.some(
    (t, k) =>
      t.cls === 'acro' &&
      number(tokens[k + 1]) &&
      (number(tokens[k - 1]) || (tokens[k + 2]?.core === 'at' && number(tokens[k + 3]))),
  );
}

// A two-word run of an abbreviation and a number is a citation only when the abbreviation
// is an initialism that names no place ("H.R. 1234", "S.B. 5") or a record's ("App. 45",
// "Doc. 45"); "Pat. 3", "Ann. 5" and "U.S. 50 states" are prose.
const RECORD_WORDS = new Set(['App.', 'Doc.', 'Docs.', 'Rec.', 'Dkt.', 'Att.', 'Encl.']);
const PLACES = new Set(['U.S.', 'U.K.', 'E.U.', 'D.C.', 'N.Y.', 'N.J.', 'N.C.', 'S.C.', 'L.A.']);
const pairCitation = word =>
  RECORD_WORDS.has(word) || (/^(?:[A-Z]\.){2,}$/.test(word) && !PLACES.has(word));

// The run's citation, [start, end], or null when it is prose. The words that may only sit
// inside a run are trimmed from its ends, though a numeral or letter after one stays
// ("supp. I", "Ex. A"). It needs a number or a mark, an abbreviation, an acronym in a
// citation's shape, or a mark, and 2 to 14 tokens. Not a citation: a run whose only
// numbers are years ("U.S. 2020"), or two words that are a count, a measure or a name and
// a number ("48 U.S. states", "350 F.", "Pat. 3", "D.C. 20001").
function runCitation(run) {
  let i = 0;
  let j = run.length;
  while (i < j && (run[i].cls === 'inside' || run[i].cls === 'paren')) i++;
  while (j > i && run[j - 1].cls === 'inside') {
    const last = run[j - 1].core;
    const before = run[j - 2];
    const label = /^(?:[IVXLC]{1,6}|[A-Z])$/.test(last);
    if (label && before && j - 2 >= i && (RUN_INSIDE.has(before.core) || before.cls === 'abbr'))
      break;
    j--;
  }
  const tokens = run.slice(i, j);
  if (tokens.length < 2 || tokens.length > 14) return null;
  const nums = tokens.filter(t => t.cls === 'num');
  const mark = tokens.some(t => t.cls === 'mark');
  if (!nums.length && !mark) return null;
  if (!mark && !tokens.some(t => t.cls === 'abbr') && !acronymCitation(tokens)) return null;
  if (!mark && nums.every(t => PLAIN_YEAR.test(t.core))) return null;
  const words = tokens.filter(t => t.cls !== 'paren');
  if (!mark && words.length === 2) {
    // A number and then an abbreviation is a count or a measure, not a citation, which
    // names its source first or has a page after it: "48 U.S. states", "350 F. (175 °C)".
    if (words[0].cls === 'num') return null;
    if (words[0].cls === 'abbr' && !pairCitation(words[0].core)) return null;
  }
  return [tokens[0].start, tokens.at(-1).end];
}

// The citation-shaped runs of `text`, as [start, end], outside the spans in `skip` (sorted
// [start, end] pairs that a run may not touch, the citations already read). A run ends at
// a token that is not citation-shaped, a line break, a semicolon, a sentence's period
// after a number, or a bracket it did not open; a parenthetical with a digit in it sits
// inside a run ("(2019–2020 Reg. Sess.)", "(Am. L. Inst. 1985)").
function runsIn(text, skip = []) {
  if (!/[\d§¶]/.test(text)) return []; // a run needs a number or a mark
  const tokens = [...text.matchAll(/\S+/g)].map(m => runToken(m[0], m.index));
  const closes = /[(\[]/.test(text) ? new Map(parenSpans(text)) : new Map();
  let s = 0; // the first span in `skip` that may still touch a token
  const touches = (start, end) => {
    while (s < skip.length && skip[s][1] <= start) s++;
    return s < skip.length && skip[s][0] < end;
  };
  const strong = run => run.some(t => t.cls === 'abbr' || t.cls === 'mark' || t.cls === 'acro');
  const found = [];
  let run = [];
  const finish = () => {
    const cite = run.length ? runCitation(run) : null;
    if (cite) {
      // The capitalized words of a title before its first abbreviation or acronym belong
      // to it: "Joint Stip. ¶ 4", "Order Granting Mot. ¶ 3".
      const first = run.find(t => t.start === cite[0]);
      if (first && (first.cls === 'abbr' || first.cls === 'acro') && !first.lead) {
        for (let k = first.k - 1; k >= 0 && k >= first.k - 3; k--) {
          const word = tokens[k];
          if (word.blocked || !/^[A-Z][a-z]+$/.test(word.raw) || NOT_NAME.has(word.raw)) break;
          if (text.slice(word.end, tokens[k + 1].at).includes('\n')) break;
          cite[0] = word.start;
        }
      }
      found.push(cite);
    }
    run = [];
  };
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (run.length && text.slice(run.at(-1).end, t.start).includes('\n')) finish();
    if (run.length && t.lead) {
      // A parenthetical inside the run, kept when it holds a digit and no citation.
      const open = t.at + Math.max(t.lead.lastIndexOf('('), t.lead.lastIndexOf('['));
      const close = t.lead.length === 1 ? closes.get(open) : undefined;
      const inner = close === undefined ? '' : text.slice(open + 1, close - 1);
      if (
        close - open <= 80 &&
        /\d/.test(inner) &&
        !inner.includes('\n') &&
        !touches(open, close)
      ) {
        run.push({ cls: 'paren', core: inner, start: open, end: close });
        while (k + 1 < tokens.length && tokens[k + 1].at < close) k++;
        if (!/^[,:]?(?:\s|$)/.test(text.slice(close, close + 2))) finish();
        continue;
      }
      finish();
    }
    if ((t.blocked = touches(t.start, t.end))) {
      finish();
      continue;
    }
    let cls = runClass(t.core);
    if (cls === 'word.') {
      // An unlisted word with a period counts beside a listed abbreviation or a mark
      // ("Resp. to Interrog.", "Joint Stip. ¶ 4"). Before a capitalized abbreviation, it
      // may as well end the sentence before a citation ("in Queens. Compl. ¶ 9").
      const next = tokens[k + 1];
      const nextCls = next && !next.lead ? runClass(next.core) : null;
      const lower = nextCls === 'abbr' && /^[a-z]/.test(next.core);
      cls = strong(run) || lower || nextCls === 'mark' ? 'abbr' : null;
    }
    // A state's postal code and a ZIP code are an address: "San Francisco, CA 94103".
    if (
      cls === 'acro' &&
      POSTAL_STATES.has(t.core) &&
      /^\d{5}(?:-\d{4})?$/.test(tokens[k + 1]?.core || '') &&
      !PLAIN_YEAR.test(tokens[k - 1]?.core || '')
    ) {
      finish();
      tokens[k + 1].blocked = true;
      k++;
      continue;
    }
    if (!cls) {
      finish();
      continue;
    }
    run.push({ ...t, cls, k });
    if (t.stop) finish();
  }
  finish();
  return found;
}

// Every citation-shaped run in `text`, as [start, end], whether or not the parser reads it
// as a citation: what a rewrite must keep word for word ("Fed. R. App. P. 4(a)(1)(A)",
// "SAC ¶ 12", "12 C.F.R. pt. 1026, supp. I").
export function citationRuns(text) {
  return runsIn(text);
}

// What a whitespace-delimited token is in a citation-shaped run (see runClass), with the
// brackets, quotes and punctuation around it ignored: 'num', 'mark', 'abbr', 'word.' (a
// capitalized word with a period that counts only beside an abbreviation), 'acro',
// 'inside' (a word that may sit inside a run without making it one), or null (prose).
export function citationTokenClass(token) {
  return runClass(runToken(token, 0).core);
}

// What a citation reads as, by type. Every citation has {type, start, end, text, signal},
// where `signal` is the signal written right before it ("See", "but see", "Cf."), and
// `nested: true` with `within` (the index of the citation it sits in) when it is inside
// another's parenthetical ("(quoting …)"). A statute, section, record, secondary,
// legislative or unparsed citation followed by explanatory parentheticals ("28 U.S.C. §
// 1291 (granting jurisdiction over final decisions)") takes them in, as a case does: its
// text and end run through them, `parentheticals` lists them, and `body` is its text
// without them, which its key and name come from. The types and their other fields:
//
// - full: a case. core ([start, end] of VOLUME REPORTER PAGE), volume, reporter, page, pin,
//   parallel ([{volume, reporter, page, pin}], the same case in other reporters, Bluebook's
//   "550 U.S. 544, 127 S. Ct. 1955" and California's "[107 Cal.Rptr.2d 841]"), court,
//   year, date (as written in the court parenthetical: "2019" or "Mar. 5, 2019"), known
//   (a listed reporter), name, plaintiff, defendant, antecedent (null), shortTitle
//   (California's "(Aguilar)" or a "[hereinafter X]"), parentheticals. English reports and
//   neutral citations are full citations too: "[1990] 1 WLR 491" has volume "[1990] 1",
//   "[2015] UKSC 31" volume "[2015]" and court "UKSC", "2019 SCC 65" volume "2019". So are
//   US public-domain citations, "People v. Doe, 2020 IL 124112, ¶ 20, 150 N.E.3d 1" (volume
//   "2020", reporter "IL", page "124112", pin "¶ 20", court "Ill.", the court a citation
//   names: "Ill. App. Ct." for "IL App (1st)", "Ohio Ct. App. (8th Dist.)" for
//   "2021-Ohio-1234, ¶ 15 (8th Dist.)"). A neutral citation, whose number names the case,
//   has `neutral: true`, and its key includes the number. A case (full, short, docket or
//   database) with subsequent history has `history`, each as written: ["aff’d, 535 U.S. 1
//   (2002)"], ["cert. denied"], or Texas's petition history in the court parenthetical,
//   ["pet. denied"]; the later decision is part of the citation, not one of its own.
// - short: "Lakeside, 455 F.3d at 159" / "Ortega, 26 Cal.4th at p. 1206". The same fields,
//   with page, court and year null and antecedent the name before it ("Lakeside"). A
//   short form of a Westlaw or Lexis case ("Meridian Produce, 2019 WL 1234567, at *3") has
//   `database` ("2019 WL 1234567, at *3"), volume (the year) and reporter "WL" or "LEXIS".
//   A public-domain citation repeated after a name, "Doe, 2020 IL 124112, ¶ 22", is a short
//   form that keeps its page and court.
// - docket: a named unreported case, "Smith v. Jones, No. 2:13-cv-00114 (JPO), 2015 WL
//   1234567, at *3 (W.D. Pa. Jan. 5, 2015) (dismissing …)", or one cited only by its
//   database number, "Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6
//   (S.D.N.Y. Sept. 27, 2021)". docket ("No. 2:13-cv-00114", or null), database (through
//   its pin), pin ("*3", or a slip opinion's page: "No. 21-1234, slip op. at 5"), name,
//   plaintiff, defendant, court, year, date, parentheticals.
// - docket-number: a docket number with no name, kept only with a database cite, a slip
//   opinion, a court parenthetical, a docket shape ("1:26-cv-03317") or a docket word
//   ("Case No."; not "Claim No."): the docket fields, with name, plaintiff and defendant
//   null.
// - database: a bare database cite, "2018 WL 3456789, at *4": database, pin.
// - statute: a code, regulation, constitution, rule, session law or Federal Register cite,
//   in Bluebook or California form ("Evid. Code, § 452, subd. (d)"), and Canadian and UK
//   statutes ("RSC 1985, c T-13, s 19", "Theft Act 1968, s 1(1)"). Among them: "Treas. Reg.
//   § 1.162-1(a)", "735 ILCS 5/2-619", "Mass. Gen. Laws ch. 93A", "G.L. c. 93A, § 2",
//   "U.C.C. § 2-207 (Am. L. Inst. & Unif. L. Comm’n 2022)", "Sup. Ct. R. 10", "S.D.N.Y.
//   Local Civ. R. 6.3", "Fed. R. App. P. 4(a)(1)(A)", "Exec. Order No. 14,028, 86 Fed. Reg.
//   26,633 (May 12, 2021)", "12 C.F.R. pt. 1026, supp. I", "Stats. 2019, ch. 296, § 2".
// - section: a bare "§ 3602(c)" or "§§ 4.2, 9.1" that may stand for a statute.
// - internal: a section of the document itself or of a contract it discusses: "Agreement
//   § 4.2", "§ 4.3 of the MSA", "this § 12", "Section 4.2(b)", "Code of Conduct § 2", "§ 3
//   of the Statement of Work", and a bare "§ 3" in a sentence that names a Lease,
//   Agreement, Contract, Policy, Plan, Bylaws or Charter and no code. Not an authority.
// - id: "Id. at 5", "Id. at p. 843", "Id. § 12102(2)(B)", "Id. ¶¶ 30–31", "Id. at p. 6, fn.
//   3": pin, parentheticals.
// - supra: "Smith, supra, at 5", "Roe, supra note 4, at 22", "Ortega, supra, 26 Cal.4th at
//   p. 1206, italics added": antecedent, note, volume, reporter, pin (a page, "§ 13.03" or
//   "¶ 5"), parentheticals (with California's ", italics added" and ", conc. opn. of
//   Kennard, J."). English and Canadian short forms, which give the name and a paragraph
//   and no volume ("Jones at [47]", "Doe at para 6"), are supras too, with note null.
// - record: the case's own record, "Compl. ¶ 9", "SAC ¶ 12", "Answer ¶ 5", "Ex. A at 1",
//   "Pl.'s Ex. 5 at 2", "PX 12 at 3", "Hollis Dep. 22:15-23:4", "Trial Tr. vol. 2, 45:3-9",
//   "Tr. of Oral Arg. 12:4", "Pl.'s Mot. Summ. J. 5", "Pl.'s Resp. to Interrog. No. 3",
//   "Decl. of Tomas Reyes, ECF No. 12, Ex. A", "ECF No. 45-2, at 3", "Doc. 45 at 3", "App.
//   45", "2-ER-123", "(R. 45)", "(C. 45; R. 12)", "(2 CT 362; RT 9:14-18)".
// - periodical: a law review or journal article: core, author, title, volume, reporter,
//   page, pin, year, parentheticals.
// - secondary: a treatise, dictionary, Restatement, agency guidance, revenue ruling or jury
//   instruction: author, title, pin, year, and for guidance its date. California's "6
//   Witkin, Summary of Cal. Law (11th ed. 2017) Torts, § 1234", "(The Rutter Group 2020) ¶
//   9:123", "Rest.2d Torts, § 402A", "CACI No. 1001"; "Rev. Rul. 2004-1, 2004-1 C.B. 1".
// - legislative: "H.R. Rep. No. 110-730, pt. 1, at 5 (2008)", "144 Cong. Rec. S3021",
//   "H.R. 1234, 117th Cong. § 3 (2021)", California's "Assem. Bill No. 5 (2019–2020 Reg.
//   Sess.) § 2": pin, year, parentheticals.
// - unparsed: a run of citation-shaped words that none of the forms above reads, such as
//   "Joint Stip. ¶ 4" or "S.B. 1234": numbers, § and ¶, abbreviations and acronyms, and
//   the capitalized words of a title before them (see runsIn). No other fields; its key
//   is its text. It keeps the guard and the views from depending on the parser knowing
//   every form.
//
// Citations come in order, without overlaps except nested ones.
export function findCitations(text) {
  const found = [];
  // Where each citation's explanatory parentheticals begin: a citation after that point
  // is nested in it.
  const parenFrom = new Map();
  const add = (cite, from = null) => {
    // A statute, rule, book or record citation may have explanatory parentheticals after
    // it, as a case does: "28 U.S.C. § 1291 (granting jurisdiction over final decisions)",
    // "Compl. ¶ 9 (alleging the fall)". They are part of the citation, and `body` is its
    // text without them, which names and keys it.
    if (from === null && EXPLAINED.has(cite.type)) {
      const after = parentheticalsAfter(text, cite.end);
      if (after.parentheticals.length) {
        from = cite.end;
        cite = {
          ...cite,
          end: after.end,
          text: text.slice(cite.start, after.end),
          body: cite.text,
          parentheticals: [...(cite.parentheticals || []), ...after.parentheticals],
        };
      }
    }
    found.push(cite);
    if (from !== null) parenFrom.set(cite, from);
  };
  // Each pattern runs only when the text has a word it needs: every sentence is read
  // here, and most hold no citation of most kinds.
  const scan = (re, hint) => (hint.test(text) ? matchesOf(re, text) : []);

  // Case cores, in order, so parallel citations are read with the case they belong to.
  const cores = [];
  for (const m of scan(CASE_CORE, /\d\s+[A-Z&]/)) {
    const reporter = m[2].trim();
    if (NOT_REPORTER.test(squeeze(reporter)) || NEUTRAL_COURTS.test(reporter)) continue;
    // "[1990] 1 WLR 491" is read with its bracketed year below.
    if (/\[\d{4}\]\s*$/.test(text.slice(Math.max(0, m.index - 8), m.index))) continue;
    const short = Boolean(m[3]);
    cores.push({
      start: m.index,
      end: m.index + m[0].length,
      volume: m[1],
      reporter,
      page: m[4],
      short,
      form: !short && !isReporter(reporter) && JOURNAL.test(reporter) ? 'journal' : 'reporter',
    });
  }
  for (const m of scan(BRACKET_CORE, /\[\d{4}\]/)) {
    cores.push({
      start: m.index,
      end: m.index + m[0].length,
      volume: m[2] ? `[${m[1]}] ${m[2]}` : `[${m[1]}]`,
      reporter: m[3],
      page: m[4],
      year: m[1],
      short: false,
      form: 'bracket',
      neutral: !m[2],
    });
  }
  for (const m of scan(NEUTRAL_CORE, /\d{4}\s+[A-Z]/)) {
    cores.push({
      start: m.index,
      end: m.index + m[0].length,
      volume: m[1],
      reporter: m[2],
      page: m[3],
      year: m[1],
      short: false,
      form: 'neutral',
      neutral: true,
    });
  }
  for (const m of scan(US_NEUTRAL_CORE, /\d{4}(?:\s+[A-Z]|-[ON])/)) {
    const reporter = (m[2] || m[3]).replace(/\s+/g, ' ');
    cores.push({
      start: m.index,
      end: m.index + m[0].length,
      volume: m[1],
      reporter,
      page: m[4],
      year: m[1],
      short: false,
      form: 'neutral',
      neutral: true,
      court: US_NEUTRAL_COURTS[reporter.replace(/\s+\(.*\)$/, '')],
    });
  }
  cores.sort((a, b) => a.start - b.start);
  const coreAt = new Map(cores.map(core => [core.start, core]));
  const consumed = new Set();
  for (const core of cores) {
    if (consumed.has(core)) continue;
    const read =
      core.form === 'journal' ? readPeriodical(text, core) : readCase(text, core, coreAt, consumed);
    if (read) add(read.cite, read.parenFrom);
  }

  // Unreported cases: Smith v. Salvation Army, No. 13-114-J, 2015 WL 1, at *2 (W.D. Pa. 2015)
  for (const m of scan(DOCKET, /Nos?\.\s+\d/)) {
    let end = m.index + m[0].length;
    const judge = matchAt(JUDGE, text, end); // (JPO)
    if (judge) end += judge[0].length;
    const slip = matchAt(SLIP_OP, text, end); // , slip op. at 5
    if (slip) end += slip[0].length;
    const db = matchAt(DATABASE_AFTER, text, end);
    if (db) end += db[0].length;
    const paren = matchAt(DOCKET_PAREN, text, end);
    if (paren) end += paren[0].length;
    const comma = text.slice(Math.max(0, m.index - 4), m.index).match(/,\s*$/);
    const named = comma && caseNameBefore(text, m.index - comma[0].length, { needV: true });
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (!named && !db && !slip && !paren && !DOCKET_SHAPE.test(m[0]) && !DOCKET_WORD.test(before))
      continue;
    const parenFromAt = end;
    const after = parentheticalsAfter(text, end, named?.name);
    const start = named ? named.start : m.index;
    const parties = named?.name.split(/\s+v\.?\s+/);
    add(
      {
        type: named ? 'docket' : 'docket-number',
        start,
        end: after.end,
        text: text.slice(start, after.end),
        docket: m[0],
        name: named?.name || null,
        plaintiff: parties?.length === 2 ? parties[0] : null,
        defendant: parties?.length === 2 ? parties[1] : null,
        court: paren?.[1]?.trim() || null,
        year: paren?.[3] || null,
        date: paren?.[2] || null,
        database: db ? db[0].replace(/^,\s*/, '') : null,
        pin: db?.[2] || slip?.[1] || null,
        signal: null,
        parentheticals: after.parentheticals,
      },
      parenFromAt,
    );
  }
  // Westlaw and Lexis cites: a case named only by them ("Kessler v. Northgate Cold
  // Storage, LLC, 2021 WL 4410382, at *6 (S.D.N.Y. Sept. 27, 2021)"), its short form
  // ("Meridian Produce, 2019 WL 1234567, at *3"), or a bare one.
  for (const m of scan(DATABASE, /WL|LEXIS/)) {
    let end = m.index + m[0].length;
    const pinned = matchAt(DATABASE_PIN, text, end);
    if (pinned) end += pinned[0].length;
    const database = text.slice(m.index, end);
    const comma = text.slice(Math.max(0, m.index - 4), m.index).match(/,\s*$/);
    const nameEnd = comma ? m.index - comma[0].length : -1;
    const full = comma && caseNameBefore(text, nameEnd, { needV: true });
    const short = !full && comma && caseNameBefore(text, nameEnd, { maxTokens: 5 });
    let court = null;
    let date = null;
    let year = null;
    if (full) {
      const paren = matchAt(COURT_AFTER, text, end);
      if (paren) {
        court = paren[1].trim() || null;
        date = paren[2];
        year = paren[3];
        end += paren[0].length;
      }
    }
    const from = end;
    const after = full || short ? parentheticalsAfter(text, end, (full || short).name) : null;
    if (after) end = after.end;
    const start = (full || short)?.start ?? m.index;
    const base = { start, end, text: text.slice(start, end), database, pin: pinned?.[1] || null };
    if (full) {
      const parties = full.name.split(/\s+v\.?\s+/);
      add(
        {
          type: 'docket',
          ...base,
          docket: null,
          name: full.name,
          plaintiff: parties.length === 2 ? parties[0] : null,
          defendant: parties.length === 2 ? parties[1] : null,
          court,
          year,
          date,
          signal: null,
          parentheticals: after.parentheticals,
        },
        from,
      );
    } else if (short) {
      add(
        {
          type: 'short',
          ...base,
          core: [m.index, m.index + m[0].length],
          volume: m[0].match(/^\d{4}/)[0],
          reporter: /\bWL\b/.test(m[0]) ? 'WL' : 'LEXIS',
          page: null,
          court: null,
          year: null,
          date: null,
          known: true,
          name: short.name,
          plaintiff: null,
          defendant: null,
          antecedent: short.name,
          signal: null,
          parentheticals: after.parentheticals,
          parallel: [],
          shortTitle: null,
        },
        from,
      );
    } else add({ type: 'database', ...base, signal: null });
  }
  for (const [hint, re] of STATUTE) {
    for (const m of scan(re, hint)) {
      let start = m.index;
      if (/^(?:R\.?S\.?|S\.?)[A-Z.]*\s+\d{4},/.test(m[0])) {
        // The Act or Code before a Canadian chapter: "Criminal Code, R.S.C. 1985, c. C-46".
        const act = text.slice(Math.max(0, start - 100), start).match(ACT_BEFORE);
        if (act) start -= act[0].length - act[0].indexOf(act[1]);
      }
      const end = m.index + m[0].length;
      const lead = text.slice(start, end);
      start += lead.length - stripLead(lead).length; // "Under the Theft Act 1968, s 1"
      add({ type: 'statute', start, end, text: text.slice(start, end), signal: null });
    }
  }
  for (const re of LEGISLATIVE) {
    for (const m of scan(re, /Rep\.|Doc\.|Cong\./)) {
      const end = m.index + m[0].length;
      const after = parentheticalsAfter(text, end);
      add(
        {
          type: 'legislative',
          start: m.index,
          end: after.end,
          text: text.slice(m.index, after.end),
          pin: m[1] || null,
          year: m[2] || null,
          signal: null,
          parentheticals: after.parentheticals,
        },
        end,
      );
    }
  }
  for (const m of scan(CA_BILL, /(?:Assem|Sen)[.a-z]*\s+(?:Bill|Const|Joint|Conc)/)) {
    const end = m.index + m[0].length;
    const fields = { pin: m[2] || null, year: m[1] || null, signal: null, parentheticals: [] };
    add({ type: 'legislative', start: m.index, end, text: m[0], ...fields });
  }
  for (const m of scan(IRS_GUIDANCE, /Rev\.|Notice|Ltr\.|T\.D\./)) {
    const title = m[0].match(/^[^,]*/)[0];
    const year = m[0].match(/\b(?:19|20)\d\d\b/)?.[0] || null;
    const fields = { author: null, title, pin: null, year, signal: null };
    add({ type: 'secondary', start: m.index, end: m.index + m[0].length, text: m[0], ...fields });
  }
  for (const m of scan(ID, /[Ii](?:bi)?d\./)) {
    const end = m.index + m[0].length;
    const after = parentheticalsAfter(text, end);
    add(
      {
        type: 'id',
        start: m.index,
        end: after.end,
        text: text.slice(m.index, after.end),
        pin:
          m[0]
            .match(/at\s+(?:pp?\.\s*)?(.*)$|\s((?:arts?|amends?)\..*)$|\s([§¶].*)$/)
            ?.slice(1)
            .find(Boolean) || null,
        signal: null,
        parentheticals: after.parentheticals,
      },
      end,
    );
  }
  for (const m of scan(SUPRA, /supra/)) {
    // "See Jones, supra" and "In Ortega, supra": the signal and sentence words are not the name.
    const antecedent = stripLead(m[1]);
    const start = m.index + m[1].length - antecedent.length;
    const after = parentheticalsAfter(text, m.index + m[0].length);
    add(
      {
        type: 'supra',
        start,
        end: after.end,
        text: text.slice(start, after.end),
        antecedent,
        note: m[2] || null,
        volume: m[3] || null,
        reporter: m[4]?.trim() || null,
        pin: m[5] || m[6] || m[7] || null,
        signal: null,
        parentheticals: after.parentheticals,
      },
      m.index + m[0].length,
    );
  }
  for (const m of scan(PARA_SHORT, /\sat\s+(?:\[|para)/)) {
    const antecedent = stripLead(m[1]);
    if (NOT_NAME.has(antecedent)) continue;
    const start = m.index + m[1].length - antecedent.length;
    const end = m.index + m[0].length;
    const after = parentheticalsAfter(text, end);
    add(
      {
        type: 'supra',
        start,
        end: after.end,
        text: text.slice(start, after.end),
        antecedent,
        note: null,
        volume: null,
        reporter: null,
        pin: m[2],
        signal: null,
        parentheticals: after.parentheticals,
      },
      end,
    );
  }
  for (const m of scan(RECORD, /\d|Ex|Decl|Aff|[Dd]ep/)) {
    const lead = stripLead(m[0]);
    const start = m.index + m[0].length - lead.length;
    add({ type: 'record', start, end: m.index + m[0].length, text: lead, signal: null });
  }
  for (const m of scan(RECORD_CSM, /[A-Z]{2}\s+\d/)) {
    const opens = /(?:^|[(\[;]\s*)$/.test(text.slice(Math.max(0, m.index - 3), m.index));
    if (!m[1] && !m[2].includes(':') && !opens) continue;
    add({ type: 'record', start: m.index, end: m.index + m[0].length, text: m[0], signal: null });
  }
  for (const m of scan(RECORD_PAGE, /[RCA]\.?\s+\d/)) {
    if (!/(?:^|[(\[;]\s*)$/.test(text.slice(Math.max(0, m.index - 3), m.index))) continue;
    add({ type: 'record', start: m.index, end: m.index + m[0].length, text: m[0], signal: null });
  }
  // Where the text names a contract or other document, for the bare sections near them.
  const documentsAt = /§/.test(text) ? [...text.matchAll(DOCUMENT_NAMED)].map(m => m.index) : [];
  let d = 0;
  for (const m of scan(SECTION, /§|Section/)) {
    let internal = internalAt(text, m);
    const end = m.index + m[0].length;
    if (internal < 0 && !m[0].startsWith('§')) continue;
    while (d < documentsAt.length && documentsAt[d] < m.index - 300) d++;
    if (internal < 0 && documentsAt[d] !== undefined && documentsAt[d] < end + 200) {
      const sentence = sentenceAround(text, m.index, end);
      if (DOCUMENT_NAMED.test(sentence) && !CODE_NAMED.test(sentence)) internal = m.index;
      DOCUMENT_NAMED.lastIndex = 0;
    }
    const start = internal < 0 ? m.index : internal;
    add({
      type: internal < 0 ? 'section' : 'internal',
      start,
      end,
      text: text.slice(start, end),
      signal: null,
    });
  }
  // Books found by their edition, "(5th ed. 2012)": the author, title and section before it.
  for (const m of scan(PARENTHESIS, /eds?\.\s|Rutter/)) {
    const edition = m[1].match(EDITION_NOTE);
    if (!edition) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const pin = before.match(BOOK_PIN);
    const titleEnd = m.index - (pin ? pin[0].length : before.length - before.trimEnd().length);
    const source = sourceBefore(text, titleEnd);
    if (!source || source.start >= titleEnd) continue;
    let end = m.index + m[0].length;
    const later = pin ? null : matchAt(BOOK_PIN_AFTER, text, end);
    if (later) end += later[0].length;
    add({
      type: 'secondary',
      start: source.start,
      end,
      text: text.slice(source.start, end),
      author: source.author,
      title: source.title,
      pin: pin?.[1] || later?.[1] || null,
      year: edition[1] || edition[2],
      signal: null,
    });
  }
  for (const m of scan(JURY_INSTRUCTION, /CA[CL]|BAJI/)) {
    const fields = { author: null, title: m[0], pin: null, year: null, signal: null };
    add({ type: 'secondary', start: m.index, end: m.index + m[0].length, text: m[0], ...fields });
  }
  for (const m of scan(CSM_RESTATEMENT, /Rest\./)) {
    const title = m[0].match(/^[^,]*/)[0];
    const pin = m[0].slice(title.length).replace(/^,\s*/, '');
    const fields = { author: null, title, pin, year: null, signal: null };
    add({ type: 'secondary', start: m.index, end: m.index + m[0].length, text: m[0], ...fields });
  }
  for (const m of scan(RESTATEMENT, /Restatement/)) {
    add({
      type: 'secondary',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      author: null,
      title: m[0].match(/^Restatement[^§]*?(?=\s+§)/)[0],
      pin: m[0]
        .slice(m[0].indexOf('§'))
        .replace(/\s*\([^()]*\)$/, '')
        .trim(),
      year: m[1] || null,
      signal: null,
    });
  }
  for (const m of scan(GUIDANCE, /[A-Z]{2},/)) {
    add({
      type: 'secondary',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      author: m[1],
      title: m[2].replace(/,$/, ''),
      pin: m[3] || null,
      year: m[5],
      date: m[4],
      signal: null,
    });
  }

  // Keep the longest of overlapping matches, earliest first.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  let kept = [];
  const containers = new Map(); // each nested citation → the citation it sits in
  let container = null; // the last top-level citation
  for (const cite of found) {
    if (container && cite.start < container.end) {
      // A citation inside another one's parenthetical ("(quoting United States v.
      // Columbus Country Club, ...)") is kept, marked nested; other overlaps are dropped.
      const from = parenFrom.get(container);
      if (
        from !== undefined &&
        cite.start >= from &&
        cite.end <= container.end &&
        cite.type !== 'section' &&
        cite.type !== 'internal' &&
        !kept.some(k => k.nested && cite.start < k.end && k.start < cite.end)
      ) {
        const nested = { ...cite, nested: true, within: null };
        containers.set(nested, container);
        kept.push(nested);
      }
      continue;
    }
    cite.signal = signalBefore(text, cite.start);
    kept.push(cite);
    container = cite;
  }
  kept = withHistory(text, kept, containers);
  // What looks like a citation but no pattern read is kept too, as 'unparsed'.
  const read = kept.filter(cite => !cite.nested).map(cite => [cite.start, cite.end]);
  const unparsed = runsIn(text, read);
  for (const [start, end] of unparsed) {
    const cite = { type: 'unparsed', start, end, text: text.slice(start, end) };
    // Its explanatory parentheticals, unless a citation the parser read is inside them.
    const after = parentheticalsAfter(text, end);
    if (after.parentheticals.length && !read.some(([from]) => from >= end && from < after.end)) {
      Object.assign(cite, {
        end: after.end,
        text: text.slice(start, after.end),
        body: cite.text,
        parentheticals: after.parentheticals,
      });
    }
    kept.push({ ...cite, signal: signalBefore(text, start) });
  }
  if (unparsed.length) kept.sort((a, b) => a.start - b.start);
  if (containers.size) {
    const place = new Map(kept.map((cite, at) => [cite, at]));
    for (const [cite, outer] of containers) cite.within = place.get(outer);
  }
  return kept;
}

// The citation types whose patterns end before any explanatory parenthetical: findCitations
// reads those after them (cases, articles and reports read their own).
const EXPLAINED = new Set(['statute', 'section', 'internal', 'record', 'secondary', 'legislative']);

// The signal written right before a citation at `at` ("See", "but see", "Cf."), or null.
function signalBefore(text, at) {
  const from = Math.max(0, at - 24);
  const signal = text.slice(from, at).match(SIGNAL_BEFORE);
  // "oversee Smith": a signal cut from a longer word is not one.
  const whole = signal && (signal.index > 0 || from === 0 || !/\w/.test(text[from - 1]));
  return whole ? signal[1].replace(/^(accord),$/i, '$1') : null;
}

// Subsequent history belongs to the citation it follows: "… (2d Cir. 2001), aff’d, 535 U.S.
// 1 (2002)" is one citation whose `history` is ["aff’d, 535 U.S. 1 (2002)"], and the later
// decision is no citation of its own. History words with no citation after them at the
// end of a clause (", cert. denied.") are part of the citation too.
const HISTORY_TYPES = new Set(['full', 'short', 'docket', 'docket-number', 'database']);
function withHistory(text, kept, containers) {
  if (!/,\s*[a-z]/.test(text)) return kept; // history words are lowercase, after a comma
  const out = [];
  for (let k = 0; k < kept.length; k++) {
    const cite = kept[k];
    out.push(cite);
    if (cite.nested || !HISTORY_TYPES.has(cite.type)) continue;
    for (let m; (m = matchAt(HISTORY, text, cite.end)); ) {
      let n = k + 1;
      while (n < kept.length && kept[n].nested) n++;
      const next = kept[n];
      const words = cite.end + m[0].indexOf(m[1]);
      if (next && next.start === cite.end + m[0].length && /\s$/.test(m[0])) {
        cite.history = [...(cite.history || []), text.slice(words, next.end)];
        cite.end = next.end;
        for (const [nested, outer] of containers) if (outer === next) containers.set(nested, cite);
        kept.splice(n, 1);
      } else if (!/\s$/.test(m[0])) {
        cite.history = [...(cite.history || []), m[1]];
        cite.end += m[0].length;
      } else break;
      cite.text = text.slice(cite.start, cite.end);
    }
  }
  return out;
}

// Whether short form or supra `cite` stands for full citation `full`: the same volume and
// reporter (or database number), or one of its parallels, and a name it shares.
function standsFor(cite, full) {
  const book = bookOf(cite);
  if (book && !citationKeys(full).includes(book)) return false;
  const name = cite.antecedent?.split(/[\s,]+/)[0];
  if (!name) return cite.type !== 'supra';
  const re = new RegExp(String.raw`(?<!\w)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\w)`);
  return re.test(full.name || '') || full.shortTitle === cite.antecedent;
}

// Which earlier citation each short form, id. and supra points to (eyecite's resolve step,
// simplified): a short form to the case cited in full in its volume and reporter (or a
// parallel one, or its database number) that its name names; a supra to the case its name
// names; an id. to the last authority cited, a record citation included. Quoted citations
// (inside “...”) belong to the quoted court, not the writer.
export function resolveCitations(text, cites) {
  const quoted = quoteSpans(text);
  const inQuote = c => quoted.some(([s, e]) => s < c.start && c.end <= e);
  const place = new Map(cites.map((c, at) => [c, at]));
  const cases = new Map(); // book → the cases cited in full in it
  for (const c of cites) {
    if (c.type !== 'full' && c.type !== 'docket') continue;
    for (const key of citationKeys(c)) cases.set(key, [...(cases.get(key) || []), c]);
  }
  const fulls = [];
  let last = null;
  for (const cite of cites) {
    cite.quoted = inQuote(cite);
    const own = !cite.quoted && !cite.nested;
    if (cite.type === 'full' || cite.type === 'docket') {
      fulls.push(cite);
      if (!cite.quoted) last = cite;
    } else if (cite.type === 'short') {
      const candidates = cases.get(citationKey(cite)) || [];
      const hit = candidates.find(c => standsFor(cite, c)) || candidates[0];
      cite.refersTo = hit ? place.get(hit) : null;
      if (!cite.quoted && hit) last = hit;
    } else if (cite.type === 'id') {
      cite.refersTo = cite.quoted || !last ? null : place.get(last);
    } else if (cite.type === 'supra') {
      const hit = fulls.find(c => standsFor(cite, c));
      cite.refersTo = hit ? place.get(hit) : null;
      if (own) last = hit || null;
    } else if (
      ['statute', 'record', 'periodical', 'secondary', 'legislative', 'unparsed'].includes(
        cite.type,
      )
    ) {
      if (own) last = cite;
    }
  }
  return cites;
}

// The keys a case is found under: its own and its parallel citations'.
const citationKeys = c => [
  citationKey(c),
  ...(c.parallel || []).map(p => `${p.volume} ${squeeze(p.reporter)}`),
];
// The volume and reporter (or database number) a short form or supra cites, or null for
// a supra that gives none ("Smith, supra, at 5").
const bookOf = c =>
  c.type === 'supra' ? (c.volume ? `${c.volume} ${squeeze(c.reporter)}` : null) : citationKey(c);

// A document's short forms and supras with names, by the book they cite and, for a supra
// with no volume, by its name's first word, with each one's place in the list. Read once
// per list, so naming every case does not compare every pair of citations.
const shortIndex = new WeakMap();
function shortsOf(cites) {
  let index = shortIndex.get(cites);
  if (index?.length === cites.length) return index;
  index = { length: cites.length, byBook: new Map(), byWord: new Map() };
  const push = (map, key, item) => map.set(key, [...(map.get(key) || []), item]);
  cites.forEach((c, at) => {
    if ((c.type !== 'short' && c.type !== 'supra') || !c.antecedent) return;
    const book = bookOf(c);
    if (book) push(index.byBook, book, { cite: c, at });
    else push(index.byWord, c.antecedent.split(/[\s,]+/)[0], { cite: c, at });
  });
  shortIndex.set(cites, index);
  return index;
}

// ---------------------------------------------------------------------------
// The names cases go by
// ---------------------------------------------------------------------------

// Parties a case is not called by: a government ("United States", "People", "R",
// "Canada (Minister of …)", "Texas"), so a case is called by the other side ("Columbus
// Country Club"). The whole party must be one, so "State Farm" and "United States Steel"
// are not.
const STATE_NAMES = String.raw`Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming`;
const GOVERNMENT = new RegExp(
  String.raw`^(?:United States(?: of America)?|U\.S\.|USA|(?:State|Commonwealth|Territory)(?: of (?:${STATE_NAMES}|[A-Z][a-z]+))?|People(?: of the State of (?:${STATE_NAMES}))?|District of Columbia|R\.?|Regina|Rex|The (?:Queen|King)|Her Majesty the Queen|His Majesty the King|Crown|Canada|Attorney General(?: of [A-Z][\w ]+)?|Att['’]y Gen\.|Secretary of State(?: for [A-Z][\w ]+)?|${STATE_NAMES})(?:,?\s+ex\s+rel\.\s.*)?$`,
);
// Whether a party is a government, by its name without parentheticals or entity endings.
const governmental = party => GOVERNMENT.test(partyName(party));
// Words that make a party an institution, which a case is rarely called by: "Univ. of Tex.
// Sw. Med. Ctr. v. Nassar" is Nassar, "Clark Cnty. Sch. Dist. v. Breeden" is Breeden.
const INSTITUTION = new Set(
  `Univ. University Bd. Board Dep't Dep’t Department Cnty. County City Sch. School Dist. District
  Comm'n Comm’n Commission Sec'y Sec’y Secretary Comm'r Comm’r Commissioner Town Twp. Township
  Vill. Village Borough Gov't Gov’t Government Agency Auth. Authority Att'y Att’y Attorney
  Minister Ministry Metro. Mun. Municipality Parish Bureau Regents Trustees`.split(/\s+/),
);
// Words that end an entity's name and are not part of what it is called.
const ENTITY_ENDINGS =
  /(?:,?\s+(?:Inc\.?|Corp\.?|Co\.?|Cos\.|Ltd\.?|LLC|L\.L\.C\.|LP|L\.P\.|LLP|L\.L\.P\.|PLC|plc|N\.A\.|P\.C\.|P\.A\.|S\.A\.|AG|GmbH|Corporation|Company|Incorporated|Limited))+\.?$/;
// Generic words, which name too many other things to stand for a case alone ("State",
// "United", "Bank"), even when a party starts with one ("State Farm").
const GENERIC_WORDS = new Set(
  `American National General First Second Third United States State People Federal
  International Global Northern Southern Eastern Western North South East West Central New
  Great Royal British English Canadian Pacific Atlantic Mutual Life Health Medical Hospital
  Home Homes Bank Trust Savings Credit Financial Insurance Securities Capital Investment
  Investments Holdings Group Partners Associates Services Systems Solutions Technologies
  Products Industries Enterprises Motor Motors Energy Power Electric Gas Oil Water Land Air
  Lines Airlines Airways Railroad Railway Transport Transportation Freight Logistics Storage
  Shipping Marine Fleet Communications Media News Times Time Post Press Broadcasting Sky
  Records Music Entertainment Foods Food Stores Store Markets Market Sales Supply Steel
  Chemical Construction Development Realty Properties Property Real Estate Management Union
  Local Fund Pension Laborers Workers Association Society Club Country Church Mission Rescue
  Center Centre Institute College Academy Foundation Council Committee Office Advanced
  Recovery Parade`.split(/\s+/),
);
// Given names and surnames that are also common words. A case may go by one ("Brown"), but
// another party's word like these is not registered as a name for it ("Henry", "White").
const PERSONAL_WORDS = new Set(
  `Doe Roe White Black Brown Green Gray Grey Young King Price Law Best Rich Hill Wood Woods
  Stone Field Fields Long Little Small Strong Wise Rose Bush Bell Love Hope May June Page
  Bishop Hall House Lane Park Cook Baker Hunter Fisher Porter Chase Ward Hart Swift Sharp
  Noble Free Freeman Christian Grant Jordan Morgan John James Robert Michael William David
  Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven Paul
  Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary
  Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander
  Frank Patrick Raymond Jack Dennis Jerry Tyler Aaron Jose Adam Nathan Henry Douglas Peter
  Kyle Walter Jeremy Keith Roger Terry Gerald Harold Sean Carl Arthur Lawrence Jesse Bruce
  Albert Alan Juan Wayne Roy Vincent Ralph Eugene Russell Philip Louis Mary Patricia Jennifer
  Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Margaret Sandra Ashley
  Kimberly Emily Donna Michelle Carol Amanda Dorothy Melissa Deborah Stephanie Rebecca Sharon
  Laura Cynthia Kathleen Amy Angela Anna Brenda Pamela Emma Nicole Helen Samantha Katherine
  Christine Rachel Carolyn Janet Catherine Maria Heather Diane Ruth Julie Olivia Joyce
  Virginia Victoria Kelly Lauren Christina Joan Evelyn Judith Megan Andrea Hannah Martha
  Gloria Teresa Ann Sara Frances Kathryn Jean Alice Julia Judy Grace Diana Natalie Charlotte
  Marie Dana`.split(/\s+/),
);

// A party's name as a case goes by it: no entity ending, nothing after its first comma, no
// parenthetical ("Starbucks (HK) Ltd" is "Starbucks").
const partyName = party =>
  party
    .replace(/\s*\([^()]*\)/g, '')
    .replace(ENTITY_ENDINGS, '')
    .replace(/,.*$/, '')
    .replace(/^(?:In\s+re|Ex\s+parte|Re|In\s+the\s+Matter\s+of|Matter\s+of)\s+/i, '')
    .replace(FAMILY_MATTER, '')
    .trim();
// The kind of proceeding before a party in a family or estate case: "In re Marriage of
// Bonds" goes by "Bonds", "Estate of Smith" by "Smith".
const FAMILY_MATTER =
  /^(?:Marriage|Estate|Guardianship|Adoption|Conservatorship|Custody|Parentage|Dependency|Welfare|Interest|Application|Petition)\s+of\s+(?:the\s+)?(?=\S)/i;
// A firm's name without the business it is in: "Jones & Laughlin Steel" is "Jones &
// Laughlin", as the Bluebook shortens "NLRB v. Jones & Laughlin Steel Corp.".
const firmName = name => {
  const m = name.match(/^(\S+(?:\s+\S+)?\s+&\s+[A-Z][\w'’-]*)((?:\s+[A-Z][\w'’-]*)+)$/);
  return m &&
    m[2]
      .trim()
      .split(/\s+/)
      .every(word => GENERIC_WORDS.has(word))
    ? m[1]
    : name;
};
const abbreviated = word => /\.$/.test(word) || contractions.has(word.replace(/,$/, ''));
// A party the case is not called by: a government, an acronym (EEOC, NLRB, US Airways), or
// one led by or made of an institution's words.
function institutional(party) {
  if (governmental(party)) return true;
  const words = party.split(/\s+/);
  if (/^[A-Z&]{2,}$/.test(words[0]) || abbreviated(words[0])) return true;
  return words.some(word => INSTITUTION.has(word.replace(/,$/, '')));
}
// The directions and regions a company's name abbreviates (Bluebook table T6), which its
// short name spells out: "Burlington N. & Santa Fe Ry." is "Burlington Northern".
const DIRECTIONS = {
  'N.': 'Northern',
  'S.': 'Southern',
  'E.': 'Eastern',
  'W.': 'Western',
  'Ne.': 'Northeastern',
  'Nw.': 'Northwestern',
  'Se.': 'Southeastern',
  'Sw.': 'Southwestern',
  'Cent.': 'Central',
  'Atl.': 'Atlantic',
  'Pac.': 'Pacific',
};
// The name a party goes by alone: up to two plain words whole ("Henry Schein", "Ford
// Motor"), else the first ("Lakeside Resort Enters." is "Lakeside"), with a direction
// after it spelled out ("Burlington Northern"). An estate keeps "Estate of" ("Estate of
// Smith"), since the decedent alone is not the party.
function partyShort(party) {
  const estate = party.match(/^Estate\s+of\s+(?:the\s+)?(?=\S)/i);
  if (estate) {
    const decedent = partyShort(party.slice(estate[0].length));
    return decedent && `Estate of ${decedent}`;
  }
  const name = partyName(party);
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length <= 2 && !words.some(abbreviated)) return name;
  const first = words[0].replace(/[,;:]$/, '');
  if (DIRECTIONS[words[1]] && /^[A-Z][a-z]+$/.test(first))
    return `${first} ${DIRECTIONS[words[1]]}`;
  // "State Farm Mut. Auto. Ins. Co." goes by "State Farm", not "State".
  if (GENERIC_WORDS.has(first) && words[1] && !abbreviated(words[1])) return `${first} ${words[1]}`;
  // "Friends of the Earth" and "Students for Fair Admissions" do not go by their first word.
  if (CASE_NAME_WORDS.has(first) && words.length <= 5) return name;
  return first.length > 2 ? first : name;
}

// The name a case is called by in running text, or null when nothing names it: the short
// title it was given ("(Aguilar)"), else the name its short forms or supras use when
// `cites` (the document's citations) has one, else its parties: the plaintiff without its
// entity ending ("Henry Schein", "Lakeside"), or, when the plaintiff is a government, an
// agency or an institution, the defendant ("Columbus Country Club", "Nassar", "Ford
// Motor"). A short form or supra is called by its own name.
function caseCalled(cite, cites = [], prose = '') {
  if (cite.type === 'short' || cite.type === 'supra') return cite.antecedent || null;
  if (!cite.name) return null;
  if (cite.shortTitle) return cite.shortTitle;
  const { byBook, byWord } = shortsOf(cites);
  const named = [
    ...citationKeys(cite).flatMap(key => byBook.get(key) || []),
    ...cite.name.split(/[\s,]+/).flatMap(word => byWord.get(word) || []),
  ]
    .filter(({ cite: other }) => standsFor(other, cite))
    .sort((a, b) => a.at - b.at);
  if (named.length) return named[0].cite.antecedent;
  const [plaintiff, defendant] = cite.name.split(/\s+v\.?\s+/);
  if (!defendant) return partyShort(plaintiff);
  // The name the writer gives the case in running text: "Ashcroft v. Iqbal" is "Iqbal" in
  // a brief that says "Iqbal requires" and never "Ashcroft".
  if (prose && !institutional(plaintiff) && !institutional(defendant)) {
    const first = partyShort(plaintiff);
    const second = partyShort(defendant);
    if (first && second && !mentions(prose, first) && mentions(prose, second)) return second;
  }
  if (institutional(plaintiff) && !institutional(defendant)) return firmName(partyName(defendant));
  if (governmental(plaintiff)) return firmName(partyName(defendant));
  return partyShort(plaintiff);
}

// Whether `name` appears in `text` as whole words.
const mentions = (text, name) =>
  new RegExp(
    String.raw`(?<![\w'’-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w'’-])`,
  ).test(text);

// The name a case goes by, for chips and the table of authorities: what caseCalled finds,
// else its citation ("455 F.3d", "No. 13-114-J"). `cites` is the document's citations, so
// "Bell Atl. Corp. v. Twombly" is "Twombly" where the writer's short forms say so, and
// `prose`, the document's text outside its citations, so it is "Twombly" where the writer
// says "Twombly" and never "Bell".
export function shortName(cite, cites = [], prose = '') {
  return (
    caseCalled(cite, cites, prose) ||
    (cite.volume ? `${cite.volume} ${cite.reporter}` : cite.docket || cite.database || cite.text)
  );
}

// Common words that often begin a case's name: "Natural Res. Def. Council", "Friends of
// the Earth", "Citizens United", "In re Marriage of Bonds". In running text the word is
// usually just the word ("Natural gas prices rose"), so a case is not called by one alone.
export const CASE_NAME_WORDS = new Set(
  `Natural Friends Citizens Students President People National American United General
  Federal First New Marriage Italian Public Committee Board City County Save Concerned
  Defenders Environmental Parents Women Families Patients Taxpayers Residents Voters
  Consumers Teachers Doctors Physicians Children Neighbors Alliance Coalition Estate`.split(/\s+/),
);

// Whether `name` is distinctive enough to stand for a case in running text: a name of more
// than one word always is; one word is not when it is a common word that begins case names
// (CASE_NAME_WORDS), a generic one ("State", "Bank"), a sentence word ("Under"), or a word
// the document `text` also uses in lowercase ("brown" for "Brown").
export function distinctiveName(name, text = '') {
  if (/\s/.test(name.trim())) return true;
  if (CASE_NAME_WORDS.has(name) || GENERIC_WORDS.has(name) || NOT_NAME.has(name)) return false;
  const lower = name.toLowerCase();
  if (lower === name || !text) return true;
  return !new RegExp(
    String.raw`(?<![\w'’-])${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w'’-])`,
  ).test(text);
}

// The names a case goes by in running text, each mapped to the index of its citation:
// the name it goes by (shortName), each party's whole name when it is short ("Time
// Warner", "Columbus Country Club", "Friends of the Earth", "Marriage of Bonds"), and each
// party's first word when it is distinctive ("Columbus", "Twombly"; not "Henry", "Time",
// "United" or "Natural"). Given the document's `text`, a one-word name it also uses in
// lowercase is left out (see distinctiveName).
export function referenceNames(cites, text = '') {
  const names = new Map();
  const add = (name, at) => {
    if (name && name.length > 2 && !names.has(name) && distinctiveName(name, text))
      names.set(name, at);
  };
  cites.forEach((c, at) => {
    if (c.type !== 'full' && c.type !== 'docket' && c.type !== 'short') return;
    const called = caseCalled(c, cites);
    // "United States v. Texas" goes by "Texas", but "Texas" in running text is the state.
    if (called && !GENERIC_WORDS.has(called) && !governmental(called)) add(called, at);
    const parties = c.type === 'short' ? [c.antecedent] : (c.name || '').split(/\s+v\.?\s+/);
    for (const party of parties.filter(Boolean)) {
      // A government, agency or institution ("EEOC", "Clark Cnty. Sch. Dist.") is not what
      // the case is called; only the name it goes by, above, stands for it.
      if (institutional(party)) continue;
      const name = partyName(party);
      const words = name.split(/\s+/).filter(Boolean);
      const plain = words.every(word => !abbreviated(word) && !/\d/.test(word));
      if (words.length >= 2 && words.length <= 3 && plain) add(name, at);
      // A longer name with at most three capitalized words: "Friends of the Earth",
      // "Marriage of Bonds" (the party of "In re Marriage of Bonds").
      const whole = party
        .replace(/\s*\([^()]*\)/g, '')
        .replace(ENTITY_ENDINGS, '')
        .replace(/,.*$/, '')
        .replace(/^(?:In\s+re|Ex\s+parte|Re)\s+/, '')
        .trim()
        .split(/\s+/);
      const capitals = whole.filter(word => /^[A-Z]/.test(word)).length;
      const joined = whole.every(word => /^[A-Z][a-z'’-]+$/.test(word) || SMALL_WORDS.test(word));
      if (whole.length >= 3 && whole.length <= 5 && capitals <= 3 && joined)
        add(whole.join(' '), at);
      // "Hagstrom’s Food Stores" is "Hagstrom" in running text too.
      const first = words[0]?.replace(/[,;:]$/, '').replace(/['’]s$/, '');
      if (
        first &&
        /^[A-Z][a-z]*(?:[A-Z][a-z]+)*(?:[-'’/][A-Z]?[a-z]+)*$/.test(first) &&
        !GENERIC_WORDS.has(first) &&
        !PERSONAL_WORDS.has(first) &&
        !NOT_NAME.has(first) &&
        !INSTITUTION.has(first)
      )
        add(first, at);
    }
  });
  return names;
}

// Case names used as short references in running text ("Lakeside", "DeFiore"). A
// block's own citations rarely name every case, so callers pass the names found in the
// whole document.
export function findReferences(text, cites, names = referenceNames(cites)) {
  const refs = [];
  for (const [name, at] of names) {
    const re = new RegExp(
      String.raw`(?<![\w])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\w])`,
      'g',
    );
    for (const m of text.matchAll(re)) {
      const inside = cites.some(c => c.start <= m.index && m.index < c.end);
      if (!inside)
        refs.push({
          type: 'reference',
          start: m.index,
          end: m.index + m[0].length,
          text: m[0],
          refersTo: at,
        });
    }
  }
  refs.sort((a, b) => a.start - b.start || b.end - a.end);
  return refs.filter((r, i) => !refs.slice(0, i).some(o => o.start <= r.start && r.end <= o.end));
}

// ---------------------------------------------------------------------------
// Spans that a sentence break may not fall inside
// ---------------------------------------------------------------------------

// The same spans closeOf finds for each opening bracket, in one pass: an unclosed "("
// would otherwise be scanned to the end of the text once per bracket.
function parenSpans(text) {
  const spans = [];
  const open = { '(': [], '[': [] };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '[') open[c].push(i);
    else if (c === ')' || c === ']') {
      const start = open[c === ')' ? '(' : '['].pop();
      if (start !== undefined) spans.push([start, i + 1]);
    } else if (c === '\n') open['('].length = open['['].length = 0;
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

// Balanced double quotations. A straight quote opens after a space, a bracket or the
// start, and closes before a space, punctuation or the end; one that fits neither, or
// a close with no open, makes us give up on straight quotes in this text.
export function quoteSpans(text) {
  const spans = [];
  const curly = [];
  const straight = [];
  let straightOk = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '“') curly.push(i);
    else if (c === '”') {
      if (curly.length) spans.push([curly.pop(), i + 1]);
    } else if (c === '"') {
      const before = i === 0 ? ' ' : text[i - 1];
      const after = i + 1 >= text.length ? ' ' : text[i + 1];
      const opens = /[\s(\[{—–-]/.test(before) && /\S/.test(after);
      const closes = /\S/.test(before) && /[\s.,;:!?)\]}—–-]/.test(after);
      if (opens && !closes) straight.push(i);
      else if (closes && !opens && straight.length) spans.push([straight.pop(), i + 1]);
      else if (closes && straight.length) spans.push([straight.pop(), i + 1]);
      else straightOk = false;
    }
  }
  if (!straightOk || straight.length) return spans.filter(([s]) => text[s] === '“');
  return spans;
}

// ---------------------------------------------------------------------------
// Sentences
// ---------------------------------------------------------------------------

const segmenters = new Map();
function segmenter(locale) {
  const key = locale || '';
  if (!segmenters.has(key))
    segmenters.set(key, new Intl.Segmenter(locale || undefined, { granularity: 'sentence' }));
  return segmenters.get(key);
}

// `left` runs back to the last kept break, which after many joined breaks is long, so
// these read only its last TAIL characters, and step back through them by hand: a pattern
// or a split over the whole tail, at every one of thousands of breaks ("A. A. A. …"),
// cost a tenth of a second.
const TAIL = 400;
const SPACE = /\s/;
// The last two whitespace-delimited tokens of `left`'s tail, [before, last], each '' if
// there is none, without the opening quotes or brackets before them.
function lastTokens(left) {
  const stop = Math.max(0, left.length - TAIL);
  let j = left.length;
  while (j > stop && SPACE.test(left[j - 1])) j--;
  let i = j;
  while (i > stop && !SPACE.test(left[i - 1])) i--;
  const last = left.slice(i, j);
  let k = i;
  while (k > stop && SPACE.test(left[k - 1])) k--;
  let h = k;
  while (h > stop && !SPACE.test(left[h - 1])) h--;
  const before = i > stop ? left.slice(h, k) : '';
  const clean = token => token.replace(/^[“"‘(\[]+/, '');
  return [clean(before), clean(last)];
}
const lastToken = left => lastTokens(left)[1];
const tokenBefore = left => lastTokens(left)[0];
const firstToken = right => (right.trimStart().match(/^(\S+)/)?.[1] || '').replace(/[,;:]$/, '');

// Whether `right` carries on the citation or name that `left` broke off in.
function continues(right, leftToken) {
  const r = right.trimStart();
  if (!r) return false;
  if (/^[a-z0-9§¶&,;:)\]–—_-]/.test(r)) return true; // lowercase, number, section, punctuation, ___
  if (/^[(\[]/.test(r)) return true;
  const token = firstToken(r);
  if (starters.has(token)) return false;
  if (citationWords.has(token.replace(/\.$/, ''))) return true;
  if (contractions.has(token)) return true;
  if (isAbbreviation(token)) return true; // F. | Supp. ; W.D. | Pa. ; Twp. | Bd.
  if (/^v\.$|^vs\.$/.test(token)) return true;
  if (DIVISIONS.has(leftToken) && (ROMAN.test(token) || /^[A-Z][,;.)]?$/.test(token))) return true; // art. III / Ex. A
  if (
    (INITIALISM.test(leftToken) || STATES.has(leftToken) || COURT_WORDS.has(leftToken)) &&
    placeNouns.has(token)
  )
    return true;
  if (/^[A-Z]{1,2}-?\d/.test(token)) return true; // a page or docket with a letter: S3021 / H-05-557M
  if (/^[$€£]\d/.test(r) && !entitySuffixes.has(leftToken)) return true; // approx. | $40
  // "4:00 a.m. | Pacific Time", "a.m. U.S. | Pacific Time"
  const zone =
    /^(?:Eastern|Central|Mountain|Pacific|Atlantic|Alaska|Hawaii)(?:\s+(?:Standard|Daylight))?\s+Time\b/;
  if ((/^[ap]\.m\.$/.test(leftToken) || INITIALISM.test(leftToken)) && zone.test(r)) return true;
  if (
    /^[ap]\.m\.$/.test(leftToken) &&
    /^(?:Mon|Tues?|Wed|Thu|Thurs|Fri|Sat|Sun)[a-z]*\b|^(?:EST|EDT|CST|CDT|MST|MDT|PST|PDT|ET|CT|MT|PT|UTC|GMT)\b/.test(
      token,
    )
  )
    return true;
  return false;
}

// A case-name word (not an entity suffix) followed by a name that reaches "v.":
// "Am. | Civil Liberties Union v. Reno".
function nameRunsToV(right) {
  return /^\s*(?:(?:[A-Z][\w'’.-]*|of|the|for|and|&),?\s+){1,8}v\.\s/.test(right);
}

// Splits that Intl.Segmenter misses: a footnote number glued after a sentence
// ("there.10  Similarly"), a citation with no period before the next sentence
// ("Lakeside, 455 F.3d at 159 While"), a period then a lowercase word after a citation
// or a closing quote, and a citation sentence after a quotation that has no period.
function forcedBreaks(text, cites, options) {
  const breaks = [];
  // Each pattern starts where its word starts: without the lookbehind, a long run of
  // letters (or a paragraph of Chinese, with no spaces) is scanned again from every
  // character, which takes seconds near the length limit.
  if (options.splitFootnotes) {
    for (const m of text.matchAll(
      /(?<![A-Za-z\]])([A-Za-z\]]+)([.!?]["”’)]?)(\d{1,3}|\[\d{1,3}\]|\[\*+\])(\s+)(?=[A-Z“"‘(])/g,
    )) {
      if (isAbbreviation(m[1] + '.')) continue; // No.10, Sec.3
      breaks.push({ at: m.index + m[0].length, why: 'footnote' });
    }
  }
  if (options.splitAfterCite) {
    for (const c of cites) {
      if (!['full', 'short', 'id', 'docket'].includes(c.type) || c.nested) continue;
      if (!/[\d)]$/.test(c.text)) continue;
      // "Lakeside, 455 F.3d at 159 While 4 weeks ..." (no period)
      const bare = text.slice(c.end).match(/^(\s+)([A-Z][a-z]+)\b/);
      if (bare && !isAbbreviation(bare[2] + '.') && !citationWords.has(bare[2])) {
        breaks.push({ at: c.end + bare[1].length, why: 'citation without period' });
      }
      // "Lakeside, 455 F.3d at 159. given that ..." (period, then lowercase)
      const lower = text.slice(c.end).match(/^\.(\s+)(?=[a-z])/);
      if (lower) breaks.push({ at: c.end + lower[0].length, why: 'lowercase after citation' });
    }
    for (const c of cites) {
      if (!['full', 'short', 'id', 'docket'].includes(c.type) || c.nested) continue;
      // "... first factor of Columbus Country Club” Lakeside, 455 F.3d at 159." A quotation
      // with no period, then a citation sentence that ends the sentence.
      const quoteBefore = /[^.!?,;:\s][”"]\s+$/.test(text.slice(0, c.start));
      const endsAfter = /^\.(?:\s*$|\s+[A-Z“"(])/.test(text.slice(c.end));
      if (quoteBefore && endsAfter)
        breaks.push({ at: c.start, why: 'citation after quotation without period' });
    }
  }
  if (options.splitSubsections) {
    // "4.2 Termination. (a) Provider may not terminate. (b) Customer may terminate." A
    // lettered or numbered subsection after a sentence's period starts a sentence, but
    // "Id. (a)" and "subd. (c)" do not end one.
    for (const m of text.matchAll(/\.(\s+)(?=\((?:[a-z]{1,2}|[ivx]{1,4}|\d{1,2})\)\s+[A-Z“"])/g)) {
      if (isAbbreviation(lastToken(text.slice(Math.max(0, m.index - 40), m.index + 1)))) continue;
      breaks.push({ at: m.index + m[0].length, why: 'subsection' });
    }
  }
  if (options.splitLowercaseAfterQuote) {
    // "... receive packages.” this closely mirrors ..." A period inside a closing
    // quote ends the sentence even when the writer forgot the capital.
    for (const m of text.matchAll(/(?<!\S)(\S+)\.([”"])(\s+)(?=[a-z])/g)) {
      if (isAbbreviation(m[1].replace(/^[“"‘(\[]+/, '') + '.')) continue; // “U.S.” and
      breaks.push({ at: m.index + m[0].length, why: 'lowercase after quotation' });
    }
  }
  return breaks;
}

// Whether a span of `list` ([start, end] pairs) has `at` strictly inside it. Each list is
// indexed once, as its starts in order and the furthest end so far, because a block with
// many citations is asked about at every proposed break.
const spanIndex = new WeakMap();
function covers(list, at) {
  let index = spanIndex.get(list);
  if (!index) {
    const sorted = [...list].sort((a, b) => a[0] - b[0]);
    let far = -Infinity;
    index = {
      starts: sorted.map(([s]) => s),
      reach: sorted.map(([, e]) => (far = Math.max(far, e))),
    };
    spanIndex.set(list, index);
  }
  let low = 0;
  let high = index.starts.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (index.starts[middle] < at) low = middle + 1;
    else high = middle;
  }
  return low > 0 && index.reach[low - 1] > at;
}

// Why a break between `left` and `right` should be joined, or null to keep it.
export function joinReason(at, left, right, spans, options = {}) {
  const trimmed = left.trimEnd();
  if (left.slice(trimmed.length).includes('\n')) return null; // a soft line break always separates
  for (const [kind, list] of spans) {
    if (covers(list, at)) return kind;
  }
  const tail = trimmed.slice(-TAIL);
  if (/\.\s?\.\s?\.$/.test(tail) && !/\.\s?\.\s?\.\s?\.$/.test(tail)) return 'ellipsis';
  if (/^\s*[.]/.test(right)) return 'ellipsis';
  const token = lastToken(left);
  if (options.joinEnumerators !== false && ENUMERATOR.test(trimmed.trimStart()))
    return 'enumerator'; // "I." / "2." / "(a)" alone
  if (/[?!][”"’)]*$/.test(tail) && /^\s*[a-z]/.test(right)) return 'lowercase continues'; // “Why?” and left
  if (!token.endsWith('.')) return null; // ? ! .” .) end sentences
  if (always.has(token) || always.has(titleCase(token))) return 'abbreviation';
  if (prefixUnlessName.has(token)) {
    return /^[A-Z][a-z]+$/.test(tokenBefore(left)) && !continues(right, token)
      ? null
      : 'abbreviation';
  }
  if (INITIAL.test(token)) {
    const before = tokenBefore(left).toLowerCase();
    if (labelWords.has(before)) return continues(right, token) ? 'abbreviation' : null;
    if (starters.has(firstToken(right))) return null; // L.L. Cool J. | Id.
    return 'initial';
  }
  if (isAbbreviation(token)) {
    if (continues(right, token)) return 'abbreviation';
    if (!entitySuffixes.has(token) && abbreviations.has(token) && nameRunsToV(right))
      return 'case name';
  }
  return null;
}

// A quotation that is a whole passage on its own, from a sentence's start to the end of
// the block ('She shrugs. "Is it? Ask me again."'), holds sentences of its own; one with a
// citation after it is kept whole for that citation.
function standsAlone(text, [start, end]) {
  return (
    !text.slice(end).trim() &&
    (!text.slice(0, start).trim() ||
      /[.!?]["”’)]?\s+$/.test(text.slice(Math.max(0, start - 4), start)))
  );
}

// The sentences of a block's text, as sentencesIn returns them: [{start, end, text}].
// options: keepQuotes (no break inside a balanced “quotation”), splitFootnotes,
// splitAfterCite, splitSubsections ("(a) …" after a period starts a sentence),
// attachCitations (a sentence that is only a citation joins the one before).
export function legalSentences(text, locale, options = {}) {
  options = {
    keepQuotes: true,
    joinEnumerators: true,
    splitFootnotes: true,
    splitAfterCite: true,
    splitLowercaseAfterQuote: true,
    splitSubsections: true,
    attachCitations: false,
    ...options,
  };
  const cites = findCitations(text);
  // Breaks Intl.Segmenter proposes, plus forced ones.
  const proposed = [];
  for (const { index } of segmenter(locale).segment(text))
    if (index > 0) proposed.push({ at: index, why: 'segmenter' });
  const forced = forcedBreaks(text, cites, options);
  const proposedAt = new Set(proposed.map(p => p.at));
  const all = [...proposed, ...forced.filter(f => !proposedAt.has(f.at))].sort(
    (a, b) => a.at - b.at,
  );
  const spans = [
    ['citation', cites.map(c => [c.start, c.end])],
    ['parentheses', parenSpans(text)],
    ...(options.keepQuotes
      ? [['quotation', quoteSpans(text).filter(span => !standsAlone(text, span))]]
      : []),
  ];
  const kept = [];
  const joined = [];
  let prev = 0;
  for (let k = 0; k < all.length; k++) {
    const { at, why } = all[k];
    const next = all[k + 1]?.at ?? text.length;
    const left = text.slice(prev, at);
    const right = text.slice(at, next);
    const reason =
      why === 'segmenter'
        ? joinReason(at, left, right, spans, options)
        : spans.find(([, list]) => covers(list, at))?.[0] || null;
    if (reason) {
      joined.push({ at, reason, left: left.trim().slice(-25), right: right.trim().slice(0, 25) });
      continue;
    }
    kept.push({ at, why });
    prev = at;
  }
  // Cut the text at the kept breaks and trim, as sentencesIn does.
  let sentences = [];
  const cuts = [0, ...kept.map(k => k.at), text.length];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const piece = text.slice(cuts[k], cuts[k + 1]);
    const body = piece.trim();
    if (!body) continue;
    const start = cuts[k] + piece.length - piece.trimStart().length;
    sentences.push({ start, end: start + body.length, text: body });
  }
  if (options.attachCitations) {
    const merged = [];
    for (const s of sentences) {
      // A soft line break separates even a citation from the sentence before it.
      const p = merged.at(-1);
      if (p && !text.slice(p.end, s.start).includes('\n') && isCitationSentence(s.text)) {
        p.end = s.end;
        p.text = text.slice(p.start, p.end);
      } else merged.push({ ...s });
    }
    sentences = merged;
  }
  sentences.joined = joined;
  sentences.forced = forced;
  return sentences;
}

// Signals, the words that join citations and subsequent history, which a citation
// sentence may also hold: "See", "but see", "cf.", "See, e.g.,", "quoting", "and", "aff'd",
// "cert. denied".
const SIGNAL_WORDS =
  /(?:^|[\s;,(\[])(?:but\s+(?:see|cf\.)|see(?:\s+also|\s+generally|,?\s+e\.g\.,?)?|cf\.|compare|accord|contra|e\.g\.,?|quoting|citing|and|with|aff['’]d|rev['’]d|vacated|remanded|modified|cert\.\s+(?:denied|granted|dismissed)|reh['’]g\s+denied|overruled|abrogated|superseded|in\s+part|on\s+other\s+grounds|by)(?=[\s,;)\]]|$)/gi;

// A sentence that is only citations ("42 U.S.C. § 3602(b)." / "Id. at 5." / "See Lakeside,
// 455 F.3d at 159." / "(Compl. ¶ 9.)" / "Id. (citation omitted).").
export function isCitationSentence(sentence) {
  const cites = findCitations(sentence);
  if (!cites.length) return false;
  let rest = sentence;
  for (const c of cites.filter(c => !c.nested).sort((a, b) => b.start - a.start))
    rest = rest.slice(0, c.start) + rest.slice(c.end);
  return !/[A-Za-z]{2,}/.test(rest.replace(SIGNAL_WORDS, ' '));
}

// A statute's key: its text without spaces, subsections, subdivisions, edition or commas,
// so "42 U.S. Code § 3602 (b)" and "42 U.S.C. § 3602(c)", "§§ 4.2" and "§ 4.2", "Gov’t" and
// "Gov't" are the same. A session law is keyed by its number, the Statutes at Large by
// volume, the Federal Register by volume and first page.
function statuteKey(text) {
  const squeezed = squeeze(text);
  const law = squeezed.match(/^Pub\.L\.(?:No\.)?\d+[-–—]\d+/);
  if (law) return law[0];
  const register = squeezed.match(/^\d+Fed\.Reg\.\d{1,3}(?:,\d{3})*/);
  if (register) return register[0];
  const large = squeezed.match(/^\d+Stat\./);
  if (large) return large[0];
  const order = squeezed.match(/^Exec\.Order(?:No\.)?(\d{1,2}),?(\d{3})/);
  if (order) return `Exec.OrderNo.${order[1]}${order[2]}`;
  return squeezed
    .replace(/U\.S\.Code/, 'U.S.C.')
    .replace(/^(\d+)ILCS/, '$1Ill.Comp.Stat.')
    .replace(/§§/g, '§')
    .replace(/etseq\.$/, '')
    .replace(/,(?:subds?|pars?|paras?)\.(?:\([^)]*\))+(?:(?:,|&|and)(?:\([^)]*\))+)*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/,(?!\d)/g, '');
}

// A key that two mentions of the same authority share: 455 F.3d (any page or pin),
// 42 U.S.C. § 3602, No. 13-114-J, 2019 WL 1234567 (a case known by its Westlaw number),
// a record citation's own text. Null for id. and supra, which resolve through others.
export function citationKey(c) {
  if (c.database && ['short', 'docket', 'docket-number', 'database'].includes(c.type))
    return c.database.replace(/,\s*at\b.*$/, '').replace(/\s+/g, ' ');
  switch (c.type) {
    case 'full':
    case 'short':
      // A neutral citation's number names the case: "2019 SCC 65", "2020 IL 124112".
      return c.neutral
        ? `${c.volume} ${squeeze(c.reporter)} ${c.page}`
        : `${c.volume} ${squeeze(c.reporter)}`;
    case 'docket':
    case 'docket-number':
      return c.docket.replace(/\s+/g, ' ');
    case 'statute':
    case 'section':
    case 'internal':
      return statuteKey(c.body ?? c.text);
    case 'periodical':
      return `${c.volume} ${squeeze(c.reporter)} ${c.page}`;
    case 'legislative':
      return squeeze((c.body ?? c.text).replace(/,\s*at\b.*$|\s*\(.*$/, ''));
    case 'record':
    case 'secondary':
    case 'unparsed':
      return `${c.type}:${squeeze(c.body ?? c.text)}`;
    default:
      return null;
  }
}

// Citations in Claude's suggestion that the document does not already cite. The
// autocomplete, rephrase and combine prompts can invent authority; anything returned
// here needs the viewer's confirmation (or a lookup through a research connector).
export function unseenCitations(documentText, suggestion) {
  const known = new Set(findCitations(documentText).map(citationKey).filter(Boolean));
  return findCitations(suggestion).filter(c => {
    const key = citationKey(c);
    return key && !known.has(key);
  });
}

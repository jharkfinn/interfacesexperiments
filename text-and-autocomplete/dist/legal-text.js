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
// A page, or a deposition's page and line: 158 / *3 / 14:3.
const PAGE = String.raw`\*{0,4}\d+(?::\d+)?`;
// A pin: 158 / 418–19 / *3 / 5 n.2 / 12-13 & n.4 / 22:15-23:4
const PIN = String.raw`${PAGE}(?:\s*${DASH}\s*${PAGE})?(?:\s*(?:&\s*)?nn?\.\s*\d+(?:\s*${DASH}\s*\d+)?)?`;
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
// [2015] UKSC 31 / [2004] EWCA Crim 631.
const BRACKET_CORE = new RegExp(
  String.raw`(?<![\w.])\[(${YEAR})\]\s+(?:(\d{1,4})\s+)?((?:[A-Z][A-Za-z'’.]*\s+){0,2}[A-Z][A-Za-z'’.]*)\s+(\d{1,6})(?!\w)`,
  'g',
);
// Canadian neutral citations: 2019 SCC 65 / 2016 ONCA 12.
const NEUTRAL_CORE = new RegExp(
  String.raw`(?<![\w.\[])(${YEAR})\s+(SCC|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|NBCA|MBCA|SKCA|NLCA|PECA|YKCA|NWTCA|NUCA|ONSC|BCSC|ABQB|ABKB|QCCS|NSSC|NBQB|NBKB|MBQB|MBKB|SKQB|SKKB|TCC|CMAC|ONCJ|BCPC|ABPC|CanLII)\s+(\d{1,6})(?!\w)`,
  'g',
);
// Courts that a neutral citation names: [2015] UKSC 31 is the Supreme Court's.
const NEUTRAL_COURTS =
  /^(?:UKSC|UKPC|UKHL|UKUT|UKFTT|EWCA(?:\s+(?:Civ|Crim))?|EWHC|EWCOP|EWFC|CSIH|CSOH|HCJAC|NICA|NIQB|NIKB|IESC|IECA|IEHC|SCC|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|NBCA|MBCA|SKCA|NLCA|PECA|YKCA|NWTCA|NUCA|ONSC|BCSC|ABQB|ABKB|QCCS|NSSC|NBQB|NBKB|MBQB|MBKB|SKQB|SKKB|TCC|CMAC|ONCJ|BCPC|ABPC|CanLII)$/;
// Statute books and databases that look like reporters after a number.
const NOT_REPORTER = /^(?:U\.S\.C|C\.F\.R|Stat\.|Fed\.Reg|WL|LEXIS|Cong\.Rec|Pub\.L)/;
// Law reviews and journals: Harv. L. Rev. / Yale L.J. / J. Legal Stud. / Wash. U. L.Q.
const JOURNAL = /L\.\s?(?:Rev|J|Q)\.|(?:^|\s)J\.|\bRev\.$|\bQ\.$|\bL\.$|\bF\.\s?Rev\.$/;

const sticky = source => new RegExp(source, 'y');
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
// Court and date: (3d Cir. 2006) / (W.D. Pa. 2013) / (1997) / (N.D. Ill. Jan. 5, 2015)
const COURT_AFTER = sticky(
  String.raw`\s*\(([^()]{0,60}?)\s*((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)`,
);
// California puts the court and year before the volume: "Ortega v. Kmart Corp. (2001) 26
// Cal.4th 1200"; old English reports do too: "(1854) 9 Exch 341".
const YEAR_BEFORE = new RegExp(
  String.raw`\(([^()]{0,60}?)\s*((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)\s*$`,
);
// An English court without a year, after a report: "(HL)" / "(H.L.)" / "(Ch)".
const COURT_NO_YEAR = sticky(
  String.raw`\s*\(((?:[A-Z]{1,6}|(?:[A-Z][a-z]{0,4}\.\s?){1,3}|Ch|Fam|Comm|Admin|Civ|Crim|Pat|IPEC|TCC))\)`,
);
// English and Canadian pins: at [47] / at para 23 / at paras. 5–7 / (HL) at 499.
const UK_PIN_AFTER = sticky(
  String.raw`(?:,\s*|\s+)(?:at\s+)?(\[\d{1,3}\](?:\s*${DASH}\s*\[\d{1,3}\])?|paras?\.?\s*\d+(?:\s*${DASH}\s*\d+)?)|,?\s+at\s+(\d+(?:\s*${DASH}\s*\d+)?)`,
);
const COMMA = sticky(String.raw`,\s*`);
const BRACKET_OPEN = sticky(String.raw`\s*\[`);
const BRACKET_CLOSE = sticky(String.raw`\s*\]`);
const PAREN_NEXT = sticky(String.raw`\s*(?=[(\[])`);
// California's notes after a comma, inside the citation's parentheses: "(Id. at p.
// 1207, internal quotation marks omitted.)"
const NOTE_WORDS = String.raw`(?:internal\s+)?(?:quotation\s+marks|citations?|fns?\.|footnotes?|brackets|ellipses|alterations?|emphasis|italics)`;
const CSM_NOTE = sticky(
  String.raw`,\s*(${NOTE_WORDS}(?:(?:,\s*|\s+and\s+)${NOTE_WORDS})*\s+(?:omitted|added|in\s+original)|original\s+italics)`,
);
// A judge's initials after a docket number: "No. 18-cv-7702 (JPO)".
const JUDGE = sticky(String.raw`(?:\s*\([A-Z]{2,5}\))+`);
// 2015 WL 123456 / 2013 U.S. Dist. LEXIS 1234
const DATABASE_SOURCE = String.raw`${YEAR}\s+(?:WL|U\.\s?S\.\s?(?:Dist\.|App\.)\s?LEXIS|[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*){0,3}\s?LEXIS)\s+\d+`;
const DATABASE = new RegExp(String.raw`(?<![\w.])${DATABASE_SOURCE}`, 'g');
const DATABASE_AFTER = sticky(String.raw`,\s*(${DATABASE_SOURCE})(?:,\s*at\s+(${PIN}))?`);
const DATABASE_PIN = sticky(String.raw`,\s*at\s+(${PIN})`);
const DOCKET_PAREN = sticky(String.raw`,?${COURT_AFTER.source}`);

const STATE = String.raw`(?:(?:Ala|Ariz|Ark|Cal|Colo|Conn|Del|Fla|Ga|Haw|Ill|Ind|Kan|Ky|La|Me|Md|Mass|Mich|Minn|Miss|Mo|Mont|Neb|Nev|Okla|Or|Pa|Tenn|Tex|Vt|Va|Wash|Wis|Wyo)\.|Alaska|Idaho|Iowa|Ohio|Utah|(?:D\.C|N\.H|N\.J|N\.M|N\.Y|N\.C|N\.D|R\.I|S\.C|S\.D|W\.\s?Va)\.)`;
// Each statute pattern with a word it cannot match without, tested first: most sentences
// cite no statute, and a test for one word is far cheaper than a scan with the pattern.
const STATUTE = [
  // 42 U.S.C. § 3602(b) / 42 U.S. Code § 3602 (b) / 29 C.F.R. §§ 1630.2–.3 / 26 U.S.C.A. § 1
  [
    /U\.\s?S\.\s?C|C\.\s?F\.\s?R/,
    String.raw`(?<![\w.])\d{1,3}\s+(?:U\.\s?S\.\s?C(?:ode|\.)(?:\s?[AS]\.)?|U\.\s?S\.\s?Code\s+Ann\.|C\.\s?F\.\s?R\.)\s*(?:${SECTIONS}|[Ss]ec(?:tion|s?\.)?\s*${ONE_SECTION})(?:\s+et\s+seq\.)?${EDITION}`,
  ],
  // 29 C.F.R. pt. 1630, app. § 1630.9
  [
    /C\.\s?F\.\s?R\.\s+(?:pt|Pt|part)\b/,
    String.raw`(?<![\w.])\d{1,3}\s+C\.\s?F\.\s?R\.\s+(?:pt|Pt|part)\.?\s+\d+(?:,\s*(?:app\.|subpt\.\s*[A-Z]+))?(?:,?\s*${SECTIONS})?${EDITION}`,
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
  // State court rules: Fla. R. Civ. P. 1.140(b) / Cal. R. Ct. 8.204(a) / N.J. Ct. R. 4:6-2
  [
    /R\.\s+(?:Civ|Crim|App)\.|R\.\s+(?:Evid|Ct)\.|Ct\.\s+R\./,
    String.raw`(?<![\w.])${STATE}\s+(?:R\.\s+(?:(?:Civ|Crim|App)\.\s+P\.|Evid\.|Ct\.)|Ct\.\s+R\.)\s*${SEC}${SUBSECTIONS}${EDITION}`,
  ],
  // Model and uniform codes: I.R.C. § 409A / U.C.C. § 2-207 / Model Penal Code § 2.02
  [
    /I\.R\.C|U\.C\.C|Model/,
    String.raw`(?<![\w.])(?:I\.R\.C\.|U\.C\.C\.|Model\s+Penal\s+Code)\s*${SECTIONS}${EDITION}`,
  ],
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
  // Federal rules: Fed. R. Civ. P. 12(b)(6) / Fed. R. Evid. 401
  [
    /Fed\.\s?R\./,
    String.raw`Fed\.\s?R\.\s?(?:Civ\.\s?P|Crim\.\s?P|App\.\s?P|Bankr\.\s?P|Evid)\.\s?\d+(?:\([a-z0-9]{1,4}\))*`,
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
// MSA", "this Section 4". Their sections are not statutes.
const DOCUMENTS = new Set(
  `Agreement Agreements Contract Lease MSA SOW NDA EULA LPA Policy Plan Bylaws Charter Amendment
  Addendum Schedule Order Indenture License Licence Terms Note Deed Trust Declaration
  Certificate Articles Handbook Manual Guidelines Protocol Memorandum Supplement Appendix
  Exhibit Settlement Award Warranty Guaranty Guarantee Mortgage Covenant Covenants`.split(/\s+/),
);
// Id. / id. at 5 / Id. at p. 843 / Id. § 3 / Id. ¶¶ 30–31 / Id. at 14:3-9 / ibid.
const ID = new RegExp(
  String.raw`(?<![\w.])(?:[Ii]d\.|[Ii]bid\.)(?:,?\s+at\s+(?:pp?\.\s*)?${PIN}(?:,\s*${PIN}(?!\w|\s+[A-Z]))*|\s+§§?\s*${SEC}(?:\([0-9a-zA-Z]{1,4}\))*(?:,\s*(?:\([0-9a-zA-Z]{1,4}\))+)*|\s+¶+\s*${NUMBERS})?`,
  'g',
);
// Smith, supra, at 5 / Smith, supra note 3, at 5 / Lindemann et al., supra note 6, § 13.03 /
// Ortega, supra, 26 Cal.4th at p. 1206. The name is at most 9 words, so a long run of
// capitalized words is not scanned again from each of its words.
const SUPRA = new RegExp(
  String.raw`(?<![\w.])([A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|of|the|&)){0,8}?(?:\s+et\s+al\.)?),?\s+supra(?:,?\s+note\s+(\d+))?(?:,\s*(\d{1,4})\s+(${REPORTER})\s*at(?:\s+pp?\.)?\s+(${PIN})|,?\s+at(?:\s+pp?\.)?\s+(${PIN})|,?\s+(§§?\s*${ONE_SECTION}|¶+\s*${NUMBERS}))?`,
  'g',
);
// No. 13-114-J / No. 2:13-cv-00114 / Nos. 12-1, 12-2
const DOCKET = /(?<![\w.])Nos?\.\s+(?:\d+:)?\d{1,5}[-–][\w-]*/g;
// A number that is a court's docket number by its shape (1:26-cv-03317, 18-cv-7702) or by
// the word before it (Case No., Civ. No., Index No.).
const DOCKET_SHAPE = /\d:\d\d-[a-z]{2,4}-|[-–](?:cv|cr|mc|bk|md|ap|civ|crim|misc)[-–]/i;
const DOCKET_WORD =
  /\b(?:Case|Civ\.|Civil|Action|Dkt\.|Docket|Index|Appeal|Cause|Adv\.|Proc\.|Misc\.|Bankr\.|Crim\.|Petition|Claim)\s*$/;
// Legislative history: H.R. Rep. No. 110-730, pt. 1, at 5 (2008) / S. Rep. No. 101-116 /
// 144 Cong. Rec. S3021 (1998)
const LEGISLATIVE = [
  String.raw`(?<![\w.])(?:H\.\s?R\.|S\.)\s?(?:Conf\.\s?)?(?:Rep|Doc)\.\s?No\.\s?\d{1,3}${DASH}\d{1,5}(?:,\s*pt\.\s*\d+)?(?:,\s*at\s+(${PIN}))?(?:\s*\((?:[^()\n]{0,30}\s)?(${YEAR})\))?`,
  String.raw`(?<![\w.])\d{1,3}\s+Cong\.\s?Rec\.\s+[HSE]?\d+(?:\s*${DASH}\s*[HSE]?\d+)?(?:,\s*([HSE]?\d+))?(?:\s*\((?:daily\s+ed\.\s+)?(?:${MONTH}\s+\d{1,2},\s+)?(${YEAR})\))?`,
].map(source => new RegExp(source, 'g'));
// Record citations: the complaint, depositions, declarations, transcripts, exhibits,
// the record and the docket. Each needs its paragraph, page or line, or a name.
const RECORD_PIN = String.raw`(?:¶¶?\s*${NUMBERS}|at\s+(?:pp?\.\s*)?(?:${LINES}|${NUMBERS})|${LINES}|pp?\.\s*${NUMBERS})`;
// A declarant's name: words and initials ("Tomas R. Reyes", "Ann Lee Jr."). A word's
// period ends the sentence unless the word is an initial, so "Decl. of Tomas Reyes. He
// then left." is the declaration alone.
const NAME_PART = String.raw`(?:[JS]r\.|[A-Z]\.|[A-Z][\w'’-]*)`;
const DECLARANT = String.raw`${NAME_PART}(?:\s+${NAME_PART}){0,3}(?:,\s+[JS]r\.)?`;
const RECORD = new RegExp(
  [
    String.raw`(?:Am\.\s+|First\s+Am\.\s+|Second\s+Am\.\s+)?Compl\.\s*${RECORD_PIN}`,
    String.raw`(?:[A-Z][\w'’-]*\s+){0,3}(?:[Dd]epo?|Decl|Aff|Tr|Hr['’]g\s+Tr|Trial\s+Tr)\.,?\s*(?:${RECORD_PIN}|${NUMBERS})`,
    String.raw`(?:Decl|Aff|[Dd]epo?)\.\s+of\s+${DECLARANT}(?:,?\s*${RECORD_PIN})?`,
    String.raw`Exh?s?\.\s*[A-Z0-9]{1,4}(?:[-.]\d{1,3})?(?!\w)(?:,?\s+at\s+(?:pp?\.\s*)?(?:${LINES}|${NUMBERS}))?`,
    String.raw`(?:(?:Pls?|Defs?|Resp|Pet|Appellants?|Appellees?)\.?['’]s?\s+)?(?:Mot\.|Br\.|Mem\.|Opp['’]n|Reply|Ans\.)(?:\s+(?:to|for|in|of)\s+[A-Z][\w.'’]*(?:\s+[A-Z][\w.'’]*){0,3})?\s+at\s+${NUMBERS}`,
    String.raw`R\.\s+at\s+${NUMBERS}`,
    String.raw`J\.A\.\s+${NUMBERS}`,
    String.raw`Pet\.\s+App\.\s+\d+a(?:\s*${DASH}\s*\d+a)?`,
    String.raw`(?:ECF|Dkt\.)\s+(?:No\.\s+)?\d+(?:,\s*at\s+${NUMBERS})?`,
  ]
    .map(source => String.raw`(?<![\w.])${source}`)
    .join('|'),
  'g',
);
// California's record: (2 CT 360, 362) / (RT 14:2-22) / (2 CT 371 [Ostrander depo. at 44:3]).
// Without a volume or a line it must open a citation, so "the ER 3 times" is not one.
const RECORD_CSM = new RegExp(
  String.raw`(?<![\w.])(?:(\d{1,2})\s+)?(?:Supp\.\s*)?(?:CT|RT|AA|RA|JA|ER|SER|CR|AR|AOB|RB|ARB)\s+(\d+(?::\d+)?(?:\s*${DASH}\s*\d+(?::\d+)?)?(?:,\s*\d+(?::\d+)?(?:\s*${DASH}\s*\d+(?::\d+)?)?(?![\d:]|\s+[A-Z]))*)(?:,\s*¶\s*\d+)?(?:\s*\[[^\[\]\n]{1,80}\])?`,
  'g',
);
// Treatises, dictionaries and other books, found by their edition: "(5th ed. 2012)".
const PARENTHESIS = /\(([^()\n]{1,60})\)/g;
const EDITION_NOTE = /(?:^|\s)(?:\d+(?:st|nd|rd|th|d)\s+|rev\.\s+)?eds?\.\s+(?:[^()]*\s)?(\d{4})$/;
// The section or page a book is cited at: "… Law § 13.03" / "… Dictionary 1710".
const BOOK_PIN = new RegExp(
  String.raw`\s+(§§?\s*${SEC}(?:\s*${DASH}\s*${SEC})?|\d+(?:\s*${DASH}\s*\d+)?)\s*$`,
);
// Restatement (Second) of Torts § 402A cmt. a (Am. L. Inst. 1965)
const RESTATEMENT = new RegExp(
  String.raw`(?<![\w.])Restatement\s+(?:\((?:First|Second|Third|Fourth)\)\s+)?of\s+(?:the\s+)?[A-Z][\w'’]*(?:\s+(?:[A-Z][\w'’]*|and|of|&|the)){0,6}?\s+§§?\s*${SEC}(?:\s+cmts?\.\s*[a-z](?:,\s*illus\.\s*\d+)?)?(?:\s*\([^()\n]{0,40}(${YEAR})\))?`,
  'g',
);
// Agency guidance: an agency, a title, its question or part, and a date. "EEOC,
// Enforcement Guidance: Reasonable Accommodation …, Question 34 (Oct. 17, 2002)"
const TITLE_WORD = String.raw`(?:[A-Z][\w'’-]*|of|the|and|for|on|in|to|a|an|with|under|by)[:,]?`;
const GUIDANCE = new RegExp(
  String.raw`(?<![\w.])([A-Z]{2,8}),\s+(${TITLE_WORD}(?:\s+${TITLE_WORD}){1,30}?),?\s+(?:((?:Question|No\.|Part|pt\.|§|at)\s*[\w.*-]+),?\s+)?\(((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)`,
  'g',
);

// The signal right before a citation, in any case: "See", "but see", "See, e.g.,", "cf.".
const SIGNAL_BEFORE =
  /(?:^|[\s;,(\[])((?:but\s+)?(?:see(?:\s+also|\s+generally|,\s*e\.g\.,)?|cf\.)|compare|accord|contra|e\.g\.,)\s+$/i;
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

// The end of the balanced parenthesis or bracket that opens at i, or -1.
function closeOf(text, i) {
  const open = text[i];
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < text.length; j++) {
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
    if (/^(?:v\.?|vs\.|In|Re|rel\.)$/.test(bare)) sawV = true;
    start = word(k).index + opener.length;
    words++;
    if (opener) break; // "(Smith v. Jones" or "“Smith": the name starts here
  }
  if (needV && !sawV) return at;
  return start;
}

// The case name that ends at `end`, without the sentence words before it, or null.
function caseNameBefore(text, end, options) {
  while (end > 0 && /\s/.test(text[end - 1])) end--;
  const s = nameStart(text, end, options);
  if (s >= end) return null;
  const raw = text.slice(s, end);
  const name = stripLead(raw);
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
  const note = matchAt(CSM_NOTE, text, end);
  if (note) {
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
  // The name: after a comma (Bluebook), before "(2001)" (California, old English
  // reports), or right before a bracketed year or neutral citation ("Donoghue v Stevenson
  // [1932] AC 562").
  const lookFrom = Math.max(0, core.start - 120);
  const before = text.slice(lookFrom, core.start);
  let year = core.year || null;
  let court = NEUTRAL_COURTS.test(core.reporter) ? core.reporter.replace(/\s+/g, ' ') : null;
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
  } else if (core.form !== 'reporter') nameEnd = core.start;
  // An unknown reporter must look like one: a period and a case name or court ("95 Eng.
  // Rep. 807 (C.P. 1765)"), or a year before it ("(1854) 9 Exch 341"). "1 Cor. 13" is not.
  const known = core.form !== 'reporter' || isReporter(core.reporter);
  if (!known && !short && !/\./.test(core.reporter) && !yearBefore) return null;
  let start = yearBefore ? lookFrom + yearBefore.index : core.start;
  let name = null;
  if (nameEnd >= 0) {
    const found = caseNameBefore(text, nameEnd, { needV: !short, maxTokens: short ? 5 : 24 });
    if (found) {
      start = found.start;
      name = found.name;
    }
  }
  const english = core.form !== 'reporter' || (yearBefore && !known);
  if (!known) {
    const courtAfter = Boolean(matchAt(COURT_AFTER, text, end));
    const ok = short
      ? Boolean(name)
      : /\./.test(core.reporter)
        ? Boolean(name) || courtAfter || Boolean(yearBefore)
        : Boolean(yearBefore);
    if (!ok) return null;
  }
  if (!yearBefore) {
    const paren = matchAt(COURT_AFTER, text, end);
    if (paren) {
      court = paren[1].trim() || court;
      date = paren[2];
      year = paren[3];
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
  const parenFrom = end;
  const after = parentheticalsAfter(text, end, name);
  end = after.end;
  const parties = name?.split(/\s+v\.?\s+/);
  for (const other of taken) consumed.add(other);
  return {
    cite: {
      type: short ? 'short' : 'full',
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
      antecedent: short ? name : null,
      signal: null,
      parentheticals: after.parentheticals,
      parallel,
      shortTitle: after.shortTitle,
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
  const of = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
  const owner = of.match(/^\s+of\s+(?:the|this|that|such|each)\s+([A-Z][A-Za-z]+)/);
  if (owner && DOCUMENTS.has(owner[1])) return m.index;
  // Contract numbering: "Section 4.2(b)", "Section 12.2".
  if (/^Sections?\s+\d{1,2}\.\d{1,3}(?!\d)/.test(m[0])) return m.index;
  return -1;
}

// What a citation reads as, by type. Every citation has {type, start, end, text, signal},
// where `signal` is the signal written right before it ("See", "but see", "Cf."), and
// `nested: true` with `within` (the index of the citation it sits in) when it is inside
// another's parenthetical ("(quoting …)"). The types and their other fields:
//
// - full: a case. core ([start, end] of VOLUME REPORTER PAGE), volume, reporter, page, pin,
//   parallel ([{volume, reporter, page, pin}], the same case in other reporters, Bluebook's
//   "550 U.S. 544, 127 S. Ct. 1955" and California's "[107 Cal.Rptr.2d 841]"), court,
//   year, date (as written in the court parenthetical: "2019" or "Mar. 5, 2019"), known
//   (a listed reporter), name, plaintiff, defendant, antecedent (null), shortTitle
//   (California's "(Aguilar)" or a "[hereinafter X]"), parentheticals. English reports and
//   neutral citations are full citations too: "[1990] 1 WLR 491" has volume "[1990] 1",
//   "[2015] UKSC 31" volume "[2015]" and court "UKSC", "2019 SCC 65" volume "2019".
// - short: "Lakeside, 455 F.3d at 159" / "Ortega, 26 Cal.4th at p. 1206". The same fields,
//   with page, court and year null and antecedent the name before it ("Lakeside"). A
//   short form of a Westlaw or Lexis case ("Meridian Produce, 2019 WL 1234567, at *3") has
//   `database` ("2019 WL 1234567, at *3"), volume (the year) and reporter "WL" or "LEXIS".
// - docket: a named unreported case, "Smith v. Jones, No. 2:13-cv-00114 (JPO), 2015 WL
//   1234567, at *3 (W.D. Pa. Jan. 5, 2015) (dismissing …)", or one cited only by its
//   database number, "Kessler v. Northgate Cold Storage, LLC, 2021 WL 4410382, at *6
//   (S.D.N.Y. Sept. 27, 2021)". docket ("No. 2:13-cv-00114", or null), database (through
//   its pin), pin ("*3"), name, plaintiff, defendant, court, year, date, parentheticals.
// - docket-number: a docket number with no name, kept only with a database cite, a court
//   parenthetical, a docket shape ("1:26-cv-03317") or a docket word ("Case No."): the
//   docket fields, with name, plaintiff and defendant null.
// - database: a bare database cite, "2018 WL 3456789, at *4": database, pin.
// - statute: a code, regulation, constitution, rule, session law or Federal Register cite,
//   in Bluebook or California form ("Evid. Code, § 452, subd. (d)"), and Canadian and UK
//   statutes ("RSC 1985, c T-13, s 19", "Theft Act 1968, s 1(1)").
// - section: a bare "§ 3602(c)" or "§§ 4.2, 9.1" that may stand for a statute.
// - internal: a section of the document itself or of a contract it discusses: "Agreement
//   § 4.2", "§ 4.3 of the MSA", "this § 12", "Section 4.2(b)". Not an authority.
// - id: "Id. at 5", "Id. at p. 843", "Id. § 12102(2)(B)", "Id. ¶¶ 30–31": pin,
//   parentheticals.
// - supra: "Smith, supra, at 5", "Roe, supra note 4, at 22", "Ortega, supra, 26 Cal.4th at
//   p. 1206": antecedent, note, volume, reporter, pin (a page, "§ 13.03" or "¶ 5").
// - record: the case's own record, "Compl. ¶ 9", "Ex. A at 1", "Hollis Dep. 22:15-23:4",
//   "Decl. of Tomas Reyes, ECF No. 12, Ex. A", "(2 CT 362; RT 9:14-18)".
// - periodical: a law review or journal article: core, author, title, volume, reporter,
//   page, pin, year, parentheticals.
// - secondary: a treatise, dictionary, Restatement or agency guidance: author, title, pin,
//   year, and for guidance its date.
// - legislative: "H.R. Rep. No. 110-730, pt. 1, at 5 (2008)", "144 Cong. Rec. S3021": pin,
//   year, parentheticals.
//
// Citations come in order, without overlaps except nested ones.
export function findCitations(text) {
  const found = [];
  // Where each citation's explanatory parentheticals begin: a citation after that point
  // is nested in it.
  const parenFrom = new Map();
  const add = (cite, from = null) => {
    found.push(cite);
    if (from !== null) parenFrom.set(cite, from);
  };
  // Each pattern runs only when the text has a word it needs: every sentence is read
  // here, and most hold no citation of most kinds.
  const scan = (re, hint) => (hint.test(text) ? text.matchAll(re) : []);

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
    const db = matchAt(DATABASE_AFTER, text, end);
    if (db) end += db[0].length;
    const paren = matchAt(DOCKET_PAREN, text, end);
    if (paren) end += paren[0].length;
    const comma = text.slice(Math.max(0, m.index - 4), m.index).match(/,\s*$/);
    const named = comma && caseNameBefore(text, m.index - comma[0].length, { needV: true });
    const before = text.slice(Math.max(0, m.index - 24), m.index);
    if (!named && !db && !paren && !DOCKET_SHAPE.test(m[0]) && !DOCKET_WORD.test(before)) continue;
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
        pin: db?.[2] || null,
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
            .match(/at\s+(?:pp?\.\s*)?(.*)$|\s([§¶].*)$/)
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
    add({
      type: 'supra',
      start,
      end: m.index + m[0].length,
      text: text.slice(start, m.index + m[0].length),
      antecedent,
      note: m[2] || null,
      volume: m[3] || null,
      reporter: m[4]?.trim() || null,
      pin: m[5] || m[6] || m[7] || null,
      signal: null,
    });
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
  for (const m of scan(SECTION, /§|Section/)) {
    const internal = internalAt(text, m);
    const end = m.index + m[0].length;
    if (internal < 0 && !m[0].startsWith('§')) continue;
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
  for (const m of scan(PARENTHESIS, /eds?\.\s/)) {
    const edition = m[1].match(EDITION_NOTE);
    if (!edition) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const pin = before.match(BOOK_PIN);
    const titleEnd = m.index - (pin ? pin[0].length : before.length - before.trimEnd().length);
    const source = sourceBefore(text, titleEnd);
    if (!source || source.start >= titleEnd) continue;
    const end = m.index + m[0].length;
    add({
      type: 'secondary',
      start: source.start,
      end,
      text: text.slice(source.start, end),
      author: source.author,
      title: source.title,
      pin: pin?.[1] || null,
      year: edition[1],
      signal: null,
    });
  }
  for (const m of scan(RESTATEMENT, /Restatement/)) {
    add({
      type: 'secondary',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      author: null,
      title: m[0].match(/^Restatement[^§]*?(?=\s+§)/)[0],
      pin: m[0].match(/§[^(]*/)[0].trim(),
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
  const kept = [];
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
        kept.push({ ...cite, nested: true, within: kept.indexOf(container) });
      }
      continue;
    }
    const from = Math.max(0, cite.start - 24);
    const signal = text.slice(from, cite.start).match(SIGNAL_BEFORE);
    // "oversee Smith": a signal cut from a longer word is not one.
    const whole = signal && (signal.index > 0 || from === 0 || !/\w/.test(text[from - 1]));
    cite.signal = whole ? signal[1] : null;
    kept.push(cite);
    container = cite;
  }
  return kept;
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
      ['statute', 'record', 'periodical', 'secondary', 'legislative'].includes(cite.type)
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
    .replace(/^(?:In\s+re|Ex\s+parte|Re|In\s+the\s+Matter\s+of|Matter\s+of|Estate\s+of)\s+/i, '')
    .trim();
const abbreviated = word => /\.$/.test(word) || contractions.has(word.replace(/,$/, ''));
// A party the case is not called by: a government, an acronym (EEOC, NLRB, US Airways), or
// one led by or made of an institution's words.
function institutional(party) {
  if (governmental(party)) return true;
  const words = party.split(/\s+/);
  if (/^[A-Z&]{2,}$/.test(words[0]) || abbreviated(words[0])) return true;
  return words.some(word => INSTITUTION.has(word.replace(/,$/, '')));
}
// The name a party goes by alone: up to two plain words whole ("Henry Schein", "Ford
// Motor"), else the first ("Lakeside Resort Enters." is "Lakeside").
function partyShort(party) {
  const name = partyName(party);
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  if (words.length <= 2 && !words.some(abbreviated)) return name;
  const first = words[0].replace(/[,;:]$/, '');
  // "State Farm Mut. Auto. Ins. Co." goes by "State Farm", not "State".
  if (GENERIC_WORDS.has(first) && words[1] && !abbreviated(words[1])) return `${first} ${words[1]}`;
  return first.length > 2 ? first : name;
}

// The name a case is called by in running text, or null when nothing names it: the short
// title it was given ("(Aguilar)"), else the name its short forms or supras use when
// `cites` (the document's citations) has one, else its parties: the plaintiff without its
// entity ending ("Henry Schein", "Lakeside"), or, when the plaintiff is a government, an
// agency or an institution, the defendant ("Columbus Country Club", "Nassar", "Ford
// Motor"). A short form or supra is called by its own name.
function caseCalled(cite, cites = []) {
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
  if (institutional(plaintiff) && !institutional(defendant)) return partyName(defendant);
  if (governmental(plaintiff)) return partyName(defendant);
  return partyShort(plaintiff);
}

// The name a case goes by, for chips and the table of authorities: what caseCalled finds,
// else its citation ("455 F.3d", "No. 13-114-J"). `cites` is the document's citations, so
// "Bell Atl. Corp. v. Twombly" is "Twombly" where the writer's short forms say so.
export function shortName(cite, cites = []) {
  return (
    caseCalled(cite, cites) ||
    (cite.volume ? `${cite.volume} ${cite.reporter}` : cite.docket || cite.database || cite.text)
  );
}

// The names a case goes by in running text, each mapped to the index of its citation:
// the name it goes by (shortName), each party's whole name when it is short ("Time
// Warner", "Columbus Country Club"), and each party's first word when it is distinctive
// ("Columbus", "Twombly"; not "Henry", "Time" or "United").
export function referenceNames(cites) {
  const names = new Map();
  const add = (name, at) => {
    if (name && name.length > 2 && !names.has(name)) names.set(name, at);
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
// these read only its end.
const TAIL = 400;
const lastToken = left =>
  (
    left
      .slice(-TAIL)
      .trimEnd()
      .match(/(\S+)$/)?.[1] || ''
  ).replace(/^[“"‘(\[]+/, '');
const tokenBefore = left => {
  const words = left.slice(-TAIL).trimEnd().split(/\s+/);
  return words.length > 1 ? words[words.length - 2].replace(/^[“"‘(\[]+/, '') : '';
};
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
  return squeezed
    .replace(/U\.S\.Code/, 'U.S.C.')
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
      return `${c.volume} ${squeeze(c.reporter)}`;
    case 'docket':
    case 'docket-number':
      return c.docket.replace(/\s+/g, ' ');
    case 'statute':
    case 'section':
    case 'internal':
      return statuteKey(c.text);
    case 'periodical':
      return `${c.volume} ${squeeze(c.reporter)} ${c.page}`;
    case 'legislative':
      return squeeze(c.text.replace(/,\s*at\b.*$|\s*\(.*$/, ''));
    case 'record':
    case 'secondary':
      return `${c.type}:${squeeze(c.text)}`;
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

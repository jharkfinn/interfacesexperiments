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
  'Gen.',
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
const YEAR = String.raw`(?:1[6-9]\d\d|20\d\d)`;
const MONTH = String.raw`(?:Jan\.|Feb\.|Mar\.|Apr\.|May|June?\.?|July?\.?|Aug\.|Sept?\.|Oct\.|Nov\.|Dec\.|January|February|March|April|August|September|October|November|December)`;
// A pin: 158 / 418–19 / *3 / 5 n.2 / 12-13 & n.4
const PIN = String.raw`\*{0,4}\d+(?:\s*${DASH}\s*\d+)?(?:\s*(?:&\s*)?nn?\.\s*\d+(?:\s*${DASH}\s*\d+)?)?`;
// A reporter: 1-6 tokens like F. / Supp. / 2d / App'x / S. / Ct. / & / Idaho.
const REPORTER = String.raw`(?:(?:[A-Z][A-Za-z'’]{0,12}\.?|\d(?:d|th|st|nd|rd)|&)\s?){1,6}?`;

// VOLUME REPORTER PAGE, or VOLUME REPORTER at PIN (short form).
const CASE_CORE = new RegExp(
  String.raw`(?<![\w.])(\d{1,4})\s+(${REPORTER})\s*(,\s*at|at)?\s+(\d{1,6}|_{2,})(?![\w.]*\.\w)`,
  'g',
);
// Court and date: (3d Cir. 2006) / (W.D. Pa. 2013) / (1997) / (N.D. Ill. Jan. 5, 2015)
const COURT_PAREN = new RegExp(
  String.raw`^\s*\(([^()]{0,60}?)\s*((?:${MONTH}\s+\d{1,2},\s+)?(${YEAR}))\)`,
);
const STATUTE = [
  // 42 U.S.C. § 3602(b) / 42 U.S. Code § 3602 (b) / 29 C.F.R. §§ 1630.2–.3 / 26 U.S.C.A. § 1
  String.raw`(?<![\w.])\d{1,3}\s+(?:U\.\s?S\.\s?C(?:ode|\.)(?:\s?[AS]\.)?|U\.\s?S\.\s?Code\s+Ann\.|C\.\s?F\.\s?R\.)\s*(?:§§?|[Ss]ec(?:tion|s?\.)?)\s*${SEC}(?:\s?\([0-9a-zA-Z]{1,4}\))*(?:\s+et\s+seq\.)?(?:\s*\((?:[A-Z][a-z]+\.?\s?)?(?:Supp\.\s?[IVX]*\s?)?${YEAR}\))?`,
  // State codes: Cal. Civ. Code § 1714 / 43 Pa. Stat. Ann. § 955 / N.Y. Exec. Law § 296(1)
  String.raw`(?<![\w.])(?:\d{1,3}\s+)?(?:[A-Z][A-Za-z.'’]*\s+){1,5}?(?:Code|Stat\.|Laws|Law|Ann\.|Rev\.\s?Stat\.|Comp\.\s?Laws|Gen\.\s?Laws)(?:\s+Ann\.)?(?:\s+tit\.\s+\d+,)?\s*§§?\s*${SEC}(?:\s?\([0-9a-zA-Z]{1,4}\))*`,
  // Statutes at Large, Public Laws, Federal Register
  String.raw`(?<![\w.])\d{1,4}\s+Stat\.\s+\d+`,
  String.raw`Pub\.\s?L\.\s?No\.\s?\d{1,3}${DASH}\d{1,4}`,
  String.raw`(?<![\w.])\d{1,3}\s+Fed\.\s?Reg\.\s+[\d,]+`,
  // Constitutions: U.S. Const. art. I, § 8, cl. 3 / U.S. Const. amend. XIV, § 1
  String.raw`(?:U\.\s?S\.|[A-Z][a-z]+\.)\s+Const\.\s+(?:art\.\s+[IVXL]+|amend\.\s+[IVXL]+|pmbl\.)(?:,\s*§\s*\d+)?(?:,\s*cl\.\s*\d+)?`,
  // Federal rules: Fed. R. Civ. P. 12(b)(6) / Fed. R. Evid. 401
  String.raw`Fed\.\s?R\.\s?(?:Civ\.\s?P|Crim\.\s?P|App\.\s?P|Bankr\.\s?P|Evid)\.\s?\d+(?:\([a-z0-9]{1,4}\))*`,
].map(source => new RegExp(source, 'g'));
// A bare section in running text or a short form: § 3602(c) / §§ 3601–3619
const SECTION = new RegExp(
  String.raw`§§?\s*${SEC}(?:\s*${DASH}\s*${SEC})?(?:\s?\([0-9a-zA-Z]{1,4}\))*`,
  'g',
);
// Id. / id. at 5 / Id. § 3 / ibid.
const ID = new RegExp(
  String.raw`(?<![\w.])(?:[Ii]d\.|[Ii]bid\.)(?:,?\s+at\s+${PIN}(?:,\s*${PIN})*|\s+§§?\s*${SEC}(?:\([0-9a-zA-Z]{1,4}\))*|\s+¶+\s*\d+)?`,
  'g',
);
// Smith, supra, at 5 / Smith, supra note 3, at 5
const SUPRA = new RegExp(
  String.raw`(?<![\w.])([A-Z][\w'’.-]*(?:\s+(?:[A-Z][\w'’.-]*|of|the|&))*?),?\s+supra(?:,?\s+note\s+\d+)?(?:,?\s+at\s+${PIN})?`,
  'g',
);
// No. 13-114-J / No. 2:13-cv-00114 / Nos. 12-1, 12-2
const DOCKET = /(?<![\w.])Nos?\.\s+(?:\d+:)?\d{1,5}[-–][\w-]*\d?[\w-]*/g;
// 2015 WL 123456 / 2013 U.S. Dist. LEXIS 1234
const DATABASE = new RegExp(
  String.raw`(?<![\w.])${YEAR}\s+(?:WL|U\.\s?S\.\s?(?:Dist\.|App\.)\s?LEXIS|[A-Z][A-Za-z.]*(?:\s[A-Z][A-Za-z.]*){0,3}\s?LEXIS)\s+\d+`,
  'g',
);

const SIGNALS =
  /^(?:See(?:,? e\.g\.,?| also| generally)?|Cf\.|But see|But cf\.|Compare|Accord|Contra|E\.g\.,?|See, e\.g\.,)\s+/;
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
]);

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

// Walks back from `at` over a case name ("Lakeside Resort Enters., LP v. Bd. of
// Supervisors of Palmyra Twp.,"). Returns the name's start, or `at` when there is none.
function nameStart(text, at, { needV = false, maxTokens = 24 } = {}) {
  const before = text.slice(0, at);
  const tokens = [...before.matchAll(/\S+/g)];
  let start = at;
  let sawV = false;
  let words = 0;
  for (let k = tokens.length - 1; k >= 0 && words < maxTokens; k--) {
    const raw = tokens[k][0];
    const word = raw.replace(/[,;]$/, '');
    const next = tokens[k + 1]?.[0] || '';
    if (/[”"’)\]]$/.test(raw) && !/'s$|’s$/.test(raw)) break; // a quote or paren closes the sentence before
    if (/[:;]$/.test(raw)) break;
    const opener = word.match(/^[“"‘(\[]+/)?.[0] || '';
    const bare = word.slice(opener.length);
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
    if (bare === 'v.' || bare === 'vs.' || bare === 'In' || bare === 'rel.') sawV = true;
    start = tokens[k].index + opener.length;
    words++;
    if (opener) break; // "(Smith v. Jones" or "“Smith": the name starts here
  }
  if (needV && !sawV) return at;
  return start;
}

// All citations in a text, in order, without overlaps. Each is
// {type, start, end, text, ...fields}; `core` is the span eyecite would call the cite.
export function findCitations(text) {
  const found = [];
  // Full and short case citations.
  for (const m of text.matchAll(CASE_CORE)) {
    const [whole, volume, rawReporter, at, page] = m;
    const reporter = rawReporter.trim();
    const known = isReporter(reporter);
    // A reporter needs a period (or must be known): "2 Big Dogs 5" is not a cite.
    if (!known && !/\./.test(reporter)) continue;
    if (/^(?:U\.S\.C|C\.F\.R|Stat|Fed\.\s?Reg|WL|LEXIS)/.test(reporter.replace(/\s/g, '')))
      continue;
    let end = m.index + whole.length;
    let pin = null;
    const short = Boolean(at);
    if (short) {
      pin = page;
      const more = text
        .slice(end)
        .match(
          new RegExp(String.raw`^(?:\s*${DASH}\s*\d+)?(?:\s*(?:&\s*)?nn?\.\s*\d+)?(?:,\s*${PIN})*`),
        );
      if (more) {
        pin += more[0];
        end += more[0].length;
      }
    } else {
      const pins = text
        .slice(end)
        .match(new RegExp(String.raw`^(?:,\s*(?:at\s+)?${PIN}(?![\w.]|\s+[A-Z]))*`));
      if (pins?.[0]) {
        pin = pins[0].replace(/^,\s*/, '');
        end += pins[0].length;
      }
    }
    let court = null,
      year = null;
    const paren = text.slice(end).match(COURT_PAREN);
    if (paren) {
      court = paren[1].trim() || null;
      year = paren[3];
      end += paren[0].length;
    }
    // Explanatory parentheticals: (quoting ...) (emphasis added)
    const parentheticals = [];
    for (;;) {
      const gap = text.slice(end).match(/^\s*(?=[(\[])/);
      if (!gap) break;
      const open = end + gap[0].length;
      const close = closeOf(text, open);
      if (close < 0) break;
      parentheticals.push(text.slice(open + 1, close - 1));
      end = close;
    }
    // The case name before the core.
    const comma = text.slice(0, m.index).match(/,\s*$/);
    let start = m.index;
    let name = null;
    if (comma) {
      const nameEnd = m.index - comma[0].length;
      const s = nameStart(text, nameEnd, { needV: !short, maxTokens: short ? 5 : 24 });
      if (s < nameEnd) {
        start = s;
        name = text.slice(s, nameEnd);
      }
    }
    let signal = null;
    if (name) {
      const sig = name.match(SIGNALS);
      if (sig) {
        signal = sig[0].trim();
        start += sig[0].length;
        name = name.slice(sig[0].length);
      }
    }
    const parties = name?.split(/\s+v\.\s+/);
    found.push({
      type: short ? 'short' : 'full',
      start,
      end,
      text: text.slice(start, end),
      core: [m.index, m.index + whole.length],
      volume,
      reporter,
      page: short ? null : page,
      pin,
      court,
      year,
      known,
      name,
      plaintiff: parties?.length === 2 ? parties[0] : null,
      defendant: parties?.length === 2 ? parties[1] : null,
      antecedent: short ? name : null,
      signal,
      parentheticals,
    });
  }
  // Unreported cases: Smith v. Salvation Army, No. 13-114-J, 2015 WL 1, at *2 (W.D. Pa. 2015)
  for (const m of text.matchAll(DOCKET)) {
    let end = m.index + m[0].length;
    const db = text
      .slice(end)
      .match(
        new RegExp(
          String.raw`^,\s*${DATABASE.source.replace('(?<![\\w.])', '')}(?:,\s*at\s+${PIN})?`,
        ),
      );
    if (db) end += db[0].length;
    const paren = text.slice(end).match(new RegExp(String.raw`^,?${COURT_PAREN.source.slice(1)}`));
    if (paren) end += paren[0].length;
    const comma = text.slice(0, m.index).match(/,\s*$/);
    let start = m.index,
      name = null;
    if (comma) {
      const nameEnd = m.index - comma[0].length;
      const s = nameStart(text, nameEnd, { needV: true });
      if (s < nameEnd) {
        start = s;
        name = text.slice(s, nameEnd);
      }
    }
    found.push({
      type: name ? 'docket' : 'docket-number',
      start,
      end,
      text: text.slice(start, end),
      docket: m[0],
      name,
      court: paren?.[1]?.trim() || null,
      year: paren?.[3] || null,
      database: db ? db[0].replace(/^,\s*/, '') : null,
    });
  }
  for (const m of text.matchAll(DATABASE)) {
    found.push({ type: 'database', start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  for (const re of STATUTE) {
    for (const m of text.matchAll(re)) {
      found.push({ type: 'statute', start: m.index, end: m.index + m[0].length, text: m[0] });
    }
  }
  for (const m of text.matchAll(ID)) {
    found.push({
      type: 'id',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      pin: m[0].match(/at\s+(.*)$/)?.[1] || null,
    });
  }
  for (const m of text.matchAll(SUPRA)) {
    found.push({
      type: 'supra',
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      antecedent: m[1],
    });
  }
  for (const m of text.matchAll(SECTION)) {
    found.push({ type: 'section', start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  // Keep the longest of overlapping matches, earliest first.
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept = [];
  let container = null; // the last top-level citation
  for (const cite of found) {
    if (container && cite.start < container.end) {
      // A citation inside another one's parenthetical ("(quoting United States v.
      // Columbus Country Club, ...)") is kept, marked nested; other overlaps are dropped.
      const inParenthetical = container.parentheticals?.length && cite.start >= container.core?.[1];
      if (
        inParenthetical &&
        cite.end <= container.end &&
        cite.type !== 'section' &&
        !kept.some(k => k.nested && cite.start < k.end && k.start < cite.end)
      ) {
        kept.push({ ...cite, nested: true, within: kept.indexOf(container) });
      }
      continue;
    }
    kept.push(cite);
    container = cite;
  }
  return kept;
}

// Which earlier citation each short form, id. and supra points to (eyecite's resolve step,
// simplified). Quoted citations (inside “...”) belong to the quoted court, not the writer.
export function resolveCitations(text, cites) {
  const quoted = quoteSpans(text);
  const inQuote = c => quoted.some(([s, e]) => s < c.start && c.end <= e);
  const fulls = [];
  let last = null;
  for (const cite of cites) {
    cite.quoted = inQuote(cite);
    if (cite.type === 'full' || cite.type === 'docket') {
      fulls.push(cite);
      if (!cite.quoted) last = cite;
      continue;
    }
    if (cite.type === 'short') {
      const byVolume = cites.find(
        c =>
          c.type === 'full' &&
          c.volume === cite.volume &&
          squeeze(c.reporter) === squeeze(cite.reporter),
      );
      cite.refersTo = byVolume ? cites.indexOf(byVolume) : null;
      if (!cite.quoted && byVolume) last = byVolume;
    } else if (cite.type === 'id') {
      cite.refersTo = cite.quoted ? null : last ? cites.indexOf(last) : null;
    } else if (cite.type === 'supra') {
      const hit = fulls.find(c => c.name?.includes(cite.antecedent));
      cite.refersTo = hit ? cites.indexOf(hit) : null;
    } else if (cite.type === 'statute') {
      if (!cite.quoted) last = cite;
    }
  }
  return cites;
}

// The names a case goes by in running text, each mapped to the index of its citation:
// the first word of the plaintiff ("Lakeside"), or, when the plaintiff is a government
// party, the defendant's first word and whole name ("Columbus", "Columbus Country Club").
export function referenceNames(cites) {
  const names = new Map();
  for (const c of cites) {
    if (c.type !== 'full' && c.type !== 'docket' && c.type !== 'short') continue;
    const name =
      c.plaintiff && !/^(?:United States|State|People|Commonwealth|In re)\b/.test(c.plaintiff)
        ? c.plaintiff
        : c.defendant || c.antecedent;
    if (!name) continue;
    const key = name.split(/[\s,]+/)[0];
    if (key.length > 2 && !names.has(key)) names.set(key, cites.indexOf(c));
    if (c.defendant && /^(?:United States|State|People|Commonwealth)\b/.test(c.plaintiff || '')) {
      names.set(c.defendant.replace(/,.*$/, ''), cites.indexOf(c));
    }
  }
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

function parenSpans(text) {
  const spans = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(' || text[i] === '[') {
      const close = closeOf(text, i);
      if (close > 0) spans.push([i, close]);
    }
  }
  return spans;
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

const lastToken = left => (left.trimEnd().match(/(\S+)$/)?.[1] || '').replace(/^[“"‘(\[]+/, '');
const tokenBefore = left => {
  const words = left.trimEnd().split(/\s+/);
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
  if (options.splitFootnotes) {
    for (const m of text.matchAll(
      /([A-Za-z\]]+)([.!?]["”’)]?)(\d{1,3}|\[\d{1,3}\]|\[\*+\])(\s+)(?=[A-Z“"‘(])/g,
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
  if (options.splitLowercaseAfterQuote) {
    // "... receive packages.” this closely mirrors ..." A period inside a closing
    // quote ends the sentence even when the writer forgot the capital.
    for (const m of text.matchAll(/(\S+)\.([”"])(\s+)(?=[a-z])/g)) {
      if (isAbbreviation(m[1].replace(/^[“"‘(\[]+/, '') + '.')) continue; // “U.S.” and
      breaks.push({ at: m.index + m[0].length, why: 'lowercase after quotation' });
    }
  }
  return breaks;
}

// Why a break between `left` and `right` should be joined, or null to keep it.
export function joinReason(at, left, right, spans, options = {}) {
  if (/\n\s*$/.test(left)) return null; // a soft line break always separates
  for (const [kind, list] of spans) {
    if (list.some(([s, e]) => s < at && at < e)) return kind;
  }
  const tail = left.trimEnd();
  if (/\.\s?\.\s?\.$/.test(tail) && !/\.\s?\.\s?\.\s?\.$/.test(tail)) return 'ellipsis';
  if (/^\s*[.]/.test(right)) return 'ellipsis';
  const token = lastToken(left);
  if (options.joinEnumerators !== false && ENUMERATOR.test(tail.trim())) return 'enumerator'; // "I." / "2." / "(a)" alone
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

// The sentences of a block's text, as sentencesIn returns them: [{start, end, text}].
// options: keepQuotes (no break inside a balanced “quotation”), splitFootnotes,
// splitAfterCite, attachCitations (a sentence that is only a citation joins the one before).
export function legalSentences(text, locale, options = {}) {
  options = {
    keepQuotes: true,
    joinEnumerators: true,
    splitFootnotes: true,
    splitAfterCite: true,
    splitLowercaseAfterQuote: true,
    attachCitations: false,
    ...options,
  };
  const cites = findCitations(text);
  // Breaks Intl.Segmenter proposes, plus forced ones.
  const proposed = [];
  for (const { index } of segmenter(locale).segment(text))
    if (index > 0) proposed.push({ at: index, why: 'segmenter' });
  const forced = forcedBreaks(text, cites, options);
  const all = [...proposed, ...forced.filter(f => !proposed.some(p => p.at === f.at))].sort(
    (a, b) => a.at - b.at,
  );
  const spans = [
    ['citation', cites.map(c => [c.start, c.end])],
    ['parentheses', parenSpans(text)],
    ...(options.keepQuotes ? [['quotation', quoteSpans(text)]] : []),
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
        : spans.find(([, list]) => list.some(([s, e]) => s < at && at < e))?.[0] || null;
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

// A sentence that is only citations ("42 U.S.C. § 3602(b)." / "Id. at 5." / "See Lakeside, 455 F.3d at 159.").
export function isCitationSentence(sentence) {
  const cites = findCitations(sentence);
  if (!cites.length) return false;
  let rest = sentence;
  for (const c of cites.filter(c => !c.nested).sort((a, b) => b.start - a.start))
    rest = rest.slice(0, c.start) + rest.slice(c.end);
  rest = rest
    .replace(SIGNALS, '')
    .replace(/\b(?:see also|see|cf\.|quoting|citing|and|accord)\b/gi, '');
  return !/[A-Za-z]{2,}/.test(rest);
}

// A key that two mentions of the same authority share: 455 F.3d (any page or pin),
// 42 U.S.C. § 3602, No. 13-114-J.
export function citationKey(c) {
  if (c.type === 'full' || c.type === 'short') return `${c.volume} ${squeeze(c.reporter)}`;
  if (c.type === 'docket' || c.type === 'docket-number') return c.docket.replace(/\s+/g, ' ');
  if (c.type === 'statute' || c.type === 'section') {
    return c.text
      .replace(/\s+/g, '')
      .replace(/U\.S\.Code/, 'U.S.C.')
      .replace(/\([^)]*\)/g, '');
  }
  return null; // id., supra, database: resolved through other citations
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

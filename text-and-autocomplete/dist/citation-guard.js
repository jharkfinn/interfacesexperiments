// Citations, quotations and open items are the author's evidence. Claude may write the
// prose around them but must never invent, change or drop them, so every suggestion,
// rewrite and merge passes through these checks before the editor shows it.
import {
  NOT_NAME,
  REPORTERS,
  citationKey,
  findCitations,
  findReferences,
  isAbbreviation,
  isReporter,
  quoteSpans,
  referenceNames,
} from './legal-text.js';

// Contenteditable keeps typed spaces as nonbreaking ones; compare them as plain spaces.
// Each replaced character is one character, so offsets stay the same.
const plain = t => t.replace(/[\u00a0\u202f]/gu, ' ');

// Every pattern here keeps its repeated parts unambiguous and bounded: a name word runs
// from a capital to the next space, and a reporter word is one capital and lowercase
// letters. Looser patterns rescan a long all-caps heading ("Section 12 GOVERNING LAW AND
// JURISDICTION ...") in every possible way, which froze the page for seconds.
const MONTH = String.raw`(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\b`;
// The words of a reporter ("F. Supp.", "U.S.", "Cal. App."). The first has a period, so a
// date ("5 May 2024") or a time ("3 PM") is not taken for one.
const REPORTER_WORDS = String.raw`(?!${MONTH})(?=[A-Z][a-z'’]*\.)(?:[A-Z][a-z'’]*\.?\s?){1,6}`;
// A capitalized word of a case name, starting where its word starts.
const NAME_WORD = String.raw`(?<![\w.'’&-])[A-Z][\w.'’&-]*`;
// "The Cardinals v. Cubs home opener", "the Lakers v Celtics game": two teams, not a case.
const MATCHUP = String.raw`[A-Z][\w'’&-]*(?:\s+[A-Z][\w'’&-]*){0,3}\s+(?:[a-z]+\s+)?(?:games?|match(?:es|up)?|opener|series|rivalry|playoffs?|finals?|bout|fight|race|tournament|showdown|derby|clash|contest)\b`;
// "the Cardinals v.": a "v." after an article and one word is a matchup being written.
const NOT_AFTER_ARTICLE = String.raw`(?<!\b(?:[Tt]he|[Aa]n?)\s+[A-Z][\w'’&-]*\s+)`;
// Words before "No." that make the number a court's docket number: "Case No. 5", "Civ. No.
// 18-123", "Index No. 1234". A number after other words ("wore No. 5", "Order Form No.
// 2023-014") is prose.
const DOCKET_WORDS = String.raw`Case|Civ\.|Civil\s+Action|Dkt\.|Docket|Index|Appeal|Adv\.|Proc\.|Misc\.|Bankr\.|Crim\.|ECF`;
// California's record volumes: "2 CT 362", "RT 9:14", "1 AA 12".
const RECORD_BOOKS = 'CT|RT|AA|RA|JA|ER|SER|CR|AR';

const squeeze = text => text.replace(/\s+/g, '').replace(/’/g, "'");
// Each reporter or code that follows a volume, and the abbreviations it starts with ("F." of
// "F.3d", "L. Ed." of "L. Ed. 2d", and the "F" a streamed reply may stop at), so a citation
// being written ("455 F.", "29 C.") is told from a measure ("2 Tbsp.").
const REPORTER_STARTS = new Set(
  [...REPORTERS, 'U.S.C.', 'C.F.R.', 'Fed. Reg.', 'Stat.'].flatMap(reporter => {
    const word = squeeze(reporter);
    return [word, word[0], ...[...word.matchAll(/\./g)].map(m => word.slice(0, m.index + 1))];
  }),
);
// Whether `words` after a volume are a reporter, or the start of one.
const reporterStart = words => REPORTER_STARTS.has(squeeze(words)) || isReporter(words);
// Whether `words` between a volume and a page read as a reporter: a known one, one with a
// series ("Ohio St. 3d"), or several abbreviated words ("Mass. App. Ct."). One unknown word
// is not: "1 Cor. 13" is a Bible verse, "2 Tbsp. 3" a measure.
const reporterLike = words =>
  reporterStart(words) || /\d/.test(words) || words.trim().split(/\s+/).length > 1;

// Open items the author left for later: Claude must not fill them in or drop them.
export const PLACEHOLDER = /\[cite\]|\bTK\b|\((?:need|needs) to [^)]*\)|\bconfirm with client\b/gi;
// Where a case name, a reporter citation, a section, an id., a record or legislative
// citation, a quotation or a signal begins. Autocomplete stops before any of these, so it
// never starts writing authority. A signal counts only before what could begin authority
// ("See Lakeside", "See id."), so "See you then" is ordinary prose, and "at 3" counts only
// as a pin after a reporter ("455 F.3d, at 159") or a star page, so "meet at 3" is too.
// "No. 5" is a docket number only in a docket's shape ("No. 18-cv-7702") or after a
// docket word ("Case No. 5"), so a jersey number is prose. cutAtCitation checks the named
// groups further: a reporter must read as one, and a signal must come before a citation.
export const CITATION_START = new RegExp(
  [
    String.raw`(?<name>${NAME_WORD}(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&|ex rel\.)){0,12}\s+v\.?\s(?!${MATCHUP}))`,
    String.raw`\bIn re\s`,
    String.raw`\b\d{1,4}\s+(?<reporter>${REPORTER_WORDS}(?:\d[a-z]{1,2}\s?)?)(?:at\s+)?\*?\d{1,5}\b`,
    '§',
    '¶',
    String.raw`\b[Ii]d\.`,
    String.raw`\b[Ii]bid\.`,
    String.raw`\bsupra\b`,
    String.raw`\d[a-z]{0,2}\.?,\s*at\s+\*?\d`,
    String.raw`\bat\s+\*\d`,
    String.raw`\bNos?\.\s+(?:\d+:\d\d-[A-Za-z]{2,4}-|\d{1,5}[-–](?:cv|cr|mc|bk|md|ap|civ|crim|misc)[-–])`,
    String.raw`\b(?:${DOCKET_WORDS})\s{0,3}Nos?\.\s*\d`,
    String.raw`\bNos?\.\s+[\w:–-]{1,20}(?=,\s*\d{4}\s+(?:WL|U\.S\.\s?Dist\.\s?LEXIS)|\s*\([A-Z]{2,5}\))`,
    String.raw`\b\d{4}\s+(?:WL|U\.S\.\s?Dist\.\s?LEXIS)\s`,
    // The record: "(Compl. ¶ 9)", "Hollis Dep. 22:15", "Ex. B", "ECF No. 12", "(2 CT 362)".
    String.raw`(?:${NAME_WORD}\s+){0,2}(?:(?:Am\.\s+)?Compl|Decl|Aff|Depo?|Exh?|Exs|Tr)\.(?=[\s,]|$)`,
    String.raw`\bECF\s+No\.`,
    String.raw`\bDkt\.\s+(?:No\.\s+)?\d`,
    String.raw`[(;]\s*(?:\d{1,2}\s+)?(?:Supp\.\s*)?(?:${RECORD_BOOKS})\s+\d`,
    String.raw`\b\d{1,2}\s+(?:Supp\.\s*)?(?:CT|RT)\s+\d`,
    String.raw`\b(?:CT|RT)\s+\d+:\d`,
    String.raw`\bR\.\s+at\s+\d`,
    String.raw`\bJ\.A\.\s+\d`,
    // Codes, rules and legislative history: "(Evid. Code, § 352)", "Code Civ. Proc.",
    // "Fed. R. Civ. P.", "U.S. Const.", "42 U.S.C.", "Pub. L. No.", "H.R. Rep.".
    String.raw`\(\s*(?:[A-Z][a-z]+\.\s?(?:&\s?)?){1,3}Code,`,
    String.raw`\bCode\s+Civ\.\s+Proc\.`,
    String.raw`\bFed\.\s?R\.\s`,
    String.raw`\b(?:U\.\s?S\.|[A-Z][a-z]+\.)\s?Const\.`,
    String.raw`\b\d{1,3}\s+(?:U\.\s?S\.\s?C|C\.\s?F\.\s?R)\.`,
    String.raw`\bPub\.\s?L\.\s?No\.`,
    String.raw`\b(?:H\.\s?R\.|S\.)\s?(?:Conf\.\s?)?(?:Rep|Doc)\.`,
    String.raw`\bCong\.\s?Rec\.`,
    // English and Canadian reports and neutral citations: "[2015] UKSC 31", "[1990] 1 WLR
    // 491", "2019 SCC 65", "(1854) 9 Exch 341".
    String.raw`\[\d{4}\]\s+(?:\d{1,3}\s+)?[A-Z]{2,}`,
    String.raw`\b\d{4}\s+(?:UKSC|UKPC|UKHL|EWCA|EWHC|CSIH|CSOH|NICA|IESC|SCC|SCR|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|ONSC|BCSC|ABQB)\s+\d`,
    String.raw`\(\d{4}\)\s+\d{1,3}\s+[A-Z][\w.]{1,10}\s+\d`,
    String.raw`[„“‘]|(?<!\d)"|"(?=\w)`,
    String.raw`(?<signal>(?:^|\s)(?:See(?:,\s+e\.g\.,?)?|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,)\s+(?=[A-Z\d§¶„“"‘(]|id\.|ibid\.|also\b|generally\b|e\.g\.))`,
  ].join('|'),
  'g',
);
// A paragraph that ends in a signal. Signals are short, so only the end of a text is read.
const SIGNAL_TAIL =
  /(?:^|[\s(])(?:See(?:,? e\.g\.,| also| generally)?|Cf\.|But see|But cf\.|Accord|Contra|Compare|E\.g\.,?)\s*$/g;
// A text that stops partway into a citation: "Smith v.", "Lakeside, 455 F.3d at", "(Ortega,
// supra, 26 Cal.4th at p.", "(Aguilar v. Atlantic Richfield Co. (2001)", "No. 18-cv-7702
// (JPO),", "Kessler v. Northgate Cold Storage, LLC,", "(Compl.", "(RT 12:", "Fed. R. Civ.
// P.", "EEOC, Enforcement Guidance". A volume counts only after a comma, a parenthesis, a
// sentence's end, a signal, a word that leads into a citation ("under 42 U.S.", "is 42
// U.S.") or the start, and only before what reads as a reporter (partialCitation checks the
// `volume` group): a known one, or after a comma or a parenthesis any abbreviation
// ("Functions, 100 Harv."). So "She has visited 48 U.S." and a list item's "2 Tbsp." are
// prose; "No." only after a docket word or a case name, so "who wore No." is too.
const CITATION_TAIL = new RegExp(
  String.raw`(?:${[
    String.raw`${NOT_AFTER_ARTICLE}\b(?:v|vs)\.`,
    String.raw`\b(?:[Ii]d|[Ii]bid)\.`,
    '§§?',
    '¶¶?',
    String.raw`(?:\b(?:${DOCKET_WORDS})\s*|\bv\.?\s[^()\n]{1,100},\s*)Nos?\.`,
    String.raw`(?:^|(?<mark>[,;(\[]["”’]?|\)\s)|[.!?]["”’)]?\s|\b(?:[Ss]ee|[Cc]f\.|also|[Aa]ccord|[Cc]ontra|[Cc]ompare|under|in|is|of|per|and|or)\s)\s*\d{1,4}\s+(?<volume>${REPORTER_WORDS}(?:\d[a-z]{1,2})?|[A-Z](?=\s*$))\s*(?:at)?`,
    String.raw`\b\d{4}\s+(?:WL|U\.S\.\s?Dist\.\s?LEXIS)`,
    String.raw`\bat\s+pp?\.`,
    String.raw`\bsupra,?(?:\s+note(?:\s+\d+)?,?)?(?:\s+at)?`,
    String.raw`\bsupra,\s*\d{1,4}`,
    String.raw`${NOT_AFTER_ARTICLE}\b(?:v|vs)\.?\s[^()\n]{1,80}\(\d{4}\)`,
    String.raw`\bIn re\s[^()\n]{1,80}\(\d{4}\)`,
    String.raw`\bNos?\.\s+[\w:–-]{1,20}(?:\s*\([A-Z]{2,5}\))+,`,
    // A case name and the volume after it: "Kessler v. Northgate Cold Storage, LLC, ",
    // "Bell Atl. Corp. v. Twombly, 550 ", and "In re Marriage of", which is one throughout.
    String.raw`${NOT_AFTER_ARTICLE}\b(?:v|vs)\.?\s+[A-Z][\w.'’&-]*(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|and|&|for|on|de|ex\s+rel\.)){0,10},(?:\s*\d{1,4})?`,
    String.raw`\bIn re(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|and|&|for)){0,10}(?:,\s*\d{0,4})?`,
    // A court or a date still open in its parenthesis: "(S.D.N.Y. ", "(D. Del. Jan. ", "(2d
    // Cir. 20", "(Oct. 17, ", and "Question 34 (Oct. ". One abbreviation alone ("(Dr. ",
    // "(St. ") is prose.
    String.raw`\((?:(?:[A-Z]\.){2,}\s?|(?:[A-Z][a-z'’]*\.\s?){2,4}|\d{1,2}(?:st|nd|rd|th|d)\s+Cir\.\s?)(?:[A-Z][a-z'’]*\.\s?){0,3}(?:${MONTH}\.?\s*(?:\d{1,2},?\s*)?)?\d{0,4}`,
    String.raw`\((?:[^()\n]{0,40}?\s)?${MONTH}\.?\s+\d{1,2},`,
    String.raw`\((?<=[\d\]]\s?\()${MONTH}\.?`,
    // English and Canadian citations: "[2015] UKSC ", "[1990] 1 WLR ", "[2004] EWCA Crim ",
    // "(1854) 9 Exch ", the California "(2001) 25 ", "2019 SCC " and "Donoghue v".
    String.raw`\[\d{4}\](?:\s+\d{1,3})?(?:\s+[A-Z][A-Za-z]{0,5}\.?){0,2}`,
    String.raw`\(\d{4}\)\s+\d{1,3}(?:\s+[A-Z][\w.]{0,10})?`,
    String.raw`\b\d{4}\s+(?:UKSC|UKPC|UKHL|EWCA|EWHC|CSIH|CSOH|NICA|IESC|SCC|FCA|FC|ONCA|BCCA|ABCA|QCCA|NSCA|ONSC|BCSC|ABQB)(?:\s+[A-Z][a-z]{1,5})?`,
    String.raw`\b[A-Z](?<!\b(?:[Tt]he|[Aa]n?)\s+[A-Z])[\w'’&-]*\s+v`,
    // Their statutes: "Theft Act 1968, s ", "RSC 1985, c T-13, s ".
    String.raw`\bAct\s+\d{4},(?:\s*ss?\.?)?`,
    String.raw`\bRS[A-Z]{1,2}\s+\d{4},(?:\s*c\.?(?:\s+[\w-]{1,10},?(?:\s*ss?\.?)?)?)?`,
    // Public laws, the Restatement, authors and the record: "Pub. L. No. ", "Restatement
    // (Second) of ", "Lindemann et al., ", "R. at ".
    String.raw`\bPub\.\s?L\.(?:\s?Nos?\.)?`,
    String.raw`\bRestatement(?:\s+\((?:First|Second|Third|Fourth)\))?(?:\s+of(?:\s+(?:the|and|[A-Z][\w'’]*)){0,4})?`,
    String.raw`\b[A-Z][\w'’-]*\s+et(?:\s+al\.,?)?`,
    String.raw`\bR\.\s+at`,
    String.raw`(?:\b(?:Am\.\s+)?Compl|\bDecl|\bAff|\bDepo?|\bExh?|\bExs|\bTr)\.`,
    String.raw`\bECF(?:\s+No\.)?`,
    String.raw`\bDkt\.(?:\s+No\.)?`,
    String.raw`[(;]\s*(?:\d{1,2}\s+)?(?:Supp\.\s*)?(?:${RECORD_BOOKS})(?:\s+\d+(?::\d*)?)?`,
    String.raw`\bFed\.\s?R\.(?:\s?(?:Civ|Crim|Evid|App|Bankr)\.)?(?:\s?P\.)?`,
    // Agency guidance: "EEOC, Enforcement Guidance: Reasonable Accommodation, Question 34".
    String.raw`\b[A-Z]{2,8},\s+(?:[A-Z][\w'’-]*:?\s+){0,8}(?:Enforcement|Guidance|Manual|Bulletin|Notice|Opinion|Letter|Ruling|Interpretation|Compliance)\b(?:[:,]?\s+(?:[A-Z][\w'’-]*|\d+|and|or|of|the|to|for|with|on|in|under|by|an?)){0,24}[:,]?`,
  ].join('|')})\s*$`,
  'g',
);
// Words only the name of a code, rule or report uses ("Code", "Proc.", "Rep.", "amend.",
// "Cong.", the "Law" of "N.Y. Gen. Bus. Law").
const CODE_WORD =
  /^(?:Code|Law|C\.P\.L\.R\.|Cong\.|Const\.|amend\.|app\.|pt\.|art\.|tit\.|subd\.|Ann\.|Stat\.|Regs?\.|Rep\.|Doc\.|Rec\.|U\.S\.C\.|C\.F\.R\.|Civ\.|Crim\.|Proc\.|Evid\.|Pen\.|Lab\.|Fam\.|Veh\.|Welf\.|Gov['’]t)$/;
// Words that go on with the citation just before them: a pin ("Id. at", "Ex. A at", "2019
// WL 1234567, at", "65 at para"), a part or a note ("pt.", "n."), "et seq." and "slip op.".
const CONTINUES =
  /(?:,\s*)?\b(?:at(?:\s+(?:pp?\.|paras?\.?|¶¶?|n\.))?|pt\.|paras?\.?|n\.|note|et|slip(?:\s+op\.(?:\s+at)?)?)$/;
// A signal left at the end of an insertion once the citation after it is cut ("…, see").
const TRAILING_SIGNAL =
  /(?:^|[\s(])(?:see(?:,?\s+e\.g\.,?|\s+also|\s+generally)?|cf\.|but\s+(?:see|cf\.)|accord|contra|compare|e\.g\.,?|quoting|citing)$/gi;
// The signal written right before a citation: "See", "but see", "See, e.g.,", "cf.".
const SIGNAL_BEFORE =
  /(?:^|[\s;,(\[])((?:but\s+)?(?:see(?:\s+also|\s+generally|,\s*e\.g\.,)?|cf\.)|compare|accord|contra|e\.g\.,)\s+$/i;
// "Smith v. Jones": a case Claude names must already be named in the document.
const CASE_NAME = new RegExp(
  String.raw`${NAME_WORD}(?:,?\s+(?:[A-Z][\w.'’&-]*|of|the|for|and|&)){0,12}\s+v\.\s+(?!${MATCHUP})[A-Z][\w.'’&-]*`,
  'g',
);
// Words that say what a court decided. After a case name or a court they claim a holding.
const HOLDING_VERB =
  /^(?:(?![.!?]["”’)]*(?:\s|$))[\s\S]){0,60}?\b(?:held|holds|found|finds|reasoned|concluded|ruled|stated|noted|explained|clarified|recognized)\b/;
// A court as the subject of a holding: "the court", "the Supreme Court", "this Court", "the
// Second Circuit", "the trial court", "Courts". "The food court" is not one.
const COURT =
  /(?<![\w])(?:(?:[Tt]he|[Tt]his|[Tt]hat)\s+(?:(?:[A-Z][\w.'’-]*|trial|district|appellate|lower|reviewing|state|federal|high|supreme)\s+){0,3}(?:[Cc]ourt|Circuit|panel)|[Cc]ourts)(?![\w])/g;
// Quotation marks. ’ is left out, since it is also the apostrophe, and so is a " after a
// number (a 9" pan), which is an inch mark.
const QUOTE_MARKS = /[„“”‘]|(?<!\d)"|"(?=\w)/g;
// Whether the " at `i` is an inch mark ("9\" pan") rather than a quotation mark, given
// whether a straight quotation is open before it.
const inchMark = (text, i, open) =>
  !open && /\d/.test(text[i - 1]) && !/\w/.test(text[i + 1] ?? '');
// The date of a citation the parser may not read, so a rewrite keeps it, and so keeps the
// citation: "(S.D.N.Y. Mar. 5, 2019)", "(5th ed. 2012)", "(West 2024)", "(Oct. 17, 2002)"
// after a number or a bracket ("Question 34 (Oct. 17, 2002)"), and a dated parenthetical
// that ends a citation sentence ("Policy Statement on Deception (Oct. 14, 1983).", "(Am. Bar
// Ass’n 2020);"). A bare "(2015)", or a date in parentheses within a sentence ("the call
// (Mar. 3, 2023) went well"), is prose.
const CITATION_DATE = new RegExp(
  String.raw`\((?:(?:[A-Z][\w.'’&]*\.|[A-Z]{2,}|\d+(?:st|nd|rd|th|d)|ed\.|West|McKinney|Lexis|Deering|Vernon|en\s+banc)\s+){1,6}(?:${MONTH}\.?\s+\d{1,2},\s+)?(?:1[6-9]|20)\d\d\)|(?<=[\d\]]\s?)\(${MONTH}\.?\s+\d{1,2},\s+(?:1[6-9]|20)\d\d\)|\([A-Z][^()\n]{0,80}?\b(?:1[6-9]|20)\d\d\)(?=[.;])`,
  'g',
);
// Number words, so "sixty (60)" may become "60", "forty miles" "40 miles" and "two
// hundred" "200".
const SMALL_NUMBERS =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(
    ' ',
  );
const TENS = 'twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
const NUMBER = new RegExp(
  String.raw`\d+(?:[.,:]\d+)*|\b(?:(${TENS.join('|')})(?:[-\s](${SMALL_NUMBERS.slice(1, 10).join('|')}))?|(${SMALL_NUMBERS.join('|')}))(?:\s+(hundred|thousand))?\b`,
  'gi',
);
// Month and weekday names, so a rewrite may not move "April 7" to "May 7" or "Monday" to
// "Tuesday". "Mar." and "March" are the same month. "May" counts only beside a day or a
// year, since it is also a verb.
const DATE_WORD = new RegExp(
  String.raw`(?<![\w.])(?:(?:January|February|March|April|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?![\w'’])|(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.|May(?=,?\s+\d)|(?<=\d\s)May(?![\w'’]))`,
  'g',
);

const count = (text, re) => (text.match(re) || []).length;
const collapse = text => text.toLowerCase().replace(/\s+/g, ' ');
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The earliest match of `re` (a global pattern anchored at the end) that `accept` takes,
// starting in the last `window` characters of `text`, so a long text is not read from
// every position. Lookbehinds and "^" still see the whole text, so the window's start is
// not taken for the paragraph's.
function tailMatch(re, text, window, accept = () => true) {
  re.lastIndex = Math.max(0, text.length - window);
  for (let m; (m = re.exec(text)); re.lastIndex = m.index + 1) if (accept(m)) return m;
  return null;
}
const signalTail = text => tailMatch(SIGNAL_TAIL, text, 40);

// Guards run once per version Claude returns, with the same document each time, so the
// document's citations, and the names its cases go by, are found once.
let parsed = { text: null, cites: [], names: null };
function citationsOf(text) {
  if (parsed.text !== text) parsed = { text, cites: findCitations(text), names: null };
  return parsed.cites;
}
function namesOf(text) {
  const cites = citationsOf(text);
  parsed.names ??= referenceNames(cites);
  return parsed.names;
}

// The signal written right before `at` in `text`, lowercased and without spaces ("see",
// "butsee", "see,e.g.,"), or ''. "oversee Smith" has none.
function signalAt(text, at) {
  const from = Math.max(0, at - 24);
  const m = text.slice(from, at).match(SIGNAL_BEFORE);
  if (!m || (from > 0 && !/^[\s;,(\[]/.test(m[0]) && /\w/.test(text[from - 1]))) return '';
  return m[1].toLowerCase().replace(/\s+/g, '');
}
// Where the signal before a citation at `at` starts, or `at` when it has none.
function signalStart(text, at) {
  const signal = signalAt(text, at);
  if (!signal) return at;
  const m = text.slice(Math.max(0, at - 24), at).match(SIGNAL_BEFORE);
  return at - m[0].length + m[0].indexOf(m[1]);
}

// What a rewrite must keep word for word and in order, as sorted {start, text, signal}:
// each citation with the signal written before it, and the date of any citation the parser
// could not read.
function evidenceOf(text, cites = findCitations(text)) {
  const parts = cites
    .filter(c => !c.nested)
    .map(c => ({ start: c.start, text: c.text, signal: signalAt(text, c.start) }));
  for (const m of text.matchAll(CITATION_DATE))
    if (!cites.some(c => c.start <= m.index && m.index < c.end))
      parts.push({ start: m.index, text: m[0], signal: null });
  return parts.sort((a, b) => a.start - b.start);
}

// Citations in `cites` that the document `doc` does not cite at all. A reference to a part
// of the document itself ("this Section 4.3") counts as cited when the document has its
// words, even where the parser read them as prose ("the Section 4.3 notice").
function unseen(doc, cites) {
  const known = new Set(citationsOf(doc).map(citationKey).filter(Boolean));
  return cites.filter(c => {
    const key = citationKey(c);
    return key && !known.has(key) && !(c.type === 'internal' && hasWords(doc, c.text));
  });
}
// Whether `text` has `words` as whole words.
const hasWords = (text, words) =>
  new RegExp(String.raw`(?<![\w.])${escape(words)}(?![\w])`).test(text);

// Whether the document `doc` has the citation `c` of `text` with the same signal before it:
// "But see Kwan, 737 F.3d at 845" is not what "See Kwan, 737 F.3d at 845" says.
function citedAlike(doc, text, c) {
  const signal = signalAt(text, c.start);
  for (let at = doc.indexOf(c.text); at >= 0; at = doc.indexOf(c.text, at + 1))
    if (signalAt(doc, at) === signal) return true;
  return false;
}

// Whether `doc` uses `name` as a name of its own, not as the end of a longer one: "Smith v.
// Jones" after "In" or a comma is one, "Schein, Inc. v. Archer" after "Henry" is not.
function namedIn(doc, name) {
  for (let at = doc.indexOf(name); at >= 0; at = doc.indexOf(name, at + 1)) {
    if (/[\w'’&-]/.test(doc[at - 1] ?? '')) continue;
    const word = doc.slice(Math.max(0, at - 40), at).match(/(\S+)\s+$/)?.[1];
    if (!word || !/^[A-Z][\w'’&-]*$/.test(word) || NOT_NAME.has(word)) return true;
  }
  return false;
}

// A case name in `text` the document does not use. The pattern takes in the words before
// a name ("Whether Smith v. Jones", "During the Cardinals v. Cubs"), so the name counts as
// used when the document has it after any of them.
function newCaseName(doc, text) {
  const used = new Map();
  const named = name => {
    if (!used.has(name)) used.set(name, namedIn(doc, name));
    return used.get(name);
  };
  for (const name of new Set([...text.matchAll(CASE_NAME)].map(m => m[0]))) {
    const v = name.search(/\s+v\.\s/);
    const starts = [
      0,
      ...[...name.slice(0, v).matchAll(/\s+(?=\S)/g)].map(m => m.index + m[0].length),
    ];
    if (!starts.some(at => named(name.slice(at)))) return true;
  }
  return false;
}

// Whether `text` says what a court held in words the document does not use: a case it
// names ("Lakeside held") or a court ("the Supreme Court found") before a holding verb.
// For inserted words (`inserted`) the claim runs to the end of its clause, since "the court
// held" is in most memos but what it held is not. A rewrite of a passage (`original`) that
// already says what that case or a court held may restate it in other words ("In Crawford,
// the Court held").
function holdingClaim(doc, text, { inserted = false, original = null } = {}) {
  const said = collapse(doc);
  const claims = (source, re) =>
    [...source.matchAll(re)].flatMap(m => {
      const rest = source.slice(m.index + m[0].length);
      const verb = rest.match(HOLDING_VERB);
      if (!verb) return [];
      const clause = inserted ? rest.slice(verb[0].length).match(/^[^.;!?]{0,80}/)[0] : '';
      return [collapse(m[0] + verb[0] + clause).trim()];
    });
  const subjects = [...namesOf(doc).keys()].map(
    name => new RegExp(String.raw`(?<![\w])${escape(name)}(?![\w])`, 'g'),
  );
  return [...subjects, COURT].some(
    re =>
      !(original !== null && claims(original, re).length) &&
      claims(text, re).some(claim => !said.includes(claim)),
  );
}

// The case names `text` relies on ("Lakeside", "Burlington Northern"), as merged [start,
// end] spans. A name the document registers runs on over the capitalized words after it,
// so "Burlington Northern" is one name though only "Burlington" is registered.
function nameSpans(text, cites, names) {
  return findReferences(text, cites, names).map(r => {
    let end = r.end;
    for (let k = 0; k < 3; k++) {
      const m = text.slice(end, end + 40).match(/^ ([A-Z][a-z][\w'’&-]*)/);
      if (!m || NOT_NAME.has(m[1]) || cites.some(c => c.start === end + 1)) break;
      end += m[0].length;
    }
    return [r.start, end];
  });
}
// The case names in `text`, sorted, for comparing two texts. `cites` are its citations.
// A possessive is the same name: "in Burlington Northern" may become "Burlington
// Northern’s".
const namesIn = (text, cites, names) =>
  nameSpans(text, cites, names)
    .map(([s, e]) => text.slice(s, e).replace(/['’]s$/, ''))
    .sort()
    .join('\n');

// The numbers in `text`, as values: "16,978" is 16978, "sixty" is 60 and "two hundred"
// 200, and its months and weekdays, by name ("month:Mar"). A number word below `least` is
// skipped, since "one" is often not a number at all ("the one who").
function numbersIn(text, least) {
  const values = [];
  for (const m of text.matchAll(NUMBER)) {
    let value;
    if (/^\d/.test(m[0])) value = m[0].replace(/,(?=\d{3}(?!\d))/g, '');
    else {
      value = m[1]
        ? (TENS.indexOf(m[1].toLowerCase()) + 2) * 10 +
          (m[2] ? SMALL_NUMBERS.indexOf(m[2].toLowerCase()) : 0)
        : SMALL_NUMBERS.indexOf(m[3].toLowerCase());
      if (m[4]) value *= /^h/i.test(m[4]) ? 100 : 1000;
    }
    if (typeof value === 'string' || value >= least) values.push(String(value));
  }
  for (const m of text.matchAll(DATE_WORD))
    values.push(`${/day$/.test(m[0]) ? 'day' : 'month'}:${m[0].slice(0, 3)}`);
  return values;
}
// Whether `text` has a number or date `original` does not: each number it writes, as
// digits or as a word from "two" up, and each month or weekday it names, must be one
// `original` has, as many times. A rewrite may drop one ("(1) … (2) …" becoming a
// sentence), but not change or add one.
function newNumber(original, text) {
  const left = new Map();
  for (const value of numbersIn(original, 0)) left.set(value, (left.get(value) || 0) + 1);
  return numbersIn(text, 2).some(value => {
    const n = left.get(value) || 0;
    left.set(value, n - 1);
    return n <= 0;
  });
}

// Merges overlapping [start, end, …] spans, sorted by start. A merged span keeps the rest
// of the span that starts first.
function merge(spans) {
  const merged = [];
  for (const span of [...spans].sort((a, b) => a[0] - b[0] || b[1] - a[1])) {
    const last = merged.at(-1);
    if (last && span[0] < last[1]) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
  }
  return merged;
}

// Curly double quotations, “English” and „German“ (where “ closes), as the closed
// [start, end] spans and the starts of those still open.
function curlyQuotes(text) {
  const spans = [];
  const open = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '„') open.push(i);
    else if (c === '“') {
      if (text[open.at(-1)] === '„') spans.push([open.pop(), i + 1]);
      else open.push(i);
    } else if (c === '”' && text[open.at(-1)] === '“') spans.push([open.pop(), i + 1]);
  }
  return { spans, open };
}

// Every quotation in `text`, as merged [start, end] spans. Beyond the balanced double
// quotations quoteSpans finds, a “ that never closes quotes to the end of its paragraph,
// straight quotes it could not pair (a stray space in `, " [t]o … lives."`) are paired in
// order, and ‘single’ and „German“ quotations count too. A slip in the quotation marks
// must not leave quoted words open to change.
function quotations(text) {
  const spans = quoteSpans(text);
  const paragraphEnd = i => {
    const end = text.indexOf('\n', i);
    return end < 0 ? text.length : end;
  };
  const curly = curlyQuotes(text);
  spans.push(...curly.spans, ...curly.open.map(i => [i, paragraphEnd(i)]));
  const singles = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') singles.length = 0;
    else if (c === '‘') singles.push(i);
    // A ’ inside a word ("club’s") is an apostrophe, not the end of a quotation.
    else if (c === '’' && singles.length && !/[\p{L}\p{N}]/u.test(text[i + 1] ?? ''))
      spans.push([singles.pop(), i + 1]);
  }
  if (text.includes('"') && !spans.some(([s]) => text[s] === '"')) {
    let open = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') open = -1;
      else if (text[i] === '"' && !inchMark(text, i, open >= 0)) {
        if (open < 0) open = i;
        else {
          spans.push([open, i + 1]);
          open = -1;
        }
      }
    }
  }
  return merge(spans);
}

// The text a selection or a sentence may not reword, as sorted [start, end, type] with
// overlaps merged: citations with their signals, quotations, open items, and the short
// names of cases cited ("Lakeside", "Burlington Northern"). A merged span keeps the type
// of the span that starts first, so a citation inside a quotation counts as quotation.
// `names` are the case names of the whole document; by default only the citations in
// `text` give them.
export function protectedSpans(text, names) {
  text = plain(text);
  return spansOf(text, findCitations(text), names);
}
function spansOf(text, cites, names) {
  return merge([
    ...evidenceOf(text, cites).map(p => [
      p.signal ? signalStart(text, p.start) : p.start,
      p.start + p.text.length,
      'citation',
    ]),
    ...quotations(text).map(([s, e]) => [s, e, 'quotation']),
    ...[...text.matchAll(PLACEHOLDER)].map(m => [m.index, m.index + m[0].length, 'placeholder']),
    ...nameSpans(text, cites, names ?? referenceNames(cites)).map(([s, e]) => [s, e, 'name']),
  ]);
}

// For each position i of `text`, the ( still open just before it, or -1: one pass, so a
// cut that steps back through a long text reads it in constant time.
function openParentheses(text) {
  const opens = new Int32Array(text.length + 1);
  const stack = [];
  for (let i = 0; i < text.length; i++) {
    opens[i] = stack.length ? stack.at(-1) : -1;
    if (text[i] === '(') stack.push(i);
    else if (text[i] === ')') stack.pop();
    else if (text[i] === '\n') stack.length = 0;
  }
  opens[text.length] = stack.length ? stack.at(-1) : -1;
  return opens;
}

// Where a run of code, rule or report words ends `text` ("Cal. Gov’t Code", "(Civ. Code,",
// "Code Civ. Proc.,", "Bus. & Prof. Code", "N.Y. Gen. Bus. Law", "H.R. Rep.", "U.S. Const.
// amend. XIV,", "29 C.F.R. pt. 1630, app."), or -1. A run needs two words, one of them a
// word only such names use, so "the Penal Code" and "Acme Inc." are prose.
function codeRun(text) {
  const from = Math.max(0, text.length - 160);
  const words = [...text.slice(from).matchAll(/\S+/g)];
  let k = words.length;
  let code = false;
  for (; k > 0; k--) {
    const word = words[k - 1][0].replace(/[,;]$/, '').replace(/^[(\[]/, '');
    // A roman numeral counts only as the number of an article or amendment ("art. VI").
    const numeral =
      /^[IVXL]+$/.test(word) && /^(?:art|amend|tit|ch|pt)\.$/.test(words[k - 2]?.[0] ?? '');
    if (!/^\d{1,5}$|^Code$|^Law$|^Gov['’]t$|^&$/.test(word) && !numeral && !isAbbreviation(word))
      break;
    code ||= CODE_WORD.test(word);
  }
  return code && words.length - k >= 2 ? from + words[k].index : -1;
}

// Where a citation that `text` stops partway into begins, or -1: CITATION_TAIL's forms, a
// run of code words, a citation that ends where the text does, at a page before a final
// comma ("550 U.S. 544, 570,") or before a word that goes on with it ("Id. at"), and an
// explanatory parenthetical still open after a citation ("(2d Cir. 2004) (applying Rule
// 9(b) to"). `cites` are the citations of `text`, or of a longer text that begins with
// it, and `opens` its open parentheses.
function partialCitation(text, cites, opens = openParentheses(text)) {
  const tail = tailMatch(
    CITATION_TAIL,
    text,
    240,
    m =>
      m.groups.volume === undefined ||
      reporterLike(m.groups.volume) ||
      (m.groups.mark !== undefined && /\./.test(m.groups.volume)),
  );
  if (tail) return tail.index;
  const trimmed = text.trimEnd();
  const run = codeRun(trimmed);
  if (run >= 0) return run;
  const end = trimmed.length;
  const page = /[\d*]\s*,$/.test(trimmed) ? end - 1 : -1;
  const more = trimmed.slice(-30).match(CONTINUES);
  const pin = more ? trimmed.slice(0, end - more[0].length).trimEnd().length : -1;
  const ended = cites.find(c => !c.nested && (c.end === end || c.end === page || c.end === pin));
  if (ended) return ended.start;
  const paren = opens[text.length];
  const before =
    paren < 0
      ? null
      : cites.find(c => !c.nested && c.end <= paren && !text.slice(c.end, paren).trim());
  return before ? before.start : -1;
}

// Whether the caret is partway through a quotation or a citation, given the text of
// its paragraph before it. Autocomplete stays quiet there, since anything it wrote
// would be quoted words or authority.
export function citationContext(paragraphBefore) {
  const text = plain(paragraphBefore);
  if (curlyQuotes(text).open.length || openQuote(text)) return 'inside-quotation';
  if (signalTail(text) || partialCitation(text, findCitations(text)) >= 0) return 'inside-citation';
  return null;
}

// A straight quotation, or a ‘single’ one, that has not closed yet in this paragraph.
function openQuote(text) {
  let straight = false;
  let single = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && !inchMark(text, i, straight)) straight = !straight;
    else if (c === '‘') single++;
    else if (c === '’' && single && !/[\p{L}\p{N}]/u.test(text[i + 1] ?? '')) single--;
  }
  return straight || single > 0;
}

// Whether the words after a signal (`rest`) are ordinary prose, not a citation: "See
// Halvorsen on Saturdays", "See Halvorsen, who bakes", "Compare Achterberg's sourdough".
// They are a citation when they begin with a case the document names (`names`), or when
// the capitalized words run on to "v." ("See Henry Schein, Inc. v."), a number ("See
// Lakeside, 455"), "supra", "et al.", a pin ("at 5"), id., or a mark no name has ("(HK)",
// "§", "¶"). Words that stop where the text does may still become one.
function proseAfterSignal(rest, names) {
  rest = rest.slice(0, 200).replace(/^(?:also|generally|e\.g\.,?)\s+/, '');
  for (const name of names.keys())
    if (rest.startsWith(name) && !/[\w'’]/.test(rest[name.length] ?? '')) return false;
  const words = rest.split(/\s+/).filter(Boolean);
  for (let k = 0; k < words.length; k++) {
    const word = words[k];
    if (/^(?:vs?\.?|supra,?|et|[Ii]d\.,?|[Ii]bid\.,?)$/.test(word)) return false;
    if (word === 'at') return k + 1 < words.length && !/^(?:\*?\d|pp?\.)/.test(words[k + 1]);
    if (/^(?:of|the|for|and|&|de|ex|rel\.)$/.test(word)) continue;
    if (/^[a-z]/.test(word)) return true;
    if (!/^[A-Z][\w.'’&-]*[,:!?]?$/.test(word)) return false;
    // "See Halvorsen." ends a sentence; "See Henry Schein, Inc." goes on.
    if (/[.!?]$/.test(word) && !isAbbreviation(word)) return true;
  }
  return false;
}
// Where a case name the pattern matched really starts: after the last sentence end inside
// it, so "JAMS. See Henry Schein, Inc. v." starts at "See". "Inc." and "U.S." end none.
function nameStart(name) {
  let start = 0;
  for (const m of name.matchAll(/(\S*[.!?])["”’)]*\s+(?=\S)/g))
    if (!isAbbreviation(m[1])) start = m.index + m[0].length;
  return start;
}

// A signal, in any case, that may lead into a citation through an author or a title.
const LEAD_SIGNAL = /(?<![\w.'’-])(?:but\s+)?(?:see|cf\.|compare)(?![\w'’-])/gi;
// A word of an author, a title or a name: capitalized or a number, or a word that joins them.
const LEAD_WORD =
  /^(?:[A-Z\d][\w.'’&/-]*,?|\([A-Z]\w*\),?|&|of|the|and|for|on|et|al\.,?|vs?\.?|e\.g\.,?|also|generally)$/;
// The name before a citation that names no case: "Vavilov, " of "Vavilov, 2019 SCC 65",
// "In Starbucks " of "In Starbucks [2015] UKSC 31".
const NAME_BEFORE =
  /(?<![\w.'’&-])(?:[A-Z][\w'’&.-]*|\([A-Z]\w*\))(?:\s+(?:[A-Z][\w'’&.-]*|of|the|and|&|vs?\.?|\([A-Z]\w*\))){0,6},?\s*$/;
// The name of a code right before its section: "California Civil Code " of "California
// Civil Code § 1714", "Title VII " of "Title VII § 704".
const CODE_NAME_BEFORE =
  /(?<![\w.'’&-])[A-Z][\w'’&.-]*(?:\s+(?:[A-Z][\w'’&.-]*|of|and|&)){0,5}\s+$/;
const CASE_TYPES = new Set(['full', 'short', 'docket', 'database']);

// Where the words that lead into the citation at `cut` begin, if the insertion (from
// `offset`) has them, else `cut`: a signal and the author or title after it ("see 5
// Charles Alan Wright & Arthur R. Miller, Federal Practice and Procedure § 1357"), the name
// before a citation that names no case ("Vavilov, 2019 SCC 65"), or the name of a code
// before its section ("California Civil Code § 1714"). Left behind, they would be a piece
// of the citation.
function citationLead(text, cut, offset, cites) {
  if (/[„“‘"]/.test(text[cut])) return cut;
  const lead = text.slice(offset, cut);
  let signal = null;
  for (const m of lead.matchAll(LEAD_SIGNAL)) signal = m;
  if (signal) {
    const words = lead
      .slice(signal.index + signal[0].length)
      .split(/\s+/)
      .filter(Boolean);
    const leads = word =>
      LEAD_WORD.test(word) &&
      (!/[.!?]$/.test(word) || isAbbreviation(word) || /^[A-Z]\.$/.test(word));
    if (words.length <= 16 && words.every(leads)) return offset + signal.index;
  }
  const cite = cites.find(c => c.start === cut && !c.nested);
  const from = Math.max(0, lead.length - 120);
  const named =
    cite && CASE_TYPES.has(cite.type) && !cite.name && !cite.antecedent
      ? lead.slice(from).match(NAME_BEFORE)
      : cite && (cite.type === 'statute' || cite.type === 'section')
        ? lead.slice(from).match(CODE_NAME_BEFORE)
        : null;
  return named ? offset + from + named.index : cut;
}

// "Kessler v. Northgate": a paragraph that stops partway into a case name, after its "v."
// and at least one word of the other party's name. "The Cardinals v. Cubs" is a game.
const NAME_OPEN = new RegExp(
  String.raw`(?<!\b(?:[Tt]he|[Aa]n?)\s+)\b[A-Z][\w.'’&-]*,?\s+vs?\.?((?:\s+(?:[A-Z][\w.'’&-]*,?|of|the|and|&|for)){1,8})\s?$`,
);
const STARTS_MATCHUP = new RegExp(String.raw`^\s*${MATCHUP}`);
// Whether `insertion` goes on with a case name that `paragraphBefore` is writing:
// "Kessler v. Northgate" + " Cold Storage", + "s" or + " & Co.", but not + " held that",
// + " and the cases after it" or a new sentence after "Twombly.".
function continuesName(paragraphBefore, insertion) {
  const open = paragraphBefore.slice(-160).match(NAME_OPEN);
  if (!open || !/^(?:[\w'’-]|\s?(?:[A-Z(]|(?:of|and|for|the|&)\s+[A-Z])|,\s*[A-Z])/.test(insertion))
    return false;
  const last = open[1].trim().split(/\s+/).at(-1);
  if (/[.!?]$/.test(last) && !isAbbreviation(last)) return false;
  return !STARTS_MATCHUP.test(open[1] + insertion.slice(0, 80));
}

// An autocomplete insertion cut just before the first citation, signal or quotation it
// would start, or that it stops partway into ("Lakeside, 455 F.3d at"). A case name, and
// the signal, author or title that leads into a citation, go with it, and a signal, an
// unclosed parenthesis ("(the"), the name of a code ("Cal. Gov’t Code") or an article left
// at the end goes too. An insertion that goes on with a case name the paragraph is
// writing ("Kessler v. Northgate" + " Cold Storage") is cut whole. What is left may be
// empty. `doc`, the document, tells a signal before one of its case names ("See
// Lakeside") from one before ordinary words ("See Halvorsen on Saturdays").
export function cutAtCitation(paragraphBefore, insertion, doc = '') {
  const offset = paragraphBefore.length;
  const text = plain(paragraphBefore + insertion);
  if (continuesName(text.slice(0, offset), text.slice(offset))) return '';
  const names = doc ? namesOf(plain(doc)) : new Map();
  let cut = text.length;
  for (const m of text.matchAll(CITATION_START)) {
    if (m.index + m[0].length <= offset) continue;
    if (m.groups.signal && proseAfterSignal(text.slice(m.index + m[0].length), names)) continue;
    if (m.groups.reporter && !reporterLike(m.groups.reporter)) continue;
    cut = m.index + (m.groups.name ? nameStart(m[0]) : 0);
    break;
  }
  // The parser also knows citations the pattern does not start at: the name of
  // "Lakeside, 455 F.3d at 159", the title of "42 U.S.C. § 3602", or "Fed. R. Civ. P. 12".
  const cites = findCitations(text);
  const cite = cites.find(c => c.end > offset);
  if (cite) cut = Math.min(cut, cite.start);
  // What is left may still stop partway into a citation ("42 U.S. Code" before a cut "§",
  // or a reply that ends at "Lakeside, 455 F.3d at"), or end in the signal before one. Each
  // step moves the cut back; a text that keeps stopping partway into citations is cut whole.
  const opens = openParentheses(text);
  for (let last, steps = 0; last !== cut && cut > offset; steps++) {
    last = cut;
    if (steps === 100) cut = offset;
    else {
      const head = text.slice(0, cut);
      const signal = signalTail(head);
      const start = signal ? signal.index : partialCitation(head, cites, opens);
      if (start >= 0) cut = start;
    }
  }
  if (cut === text.length) return insertion;
  if (cut > offset) cut = citationLead(text, cut, offset, cites);
  return withoutDangling(insertion.slice(0, Math.max(0, cut - offset)));
}

// What a cut leaves dangling at the end of `kept`: punctuation, a signal, an article.
const DANGLING = [/[\s,;:(]+$/g, TRAILING_SIGNAL, /\s(?:the|a|an)$/g];
// `kept` without what would dangle once the citation after it is cut: those, an unclosed
// parenthesis ("(the"), and the name of a code ("Cal. Gov’t Code"), until none is left.
// Each step reads only the end of the text, and all unclosed parentheses go at once, so a
// long run of them ("(the (the …") is not read again from every position.
function withoutDangling(kept) {
  for (let last; last !== kept; ) {
    last = kept;
    for (const re of DANGLING)
      for (let m; (m = tailMatch(re, kept, 60)); ) kept = kept.slice(0, m.index);
    // Every parenthesis opened after the last one closed is still open.
    const open = kept.indexOf('(', kept.lastIndexOf(')') + 1);
    if (open >= 0) kept = kept.slice(0, open).trimEnd();
    const run = codeRun(kept);
    if (run >= 0) kept = kept.slice(0, run);
  }
  return kept;
}

// Why new text may not be inserted into the document `doc`, or null. Inserted text may
// not cite, quote, or name a case the document does not already name, nor say what a
// court held in words the document does not use, and a citation it copies must be in the
// document word for word, with the same signal and pin cite.
export function guardInsertion(doc, text) {
  doc = plain(doc);
  text = plain(text);
  const cites = findCitations(text);
  if (cites.length) {
    if (unseen(doc, cites).length) return 'new-citation';
    if (cites.some(c => !c.nested && !citedAlike(doc, text, c))) return 'new-citation';
  }
  // The date of a citation the parser does not read ("Policy Statement on Deception (Oct.
  // 14, 1983).") stands for that citation.
  if (evidenceOf(text, cites).some(p => p.signal === null && !doc.includes(p.text)))
    return 'new-citation';
  if (count(text, QUOTE_MARKS)) return 'new-quotation';
  if (newCaseName(doc, text)) return 'new-case-name';
  if (holdingClaim(doc, text, { inserted: true })) return 'holding-claim';
  return null;
}

// The same for a drafted paragraph, which also may not bring numbers of its own: dates,
// amounts and durations about the client come from the author.
export function guardDraft(doc, text) {
  const reason = guardInsertion(doc, text);
  if (reason) return reason;
  const numbers = new Set(plain(doc).match(/\d+(?:[.,]\d+)*/g) || []);
  if ((plain(text).match(/\d+(?:[.,]\d+)*/g) || []).some(n => !numbers.has(n))) return 'new-number';
  return null;
}

// Why `replacement` may not replace `original` (part of `doc`), or null. The prose may
// change; the citations (with their signals), quotations and open items must come through
// word for word, none may be added, the cases it names and its numbers and dates stay the
// same, and the rewrite may not say what a court held in words the document does not use.
export function guardReplacement(doc, original, replacement) {
  doc = plain(doc);
  original = plain(original);
  const text = plain(replacement);
  const replaced = findCitations(text);
  const added = replaced.filter(c => !c.nested);
  if (unseen(doc, added).length) return 'new-citation';
  // Each citation is kept, in order and with the same signal ("See" may not become "But
  // see"), and nothing is added to one or copied in from elsewhere ("at 159" becoming
  // "at 159, 881"). A reference to the document's own sections may be named again ("this
  // Section 4.3" for "Section 4.3").
  const cites = findCitations(original);
  let from = 0;
  for (const part of evidenceOf(original, cites)) {
    const at = text.indexOf(part.text, from);
    if (at < 0 || (part.signal !== null && signalAt(text, at) !== part.signal))
      return 'citation-changed';
    from = at + part.text.length;
  }
  const counted = added.filter(c => c.type !== 'internal' || !hasWords(original, c.text));
  if (
    counted.length > cites.filter(c => !c.nested).length ||
    added.some(c => !original.includes(c.text))
  )
    return 'citation-changed';
  const quotes = quotations(original).map(([s, e]) => original.slice(s, e));
  if (!keptInOrder(quotes, text)) return 'quotation-changed';
  if (count(text, QUOTE_MARKS) > count(original, QUOTE_MARKS)) return 'new-quotation';
  if (!keptInOrder(original.match(PLACEHOLDER) || [], text)) return 'placeholder-removed';
  if (newCaseName(doc, text)) return 'new-case-name';
  if (holdingClaim(doc, text, { original })) return 'holding-claim';
  // The cases the passage relies on stay the same ones, as many times.
  const names = namesOf(doc);
  if (names.size && namesIn(original, cites, names) !== namesIn(text, replaced, names))
    return 'citation-changed';
  if (newNumber(original, text)) return 'new-number';
  return null;
}

// Every text in `parts` appears in `text`, in the same order.
function keptInOrder(parts, text) {
  let from = 0;
  for (const part of parts) {
    const at = text.indexOf(part, from);
    if (at < 0) return false;
    from = at + part.length;
  }
  return true;
}

const KEEP_WORDS = 'Citations and quotations keep their exact words.';

// Why a selection may not be rewritten or rephrased, as the notice to show, or null.
// A selection must take a citation or quotation whole or leave it alone, and a resize
// of text that is mostly citation would have almost nothing it may change. A selection
// in a block quotation (`blockQuote`, which the text alone cannot show) is all quotation.
export function selectionRefusal(before, selected, after, rephrase, blockQuote = false) {
  // The whole document is read: a long quotation can open far before the selection, and
  // a case is often named far from its citation.
  const text = before + selected + after;
  const start = before.length + (selected.length - selected.trimStart().length);
  const end = before.length + selected.trimEnd().length;
  if (end <= start) return null;
  if (blockQuote) return KEEP_WORDS;
  const spans = spansOf(plain(text), citationsOf(plain(text)), namesOf(plain(text)));
  const within = ([s, e]) => s <= start && end <= e;
  const evidence = spans.filter(([, , type]) => type === 'citation' || type === 'quotation');
  // One bound falls strictly inside the span and the other does not: the selection takes
  // part of it ("Lakeside, 455" of "Lakeside, 455 F.3d at 159"). Both inside, or the
  // span exactly, is a selection inside it.
  const inside = (x, [s, e]) => s < x && x < e;
  if (evidence.some(span => inside(start, span) !== inside(end, span)))
    return 'Select the whole citation or quotation, or none of it.';
  if (evidence.some(within)) return KEEP_WORDS;
  if (spans.some(span => span[2] === 'name' && within(span)))
    return 'Case names keep their exact words.';
  if (!rephrase) {
    const visible = count(text.slice(start, end), /\S/g);
    let guarded = 0;
    for (const [s, e] of spans)
      guarded += count(text.slice(Math.max(s, start), Math.min(e, end)), /\S/g);
    if (guarded > 0.6 * visible)
      return 'This selection is mostly citation or quotation, which keep their exact words.';
  }
  return null;
}

// Why two sentences may not be merged, as the notice to show, or null. A merge rewords
// both, so neither may carry a citation, a real quotation, or an open item, nor sit in
// a block quotation (`blockQuote`).
export function combineRefusal(target, dragged, blockQuote = false) {
  const evidence = text => {
    text = plain(text);
    if (findCitations(text).length || count(text, PLACEHOLDER)) return true;
    return quotations(text).some(([s, e]) => count(text.slice(s, e), /[^\s“”"‘’]+/g) >= 4);
  };
  return blockQuote || evidence(target) || evidence(dragged)
    ? 'Sentences with citations, quotations, or open items are not combined, so their words stay exact. Move them instead.'
    : null;
}

const MESSAGES = {
  'new-citation': 'added a citation that is not in the document',
  'citation-changed': 'changed a citation',
  'quotation-changed': 'changed a quotation',
  'new-quotation': 'added a quotation',
  'placeholder-removed': 'removed an open item such as [cite]',
  'new-case-name': 'named a case that is not in the document',
  'holding-claim': 'said what a court held in words the document does not use',
  'new-number': 'changed a number or date',
};

// The notice for a rejected version. `op` names what was rejected: "The rewrite",
// "The new wording" or "The combined sentence".
export function guardMessage(reason, op) {
  return MESSAGES[reason]
    ? `${op} ${MESSAGES[reason]}, so it was not used.`
    : `${op} was not used.`;
}

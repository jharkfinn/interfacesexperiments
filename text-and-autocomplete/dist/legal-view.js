import { ROLE_NAMES, KIND_NAMES } from './legal-core.js';

// What the IRAC and Sourcing views draw from the legal reading of the document
// (legal-analysis.js). Every text shown here comes from the document itself or
// from this file: Claude only ever contributes words from fixed lists, so no
// name, citation, or quotation on screen was written by Claude.
//
// Elements that point at text carry `data-target`, an index into the `targets`
// list the caller passes in; each target is a list of spans {block, start,
// endBlock?, end} that the view turns into document ranges when hovered.

const el = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

// Adds a list of spans to `targets` and returns its index.
const target = (targets, spans) => targets.push(spans.filter(Boolean)) - 1;

const SEVERITY_ORDER = { fail: 0, warn: 1, info: 2 };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// IRAC: the structure checks, as a panel above the sections.
export function checksPanel(reading, names, targets) {
  const panel = el('details', 'irac-checks');
  panel.open = true;
  const summary = el('summary');
  panel.append(summary);
  if (!reading.labeled) {
    summary.textContent = 'Structure checks need Claude’s labels.';
    return panel;
  }
  const wanted = new Set(names);
  const checks = reading.checks
    .filter(check => wanted.has(check.id))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        names.indexOf(a.id) - names.indexOf(b.id),
    );
  const count = severity => checks.filter(check => check.severity === severity).length;
  const parts = [
    count('fail') && plural(count('fail'), 'fail'),
    count('warn') && plural(count('warn'), 'warning'),
    count('info') && plural(count('info'), 'note'),
  ].filter(Boolean);
  summary.textContent = parts.length
    ? `Structure · ${parts.join(' · ')}`
    : 'Structure · no problems found';
  if (checks.length) {
    const list = el('ul');
    for (const check of checks) {
      const row = el('li', 'irac-check');
      row.dataset.severity = check.severity;
      row.dataset.check = check.id;
      if (check.spans?.length) row.dataset.target = target(targets, check.spans);
      row.append(el('span', 'irac-check-dot'), el('span', 'irac-check-text', check.message));
      if (check.where) row.append(el('span', 'irac-check-where', check.where));
      list.append(row);
    }
    panel.append(list);
  }
  panel.append(
    el(
      'p',
      'irac-unchecked',
      'Not checked: whether a rule is synthesized from several cases, whether each case illustration is complete, whether comparisons pair specific facts, whether counter-arguments are answered well, and whether the conclusion adds anything new.',
    ),
  );
  return panel;
}

// The roles each rail letter stands for, the color it takes, and its name.
// Sub-issues have I R A C; the umbrella before them has P (an overall
// prediction), R (a cited rule), and M (a roadmap).
const RAIL_ROLES = {
  I: ['issue', 'heading'],
  R: ['rule'],
  A: ['application', 'counter'],
  C: ['conclusion'],
  P: ['conclusion', 'heading'],
  M: ['roadmap'],
};
const RAIL_COLORS = {
  I: 'issue',
  R: 'rule',
  A: 'application',
  C: 'conclusion',
  P: 'prediction',
  M: 'roadmap',
};
const RAIL_NAMES = {
  I: 'Issue',
  R: 'Rule',
  A: 'Application',
  C: 'Conclusion',
  P: 'Overall prediction',
  M: 'Roadmap',
};

// IRAC: a section's name over its pieces: its tag, its heading, how sure it
// sounds, and its rail of letters. Hovering a letter marks the runs it stands for.
export function sectionName(section, runs, targets) {
  const name = el('p', 'pv-group-label');
  name.append(el('span', 'irac-part', section.tag), el('span', 'irac-heading', section.label));
  if (section.phrase) {
    const confidence = el('span', 'irac-conf', section.phrase);
    confidence.dataset.rank = section.rank;
    confidence.title = 'How sure this section sounds';
    name.append(confidence);
  }
  if (section.rail?.length) {
    const rail = el('ol', 'irac-rail');
    rail.setAttribute('aria-label', 'Parts of this section');
    for (const step of section.rail) {
      const letter = el('li', 'irac-step', step.letter);
      const roles = step.roles || RAIL_ROLES[step.letter] || [];
      letter.dataset.role = RAIL_COLORS[step.letter] || roles[0] || '';
      letter.dataset.state = step.state;
      letter.title = step.title || RAIL_NAMES[step.letter] || step.letter;
      // A letter points at the runs it stands for, or at the section's start.
      const own = runs.filter(run => roles.includes(run.role));
      const spans = own.length
        ? own
        : runs.slice(0, 1).map(run => ({ block: run.block, start: run.start, end: run.start }));
      letter.dataset.target = target(targets, spans);
      rail.append(letter);
    }
    name.append(rail);
  }
  return name;
}

// IRAC: one run of sentences that share a job.
export function roleChip(element, piece, excerpt) {
  element.classList.add('irac-piece');
  element.dataset.role = piece.role || '';
  if (piece.guess) element.dataset.guess = '';
  if (piece.conflict) element.dataset.conflict = '';
  const role = el('span', 'irac-role', piece.role ? ROLE_NAMES[piece.role] : '…');
  if (piece.conflict) role.textContent += ' ?';
  element.append(role);
  if (piece.also) element.append(el('span', 'irac-also', `+ ${ROLE_NAMES[piece.also]}`));
  else if (piece.role === 'heading' && piece.kind === 'conclusion') {
    element.append(el('span', 'irac-also', '+ Conclusion'));
  }
  element.append(el('span', 'pv-excerpt', excerpt));
  let title = piece.text;
  if (piece.guess) title += ' (changed since Claude read it)';
  if (piece.conflict) {
    title += ` (Claude’s two labels disagree: ${ROLE_NAMES[piece.role]} that states ${KIND_NAMES[piece.kind]?.toLowerCase()}, so one may be wrong)`;
  }
  element.title = title;
}

const SUPPORT_BADGES = {
  direct: 'Direct',
  inferential: 'See',
  indirect: 'See also / Cf.',
  background: 'See generally',
  contrary: 'Contrary',
  secondhand: 'Secondhand',
  incomplete: 'Incomplete cite',
  below: 'Cited below',
  missing: 'No authority',
  unsourced: 'No fact source',
  record: 'Record',
};
const CITE_STATES = {
  own: '',
  quoted: ' · in quotation',
  nested: ' · inside (quoting …)',
  unresolved: ' · unresolved',
};

// Sourcing: one sentence with what it asserts, its support, its citations, and
// its flags. A citation chip points at the citation's own text.
export function sourceChip(element, sentence, excerpt, targets) {
  element.classList.add('src-piece');
  element.dataset.support = sentence?.support || 'unknown';
  if (sentence?.kind) element.dataset.kind = sentence.kind;
  if (sentence?.attention) element.dataset.attention = '';
  element.title = sentence?.text || excerpt;
  const line = el('span', 'src-line');
  line.append(el('span', 'src-kind', sentence?.kind ? KIND_NAMES[sentence.kind] : '?'));
  const badge = SUPPORT_BADGES[sentence?.support];
  if (badge) line.append(el('span', 'src-support', badge));
  line.append(el('span', 'src-text', excerpt));
  element.append(line);
  const cites = sentence?.cites || [];
  if (cites.length) {
    const row = el('span', 'src-cites');
    for (const cite of cites) {
      const chip = el('span', 'src-cite', cite.label + (CITE_STATES[cite.state] ?? ''));
      chip.dataset.state = cite.state;
      chip.dataset.target = target(targets, [
        { block: sentence.block, start: cite.start, end: cite.end },
      ]);
      chip.title = cite.text || cite.label;
      row.append(chip);
    }
    element.append(row);
  }
  const flags = sentence?.flags || [];
  if (flags.length) {
    const row = el('span', 'src-flags');
    for (const flag of flags) {
      const chip = el('span', 'src-flag', flag.text);
      chip.dataset.flag = flag.id;
      if (flag.title) chip.title = flag.title;
      row.append(chip);
    }
    element.append(row);
  }
}

const GROUP_NAMES = { cases: 'Cases', statutes: 'Statutes', other: 'Other' };

// Sourcing: the table of authorities, with a box per authority for the reader
// to tick once they have read it, and the citations nothing resolves.
export function authoritiesPanel(reading, read, onRead, onAttention, attentionOnly, targets) {
  const panel = el('details', 'src-authorities');
  panel.open = true;
  const authorities = reading.authorities || [];
  const count = group => authorities.filter(authority => authority.group === group).length;
  const done = authorities.filter(authority => read.has(authority.key)).length;
  const summary = el('summary');
  summary.textContent = `Authorities · ${plural(count('cases'), 'case')} · ${plural(count('statutes'), 'statute')} · read ${done} of ${authorities.length}`;
  panel.append(summary);
  if (authorities.length) {
    const table = el('table', 'src-toa');
    const body = el('tbody');
    for (const group of ['cases', 'statutes', 'other']) {
      const rows = authorities.filter(authority => authority.group === group);
      if (!rows.length) continue;
      const heading = el('tr', 'src-toa-group');
      const cell = el('th', '', GROUP_NAMES[group]);
      cell.colSpan = 2;
      heading.append(cell);
      body.append(heading);
      for (const authority of rows) body.append(authorityRow(authority, read, onRead, targets));
    }
    table.append(body);
    panel.append(table);
  }
  if (reading.unresolved?.length) {
    const list = el('ul', 'src-unresolved');
    for (const item of reading.unresolved) {
      const row = el('li', '', item.text);
      if (item.span) row.dataset.target = target(targets, [item.span]);
      list.append(row);
    }
    panel.append(list);
  }
  const bar = el('div', 'src-summary');
  const toggle = el(
    'button',
    'src-attention',
    `Only what needs attention (${reading.attentionCount})`,
  );
  toggle.type = 'button';
  toggle.setAttribute('aria-pressed', String(attentionOnly));
  toggle.onclick = () => onAttention(!attentionOnly);
  bar.append(toggle);
  panel.append(bar);
  return panel;
}

function authorityRow(authority, read, onRead, targets) {
  const row = el('tr', 'src-toa-row');
  row.dataset.key = authority.key;
  row.dataset.target = target(
    targets,
    authority.mentions.map(mention => ({
      block: mention.block,
      start: mention.start,
      end: mention.end,
    })),
  );
  const box = el('td');
  const check = el('input', 'src-read');
  check.type = 'checkbox';
  check.checked = read.has(authority.key);
  check.setAttribute('aria-label', 'I have read this authority');
  check.title = 'Kept in this browser only';
  check.onclick = event => event.stopPropagation();
  check.onchange = () => onRead(authority.key, check.checked);
  box.append(check);
  const about = el('td');
  const name = el('span', 'src-toa-name');
  // The case name is italic; the rest of the title is plain.
  const [from, to] = authority.italic || [0, 0];
  if (to > from) {
    name.append(
      authority.title.slice(0, from),
      el('i', '', authority.title.slice(from, to)),
      authority.title.slice(to),
    );
  } else name.textContent = authority.title;
  const meta = el('span', 'src-toa-meta');
  const court = el('span', 'src-court', authority.levelName || authority.level || '');
  court.dataset.level = authority.level || 'unknown';
  meta.append(court);
  if (authority.where) meta.append(el('span', 'src-toa-where', authority.where));
  meta.append(el('span', 'src-toa-count', plural(authority.count, 'mention')));
  about.append(name, meta);
  for (const warning of authority.warnings || []) about.append(el('span', 'src-warn', warning));
  row.append(box, about);
  return row;
}

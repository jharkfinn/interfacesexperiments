import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../dist/', import.meta.url));
const hash = file =>
  createHash('sha256')
    .update(readFileSync(directory + file))
    .digest('hex')
    .slice(0, 12);
for (const [file, dependencies] of [
  // Dependencies come before the files that import them, so each hash covers
  // the hashes inside it.
  ['legal-text.js', []],
  ['cite-check.js', ['legal-text.js']],
  ['citation-guard.js', ['legal-text.js']],
  ['compose-core.js', ['citation-guard.js', 'legal-text.js']],
  ['doc-model.js', ['legal-text.js']],
  ['combine-core.js', ['compose-core.js', 'legal-text.js']],
  ['segment-core.js', ['compose-core.js']],
  ['legal-core.js', ['compose-core.js', 'segment-core.js']],
  ['segments.js', ['segment-core.js', 'legal-core.js']],
  ['view-specs.js', ['segment-core.js', 'legal-core.js']],
  ['legal-analysis.js', ['legal-text.js', 'legal-core.js']],
  ['legal-index.js', ['legal-analysis.js']],
  ['legal-view.js', ['legal-core.js']],
  ['doc-edits.js', ['doc-model.js', 'combine-core.js']],
  ['operations.js', ['combine-core.js', 'doc-edits.js', 'citation-guard.js']],
  ['document-marks.js', ['rewrite-preview.js']],
  [
    'piece-view.js',
    ['doc-model.js', 'segments.js', 'legal-view.js', 'legal-core.js', 'cite-check.js'],
  ],
  ['document-view.js', ['document-marks.js', 'piece-view.js']],
  ['rewrite-core.js', ['compose-core.js']],
  ['selection-rewrite.js', ['rewrite-core.js', 'rewrite-preview.js', 'citation-guard.js']],
  [
    'realtime.js',
    ['compose-core.js', 'rewrite-core.js', 'combine-core.js', 'segment-core.js', 'legal-core.js'],
  ],
  [
    'sample-client.js',
    ['compose-core.js', 'rewrite-core.js', 'combine-core.js', 'segment-core.js', 'legal-core.js'],
  ],
  [
    'app.js',
    [
      'compose-core.js',
      'bridge-client.js',
      'sample-client.js',
      'realtime.js',
      'key-storage.js',
      'selection-rewrite.js',
      'doc-model.js',
      'doc-edits.js',
      'links.js',
      'operations.js',
      'document-view.js',
      'piece-view.js',
      'panes.js',
      'view-specs.js',
      'segments.js',
      'legal-index.js',
      'cite-check.js',
      'citation-guard.js',
      'diagnostics.js',
    ],
  ],
  ['index.html', ['app.js', 'style.css']],
]) {
  let text = readFileSync(directory + file, 'utf8');
  for (const dependency of dependencies) {
    text = text.replace(
      new RegExp(dependency.replaceAll('.', '\\.') + '(?:\\?v=[a-f0-9]+)?', 'g'),
      dependency + '?v=' + hash(dependency),
    );
  }
  writeFileSync(directory + file, text);
}

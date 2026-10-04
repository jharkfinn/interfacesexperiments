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
  ['combine-core.js', ['compose-core.js']],
  ['segment-core.js', ['compose-core.js']],
  ['segments.js', ['segment-core.js']],
  ['view-specs.js', ['segment-core.js']],
  ['doc-edits.js', ['doc-model.js', 'combine-core.js']],
  ['operations.js', ['combine-core.js', 'doc-edits.js']],
  ['document-marks.js', ['rewrite-preview.js']],
  ['piece-view.js', ['doc-model.js']],
  ['document-view.js', ['document-marks.js', 'piece-view.js']],
  ['rewrite-core.js', ['compose-core.js']],
  ['selection-rewrite.js', ['rewrite-core.js', 'rewrite-preview.js']],
  ['realtime.js', ['compose-core.js', 'rewrite-core.js', 'combine-core.js', 'segment-core.js']],
  [
    'sample-client.js',
    ['compose-core.js', 'rewrite-core.js', 'combine-core.js', 'segment-core.js'],
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

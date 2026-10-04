// Builds dist/ as a claude.ai page, where the editor asks Claude on the viewer's
// own account (the `sample` capability) instead of using an API key.
//
//   node scripts/build-artifact.mjs <output folder>
//
// claude.ai wraps the page in its own document, so the page keeps only its title,
// styles, and body. Version query strings come off, because the files are
// published by name. Pixelta is left out: it has its own license.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, relative, sep, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = process.argv[2];
if (!output) {
  console.error('Usage: node scripts/build-artifact.mjs <output folder>');
  process.exit(2);
}
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const PAGE = 'text-and-autocomplete.html';
const SKIP = new Set(['index.html', 'fonts/Pixelta.ttf']);
const unversion = text => text.replace(/\?v=[a-f0-9]{12}/g, '');

const files = {};
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || entry.name.startsWith('.')) continue;
  const source = join(entry.parentPath ?? entry.path, entry.name);
  const path = relative(dist, source).split(sep).join('/');
  if (SKIP.has(path)) continue;
  const target = join(output, path);
  mkdirSync(dirname(target), { recursive: true });
  if (['.js', '.css'].includes(extname(path))) {
    let text = unversion(readFileSync(source, 'utf8'));
    if (path === 'style.css') {
      text = text.replace(/@font-face\s*\{[^}]*Pixelta[^}]*\}\s*/, '');
    }
    writeFileSync(target, text);
  } else copyFileSync(source, target);
  files[path] = target;
}

const html = unversion(readFileSync(join(dist, 'index.html'), 'utf8'));
const body = /<body>([\s\S]*)<\/body>/.exec(html)[1];
const stylesheet = /<link rel="stylesheet" href="([^"]+)">/.exec(html)[1];
writeFileSync(
  join(output, PAGE),
  `<title>Text and Autocomplete</title>
<style>
  /* claude.ai gives body a light ground and 14px type; this editor is dark. */
  body {
    background: #191a1d;
    color: #dfe1e5;
    font-family: 'DM Sans', Arial, Helvetica, sans-serif;
    font-size: 16px;
  }
</style>
<link rel="stylesheet" href="${stylesheet}">
${body.trim()}
`,
);
writeFileSync(join(output, 'files.json'), JSON.stringify(files, null, 2) + '\n');
console.log(`Wrote ${join(output, PAGE)} and ${Object.keys(files).length} files.`);

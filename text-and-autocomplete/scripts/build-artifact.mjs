// Builds dist/ as a claude.ai page, where the editor asks Claude on the viewer's
// own account (the `sample` capability) instead of using an API key.
//
//   node scripts/build-artifact.mjs <output folder> [--sample <file.html>] [--title <text>]
//
// --sample replaces the sample document with the HTML in a file, and --title
// replaces the document title, so a private page can open on a document that
// must not be committed to the repository.
//
// claude.ai wraps the page in its own document, so the page keeps only its title,
// styles, and body. Each script and stylesheet is published under a name with
// its version hash in it (app.<hash>.js), because a browser can keep a file it
// fetched under the same name before and run an old script with a new page.
// Pixelta is left out: it has its own license.
//
// Run scripts/version-assets.mjs first: the hashes come from its ?v= references.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, relative, sep, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  if (at < 0) return null;
  const value = args[at + 1];
  args.splice(at, 2);
  if (value === undefined) {
    console.error(`${name} needs a value.`);
    process.exit(2);
  }
  return value;
};
const sampleFile = option('--sample');
const titleText = option('--title');
const output = args[0];
if (!output || args.length > 1) {
  console.error(
    'Usage: node scripts/build-artifact.mjs <output folder> [--sample <file.html>] [--title <text>]',
  );
  process.exit(2);
}
const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const PAGE = 'text-and-autocomplete.html';
const SKIP = new Set(['index.html', 'fonts/Pixelta.ttf']);
const VERSIONED = new Set(['.js', '.css']);
// The same hash scripts/version-assets.mjs puts in ?v=.
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const named = (path, version) => path.replace(/\.(js|css)$/, `.${version}.$1`);
// `app.js?v=<hash>` becomes `app.<hash>.js`.
const rename = text => text.replace(/([\w./-]+)\.(js|css)\?v=([a-f0-9]{12})/g, '$1.$3.$2');

const files = {};
const versions = {};
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || entry.name.startsWith('.')) continue;
  const source = join(entry.parentPath ?? entry.path, entry.name);
  const path = relative(dist, source).split(sep).join('/');
  if (SKIP.has(path)) continue;
  if (VERSIONED.has(extname(path))) {
    const original = readFileSync(source, 'utf8');
    versions[path] = hash(original);
    let text = rename(original);
    if (path === 'style.css') {
      text = text.replace(/@font-face\s*\{[^}]*Pixelta[^}]*\}\s*/, '');
    }
    const published = named(path, versions[path]);
    const target = join(output, published);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    files[published] = target;
  } else {
    const target = join(output, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    files[path] = target;
  }
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
// Every reference must name a file that exists under that hash, or the page
// would ask for a file that was never published.
for (const text of [
  html,
  ...Object.keys(versions).map(path => readFileSync(join(dist, path), 'utf8')),
]) {
  for (const [, base, ext, version] of text.matchAll(/([\w./-]+)\.(js|css)\?v=([a-f0-9]{12})/g)) {
    const path = `${base.replace(/^\.\//, '')}.${ext}`;
    if (versions[path] !== version) {
      console.error(`${path}?v=${version} is stale. Run node scripts/version-assets.mjs first.`);
      process.exit(1);
    }
  }
}
let page = rename(html);
if (sampleFile) {
  // The editor's contents are one line of blocks, with no div inside.
  const sample = readFileSync(sampleFile, 'utf8').trim();
  if (/<\/?div\b|<script\b|\son\w+=/i.test(sample)) {
    console.error(`${sampleFile} must hold only document blocks: no div, script, or event attributes.`);
    process.exit(1);
  }
  const editor = /(<div id="editor"[^>]*>)[\s\S]*?(<\/div>)/;
  if (!editor.test(page)) {
    console.error('Could not find the editor in index.html.');
    process.exit(1);
  }
  page = page.replace(editor, (_, open, close) => open + sample + close);
}
if (titleText !== null) {
  const attribute = titleText.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  page = page.replace(/(<input id="title"[^>]*\svalue=")[^"]*(")/, (_, open, close) => open + attribute + close);
}
const body = /<body>([\s\S]*)<\/body>/.exec(page)[1];
const stylesheet = /<link rel="stylesheet" href="([^"]+)">/.exec(page)[1];
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

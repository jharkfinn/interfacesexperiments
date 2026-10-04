// Builds dist/ as a claude.ai page, where the editor asks Claude on the viewer's
// own account (the `sample` capability) instead of using an API key.
//
//   node scripts/build-artifact.mjs <output folder>
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

const output = process.argv[2];
if (!output) {
  console.error('Usage: node scripts/build-artifact.mjs <output folder>');
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
const page = rename(html);
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

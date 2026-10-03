// Serves dist/ and a small API on 127.0.0.1 only. Any website the user visits can
// send requests to localhost, so every API call must prove it came from this page:
// exact Host (stops DNS rebinding), exact Origin, the per-run token in an
// Authorization header (forces a CORS preflight, which is never answered), and a
// JSON body. Static files need only the Host check.
import { readFile, readdir } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { join, extname, relative, sep } from 'node:path';
import { buildRequest } from './prompts.mjs';

// A rephrase sends the document plus up to 12 earlier wordings of the selection.
const MAX_BODY = 512 * 1024;
const RATE_WINDOW_MS = 10000;
// Requests cancelled before they answered do not count: typing cancels one per key.
const RATE_LIMIT = 60;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
// The API-key mode still talks to OpenAI directly, so the page keeps working
// without the token. Inline style attributes come from editing, not from scripts.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://api.openai.com wss://api.openai.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
const HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

// Every file under root, keyed by URL path. Requests can only name these files,
// so no path can climb out of root.
export async function listFiles(root) {
  const files = new Map();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    const path = join(entry.parentPath ?? entry.path, entry.name);
    if (!MIME[extname(path)]) continue;
    files.set('/' + relative(root, path).split(sep).join('/'), path);
  }
  return files;
}

function send(res, status, body = '', headers = {}) {
  res.writeHead(status, { ...HEADERS, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function sendJSON(res, status, value) {
  send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > MAX_BODY) {
      reject(Object.assign(new Error('Request too large.'), { status: 413 }));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Expected JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

export function createBridgeHandler({ files, backend, token, port, log = () => {} }) {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);
  const expected = Buffer.from(`Bearer ${token}`);
  const recent = [];
  let active = null;

  const authorized = req => {
    const given = Buffer.from(String(req.headers.authorization || ''));
    return given.length === expected.length && timingSafeEqual(given, expected);
  };

  async function run(req, res, body) {
    const now = Date.now();
    while (recent.length && now - recent[0].time > RATE_WINDOW_MS) recent.shift();
    if (recent.length >= RATE_LIMIT) {
      sendJSON(res, 429, { error: 'Too many requests. Pause for a moment.' });
      return;
    }
    const request = buildRequest(body);
    const stamp = { time: now };
    recent.push(stamp);
    let answered = false;
    let timedOut = false;
    // The editor sends one request at a time, so a new one replaces the old one.
    active?.abort();
    const controller = new AbortController();
    active = controller;
    res.writeHead(200, { ...HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8' });
    res.flushHeaders();
    const write = value => {
      if (!res.writableEnded && !res.destroyed) res.write(JSON.stringify(value) + '\n');
    };
    res.on('close', () => controller.abort());
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs + 5000);
    log('run', { operation: request.operation });
    try {
      const text = await backend.run({
        instructions: request.instructions,
        input: request.input,
        maxChars: request.maxChars,
        signal: controller.signal,
        onDelta: delta => {
          answered = true;
          write({ type: 'delta', delta });
        },
      });
      answered = true;
      write({ type: 'done', text });
    } catch (error) {
      // A cancellation is not an error to report: the page or a newer request did it.
      // DOMException carries a numeric legacy code, so only string codes count.
      const code = typeof error.code === 'string' ? error.code : undefined;
      if (timedOut)
        write({ type: 'error', message: 'The request took too long.', code: 'timeout' });
      else if (!controller.signal.aborted || code) {
        write({ type: 'error', message: error.message || 'The request failed.', code });
      }
    } finally {
      clearTimeout(timer);
      if (active === controller) active = null;
      if (!answered && controller.signal.aborted && !timedOut)
        recent.splice(recent.indexOf(stamp), 1);
      res.end();
    }
  }

  async function api(req, res, path) {
    if (req.method !== 'POST') {
      send(res, 405, '', { Allow: 'POST' });
      return;
    }
    const site = req.headers['sec-fetch-site'];
    if (
      !origins.has(req.headers.origin) ||
      (site && site !== 'same-origin') ||
      req.headers['sec-fetch-mode'] === 'navigate'
    ) {
      send(res, 403);
      return;
    }
    if (!authorized(req)) {
      sendJSON(res, 401, { error: 'This page is not paired with the running bridge.' });
      return;
    }
    if (
      String(req.headers['content-type'] || '')
        .split(';')[0]
        .trim() !== 'application/json'
    ) {
      send(res, 415);
      return;
    }
    const body = await readBody(req);
    if (path === '/api/session') sendJSON(res, 200, await backend.describe());
    else if (path === '/api/run') await run(req, res, body);
    else if (path === '/api/login' && backend.login) {
      sendJSON(res, 200, await backend.login({ newAccount: body.newAccount === true }));
    } else send(res, 404);
  }

  return async (req, res) => {
    try {
      if (!hosts.has(req.headers.host)) {
        send(res, 403);
        return;
      }
      const { pathname } = new URL(req.url, 'http://127.0.0.1');
      if (pathname.startsWith('/api/')) {
        await api(req, res, pathname);
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        send(res, 405, '', { Allow: 'GET, HEAD' });
        return;
      }
      const file = files.get(pathname === '/' ? '/index.html' : pathname);
      if (!file) {
        // Browsers ask for an icon the app does not have.
        send(
          res,
          pathname === '/favicon.ico' ? 204 : 404,
          pathname === '/favicon.ico' ? '' : 'Not found',
        );
        return;
      }
      const body = await readFile(file);
      res.writeHead(200, {
        ...HEADERS,
        'Content-Type': MIME[extname(file)],
        'Content-Length': body.length,
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if (res.headersSent) res.end();
      else {
        // Unread body bytes would otherwise keep the connection busy.
        if (error.status === 413) res.setHeader('Connection', 'close');
        sendJSON(res, error.status || 500, { error: error.status ? error.message : 'Failed.' });
      }
      if (!error.status) log('error', { message: error.message });
    }
  };
}

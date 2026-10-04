// Runs the editor on your Claude plan (through your local Claude Code sign-in) or
// your ChatGPT plan (through Sign in with ChatGPT), with no API key.
//
//   node scripts/bridge.mjs --provider claude
//   node scripts/bridge.mjs --provider chatgpt
//
// It serves dist/ on 127.0.0.1 and prints a link with a token for this run. For
// personal use on your own computer: keep the link private and never expose the
// bridge to other people.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { listFiles, createBridgeHandler } from './bridge/server.mjs';
import { ClaudeBackend, DEFAULT_MODEL } from './bridge/claude.mjs';
import { ChatGPTBackend, MANAGE_USAGE_URL } from './bridge/chatgpt.mjs';

const HELP = `Usage: node scripts/bridge.mjs [--provider claude|chatgpt] [options]

  --provider <name>   claude (default): your Claude plan through your Claude Code sign-in
                      chatgpt: your ChatGPT Plus or Pro plan through Sign in with ChatGPT
  --port <number>     Port on 127.0.0.1 (default 4175)
  --model <id>        Model to use (claude default ${DEFAULT_MODEL};
                      chatgpt default: a Luna, mini, or nano model your account lists)
  --claude <path>     Path to the claude executable (default: claude on PATH)
  --allow-api-key     Let Claude Code bill the API key it is signed in with
                      (claude auth login --console) instead of a Claude plan
  --reasoning <level> ChatGPT reasoning effort (default none, the fastest; a model
                      that does not take it uses its lowest; "default" sends none)
  --sign-out          ChatGPT: end the saved sign-in and exit
  --verbose           Log each request's operation (never its text)
`;

const { values } = parseArgs({
  options: {
    provider: { type: 'string', default: 'claude' },
    port: { type: 'string', default: '4175' },
    model: { type: 'string' },
    claude: { type: 'string', default: 'claude' },
    'allow-api-key': { type: 'boolean', default: false },
    reasoning: { type: 'string', default: 'none' },
    'sign-out': { type: 'boolean', default: false },
    verbose: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});
if (values.help) {
  process.stdout.write(HELP);
  process.exit(0);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Use a port between 1 and 65535.');
  process.exit(2);
}

let backend;
if (values.provider === 'claude') {
  backend = new ClaudeBackend({
    model: values.model || DEFAULT_MODEL,
    command: values.claude,
    allowApiKey: values['allow-api-key'],
  });
} else if (values.provider === 'chatgpt') {
  backend = new ChatGPTBackend({
    model: values.model || null,
    reasoning: values.reasoning === 'default' ? null : values.reasoning,
  });
} else {
  console.error(HELP);
  process.exit(2);
}

if (values['sign-out'] && values.provider !== 'chatgpt') {
  console.error('--sign-out applies to --provider chatgpt.');
  process.exit(2);
}

const token = randomBytes(32).toString('base64url');
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const server = createServer();
server.requestTimeout = 60000;
server.headersTimeout = 10000;
// Take the port first, so a busy port fails before any request reaches the plan.
// Loopback only, always: other machines on the network must never reach this.
if (!values['sign-out']) {
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    console.error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is busy. Pass another with --port.`
        : `Could not start: ${error.message}`,
    );
    process.exit(1);
  }
}

try {
  console.log(values.provider === 'claude' ? 'Checking Claude Code…' : 'Loading ChatGPT sign-in…');
  await backend.start();
} catch (error) {
  console.error(error.message);
  backend.close();
  process.exit(1);
}
if (backend.notice) console.log(backend.notice);

if (values['sign-out']) {
  const { revoked, signedIn } = await backend.logout();
  console.log(
    !signedIn
      ? 'Not signed in to ChatGPT.'
      : revoked
        ? 'Signed out of ChatGPT.'
        : 'Signed out here, but ChatGPT did not confirm it. You can disconnect the app in ChatGPT Settings.',
  );
  process.exit(0);
}

const handler = createBridgeHandler({
  files: await listFiles(root),
  backend,
  token,
  port,
  log: values.verbose ? (event, data) => console.log(event, JSON.stringify(data)) : () => {},
});
server.on('request', handler);
const billing = await backend.describe();
console.log(`
Open this link in your browser (it only works while this runs):

  http://127.0.0.1:${port}/#k=${token}

${
  values.provider === 'chatgpt'
    ? `Requests use your ChatGPT plan and count toward its limits. Manage usage: ${MANAGE_USAGE_URL}`
    : billing.billing === 'api_key'
      ? 'Requests are billed to the Anthropic API key Claude Code uses (--allow-api-key).'
      : 'Requests use your Claude plan through your own Claude Code sign-in and count toward its usage limits.'
}
For personal use on this computer only. Press Ctrl+C to stop.
`);

const stop = () => {
  backend.close();
  server.close();
  server.closeAllConnections?.();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

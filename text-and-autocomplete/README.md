# Text and Autocomplete

A document editor prototype from [Interfaces that think](https://tareqistyping.com/interfaces-that-think/), exploring new ways to write with AI: autocomplete, resizing text by dragging, rephrasing, and combining sentences. It runs in the browser on your own OpenAI API key, or, through a small local bridge, on your Claude plan or your ChatGPT plan with no API key.

## What you can do

Each feature can be turned on or off from the **Intelligence** menu.

- **Autocomplete.** Pause at the end of a paragraph to see a suggestion. Press Tab to accept it or Escape to dismiss it. With **Multiple tab autocomplete** (the default), press Tab again right after accepting to swap in the next of three alternatives.
- **Suggested paragraph.** In an empty paragraph, the editor drafts a paragraph in three writing styles. Press Tab to accept it, then Tab again to switch styles.
- **Drag to resize.** Select text and drag the handle at the end of the selection right or down to expand it, or left or up to shorten it (35–250%). The rewrite previews in place and is kept when you release. With the handle focused, arrow keys adjust, Enter keeps, Home returns to the original length, and Escape cancels.
- **Double-click to rephrase.** Double-click a selection for new wording. Keep double-clicking to step through alternatives, like a thesaurus.
- **Drag to combine.** Drag a selection onto another sentence to merge the two into one sentence. This works with a mouse only.

AI edits go through the browser's undo, so Undo restores the original. Documents are limited to 500 words and are not saved between visits.

## How it works

The app talks to [`gpt-realtime-2.1-mini`](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini) over OpenAI's [Realtime WebSocket API](https://developers.openai.com/api/docs/guides/voice-websockets?api=realtime). Each request sends the document text around the caret or selection, with no conversation history. Your key goes only from your browser to OpenAI, which returns a short-lived token for the session. The key is stored in this browser's localStorage so a refresh reconnects; **Remove key from this browser** in the connect dialog deletes it. There are no external scripts, fonts, or analytics.

In browsers that support WebMCP, the page also registers an `update_document` tool so a browser agent can replace the document. That tool sends nothing to OpenAI.

Language models can't count characters reliably, so when resizing, the app measures each draft. If it misses the dragged length by more than 15 characters, the app asks for several versions at different lengths and keeps the closest.

| File in `dist` | What it does |
| --- | --- |
| `app.js` | Editor, autocomplete, and connect dialog |
| `compose-core.js` | Autocomplete and suggested-paragraph prompts, and checks on replies |
| `rewrite-core.js` | Resize and rephrase prompts, and the length-measuring loop |
| `combine-core.js` | Combine prompt and sentence handling |
| `selection-rewrite.js`, `rewrite-preview.js` | Resize handle and in-place previews |
| `selection-combine.js` | Drag-to-combine interaction |
| `realtime.js` | WebSocket connection to OpenAI |
| `bridge-client.js` | Connection to the local bridge, for plan mode |
| `key-storage.js`, `diagnostics.js` | Stored key and debug log |

## Run

```sh
python3 scripts/dev-server.py
```

Open `http://localhost:4174/` and connect with your own OpenAI API key. Its project needs access to `gpt-realtime-2.1-mini` and API billing. Any static server pointed at `dist` also works.

## Run on your Claude or ChatGPT plan

`scripts/bridge.mjs` runs the editor on a plan you already pay for instead of an API key. It serves `dist` at `http://127.0.0.1:4175` and runs each request through your own sign-in on this computer. It needs Node 22.7 or later (or 20.19 or later) and installs nothing.

```sh
node scripts/bridge.mjs                      # your Claude plan, through Claude Code (default)
node scripts/bridge.mjs --provider chatgpt   # your ChatGPT Plus or Pro plan
```

Open the link it prints, and keep it private while the bridge runs: its token pairs a tab with the bridge for this run. The plain address without the token opens the normal API-key mode. If you restart the bridge, open its new link; the tab pairs again. The connect dialog says which plan pays and that document text goes to Anthropic or OpenAI, and asks you to agree before autocomplete sends requests as you type. Run `node scripts/bridge.mjs --help` for the options.

**Claude.** Install [Claude Code](https://code.claude.com/docs) and sign in with your Claude account (`claude auth login`). On Windows, use the native `claude.exe` installer, or pass `--claude` with its path; the npm `claude.cmd` shim cannot start without a shell, which the bridge never uses. The bridge starts your own, unmodified `claude` binary in print mode with no tools, no MCP servers, no user or project settings, hooks, skills, or slash commands, no saved sessions, and an empty temporary folder, so document text can only produce text. Settings an administrator manages on your computer still apply. The CLI gets an allowlisted environment, and Anthropic API profiles point at an empty folder, so an `ANTHROPIC_API_KEY`, auth token, base URL, profile, or cloud-provider variable in your shell does not change who is billed. Before it serves the page, the bridge checks `claude auth status` and sends one test request, and each session must report no API key before it receives document text. With `--allow-api-key`, it accepts the API key Claude Code itself is signed in with (`claude auth login --console`), and the page says so. Each request uses a fresh process, so no history carries over, and the next process starts while a request runs, because a new one needs about half a second. The default model is Claude Haiku 4.5 with thinking off. In a cloud development container, autocomplete showed its first words about 0.8 to 1.1 seconds after typing stopped, and a resize finished in about 0.7 to 0.9 seconds; your network and plan may differ. This path has been run live only with a cloud container's own Claude sign-in, not yet with a desktop `claude auth login` on a Pro or Max plan.

**ChatGPT.** This uses [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source), OpenAI's route for open-source apps that run locally. Click **Continue with ChatGPT** in the dialog and approve plan usage; if you declined it, the same button asks again. The bridge receives the tokens at a `127.0.0.1` callback and keeps them in `~/.config/text-and-autocomplete/chatgpt.json` (`%APPDATA%` on Windows), readable only by you. Access and refresh tokens never reach the page; the ID token goes only to OpenAI's sign-in page, as a hint. Requests go to the public Responses API with `store: false`, using a Luna, mini, or nano model if your account lists one, unless you pass `--model`, and reasoning effort `none`, the fastest; a model that does not take it uses its lowest. **Use a different ChatGPT account** in the dialog signs in another account or workspace, and `--sign-out` ends the sign-in. Only Plus and Pro plans can be used in other apps. Usage counts toward your ChatGPT plan, and the Plus 5-hour limit is shared with every other app you connect. Once a limit is reached, requests can spend your ChatGPT credits if you allowed apps to use them, including automatic credit purchases, so consider setting this app's limit in [ChatGPT Settings → Usage](https://chatgpt.com/settings/usage). It was run live with a ChatGPT plan on 2026-10-04: sign-in, a token refresh, sign-out with revocation, autocomplete, resize, rephrase, and combine all worked. It is slower than the Claude path: with `gpt-5.6-luna` from a cloud container, autocomplete showed its first words about 4.7 seconds after typing stopped, a resize took about 1.8 seconds, a rephrase 2.5 seconds, and a combine 5.9 seconds.

**Why not the Codex CLI.** Codex can be driven the same way, but in version 0.160.0 some agent tools cannot be removed: `apply_patch`, and on GPT-6 models, tools that start other agents. OpenAI also points apps that want ChatGPT plan usage to Sign in with ChatGPT.

**Rules.** Both routes are for one person using their own plan on their own computer. Never host the bridge for other people or share one sign-in. Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) says it does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription", but it does not permit third-party developers "to route requests through Free, Pro, or Max plan credentials on behalf of their users", and says plan limits assume "ordinary, individual usage". Its Consumer Terms allow automated access only with an API key or where Anthropic explicitly permits it, the Agent SDK documentation says third-party developers may not offer Claude.ai login or rate limits without approval, and Anthropic reserves the right to enforce without notice. Whether a self-run bridge that sends a request on every typing pause counts as ordinary use is not settled, and these pages and the [usage-limit article](https://support.claude.com/en/articles/15036540) changed several times in 2026, so read them first. Sign in with ChatGPT is a preview under the [Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/), which require tokens to be stored locally under the user's control and consent before background use; a paid or remotely hosted app needs OpenAI's approval.

**Security.** The bridge listens on `127.0.0.1` only. Every API call must come from the bridge's own page: the exact host and origin, the token in an `Authorization` header, and a JSON body. The page can only name an operation (autocomplete, paragraph, rewrite, or combine) and send document text; the bridge builds the prompt with the same modules as the editor, caps the reply length, and runs one request at a time.

## Test

```sh
node --test tests/*.test.mjs
```

Requires Node 22 or later. The tests use a fake connection, a stand-in `claude` CLI, and a stand-in OpenAI sign-in server, so they need no key or sign-in and cost nothing.

## Publish

Run `node scripts/version-assets.mjs` so browsers load changed files instead of cached ones, then copy `dist` to any static host, including a subfolder of an existing site. Everything the app needs is in `dist`.

## Evaluate autocomplete

`eval/` holds 24 development cases and 12 held-out cases that run autocomplete against the real model. With the dev server running, open `http://localhost:4174/eval/`. It uses the key the editor stored, so usage is billed to it. To save results, also run `node scripts/eval-results-server.mjs` and click **Save report locally**; reports go to `eval/runs/`. To compare with an older version, copy its JavaScript modules into `eval/baseline/`. Git ignores both folders.

## Debug log

**Save debug log**, below the page, downloads the last 1,200 events from the current tab: requests, validation results, and why suggestions were shown or hidden. Text snippets are capped at 800 characters, key-like strings are redacted, and nothing is uploaded. In the console, `window.textAndAutocompleteDebug.snapshot()` returns the log.

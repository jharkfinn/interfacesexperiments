# Text and Autocomplete

A document editor prototype from [Interfaces that think](https://tareqistyping.com/interfaces-that-think/), exploring new ways to write with AI: autocomplete, resizing text by dragging, rephrasing, and combining sentences. It is set up for legal writing: it opens on a legal memo, beside a view of its IRAC structure and a view of its sourcing. It runs in the browser on your own OpenAI API key, or, through a small local bridge, on your Claude plan or your ChatGPT plan with no API key.

## What you can do

The document shows in **panes**, side by side, any number of them. Each pane shows one **view** of the same text, and a change in one view shows in the others at once, as you type.

- **Document** is the editor, where you write. There is one Document pane at most.
- **IRAC** shows the memo's sections, taken from its headings, and in each section the runs of sentences that do one job: issue, rule, explanation, application, counter-argument, or conclusion. Each section has a rail of letters, I R A C, and a hollow letter is a part the section lacks. Structure checks sit above the sections.
- **Sourcing** shows each sentence with what it asserts (law, a precedent, a client fact, an application, a conclusion), how it is supported, its citations, and flags for problems. A table of authorities sits above the sentences.
- **Goals** shows what the text is trying to do: Claude's map of its main goals, each named for what it tries to achieve with the reader.
- **How** shows the steps that reach each goal, one level down the same map. Each step names its own goal and, in a tag before it, its method (an anecdote, a contrast, an example). Steps sit under the name of the goal they reach.
- **Sentences** shows each sentence as a piece you can drag, grouped by paragraph.
- **Paragraphs** shows each paragraph by its first sentence. Drag one between two others to move it.
- **Rhythm** shows each sentence as a bar as long as its word count, against the longest sentence, with the count at its start. Drag a bar to move its sentence.
- **Outline** and **Ideas** are views Claude divides for their purpose: the parts a reader would list in an outline, and the distinct ideas a reader takes away. Outline is a list; Ideas is cards.

**Add a view** above the panes opens another pane. Each pane's menu changes its view, ‹ and › move it, × closes it, and ⇅ turns its scrolling with the other panes on or off. Drag the line between two panes, or focus it and press the arrow keys, to give one more width. Panes are never narrower than 300 pixels; when they do not fit the window, the row of panes scrolls sideways. A first visit opens IRAC, Document, and Sourcing. The page keeps the arrangement in this browser, and a link can start with `#legal` (IRAC, Document, and Sourcing), `#levels` (Goals, How, and Document), `#document`, `#split` (Document and Sentences), or `#sentences`.

All views are linked:

- The piece under the pointer in any view is marked in the others.
- The sentence at the caret is chosen in every view. A piece you choose in one view is marked in the others, which scroll to it.
- Panes scroll together, so the text at the top of one pane is at the top of the others.
- While you drag, the other views mark the sentence you are moving, the sentence it will combine with, or the place it will move to.

Each view is a declaration, data that says what one piece is, how pieces are grouped and laid out, what each piece shows, and what each gesture does. `view-specs.js` holds the built-in declarations and the checks every declaration must pass. A declaration can only name operations from a fixed list, so it cannot run code.

**Views Claude divides.** A piece can be a sentence, a paragraph, or what Claude chooses: a declaration with `"unit": "claude"` says in words what the view is for, and Claude divides the document into pieces that suit that purpose and names each one. A piece is always whole sentences: a run of sentences inside one paragraph, or a run of whole paragraphs, never part of one paragraph and part of another. That way every piece can move as native edits that Undo takes back.

- Dragging a piece of whole paragraphs places it between paragraphs; dragging a run of sentences places it inside the paragraph at the drop. Only the places where the dragged piece can go light up. Paragraphs are moved by giving the blocks between the old and new place new contents, so no block is made or deleted; a move that would reorder list items as paragraphs is refused, with the document unchanged.
- Claude divides the document when the view opens, and again after the text changes, once typing has stopped for 2.5 seconds. Until then, the pieces follow their sentences through moves and edits, and the view says it is updating. Moving pieces changes no words, but a division can depend on order, so a view of a purpose or of goals asks again once typing stops; the legal labels follow their sentences and ask nothing after a move.
- Each division is saved in this browser by the document's text and the view's purpose, so a reload or a return to the same text asks again for nothing. On claude.ai, the views use a connection of their own, so a division never cancels autocomplete. The bridge and the Realtime API answer one request at a time, so there a division waits until the connection is free and tries again if autocomplete takes it.
- Not connected, a view shows the last pieces it had, or paragraphs, and says so.

**Levels of goals.** A declaration with `"unit": "level"` and a `"level"` shows one level of a single map that every level view shares. Claude reads the document once and returns a tree: the main goals, then the steps that reach each goal, each with a goal and a method of its own, up to four levels. A goal reached in one step stands for itself on the levels below. Every level follows the same rules as a view Claude divides, and the pieces of each level fit inside the pieces of the level above, so all level views cut the text at the same places: hovering a goal marks exactly its steps. A view of a level deeper than the tree shows the deepest level. With `"group": "parent"`, a view sets its pieces under the name of the goal one level up, and `"show": "method"` puts each piece's method before its goal. The map is asked for once for all level views, then again after the text changes, and saved like any other division; a typed sentence joins the step and the goal before it on every level until the new map comes.

**Legal work.** The IRAC and Sourcing views share one reading of the memo. Most of it the browser works out itself; Claude adds only a label for each sentence.

- **Sentences keep their citations.** The editor finds sentences the way a legal reader does: it never breaks inside a citation, a case name, or an abbreviation such as "v.", "F. Supp. 2d", or "W.D. Pa.", and a sentence that is only citations ("Lakeside, 455 F.3d at 159.") belongs to the claim before it. It also breaks where a draft forgot to: a citation with no period before the next sentence, or a footnote number pasted after a quotation.
- **Claude labels, the app checks.** Claude reads the memo once and gives each sentence two words from fixed lists: its job (`issue`, `rule`, `explanation`, `application`, `counter`, `conclusion`, `roadmap`, `heading`, `facts`, `other`) and what it asserts (`law`, `precedent`, `client-fact`, `application`, `conclusion`, `framing`). Claude never writes a name, a citation, or any other text that the views show. The app takes sections from the headings, finds citations, quotations, short forms, and `id.` itself, and decides each sentence's support from its signals and citations. Claude asks again five seconds after typing stops, with each sentence's earlier labels, so labels stay steady; moving text asks nothing.
- **IRAC.** Each section shows its tag (Caption, Umbrella, I, II, Conclusion), its heading, how sure its conclusion sounds ("highly likely", "more uncertain"), and its rail. The umbrella before the sub-issues has P (an overall prediction), R (a cited rule), and M (a roadmap). The structure checks name, for example, a missing Statement of Facts, a rule stated after it is applied, a conclusion surer than its weakest part, a general claim about "courts" resting on one case, or a section that is mostly quotation. A line says what is not checked.
- **Sourcing.** Each sentence shows its support: Direct, See, See also / Cf., Secondhand, Incomplete cite, Cited below, No authority, No fact source, or Record. Flags name quotations with no source or no pin cite, quotations never closed, open items such as "need to confirm with client", a case named before its full citation or never cited in full, and form problems. "Only what needs attention" hides the rest. The table of authorities groups cases and statutes, gives each one's court level, where it is cited, and its warnings; hovering a row marks every sentence that cites it, and each click steps to the next mention. A box per authority records that you read it, in this browser only.
- **Check with Midpage.** On claude.ai, if you have the Midpage Legal Research connector, each case and statute in the table of authorities has a **Check** button, and **Check all with Midpage** checks the rest. Nothing is sent until you click. A check sends the citation, and only the quotations whose sentence cites that one authority and is not a client fact; it never sends the document's own sentences. It reports:
  - whether the citation leads to a case or provision, and whether Midpage's case name, court and year match the document's;
  - whether each quotation is in the source word for word. The comparison with Midpage's passages is made in the browser, so "word for word" is never Midpage's say-so. Bracketed changes and ellipses count as the writer's changes;
  - whether each pin is within the opinion's pages, and whether each quotation is on the page cited, when Midpage's copy of the opinion has page numbers. These are Midpage's reading and are marked so;
  - later decisions that Midpage lists as negative or to read with caution. Midpage's list is not a full citator.
  A case cited only by docket number, or only in short form, is found by name first. A statute in a form Midpage does not match is found by search. Results are kept in this browser; a check whose citation or quotations changed shows as from before the change.
- **Nothing here checks that a source supports the sentence that cites it.** That would mean sending the sentence.
- **The writing features keep citations exact.** Autocomplete, resize, rephrase, and combine are told never to write a citation, quotation, signal, or holding that the document does not already have, and to write [cite] where authority is missing. The editor also checks every reply before it reaches the document: a reply that adds, changes, or drops a citation, a quotation, or an open item such as [cite] is not used, and the notice says why. Autocomplete stays quiet inside a citation, after a signal such as "See", and inside a quotation. A selection that cuts through a citation or quotation is not rewritten, and sentences with citations or quotations are not combined, so they move instead.
- **Suggested paragraph** is off by default, because drafting whole paragraphs is where invented content is most likely.

**New view…** declares a view of your own: a name, and either IRAC, Sourcing, what the view is for, or a level of the map of goals; a layout (list, cards, or bars); and whether pieces move by dragging and open with a double-click. The **Declaration** section shows the view as data; edit it to set any field a view can have, and the form follows it. Problems are named as you type, and Save waits until there are none. Your views are kept in this browser, and ✎ in a pane's bar edits the view, or deletes it.

Each feature in the Document view can be turned on or off from the **Intelligence** menu.

- **Autocomplete.** Pause at the end of a paragraph to see a suggestion. Press Tab to accept it or Escape to dismiss it. With **Multiple tab autocomplete** (the default), press Tab again right after accepting to swap in the next of three alternatives.
- **Suggested paragraph.** In an empty paragraph, the editor drafts a paragraph in three writing styles. Press Tab to accept it, then Tab again to switch styles.
- **Drag to resize.** Select text and drag the handle at the end of the selection right or down to expand it, or left or up to shorten it (35–250%). The rewrite previews in place and is kept when you release. With the handle focused, arrow keys adjust, Enter keeps, Home returns to the original length, and Escape cancels.
- **Double-click to rephrase.** Double-click a selection for new wording. Keep double-clicking to step through alternatives, like a thesaurus.

In the **Sentences** view, each sentence is a piece you can drag with a mouse, a pen, or a finger (hold a finger on a sentence for a moment before you drag it). Its declaration gives each gesture an operation:

- **Move.** Drop a sentence between two others, or within 14 pixels of a sentence's left or right edge, to move it there. A paragraph or list item that loses its last sentence is removed.
- **Combine.** Drop a sentence on the middle of another to merge the two into one sentence. Escape cancels a combine that is still running.
- **Edit in the document.** Double-click a sentence, or press Enter, to put the caret at its end in the Document view.
- **Remove.** Press Delete or Backspace on a sentence to remove it.
- **Keyboard.** Arrow keys choose a sentence. Alt and an arrow key move it one place. Alt, Shift, and an arrow key combine it with the sentence beside it.

AI edits and edits from the views go through the browser's undo, so Undo restores the original, in any view and with no Document pane open. One Undo takes back a whole move or combine, from the toolbar or the keyboard, until you make another change. After that, Undo goes one step at a time, and a move that spanned two paragraphs is two or three steps. Documents are limited to 2,000 words and 16,000 characters, and are not saved between visits. Autocomplete sends about 450 words before the caret and 150 after it, not the whole document.

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
| `view-specs.js` | Built-in view declarations and the checks a declaration must pass |
| `legal-text.js` | Sentences and citations the way a legal reader finds them |
| `legal-core.js` | The request for Claude's label for each sentence's job, and the checks and repairs of its reply |
| `legal-analysis.js` | Sections, IRAC runs, support, flags, structure checks, and the table of authorities, worked out in the browser |
| `legal-index.js`, `legal-view.js` | The legal reading the IRAC and Sourcing views share, and how they draw it |
| `cite-check.js` | Checks the table of authorities against Midpage through the viewer's connector: what to send, the calls, and reading the answers |
| `citation-guard.js` | The checks that keep model output from adding, changing, or dropping citations and quotations |
| `segment-core.js`, `segments.js` | Claude's division of the document for a view's purpose, and its map of the document's goals as levels: the prompts, the checks and repairs of each reply, and the saved divisions |
| `panes.js` | The row of panes: add, close, move, resize, and remember them |
| `doc-model.js` | The document as blocks and pieces, which every view reads |
| `links.js` | What the views point at: hover, focus, drag, pending combine, scroll |
| `doc-edits.js`, `operations.js` | Moves, combines, and removals planned on copies and made as native edits |
| `piece-view.js` | A declared view of sentences, paragraphs, Claude's pieces, or a level of goals |
| `document-view.js`, `document-marks.js` | The editor as a view, and its highlights for the other views |
| `realtime.js` | WebSocket connection to OpenAI |
| `bridge-client.js` | Connection to the local bridge, for plan mode |
| `sample-client.js` | Connection to Claude when the editor is a claude.ai page |
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

**On claude.ai.** `node scripts/build-artifact.mjs <folder>` builds `dist` as a claude.ai page. Scripts and stylesheets get their version hash in their names, so a browser never runs an old script with a new page. Published with the `sample` capability, the page asks Claude on the viewer's own claude.ai account, with no key and no bridge; the first request in each visit asks the viewer to allow it. Published with the `mcp` capability for the Midpage Legal Research connector (its `analyzeCaseDocument`, `analyzeLaw`, `search` and `searchLaws` tools), the Sourcing view can check authorities through the viewer's own connector; the first check asks the viewer to allow it, and without the connector the buttons say how to add it. The Intelligence menu chooses the model tier for autocomplete, for resize, rephrase, and combine, and for the views: Quick answers in a second or two, while Default and Complex think first and can take much longer. Repeating the same request within five minutes replays the stored answer at no cost, and a burst of requests can be rate limited.

**Why not the Codex CLI.** Codex can be driven the same way, but in version 0.160.0 some agent tools cannot be removed: `apply_patch`, and on GPT-6 models, tools that start other agents. OpenAI also points apps that want ChatGPT plan usage to Sign in with ChatGPT.

**Rules.** Both routes are for one person using their own plan on their own computer. Never host the bridge for other people or share one sign-in. Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) says it does not "prevent an end user from signing in to the unmodified Claude Code binary with their own Claude subscription", but it does not permit third-party developers "to route requests through Free, Pro, or Max plan credentials on behalf of their users", and says plan limits assume "ordinary, individual usage". Its Consumer Terms allow automated access only with an API key or where Anthropic explicitly permits it, the Agent SDK documentation says third-party developers may not offer Claude.ai login or rate limits without approval, and Anthropic reserves the right to enforce without notice. Whether a self-run bridge that sends a request on every typing pause counts as ordinary use is not settled, and these pages and the [usage-limit article](https://support.claude.com/en/articles/15036540) changed several times in 2026, so read them first. Sign in with ChatGPT is a preview under the [Sign in with ChatGPT Terms](https://openai.com/policies/sign-in-with-chatgpt-terms/), which require tokens to be stored locally under the user's control and consent before background use; a paid or remotely hosted app needs OpenAI's approval.

**Security.** The bridge listens on `127.0.0.1` only. Every API call must come from the bridge's own page: the exact host and origin, the token in an `Authorization` header, and a JSON body. The page can only name an operation (autocomplete, paragraph, rewrite, combine, segment, levels, or legal) and send document text; the bridge builds the prompt with the same modules as the editor, caps the reply length, and runs one request at a time.

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

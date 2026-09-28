# Gmail Smart Compose

A prototype from [Interfaces that think](https://tareqistyping.com/interfaces-that-think/) that recreates Gmail's Smart Compose in a dark compose window. Suggestions come from a fixed list of common phrases rather than a model, so it needs no API key and sends nothing anywhere. It is an independent design study, not affiliated with Google.

## What you can do

- **Inline suggestions.** Type in the message. When the sentence you are typing starts one of the built-in phrases, the rest appears in gray. Press Tab to accept it or Escape to dismiss it.
- **Options.** Turn suggestions off, or reset the example, from the ⋮ menu.
- **Window controls.** Minimize, expand, close, and discard work as they would in a compose window. Send and the toolbar buttons, other than emoji, only show a notice.

## How it works

The message is a normal textarea with transparent text. Behind it, a mirror element repeats the text and draws the suggestion after the caret, so typing, selection, and undo stay native. `complete()` in `app.js` matches the sentence before the caret against the phrase list.

In browsers that support WebMCP, the page also registers an `update_draft` tool so a browser agent can fill in the draft. It never sends anything.

| File in `dist` | What it does |
| --- | --- |
| `index.html` | Compose window markup |
| `app.js` | Suggestions, mirror rendering, and window controls |
| `style.css` | Compose window styles |

`exports/` holds 2x screenshots of the compose window.

## Run

```sh
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173/`. Any static server pointed at `dist` works.

## Publish

Copy `dist` to any static host, including a subfolder of an existing site. `index.html` loads `app.js` and `style.css` with `?v=` set to the first 12 characters of each file's SHA-256, so browsers fetch changed files instead of cached ones. After editing either file, update its value from:

```sh
shasum -a 256 dist/app.js dist/style.css
```

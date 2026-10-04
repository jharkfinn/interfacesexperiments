# Interfaces That Think

UI/UX experiments for new interactions. Each prototype lives in its own folder.

## Prototypes

- **[Text and Autocomplete](text-and-autocomplete/README.md)** — a document editor prototype set up for legal writing, with IRAC and sourcing views beside the draft, AI autocomplete, drag-to-resize, rephrasing, and sentence combining.
- **[Gmail Smart Compose](gmail-smart-compose/README.md)** — a recreation of Gmail's inline Smart Compose suggestions in a dark compose window, with no model or key needed.

## Run locally

From the repository root, run either preview in its own terminal:

```sh
python3 text-and-autocomplete/scripts/dev-server.py
python3 -m http.server 4173 --directory gmail-smart-compose/dist
```

Open `http://localhost:4174/` for Text and Autocomplete or `http://localhost:4173/` for Gmail Smart Compose. Each prototype's README covers the rest, including Text and Autocomplete's API-key setup, tests, and live evaluation.

To run Text and Autocomplete on your Claude plan or ChatGPT plan instead of an API key, start its local bridge and open the link it prints:

```sh
node text-and-autocomplete/scripts/bridge.mjs                      # Claude plan
node text-and-autocomplete/scripts/bridge.mjs --provider chatgpt   # ChatGPT plan
```

## Publish

Each prototype's `dist` folder is a complete static site: plain HTML, CSS, and ES modules with relative paths and no build step. Copy a `dist` folder to any static host, including a subfolder of an existing site. Development tooling (tests, scripts, evaluation) lives outside `dist` and is never published. Each prototype also keeps its own Sites hosting configuration in `.openai/hosting.json`.

## Tests and formatting

There are no dependencies to install. Run Text and Autocomplete's tests with Node 22 or later:

```sh
node --test text-and-autocomplete/tests/*.test.mjs
```

JavaScript and CSS are formatted with [Prettier](https://prettier.io/):

```sh
npx prettier@3.9.9 --single-quote --arrow-parens=avoid --print-width=100 --write "**/*.{js,mjs,css}"
```

HTML is formatted by hand, because whitespace inside an editable document becomes part of its text.

## License

The code is released under the [MIT License](LICENSE). If you use or build on these prototypes, crediting Tareq Ismail and linking to [Interfaces that think](https://tareqistyping.com/interfaces-that-think/) is appreciated.

The fonts in `text-and-autocomplete/dist/fonts` are not covered by the MIT License. DM Sans is under the SIL Open Font License (see `OFL.txt` in that folder). Pixelta is by Blankids Studio and is under its own license.

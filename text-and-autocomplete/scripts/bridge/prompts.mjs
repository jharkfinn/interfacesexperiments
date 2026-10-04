// The browser names an operation and sends document text; the bridge builds the
// prompt with the same modules the editor uses. Nothing else reaches the model.
import { responseEvent } from '../../dist/compose-core.js';
import { rewriteEvent } from '../../dist/rewrite-core.js';
import { combineEvent } from '../../dist/combine-core.js';
import { segmentEvent, levelsEvent } from '../../dist/segment-core.js';

const MAX_AVOID = 12;
const isText = value => typeof value === 'string';
const fail = message => {
  throw Object.assign(new Error(message), { status: 400 });
};

function texts(body, names) {
  for (const name of names) if (!isText(body[name])) fail(`Expected text in ${name}.`);
  return Object.fromEntries(names.map(name => [name, body[name]]));
}

function revisionOf(value) {
  if (value === null || value === undefined) return null;
  if (!value || !isText(value.draft)) fail('Expected revision.draft as text.');
  return { draft: value.draft };
}

function rephraseOf(value) {
  if (value === null || value === undefined) return null;
  const avoid = value?.avoid;
  if (!Array.isArray(avoid) || avoid.length > MAX_AVOID || !avoid.every(isText)) {
    fail(`Expected rephrase.avoid as at most ${MAX_AVOID} texts.`);
  }
  return { avoid };
}

// Returns the instructions, the user message, a cap on reply length, and the
// timeout the editor uses for the same request.
export function buildRequest(body) {
  if (!body || typeof body !== 'object') fail('Expected a JSON object.');
  let event;
  let timeoutMs = 20000;
  try {
    if (body.op === 'complete') {
      const context = texts(body, ['before', 'after']);
      const paragraphs = body.paragraphs === true;
      event = responseEvent('bridge', context, {
        alternatives: body.alternatives === true,
        paragraphs,
      });
      timeoutMs = paragraphs ? 20000 : 10000;
    } else if (body.op === 'rewrite') {
      const context = texts(body, ['before', 'selected', 'after']);
      if (typeof body.ratio !== 'number') fail('Expected a numeric ratio.');
      event = rewriteEvent(
        'bridge',
        context,
        body.ratio,
        revisionOf(body.revision),
        rephraseOf(body.rephrase),
      );
    } else if (body.op === 'combine') {
      event = combineEvent('bridge', texts(body, ['before', 'target', 'after', 'dragged']));
    } else if (body.op === 'segment') {
      // segmentEvent checks the purpose and the shape of every paragraph.
      event = segmentEvent('bridge', { purpose: body.purpose, paragraphs: body.paragraphs });
      timeoutMs = 30000;
    } else if (body.op === 'levels') {
      event = levelsEvent('bridge', { paragraphs: body.paragraphs });
      timeoutMs = 45000;
    } else {
      fail('Unknown operation.');
    }
  } catch (error) {
    fail(error.message);
  }
  const { instructions, input, max_output_tokens: tokens, metadata } = event.response;
  return {
    operation: metadata?.operation || 'complete',
    instructions,
    input: input[0].content[0].text,
    // Generous for any language; it only stops a runaway reply from spending the plan.
    maxChars: tokens * 8,
    timeoutMs,
  };
}

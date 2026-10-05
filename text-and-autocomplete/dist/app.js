import { createDiagnostics } from './diagnostics.js?v=908de0f7ce29';
import {
  MAX_WORDS,
  MAX_CHARS,
  wordCount,
  withinLimit,
  fitInsertion,
  inspectCompletion,
  inspectAlternatives,
  inspectParagraphs,
  reuseCompletion,
  SUGGESTION_DELAY_MS,
  ALTERNATIVE_COUNT,
  plainSpaces,
} from './compose-core.js?v=83c29be8e550';
import { SampleCompose } from './sample-client.js?v=54ff75f26d32';
import { BridgeCompose } from './bridge-client.js?v=a56f53951df8';
import { RealtimeCompose } from './realtime.js?v=5bd4e1fea0f3';
import { readSavedKey, saveKey, forgetKey } from './key-storage.js?v=d7465de288af';
import { SelectionRewrite } from './selection-rewrite.js?v=2e5644700f96';
import { DocumentModel } from './doc-model.js?v=7e31ea16557e';
import { DocumentEdits } from './doc-edits.js?v=24a55d3f7fd1';
import { Links } from './links.js?v=5aca2c6e7864';
import { Operations } from './operations.js?v=e53f9e9333bd';
import { DocumentView } from './document-view.js?v=7101e38070e5';
import { PieceView } from './piece-view.js?v=e90d562413a3';
import { Workspace, restorePanes } from './panes.js?v=d23cd6c84cb1';
import {
  BUILT_IN,
  fullSpec,
  checkSpec,
  specFromPurpose,
  specFromLevel,
  specFromRoles,
  specFromSources,
  idFor,
} from './view-specs.js?v=9ea68139b870';
import { LegalIndex } from './legal-index.js?v=97a2dec467eb';
import { CiteCheck } from './cite-check.js?v=651dd200c7d8';
import { citationContext } from './citation-guard.js?v=5d0ebcbd173f';
import { Segments } from './segments.js?v=e0ae9f874bb3';

const $ = id => document.getElementById(id);
const editor = $('editor');
const ghost = $('suggestion');
const title = $('title');
const smart = $('smart');
const multi = $('multi');
const paragraph = $('paragraph');
const styleTabs = $('style-tabs');
const resize = $('resize');
const rephrase = $('rephrase');
const intelligence = $('intelligence');
const documentHolder = $('document-holder');
// Links that open the page with a set of panes: #legal, #levels, #document,
// #split, #sentences. A first visit opens #legal: the IRAC structure, the
// memo itself, and its sourcing.
const PRESETS = {
  legal: ['irac', 'document', 'sourcing'],
  levels: ['goals', 'how', 'document'],
  document: ['document'],
  split: ['document', 'sentences'],
  sentences: ['sentences'],
};
// Arrangements saved before legal work became the default keep to their old
// keys, so each reader starts once with the legal panes.
const PANES_KEY = 'text-and-autocomplete.panes.3';
const dialog = $('key-dialog');
const keyInput = $('api-key');
let completion = '';
let suggestionContext = '';
let composing = false;
let savedRange = null;
let spacedBlock = null;
let recentSuggestion = null;
// alternatives[0] is always the visible completion. cycle is the short window
// after accepting in multiple mode when Tab swaps in the next alternative.
let alternatives = [];
let alternativesPending = false;
let cycle = null;
const CYCLE_MS = 1500;
const PARAGRAPH_CYCLE_MS = 8000;
// 'inline' continues a paragraph; 'paragraph' drafts an empty one, with a
// one-word style label per alternative shown as tabs above it.
let suggestionKind = 'inline';
let labels = [];
let tabsBlock = null;
// Multiple tab autocomplete is the default. The menu keeps the chosen mode while
// disconnected (suggestions simply wait for a connection), and reconnecting restores it.
let preferMulti = true;
let timer;
let revision = 0;
let lastRequest = '';
let lastSelection = '';
let inputArmed = false;
let connectionAttempt = 0;
let validHTML = editor.innerHTML;
let beforeEdit = null;
let rewriter = null;
let ops = null;
let segments = null;
// A rewrite or a combine owns the document until it lands or is abandoned.
const working = () => Boolean(rewriter?.busy || ops?.busy);
const cancelWork = () => {
  rewriter?.cancel();
  ops?.cancel();
};
let debugStorage;
try {
  debugStorage = window.sessionStorage;
} catch {}
const debug = createDiagnostics({ storage: debugStorage });
let requestSequence = 0;
let visibleText = '';
const pageId = crypto.randomUUID();
const trace = (event, data = {}) => debug.record(event, { pageId, revision, ...data });
trace('page-load', { build: import.meta.url, visibility: document.visibilityState });
function saveDebugLog() {
  trace('log-export');
  debug.flush();
  const blob = new Blob([JSON.stringify(debug.snapshot(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `text-and-autocomplete-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.textAndAutocompleteDebug = Object.freeze({
  snapshot: debug.snapshot,
  download: saveDebugLog,
});
$('save-debug-log').addEventListener('click', saveDebugLog);
let wasReady = false;
let leaving = false;
// scripts/bridge.mjs opens the page at #k=<token>. The token pairs this tab with
// the bridge, which runs requests on the user's Claude or ChatGPT plan instead
// of an API key. Keep it for this tab only and drop it from the address bar.
const bridgeToken = (() => {
  const match = /^#k=([A-Za-z0-9_-]{20,})$/.exec(location.hash);
  let token = match?.[1] || '';
  try {
    if (token) sessionStorage.setItem('bridge-token', token);
    else token = sessionStorage.getItem('bridge-token') || '';
  } catch {}
  if (match) history.replaceState(null, '', location.pathname + location.search);
  return token;
})();
// Published as a claude.ai page, the editor asks Claude on the viewer's own account.
const claudePage = !bridgeToken && typeof window.claude?.use === 'function';
// The plan modes take no API key: the bridge or claude.ai holds the sign-in.
const planMode = Boolean(bridgeToken) || claudePage;
// Opening the bridge's new link in this tab changes only the fragment, so pair
// again with the new token.
window.addEventListener('hashchange', () => {
  const match = /^#k=([A-Za-z0-9_-]{20,})$/.exec(location.hash);
  if (!match) return;
  try {
    sessionStorage.setItem('bridge-token', match[1]);
    history.replaceState(null, '', location.pathname + location.search);
  } catch {}
  location.reload();
});
const onConnectionStatus = (state, message) => {
  trace('connection-state', { state });
  $('connect').textContent =
    state === 'ready'
      ? 'Connected'
      : state === 'connecting'
        ? 'Connecting…'
        : claudePage
          ? 'Connect Claude'
          : bridgeToken
            ? 'Connect your plan'
            : 'Connect OpenAI';
  $('connect').dataset.state = state;
  $('disconnect').hidden = !client.ready;
  if (state === 'error' || state === 'disconnected') {
    cancelWork();
    endCycle('connection-' + state);
    inputArmed = false;
    lastRequest = '';
    recentSuggestion = null;
    clearSuggestion('connection-' + state);
  }
  rewriter?.update();
  segments?.connectionChanged();
  if (message) showNotice(message);
  const dropped = wasReady && state !== 'ready' && !leaving;
  wasReady = state === 'ready';
  gate();
  // The dialog covers the notice, so say there why it came back.
  if (dropped) {
    $('key-error').textContent = message || 'The connection closed. Connect again to keep going.';
  }
  showPlan();
};
// Model tiers for the claude.ai page, chosen in the Intelligence menu.
const TIERS_KEY = 'text-and-autocomplete.tiers';
const tiers = () => ({
  compose: $('tier-compose').value,
  rewrite: $('tier-rewrite').value,
  views: $('tier-views').value,
});
const client = bridgeToken
  ? new BridgeCompose(onConnectionStatus, {
      token: bridgeToken,
      diagnose: (event, data) => trace(event, data),
    })
  : claudePage
    ? new SampleCompose(onConnectionStatus, {
        tiers,
        diagnose: (event, data) => trace(event, data),
      })
    : new RealtimeCompose(onConnectionStatus, { diagnose: (event, data) => trace(event, data) });
function showNotice(message) {
  // Sign in with ChatGPT asks for a Manage usage link when a usage limit is reached.
  if (bridgeToken && client.session?.provider === 'chatgpt' && /usage limit/i.test(message)) {
    $('notice').replaceChildren(`${message} `, manageUsageLink());
  } else $('notice').textContent = message;
}
function selectionRange() {
  const selection = window.getSelection();
  return selection?.rangeCount &&
    editor.contains(selection.anchorNode) &&
    editor.contains(selection.focusNode)
    ? selection.getRangeAt(0)
    : null;
}
function plainText(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeName === 'BR') return '\n';
  let text = '';
  for (const child of node.childNodes) {
    if (/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(child.nodeName) && text && !text.endsWith('\n'))
      text += '\n';
    text += plainText(child);
  }
  return text;
}
function context() {
  const range = selectionRange();
  return range && contextOf(range);
}
function contextOf(range) {
  const before = range.cloneRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(editor);
  after.setStart(range.endContainer, range.endOffset);
  return {
    before: plainText(before.cloneContents()),
    selected: plainText(range.cloneContents()),
    after: plainText(after.cloneContents()),
    range,
    collapsed: range.collapsed,
  };
}
function contextKey(ctx) {
  return ctx ? JSON.stringify([ctx.before, ctx.after]) : '';
}
function ineligibleReason(ctx) {
  // Suggest only after actual typing and at a paragraph end. Never cover existing text.
  if (!ctx) return 'no-editor-selection';
  if (!ctx.collapsed) return 'selected-text';
  if (!inputArmed) return 'not-armed-by-typing';
  if (composing) return 'composition-active';
  if (working()) return 'rewrite-active';
  if (!client.ready) return 'disconnected';
  if (dialog.open) return 'settings-open';
  if (document.activeElement !== editor) return 'editor-unfocused';
  if (!withinLimit(editor.innerText) || wordCount(editor.innerText) >= MAX_WORDS) {
    return 'document-limit';
  }
  const block = blockOf(ctx);
  const tail = ctx.range.cloneRange();
  tail.selectNodeContents(block);
  tail.setStart(ctx.range.startContainer, ctx.range.startOffset);
  if (tail.toString().trim()) return 'text-after-caret-in-paragraph';
  if (kindOf(ctx) === 'paragraph') return paragraph.checked ? null : 'suggested-paragraph-off';
  // Never suggest inside a citation, after a signal, or inside a quotation:
  // those words are the author's evidence.
  const inside = citationContext(ctx.before.slice(ctx.before.lastIndexOf('\n') + 1));
  if (inside) return inside;
  // A block quotation is quoted text even with no quotation marks.
  if (block.nodeName === 'BLOCKQUOTE') return 'inside-quotation';
  if (!smart.checked && !multi.checked) return 'smart-compose-off';
  return /\S/.test(ctx.before.split('\n').at(-1) || '') ? null : 'empty-paragraph';
}
function blockOf(ctx) {
  let block =
    ctx.range.startContainer.nodeType === Node.TEXT_NODE
      ? ctx.range.startContainer.parentElement
      : ctx.range.startContainer;
  while (block !== editor && block.parentElement !== editor) block = block.parentElement;
  return block;
}
// An empty body paragraph, anywhere in the document, asks for a whole paragraph.
function kindOf(ctx) {
  const block = ctx && blockOf(ctx);
  return block && block !== editor && /^(P|DIV)$/.test(block.nodeName) && !block.textContent.trim()
    ? 'paragraph'
    : 'inline';
}
function eligible(ctx) {
  return ineligibleReason(ctx) === null;
}
// Style tabs need room below the paragraph; reserve it only while they show.
function reserveTabs(block) {
  if (tabsBlock === block) return;
  tabsBlock?.style.removeProperty('--tabs-space');
  tabsBlock = block;
  block?.style.setProperty('--tabs-space', '24px');
}
function hideSuggestion(reason) {
  if (cycle) return;
  if (!ghost.hidden) trace('suggestion-hidden', { reason, suggestion: completion || visibleText });
  ghost.hidden = true;
  styleTabs.hidden = true;
  visibleText = '';
  reserveTabs(null);
}
function clearSuggestion(reason = 'cleared') {
  hideSuggestion(reason);
  completion = '';
  alternatives = [];
  labels = [];
  suggestionContext = '';
  if (spacedBlock) {
    spacedBlock.style.removeProperty('--completion-space');
    spacedBlock = null;
  }
}
function invalidate(reason = 'invalidated') {
  trace('invalidated', { reason });
  revision++;
  lastRequest = '';
  clearTimeout(timer);
  client.cancel();
  clearSuggestion(reason);
}
// Cancel pending suggestions and wait for the person to type again.
function disarm(reason) {
  inputArmed = false;
  invalidate(reason);
}
function endCycle(reason) {
  if (!cycle) return;
  trace('alternative-cycle-ended', { reason, index: cycle.index });
  clearTimeout(cycle.timer);
  cycle = null;
  hideSuggestion(reason);
}
function paintSuggestion() {
  // Checked before context(), which copies the document on every selection change.
  if (!cycle && !completion) {
    hideSuggestion('empty-completion');
    return;
  }
  const ctx = context();
  if (cycle && (!ctx?.collapsed || contextKey(ctx) !== cycle.key)) endCycle('context-changed');
  const hiddenReason = cycle
    ? null
    : !completion
      ? 'empty-completion'
      : ineligibleReason(ctx) || (contextKey(ctx) !== suggestionContext ? 'context-changed' : null);
  if (hiddenReason) {
    hideSuggestion(hiddenReason);
    return;
  }
  const block = blockOf(ctx);
  const tabLabels = cycle ? cycle.labels : suggestionKind === 'paragraph' ? labels : [];
  reserveTabs(tabLabels.length ? block : null);
  let rect = ctx.range.getBoundingClientRect();
  const page = document.querySelector('.page').getBoundingClientRect();
  const zoom = Number($('zoom').value);
  // A caret in an empty paragraph has no box of its own; use the paragraph's first line.
  if (!rect.height && kindOf(ctx) === 'paragraph') {
    const box = block.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(block).paddingBottom) * zoom;
    rect = { left: box.left, top: box.top, height: box.height - pad };
  }
  if (!rect.height) {
    hideSuggestion('caret-has-no-geometry');
    return;
  }
  const element =
    ctx.range.startContainer.nodeType === Node.TEXT_NODE
      ? ctx.range.startContainer.parentElement
      : ctx.range.startContainer;
  const style = getComputedStyle(element);
  for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight']) {
    ghost.style[property] = style[property];
  }
  const editorRect = editor.getBoundingClientRect();
  ghost.style.left = `${(editorRect.left - page.left) / zoom - 1}px`;
  ghost.style.top = `${(rect.top - page.top) / zoom - 1 - (parseFloat(style.lineHeight) - rect.height / zoom) / 2}px`;
  ghost.style.width = `${editorRect.width / zoom}px`;
  const spacer = document.createElement('span');
  spacer.style.display = 'inline-block';
  spacer.style.width = `${Math.max(0, (rect.left - editorRect.left) / zoom)}px`;
  spacer.style.height = '1px';
  ghost.replaceChildren(spacer, document.createTextNode(cycle ? '' : completion));
  // With style tabs, the badge sits beside the active tab instead of after the text.
  const badge = document.createElement('kbd');
  badge.textContent = 'tab';
  if (!tabLabels.length) ghost.append(badge);
  if (cycle ? cycle.kind === 'inline' : suggestionKind === 'inline' && multi.checked) {
    const pager = document.createElement('span');
    pager.className = 'pager';
    const count = cycle
      ? cycle.texts.length
      : alternativesPending
        ? ALTERNATIVE_COUNT
        : alternatives.length;
    for (let index = 0; index < count; index++) {
      const dot = document.createElement('i');
      if (index === (cycle ? cycle.index : 0)) dot.className = 'current';
      pager.append(dot);
    }
    badge.append(pager);
  }
  badge.classList.toggle('cycling', Boolean(cycle));
  if (!cycle && (ghost.hidden || completion !== visibleText)) {
    trace(ghost.hidden ? 'suggestion-shown' : 'suggestion-updated', { suggestion: completion });
  }
  ghost.hidden = false;
  visibleText = cycle ? '' : completion;
  styleTabs.hidden = !tabLabels.length;
  if (tabLabels.length) {
    styleTabs.replaceChildren(
      ...tabLabels.map((label, index) => {
        const tab = document.createElement('span');
        tab.textContent = label;
        if (index === (cycle ? cycle.index : 0)) tab.className = 'current';
        return tab;
      }),
    );
    styleTabs.querySelector('.current').after(badge);
    styleTabs.classList.toggle('cycling', Boolean(cycle));
    styleTabs.style.left = ghost.style.left;
    styleTabs.style.width = ghost.style.width;
    styleTabs.style.top = `${parseFloat(ghost.style.top) + ghost.offsetHeight}px`;
  }
  if (block !== editor) {
    spacedBlock = block;
    block.style.setProperty(
      '--completion-space',
      `${Math.max(0, ghost.offsetHeight - parseFloat(style.lineHeight))}px`,
    );
  }
}
function updateCount() {
  const words = wordCount(withDocument(() => editor.innerText));
  $('word-limit').textContent = `${words} / ${MAX_WORDS}`;
  $('word-limit').dataset.full = String(words >= MAX_WORDS);
}
function schedule() {
  const ctx = context();
  const blocked = ineligibleReason(ctx);
  if (blocked || contextKey(ctx) === lastRequest) {
    trace('request-skipped', { reason: blocked || 'same-context-already-requested' });
    return;
  }
  const generation = revision;
  const key = contextKey(ctx);
  const attempt = `${pageId}:${++requestSequence}`;
  trace('request-scheduled', {
    attempt,
    beforeChars: ctx.before.length,
    afterChars: ctx.after.length,
  });
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const staleReason = () =>
      generation !== revision
        ? 'revision-changed'
        : contextKey(context()) !== key
          ? 'context-changed'
          : ineligibleReason(context());
    const blocked = staleReason();
    if (blocked) {
      trace('request-skipped', { attempt, reason: blocked });
      return;
    }
    lastRequest = key;
    trace('compose-request', {
      attempt,
      beforeTail: ctx.before.slice(-160),
      afterHead: ctx.after.slice(0, 80),
    });
    let previousReason;
    const kind = kindOf(ctx);
    const wantAlternatives = kind === 'inline' && multi.checked;
    const inspect = (text, finished) =>
      kind === 'paragraph'
        ? inspectParagraphs(text, ctx.before, ctx.after, finished)
        : wantAlternatives
          ? inspectAlternatives(text, ctx.before, ctx.after, finished)
          : inspectCompletion(text, ctx.before, ctx.after, finished);
    const show = decoded => {
      alternatives = decoded.texts || [decoded.text];
      labels = decoded.labels || [];
      suggestionKind = kind;
      completion = decoded.text;
      suggestionContext = key;
    };
    alternativesPending = wantAlternatives;
    try {
      const result = await client.request(
        ctx,
        (text, finished) => {
          const stale = staleReason();
          if (stale) {
            if (finished) trace('response-ignored', { attempt, reason: stale, stage: 'text-done' });
            return;
          }
          const decoded = inspect(text, finished);
          if (finished || decoded.reason !== previousReason) {
            trace('completion-validation', {
              attempt,
              stage: finished ? 'text-done' : 'stream',
              reason: decoded.reason || 'accepted',
              rawChars: text.length,
              raw: text,
              suggestion: decoded.text,
            });
          }
          previousReason = decoded.reason;
          if (!decoded.text) {
            clearSuggestion(decoded.reason);
            return;
          }
          if (
            JSON.stringify([decoded.texts || [decoded.text], decoded.labels || []]) ===
            JSON.stringify([alternatives, labels])
          ) {
            return;
          }
          show(decoded);
          paintSuggestion();
        },
        attempt,
        { alternatives: wantAlternatives, paragraphs: kind === 'paragraph' },
      );
      const stale = staleReason();
      if (stale) {
        trace('response-ignored', { attempt, reason: stale, stage: 'response-done' });
        return;
      }
      alternativesPending = false;
      const decoded = inspect(result, true);
      trace('completion-validation', {
        attempt,
        stage: 'response-done',
        reason: decoded.reason || 'accepted',
        rawChars: result.length,
        raw: result,
        suggestion: decoded.text,
      });
      if (!decoded.text) clearSuggestion(decoded.reason);
      else show(decoded);
      recentSuggestion =
        completion && kind === 'inline'
          ? {
              context: { before: ctx.before, after: ctx.after },
              texts: alternatives,
              time: Date.now(),
            }
          : null;
      paintSuggestion();
    } catch (error) {
      trace('request-error', {
        attempt,
        reason: error.name === 'AbortError' ? 'cancelled' : 'failed',
        message: error.message,
      });
      if (error.name !== 'AbortError' && generation === revision) {
        clearSuggestion('request-error');
        showNotice(error.message);
      }
    }
  }, SUGGESTION_DELAY_MS);
}
function pathOf(node) {
  const path = [];
  while (node !== editor) {
    path.unshift([...node.parentNode.childNodes].indexOf(node));
    node = node.parentNode;
  }
  return path;
}
function snapshot() {
  const r = selectionRange();
  const copy = editor.cloneNode(true);
  for (const element of copy.querySelectorAll('[style]')) {
    element.style.removeProperty('--completion-space');
    element.style.removeProperty('--tabs-space');
  }
  return {
    html: copy.innerHTML,
    selection: r
      ? [pathOf(r.startContainer), r.startOffset, pathOf(r.endContainer), r.endOffset]
      : null,
  };
}
function restoreSnapshot(state) {
  editor.innerHTML = state.html;
  if (state.selection) {
    try {
      const [start, offset, end, endOffset] = state.selection;
      const r = document.createRange();
      r.setStart(
        start.reduce((node, i) => node.childNodes[i], editor),
        offset,
      );
      r.setEnd(
        end.reduce((node, i) => node.childNodes[i], editor),
        endOffset,
      );
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    } catch {
      placeAtEnd();
    }
  }
}
function placeAtEnd() {
  const r = document.createRange();
  r.selectNodeContents(editor);
  r.collapse(false);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(r);
}
function changed(event) {
  trace('editor-input', { inputType: event?.inputType || 'programmatic', composing });
  if (working()) return;
  const current = context();
  if (cycle && !cycle.applying) endCycle('editor-input');
  let reusable = [];
  const reuseAll = (previous, texts) =>
    texts.map(text => reuseCompletion(previous, text, current)).filter(text => text.trim());
  if (!composing && current?.collapsed) {
    if (completion && suggestionContext && suggestionKind === 'inline') {
      const [before, after] = JSON.parse(suggestionContext);
      reusable = reuseAll({ before, after }, alternatives);
    }
    if (!reusable.length && recentSuggestion && Date.now() - recentSuggestion.time < 30000) {
      reusable = reuseAll(recentSuggestion.context, recentSuggestion.texts);
    }
  }
  invalidate('editor-input');
  if (composing) return;
  if (!withinLimit(editor.innerText)) {
    restoreSnapshot(beforeEdit || { html: validHTML });
    showNotice(
      `Keep the document within ${MAX_WORDS} words and ${MAX_CHARS.toLocaleString()} characters.`,
    );
    inputArmed = false;
  } else {
    validHTML = editor.innerHTML;
    inputArmed = true;
    showNotice('');
  }
  beforeEdit = null;
  lastSelection = contextKey(context());
  updateCount();
  if (reusable.length && eligible(context())) {
    trace('suggestion-reused', { suggestion: reusable[0] });
    alternatives = reusable;
    completion = reusable[0];
    alternativesPending = false;
    suggestionContext = lastSelection;
    paintSuggestion();
  } else schedule();
}
editor.addEventListener('beforeinput', event => {
  if (working() && !rewriter.applying && !ops.applying) {
    event.preventDefault();
    return;
  }
  if (!composing) beforeEdit = snapshot();
});
editor.addEventListener('input', changed);
editor.addEventListener('compositionstart', () => {
  beforeEdit = snapshot();
  composing = true;
  invalidate('composition-start');
});
editor.addEventListener('compositionend', () => {
  composing = false;
  changed();
});
// Select the text just inserted by walking back from the caret, so the next
// alternative replaces it through the native undo stack.
function insertedRange(length) {
  const caret = selectionRange();
  if (!caret?.collapsed) return null;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node = caret.startContainer;
  let offset = caret.startOffset;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  walker.currentNode = node;
  while (length > offset) {
    length -= offset;
    node = walker.previousNode();
    if (!node) return null;
    offset = node.length;
  }
  const range = document.createRange();
  range.setStart(node, offset - length);
  range.setEnd(caret.startContainer, caret.startOffset);
  return range;
}
function applyAlternative(index) {
  const range = insertedRange(cycle.inserted.length);
  if (!range || plainSpaces(range.toString()) !== plainSpaces(cycle.inserted)) {
    endCycle('inserted-text-not-found');
    return;
  }
  const text = fitInsertion(cycle.before, cycle.texts[index], cycle.after);
  if (!text) {
    endCycle('document-limit');
    return;
  }
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  cycle.applying = true;
  beforeEdit = snapshot();
  const applied = document.execCommand('insertText', false, text);
  cycle.applying = false;
  disarm('alternative-applied');
  if (!applied) {
    endCycle('insert-failed');
    return;
  }
  cycle.index = index;
  cycle.inserted = text;
  cycle.key = lastSelection = contextKey(context());
  trace('alternative-applied', { index, suggestion: text });
  updateCount();
}
function startCycleTimer() {
  clearTimeout(cycle.timer);
  cycle.timer = setTimeout(
    () => endCycle('timeout'),
    cycle.kind === 'paragraph' ? PARAGRAPH_CYCLE_MS : CYCLE_MS,
  );
}
editor.addEventListener('keydown', event => {
  if (cycle && event.key === 'Tab' && !event.shiftKey && !composing) {
    event.preventDefault();
    if (cycle.texts.length > 1) applyAlternative((cycle.index + 1) % cycle.texts.length);
    if (cycle) {
      startCycleTimer();
      paintSuggestion();
    }
    return;
  }
  if (cycle && !['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    endCycle('key-' + (event.key === 'Escape' ? 'escape' : 'other'));
  }
  if (event.key === 'Tab' && !event.shiftKey && !composing && completion && !ghost.hidden) {
    const ctx = context();
    if (contextKey(ctx) !== suggestionContext) return;
    event.preventDefault();
    const text = completion;
    const texts = alternatives;
    const kind = suggestionKind;
    const styles = labels;
    const keep = kind === 'paragraph' || multi.checked;
    beforeEdit = snapshot();
    invalidate('suggestion-accepted');
    const inserted = fitInsertion(ctx.before, text, ctx.after);
    document.execCommand('insertText', false, inserted);
    disarm('after-accept');
    updateCount();
    if (keep && inserted) {
      cycle = {
        texts,
        labels: kind === 'paragraph' ? styles : [],
        kind,
        index: 0,
        inserted,
        before: ctx.before,
        after: ctx.after,
        key: contextKey(context()),
        applying: false,
        timer: null,
      };
      lastSelection = cycle.key;
      startCycleTimer();
      paintSuggestion();
    }
  } else if (event.key === 'Escape') {
    recentSuggestion = null;
    disarm('escape');
  }
});
editor.addEventListener('paste', event => {
  event.preventDefault();
  const ctx = context();
  if (!ctx) return;
  const pasted = event.clipboardData.getData('text/plain');
  const fitted = fitInsertion(ctx.before, pasted, ctx.after);
  beforeEdit = snapshot();
  document.execCommand('insertText', false, fitted);
  if (fitted !== pasted) showNotice('Pasted text was shortened to fit the document limit.');
});
editor.addEventListener('drop', event => {
  event.preventDefault();
  showNotice('Paste text to add it to this document.');
});
editor.addEventListener('blur', () => {
  endCycle('editor-blur');
  if (working()) return;
  disarm('editor-blur');
});
document.addEventListener('selectionchange', () => {
  if (working()) return;
  const r = selectionRange();
  if (r) savedRange = r.cloneRange();
  const key = contextKey(context());
  if (completion && key !== suggestionContext) clearSuggestion('selection-changed');
  // Cursor movement invalidates pending network results without issuing new requests.
  if (lastSelection && key !== lastSelection) {
    disarm('selection-changed');
  }
  lastSelection = key;
  paintSuggestion();
  for (const button of document.querySelectorAll('[data-command]')) {
    button.setAttribute('aria-pressed', String(document.queryCommandState(button.dataset.command)));
  }
  rewriter?.update();
});
function restore() {
  editor.focus();
  if (savedRange && editor.contains(savedRange.startContainer)) {
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }
}
function command(name, value) {
  cancelWork();
  restore();
  beforeEdit = snapshot();
  document.execCommand(name, false, value);
  changed();
  disarm('format-command');
}
for (const button of document.querySelectorAll('[data-command]')) {
  button.addEventListener('mousedown', e => e.preventDefault());
  button.onclick = () => command(button.dataset.command);
}
for (const action of ['undo', 'redo']) {
  // A whole move or combine from another view is taken back in one step. With
  // no Document pane, the editor cannot take a command, so the views undo.
  $(action).onclick = () =>
    ops.has(action) || !editor.getClientRects().length ? ops[action]() : command(action);
}
$('style').onchange = e => command('formatBlock', e.target.value);
$('font').onchange = e => command('fontName', e.target.value);
$('size').onchange = e => {
  command('fontSize', '7');
  for (const font of editor.querySelectorAll('font[size="7"]')) {
    font.removeAttribute('size');
    font.style.fontSize = e.target.value + 'px';
  }
  validHTML = editor.innerHTML;
};
$('zoom').onchange = e => {
  $('panes').style.setProperty('--zoom', e.target.value);
  paintSuggestion();
  rewriter?.paint();
  documentView?.paint();
};
window.addEventListener('resize', paintSuggestion);
title.maxLength = 120;
title.oninput = () => {
  document.title = (title.value || 'Untitled document') + ' — Text and Autocomplete';
};
// The prototype is usable only with a working connection: until then the
// connect dialog stays open and cannot be dismissed.
function gate() {
  $('close-settings').hidden = !client.ready;
  if (!client.ready && !dialog.open && rewriter) openSettings();
}
// The remove button shows only while a key is in the field, so it always refers
// to a key the person can see. A key stored in this browser is shown there.
function updateRemoveKey() {
  $('forget-key').hidden = !keyInput.value;
}
function showStoredKey() {
  if (!$('key-submit').disabled) keyInput.value = readSavedKey();
  updateRemoveKey();
}
keyInput.addEventListener('input', updateRemoveKey);
function openSettings() {
  cancelWork();
  disarm('settings-open');
  $('key-error').textContent = '';
  $('disconnect').hidden = !client.ready;
  if (planMode) void refreshBridge();
  else showStoredKey();
  dialog.showModal();
  rewriter?.update();
}
function setConnecting(busy) {
  $('key-submit').disabled = busy;
  keyInput.disabled = busy;
  $('key-submit').textContent = busy ? 'Connecting…' : 'I understand, let’s try';
}
function disconnect() {
  leaving = true;
  cancelWork();
  connectionAttempt++;
  disarm('disconnect');
  client.disconnect();
  endCycle('disconnect');
  keyInput.value = '';
  updateRemoveKey();
  setConnecting(false);
  leaving = false;
}
$('connect').onclick = openSettings;
$('close-settings').onclick = () => dialog.close();
dialog.addEventListener('cancel', event => {
  if (!client.ready) event.preventDefault();
});
dialog.addEventListener('close', () => {
  keyInput.value = '';
  updateRemoveKey();
  if ($('key-submit').disabled) disconnect();
  gate();
});
async function connectKey(key, automatic = false) {
  const attempt = ++connectionAttempt;
  setConnecting(true);
  $('key-error').textContent = '';
  keyInput.value = '';
  updateRemoveKey();
  try {
    await client.connect(key);
    if (attempt !== connectionAttempt) return;
    let message =
      'Connected. Type for suggestions, select text and drag its handle, or double-click it to rephrase. Hover over a piece in IRAC or Sourcing to find its text in the memo.';
    try {
      if (planMode) localStorage.setItem(`${CONSENT_KEY}.${client.session?.provider}`, '1');
      else saveKey(key);
    } catch {
      message = planMode
        ? 'Connected for this session.'
        : 'Connected for this session. Browser storage is unavailable, so your key could not be saved.';
    }
    setConnecting(false);
    (preferMulti ? multi : smart).checked = true;
    showNotice(message);
    if (dialog.open) dialog.close();
    if (!automatic) restore();
  } catch (error) {
    if (attempt !== connectionAttempt) return;
    const message =
      error.name === 'AbortError' ? 'Connection cancelled or timed out.' : error.message;
    $('key-error').textContent = message;
    showNotice(message);
  } finally {
    if (attempt === connectionAttempt) {
      keyInput.value = '';
      setConnecting(false);
      // A stored key that fails on load (for example, one that was revoked) stays
      // in the field so it can be retried or removed.
      if (automatic && !client.ready) showStoredKey();
      else updateRemoveKey();
    }
  }
}
// Bridge mode: the bridge holds the plan sign-in, so the dialog asks for consent
// instead of a key. Autocomplete sends a request whenever typing pauses, so each
// plan's consent comes before any request on it.
const CONSENT_KEY = 'text-and-autocomplete.bridge-consent';
let bridgePoll = null;
function bridgeConsented(provider) {
  try {
    return localStorage.getItem(`${CONSENT_KEY}.${provider}`) === '1';
  } catch {
    return false;
  }
}
function manageUsageLink() {
  const link = document.createElement('a');
  link.href = 'https://chatgpt.com/settings/usage';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Manage usage';
  return link;
}
// A #k= link opened on a plain static server: this tab returns to API-key mode.
function leaveBridgeMode() {
  try {
    sessionStorage.removeItem('bridge-token');
  } catch {}
  location.reload();
}
function describeSession(session) {
  const model = session.model ? ` Model: ${session.model}.` : '';
  const problem = session.problem ? ` ${session.problem}` : '';
  if (session.provider === 'claude-page') {
    return [
      `Requests use Claude on your own claude.ai account and count toward your plan's usage. The text around your cursor or selection is sent to Claude with each request, and autocomplete sends one each time you pause while typing. Claude asks once per visit before this page can use it. Choose the model tiers in the Intelligence menu.${problem}`,
    ];
  }
  if (session.provider === 'claude') {
    const payer =
      session.billing === 'api_key'
        ? 'Requests are billed to the Anthropic API key that Claude Code uses on this computer.'
        : 'Requests run on your Claude plan through your own Claude Code sign-in on this computer, and count toward its usage limits.';
    const plan = session.plan ? ` Plan reported by Claude Code: ${session.plan}.` : '';
    return [
      `${payer} The text around your cursor or selection is sent to Anthropic with each request, and autocomplete sends one each time you pause while typing. For personal use only.${model}${plan}${problem}`,
    ];
  }
  const sent = 'The text around your cursor or selection is sent to OpenAI with each request.';
  if (session.ready) {
    return [
      `You're using your ChatGPT plan${session.email ? ` (${session.email})` : ''}. Requests in this editor, including autocomplete each time you pause while typing, use its usage, then your credits if you let apps use them. ${sent}${model} `,
      manageUsageLink(),
    ];
  }
  if (session.signingIn) {
    return [`Finish signing in on the ChatGPT tab, then come back here.${problem}`];
  }
  return [
    `Use your ChatGPT plan: requests in this editor use the usage included in your ChatGPT Plus or Pro plan, or your credits. ${sent}${problem}`,
  ];
}
async function refreshBridge() {
  let session;
  try {
    session = await client.describe();
  } catch (error) {
    if (error.code === 'not_bridge') leaveBridgeMode();
    $('bridge-status').textContent = error.message;
    $('chatgpt-signin').hidden = true;
    $('chatgpt-switch').hidden = true;
    return null;
  }
  // A link shown because the sign-in tab was blocked stays until sign-in ends.
  if (!(session.signingIn && $('bridge-status').querySelector('.signin-link'))) {
    $('bridge-status').replaceChildren(...describeSession(session));
  }
  const chatgpt = session.provider === 'chatgpt';
  // While a sign-in is pending, the button starts a new one, which replaces it.
  $('chatgpt-signin').hidden = !chatgpt || session.ready;
  $('chatgpt-signin').textContent = session.signingIn
    ? 'Start sign-in again'
    : 'Continue with ChatGPT';
  $('chatgpt-switch').hidden = !chatgpt || !session.signedIn || session.signingIn;
  return session;
}
function pollBridge() {
  clearInterval(bridgePoll);
  const started = Date.now();
  bridgePoll = setInterval(async () => {
    if (!dialog.open || Date.now() - started > 10 * 60 * 1000) {
      clearInterval(bridgePoll);
      return;
    }
    const session = await refreshBridge();
    if (!session?.signingIn) clearInterval(bridgePoll);
  }, 2000);
}
async function signInWithChatGPT({ newAccount = false } = {}) {
  $('key-error').textContent = '';
  // Open the tab during the click so it is not blocked, then send it to ChatGPT.
  const tab = window.open('', '_blank');
  try {
    const { url } = await client.login({ newAccount });
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      const link = document.createElement('a');
      link.className = 'signin-link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open ChatGPT sign-in';
      $('bridge-status').replaceChildren('Your browser blocked the sign-in tab. ', link);
    }
  } catch (error) {
    tab?.close();
    $('key-error').textContent = error.message;
    return;
  }
  await refreshBridge();
  pollBridge();
}
function showPlan() {
  const indicator = $('plan-indicator');
  const session = client.session;
  indicator.hidden = !planMode || !client.ready || !session;
  if (indicator.hidden) return;
  if (session.provider === 'chatgpt') {
    indicator.replaceChildren('Using ChatGPT plan · ', manageUsageLink());
  } else if (session.provider === 'claude-page') {
    indicator.replaceChildren('Using your Claude account');
  } else {
    indicator.replaceChildren(
      session.billing === 'api_key' ? 'Using Anthropic API key' : 'Using Claude plan',
    );
  }
}
function setupBridge() {
  for (const element of [
    $('key-terms'),
    $('key-privacy'),
    $('get-key'),
    document.querySelector('.key-label-row'),
    keyInput.closest('.key-field'),
  ]) {
    element.hidden = true;
  }
  keyInput.required = false;
  $('bridge-panel').hidden = false;
  $('connect').textContent = claudePage ? 'Connect Claude' : 'Connect your plan';
  if (claudePage) {
    for (const row of document.querySelectorAll('.tier-row')) row.hidden = false;
    try {
      const saved = JSON.parse(localStorage.getItem(TIERS_KEY) || '{}');
      for (const [id, value] of [
        ['tier-compose', saved.compose],
        ['tier-rewrite', saved.rewrite],
        ['tier-views', saved.views],
      ]) {
        if ([...$(id).options].some(option => option.value === value)) $(id).value = value;
      }
    } catch {}
    for (const id of ['tier-compose', 'tier-rewrite', 'tier-views']) {
      $(id).onchange = () => {
        trace('tier-changed', { id, value: $(id).value });
        try {
          localStorage.setItem(TIERS_KEY, JSON.stringify(tiers()));
        } catch {}
      };
    }
  }
  $('chatgpt-signin').onclick = () => void signInWithChatGPT();
  $('chatgpt-switch').onclick = () => void signInWithChatGPT({ newAccount: true });
}
$('key-form').onsubmit = event => {
  event.preventDefault();
  if ($('key-submit').disabled) return;
  if (planMode) {
    void connectKey('');
    return;
  }
  const key = keyInput.value.trim();
  if (!key.startsWith('sk-') || key.length < 20) {
    $('key-error').textContent = 'Enter a valid OpenAI API key.';
    return;
  }
  void connectKey(key);
};
$('disconnect').onclick = () => {
  disconnect();
  showStoredKey();
  showNotice(
    readSavedKey()
      ? 'Disconnected. Your key stays in this browser for next time.'
      : 'Disconnected.',
  );
};
$('forget-key').onclick = () => {
  disconnect();
  try {
    forgetKey();
  } catch {
    $('key-error').textContent =
      'Could not remove the key. Clear this site’s data in your browser settings.';
    return;
  }
  updateRemoveKey();
  $('key-error').textContent = '';
  showNotice('Your key was removed from this browser.');
};
resize.onchange = () => {
  trace('resize-toggled', { enabled: resize.checked });
  cancelWork();
  rewriter?.hideControls();
  rewriter?.update();
};
document.addEventListener('pointerdown', event => {
  if (!intelligence.contains(event.target)) intelligence.open = false;
});
intelligence.addEventListener('keydown', event => {
  if (event.key === 'Escape' && intelligence.open) {
    intelligence.open = false;
    intelligence.querySelector('summary').focus();
  }
});
rephrase.onchange = () => {
  trace('rephrase-toggled', { enabled: rephrase.checked });
  cancelWork();
};
paragraph.onchange = () => {
  trace('suggested-paragraph-toggled', { enabled: paragraph.checked });
  endCycle('suggested-paragraph-toggled');
  disarm('suggested-paragraph-toggled');
  if (paragraph.checked && !client.ready) openSettings();
};
// Tab autocomplete and Multiple tab autocomplete are alternatives to each other.
for (const [box, other] of [
  [smart, multi],
  [multi, smart],
]) {
  box.onchange = () => {
    if (box.checked) {
      other.checked = false;
      preferMulti = box === multi;
    }
    cancelWork();
    endCycle('smart-compose-toggled');
    disarm('smart-compose-toggled');
    if (box.checked && !client.ready) openSettings();
  };
}
window.addEventListener('pagehide', () => {
  trace('page-hidden');
  disconnect();
  debug.flush();
});
document.addEventListener('visibilitychange', () => {
  trace('visibility-changed', { state: document.visibilityState });
  if (document.hidden) {
    cancelWork();
    disarm('tab-hidden');
    debug.flush();
  }
});
const rewriteOptions = {
  editor,
  client,
  getContext: () => (dialog.open || composing ? null : context()),
  canResize: () => resize.checked,
  canRephrase: () => rephrase.checked,
  pauseCompose: () => {
    recentSuggestion = null;
    disarm('rewrite-started');
    showNotice('');
  },
  notify: showNotice,
  connect: openSettings,
  commit: (range, text, done = 'Text resized. Undo to restore the original.') => {
    editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    beforeEdit = snapshot();
    const start = { node: range.startContainer, offset: range.startOffset };
    // execCommand retains the native undo stack. The preview never touched it.
    if (
      !(text ? document.execCommand('insertText', false, text) : document.execCommand('delete'))
    ) {
      showNotice('Could not apply the rewrite. Original text kept.');
      return null;
    }
    let inserted = null;
    if (!withinLimit(editor.innerText)) {
      document.execCommand('undo');
      showNotice('The rewrite exceeded the document limit. Original text kept.');
    } else {
      showNotice(done);
      // The new text runs from the old selection start to the caret.
      const caret = selectionRange();
      try {
        if (caret && start.node.isConnected) {
          inserted = document.createRange();
          inserted.setStart(
            start.node,
            Math.min(start.offset, start.node.length ?? start.node.childNodes.length),
          );
          inserted.setEnd(caret.endContainer, caret.endOffset);
        }
      } catch {
        inserted = null;
      }
    }
    validHTML = editor.innerHTML;
    beforeEdit = null;
    savedRange = selectionRange()?.cloneRange();
    lastSelection = contextKey(context());
    disarm('rewrite-committed');
    updateCount();
    return inserted;
  },
};
rewriter = new SelectionRewrite(rewriteOptions);
// Hidden, the editor has no layout: innerText loses its line breaks and editing
// commands fail. While no pane shows the document, it is shown off screen for
// the length of `run` and hidden again before the browser paints.
function withDocument(run) {
  if (editor.getClientRects().length) return run();
  const focused = document.activeElement;
  documentHolder.hidden = false;
  try {
    return run();
  } finally {
    documentHolder.hidden = true;
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
}
// Native edits for the views. They scroll to what they changed, so an edit made
// from another view puts every pane back where it was, and the views then show
// the result themselves.
function runEdit(work) {
  const focused = document.activeElement;
  const scrolls = [...document.querySelectorAll('.pane-body')].map(body => [body, body.scrollTop]);
  withDocument(() => {
    editor.focus({ preventScroll: true });
    work();
    validHTML = editor.innerHTML;
    beforeEdit = null;
    updateCount();
  });
  if (focused !== editor) {
    for (const [body, top] of scrolls) body.scrollTop = top;
    if (focused?.isConnected) focused.focus({ preventScroll: true });
  }
  disarm('view-edit');
}
// Every view reads the same model, points at text through the same links, and
// changes the document through the same operations.
const model = new DocumentModel(editor, document.documentElement.lang);
const links = new Links();
ops = new Operations({
  editor,
  model,
  edits: new DocumentEdits({ editor, run: runEdit }),
  links,
  client,
  contextOf,
  notify: showNotice,
  connect: openSettings,
  open: openInDocument,
  // A rewrite still running in the document would land on moved text.
  interrupt: () => {
    rewriter.cancel();
    rewriter.hideControls();
  },
});
// claude.ai answers several requests at once, so there the views get their
// own connection and never cancel autocomplete. The bridge and the Realtime API
// answer one at a time, so the views share the editor's and wait their turn.
const viewClient = claudePage
  ? new SampleCompose(() => {}, {
      tiers,
      diagnose: (event, data) => trace(`view-${event}`, data),
    })
  : client;
segments = new Segments({
  model,
  client: viewClient,
  ready: () => client.ready,
  shared: viewClient === client,
  storage: (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
  diagnose: (event, data) => trace(event, data),
});
// Views a person declared, kept in this browser.
const VIEWS_KEY = 'text-and-autocomplete.views';
let customViews = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEWS_KEY) || '[]');
    const builtIn = BUILT_IN.map(spec => spec.id);
    return Array.isArray(saved)
      ? saved.filter(spec => !checkSpec(spec).length && !builtIn.includes(spec.id))
      : [];
  } catch {
    return [];
  }
})();
const allSpecs = () => [...BUILT_IN, ...customViews];
function saveViews() {
  try {
    localStorage.setItem(VIEWS_KEY, JSON.stringify(customViews));
  } catch {}
}
const documentView = new DocumentView({
  root: $('document-view'),
  holder: documentHolder,
  editor,
  model,
  links,
  ops,
  flash: range => rewriter.flash(range),
});
// The legal reading the IRAC and Sourcing views share.
const legal = new LegalIndex({
  model,
  segments,
  storage: (() => {
    try {
      return localStorage;
    } catch {
      return null;
    }
  })(),
});
// Checks of the cited authorities against Midpage, through the reader's own
// connector, where this page can reach it (a claude.ai page that declares the
// `mcp` capability). Results are kept in this browser only.
const citeCheck = claudePage
  ? new CiteCheck({
      load: () => window.claude.use('mcp'),
      storage: (() => {
        try {
          return localStorage;
        } catch {
          return null;
        }
      })(),
    })
  : null;
const workspace = new Workspace({
  root: $('panes'),
  specs: () => allSpecs().map(fullSpec),
  create: (spec, id) =>
    spec.kind === 'document'
      ? documentView
      : new PieceView({ id, spec, model, ops, links, segments, legal, check: citeCheck }),
  storageKey: PANES_KEY,
  onChange: panesChanged,
  editable: spec => customViews.some(view => view.id === spec.id),
  edit: spec => openViewDialog(customViews.find(view => view.id === spec.id)),
});
const arrangementOf = views => views.map(view => ({ view, weight: 1, follows: true }));
let documentOpen = false;
function panesChanged() {
  const open = workspace.has('document');
  // Formatting acts on a selection in the editor, which needs a Document pane.
  for (const control of document.querySelectorAll(
    '.toolbar .group:not(.history, .zoom-group) :is(button, select)',
  )) {
    control.disabled = !open;
  }
  if (open !== documentOpen) {
    documentOpen = open;
    trace('document-pane', { open });
    cancelWork();
    endCycle('document-pane');
    disarm('document-pane');
    rewriter.hideControls();
  }
  const add = $('add-view');
  const options = allSpecs().map(spec => {
    const option = document.createElement('option');
    option.value = spec.id;
    option.textContent = spec.title;
    option.disabled = spec.id === 'document' && open;
    return option;
  });
  add.replaceChildren(add.options[0] || new Option('Choose…', ''), ...options);
  add.value = '';
  paintSuggestion();
  rewriter.paint();
  documentView.paint();
}
$('add-view').onchange = event => {
  if (event.target.value) workspace.add(event.target.value);
  event.target.value = '';
};
// A view a person declares: a name and what the view is for, from which
// Claude divides the document, or the declaration itself, edited as data.
const viewDialog = $('view-dialog');
const viewForm = $('view-form');
let editingView = null;
function viewDraft() {
  try {
    const draft = JSON.parse($('view-json').value);
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : null;
  } catch {
    return null;
  }
}
function viewProblems(draft) {
  if (!draft) return ['The declaration is not valid JSON.'];
  const taken = allSpecs()
    .map(spec => spec.id)
    .filter(id => id !== editingView?.id);
  const id = editingView?.id || idFor(draft.title || '', taken);
  return checkSpec({ ...draft, id });
}
function showViewProblems() {
  const problems = viewProblems(viewDraft());
  $('view-problems').textContent = problems.join(' ');
  $('view-save').disabled = Boolean(problems.length);
}
// The purpose field is for views Claude divides for a purpose; a level view
// shares the map of goals, and IRAC and Sourcing share the legal labels, so
// they need none. IRAC and Sourcing are always lists.
function showSourceFields() {
  const source = $('view-source').value;
  $('view-purpose-field').hidden = source !== 'purpose';
  const legalView = source === 'roles' || source === 'sources';
  if (legalView) $('view-layout').value = 'list';
  $('view-layout').disabled = legalView;
}
// The form fields write into the declaration, keeping any field set as data.
function formToDraft() {
  const draft = viewDraft() || {};
  const fields = {
    title: $('view-title').value,
    layout: $('view-layout').value,
    move: $('view-move').checked,
    open: $('view-open').checked,
  };
  const source = $('view-source').value;
  const form =
    source === 'purpose'
      ? specFromPurpose({ ...fields, purpose: $('view-purpose').value })
      : source === 'roles'
        ? specFromRoles(fields)
        : source === 'sources'
          ? specFromSources(fields)
          : specFromLevel({ ...fields, level: Number(source) });
  delete form.id;
  const on = { ...(draft.on || {}) };
  for (const gesture of ['drop-between', 'double-click']) delete on[gesture];
  Object.assign(on, form.on);
  const next = { ...draft, ...form, on };
  // Fields that belong to another kind of view go.
  if (source !== 'purpose') delete next.purpose;
  if (!/^\d$/.test(source)) delete next.level;
  if (source !== 'roles' && source !== 'sources') delete next.header;
  if (source !== 'roles') delete next.checks;
  $('view-json').value = JSON.stringify(next, null, 2);
  showSourceFields();
  showViewProblems();
}
// A declaration edited as data shows in the form where the form has a field.
function draftToForm() {
  const draft = viewDraft();
  if (draft) {
    if (typeof draft.title === 'string') $('view-title').value = draft.title;
    if (typeof draft.purpose === 'string') $('view-purpose').value = draft.purpose;
    $('view-source').value =
      draft.unit === 'level' && [1, 2, 3, 4].includes(draft.level)
        ? String(draft.level)
        : draft.unit === 'role'
          ? 'roles'
          : draft.show === 'sources'
            ? 'sources'
            : 'purpose';
    if (['list', 'cards', 'bars'].includes(draft.layout)) $('view-layout').value = draft.layout;
    $('view-move').checked = draft.on?.['drop-between'] === 'move';
    $('view-open').checked = draft.on?.['double-click'] === 'open';
  }
  showSourceFields();
  showViewProblems();
}
function openViewDialog(spec = null) {
  editingView = spec;
  $('view-heading').textContent = spec ? 'Edit view' : 'New view';
  $('view-delete').hidden = !spec;
  const { id, ...draft } = spec || {
    title: '',
    kind: 'pieces',
    unit: 'claude',
    purpose: '',
    group: 'none',
    show: 'label',
    layout: 'list',
    on: { 'drop-between': 'move', 'double-click': 'open' },
  };
  $('view-json').value = JSON.stringify(draft, null, 2);
  draftToForm();
  viewDialog.showModal();
  $('view-title').focus();
}
for (const field of [
  'view-title',
  'view-source',
  'view-purpose',
  'view-layout',
  'view-move',
  'view-open',
]) {
  $(field).addEventListener('input', formToDraft);
}
$('view-json').addEventListener('input', draftToForm);
$('new-view').onclick = () => openViewDialog();
$('view-cancel').onclick = () => viewDialog.close();
viewForm.addEventListener('submit', event => {
  event.preventDefault();
  const draft = viewDraft();
  if (viewProblems(draft).length) return;
  const taken = allSpecs()
    .map(spec => spec.id)
    .filter(id => id !== editingView?.id);
  const spec = { ...draft, id: editingView?.id || idFor(draft.title, taken) };
  if (editingView) customViews = customViews.map(view => (view.id === spec.id ? spec : view));
  else customViews = [...customViews, spec];
  saveViews();
  viewDialog.close();
  trace('view-saved', { unit: spec.unit, layout: spec.layout, edited: Boolean(editingView) });
  if (editingView) workspace.refresh(spec.id);
  else workspace.add(spec.id);
  panesChanged();
});
$('view-delete').onclick = () => {
  if (!editingView) return;
  const id = editingView.id;
  customViews = customViews.filter(view => view.id !== id);
  saveViews();
  viewDialog.close();
  workspace.remove(id);
  panesChanged();
};
// The caret goes to the end of a piece another view opened, and the piece
// flashes. A Document pane opens first when there is none.
function openInDocument(range) {
  if (!workspace.has('document')) workspace.add('document', 0);
  editor.focus({ preventScroll: true });
  const caret = range.cloneRange();
  caret.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(caret);
  documentView.reveal(range);
  rewriter.flash(range);
}
window.addEventListener('hashchange', () => {
  const preset = PRESETS[location.hash.slice(1)];
  if (preset) workspace.set(arrangementOf(preset));
});
// Escape stops a combine from any view.
document.addEventListener(
  'keydown',
  event => {
    if (event.key !== 'Escape' || !ops.pending) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ops.cancel(true);
  },
  true,
);
// Undo and Redo keys outside a text field take back what the views did. In the
// editor, the browser undoes one native edit at a time, so a move or combine
// still on record is taken back whole there too.
document.addEventListener(
  'keydown',
  event => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    const command = key === 'y' || event.shiftKey ? 'redo' : 'undo';
    if (editor.contains(event.target)) {
      if (!ops.has(command)) return;
    } else if (event.target.closest?.('input, textarea, select, dialog, [contenteditable]')) {
      return;
    }
    event.preventDefault();
    ops[command]();
  },
  true,
);
// On claude.ai, a republish of this page keeps the document being written.
function restoreDocument(data) {
  if (typeof data?.html !== 'string' || !data.html) return;
  // A page open before the memo became the sample keeps the old sample; the
  // memo replaces it.
  if (data.html.startsWith('<h1>Pancakes for Dinner</h1>')) return;
  editor.innerHTML = data.html;
  validHTML = editor.innerHTML;
  ops.forget();
  links.clear();
  model.refresh();
  if (typeof data.title === 'string') {
    title.value = data.title;
    title.dispatchEvent(new Event('input'));
  }
  updateCount();
}
try {
  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ html: snapshot().html, title: title.value }));
  if (hot?.ready) hot.ready(restoreDocument);
  else restoreDocument(hot?.data);
} catch {}
// A link can name a set of panes; otherwise the reader's last arrangement holds.
{
  const preset = PRESETS[location.hash.slice(1)];
  const known = allSpecs().map(spec => spec.id);
  workspace.set(
    preset
      ? arrangementOf(preset)
      : restorePanes(workspace.saved(), known) || arrangementOf(PRESETS.legal),
  );
}
updateCount();
const initialRange = document.createRange();
initialRange.selectNodeContents(editor.lastElementChild || editor);
initialRange.collapse(false);
editor.focus();
window.getSelection().removeAllRanges();
window.getSelection().addRange(initialRange);
savedRange = initialRange;
if (planMode) setupBridge();
gate();
if (planMode) {
  // Consent is per plan, so ask the bridge which plan it runs before connecting.
  void refreshBridge().then(session => {
    if (session?.ready && bridgeConsented(session.provider)) void connectKey('', true);
  });
} else {
  const savedKey = readSavedKey();
  if (savedKey) void connectKey(savedKey, true);
}
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'update_document',
          description: `Replace the document title and text within the ${MAX_WORDS}-word limit. Does not send text to OpenAI.`,
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string' }, text: { type: 'string' } },
            required: ['title', 'text'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute(input) {
            if (
              !input ||
              typeof input.title !== 'string' ||
              typeof input.text !== 'string' ||
              input.title.length > title.maxLength ||
              !withinLimit(input.text)
            ) {
              throw new Error(
                `Use a title up to ${title.maxLength} characters and text within ${MAX_WORDS} words / ${MAX_CHARS.toLocaleString('en-US')} characters.`,
              );
            }
            cancelWork();
            disarm('document-replaced');
            title.value = input.title;
            title.dispatchEvent(new Event('input'));
            editor.replaceChildren();
            for (const line of input.text.split('\n')) {
              const p = document.createElement('p');
              if (line) p.textContent = line;
              else p.append(document.createElement('br'));
              editor.append(p);
            }
            validHTML = editor.innerHTML;
            savedRange = null;
            ops.forget();
            links.clear();
            model.refresh();
            updateCount();
            return { updated: true, words: wordCount(input.text) };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeTextRects,
  selectionWindow,
  offsetAtPoint,
  fitPreviewLines,
} from '../dist/rewrite-preview.js';

const rect = (left, top, width, height = 18) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const single = [rect(100, 40, 300)];
const wrapped = [rect(160, 40, 240), rect(100, 68, 300), rect(100, 118, 60)];

test('shortening from the right preserves the original footprint and fades only the discarded suffix', () => {
  const original = structuredClone(single);
  const area = selectionWindow(single, 0.6);
  assert.deepEqual(area.kept, [rect(100, 40, 180)]);
  assert.deepEqual(area.removed, [rect(280, 40, 120)]);
  assert.deepEqual(area.boundary, { x: 280, y: 49 });
  assert.deepEqual(single, original);
});
test('wrapped selections keep line positions and paragraph gaps fixed with a fixed start', () => {
  const right = selectionWindow(wrapped, 0.5);
  assert.deepEqual(right.kept, [rect(160, 40, 240), rect(100, 68, 60)]);
  assert.deepEqual(right.removed, [rect(160, 68, 240), rect(100, 118, 60)]);
  for (const fraction of [0.35, 0.5, 0.75, 1, 2]) {
    const area = selectionWindow(wrapped, fraction);
    assert.equal(
      [...area.kept, ...area.removed].reduce((sum, r) => sum + r.width * r.height, 0),
      600 * 18,
    );
  }
});
test('untrimmed geometry preserves all available preview lines', () => {
  assert.deepEqual(selectionWindow(wrapped, 2).kept, wrapped);
  assert.deepEqual(selectionWindow(wrapped, 2).removed, []);
});
test('end handle follows horizontal pixels and continues onto new lines', () => {
  const flow = { left: 100, right: 400, lineHeight: 28 };
  assert.equal(offsetAtPoint(wrapped, { x: 240, y: 127 }, flow), 680);
  assert.equal(offsetAtPoint(wrapped, { x: 160, y: 155 }, flow), 900);
  assert.equal(offsetAtPoint(wrapped, { x: 160, y: 183 }, flow), 1200);
  assert.equal(offsetAtPoint(wrapped, { x: 130, y: 155 }, flow), 870);
  assert.equal(offsetAtPoint(wrapped, { x: 160, y: 77 }, flow), 300);
  assert.equal(offsetAtPoint(single, { x: 400, y: 20 }, flow), 0);
  assert.equal(offsetAtPoint([], { x: 0, y: 0 }, flow), 0);
});
test('pointer position maps across wrapped lines without counting paragraph gaps', () => {
  assert.equal(offsetAtPoint(wrapped, { x: 160, y: 77 }), 300);
  assert.equal(offsetAtPoint(wrapped, { x: 130, y: 127 }), 570);
  assert.equal(offsetAtPoint(wrapped, { x: -30, y: 49 }), 0);
});
test('adjacent formatting runs share one line, without filling gaps between lines', () => {
  assert.deepEqual(mergeTextRects([rect(150, 40, 50), rect(100, 40, 50), rect(100, 68, 80)]), [
    rect(100, 40, 100),
    rect(100, 68, 80),
  ]);
});
test('streamed text wraps only within retained line widths and clips overflow instead of growing', () => {
  const measure = text => [...text].length;
  assert.deepEqual(fitPreviewLines('Keep the page still.', [8, 11], measure), [
    'Keep the',
    'page still.',
  ]);
  assert.deepEqual(fitPreviewLines('Keep the page completely still.', [8, 11], measure), [
    'Keep the',
    'page…',
  ]);
  assert.deepEqual(fitPreviewLines('First\nSecond', [10, 10], measure), ['First', 'Second']);
  for (let length = 1; length <= 30; length++) {
    const lines = fitPreviewLines(
      'Keep the page completely still.'.slice(0, length),
      [8, 11],
      measure,
    );
    assert.equal(lines.length, 2);
    assert.ok(measure(lines[0]) <= 8);
    assert.ok(measure(lines[1]) <= 11);
  }
});
test('fitting long words and unspaced languages preserves graphemes', () => {
  const measure = text =>
    [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
  assert.deepEqual(fitPreviewLines('👩🏽‍💻👩🏽‍💻👩🏽‍💻', [2, 2], measure), ['👩🏽‍💻👩🏽‍💻', '👩🏽‍💻']);
  assert.deepEqual(fitPreviewLines('明日ここに来る予定です', [4, 8], measure), [
    '明日ここ',
    'に来る予定です',
  ]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoints, brighten } from '../src/chart.js';

const datetime = { type: 'datetime', categories: null };

test('parsePoints: plain numbers, [x, y] tuples and {x, y} objects', () => {
  assert.deepEqual(parsePoints([1, 2], { type: 'linear', categories: null }), [
    { x: 0, y: 1 },
    { x: 1, y: 2 },
  ]);
  assert.deepEqual(parsePoints([['2026-06-10', 5]], datetime), [{ x: Date.UTC(2026, 5, 10), y: 5 }]);
  assert.deepEqual(parsePoints([{ x: new Date(Date.UTC(2026, 5, 11)), y: '7.5' }], datetime), [
    { x: Date.UTC(2026, 5, 11), y: 7.5 },
  ]);
  assert.deepEqual(parsePoints([[1000, null], [2000, 'x']], datetime), [
    { x: 1000, y: null },
    { x: 2000, y: null },
  ]);
});

test('parsePoints: categories map plain values to category names', () => {
  const res = parsePoints([3, 4], { type: 'datetime', categories: ['Mon', 'Tue'] });
  assert.deepEqual(res, [
    { x: 'Mon', y: 3 },
    { x: 'Tue', y: 4 },
  ]);
});

test('brighten lightens hex and rgb colors', () => {
  assert.equal(brighten('#000000', 0.1), 'rgb(26,26,26)');
  assert.equal(brighten('#fff', 0.5), 'rgb(255,255,255)');
  assert.equal(brighten('rgb(10, 20, 30)', 0.1), 'rgb(36,46,56)');
  assert.equal(brighten('tomato', 0.1), 'tomato');
});

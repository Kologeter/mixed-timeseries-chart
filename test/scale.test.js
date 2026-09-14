import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeExtremes, normalizeTickInterval } from '../src/scale.js';

test('normalizeTickInterval: nearest «nice» step not below the interval', () => {
  assert.equal(normalizeTickInterval(21.25), 25);
  assert.equal(normalizeTickInterval(203.6), 250);
  assert.equal(normalizeTickInterval(31.5), 40);
  assert.equal(normalizeTickInterval(0.43), 0.5);
  assert.equal(normalizeTickInterval(1), 1);
  assert.equal(normalizeTickInterval(0), 1);
});

test('extremes match the reference chart (area/spline/line on separate axes)', () => {
  // Cost (area, 2.04..63.75) -> 0..75
  assert.deepEqual(computeExtremes({ dataMin: 2.04, dataMax: 63.75 }), { min: 0, max: 75, tickInterval: 25 });
  // ROI confirmed (spline, 56.33..610.78) -> 0..750
  assert.deepEqual(computeExtremes({ dataMin: 56.33, dataMax: 610.78 }), { min: 0, max: 750, tickInterval: 250 });
  // Conversions (line, 3..90) -> 0..120
  assert.deepEqual(computeExtremes({ dataMin: 3, dataMax: 90 }), { min: 0, max: 120, tickInterval: 40 });
});

test('extremes: negative-only, mixed-sign and flat data', () => {
  const neg = computeExtremes({ dataMin: -90, dataMax: -3 });
  assert.equal(neg.max, 0);
  assert.ok(neg.min <= -90);

  const mixed = computeExtremes({ dataMin: -40, dataMax: 60 });
  assert.ok(mixed.min <= -40 && mixed.max >= 60);
  // После удвоения шага делений может стать меньше tickAmount (как в Highcharts), но не больше.
  assert.ok(Math.round((mixed.max - mixed.min) / mixed.tickInterval) + 1 <= 4);

  const flat = computeExtremes({ dataMin: 5, dataMax: 5 });
  assert.equal(flat.min, 0);
  assert.ok(flat.max >= 5);

  const zeros = computeExtremes({ dataMin: 0, dataMax: 0 });
  assert.ok(zeros.max > 0);
});

test('extremes: tickAmount controls the number of ticks', () => {
  const e = computeExtremes({ dataMin: 0, dataMax: 97, tickAmount: 6 });
  assert.equal(Math.round((e.max - e.min) / e.tickInterval) + 1, 6);
  assert.ok(e.max >= 97);
});

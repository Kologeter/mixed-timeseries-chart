import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curveSegments, curvePath, linePath, samplePolylines, distanceToPolyline, splitRuns } from '../src/spline.js';

const pts = [
  { x: 0, y: 100 },
  { x: 50, y: 20 },
  { x: 100, y: 60 },
  { x: 150, y: 10 },
];

test('curveSegments: one segment per pair, control points do not overshoot neighbours', () => {
  const segs = curveSegments(pts);
  assert.equal(segs.length, 3);
  for (const s of segs) {
    const lo = Math.min(s.p0.y, s.p1.y) - 1e-9;
    const hi = Math.max(s.p0.y, s.p1.y) + 1e-9;
    // Хотя бы одна контрольная точка лежит в диапазоне концов сегмента.
    assert.ok((s.c1.y >= lo && s.c1.y <= hi) || (s.c2.y >= lo && s.c2.y <= hi));
  }
});

test('curvePath / linePath produce valid SVG commands and respect gaps', () => {
  const d = curvePath(pts);
  assert.match(d, /^M0 100C/);
  assert.equal((d.match(/C/g) || []).length, 3);

  const gapped = [pts[0], pts[1], null, pts[2], pts[3]];
  assert.equal((curvePath(gapped).match(/M/g) || []).length, 2);
  assert.equal(linePath(gapped), 'M0 100L50 20M100 60L150 10');
  assert.equal(splitRuns(gapped).length, 2);
});

test('samplePolylines and distanceToPolyline', () => {
  const [poly] = samplePolylines(pts, true, 4);
  assert.equal(poly.length, 1 + 3 * 4);
  assert.deepEqual(poly[0], pts[0]);
  assert.deepEqual(poly[poly.length - 1], pts[3]);

  const straight = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  assert.equal(distanceToPolyline(5, 3, straight), 3);
  assert.equal(distanceToPolyline(-4, 0, straight), 4);
});

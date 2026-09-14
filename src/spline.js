/**
 * Построение путей: ломаная и сглаженная кривая.
 * Сглаживание повторяет алгоритм Highcharts (getPointSpline):
 * контрольные точки лежат на прямой через точку, а их Y зажат между
 * соседними точками, чтобы кривая не «выстреливала» за пределы данных.
 */

/**
 * @typedef {{x:number, y:number}} Pt
 * @typedef {{p0:Pt, c1:Pt, c2:Pt, p1:Pt}} Segment  кубический сегмент Безье
 */

/**
 * Разбивает массив точек (с null-разрывами) на непрерывные участки.
 * @param {(Pt|null)[]} points
 * @returns {Pt[][]}
 */
export function splitRuns(points) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * Сегменты Безье сглаженной кривой через точки одного участка.
 * @param {Pt[]} pts
 * @returns {Segment[]}
 */
export function curveSegments(pts) {
  const smoothing = 1.5;
  const denom = smoothing + 1;
  const segments = [];
  let prevRight = null;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const last = pts[i - 1];
    const next = pts[i + 1];
    let leftX, leftY, rightX, rightY;

    if (last && next) {
      leftX = (smoothing * p.x + last.x) / denom;
      leftY = (smoothing * p.y + last.y) / denom;
      rightX = (smoothing * p.x + next.x) / denom;
      rightY = (smoothing * p.y + next.y) / denom;

      // Контрольные точки — на одной прямой через саму точку.
      let correction = 0;
      if (rightX !== leftX) {
        correction = ((rightY - leftY) * (rightX - p.x)) / (rightX - leftX) + p.y - rightY;
      }
      leftY += correction;
      rightY += correction;

      // Не даём кривой выходить за пределы соседних значений.
      if (leftY > last.y && leftY > p.y) {
        leftY = Math.max(last.y, p.y);
        rightY = 2 * p.y - leftY;
      } else if (leftY < last.y && leftY < p.y) {
        leftY = Math.min(last.y, p.y);
        rightY = 2 * p.y - leftY;
      }
      if (rightY > next.y && rightY > p.y) {
        rightY = Math.max(next.y, p.y);
        leftY = 2 * p.y - rightY;
      } else if (rightY < next.y && rightY < p.y) {
        rightY = Math.min(next.y, p.y);
        leftY = 2 * p.y - rightY;
      }
    }

    if (last) {
      segments.push({
        p0: last,
        c1: prevRight || { x: last.x, y: last.y },
        c2: leftX !== undefined ? { x: leftX, y: leftY } : { x: p.x, y: p.y },
        p1: p,
      });
    }
    prevRight = rightX !== undefined ? { x: rightX, y: rightY } : null;
  }
  return segments;
}

const f = (n) => Math.round(n * 100) / 100;

/**
 * SVG path (d) для сглаженной кривой по точкам с разрывами.
 * @param {(Pt|null)[]} points
 */
export function curvePath(points) {
  let d = '';
  for (const run of splitRuns(points)) {
    d += `M${f(run[0].x)} ${f(run[0].y)}`;
    for (const s of curveSegments(run)) {
      d += `C${f(s.c1.x)} ${f(s.c1.y)} ${f(s.c2.x)} ${f(s.c2.y)} ${f(s.p1.x)} ${f(s.p1.y)}`;
    }
  }
  return d;
}

/**
 * SVG path (d) для ломаной по точкам с разрывами.
 * @param {(Pt|null)[]} points
 */
export function linePath(points) {
  let d = '';
  for (const run of splitRuns(points)) {
    run.forEach((p, i) => {
      d += `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`;
    });
  }
  return d;
}

/**
 * Точки вдоль кривой (для хит-теста курсора).
 * @param {(Pt|null)[]} points
 * @param {boolean} smooth
 * @param {number} [steps=8]  число отрезков на сегмент
 * @returns {Pt[][]}  ломаные по участкам
 */
export function samplePolylines(points, smooth, steps = 8) {
  return splitRuns(points).map((run) => {
    if (!smooth || run.length < 2) return run.slice();
    const out = [run[0]];
    for (const s of curveSegments(run)) {
      for (let k = 1; k <= steps; k++) {
        const t = k / steps;
        const mt = 1 - t;
        out.push({
          x: mt * mt * mt * s.p0.x + 3 * mt * mt * t * s.c1.x + 3 * mt * t * t * s.c2.x + t * t * t * s.p1.x,
          y: mt * mt * mt * s.p0.y + 3 * mt * mt * t * s.c1.y + 3 * mt * t * t * s.c2.y + t * t * t * s.p1.y,
        });
      }
    }
    return out;
  });
}

/**
 * Расстояние от точки до ломаной.
 * @param {number} x
 * @param {number} y
 * @param {Pt[]} poly
 */
export function distanceToPolyline(x, y, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    if (!b) {
      best = Math.min(best, Math.hypot(x - a.x, y - a.y));
      continue;
    }
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((x - a.x) * dx + (y - a.y) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy)));
  }
  return best;
}

/**
 * mixed-timeseries-chart
 * График из нескольких time-series: area / bar / spline / line в одной
 * области, общий тултип по ближайшей дате, подсветка точек при наведении.
 * Без зависимостей, рендер в SVG.
 */
import { computeExtremes } from './scale.js';
import { curvePath, linePath, samplePolylines, distanceToPolyline, splitRuns } from './spline.js';
import { formatDate, formatNumber, escapeHtml } from './format.js';
import { Tooltip } from './tooltip.js';
import { ensureStyles } from './styles.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

/** Палитра по умолчанию — цвета из референса. */
export const DEFAULT_COLORS = ['#fcf792', '#3670fc', '#0b8400', '#b500fe'];

export const DEFAULT_OPTIONS = {
  /** Отступ от краёв контейнера до области построения. */
  spacing: 10,
  backgroundColor: 'transparent',
  plotBorderWidth: 1,
  plotBorderColor: '#cccccc',
  /** Желаемое расстояние между делениями скрытой оси Y (px). */
  tickPixelInterval: 72,
  xAxis: {
    /** 'datetime' | 'category' | 'linear' */
    type: 'datetime',
    dateFormat: 'dd.mm.yyyy',
    useUTC: true,
    /** Категории для type: 'category' (или когда data — просто числа). */
    categories: null,
  },
  tooltip: {
    enabled: true,
    /** Отступ бокса от якоря. */
    distance: 16,
    /** Задержка скрытия после ухода курсора (мс). */
    hideDelay: 500,
    /** Радиус «захвата» линии курсором (px). */
    snap: 10,
    /** (xLabel, points, chart) => string — свой заголовок. */
    headerFormatter: null,
    /** (points, xLabel, chart) => string — полностью своя разметка. */
    formatter: null,
  },
  halo: { size: 10, opacity: 0.25 },
  bar: {
    width: 16,
    /** Ширина столбца не больше такой доли слота. */
    maxWidthRatio: 0.6,
    borderWidth: 1,
    borderColor: '#ffffff',
    borderRadius: 3,
    /** Насколько светлеет столбец при наведении (0..1). */
    hoverBrightness: 0.1,
  },
  hover: {
    /** На сколько утолщается линия серии при наведении. */
    lineWidthPlus: 1,
  },
  colors: DEFAULT_COLORS,
  series: [],
};

const TYPE_DEFAULTS = {
  area: {
    lineWidth: 1,
    fillOpacity: 0.5,
    smooth: true,
    marker: { enabled: false, symbol: 'circle', radius: 3, hoverRadius: 2 },
  },
  spline: {
    lineWidth: 2,
    marker: { enabled: false, symbol: 'diamond', radius: 3, hoverRadius: 2 },
  },
  line: {
    lineWidth: 1,
    marker: { enabled: true, symbol: 'square', radius: 3, hoverRadius: 2.5 },
  },
  bar: {},
};

const SYMBOLS = {
  circle: (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`,
  square: (x, y, r) => `M${x - r} ${y - r}h${2 * r}v${2 * r}h${-2 * r}Z`,
  diamond: (x, y, r) => `M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`,
  triangle: (x, y, r) => `M${x} ${y - r}L${x + r} ${y + r}L${x - r} ${y + r}Z`,
  'triangle-down': (x, y, r) => `M${x - r} ${y - r}L${x + r} ${y - r}L${x} ${y + r}Z`,
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

/** Неглубокий merge с одним уровнем вложенности для объектов настроек. */
function mergeOptions(base, extra) {
  const out = { ...base };
  if (!extra) return out;
  for (const key of Object.keys(extra)) {
    const v = extra[key];
    if (v === undefined) continue;
    out[key] = isObj(v) && isObj(base[key]) ? { ...base[key], ...v } : v;
  }
  return out;
}

function svgEl(tag, attrs = {}, parent) {
  const el = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) {
    if (attrs[k] != null) el.setAttribute(k, attrs[k]);
  }
  if (parent) parent.appendChild(el);
  return el;
}

/** Осветляет цвет (#rgb / #rrggbb / rgb()) на amount (0..1). */
export function brighten(color, amount) {
  let r, g, b;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
    if (!m) return color;
    [r, g, b] = [m[1], m[2], m[3]].map(Number);
  }
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function parseX(raw, type) {
  if (raw == null) return null;
  if (type === 'category') return String(raw);
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    if (type === 'datetime') {
      const t = Date.parse(raw);
      if (!Number.isNaN(t)) return t;
    }
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  }
  return raw;
}

/**
 * Приводит data серии к массиву {x, y}.
 * Поддерживаются форматы: [y, y, ...], [[x, y], ...], [{x, y}, ...].
 */
export function parsePoints(data, xAxis) {
  const categories = xAxis.categories;
  const type = categories ? 'category' : xAxis.type;
  return (data || []).map((d, i) => {
    let x;
    let y;
    if (Array.isArray(d)) [x, y] = d;
    else if (isObj(d)) ({ x, y } = d);
    else {
      x = categories ? categories[i] : i;
      y = d;
    }
    y = y == null || y === '' ? null : Number(y);
    if (Number.isNaN(y)) y = null;
    return { x: parseX(x, type), y };
  });
}

export class MixedChart {
  /**
   * @param {HTMLElement|string} container  элемент или CSS-селектор
   * @param {object} options  см. DEFAULT_OPTIONS и README
   */
  constructor(container, options = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) throw new Error('mixed-timeseries-chart: container not found');
    ensureStyles(el.ownerDocument);

    this.container = el;
    this.id = `mtc-${++uid}`;
    this.options = mergeOptions(DEFAULT_OPTIONS, options);
    this.options.series = options.series || [];

    el.classList.add('mtc-container');
    this.svg = svgEl('svg', { class: 'mtc-svg' }, el);
    this.tooltip = new Tooltip(el, this.options.tooltip);

    this.hoverIndex = null;
    this.hoverSeries = null;
    this.hoverPoint = null;
    this.sessionEnded = false;

    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerLeave = this.onPointerLeave.bind(this);
    this.onDocumentPointerMove = this.onDocumentPointerMove.bind(this);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerdown', this.onPointerMove);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.ownerDocument.addEventListener('pointermove', this.onDocumentPointerMove, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleRender());
      this.ro.observe(el);
    }
    this.render();
  }

  /** Перерисовать не чаще раза за кадр (resize). */
  scheduleRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = null;
      this.render();
    });
  }

  /**
   * Обновляет настройки/данные и перерисовывает.
   * @param {object} options  частичные настройки; series заменяются целиком
   */
  update(options = {}) {
    const series = options.series;
    this.options = mergeOptions(this.options, options);
    if (series) this.options.series = series;
    this.render();
  }

  /** Заменить данные одной серии. */
  setSeriesData(index, data) {
    const series = this.options.series.slice();
    series[index] = { ...series[index], data };
    this.update({ series });
  }

  /** Полное перестроение. */
  render() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.buildModel();
    this.draw();
    // Восстановить hover после перерисовки.
    if (this.hoverIndex != null) this.applyHoverIndex(this.hoverIndex);
    if (this.hoverSeries != null) this.applySeriesState(this.hoverSeries, true);
  }

  // ---------------------------------------------------------------- модель

  buildModel() {
    const o = this.options;
    const spacing = o.spacing;
    this.plotLeft = spacing;
    this.plotTop = spacing;
    this.plotWidth = Math.max(0, this.width - 2 * spacing);
    this.plotHeight = Math.max(0, this.height - 2 * spacing);
    this.plotBottom = this.plotTop + this.plotHeight;

    // Серии
    this.series = o.series.map((s, i) => {
      const type = TYPE_DEFAULTS[s.type] ? s.type : 'line';
      const defaults = TYPE_DEFAULTS[type];
      const marker = { ...(defaults.marker || {}), ...(s.marker || {}) };
      return {
        index: i,
        id: s.id != null ? String(s.id) : `s${i}`,
        name: s.name != null ? String(s.name) : `Series ${i + 1}`,
        type,
        color: s.color || o.colors[i % o.colors.length],
        lineWidth: s.lineWidth ?? defaults.lineWidth,
        fillOpacity: s.fillOpacity ?? defaults.fillOpacity,
        smooth: s.smooth ?? defaults.smooth,
        marker,
        visible: s.visible !== false,
        yAxis: s.yAxis != null ? String(s.yAxis) : null,
        valueDecimals: s.valueDecimals,
        valuePrefix: s.valuePrefix || '',
        valueSuffix: s.valueSuffix || '',
        raw: parsePoints(s.data, o.xAxis),
        points: [],
        polylines: [],
        nodes: {},
      };
    });

    // Ось X: объединение всех x
    const isCategory = !!o.xAxis.categories || o.xAxis.type === 'category';
    const keys = [];
    const seen = new Map();
    if (o.xAxis.categories) o.xAxis.categories.forEach((c) => seen.set(String(c), keys.push(String(c)) - 1));
    for (const s of this.series) {
      for (const p of s.raw) {
        if (p.x == null || seen.has(p.x)) continue;
        seen.set(p.x, keys.push(p.x) - 1);
      }
    }
    if (!isCategory) keys.sort((a, b) => a - b);
    const slot = new Map(keys.map((k, i) => [k, i]));
    this.xs = keys;

    const n = keys.length;
    let closest = 1;
    if (!isCategory && n > 1) {
      closest = Infinity;
      for (let i = 1; i < n; i++) closest = Math.min(closest, keys[i] - keys[i - 1] || Infinity);
      if (!Number.isFinite(closest)) closest = 1;
    }
    let xMin;
    let xRange;
    if (isCategory || n <= 1) {
      xMin = -0.5;
      xRange = Math.max(n, 1);
    } else {
      xMin = keys[0] - closest / 2;
      xRange = keys[n - 1] + closest / 2 - xMin;
    }
    const toPx = (v) => this.plotLeft + ((v - xMin) / xRange) * this.plotWidth;
    this.xPositions = keys.map((k, i) => toPx(isCategory || n <= 1 ? i : k));
    this.slotWidth = (isCategory || n <= 1 ? 1 : closest) / xRange * this.plotWidth;

    // Оси Y: по одной на серию, если не задан общий yAxis
    const axes = new Map();
    for (const s of this.series) {
      const axisId = s.yAxis || `auto-${s.index}`;
      if (!axes.has(axisId)) axes.set(axisId, { id: axisId, series: [], dataMin: Infinity, dataMax: -Infinity });
      const ax = axes.get(axisId);
      ax.series.push(s);
      for (const p of s.raw) {
        if (p.y == null) continue;
        ax.dataMin = Math.min(ax.dataMin, p.y);
        ax.dataMax = Math.max(ax.dataMax, p.y);
      }
      s.axis = ax;
    }
    const tickAmount = Math.max(2, Math.ceil(this.plotHeight / o.tickPixelInterval) + 1);
    for (const ax of axes.values()) {
      const ext = computeExtremes({
        dataMin: Number.isFinite(ax.dataMin) ? ax.dataMin : 0,
        dataMax: Number.isFinite(ax.dataMax) ? ax.dataMax : 0,
        threshold: 0,
        tickAmount,
      });
      ax.min = ext.min;
      ax.max = ext.max;
      ax.toPx = (v) => this.plotBottom - ((v - ax.min) / (ax.max - ax.min || 1)) * this.plotHeight;
      ax.zero = Math.max(this.plotTop, Math.min(this.plotBottom, ax.toPx(0)));
    }
    this.axes = axes;

    // Экранные координаты точек по слотам
    for (const s of this.series) {
      const pts = new Array(n).fill(null);
      for (const p of s.raw) {
        if (p.x == null || p.y == null) continue;
        const i = slot.get(p.x);
        pts[i] = { x: this.xPositions[i], y: s.axis.toPx(p.y), value: p.y, index: i };
      }
      s.points = pts;
      s.polylines = s.type === 'bar' ? [] : samplePolylines(pts, s.type === 'spline' || (s.type === 'area' && s.smooth));
    }
  }

  // ---------------------------------------------------------------- рендер

  draw() {
    const o = this.options;
    const svg = this.svg;
    svg.setAttribute('width', this.width);
    svg.setAttribute('height', this.height);
    svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
    svg.innerHTML = '';

    const defs = svgEl('defs', {}, svg);
    const clipId = `${this.id}-clip`;
    const clip = svgEl('clipPath', { id: clipId }, defs);
    svgEl('rect', { x: this.plotLeft, y: this.plotTop, width: this.plotWidth, height: this.plotHeight }, clip);

    if (o.backgroundColor && o.backgroundColor !== 'transparent') {
      svgEl('rect', { x: 0, y: 0, width: this.width, height: this.height, fill: o.backgroundColor }, svg);
    }
    if (o.plotBorderWidth > 0 && this.plotWidth > 1 && this.plotHeight > 1) {
      const bw = o.plotBorderWidth;
      const half = (bw % 2) / 2;
      svgEl('rect', {
        x: Math.floor(this.plotLeft) + half,
        y: Math.floor(this.plotTop) + half,
        width: Math.floor(this.plotWidth) - 2 * half,
        height: Math.floor(this.plotHeight) - 2 * half,
        fill: 'none',
        stroke: o.plotBorderColor,
        'stroke-width': bw,
      }, svg);
    }

    for (const s of this.series) {
      if (!s.visible) continue;
      const g = svgEl('g', { class: `mtc-series mtc-series-${s.type}`, 'data-series': s.index }, svg);
      s.nodes = { group: g, markers: [], bars: [] };
      if (s.type === 'bar') this.drawBars(s, g);
      else this.drawLineLike(s, g, clipId);
      this.drawHoverLayer(s, g);
    }
  }

  drawLineLike(s, g, clipId) {
    const pts = s.points;
    const smooth = s.type === 'spline' || (s.type === 'area' && s.smooth);
    const d = smooth ? curvePath(pts) : linePath(pts);
    const clipped = svgEl('g', { 'clip-path': `url(#${clipId})` }, g);

    if (s.type === 'area') {
      let fill = '';
      for (const run of splitRuns(pts)) {
        const top = smooth ? curvePath(run) : linePath(run);
        const zero = s.axis.zero;
        fill += `${top}L${run[run.length - 1].x} ${zero}L${run[0].x} ${zero}Z`;
      }
      s.nodes.fill = svgEl('path', {
        class: 'mtc-area-fill',
        d: fill,
        fill: s.color,
        'fill-opacity': s.fillOpacity,
      }, clipped);
    }

    s.nodes.graph = svgEl('path', {
      class: 'mtc-graph',
      d,
      stroke: s.color,
      'stroke-width': s.lineWidth,
    }, clipped);
    s.nodes.graph.style.strokeWidth = `${s.lineWidth}px`;

    if (s.marker.enabled) {
      const mg = svgEl('g', { class: 'mtc-markers' }, g);
      const symbol = SYMBOLS[s.marker.symbol] || SYMBOLS.circle;
      pts.forEach((p, i) => {
        if (!p) return;
        s.nodes.markers[i] = svgEl('path', {
          class: 'mtc-marker',
          d: symbol(p.x, p.y, s.marker.radius),
          fill: s.color,
        }, mg);
      });
    }
  }

  drawBars(s, g) {
    const o = this.options.bar;
    const w = Math.max(1, Math.round(Math.min(o.width, this.slotWidth * o.maxWidthRatio)));
    const bw = o.borderWidth;
    const crisp = bw % 2 ? 0.5 : 0;
    const bottom = Math.round(s.axis.zero) + crisp;
    s.points.forEach((p, i) => {
      if (!p) return;
      const top = Math.round(p.y) + crisp;
      const y = Math.min(top, bottom);
      // С обводкой минимум 2px, чтобы 1px заливки оставался виден.
      const h = Math.max(bw ? 2 : 1, Math.abs(bottom - top));
      const x = Math.round(p.x - w / 2) - crisp;
      s.nodes.bars[i] = svgEl('rect', {
        class: 'mtc-bar',
        x,
        y,
        width: w,
        height: h,
        rx: o.borderRadius,
        ry: o.borderRadius,
        fill: s.color,
        stroke: bw ? o.borderColor : null,
        'stroke-width': bw || null,
      }, g);
    });
  }

  drawHoverLayer(s, g) {
    const halo = this.options.halo;
    if (s.type !== 'bar') {
      s.nodes.halo = svgEl('circle', {
        class: 'mtc-halo',
        r: halo.size,
        fill: s.color,
        'fill-opacity': halo.opacity,
        visibility: 'hidden',
      }, g);
      s.nodes.hoverMarker = svgEl('path', {
        class: 'mtc-marker mtc-hover-marker',
        fill: s.color,
        stroke: '#ffffff',
        'stroke-width': 1,
        visibility: 'hidden',
      }, g);
    }
  }

  // ------------------------------------------------------------- интерактив

  /** Позиция курсора относительно контейнера. */
  pointerPos(e) {
    const r = this.container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  isInsidePlot(x, y) {
    return x >= this.plotLeft && x <= this.plotLeft + this.plotWidth && y >= this.plotTop && y <= this.plotBottom;
  }

  /** Серия, чей «трекер» (линия или столбец) находится под курсором. */
  findTracker(x, y) {
    const snap = this.options.tooltip.snap;
    for (let i = this.series.length - 1; i >= 0; i--) {
      const s = this.series[i];
      if (!s.visible) continue;
      if (s.type === 'bar') {
        for (const rect of s.nodes.bars) {
          if (!rect) continue;
          const bx = +rect.getAttribute('x');
          const by = +rect.getAttribute('y');
          const bw = +rect.getAttribute('width');
          const bh = +rect.getAttribute('height');
          if (x >= bx - 1 && x <= bx + bw + 1 && y >= by - 1 && y <= by + bh + 1) return s;
        }
      } else {
        const limit = snap + s.lineWidth / 2;
        for (const poly of s.polylines) {
          if (distanceToPolyline(x, y, poly) <= limit) return s;
        }
      }
    }
    return null;
  }

  /** Индекс ближайшего по X слота, в котором есть хотя бы одна точка. */
  nearestIndex(x) {
    let best = null;
    let bestDist = Infinity;
    this.xPositions.forEach((px, i) => {
      if (!this.series.some((s) => s.visible && s.points[i])) return;
      const d = Math.abs(px - x);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  onPointerMove(e) {
    if (!this.options.tooltip.enabled || !this.series.length) return;
    const { x, y } = this.pointerPos(e);
    const tracker = this.findTracker(x, y);
    if (!tracker && !this.isInsidePlot(x, y)) return;
    this.runPointActions(x, y, tracker);
  }

  runPointActions(x, y, tracker) {
    const index = this.nearestIndex(x);
    if (index == null) return;

    // Новая сессия наведения: сбрасываем «липкое» выделение серии.
    if (this.sessionEnded) {
      this.sessionEnded = false;
      if (this.hoverSeries) this.setHoverSeries(null);
    }
    if (tracker && tracker !== this.hoverSeries) this.setHoverSeries(tracker);

    // Ближайшая к курсору точка среди линий (столбцы — только по прямому попаданию).
    let closest = null;
    let closestDist = Infinity;
    for (const s of this.series) {
      const p = s.visible && s.points[index];
      if (!p || (s.type === 'bar' && tracker !== s)) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < closestDist) {
        closestDist = d;
        closest = p;
      }
    }
    if (!closest) {
      const s = this.series.find((ser) => ser.visible && ser.points[index]);
      closest = s && s.points[index];
    }

    const indexChanged = index !== this.hoverIndex;
    if (indexChanged) this.applyHoverIndex(index);

    if (indexChanged || closest !== this.hoverPoint || this.tooltip.isHidden) {
      this.hoverPoint = closest;
      this.tooltip.setContent(this.tooltipHtml(index));
      this.tooltip.moveTo(this.xPositions[index], y, this.width, this.height);
    }
  }

  /** Страховка на случай, если pointerleave не пришёл (синтетические события, touch). */
  onDocumentPointerMove(e) {
    if (this.hoverIndex == null) return;
    const { x, y } = this.pointerPos(e);
    if (x < 0 || y < 0 || x > this.width || y > this.height) this.onPointerLeave();
  }

  onPointerLeave() {
    if (this.sessionEnded && this.hoverIndex == null) return;
    this.sessionEnded = true;
    if (this.hoverIndex != null) this.clearHoverIndex();
    this.hoverPoint = null;
    this.tooltip.hide();
  }

  /** Утолщает линию выбранной серии (и снимает выделение с предыдущей). */
  setHoverSeries(s) {
    if (this.hoverSeries && this.hoverSeries !== s) this.applySeriesState(this.hoverSeries, false);
    this.hoverSeries = s;
    if (s) this.applySeriesState(s, true);
  }

  applySeriesState(s, hover) {
    const graph = s.nodes && s.nodes.graph;
    if (!graph) return;
    const w = hover ? s.lineWidth + this.options.hover.lineWidthPlus : s.lineWidth;
    graph.style.strokeWidth = `${w}px`;
  }

  /** Подсветка точек всех серий в слоте index: гало, маркеры, столбец. */
  applyHoverIndex(index) {
    if (this.hoverIndex != null && this.hoverIndex !== index) this.clearHoverIndex();
    this.hoverIndex = index;
    for (const s of this.series) {
      const p = s.visible && s.points[index];
      const n = s.nodes;
      if (!p || !n.group) continue;
      if (s.type === 'bar') {
        const bar = n.bars[index];
        if (bar) bar.setAttribute('fill', brighten(s.color, this.options.bar.hoverBrightness));
        continue;
      }
      n.halo.setAttribute('visibility', 'visible');
      n.halo.style.transform = `translate(${p.x}px, ${p.y}px)`;
      const symbol = SYMBOLS[s.marker.symbol] || SYMBOLS.circle;
      const marker = n.markers[index];
      if (marker) {
        marker.setAttribute('d', symbol(p.x, p.y, s.marker.hoverRadius));
        marker.setAttribute('stroke', '#ffffff');
        marker.setAttribute('stroke-width', 1);
      } else {
        n.hoverMarker.setAttribute('d', symbol(p.x, p.y, s.marker.hoverRadius));
        n.hoverMarker.setAttribute('visibility', 'visible');
      }
    }
  }

  clearHoverIndex() {
    const index = this.hoverIndex;
    this.hoverIndex = null;
    if (index == null) return;
    for (const s of this.series) {
      const n = s.nodes;
      const p = s.points[index];
      if (!p || !n.group) continue;
      if (s.type === 'bar') {
        const bar = n.bars[index];
        if (bar) bar.setAttribute('fill', s.color);
        continue;
      }
      n.halo.setAttribute('visibility', 'hidden');
      n.hoverMarker.setAttribute('visibility', 'hidden');
      const marker = n.markers[index];
      if (marker) {
        const symbol = SYMBOLS[s.marker.symbol] || SYMBOLS.circle;
        marker.setAttribute('d', symbol(p.x, p.y, s.marker.radius));
        marker.removeAttribute('stroke');
        marker.removeAttribute('stroke-width');
      }
    }
  }

  // ------------------------------------------------------------------ тултип

  /** Подпись значения X (дата/категория) для слота. */
  xLabel(index) {
    const key = this.xs[index];
    const ax = this.options.xAxis;
    if (ax.categories || ax.type === 'category' || typeof key !== 'number') return String(key);
    if (ax.type === 'datetime') return formatDate(key, ax.dateFormat, ax.useUTC);
    return formatNumber(key);
  }

  /** Точки всех серий в слоте (для formatter'ов и внешнего кода). */
  pointsAt(index) {
    return this.series
      .filter((s) => s.visible && s.points[index])
      .map((s) => ({
        series: { name: s.name, color: s.color, type: s.type, index: s.index, id: s.id },
        x: this.xs[index],
        y: s.points[index].value,
        formatted: s.valuePrefix + formatNumber(s.points[index].value, s.valueDecimals) + s.valueSuffix,
      }));
  }

  tooltipHtml(index) {
    const t = this.options.tooltip;
    const label = this.xLabel(index);
    const points = this.pointsAt(index);
    if (typeof t.formatter === 'function') return t.formatter(points, label, this);
    const header = typeof t.headerFormatter === 'function' ? t.headerFormatter(label, points, this) : escapeHtml(label);
    const rows = points
      .map((p) => `<div class="mtc-tooltip-row"><span class="mtc-tooltip-dot" style="background:${p.series.color}"></span>${escapeHtml(p.series.name)}: <b>${escapeHtml(p.formatted)}</b></div>`)
      .join('');
    return `<div class="mtc-tooltip-header">${header}</div>${rows}`;
  }

  // ------------------------------------------------------------------ прочее

  destroy() {
    if (this.ro) this.ro.disconnect();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerdown', this.onPointerMove);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    this.container.ownerDocument.removeEventListener('pointermove', this.onDocumentPointerMove);
    this.tooltip.destroy();
    this.svg.remove();
    this.container.classList.remove('mtc-container');
  }
}

/**
 * Создаёт график.
 * @param {HTMLElement|string} container
 * @param {object} options
 * @returns {MixedChart}
 */
export function createChart(container, options) {
  return new MixedChart(container, options);
}

export default createChart;

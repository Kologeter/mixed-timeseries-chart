import { createChart } from '../src/chart.js';

// Четыре time-series из референса. Формат точки: [дата, значение].
const dates = ['2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];
const zip = (values) => values.map((v, i) => [dates[i], v]);

export const series = [
  {
    name: 'Cost',
    type: 'area',
    color: '#fcf792',
    yAxis: 'money',          // общая ось с CPA (как в референсе)
    valueDecimals: 2,
    data: zip([2.04, 25.85, 44.36, 55.65, 63.75]),
  },
  {
    name: 'CPA',
    type: 'bar',
    color: '#3670fc',
    yAxis: 'money',
    valueDecimals: 2,
    data: zip([0.68, 0.86, 1.23, 0.79, 0.71]),
  },
  {
    name: 'ROI confirmed',
    type: 'spline',
    color: '#0b8400',
    valueDecimals: 2,
    data: zip([610.78, 180.5, 161.47, 56.33, 357.25]),
  },
  {
    name: 'Conversions',
    type: 'line',
    color: '#b500fe',
    valueDecimals: 0,
    data: zip([3, 30, 36, 70, 90]),
  },
];

const chart = createChart('#chart', { series });
const wide = createChart('#chart-wide', { series });

// Для отладки из консоли
window.charts = { chart, wide };

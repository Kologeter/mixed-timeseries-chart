/**
 * Форматирование дат и чисел для подписей тултипа.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Форматирует дату по шаблону. Поддерживаются токены:
 * dd, mm, yyyy, yy, HH, MM, SS.
 *
 * @param {number|Date|string} value  timestamp (мс), Date или ISO-строка
 * @param {string} [pattern='dd.mm.yyyy']
 * @param {boolean} [useUTC=true]  брать компоненты даты в UTC
 * @returns {string}
 */
export function formatDate(value, pattern = 'dd.mm.yyyy', useUTC = true) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const get = (local, utc) => (useUTC ? d[utc]() : d[local]());
  const parts = {
    yyyy: String(get('getFullYear', 'getUTCFullYear')),
    yy: String(get('getFullYear', 'getUTCFullYear')).slice(-2),
    mm: pad2(get('getMonth', 'getUTCMonth') + 1),
    dd: pad2(get('getDate', 'getUTCDate')),
    HH: pad2(get('getHours', 'getUTCHours')),
    MM: pad2(get('getMinutes', 'getUTCMinutes')),
    SS: pad2(get('getSeconds', 'getUTCSeconds')),
  };
  return pattern.replace(/yyyy|yy|mm|dd|HH|MM|SS/g, (t) => parts[t]);
}

/**
 * Форматирует число: с фиксированным числом знаков (valueDecimals)
 * или «как есть» без плавающего мусора (0.1 + 0.2 -> 0.3).
 *
 * @param {number} value
 * @param {number} [decimals]
 * @returns {string}
 */
export function formatNumber(value, decimals) {
  if (value == null || Number.isNaN(value)) return '';
  if (typeof decimals === 'number') return Number(value).toFixed(decimals);
  return String(correctFloat(value));
}

/** Убирает артефакты плавающей точки (как Highcharts.correctFloat). */
export function correctFloat(num, precision = 14) {
  return parseFloat(Number(num).toPrecision(precision));
}

/** Экранирует HTML в пользовательских строках (имена серий, категории). */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

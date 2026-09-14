/**
 * Расчёт пределов скрытой оси Y. Алгоритм повторяет поведение Highcharts
 * для нескольких выровненных осей (alignTicks): ось растягивается до
 * «красивых» делений так, чтобы у всех осей было одинаковое число тиков.
 */
import { correctFloat } from './format.js';

/**
 * Нормализует шаг делений к «красивому» значению.
 * При hasTickAmount выбирается наименьший множитель из
 * [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] * 10^k, который >= interval.
 *
 * @param {number} interval
 * @param {boolean} [hasTickAmount=true]
 * @returns {number}
 */
export function normalizeTickInterval(interval, hasTickAmount = true) {
  if (!(interval > 0) || !Number.isFinite(interval)) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(interval)));
  const multiples = hasTickAmount
    ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
    : [1, 2, 2.5, 5, 10];
  const normalized = interval / magnitude;
  let ret = multiples[multiples.length - 1];
  for (let i = 0; i < multiples.length; i++) {
    ret = multiples[i];
    const next = multiples[i + 1] ?? multiples[i];
    if (hasTickAmount ? ret * magnitude >= interval : normalized <= (ret + next) / 2) break;
  }
  return correctFloat(ret * magnitude);
}

/**
 * Считает min/max оси по данным.
 *
 * @param {object} p
 * @param {number} p.dataMin
 * @param {number} p.dataMax
 * @param {number|null} [p.threshold=0]  «нулевая плоскость»; null — не учитывать
 * @param {number} [p.minPadding=0.05]
 * @param {number} [p.maxPadding=0.05]
 * @param {number} [p.tickAmount=4]  желаемое число делений (включая крайние)
 * @returns {{min:number, max:number, tickInterval:number}}
 */
export function computeExtremes({
  dataMin,
  dataMax,
  threshold = 0,
  minPadding = 0.05,
  maxPadding = 0.05,
  tickAmount = 4,
}) {
  let min = Number.isFinite(dataMin) ? dataMin : 0;
  let max = Number.isFinite(dataMax) ? dataMax : 0;
  if (min > max) [min, max] = [max, min];

  // Ось не пересекает threshold, если данные лежат по одну сторону от него.
  let thresholdMin = null;
  if (typeof threshold === 'number') {
    if (min >= threshold) {
      thresholdMin = threshold;
      min = threshold;
      minPadding = 0;
    } else if (max <= threshold) {
      max = threshold;
      maxPadding = 0;
    }
  }

  if (max === min) {
    if (max === 0) max = 1;
    else {
      const d = Math.abs(max) * 0.5;
      if (thresholdMin === null) min -= d;
      max += d;
    }
  }

  const length = max - min;
  min -= length * minPadding;
  max += length * maxPadding;

  // Highcharts: при tickAmount < 4 считаем 5 делений и потом прореживаем.
  const amount = tickAmount < 4 ? 5 : tickAmount;
  let tickInterval = normalizeTickInterval((max - min) / Math.max(amount - 1, 1), true);

  const snap = (interval) => {
    const tickMin = correctFloat(Math.floor(min / interval) * interval);
    const tickMax = correctFloat(Math.ceil(max / interval) * interval);
    const count = Math.round((tickMax - tickMin) / interval) + 1;
    return { tickMin, tickMax, count };
  };

  let { tickMin, tickMax, count } = snap(tickInterval);
  if (count > amount) {
    // Слишком много делений: удваиваем шаг.
    tickInterval = correctFloat(tickInterval * 2);
    ({ tickMin, tickMax, count } = snap(tickInterval));
  } else if (count < amount) {
    // Слишком мало: наращиваем ось до нужного числа делений.
    while (count < amount) {
      if (count % 2 || tickMin === thresholdMin) tickMax = correctFloat(tickMax + tickInterval);
      else tickMin = correctFloat(tickMin - tickInterval);
      count++;
    }
  }

  return { min: tickMin, max: tickMax, tickInterval };
}

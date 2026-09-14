import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatNumber, escapeHtml } from '../src/format.js';

test('formatDate: dd.mm.yyyy in UTC and custom patterns', () => {
  assert.equal(formatDate('2026-06-12'), '12.06.2026');
  assert.equal(formatDate(Date.UTC(2026, 5, 3, 7, 5, 9), 'yyyy-mm-dd HH:MM:SS'), '2026-06-03 07:05:09');
  assert.equal(formatDate(new Date(Date.UTC(2026, 0, 1)), 'dd/mm/yy'), '01/01/26');
  assert.equal(formatDate('not a date'), 'not a date');
});

test('formatNumber: fixed decimals or clean raw value', () => {
  assert.equal(formatNumber(180.5, 2), '180.50');
  assert.equal(formatNumber(36, 0), '36');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
  assert.equal(formatNumber(null), '');
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<b>&"'), '&lt;b&gt;&amp;&quot;');
});

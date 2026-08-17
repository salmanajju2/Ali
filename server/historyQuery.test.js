const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistoryQuery, parseHistoryDate, parseHistoryLimit } = require('./historyQuery');

test('pagination is bounded and uses an extra row to detect more data', () => {
  const result = buildHistoryQuery({ limit: '9999', beforeId: '910' }, 'id');
  assert.equal(result.limit, 100);
  assert.match(result.text, /id < \$1/);
  assert.match(result.text, /LIMIT \$2/);
  assert.deepEqual(result.values, [910, 101]);
});

test('payment method is an exact parameterized history filter', () => {
  const result = buildHistoryQuery({ limit: '50', paymentMethod: 'cash' }, 'id');
  assert.match(result.text, /payment_method = \$1/);
  assert.match(result.text, /LIMIT \$2/);
  assert.deepEqual(result.values, ['cash', 51]);
});

test('filters are parameterized, inclusive by day, and escape LIKE wildcards', () => {
  const result = buildHistoryQuery({
    limit: '50',
    company: 'Ali Enterprises',
    location: 'Delhi',
    type: 'credit',
    recordedBy: 'abdulkadir706065',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-16',
    search: 'A_50%\\',
    beforeId: '5000',
  }, 'id');

  assert.match(result.text, /company = \$1/);
  assert.match(result.text, /location = \$2/);
  assert.match(result.text, /date >= \$5/);
  assert.match(result.text, /date < \$6/);
  assert.match(result.text, /ILIKE \$7 ESCAPE '\\'/);
  assert.match(result.text, /id < \$8/);
  assert.deepEqual(result.values, [
    'Ali Enterprises', 'Delhi', 'credit', 'abdulkadir706065',
    '2026-08-01T00:00:00.000Z', '2026-08-17T00:00:00.000Z',
    '%A\\_50\\%\\\\%', 5000, 51,
  ]);
});

test('invalid date or limit input falls back safely without adding an invalid predicate', () => {
  const result = buildHistoryQuery({ limit: '-4', dateFrom: 'bad-date', dateTo: '2026-99-99' }, 'id');
  assert.equal(parseHistoryLimit('-4'), 50);
  assert.equal(parseHistoryDate('bad-date'), null);
  assert.match(result.text, /ORDER BY transactions\.id DESC/);
  assert.doesNotMatch(result.text, /date >=|date </);
  assert.deepEqual(result.values, [51]);
});

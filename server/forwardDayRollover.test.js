const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  addDays,
  calculateForwardRollover,
  getIstBusinessDate,
  getIstDayBounds,
  isoAtIst,
} = require('./forwardDayRollover');

test('uses India time for the Forward Day business date and exact rollover timestamps', () => {
  assert.equal(getIstBusinessDate(new Date('2026-08-17T18:30:00.000Z')), '2026-08-18');
  assert.equal(isoAtIst('2026-08-17', 23, 59), '2026-08-17T18:29:00.000Z');
  assert.equal(isoAtIst('2026-08-18', 0, 1), '2026-08-17T18:31:00.000Z');
  assert.deepEqual(getIstDayBounds('2026-08-17'), {
    start: '2026-08-16T18:30:00.000Z',
    end: '2026-08-17T18:30:00.000Z',
  });
  assert.equal(addDays('2026-08-17', 1), '2026-08-18');
});

test('combines cash totals from all locations and creates debit then credit for a positive balance', () => {
  const result = calculateForwardRollover([
    { location: 'KXU', type: 'credit', amount: 1_000, breakdown: { 500: 2 } },
    { location: 'DELHI', type: 'debit', amount: 250, breakdown: { 200: 1, 50: 1 } },
  ]);

  assert.deepEqual(result, {
    amount: 750,
    netAmount: 750,
    breakdown: { 200: -1, 500: 2, 50: -1 },
    closingType: 'debit',
    openingType: 'credit',
  });
});

test('preserves accounting correctness by reversing the pair when the combined balance is negative', () => {
  const result = calculateForwardRollover([
    { location: 'KXU', type: 'credit', amount: 100, breakdown: { 100: 1 } },
    { location: 'MUMBAI', type: 'debit', amount: 600, breakdown: { 500: 1, 100: 1 } },
  ]);

  assert.deepEqual(result, {
    amount: 500,
    netAmount: -500,
    breakdown: { 500: 1 },
    closingType: 'credit',
    openingType: 'debit',
  });
});

test('does not create a rollover pair when all locations have a zero combined balance', () => {
  assert.equal(calculateForwardRollover([
    { type: 'credit', amount: 500, breakdown: { 500: 1 } },
    { type: 'debit', amount: 500, breakdown: { 500: 1 } },
  ]), null);
});

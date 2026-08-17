const test = require('node:test');
const assert = require('node:assert/strict');
const { cashLedgerCte, calculateCashClosingBalances } = require('./cashLedgerQuery');

test('cash closing balance includes every cash row, even if denomination breakdown is absent', () => {
  const balances = calculateCashClosingBalances([
    { id: '1', date: '2026-08-17T00:00:00.000Z', paymentMethod: 'cash', type: 'credit', amount: 500, breakdown: {} },
    { id: '2', date: '2026-08-17T00:01:00.000Z', paymentMethod: 'upi', type: 'credit', amount: 800 },
    { id: '3', date: '2026-08-17T00:02:00.000Z', paymentMethod: 'cash', type: 'debit', amount: 125 },
  ]);

  assert.deepEqual(balances, [
    { id: '1', closingBalance: 500 },
    { id: '3', closingBalance: 375 },
  ]);
});

test('cash closing balance uses date then numeric transaction ID as a stable ledger order', () => {
  const balances = calculateCashClosingBalances([
    { id: '12', date: '2026-08-17T00:00:00.000Z', paymentMethod: 'cash', type: 'debit', amount: 40 },
    { id: '9', date: '2026-08-17T00:00:00.000Z', paymentMethod: 'cash', type: 'credit', amount: 100 },
  ]);

  assert.deepEqual(balances, [
    { id: '9', closingBalance: 100 },
    { id: '12', closingBalance: 60 },
  ]);
});

test('server ledger CTE calculates a cumulative cash-only window balance', () => {
  assert.match(cashLedgerCte, /payment_method = 'cash' AND type = 'credit'/);
  assert.match(cashLedgerCte, /payment_method = 'cash' AND type = 'debit'/);
  assert.match(cashLedgerCte, /ORDER BY date ASC, id ASC/);
  assert.match(cashLedgerCte, /cash_closing_balance/);
});

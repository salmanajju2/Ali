import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRecorderScopedCashBalances, isMainCashHistoryTransaction } from './historyBalance.js';

test('Main Cash History excludes company-associated cash debits but keeps standalone cash rows', () => {
  assert.equal(isMainCashHistoryTransaction({ paymentMethod: 'cash', type: 'debit', company: 'SATIN' }), false);
  assert.equal(isMainCashHistoryTransaction({ paymentMethod: 'cash', type: 'debit', company: 'N/A' }), true);
  assert.equal(isMainCashHistoryTransaction({ paymentMethod: 'cash', type: 'credit', company: 'SATIN' }), true);
  assert.equal(isMainCashHistoryTransaction({ paymentMethod: 'upi', type: 'debit', company: 'SATIN' }), false);
});

test('History cash balances remain recorder-scoped and ignore the aggregate server balance', () => {
  const transactions = [
    {
      id: '1',
      date: '2026-08-17T08:00:00.000Z',
      recordedBy: 'ajju@gmail.com',
      type: 'credit',
      amount: 500,
      cashClosingBalance: 500,
    },
    {
      id: '2',
      date: '2026-08-17T08:01:00.000Z',
      recordedBy: 'javed@gmail.com',
      type: 'credit',
      amount: 900,
      cashClosingBalance: 1400,
    },
    {
      id: '3',
      date: '2026-08-17T08:02:00.000Z',
      recordedBy: 'AJJU@GMAIL.COM',
      type: 'debit',
      amount: 200,
      cashClosingBalance: 1200,
    },
    {
      id: '4',
      date: '2026-08-17T08:03:00.000Z',
      recordedBy: 'javed@gmail.com',
      type: 'debit',
      amount: 300,
      cashClosingBalance: 900,
    },
  ];

  const result = applyRecorderScopedCashBalances(transactions);
  const byId = new Map(result.map(transaction => [transaction.id, transaction]));

  assert.deepEqual(result.map(transaction => transaction.id), ['4', '3', '2', '1']);
  assert.equal(byId.get('1').closingBalance, 500);
  assert.equal(byId.get('3').closingBalance, 300);
  assert.equal(byId.get('2').closingBalance, 900);
  assert.equal(byId.get('4').closingBalance, 600);
});

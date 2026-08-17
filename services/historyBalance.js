/**
 * Add a running cash balance to each transaction without ever trusting the
 * database-wide `cashClosingBalance` field. The balance is maintained per
 * recorder, so an administrator looking at several employees still sees each
 * employee's own cash ledger rather than a combined all-user total.
 */
export function isMainCashHistoryTransaction(transaction) {
  if (transaction.paymentMethod !== 'cash') return false;

  const company = String(transaction.company || '').trim().toUpperCase();
  const hasCompany = company !== '' && company !== 'NA' && company !== 'N/A';

  // A company-linked cash debit is a company expense/payment. It belongs in
  // that company's history, not in the main physical-cash History ledger.
  return !(transaction.type === 'debit' && hasCompany);
}

export function applyRecorderScopedCashBalances(transactions) {
  const balancesByRecorder = new Map();

  const chronologicalTransactions = [...transactions].sort(
    (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime()
  );

  const withBalances = chronologicalTransactions.map(transaction => {
    const recorderKey = String(transaction.recordedBy || '').trim().toLowerCase() || '__unassigned__';
    const previousBalance = balancesByRecorder.get(recorderKey) || 0;
    const amount = Number(transaction.amount) || 0;
    const closingBalance = previousBalance + (transaction.type === 'credit' ? amount : -amount);

    balancesByRecorder.set(recorderKey, closingBalance);
    return { ...transaction, closingBalance };
  });

  return withBalances.reverse();
}

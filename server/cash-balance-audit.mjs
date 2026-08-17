const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const response = await fetch(`${origin}/api/transactions/recent?limit=2000`);
if (!response.ok) throw new Error(`Recent transactions request failed with HTTP ${response.status}.`);

const transactions = await response.json();
const cashTransactions = transactions
  .filter(transaction => transaction?.paymentMethod === 'cash')
  .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());

const breakdownValue = transaction => Object.entries(transaction.breakdown || {})
  .reduce((total, [denomination, count]) => total + Number(denomination) * Number(count || 0), 0);

const mismatches = cashTransactions
  .map(transaction => ({
    id: String(transaction.id),
    date: transaction.date,
    type: transaction.type,
    amount: Number(transaction.amount || 0),
    breakdownValue: breakdownValue(transaction),
  }))
  .filter(transaction => transaction.breakdownValue > 0 && Math.abs(transaction.amount - transaction.breakdownValue) > 0.001);

let closingBalance = 0;
const latest = cashTransactions.map(transaction => {
  closingBalance += transaction.type === 'credit'
    ? Number(transaction.amount || 0)
    : -Number(transaction.amount || 0);
  return {
    id: String(transaction.id),
    date: transaction.date,
    type: transaction.type,
    amount: Number(transaction.amount || 0),
    hasBreakdown: Boolean(transaction.breakdown && Object.keys(transaction.breakdown).length),
    closingBalance,
  };
});

console.log(JSON.stringify({
  ok: true,
  recentTransactionsFetched: transactions.length,
  cashTransactionsInWindow: cashTransactions.length,
  cashTransactionsWithoutBreakdown: cashTransactions.filter(transaction => !transaction.breakdown || Object.keys(transaction.breakdown).length === 0).length,
  amountBreakdownMismatchCount: mismatches.length,
  amountBreakdownMismatchSamples: mismatches.slice(-5),
  calculatedCashClosingBalance: closingBalance,
  latestCashLedgerRows: latest.slice(-10),
}, null, 2));

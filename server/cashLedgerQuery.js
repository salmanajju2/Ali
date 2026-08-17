const cashLedgerCte = `
  WITH cash_ledger AS (
    SELECT
      transactions.*,
      SUM(
        CASE
          WHEN payment_method = 'cash' AND type = 'credit' THEN amount
          WHEN payment_method = 'cash' AND type = 'debit' THEN -amount
          ELSE 0
        END
      ) OVER (
        ORDER BY date ASC, id ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::float8 AS cash_closing_balance
    FROM transactions
  )
`;

function calculateCashClosingBalances(transactions) {
  const orderedCashTransactions = [...transactions]
    .filter(transaction => transaction.paymentMethod === 'cash')
    .sort((left, right) => {
      const dateDifference = new Date(left.date).getTime() - new Date(right.date).getTime();
      if (dateDifference !== 0) return dateDifference;
      return Number(left.id) - Number(right.id);
    });

  let closingBalance = 0;
  return orderedCashTransactions.map(transaction => {
    closingBalance += transaction.type === 'credit'
      ? Number(transaction.amount || 0)
      : -Number(transaction.amount || 0);
    return { id: String(transaction.id), closingBalance };
  });
}

module.exports = { cashLedgerCte, calculateCashClosingBalances };

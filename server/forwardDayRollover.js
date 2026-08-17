const IST_OFFSET = '+05:30';

function istDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function getIstBusinessDate(now = new Date()) {
  const { year, month, day } = istDateParts(now);
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function isoAtIst(date, hour, minute) {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return new Date(`${date}T${hh}:${mm}:00${IST_OFFSET}`).toISOString();
}

function getIstDayBounds(date) {
  return {
    start: isoAtIst(date, 0, 0),
    end: isoAtIst(addDays(date, 1), 0, 0),
  };
}

function calculateForwardRollover(transactions) {
  let netAmount = 0;
  const signedBreakdown = {};

  for (const transaction of transactions) {
    const amount = Number(transaction.amount) || 0;
    const direction = String(transaction.type).toLowerCase() === 'credit' ? 1 : -1;
    netAmount += direction * amount;

    for (const [denomination, rawCount] of Object.entries(transaction.breakdown || {})) {
      const count = Number(rawCount);
      if (!Number.isFinite(count) || count === 0) continue;
      signedBreakdown[denomination] = (signedBreakdown[denomination] || 0) + (direction * count);
    }
  }

  if (Math.abs(netAmount) < 0.000001) return null;

  const isPositive = netAmount > 0;
  const breakdown = {};
  for (const [denomination, count] of Object.entries(signedBreakdown)) {
    const normalisedCount = isPositive ? count : -count;
    if (normalisedCount !== 0) breakdown[denomination] = normalisedCount;
  }

  return {
    amount: Math.abs(netAmount),
    netAmount,
    breakdown,
    closingType: isPositive ? 'debit' : 'credit',
    openingType: isPositive ? 'credit' : 'debit',
  };
}

module.exports = {
  addDays,
  calculateForwardRollover,
  getIstBusinessDate,
  getIstDayBounds,
  isoAtIst,
};

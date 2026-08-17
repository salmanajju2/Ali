function parseHistoryLimit(value, fallback = 50) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 100);
}

function parseHistoryDate(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : date;
}

function nextHistoryDate(dateOnly) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function buildHistoryQuery(queryParams, selectFields) {
  const limit = parseHistoryLimit(queryParams.limit, 50);
  const beforeId = Number.parseInt(String(queryParams.beforeId || ''), 10);
  const values = [];
  const predicates = [];

  const addExactFilter = (column, rawValue) => {
    const value = String(rawValue || '').trim();
    if (!value || value === 'all') return;
    values.push(value);
    predicates.push(`${column} = $${values.length}`);
  };

  addExactFilter('company', queryParams.company);
  addExactFilter('location', queryParams.location);
  addExactFilter('type', queryParams.type);
  addExactFilter('recorded_by', queryParams.recordedBy);
  addExactFilter('payment_method', queryParams.paymentMethod);

  const dateFrom = parseHistoryDate(queryParams.dateFrom);
  const dateTo = parseHistoryDate(queryParams.dateTo);
  if (dateFrom) {
    values.push(`${dateFrom}T00:00:00.000Z`);
    predicates.push(`date >= $${values.length}`);
  }
  if (dateTo) {
    values.push(nextHistoryDate(dateTo));
    predicates.push(`date < $${values.length}`);
  }

  const search = String(queryParams.search || '').trim().slice(0, 120);
  if (search) {
    values.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    const parameter = `$${values.length}`;
    predicates.push(`(
      person ILIKE ${parameter} ESCAPE '\\' OR
      company ILIKE ${parameter} ESCAPE '\\' OR
      location ILIKE ${parameter} ESCAPE '\\' OR
      recorded_by ILIKE ${parameter} ESCAPE '\\' OR
      notes ILIKE ${parameter} ESCAPE '\\' OR
      amount::text ILIKE ${parameter} ESCAPE '\\'
    )`);
  }

  if (Number.isInteger(beforeId) && beforeId > 0) {
    values.push(beforeId);
    predicates.push(`id < $${values.length}`);
  }

  values.push(limit + 1);
  return {
    limit,
    values,
    text: `
      SELECT ${selectFields}
      FROM transactions
      ${predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : ''}
      ORDER BY transactions.id DESC
      LIMIT $${values.length}
    `,
  };
}

module.exports = { buildHistoryQuery, parseHistoryDate, parseHistoryLimit };

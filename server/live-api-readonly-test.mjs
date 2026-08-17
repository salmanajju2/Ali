import assert from 'node:assert/strict';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const testToken = process.env.TEST_FIREBASE_ID_TOKEN || '';
if (!testToken) {
  console.log('⏭️ Skipped: set TEST_FIREBASE_ID_TOKEN to run authenticated live API checks.');
  process.exit(0);
}
const authOptions = { headers: { Authorization: `Bearer ${testToken}` } };

async function request(path, options) {
  const response = await fetch(`${origin}${path}`, { ...authOptions, ...options, headers: { ...authOptions.headers, ...(options?.headers || {}) } });
  const body = await response.json().catch(() => null);
  return { response, body };
}

const health = await request('/api/health');
assert.equal(health.response.status, 200, 'Health endpoint must respond HTTP 200.');
assert.equal(health.body?.ok, true, 'Health endpoint must report ok=true.');
assert.equal(health.body?.database, 'connected', 'Health endpoint must report Aiven PostgreSQL connected.');

const recent = await request('/api/transactions/recent?limit=1');
assert.equal(recent.response.status, 200, 'Recent transactions endpoint must respond HTTP 200.');
assert.ok(Array.isArray(recent.body), 'Recent transactions response must be an array.');
assert.ok(recent.body.length <= 1, 'Recent transactions endpoint must honor the requested limit.');

const cursor = await request('/api/transactions/changes?after=0&limit=1');
assert.equal(cursor.response.status, 200, 'Change cursor endpoint must respond HTTP 200.');
assert.ok(Array.isArray(cursor.body?.changes), 'Change cursor response must contain a changes array.');
assert.equal(typeof cursor.body?.nextCursor, 'string', 'Change cursor response must include a string nextCursor.');
assert.equal(typeof cursor.body?.hasMore, 'boolean', 'Change cursor response must include hasMore.');

const inventory = await request('/api/cash-note-inventory');
assert.equal(inventory.response.status, 200, 'Cash inventory endpoint must respond HTTP 200.');
assert.equal(typeof inventory.body?.counts, 'object', 'Cash inventory response must contain denomination counts.');
assert.equal(typeof inventory.body?.totalValue, 'number', 'Cash inventory response must contain a numeric total value.');

// Uses an invalid ID so the DELETE route validation is tested without touching user data.
const invalidDelete = await request('/api/transactions/0', { method: 'DELETE' });
assert.equal(invalidDelete.response.status, 400, 'Invalid transaction ID must be rejected before database mutation.');
assert.match(String(invalidDelete.body?.error || ''), /valid transaction id/i);

console.log(JSON.stringify({
  ok: true,
  checked: ['health', 'recent transactions', 'durable change cursor', 'cash inventory', 'invalid delete validation'],
}));

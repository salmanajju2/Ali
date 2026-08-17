import assert from 'node:assert/strict';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const testToken = process.env.TEST_FIREBASE_ID_TOKEN || '';
if (!testToken) {
  console.log('⏭️ Skipped: set TEST_FIREBASE_ID_TOKEN to run authenticated live cursor checks.');
  process.exit(0);
}
const authHeaders = { Authorization: `Bearer ${testToken}` };
const allowedActions = new Set(['add', 'update', 'delete']);
let after = 0;
let pages = 0;
let changesChecked = 0;
let deleteChanges = 0;
let nullTransactionChanges = 0;

while (true) {
  const response = await fetch(`${origin}/api/transactions/changes?after=${after}&limit=1000`, { headers: authHeaders });
  assert.equal(response.status, 200, `Change cursor request failed after=${after}.`);
  const page = await response.json();
  assert.ok(Array.isArray(page.changes), 'Cursor response must contain a changes array.');
  assert.equal(typeof page.nextCursor, 'string', 'Cursor response must contain a string nextCursor.');
  assert.equal(typeof page.hasMore, 'boolean', 'Cursor response must contain a boolean hasMore.');

  for (const change of page.changes) {
    assert.ok(allowedActions.has(change.action), `Unsupported change action: ${change.action}`);
    assert.ok(Number.parseInt(change.cursor, 10) > after, 'Cursors must increase monotonically.');
    assert.equal(typeof change.id, 'string', 'Every change must identify its transaction ID as a string.');
    if (change.action === 'delete') deleteChanges += 1;
    if (change.transaction === null) nullTransactionChanges += 1;
    changesChecked += 1;
  }

  pages += 1;
  const next = Number.parseInt(page.nextCursor, 10);
  if (page.changes.length === 0) break;
  assert.ok(next > after, 'A non-empty cursor page must advance nextCursor.');
  after = next;
  if (!page.hasMore) break;
}

console.log(JSON.stringify({
  ok: true,
  pages,
  changesChecked,
  deleteChanges,
  nullTransactionChanges,
  finalCursor: String(after),
}));

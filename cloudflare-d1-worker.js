const TRANSACTION_COLUMNS = [
  'id', 'clientId', 'date', 'type', 'paymentMethod', 'company', 'person',
  'location', 'recordedBy', 'amount', 'notes', 'breakdown', 'bank', 'slip', 'updatedAt'
];

function json(data, corsHeaders, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function safeParse(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function rowToTransaction(row) {
  if (!row) return null;
  return {
    ...row,
    amount: Number(row.amount || 0),
    breakdown: typeof row.breakdown === 'string' ? (safeParse(row.breakdown) || {}) : (row.breakdown || {}),
  };
}

async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clientId TEXT,
      date TEXT,
      type TEXT,
      paymentMethod TEXT,
      company TEXT,
      person TEXT,
      location TEXT,
      recordedBy TEXT,
      amount REAL,
      notes TEXT,
      breakdown TEXT,
      bank TEXT,
      slip TEXT,
      updatedAt INTEGER
    )
  `).run();

  try { await db.prepare('ALTER TABLE transactions ADD COLUMN clientId TEXT').run(); } catch (_) {}
  try { await db.prepare('ALTER TABLE transactions ADD COLUMN updatedAt INTEGER').run(); } catch (_) {}
  try { await db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_client_id ON transactions(clientId)').run(); } catch (_) {}

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS transaction_changes (
      change_id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      transaction_json TEXT,
      created_at INTEGER NOT NULL
    )
  `).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_transaction_changes_cursor ON transaction_changes(change_id)').run();

  // Older imported rows may not have a modification timestamp.
  await db.prepare('UPDATE transactions SET updatedAt = COALESCE(updatedAt, CAST(strftime(\'%s\', date) AS INTEGER) * 1000, ?) WHERE updatedAt IS NULL').bind(Date.now()).run();
}

async function getRow(db, id) {
  return db.prepare('SELECT * FROM transactions WHERE id = ?').bind(id).first();
}

async function recordChange(db, action, id, row) {
  await db.prepare(`
    INSERT INTO transaction_changes (action, transaction_id, transaction_json, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(action, String(id), row ? JSON.stringify(rowToTransaction(row)) : null, Date.now()).run();
}

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin');
  const allowed = new Set([
    'https://ali3.vercel.app',
    'https://ali3.ali-enterprises.workers.dev',
  ]);
  const headers = {
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Vary': 'Origin',
  };
  if (origin && (allowed.has(origin) || origin.endsWith('.vercel.app'))) {
    headers['Access-Control-Allow-Origin'] = origin;
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    try {
      await ensureSchema(env.DB);
      const url = new URL(request.url);
      const action = url.searchParams.get('action');

      if (request.method === 'GET') {
        if (action === 'test') return new Response('OK', { headers: corsHeaders });

        if (action === 'getAll') {
          const limit = Number.parseInt(url.searchParams.get('limit') || '5000', 10);
          const query = limit <= 0
            ? env.DB.prepare('SELECT * FROM transactions ORDER BY id DESC')
            : env.DB.prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT ?').bind(limit);
          const { results } = await query.all();
          return json({ transactions: results.map(rowToTransaction), timestamp: Date.now() }, corsHeaders);
        }

        if (action === 'getNew') {
          const lastId = Number.parseInt(url.searchParams.get('lastId') || '0', 10) || 0;
          const { results } = await env.DB.prepare('SELECT * FROM transactions WHERE id > ? ORDER BY id ASC').bind(lastId).all();
          return json({ transactions: results.map(rowToTransaction) }, corsHeaders);
        }

        if (action === 'getLastId') {
          const row = await env.DB.prepare('SELECT MAX(id) AS lastId FROM transactions').first();
          return json({ lastId: row?.lastId || 0 }, corsHeaders);
        }

        if (action === 'changes') {
          const cursor = Number.parseInt(url.searchParams.get('cursor') || '0', 10) || 0;
          const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') || '500', 10) || 500, 1), 1000);
          const rows = await env.DB.prepare(`
            SELECT change_id, action, transaction_id, transaction_json
            FROM transaction_changes WHERE change_id > ? ORDER BY change_id ASC LIMIT ?
          `).bind(cursor, limit + 1).all();
          const hasMore = rows.results.length > limit;
          const page = hasMore ? rows.results.slice(0, limit) : rows.results;
          const changes = page.map(change => ({
            cursor: change.change_id,
            action: change.action,
            id: String(change.transaction_id),
            transaction: change.transaction_json ? rowToTransaction(safeParse(change.transaction_json)) : undefined,
          }));
          const nextCursor = page.length ? page[page.length - 1].change_id : cursor;
          return json({ changes, cursor, nextCursor, hasMore }, corsHeaders);
        }

        if (action === 'modifiedSince') {
          const since = Date.parse(url.searchParams.get('since') || '') || 0;
          const { results } = await env.DB.prepare('SELECT * FROM transactions WHERE updatedAt > ? ORDER BY updatedAt ASC, id ASC').bind(since).all();
          return json({ transactions: results.map(rowToTransaction) }, corsHeaders);
        }

        if (action === 'inventory') {
          const recordedBy = url.searchParams.get('recordedBy');
          const rows = recordedBy
            ? await env.DB.prepare('SELECT type, breakdown FROM transactions WHERE paymentMethod = ? AND recordedBy = ?').bind('cash', recordedBy).all()
            : await env.DB.prepare('SELECT type, breakdown FROM transactions WHERE paymentMethod = ?').bind('cash').all();
          const counts = {};
          for (const row of rows.results) {
            const breakdown = typeof row.breakdown === 'string' ? (safeParse(row.breakdown) || {}) : (row.breakdown || {});
            for (const [denomination, count] of Object.entries(breakdown)) {
              const value = Number(count || 0);
              counts[denomination] = (counts[denomination] || 0) + (row.type === 'credit' ? value : -value);
            }
          }
          return json({ counts }, corsHeaders);
        }
      }

      if (request.method === 'POST') {
        const body = await request.json();
        const data = body.data || {};

        if (body.action === 'initialize') return json({ success: true }, corsHeaders);
        if (body.action === 'repair') return json({ success: true, message: 'Schema is maintained automatically.' }, corsHeaders);

        if (body.action === 'add') {
          const clientId = data.clientId || data.id || null;
          if (clientId) {
            const duplicate = await env.DB.prepare('SELECT id FROM transactions WHERE clientId = ?').bind(clientId).first();
            if (duplicate) return json({ success: true, id: duplicate.id, duplicate: true }, corsHeaders);
          }
          const now = Date.now();
          const result = await env.DB.prepare(`
            INSERT INTO transactions (clientId, date, type, paymentMethod, company, person, location, recordedBy, amount, notes, breakdown, bank, slip, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
          `).bind(
            clientId, data.date || new Date(now).toISOString(), data.type || '', data.paymentMethod || '',
            data.company || '', data.person || '', data.location || '', data.recordedBy || '', Number(data.amount || 0),
            data.notes || '', typeof data.breakdown === 'string' ? data.breakdown : JSON.stringify(data.breakdown || {}),
            data.bank || '', data.slip || '', now,
          ).first();
          const id = result?.id;
          const row = id ? await getRow(env.DB, id) : null;
          if (!id || !row) return json({ success: false, error: 'Insert did not return an id' }, corsHeaders, { status: 500 });
          await recordChange(env.DB, 'add', id, row);
          return json({ success: true, id }, corsHeaders);
        }

        if (body.action === 'update') {
          const id = data.id;
          const before = await getRow(env.DB, id);
          if (!before) return json({ success: false, error: 'Transaction not found', changes: 0 }, corsHeaders, { status: 404 });
          const now = Date.now();
          await env.DB.prepare(`
            UPDATE transactions SET date=?, type=?, paymentMethod=?, company=?, person=?, location=?, recordedBy=?, amount=?, notes=?, breakdown=?, bank=?, slip=?, updatedAt=? WHERE id=?
          `).bind(
            data.date || new Date(now).toISOString(), data.type || '', data.paymentMethod || '', data.company || '', data.person || '',
            data.location || '', data.recordedBy || '', Number(data.amount || 0), data.notes || '',
            typeof data.breakdown === 'string' ? data.breakdown : JSON.stringify(data.breakdown || {}), data.bank || '', data.slip || '', now, id,
          ).run();
          const after = await getRow(env.DB, id);
          await recordChange(env.DB, 'update', id, after);
          return json({ success: true, changes: 1, transaction: rowToTransaction(after) }, corsHeaders);
        }

        if (body.action === 'delete') {
          // Accept both { action, id } and { action, data: { id } } so an older
          // frontend cannot silently turn a delete into a no-op.
          const id = data.id ?? body.id ?? null;
          const before = id === null || id === 'null'
            ? null
            : await getRow(env.DB, id);
          const result = id === null || id === 'null'
            ? await env.DB.prepare('DELETE FROM transactions WHERE id IS NULL').run()
            : await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run();
          const changes = result?.meta?.changes || 0;
          if (before && changes > 0) await recordChange(env.DB, 'delete', id, null);
          return json({ success: true, changes, alreadyDeleted: !before }, corsHeaders);
        }
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (error) {
      return json({ success: false, error: error instanceof Error ? error.message : String(error) }, corsHeaders, { status: 500 });
    }
  },
};

export { TRANSACTION_COLUMNS };

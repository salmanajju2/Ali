const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth: getFirebaseAdminAuth } = require('firebase-admin/auth');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('crypto');

const app = express();

// 1. Middleware FIRST
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://ali-ltyt.onrender.com,http://localhost:5173,http://localhost:4173,capacitor://localhost,http://localhost')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);

let firebaseAuthAdmin;
function getVerifiedFirebaseAuth() {
  if (firebaseAuthAdmin) return firebaseAuthAdmin;
  let serviceAccount;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  } else {
    throw new Error('Firebase Admin credentials are not configured.');
  }
  const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  firebaseAuthAdmin = getFirebaseAdminAuth(app);
  return firebaseAuthAdmin;
}

const corsOptions = {
  origin(origin, callback) {
    // Native WebViews and same-origin server calls may omit Origin.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

app.use(cors(corsOptions));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 2. Database Connection
// `sslmode=require` is a libpq option. In node-postgres it can override the
// explicit SSL object and cause Aiven's certificate-chain error, so remove it
// before initializing the pool and configure TLS here instead.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Add the Aiven PostgreSQL URL in Render environment variables.');
}

const databaseUrl = new URL(process.env.DATABASE_URL);
databaseUrl.searchParams.delete('sslmode');

const aivenCa = process.env.AIVEN_CA_PEM?.replace(/\\n/g, '\n');
const pool = new Pool({
  connectionString: databaseUrl.toString(),
  ssl: aivenCa
    ? { ca: aivenCa, rejectUnauthorized: true }
    : { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

pool.on('error', (error) => {
  console.error('Unexpected Aiven PostgreSQL pool error:', error);
});

function normaliseEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedValue) {
  const [algorithm, salt, savedHash] = String(storedValue || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !savedHash) return false;
  const candidate = scryptSync(password, salt, 64);
  const saved = Buffer.from(savedHash, 'hex');
  return candidate.length === saved.length && timingSafeEqual(candidate, saved);
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function hashSessionToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

async function findSessionUser(token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT u.id, u.email, u.display_name, u.is_admin
     FROM app_sessions s
     INNER JOIN app_users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hashSessionToken(token)]
  );
  return result.rows[0] || null;
}

async function findOrCreateFirebaseUser(decodedToken) {
  const email = normaliseEmail(decodedToken.email);
  if (!email) throw new Error('Firebase account has no verified email address.');
  const displayName = String(decodedToken.name || email.split('@')[0] || 'User').trim().slice(0, 100);
  const existing = await pool.query(
    `SELECT id, email, display_name, is_admin, firebase_uid
     FROM app_users
     WHERE firebase_uid=$1 OR email=$2
     ORDER BY CASE WHEN firebase_uid=$1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [decodedToken.uid, email]
  );
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    const updated = await pool.query(
      `UPDATE app_users
       SET firebase_uid=$1, email=$2, display_name=COALESCE(NULLIF(display_name, ''), $3)
       WHERE id=$4
       RETURNING id, email, display_name, is_admin, firebase_uid`,
      [decodedToken.uid, email, displayName, row.id]
    );
    return updated.rows[0];
  }
  const created = await pool.query(
    `INSERT INTO app_users (id, email, password_hash, firebase_uid, display_name, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, display_name, is_admin, firebase_uid`,
    [randomUUID(), email, hashPassword(randomUUID()), decodedToken.uid, displayName, adminEmails.has(email)]
  );
  return created.rows[0];
}

async function verifyFirebaseRequestToken(token) {
  if (!token) return null;
  const decodedToken = await getVerifiedFirebaseAuth().verifyIdToken(token);
  return findOrCreateFirebaseUser(decodedToken);
}

async function requireAuth(req, res, next) {
  try {
    await schemaReady;
    const user = await verifyFirebaseRequestToken(getBearerToken(req));
    if (!user) return res.status(401).json({ error: 'Sign-in required.' });
    req.authUser = user;
    return next();
  } catch (error) {
    console.error('Firebase authentication lookup failed:', error?.message || error);
    const status = error?.code === 'auth/id-token-expired' || error?.code === 'auth/argument-error' ? 401 : 503;
    return res.status(status).json({ error: status === 401 ? 'Firebase session expired. Please sign in again.' : 'Authentication service temporarily unavailable.' });
  }
}

function createPublicUser(row) {
  return {
    uid: row.firebase_uid || row.id,
    email: row.email,
    displayName: row.display_name || row.email.split('@')[0],
    isAdmin: Boolean(row.is_admin),
  };
}

async function ensureTransactionSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      date TEXT,
      manual_date TEXT,
      amount NUMERIC,
      type TEXT,
      company TEXT,
      person TEXT,
      notes TEXT,
      payment_method TEXT,
      location TEXT,
      recorded_by TEXT,
      bank TEXT,
      slip TEXT,
      breakdown JSONB DEFAULT '{}'::jsonb,
      is_synced BOOLEAN DEFAULT TRUE,
      is_settlement BOOLEAN DEFAULT FALSE,
      client_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Existing Aiven tables from earlier app versions may lack new columns.
  await pool.query(`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS manual_date TEXT,
      ADD COLUMN IF NOT EXISTS bank TEXT,
      ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS is_settlement BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS client_id TEXT,
      ADD COLUMN IF NOT EXISTS recorded_by TEXT,
      ADD COLUMN IF NOT EXISTS payment_method TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  `);
  await pool.query(`UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_touch_transaction_updated_at()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$
  `);
  await pool.query(`DROP TRIGGER IF EXISTS touch_transactions_updated_at ON transactions`);
  await pool.query(`
    CREATE TRIGGER touch_transactions_updated_at
    BEFORE INSERT OR UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION app_touch_transaction_updated_at()
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS transactions_updated_at_idx ON transactions(updated_at DESC)`);

  // Durable cross-device reconciliation log. Socket.IO gives connected clients an
  // instant update, while this append-only cursor lets a client that was closed
  // recover every add/update/delete after it reconnects.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transaction_change_log (
      change_id BIGSERIAL PRIMARY KEY,
      transaction_id BIGINT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('add', 'update', 'delete')),
      changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS transaction_change_log_cursor_idx ON transaction_change_log(change_id ASC)`);
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_log_transaction_change()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO transaction_change_log (transaction_id, action) VALUES (NEW.id, 'add');
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO transaction_change_log (transaction_id, action) VALUES (NEW.id, 'update');
        RETURN NEW;
      ELSE
        INSERT INTO transaction_change_log (transaction_id, action) VALUES (OLD.id, 'delete');
        RETURN OLD;
      END IF;
    END;
    $$
  `);
  await pool.query(`DROP TRIGGER IF EXISTS log_transactions_change ON transactions`);
  await pool.query(`
    CREATE TRIGGER log_transactions_change
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION app_log_transaction_change()
  `);

  // Older legacy imports stored breakdown as TEXT. Convert the column once,
  // preserving valid JSON and safely replacing malformed legacy values with {}.
  const breakdownColumn = await pool.query(`
    SELECT data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'breakdown'
  `);
  if (breakdownColumn.rows[0]?.data_type !== 'jsonb') {
    await pool.query(`
      CREATE OR REPLACE FUNCTION app_safe_breakdown_json(value TEXT)
      RETURNS JSONB
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF value IS NULL OR btrim(value) = '' THEN
          RETURN '{}'::jsonb;
        END IF;
        BEGIN
          RETURN value::jsonb;
        EXCEPTION WHEN OTHERS THEN
          RETURN '{}'::jsonb;
        END;
      END;
      $$
    `);
    await pool.query(`
      ALTER TABLE transactions
      ALTER COLUMN breakdown TYPE JSONB
      USING app_safe_breakdown_json(breakdown::text)
    `);
    await pool.query(`DROP FUNCTION app_safe_breakdown_json(TEXT)`);
  }
  await pool.query(`ALTER TABLE transactions ALTER COLUMN breakdown SET DEFAULT '{}'::jsonb`);
  await pool.query(`UPDATE transactions SET is_synced = TRUE WHERE is_synced IS NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      firebase_uid TEXT UNIQUE,
      display_name TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS firebase_uid TEXT UNIQUE`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id)');

  // The cash-note inventory is the authoritative cumulative count behind the
  // Vault screen. It mirrors cash transaction breakdowns at the database layer,
  // so it remains correct even when transactions are added, edited, or deleted
  // from a different phone, the web app, or an offline sync replay.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_note_inventory (
      denomination INTEGER PRIMARY KEY CHECK (denomination IN (500, 200, 100, 50, 20, 10, 1)),
      note_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query(`
    INSERT INTO cash_note_inventory (denomination, note_count)
    VALUES (500, 0), (200, 0), (100, 0), (50, 0), (20, 0), (10, 0), (1, 0)
    ON CONFLICT (denomination) DO NOTHING
  `);

  // Only whole signed counts are accepted by the denomination UI. This helper
  // applies a transaction's cash effect (+credit / -debit) to the current table.
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_apply_cash_note_inventory(
      p_payment_method TEXT,
      p_type TEXT,
      p_breakdown JSONB,
      p_multiplier INTEGER DEFAULT 1
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    DECLARE
      direction INTEGER;
    BEGIN
      IF COALESCE(lower(p_payment_method), '') <> 'cash' THEN
        RETURN;
      END IF;

      direction := CASE lower(COALESCE(p_type, ''))
        WHEN 'credit' THEN 1
        WHEN 'debit' THEN -1
        ELSE 0
      END;
      IF direction = 0 THEN
        RETURN;
      END IF;

      INSERT INTO cash_note_inventory (denomination, note_count, updated_at)
      SELECT
        entry.key::INTEGER,
        entry.value::BIGINT * direction * p_multiplier,
        CURRENT_TIMESTAMP
      FROM jsonb_each_text(COALESCE(p_breakdown, '{}'::jsonb)) AS entry(key, value)
      WHERE entry.key ~ '^(500|200|100|50|20|10|1)$'
        AND entry.value ~ '^[+-]?[0-9]+$'
      ON CONFLICT (denomination) DO UPDATE
      SET note_count = cash_note_inventory.note_count + EXCLUDED.note_count,
          updated_at = CURRENT_TIMESTAMP;
    END;
    $$
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION app_sync_cash_note_inventory_trigger()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        PERFORM app_apply_cash_note_inventory(NEW.payment_method, NEW.type, NEW.breakdown, 1);
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        -- Reverse the old breakdown first, then apply the edited replacement.
        PERFORM app_apply_cash_note_inventory(OLD.payment_method, OLD.type, OLD.breakdown, -1);
        PERFORM app_apply_cash_note_inventory(NEW.payment_method, NEW.type, NEW.breakdown, 1);
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        -- Deleting a transaction reverses precisely its old note contribution.
        PERFORM app_apply_cash_note_inventory(OLD.payment_method, OLD.type, OLD.breakdown, -1);
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$
  `);
  await pool.query('DROP TRIGGER IF EXISTS cash_note_inventory_transaction_sync ON transactions');
  await pool.query(`
    CREATE TRIGGER cash_note_inventory_transaction_sync
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION app_sync_cash_note_inventory_trigger()
  `);

  // Rebuild during deployment/startup so all historic Aiven transactions become
  // the opening balance. Afterwards the trigger keeps this table in sync without
  // rescanning the full history on every app request.
  await pool.query('UPDATE cash_note_inventory SET note_count = 0, updated_at = CURRENT_TIMESTAMP');
  await pool.query(`
    SELECT app_apply_cash_note_inventory(payment_method, type, breakdown, 1)
    FROM transactions
  `);

  // Each recorder gets their own seven-row cash inventory. Owner keys are the
  // same compact identity rule already used by the client to match old and new
  // recordedBy formats (e.g. spaces/case differences cannot split one user).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_note_inventory_by_user (
      owner_key TEXT NOT NULL CHECK (owner_key <> ''),
      denomination INTEGER NOT NULL CHECK (denomination IN (500, 200, 100, 50, 20, 10, 1)),
      note_count BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (owner_key, denomination)
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS cash_note_inventory_by_user_updated_at_idx ON cash_note_inventory_by_user(updated_at DESC)');

  await pool.query(`
    CREATE OR REPLACE FUNCTION app_cash_inventory_owner_key(p_recorded_by TEXT)
    RETURNS TEXT
    LANGUAGE SQL
    IMMUTABLE
    AS $$
      SELECT regexp_replace(lower(trim(COALESCE(p_recorded_by, ''))), '[^a-z0-9@.]', '', 'g')
    $$
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_apply_user_cash_note_inventory(
      p_recorded_by TEXT,
      p_payment_method TEXT,
      p_type TEXT,
      p_breakdown JSONB,
      p_multiplier INTEGER DEFAULT 1
    )
    RETURNS VOID
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_owner_key TEXT := app_cash_inventory_owner_key(p_recorded_by);
      direction INTEGER;
    BEGIN
      IF v_owner_key = '' OR COALESCE(lower(p_payment_method), '') <> 'cash' THEN
        RETURN;
      END IF;

      direction := CASE lower(COALESCE(p_type, ''))
        WHEN 'credit' THEN 1
        WHEN 'debit' THEN -1
        ELSE 0
      END;
      IF direction = 0 THEN
        RETURN;
      END IF;

      INSERT INTO cash_note_inventory_by_user (owner_key, denomination, note_count, updated_at)
      SELECT
        v_owner_key,
        entry.key::INTEGER,
        entry.value::BIGINT * direction * p_multiplier,
        CURRENT_TIMESTAMP
      FROM jsonb_each_text(COALESCE(p_breakdown, '{}'::jsonb)) AS entry(key, value)
      WHERE entry.key ~ '^(500|200|100|50|20|10|1)$'
        AND entry.value ~ '^[+-]?[0-9]+$'
      ON CONFLICT (owner_key, denomination) DO UPDATE
      SET note_count = cash_note_inventory_by_user.note_count + EXCLUDED.note_count,
          updated_at = CURRENT_TIMESTAMP;
    END;
    $$
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION app_sync_user_cash_note_inventory_trigger()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        PERFORM app_apply_user_cash_note_inventory(NEW.recorded_by, NEW.payment_method, NEW.type, NEW.breakdown, 1);
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        PERFORM app_apply_user_cash_note_inventory(OLD.recorded_by, OLD.payment_method, OLD.type, OLD.breakdown, -1);
        PERFORM app_apply_user_cash_note_inventory(NEW.recorded_by, NEW.payment_method, NEW.type, NEW.breakdown, 1);
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        PERFORM app_apply_user_cash_note_inventory(OLD.recorded_by, OLD.payment_method, OLD.type, OLD.breakdown, -1);
        RETURN OLD;
      END IF;
      RETURN NULL;
    END;
    $$
  `);
  await pool.query('DROP TRIGGER IF EXISTS cash_note_inventory_user_transaction_sync ON transactions');
  await pool.query(`
    CREATE TRIGGER cash_note_inventory_user_transaction_sync
    AFTER INSERT OR UPDATE OR DELETE ON transactions
    FOR EACH ROW EXECUTE FUNCTION app_sync_user_cash_note_inventory_trigger()
  `);

  // One startup backfill makes every existing recorder's balance available as
  // a direct table lookup. Normal app use only applies O(number of notes) deltas.
  await pool.query('DELETE FROM cash_note_inventory_by_user');
  await pool.query(`
    SELECT app_apply_user_cash_note_inventory(recorded_by, payment_method, type, breakdown, 1)
    FROM transactions
  `);
}

const schemaReady = ensureTransactionSchema().catch((err) => {
  console.error('Error preparing Aiven transactions schema:', err);
  throw err;
});

async function withDatabase(res, action) {
  try {
    await schemaReady;
    await action();
  } catch (error) {
    console.error('Aiven PostgreSQL request failed:', error);
    res.status(500).json({ error: 'Database request failed. Check Render DATABASE_URL and Aiven TLS configuration.' });
  }
}

// 3. API Health check endpoint
app.get('/api/health', async (_req, res) => {
  try {
    await schemaReady;
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (error) {
    console.error('Health check database failure:', error);
    res.status(503).json({ ok: false, database: 'unavailable' });
  }
});

// 4. Firebase Authentication + Aiven PostgreSQL application profile.
// Firebase owns email/password identity; Aiven stores only the application profile,
// role and all business data. The client sends a Firebase ID token on every API call.
app.post('/api/auth/register', (_req, res) => {
  res.status(410).json({ error: 'Create the account through Firebase Authentication.' });
});

app.post('/api/auth/login', (_req, res) => {
  res.status(410).json({ error: 'Sign in through Firebase Authentication.' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: createPublicUser(req.authUser) });
});

app.post('/api/auth/logout', (_req, res) => {
  // Firebase sign-out is performed by the client. No Firebase credential is stored here.
  res.json({ ok: true });
});

// All business data and integration proxies require a valid backend session.
// Authentication is enforced here rather than in the client so it cannot be bypassed.
app.use('/api/transactions', requireAuth);
app.use('/api/cash-note-inventory', requireAuth);
app.use('/telegram', requireAuth);
app.use('/discord', requireAuth);

// 5. REST API for Transactions (Aiven PostgreSQL)
async function getCashNoteInventorySnapshot() {
  const result = await pool.query(`
    SELECT denomination, note_count::float8 AS count, updated_at AS "updatedAt"
    FROM cash_note_inventory
    ORDER BY denomination DESC
  `);
  const counts = {};
  let totalValue = 0;
  let updatedAt = null;
  for (const row of result.rows) {
    const denomination = Number(row.denomination);
    const count = Number(row.count) || 0;
    counts[denomination] = count;
    totalValue += denomination * count;
    if (!updatedAt || new Date(row.updatedAt).getTime() > new Date(updatedAt).getTime()) {
      updatedAt = row.updatedAt;
    }
  }
  return { counts, totalValue, updatedAt };
}

// This endpoint transfers only seven denomination rows. It is used for the
// authoritative total-vault display; date-filtered activity continues to be
// calculated from the currently visible transaction list on the client.
app.get('/api/cash-note-inventory', async (_req, res) => {
  await withDatabase(res, async () => {
    res.json(await getCashNoteInventorySnapshot());
  });
});

function normalizeCashInventoryOwnerKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9@.]/g, '');
}

async function getUserCashNoteInventorySnapshot(identityValues) {
  const ownerKeys = [...new Set(
    identityValues.map(normalizeCashInventoryOwnerKey).filter(Boolean)
  )].slice(0, 8);
  const result = await pool.query(`
    WITH denominations(denomination) AS (VALUES (500), (200), (100), (50), (20), (10), (1))
    SELECT
      denominations.denomination,
      COALESCE(SUM(inventory.note_count), 0)::float8 AS count,
      MAX(inventory.updated_at) AS "updatedAt"
    FROM denominations
    LEFT JOIN cash_note_inventory_by_user AS inventory
      ON inventory.denomination = denominations.denomination
      AND inventory.owner_key = ANY($1::text[])
    GROUP BY denominations.denomination
    ORDER BY denominations.denomination DESC
  `, [ownerKeys]);

  const counts = {};
  let totalValue = 0;
  let updatedAt = null;
  for (const row of result.rows) {
    const denomination = Number(row.denomination);
    const count = Number(row.count) || 0;
    counts[denomination] = count;
    totalValue += denomination * count;
    if (row.updatedAt && (!updatedAt || new Date(row.updatedAt).getTime() > new Date(updatedAt).getTime())) {
      updatedAt = row.updatedAt;
    }
  }
  return { counts, totalValue, updatedAt };
}

// The client supplies its Firebase display-name/email aliases. The database
// returns the union of only those recorder balances, never all transactions.
app.get('/api/cash-note-inventory/user', async (req, res) => {
  await withDatabase(res, async () => {
    const requested = Array.isArray(req.query.identity)
      ? req.query.identity
      : (req.query.identity ? [req.query.identity] : []);
    res.json(await getUserCashNoteInventorySnapshot(requested));
  });
});

// Only this server-side helper publishes transaction mutations. The REST route
// calls it after PostgreSQL returns a committed row (or confirmed deletion), so
// an APK or web client can never broadcast an unconfirmed local mutation.
function publishTransactionEvent(action, payload = {}) {
  const event = {
    eventId: randomUUID(),
    action,
    emittedAt: new Date().toISOString(),
    ...payload,
  };
  io.emit('trigger-sync', event);
  console.log(`📡 Socket.IO ${action} event published: ${event.eventId}`);
  return event;
}

// Full detail is used only for a selected receipt or an explicit transaction edit.
const transactionSelectFields = `
  id::text AS id, date, manual_date AS "manualDate", amount::float8 AS amount,
  type, company, person, notes, payment_method AS "paymentMethod", location,
  recorded_by AS "recordedBy", bank, slip, breakdown,
  is_synced AS "isSynced", is_settlement AS "isSettlement", client_id AS "clientId"
`;

// Legacy imports contain base64 images inside `slip`. Returning them with every
// history row made a nominal 500-row sync exceed 7 MB. Keep normal Discord/Telegram
// references as-is, but replace inline receipt bytes with a tiny marker that the
// client can resolve through the detail endpoint only when the user opens it.
const transactionSummaryFields = `
  id::text AS id, date, manual_date AS "manualDate", amount::float8 AS amount,
  type, company, person, notes, payment_method AS "paymentMethod", location,
  recorded_by AS "recordedBy", bank,
  CASE
    WHEN slip IS NULL OR slip = '' THEN NULL
    WHEN slip LIKE 'data:%' THEN 'lazy-slip:' || id::text
    ELSE slip
  END AS slip,
  breakdown, is_synced AS "isSynced", is_settlement AS "isSettlement", client_id AS "clientId"
`;

function transactionForRealtime(transaction) {
  if (transaction?.slip && String(transaction.slip).startsWith('data:')) {
    return { ...transaction, slip: `lazy-slip:${transaction.id}` };
  }
  return transaction;
}

function parseTransactionLimit(value, fallback = -1) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 2_000);
}

// Small, bounded response used by APK startup and routine reconciliation.
// The newest records have the largest IDs because PostgreSQL assigns IDs on insert.
app.get('/api/transactions/recent', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
  await withDatabase(res, async () => {
    const result = await pool.query(`
      SELECT ${transactionSummaryFields}
      FROM transactions
      ORDER BY transactions.id DESC
      LIMIT $1
    `, [limit]);
    res.json(result.rows);
  });
});

// Server-side paginated & filtered history endpoint using historyQuery helper
const { buildHistoryQuery } = require('./historyQuery');

app.get('/api/transactions/history', async (req, res) => {
  await withDatabase(res, async () => {
    const query = buildHistoryQuery(req.query, transactionSummaryFields);
    const result = await pool.query(query.text, query.values);
    const rows = result.rows;
    let hasMore = false;
    if (rows.length > query.limit) {
      rows.pop();
      hasMore = true;
    }
    res.json({
      transactions: rows,
      hasMore,
      nextBeforeId: rows.length > 0 ? rows[rows.length - 1].id : null,
    });
  });
});

// Endpoint to fetch transactions modified since a given timestamp (for direct SQL edits)
app.get('/api/transactions/modified-since', async (req, res) => {
  const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  await withDatabase(res, async () => {
    const result = await pool.query(`
      SELECT ${transactionSummaryFields}, updated_at AS "updatedAt"
      FROM transactions
      WHERE updated_at > $1
      ORDER BY updated_at ASC
      LIMIT $2
    `, [isNaN(since.getTime()) ? new Date(0) : since, limit]);
    res.json(result.rows);
  });
});

// Durable cursor reconciliation for clients that were fully closed while another
// device changed data. Unlike a time-window query, this includes deletes and does
// not drop older writes after a long offline period.
app.get('/api/transactions/changes', async (req, res) => {
  const after = Math.max(0, Number.parseInt(String(req.query.after || '0'), 10) || 0);
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit || '500'), 10) || 500, 1), 1_000);
  await withDatabase(res, async () => {
    const result = await pool.query(`
      SELECT
        c.change_id::text AS cursor,
        c.action AS "changeAction",
        c.transaction_id::text AS "transactionId",
        t.id::text AS id, t.date, t.manual_date AS "manualDate", t.amount::float8 AS amount,
        t.type, t.company, t.person, t.notes, t.payment_method AS "paymentMethod", t.location,
        t.recorded_by AS "recordedBy", t.bank,
        CASE
          WHEN t.slip IS NULL OR t.slip = '' THEN NULL
          WHEN t.slip LIKE 'data:%' THEN 'lazy-slip:' || t.id::text
          ELSE t.slip
        END AS slip,
        t.breakdown, t.is_synced AS "isSynced", t.is_settlement AS "isSettlement", t.client_id AS "clientId"
      FROM transaction_change_log c
      LEFT JOIN transactions t ON t.id = c.transaction_id
      WHERE c.change_id > $1
      ORDER BY c.change_id ASC
      LIMIT $2
    `, [after, limit]);

    const changes = result.rows.map(row => ({
      cursor: row.cursor,
      action: row.changeAction,
      id: row.transactionId,
      transaction: row.id ? {
        id: row.id,
        date: row.date,
        manualDate: row.manualDate,
        amount: row.amount,
        type: row.type,
        company: row.company,
        person: row.person,
        notes: row.notes,
        paymentMethod: row.paymentMethod,
        location: row.location,
        recordedBy: row.recordedBy,
        bank: row.bank,
        slip: row.slip,
        breakdown: row.breakdown,
        isSynced: row.isSynced,
        isSettlement: row.isSettlement,
        clientId: row.clientId,
      } : null,
    }));
    const lastCursor = changes.length > 0 ? changes[changes.length - 1].cursor : String(after);
    res.json({ changes, nextCursor: lastCursor, hasMore: changes.length === limit });
  });
});

// Cursor pagination keeps full history available without forcing a multi-megabyte
// response on the first APK screen. Legacy clients without query parameters retain
// their previous full-history response until they are updated.
app.get('/api/transactions', async (req, res) => {
  const limit = parseTransactionLimit(req.query.limit);
  const beforeId = Number.parseInt(String(req.query.beforeId || ''), 10);
  const values = [];
  const predicates = [];

  if (Number.isInteger(beforeId) && beforeId > 0) {
    values.push(beforeId);
    predicates.push(`id < $${values.length}`);
  }

  let query = `SELECT ${transactionSummaryFields} FROM transactions`;
  if (predicates.length > 0) query += ` WHERE ${predicates.join(' AND ')}`;
  // `id` is exposed as text in the response; qualify the table column so
  // PostgreSQL orders numerically rather than sorting the response alias
  // lexicographically (for example, "36" before "3500").
  query += ' ORDER BY transactions.id DESC';

  if (limit > 0) {
    values.push(limit);
    query += ` LIMIT $${values.length}`;
  }

  await withDatabase(res, async () => {
    const result = await pool.query(query, values);
    res.json(result.rows);
  });
});

app.post('/api/transactions', async (req, res) => {
  const tx = req.body || {};
  await withDatabase(res, async () => {
    const query = `
      INSERT INTO transactions (
        date, manual_date, amount, type, company, person, notes, payment_method,
        location, recorded_by, bank, slip, breakdown, is_synced, is_settlement, client_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13::jsonb, TRUE, $14, $15
      ) RETURNING
        id::text AS id, date, manual_date AS "manualDate", amount::float8 AS amount,
        type, company, person, notes, payment_method AS "paymentMethod", location,
        recorded_by AS "recordedBy", bank, slip, breakdown,
        is_synced AS "isSynced", is_settlement AS "isSettlement", client_id AS "clientId"
    `;
    const values = [
      tx.date || new Date().toISOString(), tx.manualDate || null, Number(tx.amount) || 0,
      tx.type || 'credit', tx.company || null, tx.person || null, tx.notes || '',
      tx.paymentMethod || 'cash', tx.location || '', tx.recordedBy || null,
      tx.bank || null, tx.slip || null, JSON.stringify(tx.breakdown || {}),
      Boolean(tx.isSettlement), tx.clientId || null
    ];
    const result = await pool.query(query, values);
    const transaction = result.rows[0];
    // The REST mutation is authoritative. Broadcast only after Aiven PostgreSQL
    // has returned the committed row, so every client receives the same data.
    const noteInventory = await getCashNoteInventorySnapshot();
    publishTransactionEvent('add', { transaction: transactionForRealtime(transaction), noteInventory });
    res.status(201).json({ id: transaction.id, noteInventory, ok: true });
  });
});

// A receipt is fetched only when the user explicitly opens or edits that row.
app.get('/api/transactions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'A valid transaction id is required.' });
  }
  await withDatabase(res, async () => {
    const result = await pool.query(`
      SELECT ${transactionSelectFields}
      FROM transactions
      WHERE id = $1
    `, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found.' });
    res.json(result.rows[0]);
  });
});

app.put('/api/transactions/:id', async (req, res) => {
  const id = Number(req.params.id);
  const tx = req.body || {};
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'A valid transaction id is required.' });
  }
  await withDatabase(res, async () => {
    const query = `
      UPDATE transactions SET
        date=$1, manual_date=$2, amount=$3, type=$4, company=$5, person=$6,
        notes=$7, payment_method=$8, location=$9, recorded_by=$10, bank=$11,
        slip=CASE WHEN $12 LIKE 'lazy-slip:%' THEN slip ELSE $12 END,
        breakdown=$13::jsonb, is_settlement=$14, client_id=$15
      WHERE id=$16
      RETURNING
        id::text AS id, date, manual_date AS "manualDate", amount::float8 AS amount,
        type, company, person, notes, payment_method AS "paymentMethod", location,
        recorded_by AS "recordedBy", bank, slip, breakdown,
        is_synced AS "isSynced", is_settlement AS "isSettlement", client_id AS "clientId"
    `;
    const values = [
      tx.date || new Date().toISOString(), tx.manualDate || null, Number(tx.amount) || 0,
      tx.type || 'credit', tx.company || null, tx.person || null, tx.notes || '',
      tx.paymentMethod || 'cash', tx.location || '', tx.recordedBy || null,
      tx.bank || null, tx.slip || null, JSON.stringify(tx.breakdown || {}),
      Boolean(tx.isSettlement), tx.clientId || null, id
    ];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found.' });
    const transaction = result.rows[0];
    // Broadcast the committed PostgreSQL row only after a successful update.
    const noteInventory = await getCashNoteInventorySnapshot();
    publishTransactionEvent('update', { transaction: transactionForRealtime(transaction), noteInventory });
    res.json({ id: transaction.id, noteInventory, ok: true });
  });
});

app.delete('/api/transactions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'A valid transaction id is required.' });
  }
  await withDatabase(res, async () => {
    const result = await pool.query('DELETE FROM transactions WHERE id=$1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Transaction not found.' });

    // Broadcast only after PostgreSQL confirms the deletion. This avoids the old
    // race where another device refreshed before the record was actually removed.
    const noteInventory = await getCashNoteInventorySnapshot();
    publishTransactionEvent('delete', { ids: [String(id)], noteInventory });
    res.json({ noteInventory, ok: true });
  });
});

// 5. Proxy & Utility Endpoints
app.post('/telegram/sendMessage', async (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env.PHOTO_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID || process.env.PHOTO_CHAT_ID;
  const message = String(req.body?.message || '').trim();
  if (!botToken || !chatId) return res.status(503).json({ error: 'Telegram integration is not configured on the server.' });
  if (!message || message.length > 4_000) return res.status(400).json({ error: 'Message must contain 1-4000 characters.' });
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error in proxy sendMessage:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/telegram/sendPhoto', async (req, res) => {
  const botToken = process.env.PHOTO_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.PHOTO_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const base64Photo = String(req.body?.base64Photo || '');
  if (!botToken || !chatId) return res.status(503).json({ error: 'Telegram photo integration is not configured on the server.' });
  if (!base64Photo || base64Photo.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'Photo payload is missing or too large.' });
  try {
    const base64Parts = base64Photo.split(',');
    if (base64Parts.length !== 2) return res.status(400).json({ error: 'Invalid base64 photo payload.' });
    const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const bstr = atob(base64Parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    const blob = new Blob([u8arr], { type: mime });

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', blob, 'slip.jpg');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error('Error in proxy sendPhoto:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/telegram/getFileUrl', async (req, res) => {
  const fileId = String(req.query.fileId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(fileId)) return res.status(400).json({ error: 'A valid Telegram fileId is required.' });
  const tokens = [process.env.PHOTO_BOT_TOKEN, process.env.TELEGRAM_BOT_TOKEN].filter(Boolean);
  if (tokens.length === 0) return res.status(503).json({ error: 'Telegram integration is not configured on the server.' });
  try {
    for (const botToken of tokens) {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
      const data = await response.json();
      if (data.ok && data.result?.file_path) {
        return res.json({ proxyUrl: `/telegram/fetchFile?fileId=${encodeURIComponent(fileId)}` });
      }
    }
    return res.status(404).json({ error: 'File not found on Telegram' });
  } catch (error) {
    console.error('Error in proxy getFileUrl:', error);
    return res.status(502).json({ error: 'Unable to resolve Telegram file.' });
  }
});

app.get('/telegram/fetchFile', async (req, res) => {
  const requestedUrl = String(req.query.url || '');
  const fileId = String(req.query.fileId || '').trim();
  const tokens = [process.env.PHOTO_BOT_TOKEN, process.env.TELEGRAM_BOT_TOKEN].filter(Boolean);
  let upstreamUrl = '';

  try {
    if (fileId) {
      if (!/^[A-Za-z0-9_-]{1,256}$/.test(fileId) || tokens.length === 0) {
        return res.status(400).json({ error: 'Invalid Telegram file request.' });
      }
      for (const botToken of tokens) {
        const fileResponse = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
        const fileData = await fileResponse.json();
        if (fileData.ok && fileData.result?.file_path) {
          upstreamUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
          break;
        }
      }
    } else if (requestedUrl) {
      const parsed = new URL(decodeURIComponent(requestedUrl));
      const allowedHosts = new Set(['api.telegram.org', 'cdn.discordapp.com', 'media.discordapp.net']);
      if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname)) {
        return res.status(400).json({ error: 'Upstream file host is not allowed.' });
      }
      upstreamUrl = parsed.toString();
    }

    if (!upstreamUrl) return res.status(404).json({ error: 'File was not found.' });
    const telegramRes = await fetch(upstreamUrl);
    if (!telegramRes.ok) {
      return res.status(telegramRes.status).json({ error: 'Failed to fetch from Telegram' });
    }

    const declaredLength = Number(telegramRes.headers.get('content-length') || 0);
    if (declaredLength > 15 * 1024 * 1024) return res.status(413).json({ error: 'File is too large.' });
    const contentType = telegramRes.headers.get('content-type') || 'application/octet-stream';
    if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(contentType.split(';')[0].trim())) {
      return res.status(415).json({ error: 'Unsupported file type.' });
    }
    const buffer = await telegramRes.arrayBuffer();
    if (buffer.byteLength > 15 * 1024 * 1024) return res.status(413).json({ error: 'File is too large.' });

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*',
    });
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error in fetchFile proxy:', error);
    res.status(500).json({ error: error.message });
  }
});

// Discord Upload Proxy
app.post('/discord/upload', async (req, res) => {
  const base64Data = String(req.body?.base64Data || '');
  const rawFileName = String(req.body?.fileName || 'slip.jpg');
  const fileName = rawFileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'slip.jpg';
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
  if (!base64Data || base64Data.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'Upload is missing or too large.' });
  
  try {
    const base64Parts = base64Data.split(',');
    if (base64Parts.length !== 2) return res.status(400).json({ error: 'Invalid base64 upload payload.' });
    const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) return res.status(415).json({ error: 'Only JPG, PNG, WebP, and PDF files are supported.' });
    const base64Content = base64Parts[1];
    
    const buffer = Buffer.from(base64Content, 'base64');
    if (buffer.length > 15 * 1024 * 1024) return res.status(413).json({ error: 'Upload is too large.' });
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mime });
    formData.append('files[0]', blob, fileName);
    
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Discord returned ${response.status}: ${errText}`);
    }
    
    const result = await response.json();
    res.status(201).json({
      success: true,
      messageId: result.id,
      url: result.attachments?.[0]?.url || ''
    });
  } catch (error) {
    console.error('Error in proxy /discord/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/telegram/deleteMessage', async (req, res) => {
  const botToken = process.env.PHOTO_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.PHOTO_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
  const messageId = Number(req.body?.messageId);
  if (!botToken || !chatId) return res.status(503).json({ error: 'Telegram integration is not configured on the server.' });
  if (!Number.isInteger(messageId) || messageId < 1) return res.status(400).json({ error: 'A valid Telegram messageId is required.' });
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    const data = await response.json();
    return res.status(response.ok ? 200 : response.status).json(data);
  } catch (error) {
    console.error('Error in proxy deleteMessage:', error);
    return res.status(502).json({ error: 'Unable to delete Telegram message.' });
  }
});

app.get('/discord/getFileUrl', async (req, res) => {
  const messageId = String(req.query.messageId || '');
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
  if (!/^\d{17,20}$/.test(messageId)) return res.status(400).json({ error: 'A valid Discord messageId is required.' });

  try {
    const cleanWebhookUrl = webhookUrl.split('?')[0].replace(/\/$/, '');
    const response = await fetch(`${cleanWebhookUrl}/messages/${messageId}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Discord attachment was not found.' });
    }
    const message = await response.json();
    const url = message.attachments?.[0]?.url;
    if (!url) return res.status(404).json({ error: 'No attachment exists for this Discord message.' });
    res.json({ success: true, url });
  } catch (error) {
    console.error('Error resolving Discord attachment URL:', error);
    res.status(500).json({ error: 'Unable to resolve Discord attachment URL.' });
  }
});

app.delete('/discord/deleteMessage/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
  if (!/^\d{17,20}$/.test(messageId)) return res.status(400).json({ error: 'A valid Discord messageId is required.' });
  
  try {
    const cleanWebhookUrl = webhookUrl.split('?')[0].replace(/\/$/, '');
    const deleteUrl = `${cleanWebhookUrl}/messages/${messageId}`;
    
    const response = await fetch(deleteUrl, { method: 'DELETE' });
    if (response.ok || response.status === 204) {
      res.json({ success: true });
    } else {
      const errText = await response.text();
      res.status(response.status).json({ error: errText });
    }
  } catch (error) {
    console.error('Error in proxy /discord/deleteMessage:', error);
    res.status(500).json({ error: error.message });
  }
});

// 6. Socket.IO & Server Setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [...allowedOrigins],
    methods: ['GET', 'POST'],
    credentials: false,
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  allowEIO3: false,
  pingTimeout: 20000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true,
});

io.use(async (socket, next) => {
  try {
    await schemaReady;
    const user = await verifyFirebaseRequestToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('Sign-in required.'));
    socket.data.user = user;
    return next();
  } catch (error) {
    console.error('Socket authentication failed:', error);
    return next(new Error('Authentication service unavailable.'));
  }
});

io.on('connection', (socket) => {
  console.log('⚡ Socket.IO client connected:', socket.id);

  // Transaction writes must always go through the REST API. This compatibility
  // handler deliberately refuses client-originated add/update/delete broadcasts:
  // otherwise another device could receive optimistic data before Aiven confirms it.
  socket.on('transaction-updated', (data, ack) => {
    if (data?.action === 'sync-status-check' && typeof data?.testId === 'string') {
      const diagnosticEvent = {
        action: 'sync-status-check',
        testId: data.testId,
        source: 'server',
        emittedAt: new Date().toISOString(),
      };
      socket.broadcast.emit('trigger-sync', diagnosticEvent);
      if (typeof ack === 'function') ack({ ok: true, accepted: true, diagnostic: true });
      return;
    }

    console.warn(`Ignored client-originated transaction event from ${socket.id}; use the REST API.`);
    if (typeof ack === 'function') {
      ack({
        ok: true,
        accepted: false,
        reason: 'Transaction realtime events are emitted by the server after PostgreSQL confirmation.',
      });
    }
  });

  socket.on('sync-status', (ack) => {
    if (typeof ack === 'function') {
      ack({
        ok: true,
        connected: true,
        socketId: socket.id,
        serverTime: new Date().toISOString(),
      });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ Socket.IO client disconnected: ${socket.id} (${reason})`);
  });
});

// 7. Static Frontend & SPA Catch-all
app.use(express.static(path.join(__dirname, '../dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

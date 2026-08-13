const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const { randomBytes, randomUUID, scryptSync, timingSafeEqual } = require('crypto');

const app = express();

// 1. Middleware FIRST
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));

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

function createPublicUser(row) {
  return {
    uid: row.id,
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
      ADD COLUMN IF NOT EXISTS payment_method TEXT
  `);

  // Older D1-era imports stored breakdown as TEXT. Convert the column once,
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
      display_name TEXT,
      is_admin BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS app_sessions_user_id_idx ON app_sessions(user_id)');
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

// 4. Aiven PostgreSQL authentication (replaces Firebase Auth)
app.post('/api/auth/register', async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  const password = String(req.body?.password || '');
  const displayName = String(req.body?.displayName || email.split('@')[0] || 'User').trim().slice(0, 100);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: 'Use a valid email address and a password with at least 8 characters.' });
  }
  await withDatabase(res, async () => {
    const id = randomUUID();
    const isAdmin = email === 'alienterprese@gmail.com';
    const result = await pool.query(
      `INSERT INTO app_users (id, email, password_hash, display_name, is_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, is_admin`,
      [id, email, hashPassword(password), displayName, isAdmin]
    );
    const token = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [token, id]
    );
    res.status(201).json({ user: createPublicUser(result.rows[0]), token });
  });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normaliseEmail(req.body?.email);
  const password = String(req.body?.password || '');
  await withDatabase(res, async () => {
    const result = await pool.query(
      'SELECT id, email, password_hash, display_name, is_admin FROM app_users WHERE email=$1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO app_sessions (token_hash, user_id, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [token, user.id]
    );
    res.json({ user: createPublicUser(user), token });
  });
});

app.get('/api/auth/me', async (req, res) => {
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign-in required.' });
  await withDatabase(res, async () => {
    const result = await pool.query(
      `SELECT u.id, u.email, u.display_name, u.is_admin
       FROM app_sessions s
       INNER JOIN app_users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.expires_at > NOW()`,
      [token]
    );
    if (result.rowCount === 0) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    res.json({ user: createPublicUser(result.rows[0]) });
  });
});

app.post('/api/auth/logout', async (req, res) => {
  const token = getBearerToken(req);
  if (token) {
    await withDatabase(res, async () => {
      await pool.query('DELETE FROM app_sessions WHERE token_hash=$1', [token]);
      res.json({ ok: true });
    });
    return;
  }
  res.json({ ok: true });
});

// 5. REST API for Transactions (Aiven PostgreSQL)
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

app.get('/api/transactions', async (_req, res) => {
  await withDatabase(res, async () => {
    const result = await pool.query(`
      SELECT
        id::text AS id, date, manual_date AS "manualDate", amount::float8 AS amount,
        type, company, person, notes, payment_method AS "paymentMethod", location,
        recorded_by AS "recordedBy", bank, slip, breakdown,
        is_synced AS "isSynced", is_settlement AS "isSettlement", client_id AS "clientId"
      FROM transactions
      ORDER BY id DESC
    `);
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
    publishTransactionEvent('add', { transaction });
    res.status(201).json({ id: transaction.id, ok: true });
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
        slip=$12, breakdown=$13::jsonb, is_settlement=$14, client_id=$15
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
    publishTransactionEvent('update', { transaction });
    res.json({ id: transaction.id, ok: true });
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
    publishTransactionEvent('delete', { ids: [String(id)] });
    res.json({ ok: true });
  });
});

// 5. Proxy & Utility Endpoints
app.post('/telegram/sendMessage', async (req, res) => {
  const { botToken, chatId, message } = req.body;
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
  const { botToken, chatId, base64Photo } = req.body;
  try {
    const base64Parts = base64Photo.split(',');
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
  const { botToken, fileId } = req.query;
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const data = await response.json();
    if (data.ok) {
      const filePath = data.result.file_path;
      res.json({ url: `https://api.telegram.org/file/bot${botToken}/${filePath}` });
    } else {
      res.status(404).json({ error: 'File not found on Telegram' });
    }
  } catch (error) {
    console.error('Error in proxy getFileUrl:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/telegram/fetchFile', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required' });

  try {
    const telegramRes = await fetch(decodeURIComponent(url));
    if (!telegramRes.ok) {
      return res.status(telegramRes.status).json({ error: 'Failed to fetch from Telegram' });
    }

    const contentType = telegramRes.headers.get('content-type') || 'application/pdf';
    const buffer = await telegramRes.arrayBuffer();

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
  const { base64Data, fileName } = req.body;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return res.status(503).json({ error: 'DISCORD_WEBHOOK_URL is not configured on the server.' });
  
  try {
    const base64Parts = base64Data.split(',');
    const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const base64Content = base64Parts[1];
    
    const buffer = Buffer.from(base64Content, 'base64');
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mime });
    formData.append('files[0]', blob, fileName || 'slip.jpg');
    
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
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  allowEIO3: true,
  pingTimeout: 20000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
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

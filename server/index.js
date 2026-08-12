const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

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
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.query(`
  CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    date TEXT,
    amount NUMERIC,
    type TEXT,
    company TEXT,
    person TEXT,
    notes TEXT,
    paymentMethod TEXT,
    location TEXT,
    recorder TEXT,
    slip TEXT,
    isSynced BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`).catch(err => console.error('Error creating transactions table:', err));

// 3. API Health check endpoint
app.get('/api/health', (req, res) => {
  res.send('Socket Server is running! 🚀');
});

// 4. REST API for Transactions (Aiven PostgreSQL)
app.get('/api/transactions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/transactions', async (req, res) => {
  const { date, amount, type, company, person, notes, paymentMethod, location, recorder, slip } = req.body;
  try {
    const query = `
      INSERT INTO transactions (date, amount, type, company, person, notes, paymentMethod, location, recorder, slip, isSynced)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      RETURNING id
    `;
    const values = [date, amount, type, company, person, notes, paymentMethod, location, recorder, slip];
    const result = await pool.query(query, values);
    res.json({ id: result.rows[0].id.toString(), ok: true });
  } catch (err) {
    console.error('Error adding transaction:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  const { date, amount, type, company, person, notes, paymentMethod, location, recorder, slip } = req.body;
  try {
    const query = `
      UPDATE transactions 
      SET date=$1, amount=$2, type=$3, company=$4, person=$5, notes=$6, paymentMethod=$7, location=$8, recorder=$9, slip=$10
      WHERE id=$11
    `;
    const values = [date, amount, type, company, person, notes, paymentMethod, location, recorder, slip, parseInt(id)];
    await pool.query(query, values);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM transactions WHERE id=$1', [parseInt(id)]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error deleting transaction:', err);
    res.status(500).json({ error: err.message });
  }
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
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1517900238843547811/TuJRHWHrpVGsB6WuqVYOifwNihgrwWCfl0QTSN_uxsBxhEBm6sQ0osFZl9fxa44FORFS';
  
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
    res.json({
      id: result.id,
      url: result.attachments && result.attachments[0] ? result.attachments[0].url : ''
    });
  } catch (error) {
    console.error('Error in proxy /discord/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/discord/deleteMessage/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1517900238843547811/TuJRHWHrpVGsB6WuqVYOifwNihgrwWCfl0QTSN_uxsBxhEBm6sQ0osFZl9fxa44FORFS';
  
  try {
    const parts = webhookUrl.split('/');
    const webhookId = parts[parts.length - 2];
    const webhookToken = parts[parts.length - 1];
    const deleteUrl = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}/messages/${messageId}`;
    
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
  console.log('⚡ User connected:', socket.id);

  socket.on('transaction-updated', (data, ack) => {
    console.log('📢 Data received! Broadcasting to ALL devices...');
    io.emit('trigger-sync', data);
    if (typeof ack === 'function') {
      ack({ ok: true });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
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

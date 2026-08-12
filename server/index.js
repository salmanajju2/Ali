const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
}));


// Health check endpoint
app.get('/', (req, res) => {
  res.send('Socket Server is running! 🚀');
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Proxy function for Telegram Messages
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

// Proxy function for Telegram Photos
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

// Proxy function for Telegram File URLs
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

// ✅ NEW: PDF/File Proxy — Telegram file fetch karke inline serve karo
// Browser isey iframe mein dikhayega (download nahi hoga)
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

    // ✅ inline → browser preview karega (download nahi)
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

// Proxy function for Discord Webhook Uploads
app.post('/discord/upload', async (req, res) => {
  const { base64Data, fileName } = req.body;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1517900238843547811/TuJRHWHrpVGsB6WuqVYOifwNihgrwWCfl0QTSN_uxsBxhEBm6sQ0osFZl9fxa44FORFS';
  
  console.log(`[Backend Upload] Received file upload request. Name: ${fileName}`);
  try {
    const base64Parts = base64Data.split(',');
    const mime = base64Parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const base64Content = base64Parts[1];
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64Content, 'base64');
    console.log(`[Backend Upload] Converted base64 to buffer. Size: ${buffer.length} bytes, Mime: ${mime}`);
    
    // Create form-data
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mime });
    formData.append('files[0]', blob, fileName || 'slip.jpg');
    
    // Send to Discord (with wait=true to get the message details back)
    console.log(`[Backend Upload] Sending file to Discord Webhook...`);
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Backend Upload] Discord Webhook upload failed with status ${response.status}:`, errText);
      throw new Error(`Discord returned ${response.status}: ${errText}`);
    }
    
    const result = await response.json();
    
    // Return message ID and direct attachment URL
    const messageId = result.id;
    const attachmentUrl = result.attachments && result.attachments[0] ? result.attachments[0].url : '';
    console.log(`[Backend Upload] Success! Created Discord Message ID: ${messageId}`);
    
    res.json({
      success: true,
      messageId,
      url: attachmentUrl
    });
  } catch (error) {
    console.error('[Backend Upload] Error in proxy /discord/upload:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy function to get fresh Discord file URL
app.get('/discord/getFileUrl', async (req, res) => {
  const { messageId } = req.query;
  if (!messageId) return res.status(400).json({ error: 'messageId required' });
  
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1517900238843547811/TuJRHWHrpVGsB6WuqVYOifwNihgrwWCfl0QTSN_uxsBxhEBm6sQ0osFZl9fxa44FORFS';
  console.log(`[Backend GetUrl] Request to get URL for messageId: ${messageId}`);
  
  try {
    const response = await fetch(`${webhookUrl}/messages/${messageId}`);
    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Backend GetUrl] Discord message fetch failed with status ${response.status}:`, errText);
      return res.status(response.status).json({ error: `Discord returned ${response.status}: ${errText}` });
    }
    
    const result = await response.json();
    const attachmentUrl = result.attachments && result.attachments[0] ? result.attachments[0].url : '';
    console.log(`[Backend GetUrl] Successfully retrieved attachment URL:`, attachmentUrl);
    res.json({ url: attachmentUrl });
  } catch (error) {
    console.error('[Backend GetUrl] Error in proxy /discord/getFileUrl:', error);
    res.status(500).json({ error: error.message });
  }
});

// Proxy function to delete Discord message
app.delete('/discord/deleteMessage/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL || 'https://discord.com/api/webhooks/1517900238843547811/TuJRHWHrpVGsB6WuqVYOifwNihgrwWCfl0QTSN_uxsBxhEBm6sQ0osFZl9fxa44FORFS';
  console.log(`[Backend Delete] Request to delete messageId: ${messageId}`);
  
  try {
    const response = await fetch(`${webhookUrl}/messages/${messageId}`, {
      method: 'DELETE',
    });
    
    if (response.ok || response.status === 204) {
      console.log(`[Backend Delete] Message ${messageId} deleted successfully from Discord.`);
      res.json({ success: true });
    } else {
      const errText = await response.text();
      console.error(`[Backend Delete] Discord message delete failed with status ${response.status}:`, errText);
      res.status(response.status).json({ error: `Discord returned ${response.status}: ${errText}` });
    }
  } catch (error) {
    console.error('[Backend Delete] Error in proxy /discord/deleteMessage:', error);
    res.status(500).json({ error: error.message });
  }
});


const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins for easier sync across Vercel/APK
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["*"]
  },
  allowEIO3: true,
  pingTimeout: 20000,    // Faster timeout detection (was 60000)
  pingInterval: 10000,   // More frequent pings (was 25000)
  transports: ['websocket', 'polling'], // WebSocket first for real-time
  upgrade: true,
  allowUpgrades: true,
  perMessageDeflate: false // Disable compression for faster transmission
});

io.on('connection', (socket) => {
  console.log('⚡ User connected:', socket.id);

  // Jab koi device data bhej raha ho
  socket.on('transaction-updated', (data, ack) => {
    console.log('📢 Data received! Broadcasting to ALL devices...');
    // Sabhi devices (including sender) ko data bhej do
    io.emit('trigger-sync', data);
    if (typeof ack === 'function') {
      ack({ ok: true });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ User disconnected');
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});

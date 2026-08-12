const { io } = require('socket.io-client');

const socket = io('https://ali-studio-server-wa1g.onrender.com', {
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('Connected to socket server:', socket.id);
  console.log('Emitting transaction-updated...');
  socket.emit('transaction-updated', { action: 'test', transaction: { id: 123 } });
});

socket.on('trigger-sync', (data) => {
  console.log('Received trigger-sync:', data);
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('Connect error:', err);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout after 10s');
  process.exit(1);
}, 10000);

import { io } from 'socket.io-client';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const testId = `non-mutating-sync-check-${Date.now()}`;
const socket = io(origin, {
  transports: ['websocket', 'polling'],
  timeout: 20_000,
  reconnection: false,
});

const fail = (message) => {
  console.error(JSON.stringify({ ok: false, message }));
  socket.close();
  process.exit(1);
};

const timer = setTimeout(() => fail('Socket.IO diagnostic timed out after 25 seconds.'), 25_000);

socket.on('connect_error', (error) => {
  clearTimeout(timer);
  fail(`Socket.IO connection failed: ${error.message}`);
});

socket.on('connect', () => {
  socket.emit('sync-status', (status) => {
    if (!status?.ok || !status?.connected) {
      clearTimeout(timer);
      fail('Socket connected but sync-status acknowledgement was invalid.');
      return;
    }

    socket.emit('transaction-updated', { action: 'sync-status-check', testId }, (diagnostic) => {
      clearTimeout(timer);
      const ok = diagnostic?.ok === true && diagnostic?.accepted === true && diagnostic?.diagnostic === true;
      console.log(JSON.stringify({
        ok,
        transport: socket.io.engine.transport.name,
        socketId: socket.id,
        syncStatus: status,
        diagnostic,
        testId,
      }));
      socket.close();
      process.exit(ok ? 0 : 1);
    });
  });
});

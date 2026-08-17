import { io } from 'socket.io-client';

const origin = process.env.ALI_API_ORIGIN || 'https://ali-ltyt.onrender.com';
const testId = `non-mutating-sync-check-${Date.now()}`;
const options = {
  transports: ['websocket', 'polling'],
  timeout: 20_000,
  reconnection: false,
};
const sender = io(origin, options);
const receiver = io(origin, options);
let completed = false;

const closeAll = () => {
  sender.close();
  receiver.close();
};

const fail = (message) => {
  if (completed) return;
  completed = true;
  console.error(JSON.stringify({ ok: false, message }));
  closeAll();
  process.exit(1);
};

const timer = setTimeout(() => fail('Socket.IO two-client diagnostic timed out after 25 seconds.'), 25_000);

[sender, receiver].forEach((socket, index) => {
  socket.on('connect_error', (error) => fail(`Socket ${index + 1} connection failed: ${error.message}`));
});

receiver.on('trigger-sync', (event) => {
  if (event?.action !== 'sync-status-check' || event?.testId !== testId) return;
  if (completed) return;
  completed = true;
  clearTimeout(timer);
  console.log(JSON.stringify({
    ok: true,
    senderTransport: sender.io.engine.transport.name,
    receiverTransport: receiver.io.engine.transport.name,
    senderSocketId: sender.id,
    receiverSocketId: receiver.id,
    receivedEvent: event,
  }));
  closeAll();
  process.exit(0);
});

const emitDiagnosticWhenReady = () => {
  if (!sender.connected || !receiver.connected) return;
  sender.emit('sync-status', (status) => {
    if (!status?.ok || !status?.connected) {
      fail('Sender connected but sync-status acknowledgement was invalid.');
      return;
    }
    sender.emit('transaction-updated', { action: 'sync-status-check', testId }, (diagnostic) => {
      if (diagnostic?.ok !== true || diagnostic?.accepted !== true || diagnostic?.diagnostic !== true) {
        fail('Server did not accept the non-mutating two-client diagnostic event.');
      }
    });
  });
};

sender.on('connect', emitDiagnosticWhenReady);
receiver.on('connect', emitDiagnosticWhenReady);

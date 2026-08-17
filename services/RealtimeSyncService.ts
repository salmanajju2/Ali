import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from './apiConfig';

class RealtimeSyncService {
  private socket: Socket | null = null;
  private isInitialized = false;
  private syncCallback: ((data?: any) => Promise<void>) | null = null;
  private pollCallback: (() => Promise<void>) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;

  private getSocketUrl() {
    // In a native APK the frontend runs under a local WebView origin. The
    // shared origin helper selects the public Render Socket.IO host there.
    return API_ORIGIN;
  }

  constructor() {
    this.init();
    this.registerCapacitorLifecycle();
  }

  public setSyncCallback(callback: (data?: any) => Promise<void>) {
    this.syncCallback = callback;

    // AppContext callback socket connection ke baad register ho sakta hai. Agar
    // connect event pehle fire ho gaya, toh initial server refresh miss nahi hona chahiye.
    if (this.socket?.connected) {
      void this.syncCallback({ action: 'sync', reason: 'callback-registered' });
    }
  }

  public setPollCallback(callback: () => Promise<void>) {
    this.pollCallback = callback;
  }

  public setStatusCallback(callback: (connected: boolean) => void) {
    this.onStatusChange = callback;

    // AppContext ka callback socket ke `connect` event ke baad register ho sakta hai.
    // Current state immediately replay karne se already-connected socket stale
    // `Offline` indicator nahi dikhata.
    callback(this.isSocketConnected());
  }

  private async init() {
    if (this.isInitialized) return;

    const socketUrl = this.getSocketUrl();
    console.log(`Connecting to Socket Server at ${socketUrl}...`);

    // Pre-warm Render server: Send a simple GET request to wake it up
    fetch(socketUrl).catch(() => { /* ignore error, just waking up */ });

    this.socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      timeout: 20000, 
      // WebSocket first gives live Web → APK events the lowest latency. If a mobile
      // proxy/network blocks it, Socket.IO automatically falls back to polling.
      transports: ['websocket', 'polling'],
      autoConnect: true,
      withCredentials: false,
      forceNew: true,
      perMessageDeflate: false as any,
      upgrade: true,
      rememberUpgrade: true
    });

    // 💪 Optimized Render Cold-Start Mitigation:
    // Periodic background intervals removed. Instead, trigger a lightweight health wake-up
    // on user interaction, app foregrounding, or transaction mutation attempts.
    const wakeUpServer = () => {
      fetch(socketUrl, { method: 'GET', mode: 'no-cors' }).catch(() => { /* ignore */ });
    };

    // Wake up server on initial init and window focus / touch
    wakeUpServer();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', wakeUpServer, { passive: true });
      window.addEventListener('touchstart', wakeUpServer, { once: true, passive: true });
    }

    this.socket.on('connect', () => {
      console.log('Connected to Socket Server.');
      if (this.onStatusChange) this.onStatusChange(true);

      // A device can miss an event while Android WebView reconnects after a
      // background/network transition. Ask AppContext for one authoritative
      // PostgreSQL refresh as soon as the socket is available again.
      void this.syncCallback?.({ action: 'sync', reason: 'socket-connected' });
      // Explicitly ask for reconciliation as well. This keeps the APK correct if
      // a proxy restored a stale transport without replaying its missed broadcast.
      this.socket?.emit('transaction-updated', { action: 'sync-status-check', testId: `apk-reconnect-${Date.now()}` });
    });

    this.socket.on('trigger-sync', async (data: any) => {
      console.log('Received sync trigger:', data.action);
      if (this.syncCallback) {
        await this.syncCallback(data);
      }
    });

    this.socket.on('disconnect', (reason) => {
      if (this.onStatusChange) this.onStatusChange(false);
      if (reason === 'io server disconnect' || reason === 'transport close') {
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
      if (this.onStatusChange) this.onStatusChange(false);
    });

    this.isInitialized = true;
  }

  private lastPollTime = 0;
  private readonly POLL_DEBOUNCE_MS = 1500; // fast foreground refresh without repeated storms

  private registerCapacitorLifecycle() {
    setTimeout(() => {
      try {
        import('@capacitor/app').then((mod) => {
          mod.App.addListener('appStateChange', (state: { isActive: boolean }) => {
            if (state.isActive) {
              const now = Date.now();
              if (now - this.lastPollTime < this.POLL_DEBOUNCE_MS) {
                console.log('App foregrounded. Socket reconnect only (poll debounced).');
                if (this.socket && !this.socket.connected) {
                  this.socket.connect();
                }
                return;
              }
              this.lastPollTime = now;
              console.log('App foregrounded. Reconnecting socket and refreshing data.');
              if (this.socket && !this.socket.connected) {
                this.socket.connect();
              }
              void this.pollCallback?.();
            }
          });
          console.log('Capacitor App lifecycle listener registered.');
        }).catch(() => {
          // Browser mode.
        });
      } catch (_) {
        // Capacitor runtime not available.
      }
    }, 2000);
  }

  public notifyUpdate(data: any): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.socket) { resolve(); return; }

      if (!this.socket.connected) {
        this.socket.connect();
      }

      console.log('Broadcasting via Socket...', data.action);
      this.socket.emit('transaction-updated', data);
      resolve();
    });
  }

  public isSocketConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  public reconnect() {
    console.log('Manual reconnect triggered...');
    if (this.socket) {
      this.socket.disconnect().connect();
    } else {
      this.isInitialized = false;
      this.init();
    }
  }
}

export const realtimeSync = new RealtimeSyncService();

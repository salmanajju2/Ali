import { io, Socket } from 'socket.io-client';

class RealtimeSyncService {
  private socket: Socket | null = null;
  private isInitialized = false;
  private syncCallback: ((data?: any) => Promise<void>) | null = null;
  private pollCallback: (() => Promise<void>) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;

  private getSocketUrl() {
    return import.meta.env.VITE_SOCKET_URL || window.location.origin;
  }

  constructor() {
    this.init();
    this.registerCapacitorLifecycle();
  }

  public setSyncCallback(callback: (data?: any) => Promise<void>) {
    this.syncCallback = callback;
  }

  public setPollCallback(callback: () => Promise<void>) {
    this.pollCallback = callback;
  }

  public setStatusCallback(callback: (connected: boolean) => void) {
    this.onStatusChange = callback;
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
      transports: ['polling', 'websocket'], // Polling first — Render.com ke liye zaroori
      autoConnect: true,
      withCredentials: false,
      forceNew: true,
      perMessageDeflate: false as any,
      upgrade: true,
      rememberUpgrade: true
    });

    // 💪 Keep-alive: Render.com 15 min mein server sleep kar deta hai
    // Har 14 min mein ek ping bhejte hain taaki server jaag raha rahe
    const keepAliveInterval = setInterval(() => {
      fetch(socketUrl, { method: 'GET' }).catch(() => { /* ignore */ });
      console.log('📶 Keep-alive ping sent to Render server.');
    }, 14 * 60 * 1000); // 14 minutes

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => clearInterval(keepAliveInterval));

    this.socket.on('connect', () => {
      console.log('Connected to Socket Server.');
      if (this.onStatusChange) this.onStatusChange(true);
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
  private readonly POLL_DEBOUNCE_MS = 5000; // 5 second debounce

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

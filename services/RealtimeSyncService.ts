import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from './apiConfig';
import { getRealtimeRecoveryDelay } from './realtimeRecovery';

class RealtimeSyncService {
  private socket: Socket | null = null;
  private isInitialized = false;
  private syncCallback: ((data?: any) => Promise<void>) | null = null;
  private pollCallback: (() => Promise<void>) | null = null;
  private onStatusChange: ((connected: boolean) => void) | null = null;
  private wakeUpServer: (() => void) | null = null;
  private lastForegroundRecoveryAt = 0;
  private foregroundRecoveryTimer: number | undefined;
  private readonly FOREGROUND_RECOVERY_DEBOUNCE_MS = 1500;

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

  /**
   * Android WebView can report a connected socket briefly after a network or
   * background transition even when it missed a broadcast. Probe the connection
   * and run one authoritative refresh. Rapid transitions keep a trailing refresh
   * instead of dropping it entirely.
   */
  private requestForegroundRecovery(reason: string) {
    const delay = getRealtimeRecoveryDelay(
      Date.now(),
      this.lastForegroundRecoveryAt,
      this.FOREGROUND_RECOVERY_DEBOUNCE_MS,
    );

    if (this.foregroundRecoveryTimer !== undefined) {
      window.clearTimeout(this.foregroundRecoveryTimer);
      this.foregroundRecoveryTimer = undefined;
    }

    if (delay === 0) {
      this.performForegroundRecovery(reason);
      return;
    }

    this.foregroundRecoveryTimer = window.setTimeout(() => {
      this.foregroundRecoveryTimer = undefined;
      this.performForegroundRecovery(reason);
    }, delay);
  }

  private performForegroundRecovery(reason: string) {
    this.lastForegroundRecoveryAt = Date.now();
    this.wakeUpServer?.();

    const socket = this.socket;
    if (!socket) {
      this.isInitialized = false;
      void this.init();
      return;
    }

    if (!socket.connected) {
      socket.connect();
      return;
    }

    socket.timeout(5000).emit(
      'sync-status',
      (error: Error | null, status?: { connected?: boolean }) => {
        if (error || !status?.connected) {
          console.warn(`Realtime health probe failed after ${reason}; reconnecting Socket.IO.`);
          socket.disconnect().connect();
          return;
        }
        void this.pollCallback?.();
      },
    );
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
    this.wakeUpServer = wakeUpServer;

    // Wake up and validate the connection when a browser tab or Android WebView
    // becomes active again. This closes the missed-event gap after backgrounding.
    wakeUpServer();
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => this.requestForegroundRecovery('window-focus'), { passive: true });
      window.addEventListener('online', () => this.requestForegroundRecovery('network-online'), { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.requestForegroundRecovery('visibility-visible');
      });
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

  private registerCapacitorLifecycle() {
    setTimeout(() => {
      try {
        import('@capacitor/app').then((mod) => {
          mod.App.addListener('appStateChange', (state: { isActive: boolean }) => {
            if (state.isActive) {
              console.log('App foregrounded. Validating Socket.IO and refreshing authoritative data.');
              this.requestForegroundRecovery('app-foreground');
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

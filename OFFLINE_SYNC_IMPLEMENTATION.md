# Offline Data Sync & Local Storage Implementation

Ali Enterprises application ko **Offline-First** banane ke liye niche diya gaya code implementation use karein. Yeh logic ensure karta hai ki agar internet nahi hai, to data device par save ho jaye aur online aate hi automatically server (Aiven PostgreSQL) par sync ho jaye.

## 1. LocalDBService.ts (IndexedDB with Sync Queue)

Pehle hum apne `LocalDBService` ko update karenge taaki usme ek `pending_sync` store ho.

```typescript
// services/LocalDBService.ts
import { Transaction } from '../types';

const DB_NAME = 'ali_enterprises_db';
const STORE_NAME = 'transactions';
const SYNC_STORE = 'pending_sync'; // Naya store pending sync ke liye
const DB_VERSION = 3;

class IndexedDBService {
  private static instance: IndexedDBService;
  private db: IDBDatabase | null = null;

  public static getInstance(): IndexedDBService {
    if (!IndexedDBService.instance) {
      IndexedDBService.instance = new IndexedDBService();
    }
    return IndexedDBService.instance;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        // Transactions Store
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }
        // Pending Sync Store (Offline transactions yahan queue hongi)
        if (!db.objectStoreNames.contains(SYNC_STORE)) {
          db.createObjectStore(SYNC_STORE, { keyPath: 'clientId' });
        }
      };
      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve(this.db!);
      };
      request.onerror = (event: any) => reject(event.target.error);
    });
  }

  // Pending sync mein data add karein
  public async addToSyncQueue(transaction: any): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([SYNC_STORE], 'readwrite');
    tx.objectStore(SYNC_STORE).put(transaction);
  }

  // Saare pending items nikaalein
  public async getSyncQueue(): Promise<any[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction([SYNC_STORE], 'readonly');
      const request = tx.objectStore(SYNC_STORE).getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  // Sync hone ke baad queue se hatayein
  public async removeFromSyncQueue(clientId: string): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([SYNC_STORE], 'readwrite');
    tx.objectStore(SYNC_STORE).delete(clientId);
  }
}

export const localDB = IndexedDBService.getInstance();
```

## 2. SyncService.ts (Background Auto-Sync)

Yeh service internet connection monitor karegi aur pending data ko push karegi.

```typescript
// services/SyncService.ts
import { localDB } from './LocalDBService';

export const startSyncManager = (apiCall: (data: any) => Promise<any>) => {
  const processQueue = async () => {
    if (!navigator.onLine) return;

    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return;

    console.log(`🔄 Syncing ${queue.length} pending transactions...`);

    for (const item of queue) {
      try {
        await apiCall(item);
        await localDB.removeFromSyncQueue(item.clientId);
        console.log(`✅ Synced: ${item.clientId}`);
      } catch (error) {
        console.error(`❌ Sync failed for ${item.clientId}:`, error);
        break; // Error aane par stop karein (next retry mein check hoga)
      }
    }
  };

  // Event Listeners for online/offline
  window.addEventListener('online', processQueue);
  
  // Periodic check (every 30 seconds)
  setInterval(processQueue, 30000);
  
  // Initial check
  processQueue();
};
```

## 3. AppContext.tsx Integration

Add Transaction function ko update karein taaki wo offline mode handle kare.

```typescript
// context/AppContext.tsx (AddTransaction inside AppProvider)

const addTransaction = async (data: any) => {
  const newTx = {
    ...data,
    id: generateTempId(), // Temporary ID for local display
    clientId: generateClientId(),
    status: 'pending'
  };

  // 1. Pehle Local Database (IndexedDB) mein save karein (Immediate UI Update)
  await localDB.saveTransaction(newTx);
  setTransactions(prev => [newTx, ...prev]);

  // 2. Agar online hai to API call karein
  if (navigator.onLine) {
    try {
      await axios.post('/api/transactions', newTx);
      // Success: status update karein
      await localDB.saveTransaction({ ...newTx, status: 'synced' });
    } catch (error) {
      // API fail: Queue mein daal dein
      await localDB.addToSyncQueue(newTx);
    }
  } else {
    // Offline: Direct queue mein daal dein
    await localDB.addToSyncQueue(newTx);
  }
};
```

## Key Benefits:
1. **Zero Data Loss**: Transaction hamesha pehle device par save hoti hai.
2. **Instant UI**: User ko loading spinner ka wait nahi karna padta.
3. **Background Sync**: User ko manually sync button dabane ki zaroorat nahi hai.
4. **Capacitor Compatible**: Yeh IndexedDB approach Android APK aur Web dono par perfect kaam karti hai.

import { Transaction } from '../types';

const DB_NAME = 'ali_enterprises_db';
const STORE_NAME = 'transactions';
const DB_VERSION = 2; // Version 2: date index added for faster sorting

class IndexedDBService {
  private static instance: IndexedDBService;
  private db: IDBDatabase | null = null;

  public static getInstance(): IndexedDBService {
    if (!IndexedDBService.instance) {
      IndexedDBService.instance = new IndexedDBService();
    }
    return IndexedDBService.instance;
  }

  private constructor() {
    this.cleanupLegacyStorage();
  }

  private cleanupLegacyStorage() {
    try {
      const STORAGE_KEY = 'ali_enterprises_transactions';
      if (localStorage.getItem(STORAGE_KEY)) {
        console.log('🧹 Cleaning up legacy localStorage data...');
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.warn('Legacy storage cleanup skipped:', e);
    }
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          // Date index: sorting/filtering by date bahut faster hoga
          store.createIndex('date', 'date', { unique: false });
        } else {
          // Version upgrade: existing store mein index add karo
          const transaction = event.target.transaction;
          const store = transaction.objectStore(STORE_NAME);
          if (!store.indexNames.contains('date')) {
            store.createIndex('date', 'date', { unique: false });
          }
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        // A page that stays open during a database upgrade must reopen the
        // connection cleanly instead of using a stale IndexedDB handle.
        this.db!.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve(this.db!);
      };

      request.onerror = (event: any) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  public async saveTransaction(transaction: Transaction): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transactionObj = db.transaction([STORE_NAME], 'readwrite');
      const store = transactionObj.objectStore(STORE_NAME);
      const request = store.put(transaction);

      request.onsuccess = () => resolve();
      request.onerror = (event: any) => reject(event.target.error);
    });
  }

  public async getTransactions(): Promise<Transaction[]> {
    try {
      const db = await this.getDB();
      return await new Promise((resolve, reject) => {
        const transactionObj = db.transaction([STORE_NAME], 'readonly');
        const store = transactionObj.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event: any) => reject(event.target.error);
        transactionObj.onabort = (event: any) => reject(event.target.error || new Error('IndexedDB read aborted'));
      });
    } catch (error) {
      // The cloud database remains authoritative. If a device has a stale or
      // blocked IndexedDB handle, continue with an empty local cache and fetch
      // the server copy instead of failing the entire sync operation.
      console.warn('Local transaction cache unavailable; continuing with server sync:', error);
      this.db?.close();
      this.db = null;
      return [];
    }
  }

  public async deleteTransaction(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transactionObj = db.transaction([STORE_NAME], 'readwrite');
      const store = transactionObj.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = (event: any) => reject(event.target.error);
    });
  }

  public async clearTransactions(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transactionObj = db.transaction([STORE_NAME], 'readwrite');
      const store = transactionObj.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = (event: any) => reject(event.target.error);
    });
  }

  public async clearAndRepopulateTransactions(transactions: Transaction[]): Promise<void> {
    await this.clearTransactions();
    // Empty array case: sirf clear karo, kuch add karna nahi
    if (transactions.length === 0) return;

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transactionObj = db.transaction([STORE_NAME], 'readwrite');
      const store = transactionObj.objectStore(STORE_NAME);
      
      try {
        transactions.forEach(tx => {
          if (!tx || !tx.id) {
            console.warn('⚠️ Skipping invalid transaction in IndexedDB:', tx);
            return;
          }
          store.put(tx);
        });
      } catch (e) {
        console.error('❌ Error during batch put in IndexedDB:', e);
      }

      transactionObj.oncomplete = () => resolve();
      transactionObj.onerror = (event: any) => {
        console.error('❌ IndexedDB Transaction Error:', event.target.error);
        reject(event.target.error);
      };
    });
  }
}

export const localDB = IndexedDBService.getInstance();
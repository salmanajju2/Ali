import { Transaction } from '../types';

// Configuration for Cloudflare D1 Worker
const D1_DATABASE_CONFIG = {
  workerUrl: (import.meta.env && import.meta.env.VITE_D1_WORKER_URL) ||
    'https://ali-enterprises-d1-worker.ali-enterprises.workers.dev',
};

/**
 * Generates a stable unique ID based on transaction content
 * Used as a fallback when server ID is missing
 */
function generateFallbackId(row: any): string {
  // Make the hash more unique by including more fields
  const content = `${row.date}-${row.amount}-${row.company}-${row.person}-${row.notes || ''}-${row.paymentMethod || ''}-${row.location || ''}`;
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `recovered_${Math.abs(hash)}`;
}

// D1 Database service using Cloudflare Worker
export class D1DatabaseService {
  private static instance: D1DatabaseService;
  private workerUrl: string;
  private readonly FETCH_TIMEOUT_MS = 15000; // 15 second timeout

  private constructor() {
    this.workerUrl = D1_DATABASE_CONFIG.workerUrl;
    console.log('🔗 D1 Worker URL:', this.workerUrl);
  }

  // Helper: fetch with timeout to prevent indefinite hangs
  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public static getInstance(): D1DatabaseService {
    if (!D1DatabaseService.instance) {
      D1DatabaseService.instance = new D1DatabaseService();
    }
    return D1DatabaseService.instance;
  }

  // Test connection to D1 Worker
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(this.workerUrl + '?action=test', {
        method: 'GET',
      });
      if (response.ok) {
        const text = await response.text();
        return text === 'OK';
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to D1 Worker:', error);
      return false;
    }
  }

  // Initialize D1 Table
  async initializeDatabase(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'initialize' })
      });
      return response.ok;
    } catch (error) {
      console.error('Failed to initialize D1 Database:', error);
      return false;
    }
  }

  /**
   * REPAIR DATABASE SCHEMA
   * Fixes ID column to be proper INTEGER AUTOINCREMENT and regenerates all IDs correctly.
   */
  async repairDatabase(): Promise<{ success: boolean, message?: string, error?: string }> {
    try {
      console.log('🛠️ Requesting Database Schema Repair...');
      const response = await fetch(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'repair' })
      });
      return await response.json();
    } catch (error) {
      console.error('Failed to repair database:', error);
      return { success: false, error: 'Network error during repair' };
    }
  }

  // Add transaction to D1
  // ✅ FIX: Global lock HATAYA — ab concurrent uploads allowed hain
  // Pehle isAddingTransaction flag tha jo dusri upload silently drop kar deta tha (data loss!)
  async addTransaction(transaction: Transaction): Promise<string | null> {
    try {
      // NOTE: We EXCLUDE the 'id' field to let SQLite handle AUTOINCREMENT
      const { id, ...dataWithoutId } = transaction;

      const response = await this.fetchWithTimeout(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'add',
          data: {
            ...dataWithoutId,
            clientId: transaction.clientId || transaction.id,
            breakdown: JSON.stringify(transaction.breakdown)
          }
        })
      });

      if (response.ok) {
        const result = await response.json();
        let assignedId = result.id;

        // Fallback for ID retrieval
        if (!assignedId) {
          try {
            const lastIdResponse = await this.fetchWithTimeout(this.workerUrl + '?action=getLastId', { method: 'GET' });
            if (lastIdResponse.ok) {
              const lastIdData = await lastIdResponse.json();
              if (lastIdData.lastId) assignedId = lastIdData.lastId;
            }
          } catch (e) { }
        }

        return assignedId ? assignedId.toString() : null;
      }
      console.error(`D1 addTransaction failed with HTTP ${response.status}`);
      return null;
    } catch (error) {
      console.error('Failed to add transaction to D1:', error);
      return null;
    }
  }

  // Update transaction in D1
  async updateTransaction(transaction: Transaction): Promise<boolean> {
    try {
      console.log(`Updating transaction ${transaction.id} in D1...`);
      const response = await this.fetchWithTimeout(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          data: {
            id: transaction.id,
            date: transaction.date || new Date().toISOString(),
            type: transaction.type,
            paymentMethod: transaction.paymentMethod,
            company: transaction.company || '',
            person: transaction.person || '',
            location: transaction.location || '',
            recordedBy: transaction.recordedBy || '',
            amount: transaction.amount || 0,
            notes: transaction.notes || '',
            breakdown: JSON.stringify(transaction.breakdown || {}),
            bank: transaction.bank || '',
            slip: transaction.slip || ''
          }
        })
      });

      if (!response.ok) {
        console.error(`D1 update failed with status: ${response.status}`);
        return false;
      }

      const result = await response.json().catch(() => null);
      if (result?.success === false || result?.error) {
        console.error('D1 update failed:', result.error || result);
        return false;
      }

      console.log(`✅ Transaction ${transaction.id} updated in D1`);
      return true;
    } catch (error) {
      console.error('Failed to update transaction in D1:', error);
      return false;
    }
  }

  // Delete transaction from D1
  async deleteTransaction(transactionId: string): Promise<boolean> {
    try {
      console.log('Deleting transaction from D1:', transactionId);

      // If it's a recovered ID, we send null to the worker to trigger orphan cleanup (id IS NULL)
      const idToSend = (typeof transactionId === 'string' && transactionId.startsWith('recovered_')) ? null : transactionId;

      const response = await this.fetchWithTimeout(this.workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'delete', id: idToSend })
      });
      const result = await response.json().catch(() => null);
      // ✅ FIX: JSON result.success bhi check karo — sirf HTTP 200 kaafi nahi
      return response.ok && (result?.success !== false);
    } catch (error) {
      console.error('Failed to delete transaction from D1:', error);
      return false;
    }
  }

  // Mapper function to normalize rows
  private mapRowToTransaction(row: any): Transaction {
    // RECOVERY LOGIC: If ID is null/missing, use clientId first, then fallback hash
    let finalId = row.id;
    if (finalId === null || finalId === undefined || finalId === "" || finalId === "null") {
      // Prioritize clientId if it exists on the row
      if (row.clientId) {
        finalId = row.clientId.toString();
      } else {
        finalId = generateFallbackId(row);
      }
      console.warn(`🛠️ Missing ID on server for transaction of ${row.amount}. Assigned: ${finalId}`);
    } else {
      finalId = finalId.toString();
    }

    return {
      ...row,
      id: finalId,
      amount: parseFloat(row.amount) || 0,
      breakdown: typeof row.breakdown === 'string' ? JSON.parse(row.breakdown) : (row.breakdown || {}),
      isSynced: true
    };
  }

  // Get all transactions (limit -1 means no limit)
  async getAllTransactions(limit: number = -1): Promise<Transaction[]> {
    try {
      console.log(`Fetching latest ${limit} transactions from D1`);
      const url = new URL(this.workerUrl);
      url.searchParams.append('action', 'getAll');
      url.searchParams.append('limit', limit.toString());
      url.searchParams.append('_t', Date.now().toString());

      const response = await this.fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: { 
          'Accept': 'application/json', 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.transactions && Array.isArray(data.transactions)) {
          return data.transactions.map((row: any) => this.mapRowToTransaction(row));
        }
        throw new Error('Invalid data format from server');
      } else {
        throw new Error(`Failed to fetch from D1, HTTP Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to fetch transactions from D1:', error);
      throw error;
    }
  }

  // Get new transactions
  async getNewTransactions(lastId: number): Promise<Transaction[]> {
    try {
      const url = new URL(this.workerUrl);
      url.searchParams.append('action', 'getNew');
      url.searchParams.append('lastId', lastId.toString());
      url.searchParams.append('_t', Date.now().toString());

      const response = await this.fetchWithTimeout(url.toString(), {
        method: 'GET',
        headers: { 
          'Accept': 'application/json', 
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.transactions && Array.isArray(data.transactions)) {
          return data.transactions.map((row: any) => this.mapRowToTransaction(row));
        }
        throw new Error('Invalid data format from server');
      } else {
        throw new Error(`Failed to fetch from D1, HTTP Status: ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to sync new transactions:', error);
      throw error;
    }
  }

  // Sync logic
  async syncWithD1(localTransactions: Transaction[]): Promise<Transaction[]> {
    try {
      const d1Transactions = await this.getAllTransactions();
      if (d1Transactions.length > 0) return d1Transactions;

      for (const transaction of localTransactions) {
        await this.addTransaction(transaction);
      }
      return localTransactions;
    } catch (error) {
      return localTransactions;
    }
  }

  // Compatibility wrappers for Aiven methods
  async getRecentTransactions(limit: number = 1000): Promise<Transaction[]> {
    return this.getAllTransactions(limit);
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    try {
      const all = await this.getAllTransactions(-1);
      return all.find(t => String(t.id) === String(id)) || null;
    } catch {
      return null;
    }
  }

  async deleteTransactions(ids: string[]): Promise<string[] | null> {
    const confirmed: string[] = [];
    for (const id of ids) {
      const success = await this.deleteTransaction(id);
      if (success) confirmed.push(id);
    }
    return confirmed.length > 0 ? confirmed : null;
  }

  async getTransactionChanges(_cursor: number, _limit: number): Promise<{ changes: any[], cursor: number, hasMore: boolean, nextCursor: string }> {
    return { changes: [], cursor: Date.now(), hasMore: false, nextCursor: String(_cursor) };
  }

  async getCashNoteInventory(): Promise<{ counts: any }> {
    return { counts: {} };
  }

  async getUserCashNoteInventory(_keys: any): Promise<{ counts: any }> {
    return { counts: {} };
  }

  async getTransactionsModifiedSince(_timestamp: any): Promise<Transaction[]> {
    return this.getAllTransactions(-1);
  }
}

export const d1Database = D1DatabaseService.getInstance();

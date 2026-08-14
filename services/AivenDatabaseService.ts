// PostgreSQL Database service via Backend API
import { API_ORIGIN } from './apiConfig';

export class AivenDatabaseService {
  private static instance: AivenDatabaseService;
  private baseUrl: string;
  // Render free instances can need more than 15 seconds to wake and establish
  // their first database connection on a mobile network.
  private readonly FETCH_TIMEOUT_MS = 45000;

  private constructor() {
    this.baseUrl = API_ORIGIN;
    console.log('🔗 PostgreSQL Backend API Service initialized.');
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    // Render and Aiven can briefly be unavailable while a free instance wakes.
    // Retrying prevents that transient state from being treated as data loss.
    const maximumAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        const isTransientServerError =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        if (!isTransientServerError || attempt === maximumAttempts) {
          return response;
        }
      } catch (error) {
        lastError = error;
        if (attempt === maximumAttempts) throw error;
      } finally {
        clearTimeout(timeoutId);
      }

      await new Promise(resolve => setTimeout(resolve, 1500 * attempt));
    }

    throw lastError instanceof Error ? lastError : new Error('Unable to reach the backend API.');
  }

  public static getInstance(): AivenDatabaseService {
    if (!AivenDatabaseService.instance) {
      AivenDatabaseService.instance = new AivenDatabaseService();
    }
    return AivenDatabaseService.instance;
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/health`, { method: 'GET' });
      return response.ok;
    } catch (error) {
      console.error('Failed to connect to backend API:', error);
      return false;
    }
  }

  async initializeDatabase(): Promise<boolean> {
    return true; // Handled on backend startup
  }

  async repairDatabase(): Promise<{ success: boolean, message?: string, error?: string }> {
    return { success: true };
  }

  async getAllTransactions(limit = -1): Promise<any[]> {
    try {
      const query = limit > 0 ? `?limit=${encodeURIComponent(limit)}` : '';
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions${query}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching transactions from PostgreSQL:', error);
      throw error;
    }
  }

  async getRecentTransactions(limit = 500): Promise<any[]> {
    try {
      const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 2_000);
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}/api/transactions/recent?limit=${encodeURIComponent(safeLimit)}`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching recent transactions from PostgreSQL:', error);
      throw error;
    }
  }

  async getTransactionsModifiedSince(sinceIsoString: string): Promise<any[]> {
    try {
      const query = sinceIsoString ? `?since=${encodeURIComponent(sinceIsoString)}` : '';
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions/modified-since${query}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('Failed to fetch modified transactions:', error);
      return [];
    }
  }

  async getTransactionPage(limit = 500, beforeId?: string | number): Promise<any[]> {
    try {
      const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 2_000);
      const params = new URLSearchParams({ limit: String(safeLimit) });
      if (beforeId !== undefined && beforeId !== null && String(beforeId) !== '') {
        params.set('beforeId', String(beforeId));
      }
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching a transaction page from PostgreSQL:', error);
      throw error;
    }
  }

  // Kept for older call sites. Routine refreshes reconcile only a bounded newest
  // window; add, update and delete events arrive through Socket.IO immediately.
  async getNewTransactions(_maxId: any): Promise<any[]> {
    return this.getRecentTransactions(500);
  }

  async getCashNoteInventory(): Promise<{ counts: Record<number, number>; totalValue: number; updatedAt?: string | null }> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/cash-note-inventory`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const rawCounts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
      const counts: Record<number, number> = {};
      Object.entries(rawCounts).forEach(([denomination, count]) => {
        const key = Number(denomination);
        const value = Number(count);
        if (Number.isFinite(key) && Number.isFinite(value)) counts[key] = value;
      });
      return {
        counts,
        totalValue: Number(data?.totalValue) || 0,
        updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
      };
    } catch (error) {
      console.error('Error fetching cash note inventory from PostgreSQL:', error);
      throw error;
    }
  }

  async getUserCashNoteInventory(identityKeys: Iterable<string>): Promise<{ counts: Record<number, number>; totalValue: number; updatedAt?: string | null }> {
    try {
      const params = new URLSearchParams();
      [...identityKeys].filter(Boolean).slice(0, 8).forEach(identity => params.append('identity', identity));
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/cash-note-inventory/user?${params.toString()}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const rawCounts = data?.counts && typeof data.counts === 'object' ? data.counts : {};
      const counts: Record<number, number> = {};
      Object.entries(rawCounts).forEach(([denomination, count]) => {
        const key = Number(denomination);
        const value = Number(count);
        if (Number.isFinite(key) && Number.isFinite(value)) counts[key] = value;
      });
      return {
        counts,
        totalValue: Number(data?.totalValue) || 0,
        updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
      };
    } catch (error) {
      console.error('Error fetching user cash note inventory from PostgreSQL:', error);
      throw error;
    }
  }

  async getTransaction(id: string | number): Promise<any | null> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions/${encodeURIComponent(id)}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data && typeof data === 'object' ? data : null;
    } catch (error) {
      console.error('Error fetching transaction detail from PostgreSQL:', error);
      throw error;
    }
  }

  async addTransaction(tx: any): Promise<string | null> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return data.id || null;
    } catch (error) {
      console.error('Error adding transaction to PostgreSQL:', error);
      return null;
    }
  }

  async updateTransaction(tx: any): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions/${tx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tx)
      });
      return response.ok;
    } catch (error) {
      console.error('Error updating transaction in PostgreSQL:', error);
      return false;
    }
  }

  async deleteTransaction(id: string | number): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions/${id}`, {
        method: 'DELETE'
      });

      // DELETE must be idempotent for offline replay. A response can be lost after
      // PostgreSQL already removed the row; a later retry then receives 404. In both
      // cases the desired final state (row absent) has been reached.
      return response.ok || response.status === 404;
    } catch (error) {
      console.error('Error deleting transaction from PostgreSQL:', error);
      return false;
    }
  }
}

export const aivenDatabase = AivenDatabaseService.getInstance();

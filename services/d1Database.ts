// PostgreSQL Database service via Backend API
export class D1DatabaseService {
  private static instance: D1DatabaseService;
  private baseUrl: string;
  // Render free instances can need more than 15 seconds to wake and establish
  // their first database connection on a mobile network.
  private readonly FETCH_TIMEOUT_MS = 45000;

  private constructor() {
    this.baseUrl = ''; // Relative path, same origin on Render
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

  public static getInstance(): D1DatabaseService {
    if (!D1DatabaseService.instance) {
      D1DatabaseService.instance = new D1DatabaseService();
    }
    return D1DatabaseService.instance;
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

  async getAllTransactions(_limit = -1): Promise<any[]> {
    try {
      const response = await this.fetchWithTimeout(`${this.baseUrl}/api/transactions`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching transactions from PostgreSQL:', error);
      throw error;
    }
  }

  async getNewTransactions(_maxId: any): Promise<any[]> {
    return this.getAllTransactions();
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
      return response.ok;
    } catch (error) {
      console.error('Error deleting transaction from PostgreSQL:', error);
      return false;
    }
  }
}

export const d1Database = D1DatabaseService.getInstance();

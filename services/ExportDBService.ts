import { Transaction } from '../types';

// SQLite removed - no-op service
class ExportDBService {
  public async requestPermissionsAndExport(_transactions: Transaction[]): Promise<void> {
    // No-op: SQLite removed. Data is stored in localStorage.
  }
}

export const exportDBService = new ExportDBService();

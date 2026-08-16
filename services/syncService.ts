import { d1Database } from './d1Database';
import { localDB } from './LocalDBService';
import { Transaction } from '../types';

/**
 * Optional local-cache reconciliation helper. Transaction persistence always
 * uses Cloudflare D1 through D1DatabaseService.
 */
class D1SyncService {
  private isSyncing = false;

  public async syncWithD1(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const [localTransactions, serverTransactions] = await Promise.all([
        localDB.getTransactions(),
        d1Database.getAllTransactions(),
      ]);

      const serverTransactionIds = new Set(serverTransactions.map(transaction => transaction.id));
      const unsyncedLocal = localTransactions.filter(transaction =>
        String(transaction.id).startsWith('temp_') || !serverTransactionIds.has(transaction.id),
      );

      for (const transaction of unsyncedLocal) {
        if (String(transaction.id).startsWith('temp_')) {
          await d1Database.addTransaction(transaction);
        }
      }

      const localTransactionIds = new Set(localTransactions.map(transaction => transaction.id));
      const newServerTransactions = serverTransactions.filter(transaction => !localTransactionIds.has(transaction.id));
      const updatedServerTransactions = serverTransactions.filter(serverTransaction => {
        const localTransaction = localTransactions.find(transaction => transaction.id === serverTransaction.id);
        return localTransaction && !this.isTransactionContentSame(localTransaction, serverTransaction);
      });

      await Promise.all(
        [...newServerTransactions, ...updatedServerTransactions].map(transaction => localDB.saveTransaction(transaction)),
      );
    } catch (error) {
      console.error('Cloudflare D1 synchronization failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private isTransactionContentSame(first: Transaction, second: Transaction): boolean {
    return (
      first.date === second.date &&
      first.type === second.type &&
      first.paymentMethod === second.paymentMethod &&
      first.amount === second.amount &&
      first.company === second.company &&
      first.person === second.person
    );
  }
}

export const d1SyncService = new D1SyncService();

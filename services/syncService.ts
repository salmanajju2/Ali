import { localDB } from './LocalDBService';
import { aivenDatabase } from './AivenDatabaseService';
import { Transaction } from '../types';

/**
 * Optional local-cache reconciliation helper. Transaction persistence always
 * uses the Aiven PostgreSQL API through AivenDatabaseService.
 */
class AivenSyncService {
  private isSyncing = false;

  public async syncWithAivenPostgreSQL(): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const [localTransactions, serverTransactions] = await Promise.all([
        localDB.getTransactions(),
        aivenDatabase.getAllTransactions(),
      ]);

      const serverTransactionIds = new Set(serverTransactions.map(transaction => transaction.id));
      const unsyncedLocal = localTransactions.filter(transaction =>
        String(transaction.id).startsWith('temp_') || !serverTransactionIds.has(transaction.id),
      );

      for (const transaction of unsyncedLocal) {
        if (String(transaction.id).startsWith('temp_')) {
          await aivenDatabase.addTransaction(transaction);
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
      console.error('Aiven PostgreSQL synchronization failed:', error);
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

export const aivenSyncService = new AivenSyncService();

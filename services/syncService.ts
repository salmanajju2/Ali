import { localDB } from './LocalDBService';
import { d1Database } from './d1Database';
import { Transaction } from '../types';
import { realtimeSync } from './RealtimeSyncService';

class SyncService {
  private isSyncing = false;

  constructor() {
    this.startPeriodicSync();
  }

  private startPeriodicSync() {
    /* 
    // Auto polling disabled — user manual Sync button dabaye ga tabhi fetch hoga
    setInterval(async () => {
      if (!this.isSyncing) {
        await this.syncWithD1();
      }
    }, 60000); // Sync every 60 seconds
    */
  }

  public async syncWithD1(): Promise<void> {
    this.isSyncing = true;
    try {
      console.log('Starting sync with D1...');

      const [localTransactions, d1Transactions] = await Promise.all([
        localDB.getTransactions(),
        d1Database.getAllTransactions(),
      ]);

      const localTransactionIds = new Set(localTransactions.map(t => t.id));
      const d1TransactionIds = new Set(d1Transactions.map(t => t.id));

      // Upload new local transactions to D1
      const newLocalTransactions = localTransactions.filter(localT => !d1TransactionIds.has(localT.id));

      if (newLocalTransactions.length > 0) {
        console.log(`Found ${newLocalTransactions.length} new local transactions to upload.`);
        await Promise.all(newLocalTransactions.map(transaction => d1Database.addTransaction(transaction)));
        console.log('Successfully uploaded new local transactions.');

        // Notify other devices to sync
        await realtimeSync.notifyUpdate({ action: 'sync' });
      }

      // Download new D1 transactions to local DB
      const newD1Transactions = d1Transactions.filter(d1T => !localTransactionIds.has(d1T.id));

      if (newD1Transactions.length > 0) {
        console.log(`Found ${newD1Transactions.length} new transactions in D1 to download.`);
        await Promise.all(newD1Transactions.map(transaction => localDB.saveTransaction(transaction)));
        console.log('Successfully downloaded new transactions from D1.');
      }

      // Check for updated transactions (same ID but different content)
      const updatedTransactions = d1Transactions.filter(d1T => {
        const localT = localTransactions.find(lT => lT.id === d1T.id);
        return localT && !this.isTransactionContentSame(localT, d1T);
      });

      if (updatedTransactions.length > 0) {
        console.log(`Found ${updatedTransactions.length} updated transactions to sync.`);
        await Promise.all(updatedTransactions.map(transaction => localDB.saveTransaction(transaction)));
        console.log('Successfully updated transactions from D1.');
      }

      console.log('Sync with D1 finished.');
    } catch (error) {
      console.error('Error during sync with D1:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  public async findAndRemoveDuplicateTransactions(): Promise<void> {
    try {
      console.log('Starting duplicate transaction check...');

      const [localTransactions, d1Transactions] = await Promise.all([
        localDB.getTransactions(),
        d1Database.getAllTransactions(),
      ]);

      if (d1Transactions.length === 0) {
        console.log('No transactions found in D1. Nothing to compare.');
        return;
      }

      const d1TransactionsById = new Map(d1Transactions.map(t => [t.id, t]));

      const duplicateTransactions = localTransactions.filter(localT => {
        const d1T = d1TransactionsById.get(localT.id);
        return d1T && this.isTransactionContentSame(localT, d1T);
      });

      const transactionsToDelete = localTransactions.filter(localT => !d1TransactionsById.has(localT.id));

      if (duplicateTransactions.length > 0) {
        console.log(`Found ${duplicateTransactions.length} duplicate transactions. No action needed for these as they are in sync.`);
      }

      if (transactionsToDelete.length > 0) {
        console.log(`Found ${transactionsToDelete.length} transactions in local DB that are not in D1. Deleting them...`);
        await Promise.all(transactionsToDelete.map(transaction => localDB.deleteTransaction(transaction.id)));
        console.log(`Deleted ${transactionsToDelete.length} transactions from local DB.`);
      } else {
        console.log('No transactions to delete from local DB.');
      }

      console.log('Duplicate transaction check finished.');
    } catch (error) {
      console.error('Error during duplicate transaction check:', error);
    }
  }

  private isTransactionContentSame(t1: Transaction, t2: Transaction): boolean {
    return (
      t1.date === t2.date &&
      t1.type === t2.type &&
      t1.paymentMethod === t2.paymentMethod &&
      t1.amount === t2.amount &&
      t1.company === t2.company &&
      t1.person === t2.person
    );
  }
}

export const syncService = new SyncService();

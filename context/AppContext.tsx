import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo, useRef } from 'react';
import { Transaction, NoteCounts } from '../types';
import { COMPANY_NAMES as defaultCompanyNames, LOCATIONS, DENOMINATIONS, BANK_NAMES, BANK_LOGOS } from '../constants';
import { d1Database } from '../services/d1Database';
import { useAuth, User } from './AuthContext';
import { localDB } from '../services/LocalDBService';
import { sendTelegramMessage, sendTelegramPhoto, deleteTelegramMessage } from '../services/telegramService';
import { exportDBService } from '../services/ExportDBService';
import { realtimeSync } from '../services/RealtimeSyncService';

interface AppContextType {
  user: User | null;
  transactions: Transaction[];
  vault: NoteCounts;
  companyNames: string[];
  locations: string[];
  personNames: string[];
  addTransaction: (newTransaction: Omit<Transaction, 'id'> & { manualDate?: string }) => Promise<void>;
  addForwardEntry: (debitTransaction: Omit<Transaction, 'id'>, creditTransaction: Omit<Transaction, 'id'>) => Promise<void>;
  settleBankBalance: (sourceBank: string, targetBank: string, amount: number, recordedBy: string, location: string, service?: string) => Promise<void>;
  updateTransaction: (updatedTransaction: Transaction & { manualDate?: string }) => Promise<void>;
  deleteTransactionsByIds: (ids: string[]) => Promise<void>;
  addCompany: (companyName: string) => Promise<void>;
  deleteCompany: (companyName: string) => Promise<void>;
  addLocation: (location: string) => Promise<void>;
  deleteLocation: (location: string) => Promise<void>;
  databaseConnected: boolean;
  socketConnected: boolean;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  manualSync: (forceFull?: boolean) => Promise<void>;
  clearLocalDB: () => Promise<void>;
  bankBalances: Record<string, number>;
  totalSystemCount: number;
  reconnectSocket: () => void;
  addBank: (name: string, logo?: string) => Promise<void>;
  deleteBank: (name: string) => Promise<void>;
  allBankNames: string[];
  allBankLogos: Record<string, string>;
  updateBank: (oldName: string, newName: string) => Promise<void>;
  userIdentityKeys: Set<string>;
}


const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

const initializeVault = (): NoteCounts => {
  const freshVault: NoteCounts = {};
  DENOMINATIONS.forEach(d => freshVault[d] = 0);
  return freshVault;
};

const generateNextTransactionId = (): string => {
  // Use timestamp for temporary client-side IDs to avoid collisions
  return `temp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

const normalizeIdentity = (value?: string | null): string => {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
};

const compactIdentity = (value?: string | null): string => {
  return normalizeIdentity(value).replace(/[^a-z0-9@.]/g, '');
};

const getUserIdentityKeys = (user: User | null): Set<string> => {
  const rawKeys = [
    user?.displayName,
    user?.email,
    user?.email?.split('@')[0],
  ];
  const keys = new Set<string>();

  rawKeys.forEach(key => {
    const normalized = normalizeIdentity(key);
    const compact = compactIdentity(key);
    if (normalized) keys.add(normalized);
    if (compact) keys.add(compact);
  });

  return keys;
};

const isAdminUser = (user: User | null): boolean => {
  return Boolean(user?.isAdmin || normalizeIdentity(user?.email) === 'alienterprese@gmail.com');
};

const isTransactionVisibleToUser = (tx: Transaction, user: User | null, identityKeys: Set<string>): boolean => {
  if (!user) return false;
  if (isAdminUser(user)) return true;

  // Bank/UPI transactions sabhi users ko dikhao — Accounts page ek shared view hai
  // Personal stats (SummaryPage, UserProfilePage) apne andar recordedBy filter karte hain
  if (tx.bank || tx.paymentMethod === 'upi') return true;

  // Cash transactions sirf recorder ko dikhao
  const recordedBy = normalizeIdentity(tx.recordedBy);
  const compactRecordedBy = compactIdentity(tx.recordedBy);

  return identityKeys.has(recordedBy) || identityKeys.has(compactRecordedBy);
};

const sortTransactionsByDate = (transactionList: Transaction[]): Transaction[] => {
  return [...transactionList].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

const isDuplicateTransaction = (tx1: Transaction, tx2: Transaction): boolean => {
  // 1. If IDs match exactly, it's a duplicate
  if (tx1.id === tx2.id) return true;
  
  // 2. Identify if IDs are temporary or server-assigned
  const isTx1Temp = tx1.id.toString().startsWith('temp_') || tx1.id.toString().startsWith('recovered_');
  const isTx2Temp = tx2.id.toString().startsWith('temp_') || tx2.id.toString().startsWith('recovered_');
  
  // CRITICAL: If both are temporary (offline or pending), they are different user inputs.
  // They are NOT duplicates, even if they have the same amount/person/date.
  if (isTx1Temp && isTx2Temp) return false;
  
  // CRITICAL: If both are real server IDs but different, they are NOT duplicates
  if (!isTx1Temp && !isTx2Temp && tx1.id !== tx2.id) return false;

  // Now, one is a server ID and one is a temp ID.
  const tempTx = isTx1Temp ? tx1 : tx2;
  const serverTx = isTx1Temp ? tx2 : tx1;

  // 3. Precise match: If server transaction has a clientId, check if it matches the temp ID.
  if (serverTx.clientId && serverTx.clientId !== 'null' && serverTx.clientId !== '') {
    return serverTx.clientId === tempTx.id;
  }

  // 4. Fallback (only if serverTx has no clientId, e.g., legacy or repaired data):
  // Compare content and check if they are very close in time.
  const date1 = new Date(tx1.date).getTime();
  const date2 = new Date(tx2.date).getTime();
  const timeDiff = Math.abs(date1 - date2);
  const isTimeClose = timeDiff < 300000; // 5 minute window

  // For safety, require additional fields (bank, recordedBy, paymentMethod, notes, location)
  // to match when falling back to content matching. This prevents false positive duplicates.
  const isBankMatch = normalizeIdentity(tx1.bank) === normalizeIdentity(tx2.bank);
  const isRecordedByMatch = normalizeIdentity(tx1.recordedBy) === normalizeIdentity(tx2.recordedBy);
  const isPaymentMethodMatch = tx1.paymentMethod === tx2.paymentMethod;
  const isNotesMatch = normalizeIdentity(tx1.notes) === normalizeIdentity(tx2.notes);
  const isLocationMatch = normalizeIdentity(tx1.location) === normalizeIdentity(tx2.location);

  return (
    tx1.amount === tx2.amount &&
    tx1.type === tx2.type &&
    normalizeIdentity(tx1.person) === normalizeIdentity(tx2.person) &&
    normalizeIdentity(tx1.company) === normalizeIdentity(tx2.company) &&
    isBankMatch &&
    isRecordedByMatch &&
    isPaymentMethodMatch &&
    isNotesMatch &&
    isLocationMatch &&
    isTimeClose
  );
};

const deduplicateTransactions = (list: Transaction[]): Transaction[] => {
  const result: Transaction[] = [];
  const seenIds = new Set<string>();
  
  const realTxs: Transaction[] = [];
  const tempTxs: Transaction[] = [];
  
  for (const tx of list) {
    if (seenIds.has(tx.id)) continue;
    seenIds.add(tx.id);
    
    const isTemp = tx.id.toString().startsWith('temp_') || tx.id.toString().startsWith('recovered_');
    if (isTemp) {
      tempTxs.push(tx);
    } else {
      realTxs.push(tx);
    }
  }

  // Real server IDs are pushed first (prioritized)
  result.push(...realTxs);
  
  // Temp IDs are only checked against accepted transactions
  for (const tempTx of tempTxs) {
    let isDuplicate = false;
    for (const existing of result) {
      if (isDuplicateTransaction(tempTx, existing)) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(tempTx);
    }
  }
  
  return result;
};

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { currentUser } = useAuth();
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  // The PostgreSQL inventory is the authoritative all-history vault for the
  // administrator. Other users retain their privacy-scoped local calculation.
  const [databaseVault, setDatabaseVault] = useState<NoteCounts | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  // ✅ FIX: "Delete ke baad wapas aa jaana" — pending deletes track karo
  // Jab bhi sync hoti hai, yeh IDs filter out ho jaati hain
  // useRef direct value leta hai (useState ki tarah lazy function nahi)
  const pendingDeleteIdsRef = useRef<Set<string>>((() => {
    try {
      const saved = localStorage.getItem('pendingDeleteIds');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  })());

  const addPendingDeletes = (ids: string[]) => {
    ids.forEach(id => pendingDeleteIdsRef.current.add(id));
    try {
      localStorage.setItem('pendingDeleteIds', JSON.stringify([...pendingDeleteIdsRef.current]));
    } catch {}
  };

  const removePendingDeletes = (ids: string[]) => {
    ids.forEach(id => pendingDeleteIdsRef.current.delete(id));
    try {
      localStorage.setItem('pendingDeleteIds', JSON.stringify([...pendingDeleteIdsRef.current]));
    } catch {}
  };

  // Filter helper — har sync mein use karo
  const filterDeletedIds = (list: Transaction[]): Transaction[] => {
    if (pendingDeleteIdsRef.current.size === 0) return list;
    return list.filter(tx => !pendingDeleteIdsRef.current.has(tx.id));
  };

  // A pending ID is a durable delete intent, not just a UI filter. It remains in
  // localStorage after the APK is closed and is replayed once a connection returns.
  const pendingDeleteFlushInProgressRef = useRef(false);
  const flushPendingDeletes = useCallback(async () => {
    const queuedIds = [...pendingDeleteIdsRef.current];
    if (queuedIds.length === 0) {
      return { confirmedIds: [] as string[], pendingIds: [] as string[] };
    }

    // A temporary/recovered transaction never reached PostgreSQL, so deleting its
    // local copy completes the operation without a remote request.
    const localOnlyIds = queuedIds.filter(id => id.startsWith('temp_') || id.startsWith('recovered_'));
    if (localOnlyIds.length > 0) {
      removePendingDeletes(localOnlyIds);
    }

    const realIds = queuedIds.filter(id => !id.startsWith('temp_') && !id.startsWith('recovered_'));
    if (realIds.length === 0) {
      return { confirmedIds: localOnlyIds, pendingIds: [] as string[] };
    }

    // Never make an offline delete wait on long network timeouts. The durable queue
    // is retained and the online/reconnect handlers invoke this helper again.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log(`📴 ${realIds.length} delete(s) safely queued until the device is back online.`);
      return { confirmedIds: localOnlyIds, pendingIds: realIds };
    }

    if (pendingDeleteFlushInProgressRef.current) {
      return { confirmedIds: [] as string[], pendingIds: realIds };
    }

    pendingDeleteFlushInProgressRef.current = true;
        const confirmedIds: string[] = [];
    try {
      console.log(`📤 Replaying ${realIds.length} queued deletion(s) to Aiven PostgreSQL...`);
      // Prefer one atomic request so a bulk delete cannot leave a client-visible
      // partial state while individual DELETE requests are still in flight.
      const bulkConfirmedIds = await d1Database.deleteTransactions(realIds);
      if (bulkConfirmedIds !== null) {
        confirmedIds.push(...realIds.filter(id => bulkConfirmedIds.includes(id)));
        console.log(`✅ Bulk Aiven PostgreSQL delete confirmed: ${confirmedIds.length}/${realIds.length}`);
      } else {
        // Older deployments may not have the bulk route yet. Keep the safe,
        // idempotent per-row fallback until Render finishes deploying the route.
        for (const id of realIds) {
          const deleted = await d1Database.deleteTransaction(id);
          if (deleted) {
            confirmedIds.push(id);
            console.log(`✅ Queued Aiven PostgreSQL delete confirmed: ${id}`);
          } else {
            console.warn(`⚠️ Queued Aiven PostgreSQL delete still pending: ${id}`);
          }
        }
      }
      if (confirmedIds.length > 0) {
        removePendingDeletes(confirmedIds);
      }
      const pendingIds = realIds.filter(id => !confirmedIds.includes(id));
      return { confirmedIds: [...localOnlyIds, ...confirmedIds], pendingIds };
    } finally {
      pendingDeleteFlushInProgressRef.current = false;
    }
  }, []);
  const [companyNames, setCompanyNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('companyNames');
    return saved ? JSON.parse(saved) : defaultCompanyNames;
  });
  const [locations, setLocations] = useState<string[]>(() => {
    const saved = localStorage.getItem('locations');
    return saved ? JSON.parse(saved) : LOCATIONS;
  });
  const [databaseConnected, setDatabaseConnected] = useState(false);
  // RealtimeSyncService may connect before React registers its status callback.
  // Read the current singleton state on first render to avoid a stale Offline label.
  const [socketConnected, setSocketConnected] = useState(() => realtimeSync.isSocketConnected());
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  // Sync feedback is temporary. A past, transient network failure must not keep
  // showing a red banner after later polling has restored connectivity.
  useEffect(() => {
    if (syncStatus !== 'success' && syncStatus !== 'error') return;
    const timer = window.setTimeout(() => setSyncStatus('idle'), 5000);
    return () => window.clearTimeout(timer);
  }, [syncStatus]);

  // Track current user UID to detect account switch
  const currentUserUidRef = useRef<string | null>(null);
  const syncInProgressRef = useRef(false);
  // A Web Socket event can arrive while a full Aiven request is already running.
  // Remember that event so the latest database state is fetched immediately after
  // the in-flight request completes instead of silently dropping the refresh.
  const queuedRealtimeRefreshRef = useRef(false);
  const lastFetchTimeRef = useRef<number>(0);
  const allTransactionsRef = useRef<Transaction[]>([]);
  // Track in-flight edits separately from new offline transactions. A real ID with
  // isSynced:false must be PUT, never POSTed as a duplicate during background sync.
  const pendingUpdateIdsRef = useRef<Set<string>>(new Set<string>());
  // Track recently confirmed edits until one authoritative full refresh completes.
  const recentlyUpdatedIdsRef = useRef<Set<string>>(new Set<string>());
  // Socket.IO is instant only while a client is alive. This persisted cursor is
  // the durable recovery point for a web tab or APK that was completely closed.
  const transactionChangeCursorRef = useRef<number>((() => {
    try {
      return Math.max(0, Number.parseInt(localStorage.getItem('ali_transaction_change_cursor') || '0', 10) || 0);
    } catch {
      return 0;
    }
  })());
  const durableChangeSyncInProgressRef = useRef(false);

  const reconcileDurableTransactionChanges = useCallback(async (): Promise<number> => {
    if (!currentUser || durableChangeSyncInProgressRef.current) return 0;
    durableChangeSyncInProgressRef.current = true;
    let appliedChanges = 0;

    try {
      let hasMore = true;
      while (hasMore) {
        const page = await d1Database.getTransactionChanges(transactionChangeCursorRef.current, 500);
        if (page.changes.length === 0) break;

        const deletedIds = new Set(page.changes
          .filter(change => change.action === 'delete')
          .map(change => String(change.id)));
        const incomingById = new Map<string, Transaction>();
        page.changes.forEach(change => {
          if ((change.action === 'add' || change.action === 'update') && change.transaction) {
            incomingById.set(String(change.id), { ...change.transaction, isSynced: true });
          }
        });
        const protectedIds = new Set([
          ...pendingUpdateIdsRef.current,
          ...pendingDeleteIdsRef.current,
        ]);

        setAllTransactions(prev => {
          const nextById = new Map<string, Transaction>(prev.map(tx => [String(tx.id), tx] as const));
          deletedIds.forEach(id => {
            // A local, durable delete intent already has the desired UI state.
            if (!pendingDeleteIdsRef.current.has(id)) nextById.delete(id);
          });
          incomingById.forEach((tx, id) => {
            if (!protectedIds.has(id) && !pendingDeleteIdsRef.current.has(id)) nextById.set(id, tx);
          });
          return sortTransactionsByDate(filterDeletedIds(deduplicateTransactions([...nextById.values()])));
        });

        // Persist the same mutations before advancing the cursor. A device that
        // closes immediately after reconciliation therefore opens with the right cache.
        for (const id of deletedIds) {
          if (!pendingDeleteIdsRef.current.has(id)) await localDB.deleteTransaction(id);
        }
        const cacheable = [...incomingById.entries()]
          .filter(([id]) => !protectedIds.has(id) && !pendingDeleteIdsRef.current.has(id))
          .map(([, tx]) => tx);
        if (cacheable.length > 0) await localDB.saveTransactions(cacheable);

        const nextCursor = Math.max(transactionChangeCursorRef.current, Number.parseInt(page.nextCursor, 10) || 0);
        transactionChangeCursorRef.current = nextCursor;
        try { localStorage.setItem('ali_transaction_change_cursor', String(nextCursor)); } catch {}
        appliedChanges += page.changes.length;
        hasMore = page.hasMore;
      }
      return appliedChanges;
    } catch (error) {
      console.warn('Durable transaction change reconciliation paused:', error);
      return appliedChanges;
    } finally {
      durableChangeSyncInProgressRef.current = false;
    }
  }, [currentUser]);

  useEffect(() => {
    allTransactionsRef.current = allTransactions;
  }, [allTransactions]);

  const [customBanks, setCustomBanks] = useState<{name: string, logo: string}[]>(() => {
    const saved = localStorage.getItem('customBanks');
    return saved ? JSON.parse(saved) : [];
  });

  const allBankNames = useMemo(() => {
    const priority = ["PHONEPE QR", "GPAY QR", "SPICEMONEY QR", "7902099709", "SACHIN"];
    const names = [...BANK_NAMES, ...customBanks.map(b => b.name)];
    const uniqueNames = Array.from(new Set(names));
    
    return uniqueNames.sort((a, b) => {
      const indexA = priority.indexOf(a);
      const indexB = priority.indexOf(b);
      
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      return a.localeCompare(b);
    });
  }, [customBanks]);


  const allBankLogos = useMemo(() => {
    return { ...BANK_LOGOS, ...Object.fromEntries(customBanks.map(b => [b.name, b.logo])) };
  }, [customBanks]);

  const userIdentityKeys = useMemo(() => getUserIdentityKeys(currentUser), [currentUser]);

  const transactions = useMemo(() => {
    if (!currentUser) return [];
    return allTransactions.filter(tx => isTransactionVisibleToUser(tx, currentUser, userIdentityKeys));
  }, [allTransactions, currentUser, userIdentityKeys]);

  const recalculateBankBalances = useCallback((transactionsToProcess: Transaction[]) => {
    const balances: Record<string, number> = {};
    allBankNames.forEach((name: string) => balances[name] = 0);

    let transactionsForBank = transactionsToProcess;
    if (currentUser && !isAdminUser(currentUser)) {
      transactionsForBank = transactionsToProcess.filter(tx => isTransactionVisibleToUser(tx, currentUser, userIdentityKeys));
    }

    transactionsForBank.forEach(tx => {
      if (tx.bank) {
        let isIn = false;
        if (tx.paymentMethod === 'upi') {
          isIn = tx.type === 'credit';
        } else {
          const isDeposit = !tx.company || tx.company === 'NA';
          if (isDeposit) isIn = tx.type === 'debit';
          else isIn = tx.type === 'credit';
        }
        if (isIn) {
          balances[tx.bank] = (balances[tx.bank] || 0) + tx.amount;
        } else {
          balances[tx.bank] = (balances[tx.bank] || 0) - tx.amount;
        }
      }
    });
    return balances;
  }, [currentUser, userIdentityKeys, allBankNames]);

  const recalculateVault = useCallback((transactionsToProcess: Transaction[]) => {
    const newVault = initializeVault();
    const isAdmin = isAdminUser(currentUser);

    const transactionsForVault = transactionsToProcess.filter(tx => {
      if (isAdmin) return true;
      const rb = (tx.recordedBy || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const crb = rb.replace(/[^a-z0-9@.]/g, '');
      return userIdentityKeys.has(rb) || userIdentityKeys.has(crb);
    });

    transactionsForVault.forEach(tx => {
      if (tx.paymentMethod === 'cash' && tx.breakdown && typeof tx.breakdown === 'object') {
        for (const denomStr in tx.breakdown) {
          const denom = parseInt(denomStr, 10);
          const count = tx.breakdown[denom] || 0;
          if (DENOMINATIONS.includes(denom)) {
            if (tx.type === 'credit') {
              newVault[denom] = (newVault[denom] || 0) + count;
            } else if (tx.type === 'debit') {
              newVault[denom] = (newVault[denom] || 0) - count;
            }
          }
        }
      }
    });
    return newVault;
  }, [currentUser, userIdentityKeys]);

  const calculatedVault = useMemo(() => recalculateVault(allTransactions), [allTransactions, recalculateVault]);
  const refreshScopedDatabaseVault = () => {
    if (!currentUser) {
      setDatabaseVault(null);
      return Promise.resolve();
    }
    const inventoryRequest = isAdminUser(currentUser)
      ? d1Database.getCashNoteInventory()
      : d1Database.getUserCashNoteInventory(getUserIdentityKeys(currentUser));
    return inventoryRequest
      .then(inventory => setDatabaseVault({ ...initializeVault(), ...inventory.counts }))
      .catch(error => console.warn('Cash note inventory refresh failed:', error));
  };
  const vault = useMemo(() => {
    return databaseVault ? { ...initializeVault(), ...databaseVault } : calculatedVault;
  }, [databaseVault, calculatedVault]);
  const bankBalances = useMemo(() => recalculateBankBalances(allTransactions), [allTransactions, recalculateBankBalances]);

  const personNames = useMemo(() => {
    const names = new Set(transactions.map(tx => tx.person).filter(Boolean) as string[]);
    return Array.from(names).sort();
  }, [transactions]);

  const manualSync = useCallback(async (forceFull: boolean = false) => {
    if (!currentUser) return;

    // Cooldown reset karo — manual sync hamesha force karta hai
    lastFetchTimeRef.current = 0;
    syncInProgressRef.current = false;

    setSyncStatus('syncing');
    try {
      console.log('🔄 Starting manual sync with Aiven PostgreSQL...');

      const queuedDeleteResult = await flushPendingDeletes();
      if (queuedDeleteResult.confirmedIds.length > 0) {
        console.log(`✅ Manual sync confirmed ${queuedDeleteResult.confirmedIds.length} queued deletion(s).`);
      }

      const localTransactions = await localDB.getTransactions();
      console.log(`💿 Loaded ${localTransactions.length} local transactions for sync.`);

      // ✅ Upload any unsynced (offline) local transactions to Aiven PostgreSQL first
      // FIX: !tx.isSynced covers both false AND undefined (older records)
      const unsyncedLocal = localTransactions.filter(tx => !tx.isSynced);
      const idRecordMap: Record<string, string> = {};

      for (const localTx of unsyncedLocal) {
        console.log(`📤 Uploading offline transaction ${localTx.id} to Aiven PostgreSQL.`);
        if (!localTx.id.toString().startsWith('temp_') && !localTx.id.toString().startsWith('recovered_')) {
          const updated = await d1Database.updateTransaction(localTx);
          if (updated) {
            localTx.isSynced = true;
            pendingUpdateIdsRef.current.delete(localTx.id);
            recentlyUpdatedIdsRef.current.add(localTx.id);
            await localDB.saveTransaction(localTx);
            // ✅ UI mein bhi synced mark karo
            setAllTransactions(prev => prev.map(tx => tx.id === localTx.id ? { ...tx, isSynced: true } : tx));
            continue;
          }
        }

        const newServerId = await d1Database.addTransaction(localTx);
        if (newServerId) {
          const oldId = localTx.id;
          idRecordMap[oldId] = newServerId;

          const syncedTx = { ...localTx, id: newServerId, isSynced: true };

          if (oldId !== newServerId) {
            await localDB.deleteTransaction(oldId);
          }
          await localDB.saveTransaction(syncedTx);

          // ✅ UI mein temp_ ID ko real server ID se replace karo — transaction gayab nahi hogi
          setAllTransactions(prev => prev.map(tx =>
            tx.id === oldId ? syncedTx : tx
          ));

          console.log(`✅ Offline transaction uploaded: ${oldId} → ${newServerId}`);
        }
      }

      // Step 3: Aiven PostgreSQL se incremental/full fetch depending on local data
      console.log('📥 Fetching latest data from Aiven PostgreSQL...');

      const numericIds = localTransactions
        .map(tx => parseInt(tx.id))
        .filter(id => !isNaN(id));
      const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;

      let fetchedTransactions: Transaction[] = [];
      let isFullSync = false;
      
      if (localTransactions.length > 0 && maxId > 0 && !forceFull) {
        console.log('🔄 Performing Incremental Sync...');
        fetchedTransactions = await d1Database.getNewTransactions(maxId);
      } else {
        console.log('🔄 Performing Full Sync...');
        fetchedTransactions = await d1Database.getAllTransactions(-1);
        isFullSync = true;
      }
      console.log(`📥 Manual Sync: Received ${fetchedTransactions.length} records for reconciliation.`);

      setDatabaseConnected(true);

      const syncedFromServer = fetchedTransactions.map(tx => ({ ...tx, isSynced: true }));

      // ✅ Functional update: current UI state se pendingInMemory lo (fresh)
      setAllTransactions(prev => {
        const pendingInMemory = prev.filter(tx => !tx.isSynced);
        let mergedList: Transaction[];
        if (isFullSync) {
          // ✅ FIX: Full sync mein recently-updated transactions ko Aiven PostgreSQL stale data se bachao
          const serverIds = new Set(syncedFromServer.map(tx => tx.id));
          const localSyncedNotInServer = prev.filter(tx =>
            tx.isSynced && !serverIds.has(tx.id)
          );

          // Local priority: pending (editing) + recently updated (Aiven PostgreSQL might be stale)
          const localPriorityIds = new Set([
            ...pendingInMemory.map(tx => tx.id),
            ...pendingUpdateIdsRef.current,
            ...recentlyUpdatedIdsRef.current,
          ]);
          const filteredServerData = syncedFromServer.filter(tx => !localPriorityIds.has(tx.id));
          const filteredLocalSynced = localSyncedNotInServer.filter(tx => !localPriorityIds.has(tx.id));
          const localPriorityTxs = prev.filter(tx => localPriorityIds.has(tx.id));

          mergedList = [...filteredServerData, ...filteredLocalSynced, ...localPriorityTxs];
        } else {
          // Incremental: only add NEW records from server, keep existing synced locals
          const serverIds = new Set(syncedFromServer.map(tx => tx.id));
          const existingSynced = prev.filter(tx => tx.isSynced && !serverIds.has(tx.id));
          mergedList = [...syncedFromServer, ...existingSynced, ...pendingInMemory];
        }
        const deduplicatedList = deduplicateTransactions(mergedList);
        const finalSorted = sortTransactionsByDate(filterDeletedIds(deduplicatedList));

        console.log(`📊 Manual Sync Result: Server=${syncedFromServer.length}, Pending=${pendingInMemory.length}, Final=${finalSorted.length}`);

        // Background: LocalDB update
        if (isFullSync) {
          localDB.clearAndRepopulateTransactions(finalSorted).catch(e =>
            console.error('LocalDB repopulate error in manualSync:', e)
          );
        } else {
          // Incrementally save the new/updated transactions
          (async () => {
            try {
              for (const tx of syncedFromServer) {
                await localDB.saveTransaction(tx);
              }
            } catch (e) {
              console.error('LocalDB incremental save error in manualSync:', e);
            }
          })();
        }

        return finalSorted;
      });

      // recalculatedVault and bankBalances will automatically update via useMemo

      console.log('✅ Vault and bank balances updated.');

      setSyncStatus('success');
      console.log('✅ Manual sync completed successfully.');
    } catch (error) {
      setDatabaseConnected(false);
      setSyncStatus('error');
      console.error('💥 Manual sync failed:', error);
    }
  // recalculate functions useMemo se auto-update hoti hain — yahan dep nahi chahiye
  }, [currentUser]);

  // Ensure initialLoad runs EXACTLY ONCE per USER (resets on account switch)
  const hasInitialLoadRun = useRef(false);

  useEffect(() => {
    // --- ACCOUNT SWITCH DETECTION ---
    // Agar naya user aaya hai toh pehle wala saara data saaf karo
    if (!currentUser) {
      // Sign out: sirf tab clear karo jab pehle koi user tha
      // \u26a0\ufe0f IMPORTANT: AuthContext ab sirf explicit logout par null set karta hai.
      // Screen lock / background / network disconnect par null NAHI aata.
      // Isliye yahan safely clear kar sakte hain jab pehle user tha.
      if (currentUserUidRef.current !== null) {
        console.log('\ud83d\udd12 Genuine logout detected in AppContext. Clearing UI state...');
        setAllTransactions([]);
        setDatabaseConnected(false);
        setSyncStatus('idle');
        // \u274c IndexedDB clear mat karo — next login ke liye local data preserve karo
        hasInitialLoadRun.current = false;
        currentUserUidRef.current = null;
      }
      return;
    }

    // Naya user aaya — purana data saaf karo pehle
    if (currentUserUidRef.current !== null && currentUserUidRef.current !== currentUser.uid) {
      console.log('🔄 Account switched! Clearing previous user data...');
      setAllTransactions([]);
      setDatabaseConnected(false);
      setSyncStatus('idle');
      syncInProgressRef.current = false;
      localDB.clearAndRepopulateTransactions([]).catch(() => { });
      hasInitialLoadRun.current = false;
    }

    // Current user UID track karo
    currentUserUidRef.current = currentUser.uid;

    if (hasInitialLoadRun.current) return; // Already ran — skip
    hasInitialLoadRun.current = true;

    // App open hone par SIRF EK BAAR Aiven PostgreSQL se sync karo
    const initialLoad = async () => {
      setSyncStatus('syncing');
      try {
        // Step 1: LocalDB se turant load karo
        console.log('⚡ Loading from LocalDB...');
        const queuedDeleteResult = await flushPendingDeletes();
        if (queuedDeleteResult.confirmedIds.length > 0) {
          console.log(`✅ App-open sync confirmed ${queuedDeleteResult.confirmedIds.length} queued deletion(s).`);
        }

        const localTransactions = await localDB.getTransactions();
        if (localTransactions && localTransactions.length > 0) {
          const sortedLocal = sortTransactionsByDate(filterDeletedIds(localTransactions));
          setAllTransactions(sortedLocal);
          console.log(`✅ LocalDB se ${sortedLocal.length} transactions loaded.`);
        }

        // Step 2: The first network response is deliberately bounded. Existing
        // IndexedDB data is shown above immediately; a new APK receives only the
        // newest slice instead of waiting for all 10,616 rows to deserialize.
        d1Database.initializeDatabase().catch(e => console.warn('DB init error (background):', e));
        console.log('📥 Initial Sync: fetching the newest 1,000 Aiven PostgreSQL records.');
        const fetched: Transaction[] = await d1Database.getRecentTransactions(1_000);
        // Seven rows only: this never delays the first transaction screen.
        void refreshScopedDatabaseVault();

        setDatabaseConnected(true);

        if (fetched.length > 0) {
          const syncedFromAiven = fetched.map(tx => ({ ...tx, isSynced: true }));
          const pendingLocal = localTransactions.filter(tx => !tx.isSynced);
          const mergedList = [...syncedFromAiven, ...localTransactions.filter(tx => tx.isSynced), ...pendingLocal];
          const finalSorted = sortTransactionsByDate(filterDeletedIds(deduplicateTransactions(mergedList)));

          setAllTransactions(finalSorted);
          try {
            // `put` only the current window. Do not clear and rewrite a 10k cache
            // on every app open because that is a major Android WebView slowdown.
            await localDB.saveTransactions(syncedFromAiven);
          } catch (cacheError) {
            console.warn('Local cache update skipped after successful server sync:', cacheError);
          }
          console.log(`✅ App open sync complete. Reconciled ${fetched.length} recent records. Total visible: ${finalSorted.length}`);

          // A client may have been closed while another device added, edited or
          // deleted data. Replay every missed durable database change before the
          // background history walk continues.
          const recoveredChanges = await reconcileDurableTransactionChanges();
          if (recoveredChanges > 0) {
            console.log(`✅ App-open durable recovery applied ${recoveredChanges} missed change(s).`);
            void refreshScopedDatabaseVault();
          }

        } else {
          console.log('ℹ️ No recent records returned from Aiven PostgreSQL. Using local data.');
          if (localTransactions.length > 0) {
            setAllTransactions(sortTransactionsByDate(filterDeletedIds(localTransactions)));
          }
        }

        setSyncStatus('success');
      } catch (error) {
        setDatabaseConnected(false);
        setSyncStatus('error');
        console.error('Initial sync failed:', error);
      }
    };

    initialLoad();
  }, [currentUser, recalculateVault, recalculateBankBalances]);

  // Real-time synchronization listener + polling fallback
  useEffect(() => {
    if (!currentUser) return;

    const FETCH_COOLDOWN_MS = 20000; // 20 second cooldown between fetches

    const refreshAllFromAiven = async (force = false) => {
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTimeRef.current;

      // Throttle: agar 20 second se pehle fetch ho chuka hai, skip karo (unless forced)
      if (!force && timeSinceLastFetch < FETCH_COOLDOWN_MS) {
        console.log(`⏱️ Fetch skipped — last fetch was ${Math.round(timeSinceLastFetch / 1000)}s ago.`);
        return;
      }

      if (syncInProgressRef.current) {
        // Never lose a Web → APK event merely because another refresh was running.
        // The finalizer below immediately performs one more authoritative fetch.
        if (force) queuedRealtimeRefreshRef.current = true;
        return;
      }
      syncInProgressRef.current = true;
      lastFetchTimeRef.current = now;

      try {
        const queuedDeleteResult = await flushPendingDeletes();
        const localTransactions = await localDB.getTransactions();

        // Push unsynced local records. Existing server IDs are edits and must use PUT;
        // only temporary/recovered IDs represent genuinely new transactions that need POST.
        const unsyncedLocal = localTransactions.filter(tx => !tx.isSynced);
        if (unsyncedLocal.length > 0) {
          console.log(`📤 Auto-syncing ${unsyncedLocal.length} offline transaction(s)...`);
          for (const tx of unsyncedLocal) {
            const isExistingServerTransaction = !tx.id.startsWith('temp_') && !tx.id.startsWith('recovered_');

            if (isExistingServerTransaction) {
              const updated = await d1Database.updateTransaction({ ...tx, isSynced: true });
              if (updated) {
                const syncedTx = { ...tx, isSynced: true };
                await localDB.saveTransaction(syncedTx);
                setAllTransactions(prev => prev.map(t => t.id === tx.id ? syncedTx : t));
                pendingUpdateIdsRef.current.delete(tx.id);
                recentlyUpdatedIdsRef.current.add(tx.id);
                realtimeSync.notifyUpdate({ action: 'update', transaction: syncedTx });
                console.log(`✅ Auto-synced transaction update: ${tx.id}`);
              }
              continue;
            }

            const oldId = tx.id;
            const newServerId = await d1Database.addTransaction(tx);
            if (newServerId) {
              const syncedTx = { ...tx, id: newServerId, isSynced: true };
              await localDB.deleteTransaction(oldId);
              await localDB.saveTransaction(syncedTx);
              setAllTransactions(prev => prev.map(t => t.id === oldId ? syncedTx : t));
              realtimeSync.notifyUpdate({ action: 'add', transaction: syncedTx });
              console.log(`✅ Auto-uploaded offline transaction: ${oldId} → ${newServerId}`);
            }
          }
        }

        // First replay the durable server cursor. This covers add/update/delete
        // operations that occurred while this web tab or APK was closed.
        const recoveredChanges = await reconcileDurableTransactionChanges();
        if (recoveredChanges > 0) {
          console.log(`✅ Durable recovery applied ${recoveredChanges} missed database change(s).`);
        }

        // Reconcile recent transactions AND any records modified directly in SQL database
        const recentlyUpdatedIds = new Set(recentlyUpdatedIdsRef.current);
        // Track last check time for modified-since reconciliation
        const lastSyncKey = 'ali_last_modified_sync_ts';
        const lastSyncTs = localStorage.getItem(lastSyncKey) || new Date(Date.now() - 30 * 60 * 1000).toISOString();
        const fetchStartTime = new Date().toISOString();

        const [fetchedRecent, fetchedModified] = await Promise.all([
          d1Database.getRecentTransactions(500),
          d1Database.getTransactionsModifiedSince(lastSyncTs),
        ]);

        localStorage.setItem(lastSyncKey, fetchStartTime);

        // Merge recent and modified records uniquely
        const txMap = new Map<string, any>();
        fetchedRecent.forEach(tx => txMap.set(String(tx.id), tx));
        fetchedModified.forEach(tx => txMap.set(String(tx.id), tx));
        const fetched = Array.from(txMap.values());

        // Inventory is a seven-row response and stays independent from the large
        // transaction history request, so a temporary inventory failure cannot
        // block normal transaction synchronization.
        void refreshScopedDatabaseVault();
        const syncedFromAiven = fetched.map(tx => ({ ...tx, isSynced: true }));
        const localPriorityIds = new Set([
          ...pendingUpdateIdsRef.current,
          ...recentlyUpdatedIds,
          ...pendingDeleteIdsRef.current,
        ]);

        if (syncedFromAiven.length > 0) {
          setAllTransactions(prev => {
            const incomingById = new Map(syncedFromAiven.map(tx => [tx.id, tx]));
            const merged = prev.map(tx => {
              // An optimistic edit or a queued deletion must never be overwritten
              // by a delayed routine response.
              if (localPriorityIds.has(tx.id) || !tx.isSynced) return tx;
              return incomingById.get(tx.id) || tx;
            });
            const presentIds = new Set(merged.map(tx => tx.id));
            for (const tx of syncedFromAiven) {
              if (!presentIds.has(tx.id) && !localPriorityIds.has(tx.id)) merged.push(tx);
            }
            return sortTransactionsByDate(filterDeletedIds(deduplicateTransactions(merged)));
          });

          // Persist only the small safe window; a full clear-and-repopulate is now
          // reserved for the user's explicit full manual synchronization.
          const safeForCache = syncedFromAiven.filter(tx => !pendingDeleteIdsRef.current.has(tx.id));
          localDB.saveTransactions(safeForCache).catch(e => console.error('LocalDB recent sync error:', e));
        }

        if (recentlyUpdatedIds.size > 0) {
          recentlyUpdatedIdsRef.current.clear();
        }
        if (queuedDeleteResult.confirmedIds.length > 0) {
          console.log(`✅ Reconciliation retained ${queuedDeleteResult.confirmedIds.length} confirmed deletion(s).`);
        }

        setDatabaseConnected(true);
      } catch (error) {
        setDatabaseConnected(false);
        console.error('Full Aiven PostgreSQL refresh failed:', error);
      } finally {
        syncInProgressRef.current = false;

        // A socket/reconnect event may have arrived during the request above. Run
        // exactly one follow-up fetch so the event cannot be dropped by the lock.
        if (queuedRealtimeRefreshRef.current) {
          queuedRealtimeRefreshRef.current = false;
          window.setTimeout(() => void refreshAllFromAiven(true), 0);
        }
      }
    };

    // 1. Socket status tracking
    realtimeSync.setStatusCallback((connected: boolean) => {
      setSocketConnected(connected);
    });

    // App foreground mein forced full-refresh (cooldown bypass)
    realtimeSync.setPollCallback(() => refreshAllFromAiven(true));

    // Socket event se direct UI update instant hota hai. Is small delayed full
    // refresh se Android WebView reconnect/missed-event edge cases bhi Aiven ke
    // authoritative data se recover ho jaate hain.
    let realtimeRefreshTimer: number | undefined;
    const scheduleAuthoritativeRealtimeRefresh = () => {
      if (realtimeRefreshTimer !== undefined) window.clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = window.setTimeout(() => {
        realtimeRefreshTimer = undefined;
        void refreshAllFromAiven(true);
      }, 350);
    };

    // 2. Socket-based instant update (when connected)
    realtimeSync.setSyncCallback(async (remoteData: any) => {
      if (remoteData && remoteData.action) {
        console.log(`📡 Instant update received: ${remoteData.action}`);
        // Admin gets the server's aggregate snapshot directly. A normal user
        // reloads only their own seven inventory rows, so no other user's notes
        // ever become part of their Total Vault display.
        if (isAdminUser(currentUser) && remoteData.noteInventory?.counts && typeof remoteData.noteInventory.counts === 'object') {
          setDatabaseVault({ ...initializeVault(), ...remoteData.noteInventory.counts });
        } else {
          void refreshScopedDatabaseVault();
        }

        // Reconnect par ya manual reconciliation par full database refresh karo.
        // Yeh missed background events ko APK mein wapas le aata hai.
        if (remoteData.action === 'sync') {
          scheduleAuthoritativeRealtimeRefresh();
          return;
        }

        if (remoteData.action === 'add' && remoteData.transaction) {
          const incomingTx = { ...remoteData.transaction, isSynced: true };

          // ✅ BUG FIX: Agar yeh transaction delete ho chuki hai (pendingDeleteIds mein hai)
          // toh socket se aayi bhi ho toh wapas mat add karo — yahi ghost transaction ka cause tha!
          if (pendingDeleteIdsRef.current.has(incomingTx.id)) {
            console.log(`🚫 Socket 'add' blocked — transaction ${incomingTx.id} is in pendingDeleteIds (deleted locally).`);
            return;
          }

          const tempIdsToDelete = new Set<string>();

          setAllTransactions(prev => {
            // ✅ FIX: Check if this is OUR OWN broadcast (same device)
            // i.e., real server ID already exists in prev — skip to avoid double-add
            const exactMatch = prev.find(tx => tx.id === incomingTx.id && tx.isSynced);
            if (exactMatch) return prev; // Already up-to-date, no change needed

            // ✅ BUG FIX: deleted IDs ko filter karo state update mein bhi
            if (pendingDeleteIdsRef.current.has(incomingTx.id)) return prev;

            const existingDuplicate = prev.find(tx => isDuplicateTransaction(tx, incomingTx));

            if (existingDuplicate) {
              // Replace temp_ or duplicate with the synced server version
              const updated = prev.map(tx => {
                if (tx.id === existingDuplicate.id) {
                  if (tx.id !== incomingTx.id) tempIdsToDelete.add(tx.id);
                  return incomingTx;
                }
                return tx;
              });
              return sortTransactionsByDate(updated);
            }

            // New transaction from another device — add to top
            return sortTransactionsByDate([incomingTx, ...prev]);
          });

          // ✅ BUG FIX: pendingDelete mein hai toh LocalDB mein bhi mat save karo
          if (!pendingDeleteIdsRef.current.has(incomingTx.id)) {
            localDB.saveTransaction(incomingTx).catch(e => console.error('LocalDB Add Error:', e));
          }
          for (const tempId of tempIdsToDelete) {
            localDB.deleteTransaction(tempId).catch(e => console.error('LocalDB TempDel Error:', e));
          }
        }
        else if (remoteData.action === 'update' && remoteData.transaction) {
          const incomingTx = { ...remoteData.transaction, isSynced: true };

          // ✅ BUG FIX: Delete ho chuki transaction ka update bhi ignore karo
          if (pendingDeleteIdsRef.current.has(incomingTx.id)) {
            console.log(`🚫 Socket 'update' blocked — transaction ${incomingTx.id} is deleted locally.`);
            return;
          }

          const previousTx = remoteData.previousTransaction;
          let ignoredBecauseLocalUpdatePending = false;
          setAllTransactions(prev => {
            // A delayed socket payload must never replace an optimistic local edit that
            // is still waiting for its own PostgreSQL PUT acknowledgement.
            const localPendingEdit = prev.find(tx =>
              (tx.id === incomingTx.id || (previousTx?.id && tx.id === previousTx.id)) && !tx.isSynced
            );
            const recentlyConfirmedLocalEdit =
              pendingUpdateIdsRef.current.has(incomingTx.id) ||
              recentlyUpdatedIdsRef.current.has(incomingTx.id);
            if (localPendingEdit || recentlyConfirmedLocalEdit) {
              ignoredBecauseLocalUpdatePending = true;
              console.log(`🛡️ Socket update ignored for ${incomingTx.id}; local edit is pending.`);
              return prev;
            }

            let found = false;
            const next = prev.map(tx => {
              if (tx.id === incomingTx.id || (previousTx?.id && tx.id === previousTx.id)) {
                found = true;
                return incomingTx;
              }
              return tx;
            });

            if (!found) {
              // ✅ BUG FIX: Sirf add karo agar deleted nahi hai
              if (!pendingDeleteIdsRef.current.has(incomingTx.id)) {
                next.unshift(incomingTx);
              }
            }

            next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            return next;
          });
          // Never persist a delayed socket payload over a local pending edit or a deleted row.
          if (!ignoredBecauseLocalUpdatePending && !pendingDeleteIdsRef.current.has(incomingTx.id)) {
            try { await localDB.saveTransaction(incomingTx); } catch (e) { console.error('LocalDB Update Error:', e); }
          }
        }
        else if (remoteData.action === 'delete' && remoteData.ids) {
          setAllTransactions(prev => prev.filter(tx => !remoteData.ids.includes(tx.id)));
          // Also remove from LocalDB in background
          try {
            for (const id of remoteData.ids) {
              await localDB.deleteTransaction(id);
            }
          } catch (e) { console.error('LocalDB Delete Error:', e); }
          // ✅ No full Aiven PostgreSQL refresh needed — socket already sent correct IDs to remove
        }

        // Direct socket state merge ke baad Aiven database se reconcile karo.
        // Isse website se banayi hui entry APK list mein reliably aa jaati hai,
        // even if Android WebView ne background mein koi event miss kiya ho.
        if (['add', 'update', 'delete'].includes(remoteData.action)) {
          scheduleAuthoritativeRealtimeRefresh();
        }
      }
    });

    // Active-screen recovery: use a lighter five-second cadence while Socket.IO is
    // healthy, and a two-second fallback only while disconnected. Each pass now
    // requests just the newest 500 rows instead of the entire Aiven table.
    let fallbackPollTimer: number | undefined;
    const scheduleFallbackPoll = () => {
      const socketHealthy = realtimeSync.isSocketConnected();
      const delay = socketHealthy ? 5000 : 2000;
      fallbackPollTimer = window.setTimeout(() => {
        const appIsVisible = typeof document === 'undefined' || !document.hidden;
        if (appIsVisible || pendingDeleteIdsRef.current.size > 0 || !socketHealthy) {
          void refreshAllFromAiven(true);
        }
        scheduleFallbackPoll();
      }, delay);
    };
    scheduleFallbackPoll();

    const handleOnline = () => {
      console.log('📶 Device back online. Triggering sync...');
      refreshAllFromAiven(true);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      if (fallbackPollTimer !== undefined) window.clearTimeout(fallbackPollTimer);
      if (realtimeRefreshTimer !== undefined) window.clearTimeout(realtimeRefreshTimer);
      window.removeEventListener('online', handleOnline);
    };
  // recalculate functions useMemo se hain — yahan dep nahi chahiye
  }, [currentUser]);

  useEffect(() => {
    try {
      localStorage.setItem('companyNames', JSON.stringify(companyNames));
      localStorage.setItem('locations', JSON.stringify(locations));
    } catch (error) {
      console.error("Failed to save dynamic settings to localStorage", error);
    }
  }, [companyNames, locations]);

  // ExportDBService is a no-op — removed useEffect to prevent re-renders on every transaction change

  const addTransaction = useCallback(async (newTransactionData: Omit<Transaction, 'id'> & { manualDate?: string }) => {
    if (isSubmittingRef.current || isSubmitting) {
      console.warn("Submission in progress. Please wait.");
      return;
    }

    try {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      const transactionDate = newTransactionData.manualDate || newTransactionData.date;

      let slipToStore = (newTransactionData as any).slip;

      const tempId = generateNextTransactionId();
      const newTransaction: Transaction = {
        ...newTransactionData,
        id: tempId,
        clientId: tempId,
        date: transactionDate ? new Date(transactionDate).toISOString() : new Date().toISOString(),
        isSynced: false,
        slip: slipToStore
      } as Transaction;

      // ✅ STEP 1: SABSE PEHLE LocalDB mein save karo (retry ke saath)
      // Chahe offline ho ya online — data pehle local mein safe hona chahiye
      const saveToLocalWithRetry = async (tx: Transaction, retries = 3): Promise<boolean> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await localDB.saveTransaction(tx);
            console.log(`✅ LocalDB save success (attempt ${attempt}):`, tx.id);
            return true;
          } catch (e) {
            console.warn(`⚠️ LocalDB save attempt ${attempt} failed:`, e);
            if (attempt < retries) await new Promise(r => setTimeout(r, 200 * attempt));
          }
        }
        console.error('❌ LocalDB save failed after all retries for:', tx.id);
        return false;
      };

      await saveToLocalWithRetry(newTransaction);

      // ✅ STEP 2: UI turant update karo (LocalDB save ke baad)
      setAllTransactions(prev => [newTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      // STEP 3: Every new entry attempts the PostgreSQL write immediately. databaseConnected is
      // only an observed connection state; it must never decide whether a user write is sent.
      (async () => {
        try {
          let transactionForServer: Transaction = newTransaction;

          // Receipt media belongs in Discord. A receipt-upload failure must not prevent the
          // financial transaction itself from reaching PostgreSQL.
          if (slipToStore && slipToStore.startsWith('data:')) {
            console.log('📤 Uploading slip to Discord in background...');
            try {
              const fileId = await sendTelegramPhoto(slipToStore);
              if (fileId) {
                transactionForServer = { ...newTransaction, slip: `tg:${fileId}` };
                setAllTransactions(prev => prev.map(tx =>
                  tx.id === newTransaction.id ? transactionForServer : tx
                ));
                await saveToLocalWithRetry(transactionForServer);
              } else {
                console.warn('⚠️ Receipt upload returned no file ID; saving transaction without a remote receipt.');
                transactionForServer = { ...newTransaction, slip: undefined };
              }
            } catch (slipError) {
              console.warn('⚠️ Receipt upload failed; saving transaction without a remote receipt:', slipError);
              transactionForServer = { ...newTransaction, slip: undefined };
            }
          }

          const serverId = await d1Database.addTransaction(transactionForServer);
          if (!serverId) {
            // The unsynced local transaction remains durable and will be retried by sync.
            setDatabaseConnected(false);
            return;
          }

          const finalTx = { ...transactionForServer, id: serverId, isSynced: true };
          await localDB.deleteTransaction(newTransaction.id);
          await saveToLocalWithRetry(finalTx);
          setAllTransactions(prev => prev.map(tx =>
            (tx.id === newTransaction.id || tx.id === serverId) ? finalTx : tx
          ));
          setDatabaseConnected(true);
          realtimeSync.notifyUpdate({ action: 'add', transaction: finalTx });
        } catch (e) {
          // Keep the local isSynced:false record so the normal sync queue can retry it.
          setDatabaseConnected(false);
          console.error("Background PostgreSQL save error:", e);
        }
      })();

      setSyncStatus('idle');

    } catch (error) {
      console.error('Error in transaction process:', error);
      setSyncStatus('error');
      alert(`Error saving transaction: ${error instanceof Error ? error.message : 'Unknown error'}. Please check your connection.`);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isSubmitting, databaseConnected]);

  const addForwardEntry = useCallback(async (debitTransaction: Omit<Transaction, 'id'>, creditTransaction: Omit<Transaction, 'id'>) => {
    if (isSubmittingRef.current || isSubmitting) {
      console.warn("Submission in progress. Please wait.");
      return;
    }

    try {
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      const debitTempId = generateNextTransactionId();
      const newDebitTransaction: Transaction = {
        ...debitTransaction,
        id: debitTempId,
        clientId: debitTempId,
        isSynced: false,
      };

      const creditTempId = generateNextTransactionId();
      const newCreditTransaction: Transaction = {
        ...creditTransaction,
        id: creditTempId,
        clientId: creditTempId,
        isSynced: false,
      };

      // ✅ FIX: LocalDB mein PEHLE save karo (phir UI update)
      // Pehle UI update hota tha aur LocalDB baad mein — agar error aata toh data lost ho jaata
      try {
        await localDB.saveTransaction(newDebitTransaction);
        await localDB.saveTransaction(newCreditTransaction);
        console.log('✅ Forward entry saved to LocalDB:', debitTempId, creditTempId);
      } catch (e) {
        console.error("❌ LocalDB forward entry save failed:", e);
      }

      // UI update after LocalDB save
      setAllTransactions(prev => [newDebitTransaction, newCreditTransaction, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

      (async () => {
        setSyncStatus('syncing');
        // The connection flag is diagnostic only. Always attempt both PostgreSQL writes.
        const [serverIdDebit, serverIdCredit] = await Promise.all([
          d1Database.addTransaction(newDebitTransaction),
          d1Database.addTransaction(newCreditTransaction),
        ]);

          if (serverIdDebit && serverIdCredit) {
            const oldIdDebit = newDebitTransaction.id;
            const oldIdCredit = newCreditTransaction.id;

            const syncDebit = { ...newDebitTransaction, id: serverIdDebit, isSynced: true };
            const syncCredit = { ...newCreditTransaction, id: serverIdCredit, isSynced: true };

            // Cleanup old local temp IDs and save new ones
            await localDB.deleteTransaction(oldIdDebit);
            await localDB.deleteTransaction(oldIdCredit);
            await localDB.saveTransaction(syncDebit);
            await localDB.saveTransaction(syncCredit);

            setAllTransactions(prev => prev.map(tx => {
              if (tx.id === oldIdDebit) return syncDebit;
              if (tx.id === oldIdCredit) return syncCredit;
              return tx;
            }));

            // Notify other devices about new forward entry with real IDs
            realtimeSync.notifyUpdate({ action: 'add', transaction: syncDebit });
            realtimeSync.notifyUpdate({ action: 'add', transaction: syncCredit });
            console.log(`✅ Forward entry synced to Aiven PostgreSQL: ${serverIdDebit}, ${serverIdCredit}`);
          } else {
            // ✅ FIX: Partial upload — jo upload hua uska ID update karo, jo nahi hua woh isSynced:false rahe (retry on next sync)
            console.warn(`⚠️ Forward entry partial upload: debit=${serverIdDebit}, credit=${serverIdCredit}. Missing ones will retry on next sync.`);
            if (serverIdDebit) {
              const syncDebit = { ...newDebitTransaction, id: serverIdDebit, isSynced: true };
              await localDB.deleteTransaction(newDebitTransaction.id);
              await localDB.saveTransaction(syncDebit);
              setAllTransactions(prev => prev.map(tx => tx.id === newDebitTransaction.id ? syncDebit : tx));
            }
            if (serverIdCredit) {
              const syncCredit = { ...newCreditTransaction, id: serverIdCredit, isSynced: true };
              await localDB.deleteTransaction(newCreditTransaction.id);
              await localDB.saveTransaction(syncCredit);
              setAllTransactions(prev => prev.map(tx => tx.id === newCreditTransaction.id ? syncCredit : tx));
            }
          }

        setDatabaseConnected(Boolean(serverIdDebit && serverIdCredit));
        setSyncStatus(serverIdDebit && serverIdCredit ? 'success' : 'idle');
      })().catch(error => {
        setSyncStatus('error');
        console.error(`Failed to save or sync forward entry:`, error);
      });
    } catch (error) {
      console.error("Error adding forward entry:", error);
      setSyncStatus('error');
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isSubmitting, databaseConnected]);

  const settleBankBalance = useCallback(async (sourceBank: string, targetBank: string, amount: number, recordedBy: string, location: string, service?: string) => {
    if (amount <= 0 || isSubmitting) return;

    setIsSubmitting(true);
    isSubmittingRef.current = true;

    const serviceLabel = service || 'SETTLEMENT';

    try {
      const timestamp = new Date().toISOString();
      // 1. Debit from source
      const debitTx: Omit<Transaction, 'id'> = {
        type: 'debit',
        paymentMethod: 'upi',
        company: 'INTERNAL TRANSFER',
        person: `${serviceLabel} (TO ${targetBank})`,
        bank: sourceBank,
        location: location,
        recordedBy: recordedBy,
        amount: amount,
        notes: `${serviceLabel} transfer to ${targetBank}`,
        date: timestamp,
        breakdown: {}
      };

      // 2. Credit to target
      const creditTx: Omit<Transaction, 'id'> = {
        type: 'credit',
        paymentMethod: 'upi',
        company: 'INTERNAL TRANSFER',
        person: `${serviceLabel} (FROM ${sourceBank})`,
        bank: targetBank,
        location: location,
        recordedBy: recordedBy,
        amount: amount,
        notes: `${serviceLabel} received from ${sourceBank}`,
        date: timestamp,
        breakdown: {}
      };

      const now = Date.now();
      const id1 = `temp_${now}_1`;
      const id2 = `temp_${now + 1}_2`;
      const newTransactions = [
        { ...debitTx, id: id1, clientId: id1, isSynced: false },
        { ...creditTx, id: id2, clientId: id2, isSynced: false }
      ];

      // Use functional update to avoid stale allTransactions closure
      setAllTransactions(prev => [...newTransactions, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      // Balances and Vault update automatically via useMemo when allTransactions changes


      // Persist in the background. The connection indicator must not suppress a user write.
      (async () => {
        let allWritesSucceeded = true;
        for (const tx of newTransactions) {
          await localDB.saveTransaction(tx);
          const serverId = await d1Database.addTransaction(tx);
          if (serverId) {
            const synced = { ...tx, id: serverId, isSynced: true };
            await localDB.deleteTransaction(tx.id);
            await localDB.saveTransaction(synced);
            setAllTransactions(prev => prev.map(t => t.id === tx.id ? synced : t));
            realtimeSync.notifyUpdate({ action: 'add', transaction: synced });
          } else {
            allWritesSucceeded = false;
          }
        }
        setDatabaseConnected(allWritesSucceeded);
      })().catch(error => {
        setDatabaseConnected(false);
        console.error('Failed to save settlement transactions to PostgreSQL:', error);
      });
    } catch (error) {
      console.error('Settlement transaction failed:', error);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isSubmitting, databaseConnected]);

  const updateTransaction = useCallback(async (updatedTransaction: Transaction & { manualDate?: string }) => {
    const normalizedTransaction = updatedTransaction.manualDate
      ? { ...updatedTransaction, date: new Date(updatedTransaction.manualDate).toISOString() }
      : { ...updatedTransaction };

    // An edit remains local-priority until PostgreSQL confirms its write. This prevents a
    // polling snapshot or a delayed socket event from temporarily restoring the old row.
    const optimisticUpdate: Transaction = { ...normalizedTransaction, isSynced: false };
    pendingUpdateIdsRef.current.add(optimisticUpdate.id);

    try {
      await localDB.saveTransaction(optimisticUpdate);
    } catch (e) {
      console.warn('⚠️ LocalDB pre-save failed on update:', e);
    }

    // UI update (LocalDB save ke baad). Keep isSynced:false until the PUT succeeds.
    let capturedOriginal: Transaction | undefined;
    setAllTransactions(prev => {
      capturedOriginal = prev.find(tx => tx.id === optimisticUpdate.id);
      const updated = prev.map(tx => tx.id === optimisticUpdate.id ? optimisticUpdate : tx)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return updated;
    });

    // Vault and Balances update automatically via useMemo when allTransactions changes

    // Save flow tabhi successful mana jayega jab PostgreSQL PUT confirm ho.
    // Edit page is promise ko await karta hai, isliye false-success redirect nahi hoga.
    await (async () => {
      try {
        // Working copy banao — original React state object ko mutate mat karo.
        let txToProcess: Transaction = { ...optimisticUpdate };

        let oldMessageIdToDelete: string | undefined;

        // Check if there was an old Telegram slip that is being updated or removed
        if (capturedOriginal && capturedOriginal.slip && capturedOriginal.slip.startsWith('tg:')) {
          const oldSlip = capturedOriginal.slip;
          const newSlip = txToProcess.slip;
          // If the slip has been removed or replaced
          if (!newSlip || newSlip !== oldSlip) {
            const content = oldSlip.replace(/^tg:(pdf:)?/, '');
            const parts = content.split(':');
            oldMessageIdToDelete = parts[1];
          }
        }

        // Telegram slip upload (agar naya slip hai to)
        if (txToProcess.slip && txToProcess.slip.startsWith('data:')) {
          console.log('📤 Uploading updated slip to Telegram in background...');
          const fileId = await sendTelegramPhoto(txToProcess.slip);
          if (fileId) {
            txToProcess = { ...txToProcess, slip: `tg:${fileId}` };
            console.log('✅ Updated slip uploaded to Telegram:', fileId);
          }
        }

        // Delete old Telegram message if any
        if (oldMessageIdToDelete) {
          console.log(`🗑️ Deleting old Telegram message ${oldMessageIdToDelete} after slip update...`);
          await deleteTelegramMessage(oldMessageIdToDelete);
        }

        // Local DB me save karo (working copy se)
        await localDB.saveTransaction(txToProcess);

        const needsInsert = txToProcess.id.toString().startsWith('temp_') || txToProcess.id.toString().startsWith('recovered_');
        let txToBroadcast: Transaction | null = null;
        let success = false;

        if (needsInsert) {
          if (!txToProcess.clientId) {
            txToProcess = { ...txToProcess, clientId: txToProcess.id };
          }
          const serverId = await d1Database.addTransaction(txToProcess);
          if (serverId) {
            txToBroadcast = { ...txToProcess, id: serverId, isSynced: true };
            await localDB.deleteTransaction(txToProcess.id);
            success = true;
          }
        } else {
          // The server receives the final synchronized record, while the UI/cache stays
          // unsynced until this request has acknowledged successfully.
          success = await d1Database.updateTransaction({ ...txToProcess, isSynced: true });
          if (success) {
            txToBroadcast = { ...txToProcess, isSynced: true };
          }
        }

        if (!success) {
          const unsyncedUpdate = { ...txToProcess, isSynced: false };
          await localDB.saveTransaction(unsyncedUpdate);
          setAllTransactions(prev => prev.map(tx => tx.id === unsyncedUpdate.id ? unsyncedUpdate : tx));
          setDatabaseConnected(false);
          console.log(`📴 Offline update saved locally; queued for Aiven PostgreSQL sync upon reconnect.`);
          // Graceful success for offline edit — do not throw error so user workflow is uninterrupted.
          return;
        }

        if (!txToBroadcast) return;
        setDatabaseConnected(true);
        await localDB.saveTransaction(txToBroadcast);

        // ✅ FIX: isSynced:true mark karo UI mein — ab polling ise overwrite nahi karegi
        // Kyunki polling mein pendingInMemory = isSynced:false wale transactions hain
        // Ab yeh transaction synced hai toh polling usse server data se replace karegi (correctly)
        setAllTransactions(prev => prev.map(tx =>
          tx.id === optimisticUpdate.id || tx.id === txToBroadcast!.id ? txToBroadcast! : tx
        ));

        // ✅ FIX: Is updated ID ko track karo — next polling mein full refresh hogi
        // Incremental sync (getNewTransactions) updated records nahi pakdti — isliye force full
        recentlyUpdatedIdsRef.current.add(txToBroadcast.id);
        pendingUpdateIdsRef.current.delete(txToBroadcast.id);
        // Cooldown reset karo taaki next polling turant full refresh kare
        lastFetchTimeRef.current = 0;

        await realtimeSync.notifyUpdate({
          action: 'update',
          transaction: txToBroadcast,
          previousTransaction: capturedOriginal
        });
      } catch (error) {
        console.error(`❌ Transaction update failed:`, error);
        throw error;
      }
    })();
  }, [databaseConnected]);

  const deleteTransactionsByIds = useCallback(async (ids: string[]) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return;

    const idsSet = new Set(uniqueIds);
    const transactionsToDelete = allTransactionsRef.current.filter(tx => idsSet.has(tx.id));

    // Persist intent before changing the UI. This queue survives a refresh, APK close,
    // and temporary network failure, and prevents a server refresh from resurrecting rows.
    addPendingDeletes(uniqueIds);
    setAllTransactions(prev => prev.filter(tx => !idsSet.has(tx.id)));

    try {
      // Remove local cache immediately. The queue above remains the source of truth for
      // the remote deletion until Aiven confirms it after a reconnect.
      for (const id of uniqueIds) {
        await localDB.deleteTransaction(id);
      }
    } catch (error) {
      // The intent is still safely stored in localStorage, so it will not be lost even
      // if IndexedDB is temporarily unavailable on this device.
      console.warn('Local delete cache update failed; queued server deletion is retained:', error);
    }

    const queuedDeleteResult = await flushPendingDeletes();
    if (queuedDeleteResult.pendingIds.length > 0) {
      setDatabaseConnected(false);
      console.log(`📴 ${queuedDeleteResult.pendingIds.length} deletion(s) remain queued for the next reconnect.`);
    } else if (queuedDeleteResult.confirmedIds.length > 0) {
      console.log(`✅ Aiven PostgreSQL delete confirmed for ${queuedDeleteResult.confirmedIds.length} transaction(s).`);
      lastFetchTimeRef.current = 0;
    }

    // Media cleanup is independent from transaction persistence. It is deliberately
    // non-blocking so an offline file deletion can never undo the queued DB delete.
    for (const tx of transactionsToDelete) {
      if (tx.slip && tx.slip.startsWith('tg:')) {
        const content = tx.slip.replace(/^tg:(pdf:)?/, '');
        const messageId = content.split(':')[1];
        if (messageId) {
          void deleteTelegramMessage(messageId).catch(error =>
            console.warn(`Media cleanup will be retried separately for transaction ${tx.id}:`, error)
          );
        }
      }
    }
  }, [flushPendingDeletes]);


  const addCompany = useCallback(async (companyName: string) => {
    setCompanyNames(prev => [...prev, companyName].sort());
  }, []);

  const deleteCompany = useCallback(async (companyName: string) => {
    setCompanyNames(prev => prev.filter(c => c !== companyName));
  }, []);

  const addLocation = useCallback(async (location: string) => {
    setLocations(prev => [...prev, location].sort());
  }, []);

  const deleteLocation = useCallback(async (location: string) => {
    setLocations(prev => prev.filter(l => l !== location));
  }, []);


  const clearLocalDB = useCallback(async () => {
    try {
      await localDB.clearTransactions();
      setAllTransactions([]);
      console.log('✅ Local database cleared successfully.');
    } catch (error) {
      console.error('❌ Failed to clear local database:', error);
    }
  }, []);

  const value = {
    user: currentUser,
    transactions,
    vault,
    companyNames,
    locations,
    personNames,
    addTransaction,
    addForwardEntry,
    settleBankBalance,
    updateTransaction,
    deleteTransactionsByIds,
    addCompany,
    deleteCompany,
    addLocation,
    deleteLocation,
    databaseConnected,
    socketConnected,
    syncStatus,
    manualSync,
    clearLocalDB,
    bankBalances,
    totalSystemCount: allTransactions.length,
    reconnectSocket: () => realtimeSync.reconnect(),
    addBank: async (name: string, logo?: string) => {
      const newBank = { name, logo: logo || 'https://cdn-icons-png.flaticon.com/512/2830/2830284.png' };
      const updated = [...customBanks, newBank];
      setCustomBanks(updated);
      localStorage.setItem('customBanks', JSON.stringify(updated));
    },
    deleteBank: async (name: string) => {
      const updated = customBanks.filter(b => b.name !== name);
      setCustomBanks(updated);
      localStorage.setItem('customBanks', JSON.stringify(updated));
    },
    updateBank: async (oldName: string, newName: string) => {
      const updated = customBanks.map(b => b.name === oldName ? { ...b, name: newName } : b);
      setCustomBanks(updated);
      localStorage.setItem('customBanks', JSON.stringify(updated));
    },
    allBankNames,
    allBankLogos,
    userIdentityKeys,
  };


  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

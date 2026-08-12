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
  d1Connected: boolean;
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
  const [companyNames, setCompanyNames] = useState<string[]>(() => {
    const saved = localStorage.getItem('companyNames');
    return saved ? JSON.parse(saved) : defaultCompanyNames;
  });
  const [locations, setLocations] = useState<string[]>(() => {
    const saved = localStorage.getItem('locations');
    return saved ? JSON.parse(saved) : LOCATIONS;
  });
  const [d1Connected, setD1Connected] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
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
  const lastFetchTimeRef = useRef<number>(0);
  const allTransactionsRef = useRef<Transaction[]>([]);
  // ✅ FIX: Track recently updated IDs — polling inhe overwrite na kare
  // updateTransaction ke baad yeh set mein add hota hai
  // Next full refresh ke baad clear ho jaata hai
  const recentlyUpdatedIdsRef = useRef<Set<string>>(new Set<string>());
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

  const vault = useMemo(() => recalculateVault(allTransactions), [allTransactions, recalculateVault]);
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
      console.log('🔄 Starting manual sync with D1...');

      const localTransactions = await localDB.getTransactions();
      console.log(`💿 Loaded ${localTransactions.length} local transactions for sync.`);

      // ✅ Upload any unsynced (offline) local transactions to D1 first
      // FIX: !tx.isSynced covers both false AND undefined (older records)
      const unsyncedLocal = localTransactions.filter(tx => !tx.isSynced);
      const idRecordMap: Record<string, string> = {};

      for (const localTx of unsyncedLocal) {
        console.log(`📤 Uploading offline transaction ${localTx.id} to D1.`);
        if (!localTx.id.toString().startsWith('temp_') && !localTx.id.toString().startsWith('recovered_')) {
          const updated = await d1Database.updateTransaction(localTx);
          if (updated) {
            localTx.isSynced = true;
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

      // Step 3: D1 se incremental/full fetch depending on local data
      console.log('📥 Fetching latest data from D1...');

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

      setD1Connected(true);

      const syncedFromServer = fetchedTransactions.map(tx => ({ ...tx, isSynced: true }));

      // ✅ Functional update: current UI state se pendingInMemory lo (fresh)
      setAllTransactions(prev => {
        const pendingInMemory = prev.filter(tx => !tx.isSynced);
        let mergedList: Transaction[];
        if (isFullSync) {
          // ✅ FIX: Full sync mein recently-updated transactions ko D1 stale data se bachao
          const serverIds = new Set(syncedFromServer.map(tx => tx.id));
          const localSyncedNotInServer = prev.filter(tx =>
            tx.isSynced && !serverIds.has(tx.id)
          );

          // Local priority: pending (editing) + recently updated (D1 might be stale)
          const localPriorityIds = new Set([
            ...pendingInMemory.map(tx => tx.id),
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
      setD1Connected(false);
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
        setD1Connected(false);
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
      setD1Connected(false);
      setSyncStatus('idle');
      syncInProgressRef.current = false;
      localDB.clearAndRepopulateTransactions([]).catch(() => { });
      hasInitialLoadRun.current = false;
    }

    // Current user UID track karo
    currentUserUidRef.current = currentUser.uid;

    if (hasInitialLoadRun.current) return; // Already ran — skip
    hasInitialLoadRun.current = true;

    // App open hone par SIRF EK BAAR D1 se sync karo
    const initialLoad = async () => {
      setSyncStatus('syncing');
      try {
        // Step 1: LocalDB se turant load karo
        console.log('⚡ Loading from LocalDB...');
        const localTransactions = await localDB.getTransactions();
        if (localTransactions && localTransactions.length > 0) {
          const sortedLocal = [...localTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setAllTransactions(sortedLocal);
          console.log(`✅ LocalDB se ${sortedLocal.length} transactions loaded.`);
        }

        // Step 2: D1 se INCREMENTAL/Full fetch karo depending on local data
        // initializeDatabase background mein chalao — UI block nahi hogi
        d1Database.initializeDatabase().catch(e => console.warn('DB init error (background):', e));

        const numericIds = localTransactions
          .map(tx => parseInt(tx.id))
          .filter(id => !isNaN(id));
        const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;

        let fetched: Transaction[] = [];
        let isFullSync = false;

        if (localTransactions.length > 0 && maxId > 0) {
          console.log(`📥 Incremental Initial Sync: fetching updates since maxId ${maxId}`);
          fetched = await d1Database.getNewTransactions(maxId);
        } else {
          console.log(`📥 Initial Sync: Loaded all records from D1 (Full Sync).`);
          fetched = await d1Database.getAllTransactions(-1);
          isFullSync = true;
        }

        setD1Connected(true);

        if (fetched && fetched.length > 0) {
          const syncedFromD1 = fetched.map(tx => ({ ...tx, isSynced: true }));

          const pendingLocal = localTransactions.filter(tx => !tx.isSynced);
          const alreadySyncedLocal = localTransactions.filter(tx => tx.isSynced);

          const mergedList = [...syncedFromD1, ...alreadySyncedLocal, ...pendingLocal];
          const deduplicatedList = deduplicateTransactions(mergedList);
          const finalSorted = sortTransactionsByDate(filterDeletedIds(deduplicatedList));

          setAllTransactions(finalSorted);
          
          // Aiven is the authoritative transaction store. A stale/blocked
          // IndexedDB cache must never turn a successful server sync into a
          // visible Sync failed error on the device.
          try {
            if (isFullSync) {
              await localDB.clearAndRepopulateTransactions(finalSorted);
            } else {
              // Save only the new/updated transactions incrementally
              for (const tx of syncedFromD1) {
                await localDB.saveTransaction(tx);
              }
            }
          } catch (cacheError) {
            console.warn('Local cache update skipped after successful server sync:', cacheError);
          }
          console.log(`✅ App open sync complete. Loaded ${fetched.length} updates. Total: ${finalSorted.length}`);
        } else {
          console.log('ℹ️ No new updates from D1. Using local data.');
          if (localTransactions.length > 0) {
            const finalSorted = sortTransactionsByDate(localTransactions);
            setAllTransactions(finalSorted);
          }
        }

        setSyncStatus('success');
      } catch (error) {
        setD1Connected(false);
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

    const refreshAllFromD1 = async (force = false) => {
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTimeRef.current;

      // Throttle: agar 20 second se pehle fetch ho chuka hai, skip karo (unless forced)
      if (!force && timeSinceLastFetch < FETCH_COOLDOWN_MS) {
        console.log(`⏱️ Fetch skipped — last fetch was ${Math.round(timeSinceLastFetch / 1000)}s ago.`);
        return;
      }

      if (syncInProgressRef.current) return;
      syncInProgressRef.current = true;
      lastFetchTimeRef.current = now;

      try {
        const localTransactions = await localDB.getTransactions();

        // Auto-push unsynced local transactions to D1 in background
        const unsyncedLocal = localTransactions.filter(tx => !tx.isSynced);
        if (unsyncedLocal.length > 0) {
          console.log(`📤 Auto-syncing ${unsyncedLocal.length} offline transactions...`);
          for (const tx of unsyncedLocal) {
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

        // ✅ FIX: Re-read localTransactions AFTER uploading offline transactions
        // Pehle localTransactions mein temp_ IDs the, ab server IDs hain — maxId sahi milega
        const freshLocalTransactions = await localDB.getTransactions();
        const numericIds = freshLocalTransactions.map(tx => parseInt(tx.id)).filter(id => !isNaN(id));
        const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;

        // ✅ FIX: Agar koi recently updated ID hai, toh force full refresh karo
        // Incremental sync (getNewTransactions) sirf NAYE records laata hai — updates ko miss karta hai
        // Updated transactions ka ID same rehta hai (koi nayi row nahi banti)
        // Isliye full D1 fetch zaroori hai taaki updated data sahi aaye
        // ✅ FIX: IDs snapshot pehle save karo, PHIR clear karo
        // Warna mergedList build hone tak IDs already clear ho jaate hain
        const recentlyUpdatedIds = new Set(recentlyUpdatedIdsRef.current);
        const hasRecentUpdates = recentlyUpdatedIds.size > 0;
        const shouldForceFull = force || hasRecentUpdates;

        if (hasRecentUpdates) {
          console.log(`🔄 ${recentlyUpdatedIds.size} recently updated transaction(s) detected — forcing full D1 refresh.`);
          recentlyUpdatedIdsRef.current.clear(); // Clear karo taaki next cycle mein repeat na ho
        }

        // Force full refresh when forced (delete/foreground/recent-updates); otherwise incremental
        const fetchedAll = shouldForceFull
          ? await d1Database.getAllTransactions(-1)
          : null;

        const fetched = fetchedAll ?? await d1Database.getNewTransactions(maxId);

        if (fetched.length === 0 && !shouldForceFull) {
          console.log('✅ No new data in polling.');
          return;
        }

        const syncedFromD1 = fetched.map(tx => ({ ...tx, isSynced: true }));

        // ✅ FIX: Use functional update to MERGE with current in-memory state.
        // This prevents: (1) screen flash when network is slow,
        // (2) race condition where a just-saved temp_ transaction gets lost.
        setAllTransactions(prev => {
          // Pending = transactions in current UI that are NOT yet synced (temp_ / offline)
          const pendingInMemory = prev.filter(tx => !tx.isSynced);

          let mergedList: Transaction[];
          if (shouldForceFull || fetchedAll !== null) {
            const serverIds = new Set(syncedFromD1.map(tx => tx.id));
            const localSyncedNotInServer = prev.filter(tx =>
              tx.isSynced && !serverIds.has(tx.id)
            );

            // ✅ BUG FIX: D1 replica lag se update overwrite hona band karo
            // recentlyUpdatedIds mein woh IDs hain jo abhi-abhi update hui hain
            // D1 ka stale replica inhe overwrite kar sakta hai — isliye local version protect karo
            // pendingInMemory ke IDs bhi protect karo (concurrent update mid-flight)
            const localPriorityIds = new Set([
              ...pendingInMemory.map(tx => tx.id),
              ...recentlyUpdatedIds,          // recently updated — local is fresher
            ]);

            // D1 se aaya stale data filter karo jo local mein fresh hai
            const filteredServerData = syncedFromD1.filter(tx => !localPriorityIds.has(tx.id));
            const filteredLocalSynced = localSyncedNotInServer.filter(tx => !localPriorityIds.has(tx.id));

            // Local priority transactions: pending + recently updated
            const localPriorityTxs = prev.filter(tx => localPriorityIds.has(tx.id));

            mergedList = [...filteredServerData, ...filteredLocalSynced, ...localPriorityTxs];
            console.log(`🛡️ Protected ${localPriorityIds.size} local-priority transactions from D1 stale overwrite.`);
          } else {
            // Incremental: add new/updated from server, KEEP existing synced locals
            const serverIds = new Set(syncedFromD1.map(tx => tx.id));
            const existingSynced = prev.filter(tx => tx.isSynced && !serverIds.has(tx.id));
            mergedList = [...syncedFromD1, ...existingSynced, ...pendingInMemory];
          }

          const deduplicatedList = deduplicateTransactions(mergedList);
          const finalSorted = sortTransactionsByDate(filterDeletedIds(deduplicatedList));

          // Find temporary IDs that were deduplicated (present in prev but removed in finalSorted)
          const prevTempIds = new Set<string>(prev.filter((tx: Transaction) => !tx.isSynced).map((tx: Transaction) => tx.id));
          const finalTempIds = new Set<string>(finalSorted.filter((tx: Transaction) => !tx.isSynced).map((tx: Transaction) => tx.id));
          const removedTempIds: string[] = [...prevTempIds].filter((id: string) => !finalTempIds.has(id));


          // Background: persist to IndexedDB without blocking UI
          (async () => {
            try {
              if (shouldForceFull || fetchedAll !== null) {
                // For full sync, do a clean repopulate
                await localDB.clearAndRepopulateTransactions(finalSorted);
              } else {
                // Incremental: save new server transactions and delete deduplicated temp ones
                for (const tx of syncedFromD1) {
                  // ✅ BUG FIX: Deleted transactions ko IndexedDB mein wapas mat save karo
                  if (!pendingDeleteIdsRef.current.has(tx.id)) {
                    await localDB.saveTransaction(tx);
                  }
                }
                for (const tempId of removedTempIds) {
                  await localDB.deleteTransaction(tempId);
                }
              }
            } catch (e) {
              console.error('LocalDB sync error in polling:', e);
            }
          })();

          return finalSorted;
        });

        setD1Connected(true);
      } catch (error) {
        setD1Connected(false);
        console.error('Full D1 refresh failed:', error);
      } finally {
        syncInProgressRef.current = false;
      }
    };

    // 1. Socket status tracking
    realtimeSync.setStatusCallback((connected: boolean) => {
      setSocketConnected(connected);
    });

    // App foreground mein forced full-refresh (cooldown bypass)
    realtimeSync.setPollCallback(() => refreshAllFromD1(true));

    // 2. Socket-based instant update (when connected)
    realtimeSync.setSyncCallback(async (remoteData: any) => {
      if (remoteData && remoteData.action) {
        console.log(`📡 Instant update received: ${remoteData.action}`);

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
          setAllTransactions(prev => {
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
          // ✅ BUG FIX: Deleted transaction LocalDB mein wapas mat save karo
          if (!pendingDeleteIdsRef.current.has(incomingTx.id)) {
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
          // ✅ No full D1 refresh needed — socket already sent correct IDs to remove
        }
      }
    });

    // Polling: fallback for when WebSocket is disconnected or in background
    // 60 seconds interval — reduces unnecessary server calls
    const refreshInterval = window.setInterval(() => refreshAllFromD1(false), 60000);

    const handleOnline = () => {
      console.log('📶 Device back online. Triggering sync...');
      refreshAllFromD1(true);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.clearInterval(refreshInterval);
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

      // ✅ STEP 3: BACKGROUND mein D1 + Telegram sync (offline ho to skip, baad mein manualSync karega)
      const currentD1Connected = d1Connected;
      (async () => {
        try {
          if (slipToStore && slipToStore.startsWith('data:')) {
            console.log('📤 Uploading slip to Telegram in background...');
            const fileId = await sendTelegramPhoto(slipToStore);
            if (fileId) {
              const tgSlip = `tg:${fileId}`;
              console.log('✅ Background Slip upload success:', fileId);
              const updatedWithTg = { ...newTransaction, slip: tgSlip };
              setAllTransactions(prev => prev.map(tx => tx.id === newTransaction.id ? updatedWithTg : tx));
              await saveToLocalWithRetry(updatedWithTg);

              if (currentD1Connected) {
                const serverId = await d1Database.addTransaction(updatedWithTg);
                if (serverId) {
                  const finalTx = { ...updatedWithTg, id: serverId, isSynced: true };
                  await localDB.deleteTransaction(newTransaction.id);
                  await saveToLocalWithRetry(finalTx);
                  setAllTransactions(prev => prev.map(tx => (tx.id === newTransaction.id || tx.id === serverId) ? finalTx : tx));
                  realtimeSync.notifyUpdate({ action: 'add', transaction: finalTx });
                }
              }
            } else if (currentD1Connected) {
              const serverId = await d1Database.addTransaction(newTransaction);
              if (serverId) {
                const finalTx = { ...newTransaction, id: serverId, isSynced: true };
                await localDB.deleteTransaction(newTransaction.id);
                await saveToLocalWithRetry(finalTx);
                setAllTransactions(prev => prev.map(tx => (tx.id === newTransaction.id || tx.id === serverId) ? finalTx : tx));
                realtimeSync.notifyUpdate({ action: 'add', transaction: finalTx });
              }
            }
          } else if (currentD1Connected) {
            const serverId = await d1Database.addTransaction(newTransaction);
            if (serverId) {
              const finalTx = { ...newTransaction, id: serverId, isSynced: true };
              await localDB.deleteTransaction(newTransaction.id);
              await saveToLocalWithRetry(finalTx);
              setAllTransactions(prev => prev.map(tx => (tx.id === newTransaction.id || tx.id === serverId) ? finalTx : tx));
              realtimeSync.notifyUpdate({ action: 'add', transaction: finalTx });
            }
          }
          // Offline case: transaction already saved locally with isSynced:false
          // manualSync ya next polling mein automatically D1 pe upload ho jaayega
        } catch (e) {
          console.error("Background sync error:", e);
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
  }, [isSubmitting, d1Connected]);

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

      const currentD1Connected = d1Connected;
      (async () => {
        if (currentD1Connected) {
          setSyncStatus('syncing');
          // ✅ FIX: isAddingTransaction lock HATA diya D1Database se, ab concurrent uploads kaam karengi
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
            console.log(`✅ Forward entry synced to D1: ${serverIdDebit}, ${serverIdCredit}`);
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

          setSyncStatus('success');
        }
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
  }, [isSubmitting, d1Connected]);

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


      const currentD1Connected = d1Connected;
      // Persist in background
      (async () => {
        for (const tx of newTransactions) {
          await localDB.saveTransaction(tx);
          if (currentD1Connected) {
            const serverId = await d1Database.addTransaction(tx);
            if (serverId) {
              const synced = { ...tx, id: serverId, isSynced: true };
              await localDB.deleteTransaction(tx.id);
              await localDB.saveTransaction(synced);
              setAllTransactions(prev => prev.map(t => t.id === tx.id ? synced : t));
              realtimeSync.notifyUpdate({ action: 'add', transaction: synced });
            }
          }
        }
      })();
    } catch (error) {
      console.error('Settlement transaction failed:', error);
    } finally {
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  }, [isSubmitting, d1Connected]);

  const updateTransaction = useCallback(async (updatedTransaction: Transaction & { manualDate?: string }) => {
    if (updatedTransaction.manualDate) {
      updatedTransaction.date = new Date(updatedTransaction.manualDate).toISOString();
    }

    // ✅ FIX: LocalDB mein PEHLE save karo (isSynced: false mark karke)
    // Pehle UI pehle update hoti thi — agar background fail hota toh LocalDB stale rehta
    try {
      await localDB.saveTransaction({ ...updatedTransaction, isSynced: false });
    } catch (e) {
      console.warn('⚠️ LocalDB pre-save failed on update:', e);
    }

    // UI update (LocalDB save ke baad)
    let capturedOriginal: Transaction | undefined;
    setAllTransactions(prev => {
      capturedOriginal = prev.find(tx => tx.id === updatedTransaction.id);
      const updated = prev.map(tx => tx.id === updatedTransaction.id ? updatedTransaction : tx)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return updated;
    });

    // Vault and Balances update automatically via useMemo when allTransactions changes

    // BACKGROUND mein Telegram upload, D1 sync aur Socket notification
    (async () => {
      try {
        // ✅ FIX: Working copy banao — original updatedTransaction ko mutate mat karo
        // Direct state object mutation = React bugs + stale closure issues
        let txToProcess = { ...updatedTransaction };

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
          success = await d1Database.updateTransaction(txToProcess);
          if (success) {
            txToBroadcast = { ...txToProcess, isSynced: true };
          }
        }

        if (!success) {
          const unsyncedUpdate = { ...txToProcess, isSynced: false };
          await localDB.saveTransaction(unsyncedUpdate);
          setAllTransactions(prev => prev.map(tx => tx.id === unsyncedUpdate.id ? unsyncedUpdate : tx));
          setD1Connected(false);
          return;
        }

        if (!txToBroadcast) return;
        setD1Connected(true);
        await localDB.saveTransaction(txToBroadcast);

        // ✅ FIX: isSynced:true mark karo UI mein — ab polling ise overwrite nahi karegi
        // Kyunki polling mein pendingInMemory = isSynced:false wale transactions hain
        // Ab yeh transaction synced hai toh polling usse server data se replace karegi (correctly)
        setAllTransactions(prev => prev.map(tx =>
          tx.id === updatedTransaction.id || tx.id === txToBroadcast!.id ? txToBroadcast! : tx
        ));

        // ✅ FIX: Is updated ID ko track karo — next polling mein full refresh hogi
        // Incremental sync (getNewTransactions) updated records nahi pakdti — isliye force full
        recentlyUpdatedIdsRef.current.add(txToBroadcast.id);
        // Cooldown reset karo taaki next polling turant full refresh kare
        lastFetchTimeRef.current = 0;

        await realtimeSync.notifyUpdate({
          action: 'update',
          transaction: txToBroadcast,
          previousTransaction: capturedOriginal
        });
      } catch (error) {
        console.error(`❌ Background update failed:`, error);
      }
    })();
  }, [d1Connected]);

  const deleteTransactionsByIds = useCallback(async (ids: string[]) => {
    const idsSet = new Set(ids);
    const transactionsToDelete = allTransactionsRef.current.filter(tx => idsSet.has(tx.id));

    // ✅ STEP 1: Pending deletes mein add karo SABSE PEHLE
    // Yeh ensure karta hai ki koi bhi sync inhe wapas na laye
    addPendingDeletes(ids);

    // STEP 2: UI turant update karo
    setAllTransactions(prev => prev.filter(tx => !idsSet.has(tx.id)));

    // STEP 3: Socket notify karo
    realtimeSync.notifyUpdate({ action: 'delete', ids: ids });

    // STEP 4: BACKGROUND mein LocalDB + D1 + Telegram delete
    (async () => {
      try {
        // LocalDB se delete (hamesha — offline bhi)
        for (const id of ids) {
          await localDB.deleteTransaction(id);
        }

        // D1 se delete — retry ke saath (3 attempts)
        const realIds = ids.filter(id => !id.startsWith('temp_') && !id.startsWith('recovered_'));
        const confirmedDeletedIds: string[] = [];

        for (const id of realIds) {
          let deleted = false;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              const ok = await d1Database.deleteTransaction(id);
              if (ok) { deleted = true; break; }
            } catch (e) {
              console.warn(`⚠️ D1 delete attempt ${attempt} failed for ${id}:`, e);
            }
            if (attempt < 3) await new Promise(r => setTimeout(r, 500 * attempt));
          }
          if (deleted) {
            confirmedDeletedIds.push(id);
            console.log(`✅ D1 delete confirmed: ${id}`);
          } else {
            console.error(`❌ D1 delete failed after 3 attempts for ${id} — will retry on next sync`);
            // pendingDeleteIds mein rakho — next sync mein filter rahega
          }
        }

        // temp_ IDs: local only the, koi D1 record nahi — safe to remove from pending
        const tempIds = ids.filter(id => id.startsWith('temp_') || id.startsWith('recovered_'));
        removePendingDeletes([...confirmedDeletedIds, ...tempIds]);

        // Telegram media delete (slow — last mein)
        for (const tx of transactionsToDelete) {
          if (tx.slip && tx.slip.startsWith('tg:')) {
            const content = tx.slip.replace(/^tg:(pdf:)?/, '');
            const parts = content.split(':');
            const messageId = parts[1];
            if (messageId) {
              console.log(`🗑️ Deleting media message ${messageId} for transaction ${tx.id}...`);
              await deleteTelegramMessage(messageId);
            }
          }
        }
      } catch (error) {
        console.error(`❌ Background delete failed:`, error);
      }
    })();
  }, []);


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
    d1Connected,
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

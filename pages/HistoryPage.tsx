import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../types';
import { DENOMINATIONS, BANK_LOGOS } from '../constants';
import { TrashIcon } from '../components/icons/TrashIcon';
import { PencilIcon } from '../components/icons/PencilIcon';
import { FilterIcon } from '../components/icons/FilterIcon';
import { ChevronDownIcon } from '../components/icons/ChevronDownIcon';
import { ChevronRightIcon } from '../components/icons/ChevronRightIcon';
import { ArrowPathIcon } from '../components/icons/ArrowPathIcon';
import { WalletIcon } from '../components/icons/WalletIcon';
import { PrinterIcon } from '../components/icons/PrinterIcon';

import TotalVaultDetails from '../components/TotalVaultDetails';
import { sendTelegramPhoto } from '../services/telegramService';
import SlipImage from '../components/SlipImage';
import { aivenDatabase } from '../services/AivenDatabaseService';

const TRANSACTIONS_PER_PAGE = 50;

const HistoryPage: React.FC = () => {
  const { user, transactions, deleteTransactionsByIds, companyNames, locations, manualSync, syncStatus, personNames, vault, addForwardEntry } = useAppContext();
  const location = useLocation();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterLocation, setFilterLocation] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterRecorder, setFilterRecorder] = useState('all');
  const [filterYear, setFilterYear] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterDay, setFilterDay] = useState('all');
  // History opens in full-history mode so older database records are not hidden
  // behind a today-only date filter. Users can still switch to today's records.
  const [showAllDates, setShowAllDates] = useState(true);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);

  // Day Forward Feature State
  const [isForwardModalOpen, setIsForwardModalOpen] = useState(false);
  const [forwardLocation, setForwardLocation] = useState('');
  const [forwardDate, setForwardDate] = useState(() => {
    const prev = new Date(Date.now() - new Date().getTimezoneOffset() * 60000 - 86400000);
    return prev.toISOString().slice(0, 10);
  });
  const [forwardNextDate, setForwardNextDate] = useState(() => {
    const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
    return today.toISOString().slice(0, 10);
  });
  const [isSubmittingForward, setIsSubmittingForward] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const [resolvedSlipUrl, setResolvedSlipUrl] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PER_PAGE);

  const openSlip = async (source: string) => {
    setResolvedSlipUrl(null);
    if (!source.startsWith('lazy-slip:')) {
      setSelectedSlip(source);
      return;
    }

    try {
      const transaction = await aivenDatabase.getTransaction(source.slice('lazy-slip:'.length));
      setSelectedSlip(transaction?.slip || null);
    } catch (error) {
      console.error('Unable to load the selected receipt:', error);
    }
  };

  useEffect(() => {
    if (isForwardModalOpen) {
      if (showAllDates && filterYear !== 'all' && filterMonth !== 'all' && filterDay !== 'all') {
        const d = new Date(`${filterYear}-${filterMonth}-${filterDay}`);
        if (!isNaN(d.getTime())) {
          setForwardNextDate(d.toISOString().slice(0, 10));
          const prev = new Date(d.getTime() - 86400000);
          setForwardDate(prev.toISOString().slice(0, 10));
        }
      }
    }
  }, [isForwardModalOpen, showAllDates, filterYear, filterMonth, filterDay]);

  const calculateGreedyBreakdown = (amount: number) => {
    let remaining = amount;
    const breakdown: any = {};
    const sortedDenoms = [...DENOMINATIONS].sort((a, b) => b - a);
    for (const d of sortedDenoms) {
      if (remaining >= d) {
        const count = Math.floor(remaining / d);
        breakdown[d] = count;
        remaining -= (count * d);
      }
    }
    return breakdown;
  }

  const handleConfirmForward = async () => {
    if (!forwardLocation) {
      setForwardError("Please select a location.");
      return;
    }
    setForwardError(null);

    const targetDate = new Date(forwardDate);
    const transactionsToForward = mainHistoryTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return (
        txDate.getFullYear() === targetDate.getFullYear() &&
        txDate.getMonth() === targetDate.getMonth() &&
        txDate.getDate() === targetDate.getDate()
      );
    });

    const forwardTotalCredit = transactionsToForward
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const forwardTotalDebit = transactionsToForward
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const forwardNetBalance = forwardTotalCredit - forwardTotalDebit;

    if (forwardNetBalance === 0) {
      setForwardError("Net balance for this location is zero. Nothing to forward.");
      return;
    }
    setIsSubmittingForward(true);

    try {
      const netBreakdown: any = {};
      transactionsToForward.forEach(tx => {
        if (tx.breakdown) {
          for (const [denomStr, count] of Object.entries(tx.breakdown)) {
            const denom = parseInt(denomStr, 10);
            if (!netBreakdown[denom]) netBreakdown[denom] = 0;
            if (tx.type === 'credit') {
              netBreakdown[denom] += ((count as number) || 0);
            } else {
              netBreakdown[denom] -= ((count as number) || 0);
            }
          }
        }
      });

      // Clean up zeros
      for (const denom in netBreakdown) {
        if (netBreakdown[denom] === 0) delete netBreakdown[denom];
      }

      // Handle Balance Type
      const isNegative = forwardNetBalance < 0;
      const absBalance = Math.abs(forwardNetBalance);
      const closingType = isNegative ? 'credit' : 'debit';
      const openingType = isNegative ? 'debit' : 'credit';

      const finalBreakdown: any = {};
      for (const denom in netBreakdown) {
        finalBreakdown[denom] = isNegative ? -netBreakdown[denom] : netBreakdown[denom];
      }

      const currentUserName = user?.displayName || user?.email || 'Unknown User';

      const debitTx = {
        date: new Date(`${forwardDate}T23:50:00`).toISOString(),
        type: closingType as 'credit' | 'debit',
        paymentMethod: 'cash' as const,
        company: 'NA',
        person: 'Day Closing',
        location: forwardLocation,
        recordedBy: currentUserName,
        amount: absBalance,
        notes: 'Forwarding balance to next day',
        breakdown: finalBreakdown
      };

      const creditTx = {
        date: new Date(`${forwardNextDate}T08:00:00`).toISOString(),
        type: openingType as 'credit' | 'debit',
        paymentMethod: 'cash' as const,
        company: 'NA',
        person: 'Opening Balance',
        location: forwardLocation,
        recordedBy: currentUserName,
        amount: absBalance,
        notes: 'Received balance from previous day',
        breakdown: finalBreakdown
      };

      await addForwardEntry(debitTx, creditTx);
      setIsForwardModalOpen(false);
      setForwardLocation('');
    } catch (err: any) {
      setForwardError(err.message || 'Failed to forward balance.');
    } finally {
      setIsSubmittingForward(false);
    }
  };

  const mainHistoryTransactions = useMemo(() => {
    const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
    const userEmail = (user?.email || '').toLowerCase();
    const userName = (user?.displayName || '').toLowerCase();
    const userEmailPrefix = userEmail.split('@')[0];

    const validTxs = transactions.filter(tx => {
      if (tx.paymentMethod !== 'cash') return false;
      if (!tx.breakdown || Object.keys(tx.breakdown).length === 0) return false;

      // Admin sab dekhe
      if (isAdmin) return true;

      // Agar pure cash hai (no bank), to context ne already filter kar diya hai (isTransactionVisibleToUser)
      // So we can show it.
      if (!tx.bank) return true;

      // Agar bank-linked cash hai (e.g. AXIS APB), to sirf apni dikhao
      const recorder = (tx.recordedBy || '').toLowerCase();
      const myEmail = userEmail.toLowerCase();
      const myName = userName.toLowerCase();
      const myPrefix = userEmailPrefix.toLowerCase();

      return (
        (myPrefix && recorder.includes(myPrefix)) ||
        (myName && recorder.includes(myName)) ||
        (myEmail && recorder.includes(myEmail))
      );
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let currentBalance = 0;
    const txsWithBalance = [];
    for (let i = 0; i < validTxs.length; i++) {
      const tx = validTxs[i];
      currentBalance += (tx.type === 'credit' ? tx.amount : -tx.amount);
      txsWithBalance.unshift({ ...tx, closingBalance: currentBalance });
    }
    return txsWithBalance;
  }, [transactions, user]);

  const recorderNames = useMemo(() => {
    const names = new Set<string>();
    mainHistoryTransactions.forEach(tx => {
      names.add(tx.recordedBy);
    });
    return Array.from(names);
  }, [mainHistoryTransactions]);

  const { years, months, days } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    const days = new Set<string>();

    mainHistoryTransactions.forEach(tx => {
      const d = new Date(tx.date);
      years.add(d.getFullYear().toString());
      if (filterYear === 'all' || d.getFullYear().toString() === filterYear) {
        months.add((d.getMonth() + 1).toString().padStart(2, '0'));
      }
      if ((filterYear === 'all' || d.getFullYear().toString() === filterYear) &&
        (filterMonth === 'all' || (d.getMonth() + 1).toString().padStart(2, '0') === filterMonth)) {
        days.add(d.getDate().toString().padStart(2, '0'));
      }
    });

    return {
      years: Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)),
      months: Array.from(months).sort((a, b) => parseInt(a) - parseInt(b)),
      days: Array.from(days).sort((a, b) => parseInt(a) - parseInt(b)),
    };
  }, [mainHistoryTransactions, filterYear, filterMonth]);

  const filteredTransactions = useMemo(() => {
    return mainHistoryTransactions.filter(tx => {
      if (filterCompany !== 'all' && (tx.company || 'NA') !== filterCompany) return false;
      if (filterLocation !== 'all' && tx.location !== filterLocation) return false;
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterRecorder !== 'all' && tx.recordedBy !== filterRecorder) return false;

      const txDate = new Date(tx.date);
      if (!showAllDates) {
        const currentDate = new Date();
        if (txDate.getFullYear() !== currentDate.getFullYear() ||
          txDate.getMonth() !== currentDate.getMonth() ||
          txDate.getDate() !== currentDate.getDate()) {
          return false;
        }
      } else {
        if (filterYear !== 'all' && txDate.getFullYear().toString() !== filterYear) return false;
        if (filterMonth !== 'all' && (txDate.getMonth() + 1).toString().padStart(2, '0') !== filterMonth) return false;
        if (filterDay !== 'all' && txDate.getDate().toString().padStart(2, '0') !== filterDay) return false;
      }

      const searchLower = searchTerm.toLowerCase();
      if (searchTerm && !((typeof tx.person === 'string' && tx.person.toLowerCase().includes(searchLower)) ||
        tx.company?.toLowerCase().includes(searchLower) ||
        tx.amount.toString().includes(searchLower) ||
        tx.location.toLowerCase().includes(searchLower) ||
        tx.recordedBy.replace('@gmail.com', '').toLowerCase().includes(searchLower)
      )) return false;

      return true;
    });
  }, [mainHistoryTransactions, searchTerm, filterCompany, filterLocation, filterType, filterRecorder, showAllDates, filterYear, filterMonth, filterDay]);

  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  useEffect(() => {
    setVisibleCount(TRANSACTIONS_PER_PAGE);
  }, [searchTerm, filterCompany, filterLocation, filterType, filterRecorder, showAllDates, filterYear, filterMonth, filterDay]);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setFilterCompany('all');
    setFilterLocation('all');
    setFilterType('all');
    setFilterRecorder('all');
    setFilterYear('all');
    setFilterMonth('all');
    setFilterDay('all');
    setShowAllDates(true);
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [filteredTransactions]);

  const totals = useMemo(() => {
    const totalCredit = filteredTransactions
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalDebit = filteredTransactions
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const netBalance = totalCredit - totalDebit;

    return { totalCredit, totalDebit, netBalance };
  }, [filteredTransactions]);

  const forwardBalanceData = useMemo(() => {
    if (!forwardDate) return { net: 0, credit: 0, debit: 0 };

    const targetDate = new Date(forwardDate);
    const targetTxs = mainHistoryTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return (
        txDate.getFullYear() === targetDate.getFullYear() &&
        txDate.getMonth() === targetDate.getMonth() &&
        txDate.getDate() === targetDate.getDate()
      );
    });

    const credit = targetTxs.filter(tx => tx.type === 'credit').reduce((sum, tx) => sum + tx.amount, 0);
    const debit = targetTxs.filter(tx => tx.type === 'debit').reduce((sum, tx) => sum + tx.amount, 0);
    return { net: credit - debit, credit, debit };
  }, [mainHistoryTransactions, forwardDate]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(filteredTransactions.map(tx => tx.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) return;
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const toggleTransactionDetails = (transactionId: string) => {
    const newExpanded = new Set(expandedTransactions);
    if (newExpanded.has(transactionId)) {
      newExpanded.delete(transactionId);
    } else {
      newExpanded.add(transactionId);
    }
    setExpandedTransactions(newExpanded);
  };

  const handleDeleteSingle = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      await deleteTransactionsByIds([id]);
    }
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const transactionsToDelete = transactions.filter(tx => selectedIds.includes(tx.id));
      await deleteTransactionsByIds(selectedIds);

      const sender = user?.email?.split('@')[0] || 'Unknown user';
      // sendTelegramMessage call removed (Only image should go)
      // await sendTelegramMessage(message);

      setIsDeleteModalOpen(false);
      setSelectedIds([]);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete transactions.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSync = async () => {
    try {
      await manualSync();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  useEffect(() => {
    if (syncStatus === 'success' || syncStatus === 'error') {
      const timer = setTimeout(() => {
        // Context will reset status to 'idle'
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  const formatPersonName = (name: string | undefined) => {
    if (typeof name !== 'string' || !name) return 'Unknown Customer';
    return name.trim().toUpperCase();
  };

  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <div className="max-w-7xl mx-auto pb-48 md:pb-24 px-4 sm:px-6">
      <div className="sticky top-0 z-40 py-4 -mx-4 px-4 mb-4" style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(20px)',borderBottom:'1px solid #E0E7FF'}}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-black tracking-tight" style={{color:'#1E1B4B'}}>History</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsForwardModalOpen(true)}
              className="px-3 py-2 text-white rounded-xl flex items-center font-bold tracking-wide transition-all text-xs active:scale-95"
              style={{background:'linear-gradient(135deg,#6366F1 0%,#4F46E5 100%)',boxShadow:'0 4px 14px rgba(99,102,241,0.35)'}}
            >
              Forward Day
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2.5 rounded-xl transition-all active:scale-90"
              style={showFilters ? {background:'#6366F1',color:'white'} : {background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}}
            >
              <FilterIcon className="h-5 w-5" />
            </button>
            <button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              className={`p-2.5 rounded-xl active:scale-90 disabled:opacity-50 text-emerald-600 ${syncStatus === 'syncing' ? 'animate-pulse' : ''}`}
              style={{background:'#ECFDF5',border:'1px solid #A7F3D0'}}
            >
              <ArrowPathIcon className={`h-5 w-5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={handleDeleteClick} disabled={selectedIds.length === 0} className="p-2.5 rounded-xl active:scale-90 disabled:opacity-50 text-rose-600" style={{background:'#FFF1F2',border:'1px solid #FECDD3'}}>
              <TrashIcon className="h-5 w-5" />
            </button>
            {filterCompany !== 'all' && (
              <Link
                to={`/report/${encodeURIComponent(filterCompany)}?location=${filterLocation}&type=${filterType}&search=${searchTerm}&showAllDates=${showAllDates}&year=${filterYear}&month=${filterMonth}&day=${filterDay}`}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                style={{background:'#FFF1F2',border:'1px solid #FECDD3',color:'#E11D48'}}
              >
                <PrinterIcon className="h-4 w-4" />
                <span>Report / PDF</span>
              </Link>
            )}
          </div>
        </div>
      </div>

      {syncStatus === 'success' && <div className="px-4 py-2 rounded-2xl text-sm font-semibold mb-4 animate-in fade-in slide-in-from-top-4" style={{background:'#ECFDF5',border:'1px solid #A7F3D0',color:'#059669'}}>Sync successful!</div>}
      {syncStatus === 'error' && <div className="px-4 py-2 rounded-2xl text-sm font-semibold mb-4 animate-in fade-in slide-in-from-top-4" style={{background:'#FFF1F2',border:'1px solid #FECDD3',color:'#E11D48'}}>Sync failed.</div>}

      {showFilters && (
        <div className="rounded-3xl p-5 mb-6 space-y-4" style={{background:'#fff',border:'1px solid #E0E7FF',boxShadow:'0 4px 16px rgba(99,102,241,0.08)'}}>
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-4 py-3 rounded-2xl text-sm outline-none transition-all"
            style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
          />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}><option value="all">All Companies</option>{companyNames.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <select value={filterLocation} onChange={e => setFilterLocation(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}><option value="all">All Locations</option>{locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}</select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}><option value="all">All Types</option><option value="credit">Credit</option><option value="debit">Debit</option></select>
            <select value={filterRecorder} onChange={e => setFilterRecorder(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}><option value="all">All Recorders</option>{recorderNames.map(name => <option key={name} value={name}>{name.replace('@gmail.com', '')}</option>)}</select>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={() => {
                const newState = !showAllDates;
                setShowAllDates(newState);
                if (newState) {
                  // Reset sub-filters when switching to "All Dates" to show everything
                  setFilterYear('all');
                  setFilterMonth('all');
                  setFilterDay('all');
                }
              }} 
              className="px-5 py-2.5 rounded-2xl font-black uppercase tracking-widest shadow-md transition-all text-[10px] active:scale-95"
              style={!showAllDates ? {background:'linear-gradient(135deg,#6366F1,#4F46E5)',color:'white'} : {background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}}
            >
              {showAllDates ? '📅 View Today Only' : '🌍 View Full History'}
            </button>
            {!showAllDates && (
              <span className="text-[10px] font-black uppercase tracking-widest animate-pulse px-3 py-2 rounded-xl" style={{background:'#EEF2FF',border:'1px solid #C7D2FE',color:'#6366F1'}}>
                Showing Today: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            )}
            {showAllDates && filterYear === 'all' && filterMonth === 'all' && filterDay === 'all' && (
               <span className="text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl" style={{background:'#ECFDF5',border:'1px solid #A7F3D0',color:'#059669'}}>
                 Showing Everything (Full History)
               </span>
            )}
          </div>
          {showAllDates && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="relative group">
                <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setFilterMonth('all'); setFilterDay('all'); }} className="w-full pl-4 pr-10 py-3 rounded-[1.2rem] text-xs font-black uppercase tracking-widest appearance-none outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                  <option value="all">All Years</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <ChevronDownIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
              </div>
              <div className="relative group">
                <select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFilterDay('all'); }} className="w-full pl-4 pr-10 py-3 rounded-[1.2rem] text-xs font-black uppercase tracking-widest appearance-none outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                  <option value="all">All Months</option>
                  {months.map(m => <option key={m} value={m}>{new Date(2000, parseInt(m)-1).toLocaleString('en-IN', {month: 'long'}).toUpperCase()}</option>)}
                </select>
                <ChevronDownIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
              </div>
              <div className="relative group">
                <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className="w-full pl-4 pr-10 py-3 rounded-[1.2rem] text-xs font-black uppercase tracking-widest appearance-none outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                  <option value="all">All Days</option>
                  {days.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDownIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none group-hover:text-indigo-500 transition-colors" />
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={resetFilters} className="px-4 py-2 rounded-xl text-sm font-bold" style={{background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}}>Clear Filters</button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center">
        <input type="checkbox" id="selectAll" onChange={handleSelectAll} checked={filteredTransactions.length > 0 && selectedIds.length === filteredTransactions.length} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
        <label htmlFor="selectAll" className="ml-2 text-sm" style={{color:'#6B7280'}}>Select/Deselect All ({selectedIds.length} of {filteredTransactions.length} selected)</label>
      </div>

      <div className="space-y-4">
        {paginatedTransactions.map((tx: Transaction) => {
          const isExpanded = expandedTransactions.has(tx.id);
          const isSelected = selectedIds.includes(tx.id);
          return (
            <div key={tx.id} className={`card overflow-hidden transition-all duration-300 hover:-translate-y-0.5 ${isSelected ? 'ring-2 ring-indigo-500/50' : ''}`}>
              <div className="flex items-center p-3 sm:p-5">
                <div className="flex flex-col items-center mr-3 shrink-0 gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 transition-colors cursor-pointer"
                    checked={isSelected}
                    onChange={() => handleSelect(tx.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-[10px] font-black text-slate-400 tabular-nums lowercase tracking-tighter">
                    #{mainHistoryTransactions.length - mainHistoryTransactions.findIndex(t => t.id === tx.id)}
                  </span>
                </div>

                <div className="flex-grow min-w-0 cursor-pointer select-none" onClick={() => toggleTransactionDetails(tx.id)}>
                  <div className="flex items-start justify-between gap-3 overflow-hidden">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14px] sm:text-[16px] font-black truncate leading-tight tracking-tight" style={{color:'#1E1B4B'}}>
                        {formatPersonName(tx.person)}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-[10px] sm:text-xs font-bold tabular-nums whitespace-nowrap shrink-0" style={{color:'#9CA3AF'}}>
                          {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                        <span className="text-[10px] sm:text-xs font-bold tabular-nums lowercase whitespace-nowrap shrink-0" style={{color:'#9CA3AF'}}>
                          {new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end shrink-0 ml-2">
                      <div className="flex items-center gap-2">
                        {tx.bank && BANK_LOGOS[tx.bank] && (
                          <div className="flex flex-col items-center shrink-0 p-1 bg-slate-50/80 rounded-xl border border-slate-100 shadow-sm">
                            <img src={BANK_LOGOS[tx.bank]} alt={tx.bank} className="h-5 w-5 sm:h-7 sm:w-7 object-contain drop-shadow-sm" />
                            <span className="text-[6px] sm:text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1">{tx.bank}</span>
                          </div>
                        )}
                        <div className="text-right shrink-0">
                          <div className={`text-[15px] sm:text-xl font-black tabular-nums tracking-tighter leading-none ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                          </div>
                          <div className="flex flex-col items-end mt-1">
                            <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">{tx.type === 'debit' ? 'CASH' : (tx.paymentMethod === 'upi' ? 'UPI' : 'CASH')}</span>
                            {(tx as any).closingBalance !== undefined && (
                              <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 bg-slate-50 px-1.5 rounded uppercase tabular-nums tracking-wider leading-none mt-0.5">
                                Bal ₹{(tx as any).closingBalance.toLocaleString('en-IN')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-2 ml-3 shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSingle(tx.id); }}
                      className="p-1.5 text-gray-300 hover:text-red-500 active:bg-red-50 dark:active:bg-red-900/20 rounded-xl transition-all"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleTransactionDetails(tx.id); }}
                    className="p-1 px-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                  >
                    {isExpanded ? <ChevronDownIcon className="h-5 w-5" /> : <ChevronRightIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="p-6" style={{background:'#F5F7FF',borderTop:'1px solid #E0E7FF'}}>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black uppercase px-2 py-0.5 rounded-lg shadow-sm" style={{background:'#EEF2FF',border:'1px solid #C7D2FE',color:'#4F46E5'}}>
                        Entry No: #{mainHistoryTransactions.length - mainHistoryTransactions.findIndex(t => t.id === tx.id)}
                      </div>
                      <div className="text-[10px] font-mono text-gray-400">UID: {tx.id}</div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div style={{color:'#1E1B4B'}}><strong>Company:</strong> {tx.company || 'N/A'}</div>
                      <div style={{color:'#1E1B4B'}}><strong>Location:</strong> {tx.location}</div>
                    </div>
                    {tx.breakdown && Object.keys(tx.breakdown).length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">Denomination Breakdown:</h4>
                        <div className="space-y-1">
                          {Object.entries(tx.breakdown).sort(([a], [b]) => parseInt(b) - parseInt(a)).map(([denom, count]) => (
                            <div key={denom}>₹{denom}: {count} notes = ₹{(parseInt(denom) * (count || 0)).toLocaleString('en-IN')}</div>
                          ))}
                        </div>
                      </div>
                    )}
                    {tx.slip && (
                      <div className="mt-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Transaction Slip</h4>
                        <div className="relative inline-block w-full max-w-[200px]">
                          <SlipImage
                            src={tx.slip}
                            alt="Transaction Slip"
                            className="h-48 w-full object-contain rounded-2xl shadow-lg border-2 border-white dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer"
                            onClick={(e) => { e?.stopPropagation(); void openSlip(tx.slip!); }}
                          />
                          <p className="text-[9px] font-black text-blue-600 mt-2 uppercase tracking-widest text-center">Click to Full View</p>
                        </div>
                      </div>
                    )}
                      <div className="flex flex-wrap gap-2 pt-4" style={{borderTop:'1px solid #E0E7FF'}}>
                        <Link
                          to={`/edit/${tx.id}`}
                          state={{ from: location.pathname + location.search }}
                          className="flex items-center gap-2 px-4 py-2 text-white rounded-xl font-bold text-sm transition-all"
                          style={{background:'linear-gradient(135deg,#6366F1,#4F46E5)'}}
                        >
                          <PencilIcon className="h-4 w-4" />
                          <span>Edit</span>
                        </Link>
                        <button
                          onClick={async () => {
                            try {
                              const { Share } = await import('@capacitor/share');
                              await Share.share({
                                title: `Transaction: ${tx.person}`,
                                text: `Transaction Details:\nPerson: ${tx.person}\nAmount: ₹${tx.amount}\nType: ${tx.type}\nDate: ${new Date(tx.date).toLocaleString()}\nCompany: ${tx.company || 'N/A'}`,
                                dialogTitle: 'Share Transaction',
                              });
                            } catch (err) {
                              console.error('Share failed:', err);
                            }
                          }}
                          className="flex items-center gap-2 px-4 py-2 text-white rounded-xl font-bold text-sm transition-all"
                          style={{background:'linear-gradient(135deg,#10B981,#059669)'}}
                        >
                          <span>📤 Share</span>
                        </button>
                      </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filteredTransactions.length > visibleCount && (
          <div className="flex justify-center pt-4">
            <button
              onClick={() => setVisibleCount(prev => prev + TRANSACTIONS_PER_PAGE)}
              className="px-8 py-3 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all text-xs"
              style={{background:'linear-gradient(135deg,#6366F1,#4F46E5)',boxShadow:'0 6px 20px rgba(99,102,241,0.3)'}}
            >
              Load More Transactions
            </button>
          </div>
        )}
      </div>
      {filteredTransactions.length === 0 && (
        <div className="text-center py-16 rounded-3xl mt-4" style={{background:'white',border:'1px solid #E0E7FF'}}>
          <p style={{color:'#9CA3AF'}}>No transactions match your filters.</p>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.6)'}} role="dialog">
          <div className="p-6 w-full max-w-md" style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'1.5rem',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}}>
            <h3 className="text-lg font-bold" style={{color:'#1E1B4B'}}>Confirm Deletion</h3>
            <p className="mt-2 text-sm" style={{color:'#6B7280'}}>Are you sure you want to delete <strong>{selectedIds.length}</strong> transaction(s)? This action cannot be undone.</p>
            {deleteError && <div className="mt-4 font-medium text-sm" style={{color:'#E11D48'}}>{deleteError}</div>}
            <div className="mt-6 flex justify-end gap-4">
              <button onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} className="px-4 py-2 rounded-xl text-sm font-medium" style={{background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}}>Cancel</button>
              <button onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 text-white rounded-xl text-sm font-bold disabled:opacity-50" style={{background:'#E11D48'}}>{isDeleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {isVaultModalOpen && (
        <TotalVaultDetails
          vault={vault}
          onClose={() => setIsVaultModalOpen(false)}
        />
      )}

      {isForwardModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.6)'}} role="dialog">
          <div className="p-6 w-full max-w-md" style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'1.5rem',boxShadow:'0 20px 60px rgba(0,0,0,0.2)'}} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4" style={{color:'#1E1B4B'}}>Forward Day Balance</h3>

            <div className="mb-4 p-4 rounded-xl text-center" style={{background:'linear-gradient(135deg,#EEF2FF,#E0E7FF)',border:'1px solid #C7D2FE'}}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:'#6366F1'}}>
                Total Net Balance (Vault)
              </p>
              <p className={`text-3xl font-black ${forwardBalanceData.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                ₹{forwardBalanceData.net.toLocaleString('en-IN')}
              </p>
              <div className="mt-4 text-[11px] p-2 rounded-lg leading-relaxed" style={{color:'#6B7280',background:'rgba(255,255,255,0.7)'}}>
                This will create a <span className="font-bold text-rose-500 text-xs">Closing Entry (OUT)</span> on the Close Date and an <span className="font-bold text-emerald-500 text-xs">Opening Entry (IN)</span> on the Open Date.
              </div>
            </div>

            {totals.netBalance === 0 ? (
              <div className="mb-4 font-medium text-center p-3 rounded-xl" style={{color:'#E11D48',background:'#FFF1F2',border:'1px solid #FECDD3'}}>Cannot forward a zero net balance.</div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{color:'#6B7280'}}>Select Location</label>
                  <div className="relative">
                    <select value={forwardLocation} onChange={(e) => setForwardLocation(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}} required>
                      <option value="">Select Location</option>
                      {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{color:'#6B7280'}}>Date to Close</label>
                    <input type="date" value={forwardDate} onChange={(e) => setForwardDate(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{color:'#6B7280'}}>Date to Open</label>
                    <input type="date" value={forwardNextDate} onChange={(e) => setForwardNextDate(e.target.value)} className="w-full p-2 rounded-xl text-sm outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}} />
                  </div>
                </div>
              </div>
            )}

            {forwardError && <div className="mt-4 p-2 rounded-xl font-medium text-sm" style={{color:'#E11D48',background:'#FFF1F2',border:'1px solid #FECDD3'}}>{forwardError}</div>}

            <div className="mt-6 flex justify-end gap-3 pt-4" style={{borderTop:'1px solid #E0E7FF'}}>
              <button onClick={() => setIsForwardModalOpen(false)} disabled={isSubmittingForward} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}}>Cancel</button>
              {forwardBalanceData.net !== 0 && (
                <button onClick={handleConfirmForward} disabled={isSubmittingForward} className="px-4 py-2 text-white rounded-xl flex items-center font-bold tracking-wide transition-all disabled:opacity-50 active:scale-95" style={{background:'linear-gradient(135deg,#6366F1,#4F46E5)',boxShadow:'0 4px 14px rgba(99,102,241,0.35)'}}>
                  {isSubmittingForward ? 'Processing...' : 'Confirm Forward'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg md:max-w-3xl p-3 sm:p-4 rounded-[2rem] sm:rounded-[2.5rem] flex justify-between items-center text-center no-print z-40 transition-all hover:scale-[1.01]" style={{background:'rgba(255,255,255,0.95)',backdropFilter:'blur(20px)',border:'1px solid #E0E7FF',boxShadow:'0 8px 40px rgba(99,102,241,0.10)'}}>
        <div className="flex-1 min-w-0 flex flex-col items-center px-1">
          <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest leading-none mb-1.5" style={{color:'#9CA3AF'}}>IN</p>
          <p className="text-[12px] sm:text-[15px] md:text-xl font-black text-emerald-600 tracking-tighter tabular-nums truncate w-full">₹{totals.totalCredit.toLocaleString('en-IN')}</p>
        </div>
        <div className="w-[1px] h-8 sm:h-10" style={{background:'#E0E7FF'}}></div>
        <div className="flex-1 min-w-0 flex flex-col items-center px-1">
          <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest leading-none mb-1.5" style={{color:'#9CA3AF'}}>OUT</p>
          <p className="text-[12px] sm:text-[15px] md:text-xl font-black text-rose-600 tracking-tighter tabular-nums truncate w-full">₹{totals.totalDebit.toLocaleString('en-IN')}</p>
        </div>
        <div className="w-[1px] h-8 sm:h-10" style={{background:'#E0E7FF'}}></div>
        <div className="flex-[1.2] min-w-0 flex flex-col items-center px-1">
          <p className="text-[9px] sm:text-[11px] font-black uppercase tracking-widest leading-none mb-1.5" style={{color:'#9CA3AF'}}>NET BALANCE</p>
          <p className={`text-[12px] sm:text-[15px] md:text-xl font-black tracking-tighter tabular-nums truncate w-full ${totals.netBalance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>
            ₹{totals.netBalance.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="w-[1px] h-8 sm:h-10" style={{background:'#E0E7FF'}}></div>
        <button
          onClick={() => setIsVaultModalOpen(true)}
          className="flex-1 min-w-0 flex flex-col items-center group relative active:scale-90 transition-transform"
        >
          <div className="p-1 sm:p-2 text-white rounded-lg sm:rounded-xl shadow-lg" style={{background:'linear-gradient(135deg,#6366F1,#4F46E5)'}}>
            <WalletIcon className="h-4 w-4 sm:h-6 sm:w-6" />
          </div>
          <p className="text-[8px] sm:text-[9px] font-black uppercase mt-1 tracking-tighter" style={{color:'#9CA3AF'}}>VAULT</p>
        </button>
      </div>



      {/* Image Preview Modal */}
      {selectedSlip && (
        <div
          className="fixed inset-0 bg-black bg-opacity-90 z-[100] flex items-center justify-center p-4"
          onClick={() => { setSelectedSlip(null); setResolvedSlipUrl(null); }}
        >
          <div className="relative max-w-full max-h-full">
            <button
              onClick={() => { setSelectedSlip(null); setResolvedSlipUrl(null); }}
              className="absolute -top-10 right-0 text-white p-2 hover:bg-white/10 rounded-full"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <SlipImage
              src={selectedSlip}
              alt="Full Slip"
              className="w-[90vw] max-w-[500px] min-h-[300px] max-h-[80vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e?.stopPropagation()}
              onUrlResolved={(url) => setResolvedSlipUrl(url)}
              useIframeForPdf={true}
            />
            <div className="mt-4 flex justify-center gap-3">
              {resolvedSlipUrl && (
                <>
                  <a
                    href={resolvedSlipUrl}
                    download={selectedSlip?.includes(':pdf:') || resolvedSlipUrl?.toLowerCase().includes('.pdf') ? 'transaction-slip.pdf' : 'transaction-slip.jpg'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium shadow-lg hover:bg-blue-700 transition-colors inline-block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        const { Share } = await import('@capacitor/share');
                        await Share.share({
                          title: 'Transaction Slip',
                          text: `Transaction Slip Share`,
                          url: resolvedSlipUrl,
                          dialogTitle: 'Share Slip',
                        });
                      } catch (err) {
                        console.error('Share failed:', err);
                      }
                    }}
                    className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium shadow-lg hover:bg-emerald-700 transition-colors"
                  >
                    Share Slip
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;

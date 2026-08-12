import React, { useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { BANK_LOGOS } from '../constants';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { ArrowPathIcon } from '../components/icons/ArrowPathIcon';
import { TrashIcon } from '../components/icons/TrashIcon';
import { BankIcon } from '../components/icons/BankIcon';

const TRANSACTIONS_PER_PAGE = 50;

const SingleBankHistoryPage: React.FC = () => {
  const { bankName } = useParams<{ bankName: string }>();
  const { user, transactions, settleBankBalance, deleteTransactionsByIds, locations, bankBalances, companyNames } = useAppContext();

  const INTERNAL_POOL_BANKS = ['A K', 'S A', 'M A', 'ALI ENTERPRISES PNB', '790', 'ALI ENTERPRISES', 'FINO', 'SACHIN'];
  const isInternalPool = bankName && INTERNAL_POOL_BANKS.includes(bankName);
  const navigate = useNavigate();
  const [isSettling, setIsSettling] = React.useState(false);
  const [startDate, setStartDate] = React.useState<string>('');
  const [endDate, setEndDate] = React.useState<string>('');
  const [searchTerm, setSearchTerm] = React.useState<string>('');
  const [selectedCompany, setSelectedCompany] = React.useState<string>('');
  const [showOnlyCommission, setShowOnlyCommission] = React.useState<boolean>(false);
  const [visibleCount, setVisibleCount] = React.useState(TRANSACTIONS_PER_PAGE);

  const currentUserName = user?.displayName || user?.email || 'Unknown User';
  const defaultLocation = locations[0] || 'NA';

  const bankTransactions = useMemo(() => {
    let banksToShow: string[] = [];
    if (bankName === 'ALI ENTERPRISES') {
      banksToShow = ['ALI ENTERPRISES', 'BOB', 'AXIS', 'PNB'];
    } else if (bankName === 'FINO') {
      banksToShow = ['FINO', 'BOB FINO', 'PNB FINO', 'SBI FINO', 'SB FINO'];
    } else if (bankName) {
      banksToShow = [bankName];
    }

    return transactions
      .filter(tx => {
        const isBankMatch = tx.bank && banksToShow.includes(tx.bank);

        let isDateMatch = true;
        if (startDate) {
          isDateMatch = isDateMatch && new Date(tx.date) >= new Date(startDate);
        }
        if (endDate) {
          const endDateTime = new Date(endDate);
          endDateTime.setHours(23, 59, 59, 999);
          isDateMatch = isDateMatch && new Date(tx.date) <= endDateTime;
        }

        let isSearchMatch = true;
        if (searchTerm) {
          const search = searchTerm.toLowerCase();
          isSearchMatch = (tx.person || '').toLowerCase().includes(search) ||
            (tx.company || '').toLowerCase().includes(search) ||
            (tx.notes || '').toLowerCase().includes(search) ||
            tx.amount.toString().includes(search);
        }

        let isCompanyMatch = true;
        if (selectedCompany) {
          isCompanyMatch = tx.company === selectedCompany;
        }

        let isCommissionMatch = true;
        if (showOnlyCommission) {
          isCommissionMatch = tx.company === 'COMMISSION';
        }

        if (bankName === 'ALI ENTERPRISES') {
          // Hide the child-bank leg of internal transfers from the master statement to prevent duplicate +/- entries
          if (tx.company === 'INTERNAL TRANSFER' && tx.bank !== 'ALI ENTERPRISES') {
            return false;
          }
          // Only show names that contain "APB" or "ABP" (case insensitive) OR are Internal Transfers
          const personName = (tx.person || '').toUpperCase();
          if (!(personName.includes('APB') || personName.includes('ABP') || tx.company === 'INTERNAL TRANSFER')) {
            return false;
          }
        }

        return isBankMatch && isDateMatch && isSearchMatch && isCompanyMatch && isCommissionMatch;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, bankName, startDate, endDate, searchTerm, selectedCompany, showOnlyCommission]);

  const paginatedTransactions = useMemo(() => {
    return bankTransactions.slice(0, visibleCount);
  }, [bankTransactions, visibleCount]);

  React.useEffect(() => {
    setVisibleCount(TRANSACTIONS_PER_PAGE);
  }, [bankName, startDate, endDate, searchTerm, selectedCompany, showOnlyCommission]);

  const banksForThisAccount = useMemo(() => {
    if (bankName === 'ALI ENTERPRISES') return ['ALI ENTERPRISES', 'BOB', 'AXIS', 'PNB'];
    if (bankName === 'FINO') return ['FINO', 'BOB FINO', 'PNB FINO', 'SBI FINO', 'SB FINO'];
    return bankName ? [bankName] : [];
  }, [bankName]);

  const calculateBalanceForRange = useCallback((txs: any[], start?: string, end?: string) => {
    return txs.filter(tx => {
      const isBankMatch = tx.bank && banksForThisAccount.includes(tx.bank);
      if (!isBankMatch) return false;

      if (bankName === 'ALI ENTERPRISES') {
        if (tx.company === 'INTERNAL_TRANSFER' && tx.bank !== 'ALI ENTERPRISES') return false;
        const personName = (tx.person || '').toUpperCase();
        if (!(personName.includes('APB') || personName.includes('ABP') || tx.company === 'INTERNAL TRANSFER')) return false;
      }

      if (start && new Date(tx.date) < new Date(start)) return false;
      if (end) {
        const endDateTime = new Date(end);
        endDateTime.setHours(23, 59, 59, 999);
        if (new Date(tx.date) > endDateTime) return false;
      }
      return true;
    }).reduce((sum, tx) => {
      const isDeposit = !tx.company || tx.company === 'NA';
      const isIn = (tx.paymentMethod === 'upi')
        ? (tx.type === 'credit')
        : (isDeposit ? (tx.type === 'debit') : (tx.type === 'credit'));
      return sum + (isIn ? tx.amount : -tx.amount);
    }, 0);
  }, [bankName, banksForThisAccount]);

  const { openingBalance, periodNet, closingBalance } = useMemo(() => {
    const opBal = startDate ? calculateBalanceForRange(transactions, undefined, (new Date(new Date(startDate).getTime() - 1)).toISOString()) : 0;
    const pNet = calculateBalanceForRange(transactions, startDate, endDate);
    const clBal = calculateBalanceForRange(transactions, undefined, endDate);

    return {
      openingBalance: opBal,
      periodNet: pNet,
      closingBalance: clBal
    };
  }, [transactions, startDate, endDate, calculateBalanceForRange]);

  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;

    bankTransactions.forEach(tx => {
      const isDeposit = !tx.company || tx.company === 'NA';
      const isIn = (tx.paymentMethod === 'upi')
        ? (tx.type === 'credit')
        : (isDeposit ? (tx.type === 'debit') : (tx.type === 'credit'));

      if (isIn) {
        totalIn += tx.amount;
      } else {
        totalOut += tx.amount;
      }
    });

    return { credits: totalIn, debits: totalOut };
  }, [bankTransactions]);

  const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  const [isTransferModalOpen, setIsTransferModalOpen] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState('');
  const [transferAmount, setTransferAmount] = React.useState('');

  const openTransferModal = () => {
    if (!bankName) return;
    setIsTransferModalOpen(true);
    // If current bank is in the internal pool, don't set a default target (let user pick)
    // Otherwise default to Ali Enterprises (master account)
    if (isInternalPool) {
      setTransferTarget('');
    } else {
      setTransferTarget('ALI ENTERPRISES');
    }
    setTransferAmount(Math.max(0, closingBalance).toString());
  };

  const handleSettleSubmit = async () => {
    if (isSettling || !bankName || !transferTarget) return;

    const amount = parseFloat(transferAmount || '0');
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid positive amount.");
      return;
    }

    const maxAmount = Math.max(0, stats.balance);
    if (amount > maxAmount && bankName !== 'ALI ENTERPRISES') {
      if (!window.confirm(`Amount ₹${amount} is more than current balance ₹${maxAmount}. Continue anyway?`)) return;
    }

    setIsSettling(true);
    try {
      await settleBankBalance(bankName, transferTarget, amount, currentUserName, defaultLocation);
      alert(`Successfully transferred ₹${amount.toLocaleString('en-IN')} to ${transferTarget}!`);
      setIsTransferModalOpen(false);
    } catch (error) {
      console.error('Transfer failed:', error);
      alert('Failed to complete transfer.');
    } finally {
      setIsSettling(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      try {
        await deleteTransactionsByIds([id]);
      } catch (error) {
        console.error('Failed to delete transaction:', error);
        alert('Failed to delete transaction.');
      }
    }
  };

  if (!bankName) return null;

  const showSettleButton = bankName !== 'FINO';

  return (
    <div className="max-w-7xl mx-auto px-4 pb-24 md:pb-8" style={{ background: '#F5F7FF', minHeight: '100vh' }}>
      <div className="my-6 flex items-center gap-2 sm:gap-4">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 sm:p-2 rounded-full transition-colors flex-shrink-0"
          style={{ background: 'white', border: '1px solid #E0E7FF' }}
        >
          <ArrowLeftIcon className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: '#6B7280' }} />
        </button>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight truncate" style={{ color: '#1E1B4B' }}>{bankName} History</h1>
            <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest mt-0.5 truncate" style={{ color: '#9CA3AF' }}>Account statement</p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        className="p-6 rounded-[2rem] mb-6 flex flex-col gap-4"
        style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', border: '1px solid #E0E7FF', boxShadow: '0 8px 30px rgba(99,102,241,0.06)' }}
      >
        {/* Row 1: Search and Company */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex-[2] min-w-[200px]">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>Search Transactions</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </div>
              <input
                type="text"
                placeholder="Name, Company, Notes, Amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-[1.5rem] text-sm font-bold pl-11 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-all"
                style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
              />
            </div>
          </div>

          <div className="flex-1 min-w-[150px]">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>By Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full rounded-[1.5rem] text-sm font-bold p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-all outline-none appearance-none"
              style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
            >
              <option value="">All Companies</option>
              {companyNames.filter(c => c !== 'COMMISSION').map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Dates, Commission, and Clear */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-[1.5rem] text-sm font-bold p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-all"
              style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-[1.5rem] text-sm font-bold p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 transition-all"
              style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
            />
          </div>

          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setShowOnlyCommission(!showOnlyCommission)}
              className={`h-11 px-5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all`}
              style={showOnlyCommission
                ? { background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', boxShadow: '0 4px 20px rgba(99,102,241,0.3)', border: 'none' }
                : { background: 'white', color: '#6B7280', border: '1px solid #E0E7FF' }
              }
            >
              % Commission Only
            </button>
          </div>

          <div className="mb-2">
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setSearchTerm('');
                setSelectedCompany('');
                setShowOnlyCommission(false);
              }}
              className="h-11 px-5 text-rose-500 hover:text-white hover:bg-rose-500 rounded-[1.5rem] transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest"
            >
              Clear All
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div
          className="p-3 sm:p-4 rounded-[1.5rem]"
          style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }}
        >
          <p className="text-[9px] font-black uppercase tracking-widest mb-1 leading-none" style={{ color: '#9CA3AF' }}>Opening</p>
          <p className="text-lg sm:text-xl font-black tracking-tighter tabular-nums leading-none" style={{ color: '#1E1B4B' }}>
            {currencyFormatter.format(openingBalance)}
          </p>
        </div>
        <div
          className="p-3 sm:p-4 rounded-[1.5rem]"
          style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }}
        >
          <p className="text-[9px] font-black uppercase tracking-widest mb-1 leading-none" style={{ color: '#9CA3AF' }}>Total In</p>
          <p className="text-lg sm:text-xl font-black text-emerald-600 tracking-tighter tabular-nums leading-none">{currencyFormatter.format(stats.credits)}</p>
        </div>
        <div
          className="p-3 sm:p-4 rounded-[1.5rem]"
          style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }}
        >
          <p className="text-[9px] font-black uppercase tracking-widest mb-1 leading-none" style={{ color: '#9CA3AF' }}>Total Out</p>
          <p className="text-lg sm:text-xl font-black text-rose-600 tracking-tighter tabular-nums leading-none">{currencyFormatter.format(stats.debits)}</p>
        </div>
        <div>
          <div className={`p-3 sm:p-4 rounded-[1.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.06)] border ${closingBalance >= 0 ? 'bg-gradient-to-br from-indigo-500 to-purple-600 border-indigo-400/50' : 'bg-gradient-to-br from-rose-500 to-pink-600 border-rose-400/50'}`}>
            <p className="text-[9px] font-black text-white/80 uppercase tracking-widest mb-1 leading-none">Closing</p>
            <p className="text-xl sm:text-2xl font-black text-white tracking-tighter tabular-nums leading-none">{currencyFormatter.format(closingBalance)}</p>
          </div>
        </div>
      </div>

      <div
        className="rounded-[2rem] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', border: '1px solid #E0E7FF', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }}
      >
        <div className="divide-y" style={{ borderColor: '#E0E7FF' }}>
          {paginatedTransactions.map((tx, index) => {
            const isDeposit = !tx.company || tx.company === 'NA';
            let isIn = (tx.paymentMethod === 'upi')
              ? (tx.type === 'credit')
              : (isDeposit ? (tx.type === 'debit') : (tx.type === 'credit'));

            return (
              <div key={tx.id} className="flex items-center justify-between p-4 sm:p-5 transition-all gap-3" style={{ borderColor: '#E0E7FF' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = '#F5F7FF'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 min-w-[30px]">
                    <span className="text-[9px] font-black" style={{ color: '#9CA3AF' }}>#{bankTransactions.length - index}</span>
                    <div className={`p-2 rounded-[1rem] flex items-center justify-center ${isIn ? 'bg-emerald-100/50 text-emerald-600' : 'bg-rose-100/50 text-rose-600'}`}>
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isIn ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                        )}
                      </svg>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                      <p className="text-[14px] sm:text-[16px] font-black uppercase tracking-tight truncate leading-none" style={{ color: '#1E1B4B' }}>{tx.person || 'N/A'}</p>
                      <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest whitespace-nowrap" style={{ background: '#F5F7FF', color: '#6B7280', border: '1px solid #E0E7FF' }}>{tx.paymentMethod === 'cash' ? 'Bank Deposit' : 'UPI'}</span>
                      {bankName === 'ALI ENTERPRISES' && tx.bank && tx.bank !== 'ALI ENTERPRISES' && (
                        <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded uppercase tracking-widest whitespace-nowrap">{tx.bank}</span>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-[11px] font-bold truncate" style={{ color: '#6B7280' }}>{tx.company || 'NA'}</p>
                    <p className="text-[9px] sm:text-[10px] font-black uppercase mt-1 tracking-widest tabular-nums whitespace-nowrap" style={{ color: '#9CA3AF' }}>
                      {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} • {new Date(tx.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </p>
                    <div className="mt-1 flex items-center">
                       <span className="text-[8px] font-black uppercase tracking-[0.15em] px-1.5 py-0.5 rounded" style={{ color: '#6366F1', background: '#EEF2FF', border: '1px solid #E0E7FF' }}>
                         By: {tx.recordedBy.replace('@gmail.com', '')}
                       </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 sm:gap-4 shrink-0">
                  <div className="text-right">
                    <div className={`text-[15px] sm:text-[18px] font-black tabular-nums transition-all tracking-tighter leading-none ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {isIn ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                    </div>
                    {tx.notes && <p className="hidden sm:block text-[9px] font-bold italic mt-1 max-w-[150px] truncate" style={{ color: '#9CA3AF' }}>{tx.notes}</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(tx.id); }}
                    className="p-2 hover:text-rose-500 rounded-xl transition-all active:scale-90"
                    style={{ color: '#9CA3AF' }}
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })}
          {bankTransactions.length > visibleCount && (
            <div className="p-4 flex justify-center" style={{ borderTop: '1px solid #E0E7FF' }}>
              <button
                onClick={() => setVisibleCount(prev => prev + TRANSACTIONS_PER_PAGE)}
                className="px-8 py-3 text-white rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all text-xs"
                style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', boxShadow: '0 4px 16px rgba(99,102,241,0.2)' }}
              >
                Load More Transactions
              </button>
            </div>
          )}
          {bankTransactions.length === 0 && (
            <div className="p-20 text-center">
              <p className="font-black uppercase tracking-widest text-xs" style={{ color: '#6B7280' }}>No records found for this bank</p>
            </div>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(30,27,75,0.4)', backdropFilter: 'blur(8px)' }}>
          <div
            className="rounded-[2.5rem] w-full max-w-md overflow-hidden animate-in scale-in"
            style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', border: '1px solid #E0E7FF', boxShadow: '0 20px 60px rgba(99,102,241,0.15)' }}
          >
            <div className="p-6 flex justify-between items-center" style={{ borderBottom: '1px solid #E0E7FF', background: 'white' }}>
              <h2 className="text-[15px] font-black uppercase tracking-widest" style={{ color: '#1E1B4B' }}>Internal Transfer</h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                className="p-2 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                style={{ color: '#9CA3AF', background: 'white', border: '1px solid #E0E7FF' }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-6">
              {isInternalPool && (
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: '#6366F1' }}>Transfer To</label>
                  <div className="grid grid-cols-3 gap-3">
                    {INTERNAL_POOL_BANKS.filter(target => target !== bankName).map((target) => (
                      <button
                        key={target}
                        onClick={() => setTransferTarget(target)}
                        className={`flex flex-col items-center justify-center p-3 rounded-[1.5rem] border-2 transition-all active:scale-95`}
                        style={transferTarget === target
                          ? { borderColor: '#6366F1', background: '#EEF2FF', boxShadow: '0 4px 12px rgba(99,102,241,0.15)' }
                          : { borderColor: '#E0E7FF', background: 'white' }
                        }
                      >
                        <img src={BANK_LOGOS[target] || BANK_LOGOS['OTHER']} alt={target} className="h-8 w-8 object-contain mb-2 drop-shadow-sm" />
                        <span
                          className="text-[10px] font-black uppercase text-center tracking-tight leading-tight"
                          style={{ color: transferTarget === target ? '#4338CA' : '#6B7280' }}
                        >{target}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!isInternalPool && bankName !== 'FINO' && (
                <div
                  className="p-4 rounded-[1.5rem]"
                  style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', border: '1px solid #E0E7FF' }}
                >
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#6366F1' }}>Transfer Destination</p>
                  <div className="flex items-center gap-3">
                    <img src={BANK_LOGOS['ALI ENTERPRISES']} className="h-8 w-8 object-contain drop-shadow-sm" alt="Ali Enterprises" />
                    <span className="text-sm font-black uppercase" style={{ color: '#1E1B4B' }}>ALI ENTERPRISES</span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest mb-2 mt-4" style={{ color: '#6366F1' }}>Amount</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                    <span className="group-focus-within:text-indigo-500 transition-colors font-black text-xl" style={{ color: '#9CA3AF' }}>₹</span>
                  </div>
                  <input
                    type="number"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="block w-full pl-11 pr-5 py-4 rounded-[1.5rem] text-2xl font-black focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                    style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
                    placeholder="0"
                  />
                </div>
              </div>

              <button
                onClick={handleSettleSubmit}
                disabled={isSettling || !transferTarget || !transferAmount || parseFloat(transferAmount) <= 0}
                className="w-full py-4 mt-2 disabled:opacity-40 text-white rounded-[1.5rem] text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', boxShadow: '0 8px 20px rgba(99,102,241,0.2)' }}
              >
                {isSettling ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : null}
                {isSettling ? 'Processing...' : 'Confirm Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default SingleBankHistoryPage;

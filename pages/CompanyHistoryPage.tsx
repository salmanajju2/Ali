import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../types';
import SlipImage from '../components/SlipImage';
import { aivenDatabase } from '../services/AivenDatabaseService';

// Icons
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { MinusCircleIcon } from '../components/icons/MinusCircleIcon';
import { TrashIcon } from '../components/icons/TrashIcon';
import { PencilIcon } from '../components/icons/PencilIcon';
import { PrinterIcon } from '../components/icons/PrinterIcon';
import { CalendarDaysIcon } from '../components/icons/CalendarDaysIcon';
import { FilterIcon } from '../components/icons/FilterIcon';

const TRANSACTIONS_PER_PAGE = 25;

import { DENOMINATIONS, BANK_LOGOS } from '../constants';

const formatPersonName = (name: string | undefined) => {
  if (typeof name !== 'string' || !name) return 'Unknown Customer';
  return name.trim().toUpperCase();
};

const TransactionItem: React.FC<{ // @ts-ignore
  transaction: Transaction & { closingBalance?: number }, isSelected: boolean, onSelect: (id: string) => void, from: string, onViewSlip: (url: string) => void, onDelete: (id: string) => void }> = ({ transaction, isSelected, onSelect, from, onViewSlip, onDelete }) => {
  const { id, date, type, person, amount, paymentMethod, bank, closingBalance } = transaction;

  const formattedDate = new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });

  const displayType = type;
  const displayColor = (displayType === 'credit' ? 'text-green-600' : 'text-red-600');

  return (
    <div
      className={`rounded-[1.5rem] transition-all duration-300 hover:-translate-y-0.5 flex p-3 sm:p-5 gap-3 sm:gap-4 ${isSelected ? 'ring-2 ring-indigo-500/50' : ''}`}
      style={{
        background: isSelected ? 'rgba(238,240,255,0.7)' : 'white',
        border: '1px solid #E0E7FF',
        boxShadow: '0 4px 16px rgba(99,102,241,0.06)',
      }}
    >
      {/* Desktop Layout - Shown only on tablet/desktop */}
      <div className="hidden sm:flex items-center w-full gap-3 sm:gap-4">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0 transition-colors"
          checked={isSelected}
          onChange={() => onSelect(id)}
          aria-label={`Select transaction for ${person || 'N/A'}`}
        />
        {displayType === 'credit' ? (
          <CheckCircleIcon className="h-8 w-8 text-emerald-500 flex-shrink-0 drop-shadow-sm" />
        ) : (
          <MinusCircleIcon className="h-8 w-8 text-rose-500 flex-shrink-0 drop-shadow-sm" />
        )}
        <div className="flex-grow min-w-0">
          <p className="font-black text-[16px] tracking-tight truncate leading-tight" style={{ color: '#1E1B4B' }}>{formatPersonName(person)}</p>
          <p className="text-xs font-bold mt-0.5 truncate uppercase tracking-widest" style={{ color: '#9CA3AF' }}>{formattedDate}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {bank && (
              <div className="flex flex-col items-center justify-center p-1.5 rounded-xl border shadow-sm" style={{ background: '#F5F7FF', borderColor: '#E0E7FF' }}>
                  {BANK_LOGOS[bank] && <img src={BANK_LOGOS[bank]} alt={bank} className="h-7 sm:h-7 object-contain drop-shadow-sm" />}
                  <span className={`text-[7px] sm:text-[8px] font-black uppercase mt-1 tracking-widest`} style={{ color: '#6B7280' }}>{bank}</span>
              </div>
          )}
          <div className="text-right flex items-center gap-3">
              {transaction.slip && (
                <SlipImage 
                  src={transaction.slip} 
                  alt="slip" 
                  className="h-10 w-10 object-cover rounded-[10px] border-2 border-white shadow-[0_4px_10px_rgb(0,0,0,0.1)] cursor-pointer hover:scale-110 hover:rotate-2 transition-all" 
                  onClick={() => onViewSlip(transaction.slip!)}
                />
              )}
              <div className="text-right">
                  <p className={`text-xl font-black tabular-nums tracking-tighter leading-none ${displayType === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {displayType === 'credit' ? '+' : '-'}₹{Math.abs(amount).toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] font-black mt-1 uppercase tracking-widest" style={{ color: '#9CA3AF' }}>{paymentMethod === 'upi' ? 'UPI Transfer' : 'Cash Deposit'}</p>
                  {closingBalance !== undefined && (
                     <p className="text-[11px] font-bold mt-1 uppercase tracking-wider tabular-nums inline-block px-1.5 rounded" style={{ color: '#6B7280', background: '#F5F7FF' }}>
                         Bal ₹{closingBalance.toLocaleString('en-IN')}
                     </p>
                  )}
              </div>
          </div>
          <Link to={`/edit/${id}`} state={{ from }} className="p-2 hover:text-blue-500 transition-colors" style={{ color: '#9CA3AF' }} aria-label="Edit transaction">
              <PencilIcon className="h-5 w-5" />
          </Link>
          <button onClick={() => onDelete(id)} className="p-2 hover:text-red-500 transition-colors" style={{ color: '#9CA3AF' }} aria-label="Delete transaction">
              <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile Layout - Shown only on mobile screens */}
      <div className="flex sm:hidden flex-col w-full gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 cursor-pointer flex-shrink-0 transition-colors"
              checked={isSelected}
              onChange={() => onSelect(id)}
              aria-label={`Select transaction for ${person || 'N/A'}`}
            />
            {displayType === 'credit' ? (
              <CheckCircleIcon className="h-6 w-6 text-emerald-500 flex-shrink-0 drop-shadow-sm" />
            ) : (
              <MinusCircleIcon className="h-6 w-6 text-rose-500 flex-shrink-0 drop-shadow-sm" />
            )}
            <div className="min-w-0">
              <p className="font-black text-[14px] tracking-tight truncate leading-tight" style={{ color: '#1E1B4B' }}>{formatPersonName(person)}</p>
              <p className="text-[9px] font-bold mt-0.5 text-slate-400 truncate uppercase tracking-widest">{formattedDate}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-[16px] font-black tabular-nums tracking-tighter leading-none ${displayType === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {displayType === 'credit' ? '+' : '-'}₹{Math.abs(amount).toLocaleString('en-IN')}
            </p>
            <p className="text-[9px] font-black mt-1 uppercase tracking-widest text-slate-400">{paymentMethod === 'upi' ? 'UPI Transfer' : 'Cash Deposit'}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {bank && (
              <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border shadow-sm" style={{ background: '#F5F7FF', borderColor: '#E0E7FF' }}>
                {BANK_LOGOS[bank] && <img src={BANK_LOGOS[bank]} alt={bank} className="h-4 w-4 object-contain drop-shadow-sm" />}
                <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: '#6B7280' }}>{bank}</span>
              </div>
            )}
            {closingBalance !== undefined && (
              <span className="text-[9px] font-bold uppercase tracking-wider tabular-nums px-1.5 py-0.5 rounded" style={{ color: '#6B7280', background: '#F5F7FF' }}>
                Bal ₹{closingBalance.toLocaleString('en-IN')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {transaction.slip && (
              <SlipImage 
                src={transaction.slip} 
                alt="slip" 
                className="h-8 w-8 object-cover rounded-[8px] border-2 border-white shadow-[0_2px_6px_rgb(0,0,0,0.1)] cursor-pointer hover:scale-110 transition-all" 
                onClick={() => onViewSlip(transaction.slip!)}
              />
            )}
            <Link to={`/edit/${id}`} state={{ from }} className="p-1 text-slate-400 hover:text-blue-500 transition-colors flex items-center" aria-label="Edit transaction">
              <PencilIcon className="h-4.5 w-4.5" />
              <span className="ml-2 text-sm inline sm:hidden">Edit</span>
            </Link>
            <button onClick={() => onDelete(id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" aria-label="Delete transaction">
              <TrashIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const CompanyHistoryPage: React.FC = () => {
  const { companyName } = useParams<{ companyName: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { transactions, deleteTransactionsByIds, addForwardEntry, user } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const locationFilter = searchParams.get('location');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<string | null>(null);
  const [resolvedSlipUrl, setResolvedSlipUrl] = useState<string | null>(null);

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

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);


  const [filterYear, setFilterYear] = useState(searchParams.get('year') || 'all');
  const [filterMonth, setFilterMonth] = useState(searchParams.get('month') || 'all');
  const [filterDay, setFilterDay] = useState(searchParams.get('day') || 'all');
  const [filterType, setFilterType] = useState(searchParams.get('type') || 'all');
  const [filterSubCompany, setFilterSubCompany] = useState(searchParams.get('subCompany') || 'all');
  const [showAllDates, setShowAllDates] = useState(searchParams.get('showAllDates') === 'true');
  const [showFilters, setShowFilters] = useState(false);

  const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PER_PAGE);

  const decodedCompanyName = companyName ? decodeURIComponent(companyName) : '';

  const companyTransactions = useMemo(() => {
    if (decodedCompanyName === 'NA') {
      return [];
    }
    let filtered = transactions.filter(tx => {
      const comp = tx.company || 'NA';
      
      // Filter by company name
      const isCompanyMatch = (decodedCompanyName === 'MEESHO' || decodedCompanyName === 'XPREES BEES')
        ? (comp === 'MEESHO' || comp === 'XPREES BEES')
        : (comp === decodedCompanyName);
        
      if (!isCompanyMatch) return false;

      // Personal Privacy Filter for Company History: 
      // Only show own transactions unless Admin, even if it's a bank transaction.
      const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
      if (isAdmin) return true;

      const userEmail = user?.email?.toLowerCase();
      const userName = user?.displayName?.toLowerCase();
      const txRecorder = tx.recordedBy.toLowerCase();
      
      return txRecorder.includes(userEmail || '___') || 
             txRecorder.includes(userName || '___') ||
             (userEmail && userEmail.includes(txRecorder)) ||
             (userName && userName.includes(txRecorder));
    });
    if (locationFilter) {
      filtered = filtered.filter(tx => tx.location === locationFilter);
    }
    const sortedTxs = filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let currentBalance = 0;
    const txsWithBalance = [];
    for (let i = 0; i < sortedTxs.length; i++) {
      const tx = sortedTxs[i];
      currentBalance += (tx.type === 'credit' ? tx.amount : -tx.amount);
      txsWithBalance.unshift({ ...tx, closingBalance: currentBalance });
    }
    return txsWithBalance;
  }, [transactions, decodedCompanyName, locationFilter]);

  const companyLocation = companyTransactions.length > 0 ? companyTransactions[0].location : '';

  const { years, months, days } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    const days = new Set<string>();
    companyTransactions.forEach(tx => {
      const d = new Date(tx.date);
      years.add(d.getFullYear().toString());
      if (showAllDates) {
        if (filterYear === 'all' || d.getFullYear().toString() === filterYear) {
          months.add((d.getMonth() + 1).toString());
        }
        if ((filterYear === 'all' || d.getFullYear().toString() === filterYear) &&
          (filterMonth === 'all' || (d.getMonth() + 1).toString() === filterMonth)) {
          days.add(d.getDate().toString());
        }
      }
    });
    return {
      years: Array.from(years).sort((a, b) => parseInt(b) - parseInt(a)),
      months: Array.from(months).sort((a, b) => parseInt(a) - parseInt(b)),
      days: Array.from(days).sort((a, b) => parseInt(a) - parseInt(b)),
    };
  }, [companyTransactions, filterYear, filterMonth, showAllDates]);

  useEffect(() => {
    setSelectedIds([]);
    const params = new URLSearchParams(searchParams);
    if (searchTerm.trim()) {
      params.set('search', searchTerm.trim());
    } else {
      params.delete('search');
    }
    if (showAllDates) {
      params.set('showAllDates', 'true');
      params.set('year', filterYear);
      params.set('month', filterMonth);
      params.set('day', filterDay);
    } else {
      params.delete('showAllDates');
      params.delete('year');
      params.delete('month');
      params.delete('day');
    }
    if (filterType !== 'all') {
      params.set('type', filterType);
    } else {
      params.delete('type');
    }
    if (filterSubCompany !== 'all') {
      params.set('subCompany', filterSubCompany);
    } else {
      params.delete('subCompany');
    }
    setSearchParams(params, { replace: true });
  }, [searchTerm, filterYear, filterMonth, filterDay, filterType, filterSubCompany, showAllDates, setSearchParams]);

  const filteredTransactions = useMemo(() => {
    return companyTransactions.filter(tx => {
      const txDate = new Date(tx.date);

      if (!showAllDates) {
        const currentDate = new Date();
        if (txDate.getFullYear() !== currentDate.getFullYear() || txDate.getMonth() !== currentDate.getMonth() || txDate.getDate() !== currentDate.getDate()) return false;
      } else {
        if (filterYear !== 'all' && txDate.getFullYear().toString() !== filterYear) return false;
        if (filterMonth !== 'all' && (txDate.getMonth() + 1).toString() !== filterMonth) return false;
        if (filterDay !== 'all' && txDate.getDate().toString() !== filterDay) return false;
      }
      if (filterType !== 'all' && tx.type !== filterType) return false;
      if (filterSubCompany !== 'all' && tx.company !== filterSubCompany) return false;
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const comp = (tx.company || '').toLowerCase();
        const person = (typeof tx.person === 'string' ? tx.person : '').toLowerCase();
        const amt = tx.amount.toString();
        const pm = (tx.paymentMethod || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        const d = new Date(tx.date);
        const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
        const dateIso = tx.date.split('T')[0];

        if (!(comp.includes(s) || person.includes(s) || amt.includes(s) || pm.includes(s) || type.includes(s) || dateFormatted.includes(s) || dateIso.includes(s))) {
          return false;
        }
      }
      return true;
    });
  }, [companyTransactions, searchTerm, filterYear, filterMonth, filterDay, filterType, filterSubCompany, showAllDates]);

  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice(0, visibleCount);
  }, [filteredTransactions, visibleCount]);

  useEffect(() => {
    setVisibleCount(TRANSACTIONS_PER_PAGE);
  }, [searchTerm, filterYear, filterMonth, filterDay, filterType, showAllDates, companyTransactions]);


  const filteredSummary = useMemo(() => {
    return filteredTransactions.reduce((acc, tx) => {
      if (tx.type === 'credit') {
        acc.totalCredit += tx.amount;
        if (tx.paymentMethod === 'cash') acc.cashCredit += tx.amount;
        else if (tx.paymentMethod === 'upi') acc.upiCredit += tx.amount;
      } else {
        acc.totalDebit += tx.amount;
        if (tx.paymentMethod === 'cash') acc.cashDebit += tx.amount;
        else if (tx.paymentMethod === 'upi') acc.upiDebit += tx.amount;
      }
      return acc;
    }, { totalCredit: 0, totalDebit: 0, cashCredit: 0, cashDebit: 0, upiCredit: 0, upiDebit: 0 });
  }, [filteredTransactions]);

  const filteredNetBalance = filteredSummary.totalCredit - filteredSummary.totalDebit;

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

  const handlePrint = () => {
    const params = new URLSearchParams();
    if (locationFilter) params.append('location', locationFilter);
    if (filterType !== 'all') params.append('type', filterType);
    if (searchTerm.trim()) params.append('search', searchTerm.trim());
    if (showAllDates) {
      params.append('showAllDates', 'true');
      if (filterYear !== 'all') params.append('year', filterYear);
      if (filterMonth !== 'all') params.append('month', filterMonth);
      if (filterDay !== 'all') params.append('day', filterDay);
    }
    const reportUrl = `/report/${encodeURIComponent(decodedCompanyName)}${params.toString() ? '?' + params.toString() : ''}`;
    navigate(reportUrl);
  };

  const handleUpi = () => {
    const targetCompany = (filterSubCompany !== 'all') ? filterSubCompany : decodedCompanyName;
    navigate('/upi-credit', { state: { companyName: targetCompany, companyLocation: locationFilter || companyLocation } });
  };
  const handleNewDebit = () => {
    const targetCompany = (filterSubCompany !== 'all') ? filterSubCompany : decodedCompanyName;
    navigate('/debit-entry', { state: { companyName: targetCompany, companyLocation: locationFilter || companyLocation } });
  };

  const handleForwardEntry = async () => {
    let forwardFromDate;
    if (showAllDates) {
      if (filterYear !== 'all' && filterMonth !== 'all' && filterDay !== 'all') {
        forwardFromDate = new Date(parseInt(filterYear), parseInt(filterMonth) - 1, parseInt(filterDay), 23, 59, 59, 999);
      } else {
        alert("Please select a specific year, month, and day to forward a balance.");
        return;
      }
    } else {
      forwardFromDate = new Date();
      forwardFromDate.setHours(23, 59, 59, 999);
    }

    if (!user) {
      alert("You must be logged in to forward an entry.");
      return;
    }

    const creditDate = new Date(forwardFromDate);
    creditDate.setHours(12, 0, 0, 0);

    const debitDate = new Date(creditDate);
    debitDate.setDate(debitDate.getDate() - 1);
    debitDate.setHours(23, 59, 59, 999);

    // Calculate net balance of all transactions for this company on debitDate
    const previousTransactions = companyTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      return (
        txDate.getFullYear() === debitDate.getFullYear() &&
        txDate.getMonth() === debitDate.getMonth() &&
        txDate.getDate() === debitDate.getDate()
      );
    });

    const totalCredit = previousTransactions
      .filter(tx => tx.type === 'credit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalDebit = previousTransactions
      .filter(tx => tx.type === 'debit')
      .reduce((sum, tx) => sum + tx.amount, 0);

    const forwardAmount = totalCredit - totalDebit;

    const debitTransaction = {
      amount: Math.abs(forwardAmount),
      company: decodedCompanyName,
      date: debitDate.toISOString(),
      location: locationFilter || companyLocation,
      paymentMethod: 'cash',
      person: 'Forwarded to Next Day',
      type: 'debit' as 'debit',
      recordedBy: user.displayName || user.email || 'Unknown',
      breakdown: {},
    };

    const creditTransaction = {
      amount: Math.abs(forwardAmount),
      company: decodedCompanyName,
      date: creditDate.toISOString(),
      location: locationFilter || companyLocation,
      paymentMethod: 'cash',
      person: 'Received from Previous Day',
      type: 'credit' as 'credit',
      recordedBy: user.displayName || user.email || 'Unknown',
      breakdown: {},
    };

    try {
      if (forwardAmount > 0) {
        await addForwardEntry(debitTransaction, creditTransaction);
      } else {
        await addForwardEntry(
          { ...debitTransaction, type: 'credit', person: 'Negative Balance Forwarded' },
          { ...creditTransaction, type: 'debit', person: 'Negative Balance Received' }
        );
      }

      alert('Balance forwarded successfully!');

      const year = creditDate.getFullYear().toString();
      const month = (creditDate.getMonth() + 1).toString();
      const day = creditDate.getDate().toString();

      const newSearchParams = new URLSearchParams();
      newSearchParams.set('year', year);
      newSearchParams.set('month', month);
      newSearchParams.set('day', day);
      newSearchParams.set('showAllDates', 'true');
      if (locationFilter) {
        newSearchParams.set('location', locationFilter);
      }

      navigate(`${window.location.pathname}?${newSearchParams.toString()}`);

    } catch (error) {
      console.error('Failed to forward balance:', error);
      alert('Failed to forward balance. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      await deleteTransactionsByIds([id]);
    }
  };

  const handleDeleteClick = () => {
    if (selectedIds.length === 0) return;
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTransactionsByIds(selectedIds);
      setIsDeleteModalOpen(false);
      setSelectedIds([]);
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete transactions.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (!decodedCompanyName) return <div className="text-center p-8" style={{ color: '#1E1B4B' }}>Company name not found.</div>;

  return (
    <div className="max-w-7xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-6 no-print">
        <div className="flex items-center gap-4">
          <Link to={locationFilter ? `/summary` : "/summary"} className="flex items-center gap-2 hover:underline" style={{ color: '#6366F1' }}>
            <ArrowLeftIcon className="h-5 w-5" /><span>Back to Summaries</span>
          </Link>
          {locationFilter && (
            <Link
              to={`/company/${encodeURIComponent(decodedCompanyName)}`}
              className="flex items-center gap-2 hover:underline text-sm"
              style={{ color: '#F59E0B' }}
            >
              Clear Location Filter
            </Link>
          )}
        </div>
        <h2 className="text-2xl w-full sm:w-auto text-center sm:text-left" style={{ color: '#1E1B4B' }}>
          {decodedCompanyName} History
          {locationFilter && (
            <span className="block text-xs font-normal mt-1" style={{ color: '#6366F1' }}>
              Filtered for location: {locationFilter}
            </span>
          )}
        </h2>
        <div className="flex justify-center sm:justify-end gap-2 w-full sm:w-auto">
          <button onClick={handleUpi} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors" style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}>
            <span>₹</span> UPI
          </button>
          <button onClick={handleForwardEntry} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors bg-yellow-500 text-white hover:bg-yellow-600">
            Forward
          </button>
          <button onClick={handleNewDebit} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors bg-red-600 text-white hover:bg-red-700">
            Debit
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors`}
            style={showFilters
              ? { background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', border: '1px solid #6366F1' }
              : { background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }
            }
          >
            <FilterIcon className="h-5 w-5" />
          </button>
          <button onClick={handlePrint} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-sm hover:bg-red-600 hover:text-white" style={{ border: '2px solid #FEE2E2', background: '#FFF1F2', color: '#E11D48' }}>
            <PrinterIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Report / PDF</span>
          </button>
          <button onClick={handleDeleteClick} disabled={selectedIds.length === 0} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}>
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="p-6 rounded-[2rem] hover:shadow-lg transition-all" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #E0E7FF', boxShadow: '0 4px 16px rgba(99,102,241,0.06)' }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center pr-4" style={{ borderRight: '1px solid #E0E7FF' }}>
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2" style={{ color: '#9CA3AF' }}>Credit</p>
              <p className="text-2xl font-black text-emerald-600 tracking-tighter tabular-nums truncate">₹{filteredSummary.totalCredit.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-center pl-2">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2" style={{ color: '#9CA3AF' }}>Debit</p>
              <p className="text-2xl font-black text-rose-600 tracking-tighter tabular-nums truncate">₹{filteredSummary.totalDebit.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
        <div className="p-6 rounded-[2rem] hover:shadow-lg transition-all" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #E0E7FF', boxShadow: '0 4px 16px rgba(99,102,241,0.06)' }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center pr-4" style={{ borderRight: '1px solid #E0E7FF' }}>
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2" style={{ color: '#9CA3AF' }}>Cash</p>
              <p className="text-2xl font-black tracking-tighter tabular-nums truncate" style={{ color: '#1E1B4B' }}>₹{filteredSummary.cashCredit.toLocaleString('en-IN')}</p>
            </div>
            <div className="text-center pl-2">
              <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2" style={{ color: '#9CA3AF' }}>UPI</p>
              <p className="text-2xl font-black tracking-tighter tabular-nums truncate" style={{ color: '#1E1B4B' }}>₹{filteredSummary.upiCredit.toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
        <div className="p-6 rounded-[2rem] flex justify-between items-center relative overflow-hidden group hover:shadow-lg transition-all sm:col-span-2 lg:col-span-1" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #E0E7FF', boxShadow: '0 4px 16px rgba(99,102,241,0.06)' }}>
          <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-indigo-400/20 rounded-full blur-2xl group-hover:scale-110 transition-transform pointer-events-none"></div>
          <div className='truncate relative z-10'>
            <p className="text-[10px] font-black uppercase tracking-widest leading-none mb-2" style={{ color: '#9CA3AF' }}>Filtered Net</p>
            <p className={`text-3xl font-black tracking-tighter tabular-nums truncate ${filteredNetBalance >= 0 ? 'bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent' : 'text-rose-500'}`}>
              ₹{filteredNetBalance.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="p-4 rounded-2xl shadow-sm relative z-10" style={{ background: 'linear-gradient(135deg,#EEF2FF,#F5F3FF)', border: '1px solid #E0E7FF' }}>
            <StarIcon className="h-7 w-7 text-indigo-600" />
          </div>
        </div>
      </div>

      {/* Filter Section */}
      {showFilters && (
        <div className="rounded-lg shadow-lg p-4 mb-6 sticky top-[65px] z-5 no-print" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
          <input type="text" placeholder="Search by person, amount, or payment method..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-4 pr-4 py-2 rounded-md mb-4" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }} />


          <div className="mb-4 flex items-center gap-4">
            <button
              onClick={() => setShowAllDates(!showAllDates)}
              className={`px-4 py-2 rounded-md font-medium transition-colors`}
              style={showAllDates
                ? { background: '#F5F7FF', color: '#1E1B4B', border: '1px solid #E0E7FF' }
                : { background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', border: 'none' }
              }
            >
              {showAllDates ? 'Show Today Only' : 'Show All Dates'}
            </button>
            {!showAllDates && (
              <span className="text-sm font-medium" style={{ color: '#6366F1' }}>
                Showing: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>

          {showAllDates && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
              <div className='relative'><CalendarDaysIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} /><select value={filterYear} onChange={e => { setFilterYear(e.target.value); setFilterMonth('all'); setFilterDay('all'); }} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}><option value="all">All Years</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></div>
              <div className='relative'><CalendarDaysIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} /><select value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFilterDay('all'); }} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}><option value="all">All Months</option>{months.map(m => <option key={m} value={m}>{new Date(2000, parseInt(m) - 1).toLocaleString('default', { month: 'long' })}</option>)}</select></div>
              <div className='relative'><CalendarDaysIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} /><select value={filterDay} onChange={e => setFilterDay(e.target.value)} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}><option value="all">All Days</option>{days.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
              <div className='relative'><FilterIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} /><select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}><option value="all">All Types</option><option value="credit">Credit</option><option value="debit">Debit</option></select></div>
              {(decodedCompanyName === 'MEESHO' || decodedCompanyName === 'XPREES BEES') && (
                <div className='relative'><FilterIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} />
                  <select value={filterSubCompany} onChange={e => setFilterSubCompany(e.target.value)} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}>
                    <option value="all">All Companies</option>
                    <option value="MEESHO">Meesho Only</option>
                    <option value="XPREES BEES">Xpress Bees Only</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {!showAllDates && (
            <div className={`grid grid-cols-1 md:grid-cols-${(decodedCompanyName === 'MEESHO' || decodedCompanyName === 'XPREES BEES') ? '2' : '1'} gap-4 mb-4`}>
              <div className='relative'><FilterIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} /><select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}><option value="all">All Types</option><option value="credit">Credit</option><option value="debit">Debit</option></select></div>
              {(decodedCompanyName === 'MEESHO' || decodedCompanyName === 'XPREES BEES') && (
                <div className='relative'><FilterIcon className='absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5' style={{ color: '#9CA3AF' }} />
                  <select value={filterSubCompany} onChange={e => setFilterSubCompany(e.target.value)} className="w-full p-2 pl-10 rounded-md appearance-none" style={{ border: '1px solid #E0E7FF', background: '#F5F7FF', color: '#1E1B4B' }}>
                    <option value="all">All Companies</option>
                    <option value="MEESHO">Meesho Only</option>
                    <option value="XPREES BEES">Xpress Bees Only</option>
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex items-center">
            <input type="checkbox" id="selectAll" onChange={handleSelectAll} checked={filteredTransactions.length > 0 && selectedIds.length === filteredTransactions.length} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <label htmlFor="selectAll" className="ml-2 text-sm" style={{ color: '#6B7280' }}>Select/Deselect All ({selectedIds.length} of {filteredTransactions.length} selected)</label>
          </div>
        </div>
      )}

      {filteredTransactions.length > 0 ? (
        <>
          <div className="space-y-4">
            {paginatedTransactions.map(tx => <TransactionItem key={tx.id} transaction={tx} isSelected={selectedIds.includes(tx.id)} onSelect={handleSelect} from={location.pathname + location.search} onViewSlip={(url) => { void openSlip(url); }} onDelete={handleDelete} />)}
          </div>
          {filteredTransactions.length > visibleCount && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setVisibleCount(prev => prev + TRANSACTIONS_PER_PAGE)}
                className="px-6 py-2 rounded-md text-white hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white' }}
              >
                Load More
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-16 rounded-lg shadow-xl mt-4" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
          <p style={{ color: '#6B7280' }}>No transactions found for this company matching your criteria.</p>
        </div>
      )}

      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="rounded-lg shadow-xl p-6 w-full max-w-md" style={{ background: 'white', border: '1px solid #E0E7FF' }}>
            <h3 className="text-lg" style={{ color: '#1E1B4B' }}>Confirm Deletion</h3>
            <p className="mt-2 text-sm" style={{ color: '#6B7280' }}>
              Are you sure you want to delete the selected <strong>{selectedIds.length}</strong> transaction(s) for <strong>{decodedCompanyName}</strong>? This will also update the cash vault for any cash transactions and cannot be undone.
            </p>
            {deleteError && <div className="mt-4 p-2 rounded-lg text-sm" style={{ background: '#FFF1F2', color: '#E11D48' }}>{deleteError}</div>}
            <div className="mt-6 flex justify-end gap-4">
              <button onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50" style={{ border: '1px solid #E0E7FF', color: '#1E1B4B', background: 'white' }}>Cancel</button>
              <button onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50">
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
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
                    className="px-6 py-2 rounded-lg font-medium shadow-lg transition-colors inline-block"
                    style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white' }}
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
                          text: `Slip for transaction of ${decodedCompanyName}`,
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

export default CompanyHistoryPage;

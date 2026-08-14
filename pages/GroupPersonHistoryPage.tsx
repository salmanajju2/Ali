import React, { useMemo, useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../types';
import { contacts } from '../utils/contacts';

// Icons
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { MinusCircleIcon } from '../components/icons/MinusCircleIcon';
import { PencilIcon } from '../components/icons/PencilIcon';
import { ShareIcon } from '../components/icons/ShareIcon';
import { PlusIcon } from '../components/icons/PlusIcon';
import { TrashIcon } from '../components/icons/TrashIcon';

import SlipImage from '../components/SlipImage';
import { aivenDatabase } from '../services/AivenDatabaseService';
import { BANK_LOGOS } from '../constants';

const TRANSACTIONS_PER_PAGE = 50;

type TransactionWithBalance = Transaction & { closingBalance: number };

const TransactionItem: React.FC<{
  transaction: TransactionWithBalance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  from: string;
  onViewSlip: (url: string) => void;
  onDelete: (id: string) => void;
}> = ({ transaction, isSelected, onSelect, from, onViewSlip, onDelete }) => {
  const { id, date, type, person, amount, paymentMethod, closingBalance, bank } = transaction;

  const formattedDate = new Date(date).toLocaleString('en-IN', {
    day: '2-digit', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  return (
    <div className={`card transition-shadow duration-300 hover:shadow-lg flex p-3 sm:p-4 gap-2 sm:gap-4 ${isSelected ? 'ring-2 ring-indigo-500/50' : ''}`}>
      {/* Desktop Layout */}
      <div className="hidden sm:flex items-center w-full gap-2 sm:gap-4">
        <input
          type="checkbox"
          className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
          checked={isSelected}
          onChange={() => onSelect(id)}
          aria-label={`Select transaction for ${person || 'N/A'}`}
        />
        {type === 'credit' ? (
          <CheckCircleIcon className="h-8 w-8 text-green-500 flex-shrink-0" />
        ) : (
          <MinusCircleIcon className="h-8 w-8 text-red-500 flex-shrink-0" />
        )}
        <div className="flex-grow min-w-0">
          <p className="font-semibold text-lg truncate" style={{ color: '#1E1B4B' }}>{person || 'N/A'}</p>
          <p className="text-sm truncate" style={{ color: '#9CA3AF' }}>{formattedDate}</p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {bank && BANK_LOGOS[bank] && (
            <div className="flex flex-col items-center">
              <img src={BANK_LOGOS[bank]} alt={bank} className="h-8 w-8 object-contain" />
              <span className="text-[8px] font-bold uppercase" style={{ color: '#9CA3AF' }}>{bank}</span>
            </div>
          )}
          <div className="text-right flex flex-row items-center gap-3">
            {transaction.slip && (
              <SlipImage
                src={transaction.slip}
                alt="slip"
                className="h-8 w-8 object-cover rounded cursor-pointer hover:scale-110 transition-transform"
                style={{ border: '1px solid #E0E7FF' }}
                onClick={() => onViewSlip(transaction.slip!)}
              />
            )}
            <div className="text-right">
              <p className={`text-xl font-bold ${type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {type === 'credit' ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
              </p>
              <p className="text-xs uppercase" style={{ color: '#9CA3AF' }}>{paymentMethod}</p>
              <p className="text-sm font-medium mt-0.5" style={{ color: '#6B7280' }}>
                Bal: ₹{closingBalance.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <div className="flex flex-row items-center gap-1 -mr-2">
            <Link to={`/edit/${id}`} state={{ from }} className="p-2 text-gray-400 hover:text-blue-500 rounded-full hover:bg-indigo-50 flex items-center" aria-label="Edit transaction">
              <PencilIcon className="h-5 w-5" />
            </Link>
            <button onClick={() => onDelete(id)} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-indigo-50" aria-label="Delete transaction">
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="flex sm:hidden flex-col w-full gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer flex-shrink-0"
              checked={isSelected}
              onChange={() => onSelect(id)}
              aria-label={`Select transaction for ${person || 'N/A'}`}
            />
            {type === 'credit' ? (
              <CheckCircleIcon className="h-6 w-6 text-green-500 flex-shrink-0" />
            ) : (
              <MinusCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-base truncate" style={{ color: '#1E1B4B' }}>{person || 'N/A'}</p>
              <p className="text-[9px] text-slate-400 truncate uppercase tracking-widest">{formattedDate}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <p className={`text-[16px] font-bold tabular-nums tracking-tighter leading-none ${type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {type === 'credit' ? '+' : '-'}₹{amount.toLocaleString('en-IN')}
            </p>
            <p className="text-[9px] font-black mt-1 uppercase tracking-widest text-slate-400">{paymentMethod}</p>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            {bank && BANK_LOGOS[bank] && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border shadow-sm" style={{ background: '#F5F7FF', borderColor: '#E0E7FF' }}>
                <img src={BANK_LOGOS[bank]} alt={bank} className="h-4 w-4 object-contain" />
                <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#9CA3AF' }}>{bank}</span>
              </div>
            )}
            {closingBalance !== undefined && (
              <span className="text-[9px] font-bold uppercase tracking-wider tabular-nums px-1.5 py-0.5 rounded" style={{ color: '#6B7280', background: '#F5F7FF' }}>
                Bal: ₹{closingBalance.toLocaleString('en-IN')}
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

const GroupPersonHistoryPage: React.FC = () => {
  const { groupName, personName } = useParams<{ groupName: string, personName: string }>();
  const { transactions, deleteTransactionsByIds, user, userIdentityKeys } = useAppContext();

  const location = useLocation();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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

  const decodedGroupName = groupName ? decodeURIComponent(groupName) : '';
  const decodedPersonName = personName ? decodeURIComponent(personName) : '';
  const companyGroup = ['CHOLA', 'CHARGE', 'IDFC', 'HERO', 'LT'];

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const personData = useMemo(() => {
    const groupTransactions = transactions
      .filter(tx => companyGroup.includes(typeof tx.company === 'string' ? tx.company.toUpperCase() : 'NA'))
      .filter(tx => {
        const txPerson = (typeof tx.person === 'string' ? tx.person.trim() : 'Unknown').toUpperCase();
        const targetPerson = decodedPersonName.trim().toUpperCase();
        const isPersonMatch = targetPerson === 'XPREES BEES' || targetPerson === 'MOSHO'
          ? (txPerson === 'XPREES BEES' || txPerson === 'MOSHO')
          : (txPerson === targetPerson);
          
        if (!isPersonMatch) return false;

        // Personal Privacy Filter (Strict Isolation)
        const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
        if (isAdmin) return true;

        const rb = (tx.recordedBy || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const crb = rb.replace(/[^a-z0-9@.]/g, '');
        return userIdentityKeys.has(rb) || userIdentityKeys.has(crb);
      });


    const sortedTxs = groupTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let closingBalance = 0;
    const txsWithBalance: TransactionWithBalance[] = [];
    for (let i = 0; i < sortedTxs.length; i++) {
      const tx = sortedTxs[i];
      closingBalance += (tx.type === 'credit' ? tx.amount : -tx.amount);
      txsWithBalance.unshift({ ...tx, closingBalance });
    }

    return { transactions: txsWithBalance };
  }, [transactions, decodedPersonName]);

  const filteredData = useMemo(() => {
    let filtered = personData.transactions;
    if (fromDate) {
      const startDay = new Date(fromDate + 'T00:00:00');
      filtered = filtered.filter(tx => new Date(tx.date).getTime() >= startDay.getTime());
    }
    if (toDate) {
      const endDay = new Date(toDate + 'T23:59:59');
      filtered = filtered.filter(tx => new Date(tx.date).getTime() <= endDay.getTime());
    }

    const totalCredit = filtered.reduce((sum, tx) => tx.type === 'credit' ? sum + tx.amount : sum, 0);
    const totalDebit = filtered.reduce((sum, tx) => tx.type === 'debit' ? sum + tx.amount : sum, 0);
    const periodNetBalance = totalCredit - totalDebit;

    return { transactions: filtered, totalCredit, totalDebit, netBalance: periodNetBalance };
  }, [personData.transactions, fromDate, toDate]);

  const paginatedTransactions = useMemo(() => {
    return filteredData.transactions.slice(0, visibleCount);
  }, [filteredData.transactions, visibleCount]);

  useEffect(() => {
    setVisibleCount(TRANSACTIONS_PER_PAGE);
  }, [decodedPersonName, fromDate, toDate]);

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      await deleteTransactionsByIds([id]);
    }
  };

  const handleShare = () => {
    const { netBalance, transactions: txs } = filteredData;
    const upperPerson = decodedPersonName.toUpperCase();
    const contactKey = Object.keys(contacts).find(key => upperPerson.includes(key));
    const whatsappNumber = contactKey ? contacts[contactKey] : undefined;

    let finalNumber = whatsappNumber;
    if (!finalNumber) {
      const localContacts = JSON.parse(localStorage.getItem('user_added_contacts') || '{}');
      if (localContacts[upperPerson]) {
        finalNumber = localContacts[upperPerson];
      } else {
        const userInput = window.prompt(`WhatsApp number not found for ${decodedPersonName}.\nPlease enter the 10-digit number:`);
        if (userInput) {
          let cleanNumber = userInput.replace(/\D/g, ''); // Remove non-digits
          if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
          if (cleanNumber.length >= 10) {
            localContacts[upperPerson] = cleanNumber;
            localStorage.setItem('user_added_contacts', JSON.stringify(localContacts));
            finalNumber = cleanNumber;
          } else {
            alert('Invalid number entered.');
            return;
          }
        } else {
          return;
        }
      }
    }

    let message = `Hello ${decodedPersonName},\n\nHere is your transaction summary:\n\n`;
    txs.slice(0, 5).forEach(tx => {
      const formattedDate = new Date(tx.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const sign = tx.type === 'credit' ? '+' : '-';
      message += `${formattedDate}: ${sign}₹${tx.amount.toLocaleString('en-IN')} (${tx.paymentMethod}) - Closing Bal: ₹${tx.closingBalance.toLocaleString('en-IN')}\n`;
    });
    message += `\nFinal Net Balance: ₹${netBalance.toLocaleString('en-IN')}`;

    const whatsappUrl = `whatsapp://send?phone=${finalNumber}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (!decodedGroupName || !decodedPersonName) return <div className="text-center p-8" style={{ color: '#1E1B4B' }}>Group or Person name not found.</div>;

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 my-6 px-2 sm:px-4 no-print">
        <div className="flex items-center gap-4">
          <Link to={`/group/${encodeURIComponent(decodedGroupName)}`} className="flex items-center gap-2 text-blue-600 hover:underline">
            <ArrowLeftIcon className="h-5 w-5" /><span>Back to Group</span>
          </Link>
        </div>
        <h2 className="text-3xl font-bold w-full sm:w-auto text-center sm:text-left" style={{ color: '#1E1B4B' }}>
          {decodedPersonName} History
        </h2>
        <div className="flex flex-wrap gap-2 justify-center sm:justify-end">
          {selectedIds.length > 0 && (
            <button
              onClick={async () => {
                if (window.confirm(`Are you sure you want to delete ${selectedIds.length} transactions?`)) {
                  await deleteTransactionsByIds(selectedIds);
                  setSelectedIds([]);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors bg-red-600 text-white hover:bg-red-700"
            >
              <TrashIcon className="h-4 w-4" /> Delete ({selectedIds.length})
            </button>
          )}
          <Link to="/upi-credit" state={{ companyName: filteredData.transactions[0]?.company || companyGroup[0], companyLocation: filteredData.transactions[0]?.location || 'BXU', person: decodedPersonName, from: location.pathname }} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors bg-green-500 text-white hover:bg-green-600">
            <PlusIcon className="h-4 w-4" /> UPI Credit
          </Link>
          <Link to="/debit-entry" state={{ companyName: filteredData.transactions[0]?.company || companyGroup[0], companyLocation: filteredData.transactions[0]?.location || 'BXU', person: decodedPersonName, from: location.pathname }} className="flex items-center gap-1.5 px-3 py-2 border rounded-md text-sm font-medium transition-colors bg-red-500 text-white hover:bg-red-600">
            <PlusIcon className="h-4 w-4" /> Debit
          </Link>
          <button onClick={handleShare} style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', boxShadow: '0 4px 14px rgba(99,102,241,0.35)', border: 'none' }} className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors">
            <ShareIcon className="h-4 w-4" /> Share
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 px-2 sm:px-4">
        <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-6">
          <p className="text-xs font-medium" style={{ color: '#9CA3AF' }}>Total Credit</p>
          <p className="text-2xl text-emerald-600 mt-1 truncate">₹{filteredData.totalCredit.toLocaleString('en-IN')}</p>
        </div>
        <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-6">
          <p className="text-xs font-medium" style={{ color: '#9CA3AF' }}>Total Debit</p>
          <p className="text-2xl text-rose-600 mt-1 truncate">₹{filteredData.totalDebit.toLocaleString('en-IN')}</p>
        </div>
        <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-6 flex justify-between items-center">
          <div className='truncate'>
            <p className="text-xs font-medium" style={{ color: '#9CA3AF' }}>Period Net Balance</p>
            <p className={`text-2xl mt-1 truncate ${filteredData.netBalance >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>₹{filteredData.netBalance.toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="mb-4 mx-2 sm:mx-4 p-4 flex flex-col sm:flex-row gap-4 no-print">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: '#6366F1' }}>From Date</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} onClick={(e) => (e.target as any).showPicker?.()} style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }} className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: '#6366F1' }}>To Date</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} onClick={(e) => (e.target as any).showPicker?.()} style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }} className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => { setFromDate(''); setToDate(''); }}
            style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#6B7280' }}
            className="w-full sm:w-auto px-4 py-2 rounded-md text-sm font-medium transition-colors hover:bg-indigo-50"
          >
            Clear Filters
          </button>
        </div>
      </div>

      <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="mb-4 mx-2 sm:mx-4">
        <div className="p-4 space-y-4">
          {paginatedTransactions.map(tx => (
            <TransactionItem
              key={tx.id}
              transaction={tx}
              isSelected={selectedIds.includes(tx.id)}
              onSelect={(id) => setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])}
              from={location.pathname + location.search}
              onViewSlip={(url) => { void openSlip(url); }}
              onDelete={handleDelete}
            />
          ))}
          {filteredData.transactions.length > visibleCount && (
            <div className="flex justify-center pt-4">
              <button
                onClick={() => setVisibleCount(prev => prev + TRANSACTIONS_PER_PAGE)}
                style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
                className="px-8 py-3 rounded-xl font-bold uppercase tracking-widest active:scale-95 transition-all text-xs"
              >
                Load More
              </button>
            </div>
          )}
          {filteredData.transactions.length === 0 && (
            <p style={{ color: '#9CA3AF' }} className="text-center py-4">No transactions found.</p>
          )}
        </div>
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
            <div className="mt-4 text-center">
              {resolvedSlipUrl && (
                <a
                  href={resolvedSlipUrl}
                  download={selectedSlip?.includes(':pdf:') || resolvedSlipUrl?.toLowerCase().includes('.pdf') ? 'transaction-slip.pdf' : 'transaction-slip.jpg'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
                  className="px-6 py-2 rounded-lg font-medium inline-block"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default GroupPersonHistoryPage;

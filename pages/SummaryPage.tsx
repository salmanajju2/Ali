import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ChevronRightIcon } from '../components/icons/ChevronRightIcon';

interface Summary {
  displayName: string;
  companyName: string;
  totalCredit: number;
  totalDebit: number;
  upiIn: number;
  upiOut: number;
  cashIn: number;
  cashOut: number;
  netBalance: number;
  transactionCount: number;
  lastTransactionDate: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

const SummaryPage: React.FC = () => {
  const { transactions, locations, user, userIdentityKeys } = useAppContext();
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const sortedLocations = useMemo(() => [...locations].sort(), [locations]);
  const activeLocation = selectedLocation ?? (sortedLocations[0] ?? null);

  const filteredSummaries = useMemo(() => {
    const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';

    const isVisible = (tx: any) => {
      if (isAdmin) return true;
      const rb = (tx.recordedBy || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const crb = rb.replace(/[^a-z0-9@.]/g, '');
      return userIdentityKeys.has(rb) || userIdentityKeys.has(crb);
    };


    const acc: Record<string, any> = {};

    transactions
      .filter(tx => tx.location === activeLocation && tx.company && tx.company !== 'NA')
      .filter(isVisible)
      .filter(tx => {
        if (!filterStartDate && !filterEndDate) return true;
        const d = new Date(tx.date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const txDateStr = `${yyyy}-${mm}-${dd}`;
        
        if (filterStartDate && txDateStr < filterStartDate) return false;
        if (filterEndDate && txDateStr > filterEndDate) return false;
        return true;
      })
      .filter(tx => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase().trim();
        const comp = (tx.company || '').toLowerCase();
        const person = (typeof tx.person === 'string' ? tx.person : '').toLowerCase();
        const amt = tx.amount.toString();
        const pm = (tx.paymentMethod || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        
        const d = new Date(tx.date);
        const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
        const dateIso = tx.date.split('T')[0];

        return comp.includes(s) || person.includes(s) || amt.includes(s) || pm.includes(s) || type.includes(s) || dateFormatted.includes(s) || dateIso.includes(s);
      })
      .forEach(tx => {
        let compName = tx.company!;
        if (compName === 'XPREES BEES') compName = 'MEESHO';

        const key = `${compName} ${tx.location}`;
        if (!acc[key]) acc[key] = {
          displayName: key, companyName: compName,
          totalCredit: 0, totalDebit: 0,
          upiIn: 0, upiOut: 0, cashIn: 0, cashOut: 0,
          transactionCount: 0, lastTransactionDate: tx.date,
        };
        if (new Date(tx.date) > new Date(acc[key].lastTransactionDate)) acc[key].lastTransactionDate = tx.date;

        if (tx.type === 'credit') {
          acc[key].totalCredit += tx.amount;
          if (tx.paymentMethod === 'upi') acc[key].upiIn += tx.amount;
          else acc[key].cashIn += tx.amount;
        } else {
          acc[key].totalDebit += tx.amount;
          if (tx.paymentMethod === 'upi') acc[key].upiOut += tx.amount;
          else acc[key].cashOut += tx.amount;
        }

        acc[key].transactionCount++;
      });

    return Object.values(acc)
      .map(s => ({ ...s, netBalance: s.totalCredit - s.totalDebit }))
      .filter(s => !s.companyName.toUpperCase().includes('INTERNAL TRANSFER'))
      .filter(s => !s.companyName.toUpperCase().includes('COMMISSION'))
      .sort((a, b) => new Date(b.lastTransactionDate).getTime() - new Date(a.lastTransactionDate).getTime());
  }, [transactions, activeLocation, searchTerm, filterStartDate, filterEndDate, user]);

  const matchingTransactions = useMemo(() => {
    if (!searchTerm) return [];
    
    const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
    const userEmail = user?.email?.toLowerCase() || '';
    const userName = user?.displayName?.toLowerCase() || '';

    const isVisible = (tx: any) => {
      if (isAdmin) return true;
      const txRecorder = (tx.recordedBy || '').toLowerCase();
      return (userEmail && txRecorder.includes(userEmail)) || 
             (userName && txRecorder.includes(userName)) ||
             (userEmail && userEmail.includes(txRecorder)) ||
             (userName && userName.includes(txRecorder));
    };

    return transactions
      .filter(tx => tx.location === activeLocation && tx.company && tx.company !== 'NA')
      .filter(isVisible)
      .filter(tx => {
        if (!filterStartDate && !filterEndDate) return true;
        const d = new Date(tx.date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const txDateStr = `${yyyy}-${mm}-${dd}`;
        
        if (filterStartDate && txDateStr < filterStartDate) return false;
        if (filterEndDate && txDateStr > filterEndDate) return false;
        return true;
      })
      .filter(tx => {
        const s = searchTerm.toLowerCase().trim();
        const comp = (tx.company || '').toLowerCase();
        const person = (typeof tx.person === 'string' ? tx.person : '').toLowerCase();
        const amt = tx.amount.toString();
        const pm = (tx.paymentMethod || '').toLowerCase();
        const type = (tx.type || '').toLowerCase();
        
        const d = new Date(tx.date);
        const dateFormatted = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toLowerCase();
        const dateIso = tx.date.split('T')[0];

        return comp.includes(s) || person.includes(s) || amt.includes(s) || pm.includes(s) || type.includes(s) || dateFormatted.includes(s) || dateIso.includes(s);
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 50); // limit to 50 to keep UI fast
  }, [transactions, activeLocation, searchTerm, filterStartDate, filterEndDate, user]);

  const totals = useMemo(() => {
    return filteredSummaries.reduce((s, r) => ({
      credit: s.credit + r.totalCredit,
      debit: s.debit + r.totalDebit,
      net: s.net + r.netBalance,
      upiIn: s.upiIn + r.upiIn,
      upiOut: s.upiOut + r.upiOut,
      cashIn: s.cashIn + r.cashIn,
      cashOut: s.cashOut + r.cashOut,
    }), { credit: 0, debit: 0, net: 0, upiIn: 0, upiOut: 0, cashIn: 0, cashOut: 0 });
  }, [filteredSummaries]);

  const getUrl = (companyName: string) => {
    const params = new URLSearchParams();
    if (activeLocation) params.set('location', activeLocation);
    if (searchTerm) params.set('search', searchTerm.trim());
    if (filterStartDate && filterStartDate === filterEndDate) {
      const [yyyy, mm, dd] = filterStartDate.split('-');
      params.set('year', yyyy);
      params.set('month', parseInt(mm, 10).toString());
      params.set('day', parseInt(dd, 10).toString());
      params.set('showAllDates', 'true');
    }
    return `/company/${encodeURIComponent(companyName)}?${params.toString()}`;
  };

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 pb-32 md:pb-10 space-y-5">

      {/* ── Header ── */}
      <div className="pt-5 pb-1 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight" style={{color:'#1E1B4B'}}>Summary</h1>
          <p className="text-[10px] font-black uppercase tracking-widest mt-0.5" style={{color:'#9CA3AF'}}>
            Company Balances · {activeLocation || 'All'}
          </p>
        </div>
        <Link
          to="/group/finance"
          className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all"
          style={{background:'#EEF2FF',border:'1px solid #C7D2FE',color:'#6366F1'}}
        >
          Finance Group
        </Link>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 sm:gap-3 flex-col sm:flex-row pb-2">
        <div className="relative flex-1">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search company, name, amount, date…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
            style={{background:'white',border:'1.5px solid #E0E7FF',color:'#1E1B4B',borderRadius:'1.5rem'}}
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <div className="relative">
            <input
              type="date"
              value={filterStartDate}
              onChange={e => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-3 rounded-[1.5rem] text-[13px] font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              style={{background:'white',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
            />
            {filterStartDate && (
               <button onClick={() => setFilterStartDate('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-rose-500 bg-white/50 rounded-full">
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            )}
          </div>
          <div className="flex items-center justify-center text-slate-400 text-xs font-black uppercase">to</div>
          <div className="relative">
            <input
              type="date"
              value={filterEndDate}
              onChange={e => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-3 rounded-[1.5rem] text-[13px] font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              style={{background:'white',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
            />
            {filterEndDate && (
               <button onClick={() => setFilterEndDate('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-rose-500 bg-white/50 rounded-full">
                 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Totals Hero ── */}
      <div className="relative overflow-hidden p-5" style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'2rem',boxShadow:'0 8px 32px rgba(99,102,241,0.08)'}}>
        <p className="relative text-[9px] font-black uppercase tracking-widest mb-4" style={{color:'#9CA3AF'}}>Location Summary</p>
        <div className="relative grid grid-cols-3 gap-1.5 sm:gap-2">
          {[
            { label: 'Total IN', value: totals.credit, color: 'text-emerald-600', upi: totals.upiIn, cash: totals.cashIn },
            { label: 'Total OUT', value: totals.debit, color: 'text-rose-600', upi: totals.upiOut, cash: totals.cashOut },
            { label: 'Net', value: totals.net, color: totals.net >= 0 ? 'text-indigo-600' : 'text-orange-600', upi: totals.upiIn - totals.upiOut, cash: totals.cashIn - totals.cashOut },
          ].map(({ label, value, color, upi, cash }) => (
            <div key={label} className="p-3 flex flex-col justify-between" style={{background:'#F5F7FF',border:'1px solid #E0E7FF',borderRadius:'1.5rem'}}>
              <div>
                <p className="text-[7px] sm:text-[8px] font-black uppercase tracking-widest mb-1" style={{color:'#9CA3AF'}}>{label}</p>
                <p className={`text-[12px] sm:text-[14px] md:text-xl font-black tabular-nums tracking-tighter ${color} truncate`}>
                  {fmt(value)}
                </p>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 flex flex-col gap-0.5">
                <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-gray-500 uppercase">
                  <span>UPI</span>
                  <span className={upi >= 0 ? 'text-gray-700' : 'text-red-500'}>{fmt(upi)}</span>
                </div>
                <div className="flex justify-between text-[8px] md:text-[9px] font-bold text-gray-500 uppercase">
                  <span>CASH</span>
                  <span className={cash >= 0 ? 'text-gray-700' : 'text-red-500'}>{fmt(cash)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Location tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sortedLocations.map(loc => {
          const active = loc === activeLocation;
          return (
            <button
              key={loc}
              onClick={() => setSelectedLocation(loc)}
              className="px-5 py-2.5 rounded-[1.5rem] text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 whitespace-nowrap shrink-0"
              style={active
                ? {background:'linear-gradient(135deg,#6366F1,#8B5CF6)',color:'white'}
                : {background:'white',border:'1px solid #E0E7FF',color:'#6B7280'}
              }
            >
              {loc}
            </button>
          );
        })}
      </div>


      {/* ── Company Cards ── */}
      <div className="space-y-3">
        {filteredSummaries.map(s => (
          <Link
            key={s.displayName}
            to={getUrl(s.companyName)}
            className="block hover:-translate-y-1 active:scale-[0.98] transition-all overflow-hidden"
            style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'2rem',boxShadow:'0 4px 16px rgba(99,102,241,0.06)'}}
          >
            <div className="p-6">
              {/* top row */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-black uppercase tracking-tight truncate leading-tight" style={{color:'#1E1B4B'}}>
                    {s.companyName}
                  </p>
                  <p className="text-[10px] font-bold mt-1 uppercase tracking-widest" style={{color:'#9CA3AF'}}>
                    {s.transactionCount} transactions · {new Date(s.lastTransactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <p className={`text-lg font-black tabular-nums tracking-tight leading-none ${s.netBalance >= 0 ? 'text-indigo-600' : 'text-rose-500'}`}>
                      {fmt(s.netBalance)}
                    </p>
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Net</p>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                </div>
              </div>

              {/* progress bar + in/out */}
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                  <span className="text-emerald-600">IN {fmt(s.totalCredit)}</span>
                  <span className="text-rose-500">OUT {fmt(s.totalDebit)}</span>
                </div>
                {/* balance bar */}
                {(s.totalCredit + s.totalDebit) > 0 && (
                  <div className="h-1.5 rounded-full overflow-hidden" style={{background:'#F0F4FF'}}>
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-indigo-500 transition-all duration-500"
                      style={{ width: `${Math.min(100, (s.totalCredit / (s.totalCredit + s.totalDebit)) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {searchTerm && matchingTransactions.length > 0 && (
        <div className="pt-2 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest mt-4 mb-2 pl-2" style={{color:'#9CA3AF'}}>Matching Transactions</p>
          {matchingTransactions.map(tx => (
            <Link
              key={tx.id}
              to={getUrl(tx.company!)}
              className="block p-4 hover:shadow-md transition-all active:scale-[0.98]"
              style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'1.5rem',boxShadow:'0 2px 8px rgba(99,102,241,0.05)'}}
            >
              <div className="flex justify-between items-center gap-3">
                <div className="flex-1 min-w-0">
                   <p className="font-black text-[14px] tracking-tight truncate leading-tight" style={{color:'#1E1B4B'}}>{typeof tx.person === 'string' && tx.person ? tx.person.toUpperCase() : 'UNKNOWN CUSTOMER'}</p>
                   <p className="text-[9px] font-bold mt-0.5 truncate uppercase tracking-widest" style={{color:'#9CA3AF'}}>{tx.company} · {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                </div>
                <div className="text-right flex-shrink-0">
                   <p className={`text-[15px] font-black tabular-nums tracking-tighter leading-none ${tx.type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                     {tx.type === 'credit' ? '+' : '-'}₹{tx.amount.toLocaleString('en-IN')}
                   </p>
                   <p className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-widest">{tx.paymentMethod === 'upi' ? 'UPI' : 'CASH'}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {filteredSummaries.length === 0 && (
        <div className="text-center py-20 rounded-3xl shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm font-black uppercase tracking-widest" style={{color:'#9CA3AF'}}>No companies found</p>
          <p className="text-xs mt-1" style={{color:'#9CA3AF'}}>{activeLocation}</p>
        </div>
      )}
    </div>
  );
};

export default SummaryPage;

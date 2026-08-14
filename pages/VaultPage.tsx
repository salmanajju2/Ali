
import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';
import { CalendarDaysIcon } from '../components/icons/CalendarDaysIcon';

const VaultPage: React.FC = () => {
  const { vault, transactions } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState<'total' | 'today' | 'activity'>('total');
  
  const [filterYear, setFilterYear] = useState(searchParams.get('year') || 'all');
  const [filterMonth, setFilterMonth] = useState(searchParams.get('month') || 'all');
  const [filterDay, setFilterDay] = useState(searchParams.get('day') || 'all');
  const [showAllDates, setShowAllDates] = useState(searchParams.get('showAllDates') === 'true');

  const cashTransactions = useMemo(() => 
    transactions.filter(tx => tx.paymentMethod === 'cash')
  , [transactions]);

  const { years, months, days } = useMemo(() => {
    const years = new Set<string>();
    const months = new Set<string>();
    const days = new Set<string>();
    cashTransactions.forEach(tx => {
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
        years: Array.from(years).sort((a,b) => parseInt(b) - parseInt(a)),
        months: Array.from(months).sort((a,b) => parseInt(a) - parseInt(b)),
        days: Array.from(days).sort((a,b) => parseInt(a) - parseInt(b)),
    };
  }, [cashTransactions, filterYear, filterMonth, showAllDates]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
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
    setSearchParams(params, { replace: true });
  }, [filterYear, filterMonth, filterDay, showAllDates, setSearchParams]);


  const filteredActivityVault = useMemo(() => {
    const activityVault: NoteCounts = {};
    DENOMINATIONS.forEach(d => activityVault[d] = 0);

    const filteredTransactions = cashTransactions.filter(tx => {
      const txDate = new Date(tx.date);
      if (!showAllDates) {
        const currentDate = new Date();
        return txDate.getFullYear() === currentDate.getFullYear() && 
               txDate.getMonth() === currentDate.getMonth() && 
               txDate.getDate() === currentDate.getDate();
      } else {
        if (filterYear !== 'all' && txDate.getFullYear().toString() !== filterYear) return false;
        if (filterMonth !== 'all' && (txDate.getMonth() + 1).toString() !== filterMonth) return false;
        if (filterDay !== 'all' && txDate.getDate().toString() !== filterDay) return false;
        return true;
      }
    });

    filteredTransactions.forEach(tx => {
      if (tx.breakdown && typeof tx.breakdown === 'object') {
        for (const denomStr in tx.breakdown) {
          const denom = parseInt(denomStr, 10);
          const count = tx.breakdown[denom] || 0;
          if (DENOMINATIONS.includes(denom)) {
            if (tx.type === 'credit') {
              activityVault[denom] = (activityVault[denom] || 0) + count;
            } else if (tx.type === 'debit') {
              activityVault[denom] = (activityVault[denom] || 0) - count;
            }
          }
        }
      }
    });
    return activityVault;
  }, [cashTransactions, showAllDates, filterYear, filterMonth, filterDay]);

  const data = useMemo(() => {
    if (view === 'total') {
      const totalValue = DENOMINATIONS.reduce((sum, denom) => sum + (vault[denom] || 0) * denom, 0);
      return {
        vaultToDisplay: vault,
        title: 'Cash Vault',
        totalTitle: 'Total Vault Value',
        totalValue,
      };
    }
    
    if (view === 'today') {
      const todayVault: NoteCounts = {};
      DENOMINATIONS.forEach(d => todayVault[d] = 0);
      const now = new Date();
      const todayY = now.getFullYear();
      const todayM = now.getMonth();
      const todayD = now.getDate();
      cashTransactions.forEach(tx => {
        const d = new Date(tx.date);
        if (!isNaN(d.getTime()) && d.getFullYear() === todayY && d.getMonth() === todayM && d.getDate() === todayD) {
          if (tx.breakdown && typeof tx.breakdown === 'object') {
            for (const denomStr in tx.breakdown) {
              const denom = parseInt(denomStr, 10);
              const count = tx.breakdown[denom] || 0;
              if (DENOMINATIONS.includes(denom)) {
                if (tx.type === 'credit') {
                  todayVault[denom] = (todayVault[denom] || 0) + count;
                } else if (tx.type === 'debit') {
                  todayVault[denom] = (todayVault[denom] || 0) - count;
                }
              }
            }
          }
        }
      });
      const totalValue = DENOMINATIONS.reduce((sum, denom) => sum + (todayVault[denom] || 0) * denom, 0);
      return {
        vaultToDisplay: todayVault,
        title: "Today's Total Notes",
        totalTitle: "Today's Net Cash Value",
        totalValue,
      };
    }

    // Activity View
    const totalValue = DENOMINATIONS.reduce((sum, denom) => sum + (filteredActivityVault[denom] || 0) * denom, 0);
    let title = "Vault Activity";
    if (showAllDates) {
        if(filterDay !== 'all' && filterMonth !== 'all' && filterYear !== 'all') {
            title = `Vault Activity for ${filterDay}/${filterMonth}/${filterYear}`
        } else if (filterMonth !== 'all' && filterYear !== 'all') {
            title = `Vault Activity for ${new Date(parseInt(filterYear), parseInt(filterMonth)-1).toLocaleString('default', { month: 'long' })} ${filterYear}`
        } else if (filterYear !== 'all') {
            title = `Vault Activity for ${filterYear}`
        } else {
            title = "All Vault Activity"
        }
    }

    return {
        vaultToDisplay: filteredActivityVault,
        title,
        totalTitle: "Net Change for Period",
        totalValue,
      };

  }, [view, vault, filteredActivityVault, showAllDates, filterYear, filterMonth, filterDay]);

  const { vaultToDisplay, title, totalTitle, totalValue } = data;

  const sortedDenominations = useMemo(() => {
    return [...DENOMINATIONS].sort((a, b) => b - a);
  }, []);

  return (
    <div className="max-w-xl mx-auto pb-48 md:pb-8 px-4">
      {/* Sticky Header */}
      <div
        className="flex flex-col gap-4 mb-6 sticky top-0 z-40 py-3 -mx-4 px-4"
        style={{background:'rgba(245,247,255,0.95)',backdropFilter:'blur(16px)',borderBottom:'1px solid #E0E7FF'}}
      >
        <h2 className="text-2xl font-black tracking-tight leading-tight" style={{color:'#1E1B4B'}}>{title}</h2>
        {/* Tab switcher */}
        <div className="flex p-1 rounded-xl w-full gap-1" style={{background:'#E0E7FF'}}>
          <button
            onClick={() => setView('total')}
            className={`flex-1 py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all`}
            style={view === 'total' ? {background:'white',color:'#6366F1',boxShadow:'0 2px 8px rgba(99,102,241,0.15)'} : {background:'transparent',color:'#9CA3AF'}}
          >
            Total Vault
          </button>
          <button
            onClick={() => setView('today')}
            className={`flex-1 py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all`}
            style={view === 'today' ? {background:'white',color:'#6366F1',boxShadow:'0 2px 8px rgba(99,102,241,0.15)'} : {background:'transparent',color:'#9CA3AF'}}
          >
            Today Notes
          </button>
          <button
            onClick={() => setView('activity')}
            className={`flex-1 py-2.5 rounded-lg text-[10px] md:text-xs font-black uppercase tracking-widest transition-all`}
            style={view === 'activity' ? {background:'white',color:'#6366F1',boxShadow:'0 2px 8px rgba(99,102,241,0.15)'} : {background:'transparent',color:'#9CA3AF'}}
          >
            Activity
          </button>
        </div>
      </div>

      {/* Date filters for activity view */}
      {view === 'activity' && (
        <div className="rounded-2xl shadow-sm p-4 mb-6 space-y-4" style={{background:'white',border:'1px solid #E0E7FF'}}>
          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowAllDates(!showAllDates)}
              className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
              style={showAllDates
                ? {background:'#F5F7FF',border:'1px solid #E0E7FF',color:'#6B7280'}
                : {background:'linear-gradient(135deg,#6366F1,#4F46E5)',color:'white'}
              }
            >
              {showAllDates ? 'Today Only' : 'Custom Date'}
            </button>
            {!showAllDates && (
              <span className="text-[10px] font-black uppercase tracking-widest" style={{color:'#6366F1'}}>
                {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
            )}
          </div>

          {showAllDates && (
            <div className="grid grid-cols-3 gap-2">
              <select value={filterYear} onChange={e => {setFilterYear(e.target.value); setFilterMonth('all'); setFilterDay('all');}} className="w-full py-2 px-2 rounded-xl text-[10px] font-black uppercase appearance-none text-center outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                <option value="all">Year</option>
                {years.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              <select value={filterMonth} onChange={e => {setFilterMonth(e.target.value); setFilterDay('all');}} className="w-full py-2 px-2 rounded-xl text-[10px] font-black uppercase appearance-none text-center outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                <option value="all">Month</option>
                {months.map(m=><option key={m} value={m}>{new Date(2000, parseInt(m) - 1).toLocaleString('default', { month: 'short' })}</option>)}
              </select>
              <select value={filterDay} onChange={e => setFilterDay(e.target.value)} className="w-full py-2 px-2 rounded-xl text-[10px] font-black uppercase appearance-none text-center outline-none" style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}>
                <option value="all">Day</option>
                {days.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Total Hero */}
      <div className="rounded-2xl shadow-xl p-6 mb-8 text-center" style={{background:'linear-gradient(135deg,#6366F1 0%,#4F46E5 100%)',boxShadow:'0 12px 40px rgba(99,102,241,0.35)'}}>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 leading-none" style={{color:'rgba(199,210,254,0.8)'}}>{totalTitle}</p>
        <h3 className={`text-4xl font-black tabular-nums tracking-tighter ${totalValue < 0 ? 'text-rose-300' : 'text-white'}`}>
          ₹ {totalValue.toLocaleString('en-IN')}
        </h3>
      </div>

      {/* Denominations */}
      <div className="rounded-2xl shadow-sm p-4 pb-6" style={{background:'white',border:'1px solid #E0E7FF'}}>
        <h3 className="text-xs font-black uppercase tracking-widest mb-6" style={{color:'#9CA3AF'}}>Denominations</h3>
        <div className="space-y-3">
          {sortedDenominations.map(denom => {
            const count = vaultToDisplay[denom] || 0;
            const value = count * denom;
            if (view === 'total' || count !== 0) {
              return (
                <div key={denom} className="flex items-center justify-between p-3 rounded-2xl border transition-all"
                  style={{
                    background: count === 0 && view === 'total' ? '#FAFBFF'
                              : count < 0 ? '#FFF1F2'
                              : '#F5F7FF',
                    border: count < 0 ? '1px solid #FECDD3' : '1px solid #E0E7FF',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-center justify-center min-w-[60px] py-1 rounded-xl shadow-sm" style={{background:'white',border:'1px solid #E0E7FF'}}>
                      <span className="text-xs font-black" style={{color:'#6366F1'}}>₹{denom}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${count < 0 ? 'text-rose-600' : ''}`} style={count >= 0 ? {color:'#9CA3AF'} : {}}>
                        {Math.abs(count)} {Math.abs(count) === 1 ? 'note' : 'notes'}
                      </span>
                      {count < 0 && view === 'total' && <span className="text-[8px] font-bold text-rose-400 uppercase leading-none">Shortage</span>}
                    </div>
                  </div>
                  <div className={`text-base font-black tabular-nums tracking-tight ${value < 0 ? 'text-rose-600' : ''}`}
                    style={value === 0 ? {color:'#9CA3AF'} : value > 0 ? {color:'#1E1B4B'} : {}}
                  >
                    {value < 0 ? '-' : ''}₹{Math.abs(value).toLocaleString('en-IN')}
                  </div>
                </div>
              );
            }
            return null;
          })}
          {totalValue === 0 && Object.values(vaultToDisplay).every(c => c === 0) && (
            <div className="text-center py-12">
              <div className="inline-flex p-4 rounded-full mb-3" style={{background:'#EEF2FF'}}>
                <CalendarDaysIcon className="h-8 w-8" style={{color:'#A5B4FC'} as any} />
              </div>
              <p className="text-sm font-bold" style={{color:'#9CA3AF'}}>
                {view === 'total' ? 'The vault is empty' : 'No activity for this period'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VaultPage;

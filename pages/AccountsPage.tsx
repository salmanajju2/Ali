import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { BANK_NAMES } from '../constants';
import { BankIcon } from '../components/icons/BankIcon';
import { ArrowPathIcon } from '../components/icons/ArrowPathIcon';
import { TrashIcon } from '../components/icons/TrashIcon';

/* ─── tiny helper ─────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);

/* ─── Commission Modal ────────────────────────────────── */
const CommissionModal: React.FC<{
  bank: string;
  onConfirm: (amount: number) => void;
  onClose: () => void;
  isLoading: boolean;
}> = ({ bank, onConfirm, onClose, isLoading }) => {
  const [value, setValue] = useState('');
  const amount = parseFloat(value);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div
        style={{background:'white',borderRadius:'2rem',boxShadow:'0 25px 60px rgba(99,102,241,0.2)',border:'1px solid #E0E7FF'}}
        className="w-full max-w-[320px] overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-6 text-center relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 left-0 w-full h-full bg-white/5 pointer-events-none" />
          <p className="relative text-[9px] font-black text-blue-200/60 uppercase tracking-[0.2em] mb-1">Add Commission</p>
          <h3 className="relative text-xl font-black text-white tracking-tight">{bank}</h3>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="relative group">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-slate-300 group-focus-within:text-blue-500 transition-colors">₹</span>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={value}
              onChange={e => setValue(e.target.value)}
              style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
              className="w-full pl-10 pr-4 py-4 rounded-xl text-2xl font-black focus:outline-none focus:ring-4 focus:ring-blue-500/10 transition-all tabular-nums text-center shadow-inner"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#6B7280'}}
              className="py-3.5 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => !isNaN(amount) && amount > 0 && onConfirm(amount)}
              disabled={isNaN(amount) || amount <= 0 || isLoading}
              className="py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-black text-[10px] uppercase tracking-[0.2em] disabled:opacity-40 active:scale-95 transition-all shadow-lg shadow-blue-500/25"
            >
              {isLoading ? 'Wait...' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Transfer Modal ───────────────────────────────────── */
const TransferModal: React.FC<{
  allBanks: string[];
  initialFrom?: string;
  initialTo?: string;
  initialService?: string;
  onConfirm: (from: string, to: string, amount: number, service: string) => void;
  onClose: () => void;
  isLoading: boolean;
}> = ({ allBanks, initialFrom, initialTo, initialService, onConfirm, onClose, isLoading }) => {
  const [fromBank, setFromBank] = useState(initialFrom || '');
  const [toBank, setToBank] = useState(initialTo || '');
  const [amount, setAmount] = useState('');
  const [service, setService] = useState(initialService || 'IMPS');

  const services = ['IMPS', 'NEFT', 'UPI', 'CASH', 'TOP UP', 'RETURN', 'COMMISSION'];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div style={{background:'white',borderRadius:'2rem',boxShadow:'0 25px 60px rgba(99,102,241,0.2)',border:'1px solid #E0E7FF'}} className="w-full max-w-[340px] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 px-6 py-6 text-center text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70 mb-1">Internal Transfer</p>
          <h3 className="text-xl font-black uppercase tracking-widest">Bank to Bank</h3>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {service !== 'COMMISSION' && service !== 'TOP UP' && service !== 'RETURN' ? (
              <>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">From</label>
                  <select
                    value={fromBank}
                    onChange={e => setFromBank(e.target.value)}
                    style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="">Source</option>
                    {allBanks.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">To</label>
                  <select
                    value={toBank}
                    onChange={e => setToBank(e.target.value)}
                    style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                    className="w-full px-3 py-2.5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all"
                  >
                    <option value="">Target</option>
                    {allBanks.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Select Bank for {service}</label>
                <select
                  value={toBank}
                  onChange={e => setToBank(e.target.value)}
                  style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                  className="w-full px-3 py-2.5 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 transition-all"
                >
                  <option value="">Choose Bank</option>
                  {allBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Service Type</label>
            <div className="flex flex-wrap gap-2">
              {services.map(s => (
                <button
                  key={s}
                  onClick={() => setService(s)}
                  style={service === s ? {background:'linear-gradient(135deg,#6366F1,#4F46E5)',color:'white'} : {background:'#F5F7FF',color:'#9CA3AF'}}
                  className="px-3 py-1.5 rounded-lg text-[9px] font-black tracking-widest transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
                className="w-full pl-8 pr-4 py-3 rounded-xl font-bold focus:outline-none focus:border-indigo-500 transition-all shadow-inner"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={onClose} style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#6B7280'}} className="py-3.5 rounded-xl font-black text-[10px] uppercase active:scale-95 transition-all">Cancel</button>
            <button
              onClick={() => {
                if (!toBank || !amount) return;
                onConfirm(fromBank, toBank, parseFloat(amount), service);
              }}
              disabled={(!toBank || !amount || isLoading) || (service !== 'COMMISSION' && service !== 'TOP UP' && service !== 'RETURN' && !fromBank)}
              className="py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-700 text-white font-black text-[10px] uppercase shadow-lg shadow-indigo-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              {isLoading ? 'Wait...' : (service === 'COMMISSION' || service === 'TOP UP' || service === 'RETURN') && !fromBank ? `Add ${service}` : 'Transfer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── Add Account Modal ────────────────────────────────── */
const AddAccountModal: React.FC<{
  onConfirm: (name: string, logo: string) => void;
  onClose: () => void;
}> = ({ onConfirm, onClose }) => {
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <div style={{background:'white',borderRadius:'2rem',boxShadow:'0 25px 60px rgba(99,102,241,0.2)',border:'1px solid #E0E7FF'}} className="w-full max-w-[320px] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-6 text-center text-white">
          <h3 className="text-xl font-black uppercase tracking-widest">Add Account</h3>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Bank Name</label>
            <input
              type="text"
              placeholder="e.g. HDFC, CANARA"
              value={name}
              onChange={e => setName(e.target.value.toUpperCase())}
              style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
              className="w-full px-4 py-3 rounded-xl font-bold focus:outline-none focus:border-blue-500 transition-all shadow-inner"
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Logo URL (Optional)</label>
            <input
              type="text"
              placeholder="https://..."
              value={logo}
              onChange={e => setLogo(e.target.value)}
              style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#1E1B4B'}}
              className="w-full px-4 py-3 rounded-xl font-bold focus:outline-none focus:border-blue-500 transition-all shadow-inner"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button onClick={onClose} style={{background:'#F5F7FF',border:'1.5px solid #E0E7FF',color:'#6B7280'}} className="py-3.5 rounded-xl font-black text-[10px] uppercase active:scale-95 transition-all">Cancel</button>
            <button
              onClick={() => name && onConfirm(name, logo)}
              disabled={!name}
              className="py-3.5 rounded-xl bg-blue-600 text-white font-black text-[10px] uppercase shadow-lg shadow-blue-500/25 active:scale-95 transition-all disabled:opacity-50"
            >
              Add Bank
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════ */
/*  MAIN PAGE                                             */
/* ══════════════════════════════════════════════════════ */
const AccountsPage: React.FC = () => {
  const { user, transactions, bankBalances, addTransaction, settleBankBalance, locations, allBankNames, allBankLogos, addBank, deleteBank, updateBank } = useAppContext();
  const navigate = useNavigate();

  const [transferModal, setTransferModal] = useState<{ from?: string; to?: string; service?: string } | null>(null);
  const [commModal, setCommModal]   = useState<string | null>(null);
  const [addAccountModal, setAddAccountModal] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isAddingComm, setIsAddingComm] = useState(false);
  const [commissionDate, setCommissionDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const currentUserName = user?.displayName || user?.email || 'Unknown User';
  const defaultLocation = locations[0] || 'NA';

  /* ── balance calculator ── */
  const getBankBalance = (bank: string): number => {
    if (bank === 'ALI ENTERPRISES') {
      const banksToShow = ['ALI ENTERPRISES', 'BOB', 'AXIS', 'PNB'];
      const masterTxs = transactions.filter(tx => {
        if (!(tx.bank && banksToShow.includes(tx.bank))) return false;
        if (tx.company === 'INTERNAL TRANSFER' && tx.bank !== 'ALI ENTERPRISES') return false;
        const p = (tx.person || '').toUpperCase();
        return p.includes('APB') || p.includes('ABP') || tx.company === 'INTERNAL TRANSFER';
      });
      return masterTxs.reduce((s, tx) => {
        const isDeposit = !tx.company || tx.company === 'NA';
        const isIn = tx.paymentMethod === 'upi'
          ? tx.type === 'credit'
          : isDeposit ? tx.type === 'debit' : tx.type === 'credit';
        return s + (isIn ? tx.amount : -tx.amount);
      }, 0);
    }
    if (bank === 'FINO') {
      return (bankBalances[bank] || 0)
        + ['BOB FINO', 'PNB FINO', 'SBI FINO', 'SB FINO'].reduce((s, b) => s + (bankBalances[b] || 0), 0);
    }
    return bankBalances[bank] || 0;
  };

  const visibleBanks = useMemo(() => {
    const banks = allBankNames.filter(
      b => !['OTHER', 'BOB', 'AXIS', 'PNB', 'BOB FINO', 'PNB FINO', 'SBI FINO', 'SB FINO'].includes(b),
    );

    const lastTxMap: Record<string, number> = {};
    banks.forEach(bank => {
      const lastTx = transactions.find(tx => tx.bank === bank);
      lastTxMap[bank] = lastTx ? new Date(lastTx.date).getTime() : 0;
    });

    return [...banks].sort((a, b) => {
      if (a === 'ALI ENTERPRISES') return -1;
      if (b === 'ALI ENTERPRISES') return 1;
      return (lastTxMap[b] || 0) - (lastTxMap[a] || 0);
    });
  }, [allBankNames, transactions]);

  const { grandTotal, positiveTotal, negativeTotal } = useMemo(() => {
    let pos = 0, neg = 0;
    visibleBanks.forEach(b => {
      const bal = getBankBalance(b);
      if (bal >= 0) pos += bal; else neg += bal;
    });
    return { grandTotal: pos + neg, positiveTotal: pos, negativeTotal: neg };
  }, [bankBalances, transactions, visibleBanks]);

  const totalCommission = useMemo(() => {
    return transactions
      .filter(tx => tx.company === 'COMMISSION')
      .filter(tx => {
        if (!commissionDate) return true;
        const d = new Date(tx.date);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}` === commissionDate;
      })
      .reduce((sum, tx) => sum + (tx.type === 'credit' ? tx.amount : -tx.amount), 0);
  }, [transactions, commissionDate]);

  /* ── transfer handler ── */
  const handleConfirmTransfer = async (from: string, to: string, amount: number, service: string) => {
    setIsSettling(true);
    try {
      if (!from) {
        // Single-sided entry (e.g. Commission income or direct Top Up)
        await addTransaction({
          type: (service === 'RETURN' ? 'debit' : 'credit'),
          paymentMethod: 'upi',
          amount,
          bank: to,
          company: service,
          person: service,
          notes: `${service} added to ${to}`,
          location: defaultLocation,
          recordedBy: currentUserName,
          date: new Date().toISOString(),
          breakdown: {},
        });
      } else {
        await settleBankBalance(from, to, amount, currentUserName, defaultLocation, service);
      }
      setTransferModal(null);
    } catch (error) {
      console.error('Transfer/Entry failed:', error);
      alert('Action failed. Please try again.');
    } finally {
      setIsSettling(false);
    }
  };

  /* ── commission handler ── */
  const handleConfirmComm = async (amount: number) => {
    if (!commModal) return;
    setIsAddingComm(true);
    try {
      await addTransaction({
        type: 'credit', paymentMethod: 'upi', amount,
        bank: commModal, company: 'COMMISSION', person: 'COMMISSION',
        notes: `Commission added for ${commModal}`,
        location: defaultLocation, recordedBy: currentUserName,
        date: new Date().toISOString(), breakdown: {},
      });
      setCommModal(null);
    } catch {
      alert('Failed to add commission.');
    } finally {
      setIsAddingComm(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-48 md:pb-10 space-y-5">

      {/* ── Header ── */}
      <div className="pt-5 pb-1 flex items-center justify-between">
        <div>
          <h1 style={{color:'#1E1B4B'}} className="text-2xl font-black tracking-tight">Accounts</h1>
          <p style={{color:'#9CA3AF'}} className="text-[10px] font-black uppercase tracking-widest mt-0.5">Live Bank Balances</p>
        </div>
        <button
          onClick={() => setAddAccountModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-tr from-blue-600 to-indigo-700 rounded-2xl shadow-lg shadow-blue-500/25 text-white active:scale-95 transition-all"
        >
          <span className="text-[10px] font-black uppercase tracking-widest">Add Account</span>
          <div className="p-1 bg-white/20 rounded-lg">
            <BankIcon className="h-4 w-4" />
          </div>
        </button>
      </div>

      {/* ── Grand Total Hero Card ── */}
      <div style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'2rem',boxShadow:'0 8px 32px rgba(99,102,241,0.10)'}} className="relative overflow-hidden p-7 mb-2">
        <div className="absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{background:'rgba(99,102,241,0.12)'}}></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none" style={{background:'rgba(139,92,246,0.10)'}}></div>
        
        <p className="relative text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Portfolio</p>
        <p className={`relative text-5xl font-black tabular-nums tracking-tighter ${grandTotal >= 0 ? '' : 'text-rose-500'}`} style={grandTotal >= 0 ? {color:'#1E1B4B'} : {}}>
          {fmt(grandTotal)}
        </p>

        <div className="relative mt-5 grid grid-cols-2 gap-3">
          <div style={{background:'#ECFDF5',border:'1px solid #A7F3D0'}} className="rounded-2xl px-4 py-3">
            <p className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1">Positive</p>
            <p className="text-lg font-black text-emerald-600 tabular-nums">{fmt(positiveTotal)}</p>
          </div>
          <div style={{background:'#FFF1F2',border:'1px solid #FECDD3'}} className="rounded-2xl px-4 py-3">
            <p className="text-[9px] font-black text-rose-600/70 uppercase tracking-widest mb-1">Negative</p>
            <p className="text-lg font-black text-rose-600 tabular-nums">{fmt(negativeTotal)}</p>
          </div>
        </div>

        <div style={{background:'#EEF2FF',border:'1px solid #C7D2FE'}} className="mt-3 rounded-2xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-[9px] font-black text-indigo-600/70 uppercase tracking-widest mb-1">Total Commission</p>
            <p className="text-lg font-black text-indigo-600 tabular-nums">{fmt(totalCommission)}</p>
          </div>
          <div className="relative">
            <input 
              type="date" 
              value={commissionDate} 
              onChange={(e) => setCommissionDate(e.target.value)}
              style={{background:'white',border:'1px solid #C7D2FE',color:'#4F46E5'}}
              className="px-3 py-1.5 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm cursor-pointer"
            />
            {commissionDate && (
              <button onClick={() => setCommissionDate('')} className="absolute -right-2 -top-2 p-1 bg-white text-gray-400 hover:text-rose-500 rounded-full shadow-sm border border-gray-100">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Services ── */}
      <div className="space-y-3">
        <p style={{color:'#9CA3AF'}} className="text-[10px] font-black uppercase tracking-widest pl-2">Quick Services</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { name: 'IMPS', company: 'IMPS', icon: '⚡', color: 'from-amber-400 to-orange-500' },
            { name: 'NEFT', company: 'NEFT', icon: '🏛️', color: 'from-blue-400 to-indigo-500' },
            { name: 'UPI', company: 'UPI', icon: '📱', color: 'from-indigo-400 to-blue-500' },
            { name: 'Comm.', company: 'COMMISSION', icon: '💰', color: 'from-purple-400 to-pink-500' },
            { name: 'Top Up', company: 'TOP UP', icon: '🔋', color: 'from-emerald-400 to-teal-500' },
            { name: 'Return', company: 'RETURN M-CASH', icon: '🔄', color: 'from-rose-400 to-pink-500' },
          ].map(s => (
            <button
              key={s.name}
              onClick={() => setTransferModal({ service: s.name })}
              style={{background:'white',border:'1px solid #E0E7FF',borderRadius:'1.5rem',boxShadow:'0 2px 8px rgba(99,102,241,0.06)'}}
              className="flex flex-col items-center gap-2 group active:scale-95 transition-all p-3 hover:shadow-md"
            >
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${s.color} flex items-center justify-center text-lg shadow-lg group-hover:shadow-xl transition-all`}>
                {s.icon}
              </div>
              <span style={{color:'#6B7280'}} className="text-[8px] font-black uppercase tracking-[0.15em] truncate w-full text-center">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Bank Cards ── */}
      <div className="space-y-3">
        {visibleBanks.map(bank => {
          const balance = getBankBalance(bank);
          const isSpicemoney = bank === 'SPICEMONEY QR';
          const isSettlable = bank !== 'ALI ENTERPRISES' && bank !== 'FINO' && !isSpicemoney;
          const hasComm = ['SPICEMONEY QR', 'FINO', 'ALI ENTERPRISES', '790', 'SACHIN'].includes(bank);
          const hasFino = ['A K', 'S A', 'M A', 'PHONEPE QR', 'GPAY QR'].includes(bank);
          const isPositive = balance >= 0;
          const isMaster = bank === 'ALI ENTERPRISES';

          return (
            <div
              key={bank}
              style={isMaster ? {} : {background:'white',border:'1px solid #E0E7FF',borderRadius:'2rem',boxShadow:'0 4px 16px rgba(99,102,241,0.06)'}}
            className={`relative overflow-hidden border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl
                ${isMaster
                  ? 'bg-gradient-to-br from-indigo-500 via-purple-500 to-fuchsia-500 border-indigo-400/50 shadow-[0_8px_30px_rgb(99,102,241,0.3)] rounded-[2rem]'
                  : ''
                }`}
            >
              {isMaster && (
                <div className="absolute -top-4 -right-4 h-24 w-24 rounded-full bg-white/10 blur-2xl pointer-events-none" />
              )}

              {/* ── top row ── */}
              <Link to={`/accounts/${bank}`} className="flex items-center gap-4 p-5 active:scale-[0.99] transition-transform">
                {/* Name + balance */}
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1.5 ${isMaster ? 'text-indigo-100' : ''}`} style={isMaster ? {} : {color:'#9CA3AF'}}>
                    {isMaster ? 'Master Account' : bank === 'FINO' ? 'Fino Group' : 'Bank Account'}
                  </p>
                  <p className={`text-lg font-black uppercase tracking-tight truncate ${isMaster ? 'text-white' : ''}`} style={isMaster ? {} : {color:'#1E1B4B'}}>
                    {bank}
                  </p>
                </div>

                {/* Balance */}
                <div className="text-right flex-shrink-0 flex items-center gap-4">
                  <div>
                    <p
                      className={`text-xl font-black tabular-nums tracking-tight leading-none ${isMaster ? 'text-white' : isPositive ? '' : 'text-rose-500'}`}
                      style={(!isMaster && isPositive) ? {color:'#6366F1'} : {}}
                    >
                      {fmt(balance)}
                    </p>
                    <p
                      className={`text-[9px] font-black uppercase tracking-widest mt-0.5 ${isMaster ? 'text-blue-200' : ''}`}
                      style={!isMaster ? (isPositive ? {color:'#059669'} : {color:'#E11D48'}) : {}}
                    >
                      {isPositive ? '▲ Positive' : '▼ Negative'}
                    </p>
                  </div>

                  {/* Edit/Delete for custom banks */}
                  {!BANK_NAMES.includes(bank) && (
                    <div className="flex flex-col gap-2 border-l border-slate-100 pl-3 ml-1">
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newName = prompt('Enter new name for bank:', bank);
                          if (newName && newName !== bank) {
                            updateBank(bank, newName);
                          }
                        }}
                        className="p-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (window.confirm(`Are you sure you want to delete ${bank}?`)) {
                            deleteBank(bank);
                          }
                        }}
                        className="p-1.5 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </Link>


            </div>
          );
        })}
      </div>

      {/* Modals */}
      {transferModal && (
        <TransferModal
          allBanks={visibleBanks}
          initialFrom={transferModal.from}
          initialTo={transferModal.to}
          initialService={transferModal.service}
          onConfirm={handleConfirmTransfer}
          onClose={() => setTransferModal(null)}
          isLoading={isSettling}
        />
      )}

      {commModal && (
        <CommissionModal
          bank={commModal}
          onConfirm={handleConfirmComm}
          onClose={() => setCommModal(null)}
          isLoading={isAddingComm}
        />
      )}

      {addAccountModal && (
        <AddAccountModal
          onConfirm={async (name, logo) => {
            await addBank(name, logo);
            setAddAccountModal(false);
          }}
          onClose={() => setAddAccountModal(false)}
        />
      )}
    </div>
  );
};

export default AccountsPage;

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuth, User } from '../context/AuthContext';
import { UserIcon } from '../components/icons/UserIcon';
import { TrendingUpIcon } from '../components/icons/TrendingUpIcon';
import { TrendingDownIcon } from '../components/icons/TrendingDownIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { WalletIcon } from '../components/icons/WalletIcon';
import { ChevronRightIcon } from '../components/icons/ChevronRightIcon';
import { BankIcon } from '../components/icons/BankIcon';
import { d1Database } from '../services/d1Database';

const UserProfilePage: React.FC = () => {
  const { user, transactions, totalSystemCount, clearLocalDB, manualSync, syncStatus } = useAppContext();
  const navigate = useNavigate();

  const currentUserName = user?.displayName || user?.email || 'Unknown User';

  const [isRepairing, setIsRepairing] = useState(false);
  const [userStats, setUserStats] = useState({
    totalTransactions: 0,
    totalCredits: 0,
    totalDebits: 0,
    netBalance: 0,
    firstTransactionDate: '',
    companiesWorkedWith: 0,
    locationsWorkedIn: 0,
  });

  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleRepairDatabase = async () => {
    if (!window.confirm('⚠️ WARNING: This will rebuild your database to fix ID issues. Your data will be preserved. Refreshing is required after.')) {
      return;
    }

    setIsRepairing(true);
    try {
      const result = await d1Database.repairDatabase();
      if (result.success) {
        // IMPORTANT: Clear local cache to force a fresh download of the clean data
        await clearLocalDB();
        alert('✅ Database repaired and local cache cleared! App will now refresh to fetch fresh data.');
        window.location.reload();
      } else {
        alert(`❌ Repair failed: ${result.error || result.message}`);
      }
    } catch (error: any) {
      alert(`❌ Repair failed: ${error.message}`);
    } finally {
      setIsRepairing(false);
    }
  };

  const handleForceFullSync = async () => {
    try {
      await manualSync(true);
      alert('✅ Database Cache refreshed successfully with fresh server data!');
    } catch (error: any) {
      alert(`❌ Sync failed: ${error.message}`);
    }
  };

  // Current user ki identity keys — sirf apni transactions count karne ke liye
  const getUserIdentityKeys = (u: User | null): Set<string> => {
    const normalize = (v?: string | null) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const compact = (v?: string | null) => normalize(v).replace(/[^a-z0-9@.]/g, '');
    const keys = new Set<string>();
    [u?.displayName, u?.email, u?.email?.split('@')[0]].forEach(k => {
      if (normalize(k)) keys.add(normalize(k));
      if (compact(k)) keys.add(compact(k));
    });
    return keys;
  };

  useEffect(() => {
    if (transactions.length > 0) {
      // Sirf current user ki apni transactions — dusre users ki bank/UPI transactions nahi
      const normalize = (v?: string | null) => (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const compact = (v?: string | null) => normalize(v).replace(/[^a-z0-9@.]/g, '');
      const userKeys = getUserIdentityKeys(user);

      const myTransactions = user?.isAdmin
        ? transactions  // Admin sab dekhe
        : transactions.filter(tx => {
            const rb = normalize(tx.recordedBy);
            const crb = compact(tx.recordedBy);
            return userKeys.has(rb) || userKeys.has(crb);
          });

      // Business transactions filter (NA, Internal Transfer, Commission hata do)
      const businessTx = myTransactions.filter(tx => {
        const company = (tx.company || '').toUpperCase();
        return company !== 'NA' && company !== '' && !company.includes('INTERNAL TRANSFER') && !company.includes('COMMISSION');
      });

      const credits = businessTx.filter(tx => tx.type === 'credit');
      const debits = businessTx.filter(tx => tx.type === 'debit');

      const totalCredits = credits.reduce((sum, tx) => sum + tx.amount, 0);
      const totalDebits = debits.reduce((sum, tx) => sum + tx.amount, 0);

      const uniqueCompanies = new Set(businessTx.map(tx => tx.company).filter(c => c));
      const uniqueLocations = new Set(businessTx.map(tx => tx.location).filter(l => l));

      const sortedTransactions = [...businessTx].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const netBalance = totalCredits - totalDebits;

      setUserStats({
        totalTransactions: myTransactions.length, // Sirf apne records
        totalCredits,
        totalDebits,
        netBalance,
        firstTransactionDate: sortedTransactions[0]?.date || '',
        companiesWorkedWith: uniqueCompanies.size,
        locationsWorkedIn: uniqueLocations.size,
      });
    } else {
      setUserStats({
        totalTransactions: 0,
        totalCredits: 0,
        totalDebits: 0,
        netBalance: 0,
        firstTransactionDate: '',
        companiesWorkedWith: 0,
        locationsWorkedIn: 0,
      });
    }
  }, [transactions, user]);

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  // Smart short format: 1,00,000 → ₹1.00 L | 1,00,00,000 → ₹1.00 Cr
  const formatCurrencyShort = (amount: number) => {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '-' : '';
    if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)} L`;
    return `${sign}₹${abs.toLocaleString('en-IN')}`;
  };

  return (
    <div className="max-w-2xl mx-auto pb-32 md:pb-10 px-3 sm:px-4 space-y-5">
      <div className="pt-5 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight leading-none" style={{color:'#1E1B4B'}}>Your Profile</h2>
          <p className="text-[10px] font-black uppercase tracking-widest mt-1" style={{color:'#9CA3AF'}}>Ali Enterprises • Business Insights</p>
        </div>
        <button
          onClick={handleLogout}
          className="p-3 rounded-2xl active:scale-95 transition-all shadow-sm border"
          style={{background:'#FFF1F2',border:'1px solid #FECDD3',color:'#E11D48'}}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
        </button>
      </div>

      {/* User Info Card */}
      <div className="rounded-3xl shadow-sm p-6" style={{background:'white',border:'1px solid #E0E7FF',boxShadow:'0 4px 16px rgba(99,102,241,0.08)'}}>
        <div className="flex items-center gap-5">
          <div className="p-5 rounded-2xl shadow-xl" style={{background:'linear-gradient(135deg,#6366F1 0%,#8B5CF6 100%)',boxShadow:'0 8px 24px rgba(99,102,241,0.4)'}}>
            <UserIcon className="h-10 w-10 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-black leading-tight uppercase tracking-tight" style={{color:'#1E1B4B'}}>{currentUserName}</h3>
            <p className="text-xs font-bold truncate max-w-[200px] mt-0.5" style={{color:'#9CA3AF'}}>{user?.email || 'No email available'}</p>
            <div className="flex items-center gap-2 mt-2">
              <div className="px-2 py-0.5 rounded-lg" style={{background:'#EEF2FF'}}>
                <span className="text-[9px] font-black uppercase tracking-widest tabular-nums italic" style={{color:'#6366F1'}}>EST. {formatDate(userStats.firstTransactionDate)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Snapshot Card */}
      <div className="rounded-3xl p-6 shadow-sm" style={{background:'white',border:'1px solid #E0E7FF',boxShadow:'0 4px 16px rgba(99,102,241,0.08)'}}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest" style={{color:'#9CA3AF'}}>Performance Summary</h3>
          <div className="px-2 py-1 rounded-lg flex items-center gap-1.5 border" style={{background:'#EEF2FF',border:'1px solid #C7D2FE'}}>
            <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{background:'#6366F1'}}></span>
            <span className="text-[10px] font-black uppercase tabular-nums" style={{color:'#6366F1'}}>{userStats.totalTransactions} TOTAL RECORDS</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mb-5">
          {/* Credit Card */}
          <div className="p-4 rounded-2xl border" style={{background:'#ECFDF5',border:'1px solid #A7F3D0'}}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUpIcon className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Business Credit</p>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-black tabular-nums leading-none tracking-tight text-emerald-600">{formatCurrencyShort(userStats.totalCredits)}</p>
              <p className="text-[10px] font-bold text-emerald-400 tabular-nums">{formatCurrency(userStats.totalCredits)}</p>
            </div>
          </div>
          {/* Debit Card */}
          <div className="p-4 rounded-2xl border" style={{background:'#FFF1F2',border:'1px solid #FECDD3'}}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingDownIcon className="h-4 w-4 text-rose-600" />
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Business Debit</p>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-black tabular-nums leading-none tracking-tight text-rose-600">{formatCurrencyShort(userStats.totalDebits)}</p>
              <p className="text-[10px] font-bold text-rose-300 tabular-nums">{formatCurrency(userStats.totalDebits)}</p>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-3xl border relative overflow-hidden group" style={{background:'linear-gradient(135deg,#EEF2FF 0%,#EDE9FE 100%)',border:'1px solid #C7D2FE'}}>
          <div className="absolute top-0 right-0 p-10 blur-2xl rounded-full -mr-10 -mt-10" style={{background:'rgba(99,102,241,0.15)'}}></div>
          <div className="flex justify-between items-center relative z-10">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{color:'#818CF8'}}>Business Net Flow</p>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p className={`text-3xl font-black tabular-nums tracking-tighter ${userStats.netBalance >= 0 ? '' : 'text-rose-600'}`} style={userStats.netBalance >= 0 ? {color:'#1E1B4B'} : {}}>
                  {formatCurrencyShort(userStats.netBalance)}
                </p>
                <p className="text-[10px] font-bold tabular-nums" style={{color:'#818CF8'}}>{formatCurrency(userStats.netBalance)}</p>
              </div>
            </div>
            <div className="p-4 rounded-2xl hidden sm:block" style={{background:'rgba(99,102,241,0.1)'}}>
              <WalletIcon className="h-8 w-8" style={{color:'#6366F1'} as any} />
            </div>
          </div>
        </div>
      </div>

      {/* Bank Accounts Navigation Button */}
      <button
        onClick={() => navigate('/accounts')}
        className="w-full flex items-center justify-between rounded-3xl shadow-sm p-5 active:scale-[0.98] transition-all group"
        style={{background:'white',border:'1px solid #E0E7FF',boxShadow:'0 2px 8px rgba(99,102,241,0.06)'}}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl transition-colors" style={{background:'#EEF2FF'}}>
            <BankIcon className="h-6 w-6" style={{color:'#6366F1'} as any} />
          </div>
          <div className="text-left">
            <p className="font-black text-sm uppercase tracking-widest leading-none" style={{color:'#1E1B4B'}}>Bank Accounts</p>
            <p className="text-[10px] font-bold mt-1.5 uppercase tracking-tight" style={{color:'#9CA3AF'}}>View &amp; Manage Bank &amp; UPI Accounts</p>
          </div>
        </div>
        <ChevronRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-transform" style={{color:'#C7D2FE'} as any} />
      </button>

      {/* Navigation Button */}
      <button
        onClick={() => navigate('/udhar')}
        className="w-full flex items-center justify-between rounded-3xl shadow-sm p-5 active:scale-[0.98] transition-all group"
        style={{background:'white',border:'1px solid #E0E7FF',boxShadow:'0 2px 8px rgba(99,102,241,0.06)'}}
      >
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl transition-colors" style={{background:'#EEF2FF'}}>
            <StarIcon className="h-6 w-6" style={{color:'#6366F1'} as any} />
          </div>
          <div className="text-left">
            <p className="font-black text-sm uppercase tracking-widest leading-none" style={{color:'#1E1B4B'}}>Data Management</p>
            <p className="text-[10px] font-bold mt-1.5 uppercase tracking-tight" style={{color:'#9CA3AF'}}>Manage Customers, Companies &amp; Locations</p>
          </div>
        </div>
        <ChevronRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-transform" style={{color:'#C7D2FE'} as any} />
      </button>

      {/* Business Activity Summary */}
      <div className="rounded-3xl shadow-sm p-6" style={{background:'white',border:'1px solid #E0E7FF'}}>
        <h4 className="text-[10px] font-black uppercase tracking-widest mb-4" style={{color:'#9CA3AF'}}>Business Snapshot</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl border" style={{background:'#F5F7FF',border:'1px solid #E0E7FF'}}>
            <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{color:'#9CA3AF'}}>Partner Companies</p>
            <p className="text-2xl font-black tabular-nums" style={{color:'#1E1B4B'}}>{userStats.companiesWorkedWith}</p>
          </div>
          <div className="p-4 rounded-2xl border" style={{background:'#F5F7FF',border:'1px solid #E0E7FF'}}>
            <p className="text-[8px] font-black uppercase tracking-widest mb-1" style={{color:'#9CA3AF'}}>Active Locations</p>
            <p className="text-2xl font-black tabular-nums" style={{color:'#1E1B4B'}}>{userStats.locationsWorkedIn}</p>
          </div>
        </div>
      </div>

      {/* Repair Database Section */}
      <div className="rounded-3xl shadow-sm p-6" style={{background:'white',border:'1px solid #E0E7FF'}}>
        <h4 className="text-[10px] font-black uppercase tracking-widest mb-4" style={{color:'#9CA3AF'}}>Advanced Settings</h4>
        <div className="space-y-3">
          <button
            onClick={handleRepairDatabase}
            disabled={isRepairing}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            style={{background:'#FFFBEB',border:'1px solid #FDE68A',color:'#D97706'}}
          >
            {isRepairing ? (
              <>
                <span className="h-3 w-3 border-2 border-t-transparent rounded-full animate-spin" style={{borderColor:'#D97706'}}></span>
                Repairing Schema...
              </>
            ) : (
              'Repair Database IDs'
            )}
          </button>

          <button
            onClick={handleForceFullSync}
            disabled={syncStatus === 'syncing'}
            className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl border active:scale-95 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            style={{background:'#EFF6FF',border:'1px solid #BFDBFE',color:'#2563EB'}}
          >
            {syncStatus === 'syncing' ? (
              <>
                <span className="h-3 w-3 border-2 border-t-transparent rounded-full animate-spin" style={{borderColor:'#2563EB'}}></span>
                Syncing All Data...
              </>
            ) : (
              'Force Full Sync (Refresh Cache)'
            )}
          </button>
        </div>
        <p className="text-[9px] font-bold text-center mt-3 uppercase tracking-tight leading-relaxed" style={{color:'#9CA3AF'}}>
          Use "Force Full Sync" if you directly edited the database and need to update changed records.
        </p>
      </div>
    </div>
  );
};

export default UserProfilePage;

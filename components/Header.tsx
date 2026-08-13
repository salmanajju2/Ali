import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { HomeIcon }     from './icons/HomeIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { BankIcon }     from './icons/BankIcon';
import { UserIcon }     from './icons/UserIcon';

const navItems = [
  { label: 'Transaction', path: '/',        icon: HomeIcon     },
  { label: 'History',     path: '/history', icon: BookOpenIcon },
  { label: 'Summary',     path: '/summary', icon: ChartBarIcon },
  { label: 'Profile',     path: '/profile', icon: UserIcon     },
];

const Header: React.FC = () => {
  const { socketConnected, syncStatus, manualSync, reconnectSocket } = useAppContext();
  const { logout, currentUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch (e) { console.error('Logout failed', e); }
  };

  return (
    <header className="glass sticky top-0 z-40 no-print">
      <div className="max-w-7xl mx-auto px-5 sm:px-7 flex items-center h-[4.5rem] gap-7">

        {/* Logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="w-10 h-10 rounded-[1rem] flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #312E81 0%, #4F46E5 58%, #7C3AED 100%)', boxShadow: '0 9px 20px rgba(67,56,202,0.28)' }}>
            <span className="text-white font-black text-[11px] tracking-tighter">AE</span>
          </div>
          <div className="hidden sm:block">
            <span
              className="text-[13px] font-black uppercase tracking-widest leading-none block"
              style={{ color: '#1E1B4B' }}
            >
              Ali Enterprises
            </span>
            <button
              onClick={() => reconnectSocket()}
              className="flex items-center gap-1.5 mt-0.5 px-1.5 py-0.5 rounded-lg transition-colors group"
              style={{ background: 'transparent' }}
              title="Click to reconnect"
            >
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  socketConnected
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-400 animate-bounce'
                }`}
                style={{
                  boxShadow: socketConnected
                    ? '0 0 8px rgba(16,185,129,0.6)'
                    : '0 0 8px rgba(244,63,94,0.6)',
                }}
              />
              <span
                className={`text-[8px] font-black uppercase tracking-widest ${
                  socketConnected ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {socketConnected ? 'Live' : 'Offline'}
              </span>
            </button>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1 flex-1">
          {navItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `desktop-nav-link flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-200
                 ${isActive
                   ? 'is-active text-white shadow-lg'
                   : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/70'
                 }`
              }
              style={({ isActive }) => isActive ? {
                background: 'linear-gradient(135deg, #4338CA 0%, #4F46E5 100%)',
                boxShadow: '0 8px 18px rgba(79,70,229,0.26)',
              } : { background: 'transparent' }}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden lg:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 flex-shrink-0">

          {/* Sync button */}
            <button
              onClick={() => manualSync()}
              disabled={syncStatus === 'syncing'}
              className="p-2.5 rounded-xl transition-all active:scale-90 border border-slate-200 bg-white/70 text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
              style={{ boxShadow: '0 2px 8px rgba(99,102,241,0.08)' }}
            >
            <svg
              className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* User pill */}
          <div className="flex items-center gap-2.5 pl-3" style={{ borderLeft: '1px solid var(--border)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)', boxShadow: '0 3px 10px rgba(99,102,241,0.35)' }}>
              {(currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="hidden xl:block">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block leading-none mb-0.5">
                Welcome
              </span>
              <span className="text-[11px] font-black truncate block leading-none" style={{ color: '#1E1B4B' }}>
                {currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl transition-all active:scale-90 hover:bg-rose-50"
              style={{ color: '#9CA3AF' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#E11D48';
                (e.currentTarget as HTMLButtonElement).style.background = '#FFF1F2';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;

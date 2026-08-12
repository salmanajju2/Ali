import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeIcon } from './icons/HomeIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { BankIcon } from './icons/BankIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { UserIcon } from './icons/UserIcon';

const navItems = [
  { name: 'Home',     path: '/',        icon: HomeIcon     },
  { name: 'History',  path: '/history', icon: BookOpenIcon },
  { name: 'Summary',  path: '/summary', icon: ChartBarIcon },
  { name: 'Profile',  path: '/profile', icon: UserIcon     },
];


const BottomNavigation: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <nav className="fixed bottom-7 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md z-50 no-print safe-area-pb">
      <div className="glass rounded-[2rem] px-3 py-2">
        <div className="flex justify-around items-center">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                className="flex flex-col items-center gap-1 flex-1 py-1 px-1 rounded-2xl transition-all duration-300 active:scale-90"
              >
                {/* Icon container */}
                <div className={`flex items-center justify-center w-12 h-8 rounded-[1.25rem] transition-all duration-300 ${isActive ? 'bg-gradient-to-br from-brand-500 to-brand-600 shadow-brand-md' : ''}`}>
                  <Icon
                    className="w-5 h-5 transition-all duration-300"
                    style={{
                      color: isActive ? '#ffffff' : '#9CA3AF',
                      transform: isActive ? 'scale(1.1)' : 'scale(1)',
                    }}
                  />
                </div>

                {/* Active label */}
                {isActive && (
                  <span
                    className="text-[8px] font-black uppercase tracking-widest"
                    style={{ color: '#6366F1' }}
                  >
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;

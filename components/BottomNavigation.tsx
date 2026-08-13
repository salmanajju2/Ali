import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { HomeIcon } from './icons/HomeIcon';
import { ChartBarIcon } from './icons/ChartBarIcon';
import { BookOpenIcon } from './icons/BookOpenIcon';
import { UserIcon } from './icons/UserIcon';

const navItems = [
  { name: 'Home', path: '/', icon: HomeIcon },
  { name: 'History', path: '/history', icon: BookOpenIcon },
  { name: 'Summary', path: '/summary', icon: ChartBarIcon },
  { name: 'Profile', path: '/profile', icon: UserIcon },
];

const BottomNavigation: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <nav
      className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-1.25rem)] max-w-md -translate-x-1/2 no-print safe-area-pb"
      aria-label="Primary navigation"
    >
      <div className="mobile-nav-shell rounded-[1.65rem] px-2 py-2 backdrop-blur-xl">
        <div className="flex items-center justify-around gap-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.path;

            return (
              <Link
                key={item.name}
                to={item.path}
                data-active={isActive ? 'true' : 'false'}
                aria-current={isActive ? 'page' : undefined}
                className="mobile-nav-item flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 transition-all duration-200 active:scale-95"
              >
                <span className="mobile-nav-icon grid h-9 w-11 place-items-center rounded-2xl text-slate-400 transition-all duration-200">
                  <Icon className="h-[1.1rem] w-[1.1rem]" />
                </span>
                <span className="mobile-nav-label truncate">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNavigation;

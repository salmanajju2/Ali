import React, { useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const navPaths = ['/', '/history', '/summary', '/profile'];

export const SwipeGestureHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 60; // Minimum swipe distance in px

    if (Math.abs(diff) > threshold) {
      const currentIndex = navPaths.indexOf(pathname);
      if (currentIndex !== -1) {
        if (diff > 0 && currentIndex < navPaths.length - 1) {
          // Swipe Left -> Next Page
          navigate(navPaths[currentIndex + 1]);
        } else if (diff < 0 && currentIndex > 0) {
          // Swipe Right -> Previous Page
          navigate(navPaths[currentIndex - 1]);
        }
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="flex-1 flex flex-col w-full"
    >
      {children}
    </div>
  );
};

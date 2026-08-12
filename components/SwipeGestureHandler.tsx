import React, { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const navPaths = ['/', '/history', '/summary', '/profile'];
const MIN_HORIZONTAL_DISTANCE = 96;
const MAX_VERTICAL_DISTANCE = 44;
const MAX_GESTURE_DURATION_MS = 650;

/**
 * Switches only between the four primary screens after a deliberate horizontal swipe.
 * Gestures that begin on buttons, links, inputs, forms, or scrollable content are ignored
 * so normal taps, vertical scrolls, and company-card navigation are never intercepted.
 */
export const SwipeGestureHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const gesture = useRef({ x: 0, y: 0, startedAt: 0, eligible: false });

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('a, button, input, textarea, select, label, [role="button"], [data-disable-page-swipe]'));
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      startedAt: Date.now(),
      eligible: !isInteractiveTarget(event.target),
    };
  };

  const handleTouchEnd = (event: React.TouchEvent) => {
    const touch = event.changedTouches[0];
    const { x, y, startedAt, eligible } = gesture.current;
    gesture.current.eligible = false;
    if (!touch || !eligible) return;

    const horizontalDistance = touch.clientX - x;
    const verticalDistance = touch.clientY - y;
    const duration = Date.now() - startedAt;
    if (
      Math.abs(horizontalDistance) < MIN_HORIZONTAL_DISTANCE ||
      Math.abs(verticalDistance) > MAX_VERTICAL_DISTANCE ||
      duration > MAX_GESTURE_DURATION_MS
    ) {
      return;
    }

    const currentIndex = navPaths.indexOf(pathname);
    if (currentIndex === -1) return;

    const nextIndex = horizontalDistance < 0 ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < navPaths.length) {
      navigate(navPaths[nextIndex]);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="flex-1 flex flex-col w-full"
    >
      {children}
    </div>
  );
};

import React from 'react';

export const RupeeIcon: React.FC<{className?: string}> = ({ className = "h-5 w-5" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h8m-8 4h8m-1 4H9.5a2.5 2.5 0 1 1 0-5H17" />
  </svg>
);

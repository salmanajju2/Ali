import React from 'react';

export const PrinterIcon: React.FC<{className?: string}> = ({ className = "h-5 w-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
        <path fill="#90A4AE" d="M19,8H5C3.34,8,2,9.34,2,11v6h4v4h12v-4h4v-6C22,9.34,20.66,8,19,8z M17,19H7v-5h10V19z M19,12c-0.55,0-1-0.45-1-1 s0.45-1,1-1s1,0.45,1,1S19.55,12,19,12z"/>
        <rect fill="#42A5F5" width="12" height="5" x="6" y="2"/>
        <rect fill="#42A5F5" width="12" height="4" x="6" y="14"/>
    </svg>
);
import React from 'react';

export const UpiIcon: React.FC<{className?: string}> = ({ className = "h-5 w-5" }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
        <path d="M10 4H14V7H10V4ZM15 4V7H17C17 5.34 16.17 4 15 4ZM9 7V4C7.83 4 7 5.34 7 7H9ZM10 15V20H14V15H10ZM15 20C16.17 20 17 18.66 17 17H15V20ZM9 17C9 18.66 7.83 20 7 20V17H9ZM4 10H7V14H4V10ZM20 10V14H17V10H20ZM4 9C2.34 9 1 10.34 1 12C1 13.66 2.34 15 4 15V12H7V9H4ZM20 9H17V12H20V15C21.66 15 23 13.66 23 12C23 10.34 21.66 9 20 9Z" />
    </svg>
);

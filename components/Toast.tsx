import React, { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => { clearTimeout(timer); };
  }, [onClose]);

  const styles = type === 'success'
    ? { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#059669' }
    : { background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' };

  const icon = type === 'success' ? '✅' : '⚠️';

  return (
    <div
      className="fixed bottom-24 right-5 py-3 px-5 rounded-2xl shadow-xl animate-in slide-in-from-bottom-4 flex items-center gap-2 z-[100]"
      style={{ ...styles, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', backdropFilter: 'blur(12px)' }}
    >
      <span>{icon}</span>
      <span className="text-sm font-bold">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: styles.color }}
      >
        ✕
      </button>
    </div>
  );
};

export default Toast;

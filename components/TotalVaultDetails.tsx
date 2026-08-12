
import React, { useMemo } from 'react';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';

interface TotalVaultDetailsProps {
  vault: NoteCounts;
  onClose: () => void;
}

const TotalVaultDetails: React.FC<TotalVaultDetailsProps> = ({ vault, onClose }) => {
  const sortedDenominations = [...DENOMINATIONS].sort((a, b) => b - a);
  const totalValue = sortedDenominations.reduce((sum, denom) => sum + (vault[denom] || 0) * denom, 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-hidden" onClick={onClose}>
      {/* Glass Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-opacity" />

      {/* Modal Container */}
      <div 
        className="relative glass rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.1)] w-full max-w-md flex flex-col max-h-[90vh] border border-white/60 animate-in zoom-in-95 duration-200" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-3">
          <div>
            <h3 className="text-xl font-black text-slate-800 tracking-tight">Vault Inventory</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Physical Cash Breakdown</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 bg-white/80 rounded-full text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all active:scale-90 shadow-sm border border-slate-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="space-y-1.5 pt-1">
            {sortedDenominations.map(denom => {
              const count = vault[denom] || 0;
              const subtotal = denom * count;
              
              return (
                <div key={denom} className={`flex items-center justify-between p-2.5 px-4 rounded-[1.25rem] border transition-all ${count > 0 ? 'bg-white/50 border-white/60 shadow-sm' : 'opacity-40 border-transparent grayscale'}`}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[9px] font-black text-slate-400 uppercase leading-none">₹</span>
                    <span className="text-[14px] font-black text-slate-800 leading-none">{denom}</span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black text-slate-300">×</span>
                    <span className="text-[14px] font-black text-slate-700 tabular-nums">
                      {count.toLocaleString('en-IN')}
                    </span>
                    <span className="text-[10px] font-black text-slate-300">=</span>
                    <span className="text-[14px] font-black text-slate-900 tabular-nums tracking-tighter">
                      ₹{subtotal.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {/* Show empty message if no cash */}
            {totalValue === 0 && (
              <div className="py-12 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-loose">The vault is<br/>currently empty</p>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="p-5 sm:p-6 bg-white/60 backdrop-blur-xl border-t border-white/60 rounded-b-[2.5rem]">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Liquid Cash</p>
              <h4 className="text-2xl sm:text-3xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tabular-nums tracking-tighter">
                ₹{totalValue.toLocaleString('en-IN')}
              </h4>
            </div>
            <div className="p-3 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-[1rem] border border-indigo-100 shadow-sm">
               <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M12 16v1m-10-10a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalVaultDetails;

import React from 'react';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';

interface CurrencyCounterProps {
  value: NoteCounts;
  onChange: (newCounts: NoteCounts) => void;
}

const CurrencyCounter: React.FC<CurrencyCounterProps> = ({ value, onChange }) => {
  const handleCountChange = (denomination: number, count: number) => {
    // Note count kabhi negative nahi hoga. Zero local state mein rahega, lekin input
    // field mein blank dikhega taaki screen par unnecessary 0 na aaye.
    onChange({ ...value, [denomination]: Math.max(0, count) });
  };

  return (
    <div className="space-y-2">
      <div
        className="grid grid-cols-3 items-center px-2 text-[10px] font-black uppercase tracking-wider"
        style={{ color: '#475569' }}
      >
        <span>Note</span>
        <span className="text-center">Count</span>
        <span className="text-right">Amount</span>
      </div>
      {DENOMINATIONS.map((denom) => {
        const count = value[denom] ?? 0;
        const total = count * denom;
        const hasValue = count > 0;

        return (
          <div
            key={denom}
            className="grid grid-cols-3 items-center gap-3 rounded-2xl p-2 transition-all"
            style={{
              background: hasValue ? '#EEF2FF' : '#F5F7FF',
              border: hasValue ? '1.5px solid #C7D2FE' : '1.5px solid #E0E7FF',
            }}
          >
            <label
              htmlFor={`denom-${denom}`}
              className="text-sm font-black tabular-nums"
              style={{ color: hasValue ? '#4338CA' : '#475569' }}
            >
              ₹{denom === 1 ? '1 Coin' : denom}
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleCountChange(denom, count - 1)}
                disabled={count === 0}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-black transition-all disabled:cursor-not-allowed disabled:opacity-35"
                style={{ background: '#FFFFFF', border: '1.5px solid #C7D2FE', color: '#4338CA' }}
                aria-label={`Decrease ₹${denom} note count`}
              >
                −
              </button>
              <input
                id={`denom-${denom}`}
                type="number"
                inputMode="numeric"
                min="0"
                value={count === 0 ? '' : count}
                placeholder=""
                onChange={(e) => {
                  const rawValue = e.target.value;
                  handleCountChange(denom, rawValue === '' ? 0 : parseInt(rawValue, 10) || 0);
                }}
                className="min-w-0 flex-1 rounded-xl px-1 py-1.5 text-center text-sm font-black outline-none transition-all placeholder:text-slate-500"
                style={{
                  background: '#FFFFFF',
                  border: '1.5px solid #C7D2FE',
                  color: '#1E1B4B',
                }}
                aria-label={`Count for ₹${denom}`}
                onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.16)'; }}
                onBlur={e => { e.target.style.borderColor = '#C7D2FE'; e.target.style.boxShadow = 'none'; }}
              />
              <button
                type="button"
                onClick={() => handleCountChange(denom, count + 1)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg font-black transition-all active:scale-95"
                style={{ background: '#FFFFFF', border: '1.5px solid #C7D2FE', color: '#4338CA' }}
                aria-label={`Increase ₹${denom} note count`}
              >
                +
              </button>
            </div>
            <span
              className="text-right text-sm font-black tabular-nums"
              style={{ color: hasValue ? '#4338CA' : '#475569' }}
            >
              ₹{total.toLocaleString('en-IN')}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default CurrencyCounter;

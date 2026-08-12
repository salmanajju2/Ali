import React from 'react';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';

interface CurrencyCounterProps {
  value: NoteCounts;
  onChange: (newCounts: NoteCounts) => void;
}

const CurrencyCounter: React.FC<CurrencyCounterProps> = ({ value, onChange }) => {

  const handleCountChange = (denomination: number, count: number) => {
    onChange({ ...value, [denomination]: count });
  };

  return (
    <div className="space-y-2">
      {DENOMINATIONS.map((denom) => {
        const count = value[denom] || 0;
        const total = count * denom;
        const hasValue = count > 0;
        return (
          <div
            key={denom}
            className="grid grid-cols-3 items-center gap-3 p-2 rounded-2xl transition-all"
            style={{
              background: hasValue ? '#EEF2FF' : '#F5F7FF',
              border: hasValue ? '1.5px solid #C7D2FE' : '1.5px solid #E0E7FF',
            }}
          >
            <label
              htmlFor={`denom-${denom}`}
              className="text-sm font-black tabular-nums"
              style={{ color: hasValue ? '#4F46E5' : '#9CA3AF' }}
            >
              ₹{denom === 1 ? '1 Coin' : denom}
            </label>
            <input
              id={`denom-${denom}`}
              type="number"
              value={value[denom] || ''}
              onChange={(e) => handleCountChange(denom, parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-1.5 text-center rounded-xl text-sm font-bold outline-none transition-all"
              style={{
                background: 'white',
                border: '1.5px solid #E0E7FF',
                color: '#1E1B4B',
              }}
              placeholder="0"
              onFocus={e => { e.target.style.borderColor = '#818CF8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E0E7FF'; e.target.style.boxShadow = 'none'; }}
            />
            <span
              className="text-right text-sm font-black tabular-nums"
              style={{ color: hasValue ? '#4F46E5' : '#9CA3AF' }}
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

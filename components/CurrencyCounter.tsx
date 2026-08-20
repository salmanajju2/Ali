import React, { useRef, useState } from 'react';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';

interface CurrencyCounterProps {
  value: NoteCounts;
  onChange: (newCounts: NoteCounts) => void;
}

const CurrencyCounter: React.FC<CurrencyCounterProps> = ({ value, onChange }) => {
  // `-` ko type karte waqt browser temporary raw value rakhta hai. Is local draft se
  // user bina interruption `-1` ya `+1` likh sakta hai, aur complete number turant total mein aa jata hai.
  const [draftCounts, setDraftCounts] = useState<Record<number, string>>({});
  const inputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleCountChange = (denomination: number, count: number) => {
    onChange({ ...value, [denomination]: Number.isFinite(count) ? Math.trunc(count) : 0 });
  };

  const handleInputChange = (denomination: number, rawValue: string) => {
    // Empty, positive, aur negative whole note counts only — decimal/letters allowed nahi hain.
    if (!/^[+-]?\d*$/.test(rawValue)) return;

    setDraftCounts(previous => ({ ...previous, [denomination]: rawValue }));
    if (rawValue === '' || rawValue === '-' || rawValue === '+') {
      handleCountChange(denomination, 0);
      return;
    }

    handleCountChange(denomination, Number.parseInt(rawValue, 10));
  };

  const finishInput = (denomination: number) => {
    setDraftCounts(previous => {
      const next = { ...previous };
      delete next[denomination];
      return next;
    });
  };

  const focusNextInput = (denomination: number) => {
    const currentIndex = DENOMINATIONS.indexOf(denomination);
    const nextDenomination = DENOMINATIONS[currentIndex + 1];
    if (nextDenomination === undefined) return;

    window.requestAnimationFrame(() => {
      inputRefs.current[nextDenomination]?.focus();
    });
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
      {DENOMINATIONS.map((denom, index) => {
        const count = value[denom] ?? 0;
        const isLastDenomination = index === DENOMINATIONS.length - 1;
        const total = count * denom;
        const hasValue = count !== 0;
        const visibleValue = draftCounts[denom] ?? (count === 0 ? '' : String(count));

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
            <input
              id={`denom-${denom}`}
              ref={(input) => { inputRefs.current[denom] = input; }}
              type="text"
              inputMode="decimal"
              pattern="[+-]?[0-9]*"
              enterKeyHint={isLastDenomination ? 'done' : 'next'}
              value={visibleValue}
              placeholder=""
              onChange={(e) => handleInputChange(denom, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isLastDenomination) {
                  e.preventDefault();
                  focusNextInput(denom);
                }
              }}
              className="w-full rounded-xl px-3 py-1.5 text-center text-sm font-black outline-none transition-all placeholder:text-slate-500"
              style={{
                background: '#FFFFFF',
                border: '1.5px solid #C7D2FE',
                color: '#1E1B4B',
              }}
              aria-label={`Signed count for ₹${denom}`}
              onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.16)'; }}
              onBlur={e => {
                finishInput(denom);
                e.target.style.borderColor = '#C7D2FE';
                e.target.style.boxShadow = 'none';
              }}
            />
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

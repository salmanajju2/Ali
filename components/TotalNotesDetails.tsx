
import React, { useState, useMemo } from 'react';
import { DENOMINATIONS } from '../constants';
import { NoteCounts } from '../types';

interface TotalNotesDetailsProps {
  noteCounts: NoteCounts;
  creditNoteCounts: NoteCounts;
  debitNoteCounts: NoteCounts;
  onClose: () => void;
}

type FilterType = 'all' | 'credit' | 'debit';

const TotalNotesDetails: React.FC<TotalNotesDetailsProps> = ({ 
  noteCounts: totalNoteCounts,
  creditNoteCounts,
  debitNoteCounts,
  onClose 
}) => {
  const [filter, setFilter] = useState<FilterType>('all');

  const noteCounts = useMemo(() => {
    if (filter === 'credit') return creditNoteCounts;
    if (filter === 'debit') return debitNoteCounts;
    return totalNoteCounts;
  }, [filter, totalNoteCounts, creditNoteCounts, debitNoteCounts]);

  const sortedDenominations = [...DENOMINATIONS].sort((a, b) => b - a);

  const totalNotes = Object.values(noteCounts).reduce((sum, count) => (sum as number) + ((count as number) || 0), 0);
  const totalValue = sortedDenominations.reduce((sum, denom) => sum + ((noteCounts[denom] as number) || 0) * denom, 0);

  const renderFilterButtons = () => (
    <div className="flex justify-center space-x-2 mb-6">
      <button 
        onClick={() => setFilter('all')} 
        className={`px-4 py-2 text-sm font-medium rounded-md ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
          All
      </button>
      <button 
        onClick={() => setFilter('credit')} 
        className={`px-4 py-2 text-sm font-medium rounded-md ${filter === 'credit' ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
          In
      </button>
      <button 
        onClick={() => setFilter('debit')} 
        className={`px-4 py-2 text-sm font-medium rounded-md ${filter === 'debit' ? 'bg-red-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
          Out
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-4 sm:p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white">Total Note's Details</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl">&times;</button>
        </div>
        
        {renderFilterButtons()}

        <div className="space-y-3 font-mono text-base sm:text-lg overflow-y-auto max-h-[50vh]">
          {sortedDenominations.map(denom => {
            const count = noteCounts[denom] || 0;
            return (
              <div key={denom} className="grid grid-cols-[4rem,auto,1fr,auto,1fr] gap-x-2 sm:gap-x-4 items-baseline">
                <span className="font-semibold text-left text-gray-800 dark:text-gray-200">{denom}</span>
                <span className="text-center text-gray-500">x</span>
                <span className={`text-right ${count === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}`}>
                  {count.toLocaleString('en-IN')}
                </span>
                <span className="text-center text-gray-500">=</span>
                <span className={`text-right font-semibold ${count === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'} break-all`}>
                  {(denom * count).toLocaleString('en-IN')}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 font-mono text-base sm:text-lg">
          <div className="font-semibold text-gray-800 dark:text-gray-200">Note: {Number(totalNotes).toLocaleString('en-IN')}</div>
          <div className={`font-bold text-lg sm:text-xl ${filter === 'credit' ? 'text-green-600' : filter === 'debit' ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
            ₹{totalValue.toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TotalNotesDetails;

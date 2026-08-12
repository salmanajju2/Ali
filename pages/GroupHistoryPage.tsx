import React, { useMemo, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../types';
import { contacts } from '../utils/contacts';

// Icons
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { MinusCircleIcon } from '../components/icons/MinusCircleIcon';
import { ShareIcon } from '../components/icons/ShareIcon';

type TransactionWithBalance = Transaction & { closingBalance: number };

const GroupHistoryPage: React.FC = () => {
  const { groupName } = useParams<{ groupName: string }>();
  const { transactions, user, userIdentityKeys } = useAppContext();
  const navigate = useNavigate();

  const decodedGroupName = groupName ? decodeURIComponent(groupName) : '';
  const companyGroup = ['CHOLA', 'CHARGE', 'IDFC', 'HERO', 'LT'];

  const groupTransactions = useMemo(() => {
    const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
    
    return transactions
      .filter(tx => companyGroup.includes(typeof tx.company === 'string' ? tx.company.toUpperCase() : 'NA'))
      .filter(tx => {
        if (isAdmin) return true;
        const rb = (tx.recordedBy || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const crb = rb.replace(/[^a-z0-9@.]/g, '');
        return userIdentityKeys.has(rb) || userIdentityKeys.has(crb);
      })
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [transactions, user, userIdentityKeys]);


  const personsData = useMemo(() => {
    const personsMap = new Map<string, Transaction[]>();

    groupTransactions.forEach(tx => {
      let personName = (typeof tx.person === 'string' ? tx.person.trim() : 'Unknown').toUpperCase();
      if (personName === 'MOSHO') personName = 'XPREES BEES'; // Combine MOSHO and XPREE
      if (!personsMap.has(personName)) {
        personsMap.set(personName, []);
      }
      personsMap.get(personName)!.push(tx);
    });

    return Array.from(personsMap.entries()).map(([person, txs]) => {
      const sortedTxs = txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let closingBalance = 0;
      const txsWithBalance: TransactionWithBalance[] = [];
      for (let i = 0; i < sortedTxs.length; i++) {
        const tx = sortedTxs[i];
        closingBalance += (tx.type === 'credit' ? tx.amount : -tx.amount);
        txsWithBalance.unshift({ ...tx, closingBalance });
      }

      const totalCredit = txsWithBalance.reduce((sum, tx) => tx.type === 'credit' ? sum + tx.amount : sum, 0);
      const totalDebit = txsWithBalance.reduce((sum, tx) => tx.type === 'debit' ? sum + tx.amount : sum, 0);
      const netBalance = totalCredit - totalDebit;

      return { person, transactions: txsWithBalance, totalCredit, totalDebit, netBalance };
    });
  }, [groupTransactions]);

  const handlePersonClick = (personName: string) => {
    navigate(`/group/${encodeURIComponent(decodedGroupName)}/person/${encodeURIComponent(personName)}`);
  };

  const handleShare = (person: string, netBalance: number, transactions: TransactionWithBalance[]) => {
    const upperPerson = person.toUpperCase();
    const contactKey = Object.keys(contacts).find(key => upperPerson.includes(key));
    const whatsappNumber = contactKey ? contacts[contactKey] : undefined;

    let finalNumber = whatsappNumber;
    if (!finalNumber) {
      const localContacts = JSON.parse(localStorage.getItem('user_added_contacts') || '{}');
      if (localContacts[upperPerson]) {
        finalNumber = localContacts[upperPerson];
      } else {
        const userInput = window.prompt(`WhatsApp number not found for ${person}.\nPlease enter the 10-digit number:`);
        if (userInput) {
          let cleanNumber = userInput.replace(/\D/g, ''); // Remove non-digits
          if (cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
          if (cleanNumber.length >= 10) {
            localContacts[upperPerson] = cleanNumber;
            localStorage.setItem('user_added_contacts', JSON.stringify(localContacts));
            finalNumber = cleanNumber;
          } else {
            alert('Invalid number entered.');
            return;
          }
        } else {
          return;
        }
      }
    }

    let message = `Hello ${person},\n\nHere is your transaction summary:\n\n`;
    transactions.slice(0, 5).forEach(tx => {
      const formattedDate = new Date(tx.date).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      const sign = tx.type === 'credit' ? '+' : '-';
      message += `${formattedDate}: ${sign}₹${tx.amount.toLocaleString('en-IN')} (${tx.paymentMethod})\n`;
    });
    message += `\nFinal Net Balance: ₹${netBalance.toLocaleString('en-IN')}`;

    const whatsappUrl = `whatsapp://send?phone=${finalNumber}&text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  if (!decodedGroupName) return <div className="text-center p-8" style={{ color: '#1E1B4B' }}>Group name not found.</div>;

  return (
    <div className="max-w-7xl mx-auto pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4 my-6 px-2 sm:px-4 no-print">
        <div className="flex items-center gap-4">
          <Link to={"/summary"} className="flex items-center gap-2 text-blue-600 hover:underline">
            <ArrowLeftIcon className="h-5 w-5" /><span>Back to Summaries</span>
          </Link>
        </div>
        <h2 className="text-3xl font-bold w-full sm:w-auto text-center sm:text-left" style={{ color: '#1E1B4B' }}>
          {decodedGroupName} Finance History
        </h2>
      </header>

      {personsData.map(({ person, transactions, totalCredit, totalDebit, netBalance }) => (
        <div key={person} style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="mb-4 mx-2 sm:mx-4">
          <div className="p-4 cursor-pointer" onClick={() => handlePersonClick(person)}>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-xl" style={{ color: '#1E1B4B' }}>{person}</h3>
              <div className="flex items-center gap-4">
                <div className={`${netBalance >= 0 ? 'text-blue-600' : 'text-orange-500'} font-bold text-xl`}>₹{netBalance.toLocaleString('en-IN')}</div>
                <button onClick={(e) => { e.stopPropagation(); handleShare(person, netBalance, transactions); }} className="p-2 hover:text-green-500 transition-colors" style={{ color: '#9CA3AF' }} aria-label="Share on WhatsApp">
                  <ShareIcon className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <div className="text-emerald-600">Credit: ₹{totalCredit.toLocaleString('en-IN')}</div>
              <div className="text-rose-600">Debit: ₹{totalDebit.toLocaleString('en-IN')}</div>
            </div>
          </div>
        </div>
      ))}

    </div>
  );
};

export default GroupHistoryPage;
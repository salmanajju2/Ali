import React, { useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction, TransactionType } from '../types';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { CheckCircleIcon } from '../components/icons/CheckCircleIcon';
import { MinusCircleIcon } from '../components/icons/MinusCircleIcon';
import { PencilIcon } from '../components/icons/PencilIcon';
import { StarIcon } from '../components/icons/StarIcon';
import { PlusIcon } from '../components/icons/PlusIcon';
import { TrashIcon } from '../components/icons/TrashIcon';
import { CalendarDaysIcon } from '../components/icons/CalendarDaysIcon';
import { sendTelegramPhoto } from '../services/telegramService';

const TRANSACTIONS_PER_PAGE = 50;

const PersonUdharPage: React.FC = () => {
    const { personName } = useParams<{ personName: string }>();
    const { user, transactions, deleteTransactionsByIds, addTransaction } = useAppContext();
    const navigate = useNavigate();
    const currentUserName = user?.displayName || user?.email || 'Unknown User';

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [modalError, setModalError] = useState<string | null>(null);
    const [modalType, setModalType] = useState<TransactionType>('credit');
    const [amount, setAmount] = useState(0);
    const [remark, setRemark] = useState('');
    const [manualDate, setManualDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));


    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PER_PAGE);

    const personTransactions = useMemo(() => {
        return transactions
            .filter(tx => {
                const isMatch = tx.company === 'NA' && tx.location === 'NA' && (typeof tx.person === 'string' ? tx.person.toUpperCase() : '') === (typeof personName === 'string' ? personName.toUpperCase() : '');
                if (!isMatch) return false;

                // Privacy Filter
                const isAdmin = user?.isAdmin || user?.email?.toLowerCase() === 'alienterprese@gmail.com';
                if (isAdmin) return true;

                const userEmail = user?.email?.toLowerCase();
                const txRecorder = tx.recordedBy.toLowerCase();
                return txRecorder.includes(userEmail || '___') || (userEmail && userEmail.includes(txRecorder));
            })
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, personName]);

    const paginatedTransactions = useMemo(() => {
        return personTransactions.slice(0, visibleCount);
    }, [personTransactions, visibleCount]);

    React.useEffect(() => {
        setVisibleCount(TRANSACTIONS_PER_PAGE);
    }, [personName]);

    const summary = useMemo(() => {
        return personTransactions.reduce((acc, tx) => {
            if (tx.type === 'credit') acc.totalCredit += tx.amount;
            else acc.totalDebit += tx.amount;
            return acc;
        }, { totalCredit: 0, totalDebit: 0 });
    }, [personTransactions]);

    const netBalance = summary.totalCredit - summary.totalDebit;

    const openAddTransactionModal = (type: TransactionType) => {
        setModalType(type);
        setAmount(0);
        setRemark('');
        setManualDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
        setModalError(null);
        setIsModalOpen(true);
    }
    
    const currencyFormatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

    const handleSaveTransaction = async () => {
        if (amount <= 0) { setModalError('Amount must be positive.'); return; }

        setIsSubmitting(true);
        setModalError(null);

        try {
            const transactionData = {
                type: modalType,
                paymentMethod: 'cash' as const,
                company: 'NA',
                person: personName || '',
                location: 'NA',
                recordedBy: currentUserName,
                amount: amount,
                notes: remark,
                manualDate: manualDate,
                breakdown: {},
            };

            await addTransaction(transactionData);

            const formattedDate = new Date(manualDate).toLocaleString('en-IN', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });

            // sendTelegramMessage call removed (Only image should go)
            // await sendTelegramMessage(telegramMessage);

            setIsModalOpen(false);
        } catch(err: any) {
            setModalError(err.message || 'An unexpected error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    }

    const handleDeleteClick = (id: string) => {
        setSelectedId(id);
        setDeleteError(null);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!selectedId) return;
        
        const transactionToDelete = personTransactions.find(tx => tx.id === selectedId);

        setIsDeleting(true);
        setDeleteError(null);
        try {
            await deleteTransactionsByIds([selectedId]);

            if (transactionToDelete) {
                const deletionDate = new Date().toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                });

                // sendTelegramMessage call removed (Only image should go)
                // await sendTelegramMessage(telegramMessage);
            }

            setIsDeleteModalOpen(false);
            setSelectedId(null);
        } catch (err: any) { 
            setDeleteError(err.message || 'Failed to delete transaction.');
        } finally {
            setIsDeleting(false);
        }
    };

    const TransactionItem: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
        const { id, date, type, amount, paymentMethod, notes, recordedBy } = transaction;
        const formattedDate = new Date(date).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });

        return (
            <div className="card flex items-start p-4 gap-4">
                {type === 'credit' ? 
                    <CheckCircleIcon className="h-8 w-8 text-green-500 flex-shrink-0 mt-1" /> : 
                    <MinusCircleIcon className="h-8 w-8 text-red-500 flex-shrink-0 mt-1" />
                }
                <div className="flex-grow">
                    <div className="flex justify-between items-center">
                        <p className={`text-lg font-bold ${type === 'credit' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {currencyFormatter.format(amount)}
                        </p>
                        <p style={{ color: '#9CA3AF' }} className="text-xs uppercase font-medium">{paymentMethod}</p>
                    </div>
                    <div className="flex flex-col">
                        <p style={{ color: '#9CA3AF' }} className="text-xs">{formattedDate}</p>
                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1">By: {recordedBy.replace('@gmail.com', '')}</span>
                    </div>
                    {notes && <p style={{ color: '#6B7280' }} className="text-sm mt-2">{notes}</p>}
                </div>
                <div className="flex-shrink-0 flex flex-col sm:flex-row items-center gap-2 -mr-2">
                    <Link to={`/edit/${id}`} state={{ from: window.location.pathname }} className="p-2 text-gray-400 hover:text-blue-500 rounded-full hover:bg-indigo-50 flex items-center"><PencilIcon className="h-5 w-5" /><span className="ml-2 text-sm inline sm:hidden">Edit</span></Link>
                    <button onClick={() => handleDeleteClick(id)} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-indigo-50"><TrashIcon className="h-5 w-5" /></button>
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-4xl mx-auto px-2 pb-24">
            <header className="flex items-center justify-between gap-4 my-6">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 hover:text-blue-600" style={{ color: '#6B7280' }}><ArrowLeftIcon className="h-5 w-5"/><span>Back</span></button>
                <h1 className="text-xl font-bold truncate" style={{ color: '#1E1B4B' }}>{personName} - Udhar</h1>
                <div className="flex gap-2">
                    <button onClick={() => openAddTransactionModal('credit')} className="flex items-center gap-1 bg-green-500 text-white px-3 py-2 rounded-md hover:bg-green-600 text-sm font-medium"><PlusIcon className="h-4 w-4"/> Cr</button>
                    <button onClick={() => openAddTransactionModal('debit')} className="flex items-center gap-1 bg-red-500 text-white px-3 py-2 rounded-md hover:bg-red-600 text-sm font-medium"><PlusIcon className="h-4 w-4"/> Dr</button>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <SummaryCard title="Total Credit" amount={summary.totalCredit} color="green" />
                <SummaryCard title="Total Debit" amount={summary.totalDebit} color="red" />
                <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-4 flex justify-between items-center">
                    <div>
                        <p style={{ color: '#9CA3AF' }} className="text-sm font-medium">Net Balance</p>
                        <p className={`text-2xl font-bold mt-1 ${netBalance >= 0 ? 'text-blue-600' : 'text-orange-500'}`}>{currencyFormatter.format(netBalance)}</p>
                    </div>
                    <div style={{ background: '#EEF2FF' }} className="p-3 rounded-full"><StarIcon className="h-6 w-6 text-blue-600" /></div>
                </div>
            </div>
            
            {personTransactions.length > 0 ? (
                <div className="space-y-4">
                    {paginatedTransactions.map(tx => <TransactionItem key={tx.id} transaction={tx} />)}
                    {personTransactions.length > visibleCount && (
                        <div className="flex justify-center pt-4">
                            <button
                                onClick={() => setVisibleCount(prev => prev + TRANSACTIONS_PER_PAGE)}
                                style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
                                className="px-8 py-3 rounded-xl font-bold uppercase tracking-widest active:scale-95 transition-all text-xs"
                            >
                                Load More
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="text-center py-16 mt-4">
                    <p style={{ color: '#9CA3AF' }}>No udhar transactions found for {personName}.</p>
                </div>
            )}

            {isModalOpen && (
                 <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold capitalize" style={{ color: '#1E1B4B' }}>Add {modalType}</h3>
                        <div className="mt-4 space-y-4">
                            <div>
                                <label htmlFor="amount" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Amount</label>
                                <input type="number" id="amount" value={amount} onChange={(e) => setAmount(parseFloat(e.target.value) || 0)} style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }} className="mt-1 block w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"/>
                            </div>
                             <div>
                                <label htmlFor="remark" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Remark</label>
                                <input type="text" id="remark" value={remark} onChange={(e) => setRemark(e.target.value)} style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }} className="mt-1 block w-full px-3 py-2 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter a remark (optional)" />
                            </div>
                            <div className="relative">
                                <label htmlFor="date" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Date &amp; Time</label>
                                <div className="absolute inset-y-0 left-3 top-7 flex items-center pointer-events-none"><CalendarDaysIcon className="h-5 w-5" style={{ color: '#9CA3AF' }} /></div>
                                <input type="datetime-local" id="date" value={manualDate} onChange={e => setManualDate(e.target.value)} style={{ background: 'white', border: '1px solid #E0E7FF', color: '#1E1B4B' }} className="block w-full pl-10 pr-3 py-2 rounded-md sm:text-sm mt-1" />
                            </div>
                        </div>
                        {modalError && <div style={{ background: '#FFF1F2', color: '#E11D48', border: '1px solid #fecdd3' }} className="mt-4 p-2 rounded-lg text-sm">{modalError}</div>}
                        <div className="mt-6 flex justify-end gap-4">
                            <button onClick={() => setIsModalOpen(false)} disabled={isSubmitting} style={{ border: '1px solid #E0E7FF', color: '#6B7280' }} className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50">Cancel</button>
                            <button onClick={handleSaveTransaction} disabled={isSubmitting} className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${modalType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>{isSubmitting ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>
                 </div>
            )}

            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center p-4">
                    <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold" style={{ color: '#1E1B4B' }}>Confirm Deletion</h3>
                        <p className="mt-2 text-sm" style={{ color: '#6B7280' }}>Are you sure you want to delete this transaction? This cannot be undone.</p>
                        {deleteError && <div style={{ background: '#FFF1F2', color: '#E11D48', border: '1px solid #fecdd3' }} className="mt-4 p-2 rounded-lg text-sm">{deleteError}</div>}
                        <div className="mt-6 flex justify-end gap-4">
                            <button onClick={() => setIsDeleteModalOpen(false)} disabled={isDeleting} style={{ border: '1px solid #E0E7FF', color: '#6B7280' }} className="px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50">Cancel</button>
                            <button onClick={handleConfirmDelete} disabled={isDeleting} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50">{isDeleting ? 'Deleting...' : 'Delete'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const SummaryCard: React.FC<{title: string, amount: number, color: string}> = ({ title, amount, color }) => {
    const currencyFormatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
    
    return (
        <div style={{ background: 'white', border: '1px solid #E0E7FF', borderRadius: '1.5rem', boxShadow: '0 4px 16px rgba(99,102,241,0.08)' }} className="p-4">
            <p style={{ color: '#9CA3AF' }} className="text-sm font-medium">{title}</p>
            <p className={`text-2xl font-bold text-${color}-600 mt-1`}>{currencyFormatter.format(amount)}</p>
        </div>
    );
};

export default PersonUdharPage;

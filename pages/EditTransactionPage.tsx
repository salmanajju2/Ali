import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction, NoteCounts, TransactionType } from '../types';
import { DENOMINATIONS, BANK_LOGOS, BANK_NAMES, CASH_BANK_NAMES } from '../constants';
import CurrencyCounter from '../components/CurrencyCounter';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { UserIcon } from '../components/icons/UserIcon';
import { BuildingOfficeIcon } from '../components/icons/BuildingOfficeIcon';
import { MapPinIcon } from '../components/icons/MapPinIcon';
import { TrendingUpIcon } from '../components/icons/TrendingUpIcon';
import { TrendingDownIcon } from '../components/icons/TrendingDownIcon';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import SlipImage from '../components/SlipImage';
import SimpleCropper from '../components/SimpleCropper';

const EditTransactionPage: React.FC = () => {
    const { transactionId } = useParams<{ transactionId: string }>();
    const navigate = useNavigate();
    const reactLocation = useLocation();
    const { transactions, updateTransaction, companyNames, locations: appLocations, allBankNames } = useAppContext();

    const from = reactLocation.state?.from || '/history';

    const [transaction, setTransaction] = useState<Transaction | null>(null);

    // Form state
    const [person, setPerson] = useState('');
    const [company, setCompany] = useState('');
    const [formLocation, setFormLocation] = useState('');
    const [recordedBy, setRecordedBy] = useState('');
    const [transactionType, setTransactionType] = useState<TransactionType>('credit');
    const [amount, setAmount] = useState<number | ''>(0);
    const [selectedBank, setSelectedBank] = useState<string>('');
    const [slip, setSlip] = useState<string | null>(null);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);
    const [breakdown, setBreakdown] = useState<NoteCounts>({});
    const [manualDate, setManualDate] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [hasSlip, setHasSlip] = useState(false);

    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const result = event.target?.result as string;
                            setImageToCrop(result);
                            setHasSlip(true);
                        };
                        reader.readAsDataURL(file);
                    }
                    break;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    useEffect(() => {
        // If we already loaded this transaction, don't overwrite user edits if 'transactions' updates in the background
        if (transaction && transaction.id === transactionId) return;

        const txToEdit = transactions.find(t => t.id === transactionId);
        if (txToEdit) {
            setTransaction(txToEdit);
            setPerson(txToEdit.person || '');
            setCompany(txToEdit.company || 'NA');
            setFormLocation(txToEdit.location);
            setRecordedBy(txToEdit.recordedBy);
            setTransactionType(txToEdit.type);
            setAmount(txToEdit.amount);
            setSelectedBank(txToEdit.bank || '');
            setSlip(txToEdit.slip || null);
            setHasSlip(!!txToEdit.slip);
            setBreakdown(txToEdit.breakdown || {});

            const dateToUse = txToEdit.manualDate || txToEdit.date || new Date();
            const localDate = new Date(dateToUse);
            const localDateString = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
            setManualDate(localDateString);
        } else if (transactions.length > 0) {
            navigate('/history');
        }
    }, [transactionId, transactions, navigate, transaction]);

    const showDenominations = useMemo(() => {
        if (transaction?.paymentMethod !== 'cash') {
            return false;
        }
        if (transactionType === 'credit') {
            return true;
        }
        if (transactionType === 'debit') {
            return transaction.breakdown && Object.keys(transaction.breakdown).length > 0;
        }
        return false;
    }, [transaction, transactionType]);

    const totalAmount = useMemo(() => {
        if (showDenominations) {
            return DENOMINATIONS.reduce((sum, denom) => sum + (breakdown[denom] || 0) * denom, 0);
        }
        return amount;
    }, [showDenominations, breakdown, amount]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const result = event.target?.result as string;
                if (file.type === 'application/pdf') {
                    setSlip(result);
                } else {
                    setImageToCrop(result);
                }
            };
            reader.readAsDataURL(file);
        }
        e.target.value = '';
    };

    const handleCropSave = (croppedDataUrl: string) => {
        setSlip(croppedDataUrl);
        setImageToCrop(null);
    };

    const handleImageCapture = async (forceFilePicker = false) => {
        if (Capacitor.isNativePlatform() && !forceFilePicker) {
            try {
                const image = await Camera.getPhoto({
                    quality: 90,
                    resultType: CameraResultType.DataUrl,
                    source: CameraSource.Prompt,
                    width: 1200,
                    height: 1200,
                    allowEditing: false
                });
                if (image.dataUrl) {
                    setImageToCrop(image.dataUrl);
                }
            } catch (e) {
                console.error('Image capture failed, falling back to file input:', e);
                document.getElementById('slip-upload')?.click();
            }
        } else {
            document.getElementById('slip-upload')?.click();
        }
    };

    const handleBankClick = (bank: string) => {
        if (selectedBank === bank) {
            setSelectedBank('');
        } else {
            setSelectedBank(bank);
            if (hasSlip) handleImageCapture();
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!transaction) return;

        if (!formLocation) {
            setError("Location is a required field.");
            return;
        }

        setError(null);
        setIsSubmitting(true);

        const finalAmount = showDenominations
            ? DENOMINATIONS.reduce((sum, denom) => sum + (breakdown[denom] || 0) * denom, 0)
            : amount;

        const updatedTx: Transaction = {
            ...transaction!,
            person,
            company: company || 'NA',
            location: formLocation,
            recordedBy,
            type: transactionType,
            amount: finalAmount as number,
            bank: selectedBank || undefined,
            slip: hasSlip ? (slip || undefined) : undefined,
            paymentMethod: transaction.paymentMethod,
            breakdown: showDenominations ? breakdown : {},
            manualDate: manualDate,
        };

        try {
            await updateTransaction(updatedTx);
            setSuccessMessage('Transaction updated successfully! Redirecting...');
            setTimeout(() => {
                navigate(from, { replace: true });
            }, 1500);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
            setIsSubmitting(false);
        }
    };

    if (!transaction) {
        return (
            <div className="flex justify-center items-center h-64">
                <p style={{ color: '#9CA3AF' }}>Loading transaction...</p>
            </div>
        );
    }

    const inputStyle: React.CSSProperties = {
        background: '#F5F7FF',
        border: '1.5px solid #E0E7FF',
        color: '#1E1B4B',
        borderRadius: '1rem',
    };

    const selectStyle: React.CSSProperties = {
        background: '#F5F7FF',
        border: '1.5px solid #E0E7FF',
        color: '#1E1B4B',
        borderRadius: '1rem',
    };

    const labelStyle: React.CSSProperties = {
        color: '#6366F1',
    };

    return (
        <div className="max-w-xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
                <Link to={from} className="flex items-center gap-2 hover:underline" style={{ color: '#6366F1' }}>
                    <ArrowLeftIcon className="h-5 w-5" />
                    <span>Back</span>
                </Link>
                <h2 className="text-2xl font-bold" style={{ color: '#1E1B4B' }}>Edit Transaction</h2>
            </div>

            <div
                className="rounded-3xl p-6 sm:p-8"
                style={{
                    background: 'white',
                    border: '1px solid #E0E7FF',
                    borderRadius: '1.5rem',
                    boxShadow: '0 4px 16px rgba(99,102,241,0.08)',
                }}
            >
                {successMessage && (
                    <div
                        className="px-4 py-3 rounded-lg relative mb-6"
                        role="alert"
                        style={{ background: '#ECFDF5', border: '1px solid #059669', color: '#059669' }}
                    >
                        {successMessage}
                    </div>
                )}
                {error && (
                    <div
                        className="px-4 py-3 rounded-lg relative mb-6"
                        role="alert"
                        style={{ background: '#FFF1F2', border: '1px solid #E11D48', color: '#E11D48' }}
                    >
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="customerName" className="block text-sm font-medium mb-1" style={labelStyle}>Customer Name (Optional)</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <UserIcon className="h-5 w-5" style={{ color: '#9CA3AF' }} />
                            </div>
                            <input
                                type="text"
                                id="customerName"
                                value={person}
                                onChange={e => setPerson(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2"
                                style={inputStyle}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="companyName" className="block text-sm font-medium mb-1" style={labelStyle}>Company Name</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <BuildingOfficeIcon className="h-5 w-5" style={{ color: '#9CA3AF' }} />
                            </div>
                            <select
                                id="companyName"
                                value={company}
                                onChange={e => setCompany(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 appearance-none"
                                style={selectStyle}
                            >
                                {companyNames.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="location" className="block text-sm font-medium mb-1" style={labelStyle}>Location</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <MapPinIcon className="h-5 w-5" style={{ color: '#9CA3AF' }} />
                            </div>
                            <select
                                id="location"
                                value={formLocation}
                                onChange={e => setFormLocation(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 appearance-none"
                                style={selectStyle}
                                required
                            >
                                {appLocations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="manualDate" className="block text-sm font-medium mb-1" style={labelStyle}>Date and Time</label>
                        <input
                            type="datetime-local"
                            name="manualDate"
                            id="manualDate"
                            value={manualDate}
                            onChange={e => setManualDate(e.target.value)}
                            className="mt-1 block w-full py-2 px-3 focus:outline-none sm:text-sm"
                            style={inputStyle}
                            step="1"
                        />
                    </div>

                    <hr style={{ borderColor: '#E0E7FF' }} />

                    <div>
                        <label className="block text-sm font-medium mb-2 font-bold" style={labelStyle}>Transaction Type</label>
                        <fieldset className="grid grid-cols-2 gap-4">
                            <div className="relative">
                                <input type="radio" id="credit" value="credit" checked={transactionType === 'credit'} onChange={() => setTransactionType('credit')} className="sr-only peer" />
                                <label
                                    htmlFor="credit"
                                    className="flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer peer-checked:ring-2 peer-checked:ring-indigo-500"
                                    style={{
                                        border: transactionType === 'credit' ? '1px solid #6366F1' : '1px solid #E0E7FF',
                                        background: transactionType === 'credit' ? '#EEF2FF' : 'white',
                                        color: '#1E1B4B',
                                    }}
                                >
                                    <TrendingUpIcon className="h-5 w-5 text-green-500" /><span>Credit</span>
                                </label>
                            </div>
                            <div className="relative">
                                <input type="radio" id="debit" value="debit" checked={transactionType === 'debit'} onChange={() => setTransactionType('debit')} className="sr-only peer" />
                                <label
                                    htmlFor="debit"
                                    className="flex items-center justify-center gap-2 p-3 rounded-lg cursor-pointer peer-checked:ring-2 peer-checked:ring-red-500"
                                    style={{
                                        border: transactionType === 'debit' ? '1px solid #E11D48' : '1px solid #E0E7FF',
                                        background: transactionType === 'debit' ? '#FFF1F2' : 'white',
                                        color: '#1E1B4B',
                                    }}
                                >
                                    <TrendingDownIcon className="h-5 w-5 text-red-500" /><span>Debit</span>
                                </label>
                            </div>
                        </fieldset>
                    </div>

                    {/* Bank Selection and Slip Section (Shown for all transactions to allow documentation) */}
                    <div className="space-y-4">
                        {/* Slip Mode Toggle (Matched to Debit/Credit style) */}
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => { setHasSlip(false); }}
                                className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
                                style={{
                                    border: !hasSlip ? '1px solid #6366F1' : '1px solid #E0E7FF',
                                    background: !hasSlip ? '#EEF2FF' : 'white',
                                    boxShadow: !hasSlip ? '0 2px 8px rgba(99,102,241,0.15)' : 'none',
                                    color: '#1E1B4B',
                                }}
                            >
                                <svg className="w-5 h-5" style={{ color: '#9CA3AF' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <span className="text-sm font-medium">Without Slip</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => { setHasSlip(true); if (!slip) handleImageCapture(); }}
                                className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
                                style={{
                                    border: hasSlip ? '1px solid #6366F1' : '1px solid #E0E7FF',
                                    background: hasSlip ? '#EEF2FF' : 'white',
                                    boxShadow: hasSlip ? '0 2px 8px rgba(99,102,241,0.15)' : 'none',
                                    color: '#1E1B4B',
                                }}
                            >
                                <svg className="w-5 h-5" style={{ color: '#6366F1' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                <span className="text-sm font-medium">With Slip</span>
                            </button>
                        </div>

                        <div className={`${hasSlip && !slip ? 'opacity-50 pointer-events-none' : ''}`}>
                            <label className="block text-sm font-medium mb-2 font-black uppercase tracking-widest" style={labelStyle}>Select Account</label>
                            <select
                                value={selectedBank}
                                onChange={(e) => setSelectedBank(e.target.value)}
                                className="w-full p-3 font-black uppercase focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                style={selectStyle}
                            >
                                <option value="">-- Choose Account --</option>
                                {/* ✅ FIX: allBankNames use karo (custom + UPI banks bhi include honge) */}
                                {allBankNames.map(bank => (
                                    <option key={bank} value={bank}>{bank}</option>
                                ))}
                            </select>
                        </div>

                        {hasSlip && (
                            <div
                                className="p-4 rounded-xl flex flex-col items-center justify-center"
                                style={{
                                    background: '#F5F7FF',
                                    border: '2px dashed #E0E7FF',
                                }}
                            >
                                <input type="file" id="slip-upload" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
                                {!slip ? (
                                    <button type="button" onClick={() => handleImageCapture(true)} className="flex flex-col items-center gap-2" style={{ color: '#6366F1' }}>
                                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-center">Click to Upload Slip Image / PDF</span>
                                    </button>
                                ) : (
                                    <div className="relative w-full">
                                        <SlipImage src={slip} alt="Slip" className="h-64 w-full object-contain rounded-xl shadow-lg" style={{ border: '2px solid #E0E7FF' }} />
                                        <button type="button" onClick={() => setSlip(null)} className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full p-2 shadow-xl hover:scale-110 active:scale-95 transition-transform z-10">
                                            <svg className="w-5 h-5 font-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                        <p className="mt-2 text-[10px] font-black text-center uppercase tracking-widest" style={{ color: '#6366F1' }}>Click Image to View Full Slip</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {showDenominations ? (
                        <div>
                            <h3 className="text-lg font-medium mb-4" style={{ color: '#1E1B4B' }}>Cash Denominations</h3>
                            <CurrencyCounter value={breakdown} onChange={setBreakdown} />
                        </div>
                    ) : (
                        <div>
                            <label htmlFor="amount" className="block text-sm font-medium" style={labelStyle}>Amount</label>
                            <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <span className="sm:text-sm" style={{ color: '#9CA3AF' }}>₹</span>
                                </div>
                                <input
                                    type="number"
                                    id="amount"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                                    className="block w-full pl-7 pr-3 py-2"
                                    style={inputStyle}
                                    placeholder="0.00"
                                    required
                                />
                            </div>
                        </div>
                    )}

                    <div
                        className="p-4 rounded-lg text-center"
                        style={{ background: '#EEF2FF', border: '1px solid #E0E7FF' }}
                    >
                        <h3 className="text-xl font-bold" style={{ color: '#1E1B4B' }}>
                            Total Amount: ₹{totalAmount.toLocaleString('en-IN')}
                        </h3>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full flex justify-center py-3 px-4 rounded-md text-sm font-medium disabled:opacity-50"
                            style={{
                                background: 'linear-gradient(135deg,#6366F1,#4F46E5)',
                                color: 'white',
                                boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                                border: 'none',
                            }}
                        >
                            {isSubmitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>

            {imageToCrop && (
                <SimpleCropper
                    imageSrc={imageToCrop}
                    onCropSave={handleCropSave}
                    onCancel={() => setImageToCrop(null)}
                />
            )}
        </div>
    );
};

export default EditTransactionPage;

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { UserIcon } from '../components/icons/UserIcon';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import { sendTelegramPhoto } from '../services/telegramService';
import { BANK_LOGOS, BANK_NAMES } from '../constants';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import SlipImage from '../components/SlipImage';
import SimpleCropper from '../components/SimpleCropper';
import {
  readRecentTransactionDefaults,
  writeRecentTransactionDefaults,
  RecentTransactionDefaults,
} from '../utils/recentTransactionDefaults';

const UpiCreditPage: React.FC = () => {
  const { user, addTransaction, allBankNames } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();

  const { companyName, companyLocation, person: initialPerson, from: returnUrl } = location.state || {};

  const currentUserName = user?.displayName || user?.email || 'Unknown User';
  const [recentDefaults, setRecentDefaults] = useState<RecentTransactionDefaults>(readRecentTransactionDefaults);

  const [person, setPerson] = useState(initialPerson || '');
  const [selectedCompany, setSelectedCompany] = useState(companyName || '');
  const [amount, setAmount] = useState<number | ''>('');
  const [selectedBank, setSelectedBank] = useState<string>(() => recentDefaults.account);

  const rememberRecentDefault = (field: keyof RecentTransactionDefaults, value: string) => {
    setRecentDefaults(previous => {
      const next = { ...previous, [field]: value };
      writeRecentTransactionDefaults(next);
      return next;
    });
  };
  const [hasSlip, setHasSlip] = useState(false);
  const [slip, setSlip] = useState<string | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subMethod, setSubMethod] = useState<'UPI' | 'IMPS' | 'NEFT'>('UPI');


  const companyHistoryUrl = companyName && companyLocation
    ? `/company/${encodeURIComponent(companyName)}?location=${encodeURIComponent(companyLocation)}`
    : '/summary';

  useEffect(() => {
    if (!companyName || !companyLocation) {
      navigate('/summary');
    }
  }, [companyName, companyLocation, navigate]);


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
          quality: 40,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Prompt,
          width: 800,
          height: 800,
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
      if (hasSlip) {
        handleImageCapture();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError(null);
    setIsSubmitting(true);

    try {
      const transactionData = {
        type: 'credit' as const,
        paymentMethod: 'upi',
        company: selectedCompany,
        person: person || 'N/A',
        location: companyLocation,
        recordedBy: currentUserName,
        amount: Number(amount),
        notes: `${subMethod} Transaction`,
        breakdown: {},

        manualDate,
        bank: selectedBank || undefined,
        slip: slip || undefined,
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

      const finalRedirectUrl = returnUrl || companyHistoryUrl;
      navigate(finalRedirectUrl);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!companyName) return null;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link to={companyHistoryUrl} className="flex items-center gap-2 hover:underline" style={{ color: '#6366F1' }}>
          <ArrowLeftIcon className="h-5 w-5" />
          <span>Back</span>
        </Link>
        <h2 className="text-2xl font-bold" style={{ color: '#1E1B4B' }}>Add UPI Credit for {selectedCompany}</h2>
      </div>
      <div className="rounded-3xl p-6 sm:p-8" style={{ background: '#FFFFFF', border: '1px solid #E0E7FF', boxShadow: '0 4px 24px rgba(99,102,241,0.08)' }}>
        {error && (
          <div className="px-4 py-3 rounded-lg relative mb-6" role="alert" style={{ background: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3' }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#6366F1' }}>Company</label>
            {(companyName === 'MEESHO' || companyName === 'XPREES BEES') ? (
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="mt-1 block w-full p-2 rounded-md font-semibold"
                style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
              >
                <option value="MEESHO">MEESHO</option>
                <option value="XPREES BEES">XPREES BEES</option>
              </select>
            ) : (
              <p className="mt-1 text-lg font-semibold" style={{ color: '#1E1B4B' }}>{companyName}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium" style={{ color: '#6366F1' }}>Location</label>
            <p className="mt-1 text-lg font-semibold" style={{ color: '#1E1B4B' }}>{companyLocation}</p>
          </div>
          <div>
            <label htmlFor="manualDate" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Date and Time</label>
            <input
              type="datetime-local"
              name="manualDate"
              id="manualDate"
              value={manualDate}
              onChange={e => setManualDate(e.target.value)}
              onClick={(e) => (e.target as any).showPicker?.()}
              className="mt-1 block w-full py-2 px-3 rounded-md shadow-sm focus:outline-none sm:text-sm"
              style={{ background: '#FFFFFF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
            />
          </div>

          {/* Slip Mode Toggle (Matched to Debit/Credit style) */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <button
              type="button"
              onClick={() => { setHasSlip(false); setSlip(null); }}
              className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
              style={!hasSlip
                ? { background: '#EEF2FF', border: '2px solid #6366F1', color: '#6366F1' }
                : { background: '#FFFFFF', border: '1px solid #E0E7FF', color: '#6B7280' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="text-sm font-medium">Without Slip</span>
            </button>

            <button
              type="button"
              onClick={() => { setHasSlip(true); if (!slip) handleImageCapture(); }}
              className="flex items-center justify-center gap-2 p-3 rounded-lg transition-all"
              style={hasSlip
                ? { background: '#EEF2FF', border: '2px solid #6366F1', color: '#6366F1' }
                : { background: '#FFFFFF', border: '1px solid #E0E7FF', color: '#6B7280' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#6366F1' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <span className="text-sm font-medium">With Slip</span>
            </button>
          </div>

          {/* Sub-Method Selection (Only for Without Slip) */}
          {!hasSlip && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
              <label className="block text-xs font-black uppercase tracking-[0.2em] mb-3" style={{ color: '#9CA3AF' }}>Transfer Type</label>
              <div className="grid grid-cols-3 gap-2">
                {['UPI', 'IMPS', 'NEFT'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSubMethod(m as any)}
                    className="py-2 px-1 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all"
                    style={subMethod === m
                      ? { background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#FFFFFF', border: '2px solid #6366F1', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }
                      : { background: '#FFFFFF', border: '2px solid #E0E7FF', color: '#9CA3AF' }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}


          {/* Bank Selection Box */}
          <div className={`${hasSlip && !slip ? 'opacity-50 pointer-events-none' : ''}`}>
            <label htmlFor="bank" className="block text-sm font-black uppercase tracking-widest mb-2" style={{ color: '#6366F1' }}>Select Bank</label>
            <select
              id="bank"
              value={selectedBank}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedBank(value);
                rememberRecentDefault('account', value);
              }}
              className="mt-1 block w-full py-3 px-4 rounded-xl shadow-inner focus:outline-none focus:ring-2 font-black uppercase tracking-tight"
              style={{ background: '#F5F7FF', border: '2px solid #E0E7FF', color: '#1E1B4B' }}
            >
              <option value="">-- Choose Account --</option>
              {allBankNames.map(bank => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </div>

          {/* Conditional Slip Upload Box */}
          {hasSlip && (
            <div className="p-4 rounded-xl flex flex-col items-center justify-center" style={{ background: '#F5F7FF', border: '2px dashed #E0E7FF' }}>
              <input type="file" id="slip-upload" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
              {!slip ? (
                <button
                  type="button"
                  onClick={() => handleImageCapture(true)}
                  className="flex flex-col items-center gap-2"
                  style={{ color: '#6366F1' }}
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  <span className="text-[10px] font-black uppercase tracking-widest text-center">Click to Upload Slip Image / PDF</span>
                </button>
              ) : (
                <div className="relative">
                  <SlipImage src={slip} alt="Slip" className="h-40 w-40 object-cover rounded-xl shadow-lg" style={{ border: '2px solid #E0E7FF' }} />
                  <button
                    type="button"
                    onClick={() => setSlip(null)}
                    className="absolute -top-3 -right-3 rounded-full p-1.5 shadow-xl hover:scale-110 transition-transform"
                    style={{ background: '#E11D48', color: '#FFFFFF' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="customerName" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Customer Name (Optional)</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><UserIcon className="h-5 w-5" style={{ color: '#9CA3AF' }} /></div>
              <input
                type="text"
                name="customerName"
                id="customerName"
                value={person}
                onChange={e => setPerson(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 rounded-md"
                style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
                placeholder="Enter customer's name"
              />
            </div>
          </div>
          <div>
            <label htmlFor="amount" className="block text-sm font-medium" style={{ color: '#6366F1' }}>Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><span className="sm:text-sm" style={{ color: '#6B7280' }}>₹</span></div>
              <input
                type="number"
                name="amount"
                id="amount"
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="block w-full pl-7 pr-3 py-2 rounded-md"
                style={{ background: '#F5F7FF', border: '1px solid #E0E7FF', color: '#1E1B4B' }}
                placeholder="0.00"
                required
              />
            </div>
          </div>
          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: '#FFFFFF', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
            >
              {isSubmitting ? 'Submitting...' : 'Submit UPI Credit'}
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

export default UpiCreditPage;

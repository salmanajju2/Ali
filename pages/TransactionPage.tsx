import React, { useState, useMemo, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { NoteCounts, TransactionType } from '../types';
import { DENOMINATIONS } from '../constants';
import CurrencyCounter from '../components/CurrencyCounter';
import { UserIcon } from '../components/icons/UserIcon';
import { BuildingOfficeIcon } from '../components/icons/BuildingOfficeIcon';
import { MapPinIcon } from '../components/icons/MapPinIcon';
import { TrendingUpIcon } from '../components/icons/TrendingUpIcon';
import { TrendingDownIcon } from '../components/icons/TrendingDownIcon';
import { CalendarDaysIcon } from '../components/icons/CalendarDaysIcon';
import { sendTelegramPhoto } from '../services/telegramService';
import { BANK_LOGOS, BANK_NAMES, UPI_BANK_NAMES } from '../constants';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import SimpleCropper from '../components/SimpleCropper';

const TransactionPage: React.FC = () => {
  const { user, addTransaction, companyNames, locations, allBankNames } = useAppContext();
  const { state: routeState } = useLocation();
  const navigate = useNavigate();

  const currentUserName = user?.displayName || user?.email || 'Unknown User';

  const [person, setPerson] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [recordedBy, setRecordedBy] = useState(currentUserName);
  const [breakdown, setBreakdown] = useState<NoteCounts>({});
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [slip, setSlip] = useState<string | null>(null);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [manualDate, setManualDate] = useState(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19));

  const [prefilledType, setPrefilledType] = useState<TransactionType | null>(null);
  const [isPersonalUdhar, setIsPersonalUdhar] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasSlip] = useState(true); // Default to true and remove setter

  useEffect(() => {
    if (routeState?.person && routeState?.company) {
      setPerson(routeState.person);
      setCompany(routeState.company);
      setPrefilledType(routeState.type || null);
      setIsPersonalUdhar(true);
    } else {
      setIsPersonalUdhar(false);
      setPrefilledType(null);
    }
  }, [routeState]);

  useEffect(() => {
    setRecordedBy(currentUserName);
  }, [currentUserName]);

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
              // hasSlip is always true in TransactionPage
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

  const totalAmount = useMemo(() => {
    return DENOMINATIONS.reduce((sum, denom) => sum + (breakdown[denom] || 0) * denom, 0);
  }, [breakdown]);

  const resetForm = (clearPrefilled = false) => {
    if (!isPersonalUdhar || clearPrefilled) {
      setPerson('');
      setCompany('');
      setIsPersonalUdhar(false);
      setPrefilledType(null);
      navigate('.', { replace: true });
    }
    setLocation('');
    setSelectedBank('');
    setSlip(null);
    setBreakdown({});
    setError(null);
    setManualDate(new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19));
  };

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
    // Reset file input value so selecting the same file again works
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
      if (!slip) handleImageCapture(false);

    }
  };

  const handleTransaction = async (transactionType: TransactionType, customNotes?: string) => {
    if (!location) {
      setError("Location is a required field.");
      return;
    }
    if (totalAmount < 0) {
      setError("Transaction amount cannot be negative.");
      return;
    }

    setError(null);
    setIsSubmitting(true);
    setSuccessMessage(null);

    try {
      const transactionData = {
        type: transactionType,
        paymentMethod: 'cash' as const,
        company: company || 'NA',
        person: person,
        bank: selectedBank || undefined,
        slip: hasSlip ? (slip || undefined) : undefined,
        location: location,
        recordedBy: recordedBy,
        amount: totalAmount,
        notes: customNotes || '',
        breakdown,
        manualDate: manualDate,
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

      const breakdownString = DENOMINATIONS
        .map(denom => {
          const count = breakdown[denom];
          return count ? `₹${denom} x ${count} = ${denom * count}` : null;
        })
        .filter(Boolean)
        .join('\n');


      // sendTelegramMessage call removed as per user request (Only image should go)
      // await sendTelegramMessage(telegramMessage);

      setSuccessMessage(`Transaction of ₹${totalAmount.toLocaleString('en-IN')} recorded successfully!`);
      resetForm(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  return (
    <div className="modern-entry-shell transaction-page-enter max-w-3xl mx-auto">
      <div className="p-3 sm:p-5 md:p-6">
      {successMessage && (
        <div
          className="transaction-success-pop px-4 py-3 rounded-2xl text-sm font-semibold text-center mb-4"
          role="status"
          style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#059669' }}
        >
          <span className="transaction-success-tick" aria-hidden="true">✓</span> {successMessage}
        </div>
      )}
      {error && (
        <div
          className="px-4 py-3 rounded-2xl text-sm font-semibold text-center mb-6 animate-in slide-in-from-top-4"
          style={{ background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' }}
        >
          ⚠️ {error}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:gap-4">

        {/* Cash denominations and total */}
        <section className="modern-section order-1 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h2 className="compact-section-heading !mb-0">Cash denominations</h2>
            <div className="compact-inline-total">
              <span>Total</span>
              <strong>₹{totalAmount.toLocaleString('en-IN')}</strong>
            </div>
          </div>
          <CurrencyCounter value={breakdown} onChange={setBreakdown} />
        </section>

        {/* Company, Location & Date */}
        <section className="modern-section order-3 grid grid-cols-2 gap-3 p-3 sm:p-4">
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>Company</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none"><BuildingOfficeIcon className="h-4 w-4" style={{ color: '#A5B4FC' } as any} /></div>
              <select
                value={company} onChange={e => setCompany(e.target.value)} disabled={isPersonalUdhar}
                className="block w-full appearance-none pl-8 pr-2 py-2.5 rounded-xl text-xs outline-none font-black uppercase transition-all disabled:opacity-60"
                style={{ background: '#F5F7FF', border: '1.5px solid #E0E7FF', color: '#1E1B4B' }}
                onFocus={e => { e.target.style.borderColor = '#818CF8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E0E7FF'; e.target.style.boxShadow = 'none'; }}
              >
                <option value="">Select Company</option>
                {isPersonalUdhar && <option value="NA">NA</option>}
                {companyNames.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>Location</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none"><MapPinIcon className="h-4 w-4" style={{ color: '#A5B4FC' } as any} /></div>
              <select
                value={location} onChange={e => setLocation(e.target.value)} required
                className="block w-full pl-8 pr-2 py-2.5 rounded-xl text-xs outline-none font-black uppercase transition-all"
                style={{ background: '#F5F7FF', border: '1.5px solid #E0E7FF', color: '#1E1B4B' }}
                onFocus={e => { e.target.style.borderColor = '#818CF8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E0E7FF'; e.target.style.boxShadow = 'none'; }}
              >
                <option value="">Select Location</option>
                {locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
            </div>
          </div>
          <div className="mobile-extra-transaction-field">
            <label className="block text-[10px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#4338CA' }}>Customer Name</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none"><UserIcon className="h-4 w-4" style={{ color: '#A5B4FC' } as any} /></div>
              <input
                type="text" value={person} onChange={e => setPerson(e.target.value)} disabled={isPersonalUdhar}
                className="block w-full pl-8 pr-3 py-2.5 rounded-xl text-xs font-semibold outline-none transition-all placeholder:text-slate-500 disabled:opacity-60"
                style={{ background: '#FFFFFF', border: '1.5px solid #C7D2FE', color: '#1E1B4B' }}
                placeholder="Enter customer name"
                onFocus={e => { e.target.style.borderColor = '#818CF8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E0E7FF'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          <div className="mobile-extra-transaction-field">
            <label className="block text-[9px] font-black uppercase tracking-widest mb-1 ml-1" style={{ color: '#6366F1' }}>Account</label>
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="block w-full px-3 py-2.5 rounded-xl font-black uppercase outline-none transition-all text-xs"
              style={{ background: '#F5F7FF', border: '1.5px solid #E0E7FF', color: '#1E1B4B' }}
              onFocus={e => { e.target.style.borderColor = '#818CF8'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#E0E7FF'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">Select Account</option>
              {allBankNames.map(bank => <option key={bank} value={bank}>{bank}</option>)}
            </select>
          </div>
        </section>

        {/* Date, slip and transaction actions */}
        <div className="compact-action-bar order-4 sticky z-20 space-y-2.5">
          {prefilledType ? (
            <button
              type="button"
              onClick={() => handleTransaction(prefilledType)}
              disabled={isSubmitting || totalAmount < 0}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50"
              style={{
                background: prefilledType === 'credit' ? 'linear-gradient(135deg, #10B981 0%, #059669 100%)' : 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)',
                boxShadow: prefilledType === 'credit' ? '0 6px 20px rgba(16,185,129,0.35)' : '0 6px 20px rgba(244,63,94,0.35)',
              }}
            >
              {prefilledType === 'credit' ? '↑' : '↓'} {prefilledType} — ₹{totalAmount.toLocaleString('en-IN')}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => handleTransaction('debit')} disabled={isSubmitting || totalAmount <= 0} className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)', boxShadow: '0 6px 20px rgba(244,63,94,0.30)' }}>
                <TrendingDownIcon className="h-5 w-5" /> Debit
              </button>
              <button type="button" onClick={() => handleTransaction('credit')} disabled={isSubmitting || totalAmount <= 0} className="flex items-center justify-center gap-1.5 py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', boxShadow: '0 6px 20px rgba(16,185,129,0.30)' }}>
                <TrendingUpIcon className="h-5 w-5" /> Credit
              </button>
            </div>
          )}
          <div className="mobile-extra-transaction-actions grid grid-cols-2 gap-2.5">
            <label className="compact-action-control">
              <span>Date</span>
              <input type="datetime-local" value={manualDate} onChange={e => setManualDate(e.target.value)} />
            </label>
            <div className="compact-action-control">
              <input type="file" id="slip-upload" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
              <span>Slip</span>
              <button type="button" onClick={() => slip ? setSlip(null) : handleImageCapture(false)}>
                {slip ? 'Remove slip' : 'Add slip'}
              </button>
            </div>
          </div>
        </div>
      </div>
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

export default TransactionPage;

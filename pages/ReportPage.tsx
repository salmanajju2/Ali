import React, { useMemo, useEffect, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Transaction } from '../types';
import { ArrowLeftIcon } from '../components/icons/ArrowLeftIcon';
import emailjs from '@emailjs/browser';
// @ts-ignore
import html2pdf from 'html2pdf.js';
import { Capacitor } from '@capacitor/core';

const ReportPage: React.FC = () => {
    const { companyName } = useParams<{ companyName: string }>();
    const { transactions } = useAppContext();
    const [generationDate] = useState(new Date());

    // Email Modal States
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [emailInput, setEmailInput] = useState('');
    const [isSendingEmail, setIsSendingEmail] = useState(false);
    const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    const handleSendEmail = async () => {
        if (!emailInput || !emailInput.includes('@')) {
            setEmailStatus({ type: 'error', message: 'Please enter a valid email address.' });
            return;
        }

        setIsSendingEmail(true);
        setEmailStatus({ type: null, message: '' });

        try {
            // Create a rich HTML report instead of PDF
            let htmlReport = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 800px; margin: 0 auto; color: #333; line-height: 1.6;">
                <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px;">
                    <h2 style="color: #1e3a8a; margin: 0 0 5px 0;">ALI ENTERPRISES</h2>
                    <h3 style="color: #475569; margin: 0; font-size: 16px;">FINANCIAL TRANSACTION STATEMENT</h3>
                </div>
                
                <table style="width: 100%; margin-bottom: 25px; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 5px 0;"><strong>Company:</strong> ${decodedCompanyName}</td>
                        <td style="padding: 5px 0; text-align: right;"><strong>Date Generated:</strong> ${formattedDate(generationDate)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0;"><strong>Statement Period:</strong> ${getStatementPeriod()}</td>
                        <td style="padding: 5px 0; text-align: right;"><strong>Location:</strong> ${locationFilter || 'All'}</td>
                    </tr>
                </table>
            `;

            if (reportData && reportData.days.length > 0) {
                reportData.days.forEach(day => {
                    htmlReport += `
                    <div style="margin-bottom: 30px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden;">
                        <div style="background-color: #f1f5f9; padding: 12px 15px; font-weight: bold; border-bottom: 1px solid #cbd5e1;">
                            Date: ${day.date}
                        </div>
                        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                            <thead>
                                <tr style="background-color: #f8fafc;">
                                    <th style="border-bottom: 1px solid #cbd5e1; padding: 10px; text-align: left;">Customer Name</th>
                                    <th style="border-bottom: 1px solid #cbd5e1; padding: 10px; text-align: right;">Cash</th>
                                    <th style="border-bottom: 1px solid #cbd5e1; padding: 10px; text-align: right;">UPI</th>
                                    <th style="border-bottom: 1px solid #cbd5e1; padding: 10px; text-align: right; background-color: #eff6ff;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    day.customers.forEach(c => {
                        const cashStr = c.cash.length > 0 ? c.cash.map(v => currencyFormatter.format(v)).join('<br/>') : '-';
                        const upiStr = c.upi.length > 0 ? c.upi.map(v => currencyFormatter.format(v)).join('<br/>') : '-';

                        htmlReport += `
                                <tr>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px;"><strong>${c.name}</strong></td>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right;">${cashStr}</td>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right;">${upiStr}</td>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; background-color: #f8fafc; font-weight: bold;">${currencyFormatter.format(c.total)}</td>
                                </tr>
                        `;
                    });

                    const debitStr = day.debitAmounts.length > 0 ? day.debitAmounts.map(v => currencyFormatter.format(v)).join('<br/>') : '-';

                    htmlReport += `
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="3" style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; font-weight: bold;">Total Credit</td>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; font-weight: bold; color: #047857; background-color: #ecfdf5;">${currencyFormatter.format(day.dayTotalCredit)}</td>
                                </tr>
                                <tr>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; font-style: italic; color: #be123c;">Entry (Debit)</td>
                                    <td colspan="2" style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; color: #be123c;">${debitStr}</td>
                                    <td style="border-bottom: 1px solid #e2e8f0; padding: 10px; text-align: right; font-weight: bold; color: #be123c; background-color: #fff1f2;">${currencyFormatter.format(day.dayTotalDebit)}</td>
                                </tr>
                                <tr style="background-color: #f1f5f9;">
                                    <td colspan="3" style="padding: 12px 10px; text-align: right; font-weight: bold; text-transform: uppercase;">Closing Balance (${day.date})</td>
                                    <td style="padding: 12px 10px; text-align: right; font-weight: bold; ${day.dayClosingBalance >= 0 ? 'color: #047857;' : 'color: #be123c;'}">${currencyFormatter.format(day.dayClosingBalance)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    `;
                });

                htmlReport += `
                <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <h3 style="margin: 0 0 15px 0; text-align: center; color: #e2e8f0; letter-spacing: 1px;">FINAL SUMMARY</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
                        <tr>
                            <td style="padding: 8px 5px; color: #cbd5e1;">Total Credit:</td>
                            <td style="padding: 8px 5px; text-align: right; color: #34d399; font-weight: bold;">${currencyFormatter.format(reportData.totalCredit)}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 5px; color: #cbd5e1;">Total Debit:</td>
                            <td style="padding: 8px 5px; text-align: right; color: #f87171; font-weight: bold;">${currencyFormatter.format(reportData.totalDebit)}</td>
                        </tr>
                        <tr style="border-top: 1px solid #334155;">
                            <td style="padding: 15px 5px 5px 5px; font-weight: bold; font-size: 18px; color: white;">Net Balance:</td>
                            <td style="padding: 15px 5px 5px 5px; text-align: right; font-weight: bold; font-size: 18px; ${reportData.closingBalance >= 0 ? 'color: #34d399;' : 'color: #f87171;'}">${currencyFormatter.format(reportData.closingBalance)}</td>
                        </tr>
                    </table>
                </div>
                `;
            }

            htmlReport += `</div>`;

            // Send via EmailJS
            const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
            const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
            const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

            if (!serviceId || !templateId || !publicKey) {
                throw new Error("EmailJS credentials are missing in environment variables.");
            }

            await emailjs.send(serviceId, templateId, {
                to_email: emailInput,
                company_name: decodedCompanyName,
                content_html: htmlReport, // Passing HTML directly!
            }, publicKey);

            setEmailStatus({ type: 'success', message: 'Email sent successfully!' });
            setTimeout(() => {
                setIsEmailModalOpen(false);
                setEmailStatus({ type: null, message: '' });
                setEmailInput('');
            }, 3000);

        } catch (error: any) {
            console.error('Failed to send email:', error);
            const errorMsg = error?.text || error?.message || 'Failed to send email.';
            setEmailStatus({ type: 'error', message: `Error: ${errorMsg}` });
        } finally {
            setIsSendingEmail(false);
        }
    };

    const [searchParams] = useSearchParams();
    const locationFilter = searchParams.get('location');
    const filterType = searchParams.get('type') || 'all';
    const searchTerm = searchParams.get('search') || '';
    const showAllDates = searchParams.get('showAllDates') === 'true';
    const filterYear = searchParams.get('year') || 'all';
    const filterMonth = searchParams.get('month') || 'all';
    const filterDay = searchParams.get('day') || 'all';
    const filterSubCompany = searchParams.get('subCompany') || 'all';

    const decodedCompanyName = companyName ? decodeURIComponent(companyName) : '';

    const handleDownloadPDF = () => {
        const element = document.getElementById('report-content');
        if (!element) return;

        const actionButtons = document.getElementById('report-actions');
        if (actionButtons) actionButtons.style.display = 'none';

        const opt = {
            margin: 10,
            filename: `${decodedCompanyName}_Report_${new Date().toLocaleDateString('en-IN').replace(/\//g, '-')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt as any).from(element).save().then(() => {
            if (actionButtons) actionButtons.style.display = 'flex';
        });
    };

    const handleSharePDF = async () => {
        const element = document.getElementById('report-content');
        if (!element) return;

        const actionButtons = document.getElementById('report-actions');
        if (actionButtons) actionButtons.style.display = 'none';

        const opt = {
            margin: 10,
            filename: `${decodedCompanyName}_Report.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        try {
            const pdf = html2pdf().set(opt as any).from(element);
            const pdfBlob = await pdf.output('blob');
            
            // On Mobile: Use Filesystem + Share
            if (Capacitor.isNativePlatform()) {
                const { Filesystem, Directory } = await import('@capacitor/filesystem');
                const { Share } = await import('@capacitor/share');
                
                const reader = new FileReader();
                reader.readAsDataURL(pdfBlob);
                reader.onloadend = async () => {
                    const base64data = (reader.result as string).split(',')[1];
                    const fileName = `${decodedCompanyName}_Report_${Date.now()}.pdf`;
                    
                    try {
                        const savedFile = await Filesystem.writeFile({
                            path: fileName,
                            data: base64data,
                            directory: Directory.Cache
                        });
                        
                        await Share.share({
                            title: `${decodedCompanyName} Report`,
                            text: `Financial Report for ${decodedCompanyName}`,
                            files: [savedFile.uri],
                            dialogTitle: 'Share Financial Report',
                        });
                    } catch (err) {
                        console.error('Mobile sharing failed:', err);
                        handleDownloadPDF();
                    }
                };
            } else {
                // On Web: Fallback to download
                handleDownloadPDF();
            }
        } catch (error) {
            console.error('PDF Generation for sharing failed:', error);
        } finally {
            if (actionButtons) actionButtons.style.display = 'flex';
        }
    };

    useEffect(() => {
        const originalTitle = document.title;
        const today = new Date();
        const dateString = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
        document.title = `${decodedCompanyName}_Report_${dateString}`;

        return () => {
            document.title = originalTitle;
        };
    }, [decodedCompanyName]);

    const companyTransactions = useMemo(() => {
        let filtered = transactions.filter(tx => {
            const comp = tx.company || 'NA';
            if (decodedCompanyName === 'MEESHO' || decodedCompanyName === 'XPREES BEES') {
                return comp === 'MEESHO' || comp === 'XPREES BEES';
            }
            return comp === decodedCompanyName;
        });

        if (locationFilter && locationFilter !== 'all') {
            filtered = filtered.filter(tx => tx.location === locationFilter);
        }

        if (filterSubCompany !== 'all') {
            filtered = filtered.filter(tx => tx.company === filterSubCompany);
        }

        if (!showAllDates) {
            const today = new Date();
            filtered = filtered.filter(tx => {
                const txDate = new Date(tx.date);
                return txDate.getFullYear() === today.getFullYear() &&
                    txDate.getMonth() === today.getMonth() &&
                    txDate.getDate() === today.getDate();
            });
        } else {
            if (filterYear !== 'all') {
                filtered = filtered.filter(tx => new Date(tx.date).getFullYear().toString() === filterYear);
            }
            if (filterMonth !== 'all') {
                filtered = filtered.filter(tx => (new Date(tx.date).getMonth() + 1).toString() === filterMonth);
            }
            if (filterDay !== 'all') {
                filtered = filtered.filter(tx => new Date(tx.date).getDate().toString() === filterDay);
            }
        }

        if (filterType !== 'all') {
            filtered = filtered.filter(tx => tx.type === filterType);
        }

        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(tx =>
                tx.person?.toLowerCase().includes(searchLower) ||
                tx.amount.toString().includes(searchLower) ||
                tx.paymentMethod.toLowerCase().includes(searchLower)
            );
        }

        return filtered.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    }, [transactions, decodedCompanyName, locationFilter, filterType, filterSubCompany, showAllDates, filterYear, filterMonth, filterDay, searchTerm]);

    const reportData = useMemo(() => {
        if (!companyTransactions.length) return null;

        // Group by Date
        const byDate = companyTransactions.reduce((acc, tx) => {
            const dateKey = new Date(tx.date).toLocaleDateString('en-GB');
            if (!acc[dateKey]) acc[dateKey] = [];
            acc[dateKey].push(tx);
            return acc;
        }, {} as { [key: string]: Transaction[] });

        const days = Object.entries(byDate).map(([date, txs]) => {
            const transactions = txs as Transaction[];
            const credits = transactions.filter(tx => tx.type === 'credit');
            const debits = transactions.filter(tx => tx.type === 'debit');

            const creditsByPerson = credits.reduce((acc, tx) => {
                const name = (tx.person || 'N/A').trim().toUpperCase();
                if (!acc[name]) acc[name] = [];
                acc[name].push(tx);
                return acc;
            }, {} as { [key: string]: Transaction[] });

            const customers = Object.entries(creditsByPerson).map(([name, pTxs]) => {
                const personTxs = pTxs as Transaction[];
                const cash = personTxs.filter(tx => tx.paymentMethod === 'cash').map(tx => tx.amount);
                const upi = personTxs.filter(tx => tx.paymentMethod === 'upi').map(tx => tx.amount);
                const total = personTxs.reduce((sum, tx) => sum + tx.amount, 0);
                return { name, cash, upi, total };
            });

            const dayTotalCredit = credits.reduce((sum, tx) => sum + tx.amount, 0);
            const dayTotalDebit = debits.reduce((sum, tx) => sum + tx.amount, 0);
            const debitAmounts = debits.map(tx => tx.amount);

            return {
                date,
                customers,
                debitAmounts,
                dayTotalCredit,
                dayTotalDebit,
                dayClosingBalance: dayTotalCredit - dayTotalDebit,
                maxCashCount: Math.max(0, ...customers.map(c => c.cash.length), debitAmounts.length),
                maxUpiCount: Math.max(0, ...customers.map(c => c.upi.length))
            };
        }).sort((a, b) => {
            const dateA = a.date.split('/').reverse().join('');
            const dateB = b.date.split('/').reverse().join('');
            return dateA.localeCompare(dateB);
        });

        const totalCredit = days.reduce((sum, d) => sum + d.dayTotalCredit, 0);
        const totalDebit = days.reduce((sum, d) => sum + d.dayTotalDebit, 0);
        const closingBalance = totalCredit - totalDebit;

        return { days, totalCredit, totalDebit, closingBalance };
    }, [companyTransactions]);

    const formattedDate = (date: Date) => date.toLocaleString('en-IN', {
        day: '2-digit', month: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });

    const getStatementPeriod = () => {
        if (showAllDates) {
            if (filterYear !== 'all' && filterMonth !== 'all' && filterDay !== 'all') {
                return `${filterDay}/${filterMonth}/${filterYear}`;
            }
            if (filterYear !== 'all' && filterMonth !== 'all') {
                const monthName = new Date(2000, parseInt(filterMonth) - 1).toLocaleString('default', { month: 'long' });
                return `${monthName} ${filterYear}`;
            }
            if (filterYear !== 'all') {
                return `${filterYear}`;
            }
        }
        return new Date().toLocaleDateString('en-IN');
    };

    if (!reportData) {
        return (
            <div className="text-center p-8">
                <p>No transactions found for {decodedCompanyName} matching the applied filters.</p>
                <Link to={`/company/${encodeURIComponent(decodedCompanyName)}?${searchParams.toString()}`} className="text-blue-600 hover:underline mt-4 inline-block no-print">Go Back</Link>
            </div>
        );
    }

    const currencyFormatter = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

    return (
        <div id="report-content" className="bg-white px-[20px] py-8 print-container min-w-0">
            <div className="no-print mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <Link to={`/company/${encodeURIComponent(decodedCompanyName)}?${searchParams.toString()}`} className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline font-medium">
                    <ArrowLeftIcon className="h-5 w-5" /><span>Back to History</span>
                </Link>
                <div id="report-actions" className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
                    <button
                        onClick={handleDownloadPDF}
                        className="flex-1 sm:flex-none justify-center bg-red-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2 text-sm sm:text-base shadow-sm"
                    >
                        📥 <span className="whitespace-nowrap">Download</span>
                    </button>
                    <button
                        onClick={handleSharePDF}
                        className="flex-1 sm:flex-none justify-center bg-emerald-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2 text-sm sm:text-base shadow-sm"
                    >
                        📤 <span className="whitespace-nowrap">Share</span>
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="flex-1 sm:flex-none justify-center bg-gray-800 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium hover:bg-gray-900 transition-colors flex items-center gap-2 text-sm sm:text-base shadow-sm"
                    >
                        🖨️ <span className="whitespace-nowrap">Print</span>
                    </button>
                    <button
                        onClick={() => setIsEmailModalOpen(true)}
                        className="flex-1 sm:flex-none justify-center bg-blue-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm sm:text-base shadow-sm"
                    >
                        📧 <span className="whitespace-nowrap">Email</span>
                    </button>
                </div>
            </div>

            <header className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-4xl font-bold text-black">ALI ENTERPRISES</h1>
                    <p className="text-lg text-gray-600 tracking-wider font-bold">FINANCIAL TRANSACTION STATEMENT</p>
                </div>
                <div className="text-right">
                    <h2 className="text-2xl font-semibold mt-2">{decodedCompanyName}</h2>
                    <p className="text-xs text-gray-500 mt-1">GENERATED: {formattedDate(generationDate)}</p>
                    <p className="text-xs text-gray-500">LOCATION: {locationFilter || 'N/A'}</p>
                </div>
            </header>

            <div className="mb-8">
                <p className="text-sm"><span className="font-bold">STATEMENT PERIOD:</span> {getStatementPeriod()}</p>
            </div>

            <hr className="border-black mb-8" />

            <div className="space-y-12">
                {reportData.days.map((day, dIdx) => {
                    const numCashCols = day.maxCashCount;
                    const numUpiCols = day.maxUpiCount;
                    const totalFooterCols = 1 + numCashCols + numUpiCols;

                    return (
                        <div key={day.date} className="mb-12 break-inside-avoid">
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse border-2 border-black text-[9px] sm:text-[11px]">
                                    <thead className="font-bold bg-gray-100 uppercase text-[9px]">
                                        <tr>
                                            <th rowSpan={2} className="border-2 border-black p-1 text-left">Customer Name</th>
                                            {numCashCols > 0 && <th colSpan={numCashCols} className="border-2 border-black p-1">Cash</th>}
                                            {numUpiCols > 0 && <th colSpan={numUpiCols} className="border-2 border-black p-1">UPI</th>}
                                            <th rowSpan={2} className="border-2 border-black p-1 text-right">Day Total</th>
                                        </tr>
                                        <tr>
                                            {Array.from({ length: numCashCols }, (_, i) => (
                                                <th key={`cash-h-${i}`} className="border-2 border-black p-1">{i + 1}</th>
                                            ))}
                                            {Array.from({ length: numUpiCols }, (_, i) => (
                                                <th key={`upi-h-${i}`} className="border-2 border-black p-1">{i + 1}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {day.customers.map((c, cIdx) => (
                                            <tr key={`${day.date}_${c.name}_${cIdx}`} className="border-b border-black">
                                                <td className="border-2 border-black p-2 font-bold uppercase whitespace-nowrap">{c.name}</td>
                                                {Array.from({ length: numCashCols }, (_, i) => (
                                                    <td key={`c-${i}`} className="border-2 border-black p-1 text-center font-bold">
                                                        {c.cash[i] !== undefined ? currencyFormatter.format(c.cash[i]) : ''}
                                                    </td>
                                                ))}
                                                {Array.from({ length: numUpiCols }, (_, i) => (
                                                    <td key={`u-${i}`} className="border-2 border-black p-1 text-center font-bold">
                                                        {c.upi[i] !== undefined ? currencyFormatter.format(c.upi[i]) : ''}
                                                    </td>
                                                ))}
                                                <td className="border-2 border-black p-2 text-right font-black bg-gray-50/50">
                                                    {currencyFormatter.format(c.total)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="font-black uppercase text-[10px] tracking-tight">
                                        {/* Total Credit Row */}
                                        <tr className="bg-gray-50">
                                            <td colSpan={totalFooterCols} className="border-2 border-black p-2 text-right">Total Credit</td>
                                            <td className="border-2 border-black p-2 text-right bg-emerald-50 text-emerald-800">
                                                {currencyFormatter.format(day.dayTotalCredit)}
                                            </td>
                                        </tr>
                                        {/* Entry (Debit) Row */}
                                        <tr>
                                            <td className="border-2 border-black p-2 italic text-rose-700">Entry (Debit)</td>
                                            {Array.from({ length: numCashCols }, (_, i) => (
                                                <td key={`f-c-${i}`} className="border-2 border-black p-2 text-right text-rose-700">
                                                    {day.debitAmounts[i] !== undefined ? currencyFormatter.format(day.debitAmounts[i]) : ''}
                                                </td>
                                            ))}
                                            {Array.from({ length: numUpiCols }, (_, i) => (
                                                <td key={`f-u-${i}`} className="border-2 border-black p-2 text-right text-rose-700">
                                                    {/* UPI debits empty by logic */}
                                                </td>
                                            ))}
                                            <td className="border-2 border-black p-2 text-right bg-rose-50 text-rose-700">
                                                {currencyFormatter.format(day.dayTotalDebit)}
                                            </td>
                                        </tr>
                                        {/* Closing Balance Row */}
                                        <tr className="bg-gray-100">
                                            <td colSpan={totalFooterCols} className="border-2 border-black p-2 text-right">Closing Balance ({day.date})</td>
                                            <td className={`border-2 border-black p-2 text-right bg-emerald-100 ${day.dayClosingBalance >= 0 ? 'text-emerald-900' : 'text-red-700'}`}>
                                                {currencyFormatter.format(day.dayClosingBalance)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isEmailModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 no-print" style={{ zIndex: 9999 }}>
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-indigo-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                        <h3 className="text-xl font-black mb-4 uppercase tracking-tight" style={{ color: '#1E1B4B' }}>Email Report</h3>

                        <div className="mb-4">
                            <label className="block text-[11px] font-black uppercase tracking-widest mb-1.5 ml-1" style={{ color: '#6366F1' }}>
                                Recipient Email Address
                            </label>
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                placeholder="e.g. client@example.com"
                                className="w-full px-4 py-3 rounded-2xl text-sm outline-none transition-all"
                                style={{
                                    background: '#F5F7FF',
                                    border: '1.5px solid #E0E7FF',
                                    color: '#1E1B4B',
                                }}
                                onFocus={e => {
                                    e.target.style.borderColor = '#818CF8';
                                    e.target.style.background = '#fff';
                                    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)';
                                }}
                                onBlur={e => {
                                    e.target.style.borderColor = '#E0E7FF';
                                    e.target.style.background = '#F5F7FF';
                                    e.target.style.boxShadow = 'none';
                                }}
                                disabled={isSendingEmail}
                            />
                        </div>

                        {emailStatus.message && (
                            <div className="mb-4 px-4 py-3 rounded-2xl text-xs font-semibold text-center"
                                 style={emailStatus.type === 'success' 
                                     ? { background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#059669' } 
                                     : { background: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' }
                                 }
                            >
                                {emailStatus.message}
                            </div>
                        )}

                        <div className="flex gap-3 justify-end mt-6">
                            <button
                                onClick={() => {
                                    setIsEmailModalOpen(false);
                                    setEmailStatus({ type: null, message: '' });
                                }}
                                className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all border"
                                style={{
                                    background: '#F5F7FF',
                                    border: '1.5px solid #E0E7FF',
                                    color: '#6B7280',
                                }}
                                disabled={isSendingEmail}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSendEmail}
                                disabled={isSendingEmail || !emailInput}
                                className="text-white px-5 py-2.5 rounded-xl font-black tracking-widest text-xs active:scale-95 transition-all shadow-md"
                                style={{
                                    background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                                    boxShadow: '0 4px 14px rgba(99,102,241,0.30)',
                                }}
                            >
                                {isSendingEmail ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full"></span>
                                        Sending...
                                    </span>
                                ) : (
                                    'Send'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportPage;

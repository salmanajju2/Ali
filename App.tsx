import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Header from './components/Header';
import BottomNavigation from './components/BottomNavigation';
import LoginPage from './pages/LoginPage';
import TransactionPage from './pages/TransactionPage';
import HistoryPage from './pages/HistoryPage';
import VaultPage from './pages/VaultPage';
import SummaryPage from './pages/SummaryPage';
import AccountsPage from './pages/AccountsPage';
import SingleBankHistoryPage from './pages/SingleBankHistoryPage';
import UserProfilePage from './pages/UserProfilePage';
import CompanyHistoryPage from './pages/CompanyHistoryPage';
import GroupHistoryPage from './pages/GroupHistoryPage';
import GroupPersonHistoryPage from './pages/GroupPersonHistoryPage';
import DebitEntryPage from './pages/DebitEntryPage';
import UpiCreditPage from './pages/UpiCreditPage';
import ReportPage from './pages/ReportPage';
import EditTransactionPage from './pages/EditTransactionPage';
import UdharPage from './pages/UdharPage';
import PersonUdharPage from './pages/PersonUdharPage';

const BackButtonHandler: React.FC = () => {
  useEffect(() => {
    // ✅ FIX: Listener handle track karo taaki cleanup ho sake (memory leak fix)
    let listenerHandle: { remove: () => void } | null = null;
    const setupBackButton = async () => {
      listenerHandle = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          CapacitorApp.exitApp();
        }
      });
    };
    setupBackButton();
    // Cleanup: listener remove karo jab component unmount ho
    return () => { listenerHandle?.remove(); };
  }, []);
  return null;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppProvider>
        <Router>
          <BackButtonHandler />
          <div className="min-h-screen flex flex-col" style={{ background: '#F5F7FF', color: '#1E1B4B' }}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              
              {/* Protected Routes */}
              <Route path="/*" element={
                <ProtectedRoute>
                  <div className="flex flex-col min-h-screen">
                    {/* Header - Hidden on small screens, shown on larger screens */}
                    <div className="hidden md:block no-print">
                      <Header />
                    </div>
                    
                    {/* Main content with responsive padding */}
                    <main className="flex-1 container mx-auto px-2 sm:px-6 lg:px-8 py-4 pb-28 md:pb-6 overflow-y-auto">
                      <Routes>
                        <Route path="/" element={<TransactionPage />} />
                        <Route path="/history" element={<HistoryPage />} />
                        <Route path="/vault" element={<VaultPage />} />
                        <Route path="/summary" element={<SummaryPage />} />
                        <Route path="/accounts" element={<AccountsPage />} />
                        <Route path="/accounts/:bankName" element={<SingleBankHistoryPage />} />
                        <Route path="/profile" element={<UserProfilePage />} />
                        <Route path="/udhar" element={<UdharPage />} />
                        <Route path="/udhar/:personName" element={<PersonUdharPage />} />
                        <Route path="/company/:companyName" element={<CompanyHistoryPage />} />
                        <Route path="/group/:groupName" element={<GroupHistoryPage />} />
                        <Route path="/group/:groupName/person/:personName" element={<GroupPersonHistoryPage />} />
                        <Route path="/debit-entry" element={<DebitEntryPage />} />
                        <Route path="/upi-credit" element={<UpiCreditPage />} />
                        <Route path="/report/:companyName" element={<ReportPage />} />
                        <Route path="/edit/:transactionId" element={<EditTransactionPage />} />
                        
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </main>
                    
                    {/* Bottom Navigation - Only on mobile/tablet */}
                    <div className="md:hidden no-print">
                      <BottomNavigation />
                    </div>
                  </div>
                </ProtectedRoute>
              } />
            </Routes>
          </div>
        </Router>
      </AppProvider>
    </AuthProvider>
  );
};

export default App;

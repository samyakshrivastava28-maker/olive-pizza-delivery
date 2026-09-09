import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { DeliveryLayout } from './components/layout/DeliveryLayout';
import DashboardPage from './pages/DashboardPage';
import LiveOrdersPage from './pages/LiveOrdersPage';
import DeliveryHistoryPage from './pages/DeliveryHistoryPage';
import AccountPage from './pages/AccountPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import DeliveryPushNotificationManager from './services/DeliveryPushNotificationManager';
import { useDeliveryStore } from './store/deliveryStore';

export default function App() {
  const { initAuth, isAuthChecking, restrictedReason } = useDeliveryStore();

  useEffect(() => {
    const unsub = initAuth();
    return () => unsub();
  }, [initAuth]);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Verifying Delivery Partner Session...</p>
        </div>
      </div>
    );
  }

  if (restrictedReason) {
    return (
      <BrowserRouter>
        <AccessDeniedPage />
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <DeliveryPushNotificationManager />
      <Toaster 
        position="top-center" 
        toastOptions={{
          style: {
            background: '#0F172A',
            color: '#F8FAFC',
            border: '1px solid #334155',
            fontSize: '12px',
            borderRadius: '16px'
          }
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        
        <Route element={<DeliveryLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/live-orders" element={<LiveOrdersPage />} />
          <Route path="/history" element={<DeliveryHistoryPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
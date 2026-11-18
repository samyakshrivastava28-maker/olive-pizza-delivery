import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { DeliveryLayout } from './components/layout/DeliveryLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import DeliveryPushNotificationManager from './services/DeliveryPushNotificationManager';
import { useDeliveryStore } from './store/deliveryStore';

const LiveOrdersPage = lazy(() => import('./pages/LiveOrdersPage'));
const DeliveryHistoryPage = lazy(() => import('./pages/DeliveryHistoryPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AccessDeniedPage = lazy(() => import('./pages/AccessDeniedPage'));

const PageLoader = () => (
  <div className="flex h-64 w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
  </div>
);

export default function App() {
  const { initAuth, isAuthChecking } = useDeliveryStore();

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
      <Suspense fallback={<PageLoader />}>
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
      </Suspense>
    </BrowserRouter>
  );
}
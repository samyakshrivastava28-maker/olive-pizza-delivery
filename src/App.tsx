import React from 'react';
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

export default function App() {
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
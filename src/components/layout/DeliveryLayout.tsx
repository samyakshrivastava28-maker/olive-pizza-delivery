import React, { useEffect, useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { BottomNav } from './BottomNav';
import { PersistentRiderOrderSheet } from '../delivery/PersistentRiderOrderSheet';
import { useDeliveryStore } from '../../store/deliveryStore';
import { Radio, Power, Loader2, AlertTriangle, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';

export const DeliveryLayout: React.FC = () => {
  const {
    isAuthChecking,
    isAuthorized,
    restrictedReason,
    updateGpsLocation,
    isOnline,
    isGpsLocked,
    gpsStatus,
    requestGpsUnlock,
    toggleOnlineStatus,
    activeOrders,
  } = useDeliveryStore();

  const [retryingGps, setRetryingGps] = useState(false);

  // When online and authorized, ensure LocationService is actively tracking
  useEffect(() => {
    if (isAuthorized && isOnline) {
      requestGpsUnlock();
    }
  }, [isAuthorized, isOnline]);

  const handleRetryGps = async () => {
    setRetryingGps(true);
    try {
      const success = await requestGpsUnlock();
      if (success) {
        toast.success('GPS signal restored! Operational UI unlocked. 📍');
      } else {
        toast.error('Device location still unavailable. Please check system location toggle.');
      }
    } finally {
      setRetryingGps(false);
    }
  };

  const handleGoOffline = async () => {
    await toggleOnlineStatus(false);
    toast('Switched to OFFLINE mode.', { icon: '⚪' });
  };

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
    return <Navigate to="/access-denied" replace />;
  }

  if (!isAuthorized) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#090E17] text-slate-100 flex flex-col font-sans relative">
      <TopHeader />
      <main className={`flex-1 ${activeOrders.length > 0 ? 'pb-36' : 'pb-20'} max-w-lg w-full mx-auto p-3 sm:p-4`}>
        <Outlet />
      </main>

      {/* Persistent Active Order Sheet for assigned deliveries */}
      {activeOrders.length > 0 && (
        <PersistentRiderOrderSheet order={activeOrders[0]} />
      )}

      <BottomNav />

      {/* ── MANDATORY GPS LOCK MODAL (ONLINE = GPS REQUIRED) ── */}
      {isOnline && isGpsLocked && (
        <div className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="w-full max-w-md bg-[#111923] border border-rose-500/30 rounded-3xl p-6 shadow-2xl shadow-rose-950/50 flex flex-col items-center text-center">
            {/* Warning Radar Icon */}
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center animate-pulse">
                <Radio className="w-10 h-10 text-rose-400" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-rose-600 border-2 border-[#111923] flex items-center justify-center text-white">
                <AlertTriangle className="w-4 h-4 stroke-[3]" />
              </div>
            </div>

            {/* Badges & Titles */}
            <span className="px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[11px] font-black uppercase tracking-wider mb-2">
              GPS Location Required
            </span>
            <h2 className="text-xl font-black text-white">
              {gpsStatus === 'PERMISSION_DENIED' && 'Location Permission Blocked'}
              {gpsStatus === 'SERVICE_DISABLED' && 'Turn On Device Location'}
              {gpsStatus === 'ACQUIRING' && 'Acquiring GPS Satellite Lock...'}
              {gpsStatus === 'STALE' && 'GPS Signal Lost'}
              {gpsStatus !== 'PERMISSION_DENIED' && gpsStatus !== 'SERVICE_DISABLED' && gpsStatus !== 'STALE' && gpsStatus !== 'ACQUIRING' && 'High Accuracy GPS Required'}
            </h2>

            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              As an active Olive Pizza Delivery Partner, your device GPS must remain turned ON with High Accuracy while you are marked <span className="text-emerald-400 font-bold">ONLINE</span>.
            </p>

            {/* Active Orders Warning */}
            {activeOrders.length > 0 && (
              <div className="w-full mt-4 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs text-left flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-white">
                    {activeOrders.length} Active Delivery in Progress
                  </span>
                  Going offline will keep your assigned orders safely locked to your account without cancellation.
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="w-full space-y-2.5 mt-6">
              <button
                type="button"
                onClick={handleRetryGps}
                disabled={retryingGps}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {retryingGps ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Detecting GPS Fix...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Turn On Location / Retry GPS</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleGoOffline}
                className="w-full py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Power className="w-4 h-4 text-rose-400" />
                <span>Go Offline (GPS Disabled)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
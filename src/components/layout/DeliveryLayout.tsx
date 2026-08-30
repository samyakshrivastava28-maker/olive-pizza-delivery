import React, { useEffect } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { TopHeader } from './TopHeader';
import { BottomNav } from './BottomNav';
import { useDeliveryStore } from '../../store/deliveryStore';

export const DeliveryLayout: React.FC = () => {
  const { isAuthChecking, isAuthorized, initAuth, updateGpsLocation } = useDeliveryStore();

  useEffect(() => {
    const unsub = initAuth();
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isAuthorized) return;

    let currentLat = 21.0810244;
    let currentLng = 81.0123793;

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          updateGpsLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.heading || 0, pos.coords.speed || 0);
        },
        () => {
          updateGpsLocation(currentLat, currentLng, 45, 15);
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    } else {
      updateGpsLocation(currentLat, currentLng, 45, 15);
    }
  }, [isAuthorized]);

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

  if (!isAuthorized) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#090E17] text-slate-100 flex flex-col font-sans">
      <TopHeader />
      <main className="flex-1 pb-20 max-w-lg w-full mx-auto p-3 sm:p-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
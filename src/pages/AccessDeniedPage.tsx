import React from 'react';
import { ShieldAlert, LogOut, RefreshCw } from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import { useNavigate } from 'react-router-dom';

export default function AccessDeniedPage() {
  const { user, restrictedEmail, restrictedReason, clearRestricted, logout, initAuth } = useDeliveryStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    clearRestricted();
    await logout();
    navigate('/login');
  };

  const accountEmail = restrictedEmail || user?.email || 'Account';

  return (
    <div className="min-h-screen bg-[#070A10] text-slate-100 flex items-center justify-center p-4 font-sans relative overflow-hidden text-center">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-rose-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm rounded-3xl bg-[#0C1220] border border-rose-900/40 p-6 sm:p-8 shadow-2xl relative z-10 space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mx-auto shadow-lg shadow-rose-950/30">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
            Access Restricted
          </span>
          <h1 className="text-lg font-black text-white">Olive Pizza Delivery Partner</h1>
          <p className="text-xs text-rose-300 font-medium">
            {restrictedReason || 'This account is not authorized to use this Olive Pizza application.'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-400 font-mono break-all">
          Attempted Account: <strong className="text-white">{accountEmail}</strong>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-left text-xs text-slate-400 space-y-1.5">
          <p className="font-semibold text-white">Notice to Riders:</p>
          <p className="text-[11px] text-slate-400">
            Delivery dispatch access requires explicit registration by Olive Pizza Management.
            If you have been hired as a delivery partner, please notify the store manager to register your rider account.
          </p>
        </div>

        <div className="space-y-2 pt-1">
          <button
            onClick={() => {
              clearRestricted();
              initAuth();
            }}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Authorization</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Sign In with Different Account</span>
          </button>
        </div>
      </div>
    </div>
  );
}
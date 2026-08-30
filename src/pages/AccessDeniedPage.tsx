import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';

export default function AccessDeniedPage() {
  const { logout } = useDeliveryStore();

  return (
    <div className="min-h-screen bg-[#090E17] flex items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#0F172A] border border-rose-900/40 p-6 shadow-2xl space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <strong className="text-base font-bold text-white block">Access Restricted</strong>
        <p className="text-xs text-slate-400">
          This application is strictly for authorized Olive Pizza delivery partners. Customer accounts cannot access delivery dispatch.
        </p>
        <button
          onClick={() => logout()}
          className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" /> Sign In as Different Account
        </button>
      </div>
    </div>
  );
}
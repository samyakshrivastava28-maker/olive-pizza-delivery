import React from 'react';
import { 
  Clock, 
  ShieldCheck, 
  Bell, 
  Map, 
  LogOut, 
  Radio, 
  Info 
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import WorkScheduleEditor from '../components/WorkScheduleEditor';

export default function SettingsPage() {
  const { riderProfile, logout, isGpsActive } = useDeliveryStore();

  return (
    <div className="space-y-4">
      <h1 className="text-base font-extrabold text-white">App & Operational Settings</h1>

      <WorkScheduleEditor />

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2.5 text-xs text-slate-300">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" /> Delivery Policies
        </h2>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Max Delivery Radius</span>
          <strong className="text-white">15 km from Branch</strong>
        </div>

        <div className="flex justify-between py-1 border-b border-slate-800/60">
          <span className="text-slate-400">Proximity Completion</span>
          <strong className="text-emerald-400">Within 100 meters</strong>
        </div>

        <div className="flex justify-between py-1">
          <span className="text-slate-400">Live GPS Telemetry</span>
          <span className={'font-bold ' + (isGpsActive ? 'text-emerald-400' : 'text-slate-400')}>
            {isGpsActive ? 'Active' : 'Standby'}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Application Version</span>
          <span className="font-mono text-white">v1.0.0 (in.olivepizza.delivery)</span>
        </div>

        <button
          onClick={() => logout()}
          className="w-full py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/20 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  );
}
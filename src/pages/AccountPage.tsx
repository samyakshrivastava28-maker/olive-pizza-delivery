import React from 'react';
import { 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  Truck, 
  ShieldCheck, 
  Calendar, 
  Star, 
  Award 
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';

export default function AccountPage() {
  const { riderProfile } = useDeliveryStore();

  return (
    <div className="space-y-4">
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#0F172A] via-[#131E35] to-[#0F172A] border border-slate-800 text-center space-y-3 shadow-xl">
        <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-xl mx-auto shadow-lg shadow-amber-500/10">
          {(riderProfile?.name || 'R').charAt(0).toUpperCase()}
        </div>

        <div>
          <strong className="text-base font-extrabold text-white block">{riderProfile?.name}</strong>
          <span className="text-xs text-amber-400 font-bold uppercase tracking-wider block">
            OFFICIAL DELIVERY PARTNER
          </span>
          <span className="text-[11px] text-slate-400 font-mono">
            Rider ID: {riderProfile?.id?.slice(0, 12) || 'RDR-08-9445'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Rider Rating
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.rating || 4.9} / 5.0</strong>
          </div>

          <div className="p-2 rounded-xl bg-[#090E17]/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Award className="w-3 h-3 text-emerald-400" /> Lifetime Trips
            </span>
            <strong className="text-sm font-extrabold text-white">{riderProfile?.totalDeliveriesLifetime || 842}</strong>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-3 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider pb-2 border-b border-slate-800">
          Operational Identity
        </h2>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-500" /> Contact Phone
          </span>
          <strong className="text-white">{riderProfile?.phone}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Mail className="w-3.5 h-3.5 text-slate-500" /> Login Email
          </span>
          <strong className="text-white">{riderProfile?.email}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Truck className="w-3.5 h-3.5 text-slate-500" /> Vehicle
          </span>
          <strong className="text-white">{riderProfile?.vehicleNumber || 'CG-08-AB-1234'}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-500" /> Assigned Branch
          </span>
          <strong className="text-amber-400">{riderProfile?.branchName}</strong>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-slate-400 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Member Since
          </span>
          <span className="text-slate-300 font-mono">
            {new Date(riderProfile?.joiningDate || '2026-01-15').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
          </span>
        </div>
      </div>

      <div className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-2 text-xs">
        <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
          Operations Helpline
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-white block">Olive Pizza Dispatch Support</strong>
            <span className="text-[11px] text-slate-400">+91 91799 44445</span>
          </div>
          <a
            href="tel:9179944445"
            className="px-3 py-1.5 rounded-xl bg-amber-500 text-black font-bold text-xs"
          >
            Call
          </a>
        </div>
      </div>
    </div>
  );
}
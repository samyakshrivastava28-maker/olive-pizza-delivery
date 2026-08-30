import React from 'react';
import { Power, MapPin, Radio } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export const TopHeader: React.FC = () => {
  const { riderProfile, isOnline, toggleOnlineStatus, isGpsActive } = useDeliveryStore();

  return (
    <header className="sticky top-0 z-40 bg-[#090E17]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center font-black text-amber-400 text-xs shadow-md shadow-amber-500/10">
          OP
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-sm text-white tracking-tight">Olive Pizza</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase">
              RIDER
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400">
            <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="truncate max-w-[170px] sm:max-w-xs">{riderProfile?.branchName || 'Rajnandgaon Main'}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <div className="hidden sm:flex items-center gap-1 text-[10px] text-slate-400">
          <Radio className={'w-3 h-3 ' + (isGpsActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500')} />
          <span>{isGpsActive ? 'GPS Live' : 'GPS Idle'}</span>
        </div>

        <button
          onClick={() => toggleOnlineStatus()}
          className={'px-3 py-1.5 rounded-full font-bold text-xs flex items-center gap-1.5 border transition-all ' + (
            isOnline
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-md shadow-emerald-500/10'
              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
          )}
        >
          <Power className={'w-3.5 h-3.5 ' + (isOnline ? 'text-emerald-400' : 'text-slate-500')} />
          <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
        </button>
      </div>
    </header>
  );
};
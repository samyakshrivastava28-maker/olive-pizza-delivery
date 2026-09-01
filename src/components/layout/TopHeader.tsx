import React from 'react';
import { Power, MapPin, Radio } from 'lucide-react';
import { AppLogo } from '../common/AppLogo';
import { useDeliveryStore } from '../../store/deliveryStore';

export const TopHeader: React.FC = () => {
  const { riderProfile, isOnline, toggleOnlineStatus, isGpsActive } = useDeliveryStore();

  return (
    <header className="sticky top-0 z-40 bg-[#090E17]/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <AppLogo variant="full" size="sm" subtitle="Rider" />
        <div className="hidden xs:flex items-center gap-1 text-[11px] text-slate-400 border-l border-slate-800 pl-3">
          <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-xs">{riderProfile?.branchName || 'Rajnandgaon Main'}</span>
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
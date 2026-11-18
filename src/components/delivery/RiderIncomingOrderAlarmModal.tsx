import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bike, 
  Volume2, 
  VolumeX, 
  ArrowRight, 
  X, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Maximize2, 
  Minimize2,
  Navigation,
  IndianRupee,
  Phone
} from 'lucide-react';
import { SoundAlertEngine } from '../../lib/SoundAlertEngine';
import { useDeliveryStore } from '../../store/deliveryStore';
import toast from 'react-hot-toast';

export const RiderIncomingOrderAlarmModal: React.FC = () => {
  const navigate = useNavigate();
  const { activeOrders, acceptDelivery, declineDelivery } = useDeliveryStore();
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dismissedOrderIds, setDismissedOrderIds] = useState<Set<string>>(new Set());

  // Find newest pending assignment that hasn't been accepted or dismissed
  const pendingAssignment = activeOrders.find(
    (o) => o.status === 'partner_assigned' && !o.riderAccepted && !dismissedOrderIds.has(o.id)
  );

  useEffect(() => {
    if (!pendingAssignment) {
      setSecondsElapsed(0);
      setIsMinimized(false);
      return;
    }

    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [pendingAssignment?.id]);

  if (!pendingAssignment) return null;

  const handleMute = () => {
    SoundAlertEngine.stopAlarm();
    setIsMuted(true);
  };

  const handleAccept = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    SoundAlertEngine.stopAlarm();
    try {
      await acceptDelivery(pendingAssignment.id);
      SoundAlertEngine.playSound('order_accepted');
      toast.success(`Delivery #${pendingAssignment.orderNumber || pendingAssignment.id.slice(-6).toUpperCase()} Accepted! 🛵`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to accept delivery assignment');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDismiss = () => {
    SoundAlertEngine.stopAlarm();
    setDismissedOrderIds((prev) => new Set([...prev, pendingAssignment.id]));
  };

  const orderNum = pendingAssignment.orderNumber ? `#${pendingAssignment.orderNumber}` : `#${pendingAssignment.id.slice(-6).toUpperCase()}`;
  const amountVal = (pendingAssignment as any).finalTotal || pendingAssignment.totalAmount;
  const formattedAmount = amountVal ? `₹${Number(amountVal).toFixed(0)}` : 'Prepaid';
  const customerAddress = typeof pendingAssignment.deliveryAddress === 'string'
    ? pendingAssignment.deliveryAddress
    : (pendingAssignment.deliveryAddress?.addressLine || pendingAssignment.deliveryAddress?.address || 'Customer Address');

  // ── MINIMIZED HEADS-UP CALL PILL ──
  if (isMinimized) {
    return (
      <div className="fixed top-3 inset-x-0 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-4 duration-300">
        <div 
          className="pointer-events-auto flex items-center justify-between gap-3 px-4 py-2.5 bg-[#0e1626]/95 backdrop-blur-2xl border-2 border-amber-500 rounded-full shadow-[0_15px_35px_rgba(245,158,11,0.35)] text-white max-w-md w-full"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-mono font-black text-amber-300 leading-tight truncate">
                {orderNum} • {formattedAmount}
              </p>
              <p className="text-[10px] text-slate-400 truncate">
                {pendingAssignment.customerName || 'Customer'} ({secondsElapsed}s)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleAccept}
              disabled={isProcessing}
              className="px-3 py-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 text-slate-950 font-black text-xs rounded-full shadow transition-all flex items-center gap-1 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isProcessing ? '...' : 'Accept'}</span>
            </button>

            <button
              type="button"
              onClick={handleMute}
              className="p-1.5 rounded-full hover:bg-white/10 text-amber-400 transition cursor-pointer"
              title={isMuted ? 'Muted' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition cursor-pointer"
              title="Expand Details"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── FULL 3D HALF-SCREEN CALL OVERLAY CARD ──
  return (
    <div className="fixed inset-x-0 top-3 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-6 duration-300">
      <div 
        className="pointer-events-auto w-full max-w-lg bg-[#0e1626]/95 backdrop-blur-2xl border-2 border-amber-500/80 rounded-3xl p-5 shadow-[0_25px_50px_rgba(245,158,11,0.25)] text-white relative overflow-hidden"
      >
        {/* Animated Sonic Glowing Rings */}
        <div className="absolute -top-12 -left-12 w-36 h-36 bg-amber-500/20 rounded-full blur-2xl animate-pulse pointer-events-none" />
        <div className="absolute -bottom-10 -right-10 w-36 h-36 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none" />

        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 relative z-10 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400">
              New Delivery Order Assigned
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#182338] border border-white/10 text-[11px] font-mono font-bold text-amber-300">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{secondsElapsed}s ago</span>
            </div>

            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body */}
        <div className="py-4 flex items-center gap-4 relative z-10">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-700 border-2 border-amber-300/60 flex items-center justify-center text-slate-950 shadow-xl shadow-amber-950/60">
              <Bike className="w-7 h-7 text-slate-950 animate-bounce" />
            </div>
            <div className="absolute inset-0 rounded-2xl border-2 border-amber-400 animate-ping opacity-40 pointer-events-none" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xl font-black font-mono text-white tracking-tight truncate">
                {orderNum}
              </h3>
              <span className="text-xl font-black text-amber-400 font-mono shrink-0">
                {formattedAmount}
              </span>
            </div>

            <p className="text-xs font-semibold text-slate-200 mt-0.5 truncate">
              {pendingAssignment.customerName || 'Customer'}
            </p>

            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1 truncate">
              <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="truncate">{customerAddress}</span>
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 relative z-10 pt-1">
          <button
            type="button"
            onClick={handleMute}
            disabled={isMuted}
            className={`px-3 py-3 rounded-2xl border text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
              isMuted
                ? 'bg-slate-900 border-white/5 text-slate-600 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 border-white/10 text-amber-400 hover:text-white'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            <span>{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          <button
            type="button"
            onClick={handleAccept}
            disabled={isProcessing}
            className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-[0.98] border border-amber-300/50 text-slate-950 font-black text-sm rounded-2xl transition-all shadow-lg shadow-amber-500/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4 text-slate-950" />
            <span>{isProcessing ? 'Accepting...' : 'Accept Delivery Assignment'}</span>
            <ArrowRight className="w-4 h-4 text-slate-950" />
          </button>
        </div>
      </div>
    </div>
  );
};

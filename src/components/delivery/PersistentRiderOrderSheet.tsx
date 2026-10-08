import React, { useState, useEffect, useRef } from 'react';
import {
  Navigation,
  MapPin,
  Phone,
  CheckCircle2,
  Clock,
  ShieldCheck,
  IndianRupee,
  ExternalLink,
  QrCode,
  Banknote,
  Lock,
  RefreshCw,
  Check,
  ChevronUp,
  ChevronDown,
  Minimize2,
  Maximize2,
  AlertCircle,
  Package,
  Store,
  PackageCheck,
  CheckCheck,
  ShieldAlert,
  Sparkles,
  X
} from 'lucide-react';
import QRCode from 'qrcode';
import { useDeliveryStore } from '../../store/deliveryStore';
import type { DeliveryOrder, OrderItem, RiderLifecycleStage } from '../../types/delivery';
import toast from 'react-hot-toast';

export type SheetSnap = 'minimized' | 'half' | 'full';

interface PersistentRiderOrderSheetProps {
  order: DeliveryOrder;
  onClose?: () => void;
}

// ─── Distance & ETA Calculation ──────────────────────────
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Helper to determine canonical stage ───────────────────
export function getRiderOrderStage(order: DeliveryOrder): RiderLifecycleStage {
  const st = (order.status || '').toLowerCase();
  if (st === 'delivered' || st === 'completed') {
    return 'DELIVERED';
  }
  if (order.riderArrivedAtCustomerAt) {
    return 'ARRIVED';
  }
  if (st === 'out_for_delivery' || order.outForDeliveryAt) {
    return 'START_DELIVERY';
  }
  if (st === 'picked_up' || order.pickedUpAt) {
    return 'PICKED_UP';
  }
  if (order.riderArrivedAtStoreAt) {
    return 'START_PICKUP';
  }
  if (
    st === 'accepted' ||
    order.riderAccepted ||
    order.riderAssignmentStatus === 'accepted' ||
    st === 'preparing' ||
    st === 'ready'
  ) {
    return 'ACCEPTED';
  }
  return 'ASSIGNED';
}

// ─── Stage Configuration ───────────────────────────────────
interface StageConfig {
  label: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  nextActionLabel: string;
  icon: React.ElementType;
}

const STAGE_CONFIGS: Record<RiderLifecycleStage, StageConfig> = {
  ASSIGNED: {
    label: 'ASSIGNED',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-400',
    badgeBorder: 'border-amber-500/40',
    nextActionLabel: 'Accept Delivery',
    icon: Package,
  },
  ACCEPTED: {
    label: 'ACCEPTED',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-400',
    badgeBorder: 'border-blue-500/40',
    nextActionLabel: 'Start Pickup (Go to Store)',
    icon: CheckCircle2,
  },
  START_PICKUP: {
    label: 'AT STORE',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-400',
    badgeBorder: 'border-purple-500/40',
    nextActionLabel: 'Confirm Food Picked Up',
    icon: Store,
  },
  PICKED_UP: {
    label: 'PICKED UP',
    badgeBg: 'bg-cyan-500/20',
    badgeText: 'text-cyan-400',
    badgeBorder: 'border-cyan-500/40',
    nextActionLabel: 'Start Delivery Trip',
    icon: PackageCheck,
  },
  START_DELIVERY: {
    label: 'OUT FOR DELIVERY',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-400',
    badgeBorder: 'border-emerald-500/40',
    nextActionLabel: 'Arrived at Customer',
    icon: Navigation,
  },
  ARRIVED: {
    label: 'AT CUSTOMER DOOR',
    badgeBg: 'bg-teal-500/20',
    badgeText: 'text-teal-400',
    badgeBorder: 'border-teal-500/40',
    nextActionLabel: 'Complete Delivery',
    icon: MapPin,
  },
  DELIVERED: {
    label: 'DELIVERED',
    badgeBg: 'bg-emerald-600/30',
    badgeText: 'text-emerald-300',
    badgeBorder: 'border-emerald-500/60',
    nextActionLabel: 'Completed',
    icon: CheckCheck,
  },
};

const LIFECYCLE_STEPS: Array<{ stage: RiderLifecycleStage; label: string; desc: string }> = [
  { stage: 'ASSIGNED', label: '1. Assigned', desc: 'Order assigned to rider' },
  { stage: 'ACCEPTED', label: '2. Accepted', desc: 'Heading towards restaurant' },
  { stage: 'START_PICKUP', label: '3. At Store', desc: 'Waiting/Collecting at kitchen' },
  { stage: 'PICKED_UP', label: '4. Picked Up', desc: 'Order packed with rider' },
  { stage: 'START_DELIVERY', label: '5. Out for Delivery', desc: 'En route to customer' },
  { stage: 'ARRIVED', label: '6. Arrived', desc: 'Doorstep arrival & handover' },
  { stage: 'DELIVERED', label: '7. Delivered', desc: 'Verified and completed' },
];

export const PersistentRiderOrderSheet: React.FC<PersistentRiderOrderSheetProps> = ({ order }) => {
  const {
    currentLocation,
    acceptDelivery,
    declineDelivery,
    startPickup,
    confirmPickup,
    startDeliveryTrip,
    markArrivedAtCustomer,
    completeDelivery,
    collectCodCash,
    generateCodUpiQr,
    checkCodPaymentStatus,
  } = useDeliveryStore();

  const [snap, setSnap] = useState<SheetSnap>('minimized');
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(false);

  // OTP Verification State
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '']);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const otpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Delivery Proof Notes
  const [proofNote, setProofNote] = useState('');

  // COD Collection State
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGeneratingUpi, setIsGeneratingUpi] = useState(false);
  const [isCollectingCash, setIsCollectingCash] = useState(false);
  const [cashNotes, setCashNotes] = useState('');
  const [paymentVerifiedSuccess, setPaymentVerifiedSuccess] = useState(false);

  // Drag handling state
  const touchStartY = useRef<number | null>(null);
  const touchCurrentY = useRef<number | null>(null);

  const currentStage = getRiderOrderStage(order);
  const stageConfig = STAGE_CONFIGS[currentStage];

  // Address parsing
  const addressText = typeof order.deliveryAddress === 'string'
    ? order.deliveryAddress
    : order.deliveryAddress?.addressLine || order.deliveryAddress?.address || 'Dongargaon Rd, Rajnandgaon';
  const customerName = order.customerName || 'Customer';
  const displayOrderNum = order.dailyOrderNumber ? `#${order.dailyOrderNumber}` : (order.orderNumber || `#${order.id.slice(-5)}`);

  // Payment assessment
  const pMethod = (order.paymentMethod || 'COD').toUpperCase();
  const isCod = pMethod === 'COD' || order.isCod === true;
  const isPaid = order.isPaid === true ||
    (order.paymentStatus || '').toUpperCase() === 'PAID' ||
    (order.paymentStatus || '').toUpperCase() === 'COLLECTED';
  const isPaymentPending = isCod && !isPaid;

  // Target Destination Coords for distance/ETA
  // Before pickup: target is store. After pickup: target is customer.
  const isPostPickup = ['PICKED_UP', 'START_DELIVERY', 'ARRIVED', 'DELIVERED'].includes(currentStage);
  const destLat = isPostPickup
    ? (typeof order.deliveryAddress !== 'string' ? order.deliveryAddress?.lat : undefined) || order.location?.lat
    : 21.0974; // Rajnandgaon HQ default
  const destLng = isPostPickup
    ? (typeof order.deliveryAddress !== 'string' ? order.deliveryAddress?.lng : undefined) || order.location?.lng
    : 81.0347;

  let distanceKm: number | null = null;
  let etaMinutes: number | null = null;

  if (currentLocation && destLat && destLng) {
    const meters = calculateDistanceMeters(currentLocation.lat, currentLocation.lng, destLat, destLng);
    distanceKm = Math.round((meters / 1000) * 10) / 10;
    etaMinutes = Math.max(2, Math.round((distanceKm / 25) * 60)); // ~25km/h motorbike speed
  } else if (order.deliveryDistanceKm) {
    distanceKm = order.deliveryDistanceKm;
    etaMinutes = order.deliveryDurationMin || Math.max(3, Math.round((distanceKm / 25) * 60));
  }

  // Navigation URL
  const navUrl = destLat && destLng
    ? `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addressText)}`;

  // Touch gesture handlers for snapping
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    if (touchStartY.current === null || touchCurrentY.current === null) {
      touchStartY.current = null;
      touchCurrentY.current = null;
      return;
    }
    const deltaY = touchCurrentY.current - touchStartY.current;
    const threshold = 40;

    if (deltaY < -threshold) {
      // Swiped UP
      if (snap === 'minimized') setSnap('half');
      else if (snap === 'half') setSnap('full');
    } else if (deltaY > threshold) {
      // Swiped DOWN
      if (snap === 'full') setSnap('half');
      else if (snap === 'half') setSnap('minimized');
    }

    touchStartY.current = null;
    touchCurrentY.current = null;
  };

  // OTP Input handlers
  const handleOtpChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const updated = [...otpValues];
    updated[index] = digit;
    setOtpValues(updated);
    setOtpError(null);

    // Auto focus next
    if (digit && index < 3) {
      otpInputRefs[index + 1].current?.focus();
    }

    // Check full 4 digits
    const fullOtp = updated.join('');
    if (fullOtp.length === 4) {
      const expectedOtp = String((order as any).deliveryOtp || (order as any).otp || '').trim();
      if (expectedOtp && expectedOtp !== fullOtp) {
        setOtpError('Invalid OTP code. Please ask customer for correct 4-digit PIN.');
        setIsOtpVerified(false);
      } else {
        setIsOtpVerified(true);
        setOtpError(null);
        toast.success('Customer OTP Verified! 🔐');
      }
    } else {
      setIsOtpVerified(false);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  // COD Cash Confirmation
  const handleConfirmCash = async () => {
    setIsCollectingCash(true);
    const res = await collectCodCash(order.id, cashNotes || 'Cash received by delivery rider');
    setIsCollectingCash(false);

    if (res.success) {
      setPaymentVerifiedSuccess(true);
      toast.success(`₹${order.totalAmount} cash collected successfully!`);
      setTimeout(() => {
        setPaymentVerifiedSuccess(false);
      }, 1500);
    } else {
      toast.error(res.error || 'Failed to record cash collection.');
    }
  };

  // COD UPI QR Generation
  const handleGenerateUpi = async () => {
    setPaymentMode('UPI');
    setIsGeneratingUpi(true);
    const res = await generateCodUpiQr(order.id);
    setIsGeneratingUpi(false);

    if (res.success && res.upiString) {
      try {
        const url = await QRCode.toDataURL(res.upiString, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(url);
      } catch (err) {
        console.error('Failed to render QR:', err);
      }
    } else {
      toast.error(res.error || 'Could not generate dynamic UPI QR.');
    }
  };

  // Poll UPI status if QR mode is active
  useEffect(() => {
    if (snap === 'minimized' || paymentMode !== 'UPI' || !qrCodeUrl || isPaid || paymentVerifiedSuccess) return;

    const interval = setInterval(async () => {
      const res = await checkCodPaymentStatus(order.id);
      if (res.success && res.isPaid) {
        setPaymentVerifiedSuccess(true);
        toast.success(`Payment of ₹${order.totalAmount} verified via UPI!`);
        setTimeout(() => {
          setPaymentVerifiedSuccess(false);
        }, 1500);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [snap, paymentMode, qrCodeUrl, isPaid, paymentVerifiedSuccess, order.id, checkCodPaymentStatus]);

  // Primary Lifecycle Action Execution
  const handleExecuteCurrentAction = async () => {
    setIsProcessingAction(true);
    try {
      switch (currentStage) {
        case 'ASSIGNED': {
          const ok = await acceptDelivery(order.id);
          if (ok) {
            toast.success('Assignment accepted! Proceed to restaurant.');
            setSnap('half');
          } else {
            toast.error('Failed to accept order.');
          }
          break;
        }

        case 'ACCEPTED': {
          const ok = await startPickup(order.id);
          if (ok) {
            toast.success('Arrived at restaurant! Pick up items from kitchen.');
          } else {
            toast.error('Failed to update stage.');
          }
          break;
        }

        case 'START_PICKUP': {
          const ok = await confirmPickup(order.id);
          if (ok) {
            toast.success('Order items collected! Ready for trip.');
          } else {
            toast.error('Failed to confirm pickup.');
          }
          break;
        }

        case 'PICKED_UP': {
          const ok = await startDeliveryTrip(order.id);
          if (ok) {
            toast.success('Trip started! Drive safe to customer destination.');
          } else {
            toast.error('Failed to start delivery trip.');
          }
          break;
        }

        case 'START_DELIVERY': {
          const ok = await markArrivedAtCustomer(order.id);
          if (ok) {
            toast.success('Arrived at customer location!');
            setSnap('full'); // Open full view for payment & OTP
          } else {
            toast.error('Failed to mark arrival.');
          }
          break;
        }

        case 'ARRIVED': {
          // Check payment if COD
          if (isPaymentPending) {
            toast.error('Payment collection required before marking delivered!');
            setSnap('full');
            return;
          }

          // Check OTP if expected
          const expectedOtp = String((order as any).deliveryOtp || (order as any).otp || '').trim();
          const enteredOtp = otpValues.join('');
          if (expectedOtp && !isOtpVerified) {
            toast.error('Please enter the customer 4-digit delivery PIN first!');
            setSnap('full');
            return;
          }

          const res = await completeDelivery(order.id, {
            notes: proofNote || 'Handed directly to customer at door',
            otp: enteredOtp || undefined,
          });

          if (res.success) {
            toast.success('🎉 Delivery completed successfully!');
            setSnap('minimized');
          } else {
            toast.error(res.error || 'Failed to complete delivery.');
          }
          break;
        }

        default:
          break;
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDecline = async () => {
    if (!window.confirm('Are you sure you want to decline this delivery assignment?')) return;
    setIsProcessingAction(true);
    try {
      const ok = await declineDelivery(order.id, 'Declined by rider from active sheet');
      if (ok) {
        toast('Assignment declined. Dispatching next rider.', { icon: 'ℹ️' });
      } else {
        toast.error('Could not decline order.');
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <>
      {/* ─── Backdrop Blur for Half & Full Expanded Modes ─── */}
      {snap !== 'minimized' && (
        <div
          onClick={() => setSnap('minimized')}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
        />
      )}

      {/* ─── Persistent Bottom Sheet Container ─── */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`fixed left-0 right-0 z-50 max-w-lg mx-auto transition-all duration-300 ease-out flex flex-col ${
          snap === 'minimized'
            ? 'bottom-[62px] px-2.5 sm:px-4'
            : snap === 'half'
            ? 'bottom-0 h-[62vh] bg-[#0B111D] border-t border-slate-700/80 rounded-t-3xl shadow-2xl'
            : 'bottom-0 h-[92vh] bg-[#090E17] border-t border-slate-700 rounded-t-3xl shadow-2xl'
        }`}
      >
        {/* ══════════════════════════════════════════════════════════════
            1. MINIMIZED BAR VIEW (Compact, docked above bottom navigation)
           ══════════════════════════════════════════════════════════════ */}
        {snap === 'minimized' && (
          <div
            onClick={() => setSnap('half')}
            className="w-full bg-[#0F172A]/95 backdrop-blur-xl border border-amber-500/40 rounded-2xl p-2.5 sm:p-3 shadow-2xl shadow-amber-950/30 flex items-center justify-between gap-2.5 cursor-pointer hover:border-amber-400 transition-all active:scale-[0.99] select-none"
          >
            {/* Grab pill */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-slate-600/70" />

            {/* Left: Order badge & Customer info */}
            <div className="flex items-center gap-2.5 min-w-0 flex-1 pt-0.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-black flex items-center justify-center font-black text-xs shrink-0 shadow-md shadow-amber-500/20">
                <Navigation className="w-4 h-4 animate-pulse" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-white truncate">
                    Order {displayOrderNum}
                  </span>
                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full border ${stageConfig.badgeBg} ${stageConfig.badgeText} ${stageConfig.badgeBorder}`}>
                    {stageConfig.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-300 truncate">
                  <span className="truncate font-medium">{customerName}</span>
                  {distanceKm !== null && (
                    <span className="text-amber-400 font-bold shrink-0 font-mono">
                      • {distanceKm} km {etaMinutes ? `(~${etaMinutes}m)` : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: Expand chevron */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSnap('half');
                }}
                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-amber-400 hover:text-white transition-colors"
                title="Expand order sheet"
              >
                <ChevronUp className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            2. EXPANDED VIEWS (HALF-SCREEN & FULL EXPANDED VIEW)
           ══════════════════════════════════════════════════════════════ */}
        {snap !== 'minimized' && (
          <div className="flex-1 flex flex-col min-h-0 text-slate-100 overflow-hidden">
            {/* Sheet Top Grab Header */}
            <div className="pt-2 px-4 pb-2 border-b border-slate-800/80 shrink-0">
              <div className="w-10 h-1.2 rounded-full bg-slate-600 mx-auto mb-2 cursor-grab" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-white">
                    Order {displayOrderNum}
                  </span>
                  <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${stageConfig.badgeBg} ${stageConfig.badgeText} ${stageConfig.badgeBorder}`}>
                    {stageConfig.label}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {snap === 'half' ? (
                    <button
                      type="button"
                      onClick={() => setSnap('full')}
                      className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                      title="Expand full view"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSnap('half')}
                      className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                      title="Half view"
                    >
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setSnap('minimized')}
                    className="p-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                    title="Minimize"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* ── FULL VIEW: CANONICAL LIFECYCLE STEPPER ── */}
              {snap === 'full' && (
                <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2.5">
                  <span className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider block">
                    Canonical Delivery Lifecycle
                  </span>
                  <div className="space-y-2">
                    {LIFECYCLE_STEPS.map((step, idx) => {
                      const stagesOrder: RiderLifecycleStage[] = [
                        'ASSIGNED',
                        'ACCEPTED',
                        'START_PICKUP',
                        'PICKED_UP',
                        'START_DELIVERY',
                        'ARRIVED',
                        'DELIVERED',
                      ];
                      const currentIdx = stagesOrder.indexOf(currentStage);
                      const stepIdx = stagesOrder.indexOf(step.stage);
                      const isCompleted = stepIdx < currentIdx;
                      const isCurrent = stepIdx === currentIdx;

                      return (
                        <div
                          key={step.stage}
                          className={`flex items-center gap-2.5 p-2 rounded-xl transition-all ${
                            isCurrent
                              ? 'bg-amber-500/15 border border-amber-500/40 text-white font-bold'
                              : isCompleted
                              ? 'bg-emerald-500/10 border border-emerald-500/20 text-slate-300'
                              : 'text-slate-500 border border-transparent opacity-60'
                          }`}
                        >
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isCurrent
                                ? 'bg-amber-500 text-black animate-pulse'
                                : isCompleted
                                ? 'bg-emerald-500 text-black'
                                : 'bg-slate-800 text-slate-500'
                            }`}
                          >
                            {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-xs font-bold leading-tight">
                              {step.label}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate leading-tight">
                              {step.desc}
                            </span>
                          </div>
                          {isCurrent && (
                            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300">
                              CURRENT
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── ADDRESS & NAVIGATION SECTION ── */}
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                        Customer Address
                      </span>
                      <strong className="text-xs text-white block font-bold leading-snug">
                        {customerName}
                      </strong>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                        {addressText}
                      </p>
                      {distanceKm !== null && (
                        <div className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
                          <span>{distanceKm} km away</span>
                          {etaMinutes && <span>• ETA ~{etaMinutes} mins</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons: Navigate with Maps & Call Customer */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
                  <a
                    href={navUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                    <span>Navigate (Maps)</span>
                  </a>

                  {order.contactPhone ? (
                    <a
                      href={`tel:${order.contactPhone}`}
                      className="py-2.5 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Call Customer</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      className="py-2.5 px-3 rounded-xl bg-slate-800/50 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                    >
                      <Phone className="w-3.5 h-3.5 text-slate-600" />
                      <span>No Phone</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ── ORDER ITEMS SUMMARY (Expandable) ── */}
              <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2">
                <div
                  onClick={() => setItemsExpanded(!itemsExpanded)}
                  className="flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider">
                      Order Items ({order.items?.length || 0})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-amber-400 font-mono">
                      ₹{order.totalAmount}
                    </span>
                    {itemsExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                </div>

                {itemsExpanded && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    {order.items?.map((item: OrderItem, idx: number) => (
                      <div key={idx} className="flex justify-between items-center text-slate-300 py-0.5">
                        <span className="font-medium">
                          {item.quantity}x {item.name}
                          {item.size ? ` (${item.size})` : ''}
                        </span>
                        <span className="font-mono text-slate-400">₹{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── FULL VIEW: COD PAYMENT COLLECTION ── */}
              {snap === 'full' && (
                <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-amber-400" />
                      <div>
                        <strong className="text-white text-xs block font-bold">
                          Payment Status: {isPaid ? 'PAID' : `DUE (₹${order.totalAmount})`}
                        </strong>
                        <span className="text-[10px] text-slate-400">
                          Method: {pMethod} {order.paymentCollectionType ? `(${order.paymentCollectionType})` : ''}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                        isPaid
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse'
                      }`}
                    >
                      {isPaid ? 'VERIFIED' : 'COLLECTION REQUIRED'}
                    </span>
                  </div>

                  {isPaymentPending && (
                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      {/* Payment Mode Toggle */}
                      <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setPaymentMode('CASH')}
                          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            paymentMode === 'CASH'
                              ? 'bg-amber-500 text-black shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Banknote className="w-3.5 h-3.5" /> Cash (₹{order.totalAmount})
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateUpi}
                          className={`py-1.5 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors ${
                            paymentMode === 'UPI'
                              ? 'bg-emerald-500 text-black shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <QrCode className="w-3.5 h-3.5" /> Dynamic UPI QR
                        </button>
                      </div>

                      {paymentVerifiedSuccess ? (
                        <div className="py-4 text-center bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-1">
                          <Check className="w-6 h-6 text-emerald-400 mx-auto" />
                          <strong className="text-white block font-bold">Payment Verified!</strong>
                        </div>
                      ) : paymentMode === 'CASH' ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder="Optional cash note (e.g. Exact change)"
                            value={cashNotes}
                            onChange={(e) => setCashNotes(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            disabled={isCollectingCash}
                            onClick={handleConfirmCash}
                            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 disabled:opacity-50"
                          >
                            {isCollectingCash ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            Confirm Physical Cash Received
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 text-center">
                          {isGeneratingUpi ? (
                            <div className="py-6 text-slate-400 space-y-1">
                              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-emerald-400" />
                              <span>Generating Dynamic QR...</span>
                            </div>
                          ) : qrCodeUrl ? (
                            <div className="p-3 bg-white rounded-xl inline-block shadow mx-auto">
                              <img src={qrCodeUrl} alt="UPI QR" className="w-36 h-36 mx-auto rounded" />
                              <span className="text-[10px] font-black text-slate-900 block mt-1">
                                Scan with any UPI App
                              </span>
                            </div>
                          ) : null}
                          <p className="text-[10px] text-emerald-400 animate-pulse">
                            Waiting for webhook payment confirmation...
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── FULL VIEW: OTP VERIFICATION INPUT ── */}
              {snap === 'full' && (currentStage === 'ARRIVED' || currentStage === 'START_DELIVERY') && (
                <div className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <div>
                        <strong className="text-white text-xs block font-bold">
                          Delivery Verification PIN (OTP)
                        </strong>
                        <span className="text-[10px] text-slate-400">
                          Ask customer for 4-digit verification code
                        </span>
                      </div>
                    </div>
                    {isOtpVerified && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-black">
                        PIN VERIFIED
                      </span>
                    )}
                  </div>

                  <div className="flex justify-center gap-2.5 py-1">
                    {otpValues.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={otpInputRefs[idx]}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(idx, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                        className={`w-11 h-12 text-center text-lg font-black rounded-xl bg-slate-900 border transition-all focus:outline-none ${
                          isOtpVerified
                            ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                            : digit
                            ? 'border-amber-400 text-white'
                            : 'border-slate-700 text-slate-400'
                        }`}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <p className="text-[11px] text-rose-400 text-center font-medium">
                      {otpError}
                    </p>
                  )}
                </div>
              )}

              {/* ── FULL VIEW: DELIVERY NOTES ── */}
              {snap === 'full' && currentStage === 'ARRIVED' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-300 block">
                    Handover Proof Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Handed to customer at door"
                    value={proofNote}
                    onChange={(e) => setProofNote(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}
            </div>

            {/* ── STICKY BOTTOM ACTION FOOTER ── */}
            <div className="p-3.5 bg-[#0F172A] border-t border-slate-800/90 shrink-0 space-y-2">
              <button
                type="button"
                disabled={isProcessingAction || (currentStage === 'ARRIVED' && isPaymentPending)}
                onClick={handleExecuteCurrentAction}
                className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:opacity-50 ${
                  currentStage === 'ARRIVED' && isPaymentPending
                    ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                    : currentStage === 'DELIVERED'
                    ? 'bg-emerald-600 text-white'
                    : currentStage === 'ARRIVED'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                    : 'bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20'
                }`}
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : currentStage === 'ARRIVED' && isPaymentPending ? (
                  <>
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>Collect ₹{order.totalAmount} to Unlock</span>
                  </>
                ) : (
                  <>
                    <stageConfig.icon className="w-4 h-4 stroke-[2.5]" />
                    <span>{stageConfig.nextActionLabel}</span>
                  </>
                )}
              </button>

              {/* Decline button only visible when ASSIGNED */}
              {currentStage === 'ASSIGNED' && (
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={handleDecline}
                  className="w-full py-2 rounded-xl bg-slate-800/80 hover:bg-rose-950/30 text-slate-400 hover:text-rose-400 border border-slate-700 font-bold text-xs transition-colors"
                >
                  Decline Assignment
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

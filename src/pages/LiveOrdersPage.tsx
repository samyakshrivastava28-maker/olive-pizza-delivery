import React, { useState, useEffect } from 'react';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  AlertCircle,
  IndianRupee,
  ExternalLink,
  QrCode,
  Banknote,
  Lock,
  RefreshCw,
  Sparkles,
  Check
} from 'lucide-react';
import QRCode from 'qrcode';
import { useDeliveryStore } from '../store/deliveryStore';
import type { DeliveryOrder, OrderItem } from '../types/delivery';
import toast from 'react-hot-toast';

export default function LiveOrdersPage() {
  const { 
    activeOrders, 
    acceptDelivery, 
    confirmPickup, 
    completeDelivery,
    collectCodCash,
    generateCodUpiQr,
    checkCodPaymentStatus,
    currentLocation 
  } = useDeliveryStore();

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // COD Collection State
  const [collectingPaymentOrder, setCollectingPaymentOrder] = useState<DeliveryOrder | null>(null);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI'>('CASH');
  const [upiAttempt, setUpiAttempt] = useState<{ attemptId: string; amountDue: number; upiString: string; expiresAt: string } | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isGeneratingUpi, setIsGeneratingUpi] = useState(false);
  const [isCollectingCash, setIsCollectingCash] = useState(false);
  const [cashNotes, setCashNotes] = useState('');
  const [paymentVerifiedSuccess, setPaymentVerifiedSuccess] = useState(false);

  const handleAccept = async (orderId: string) => {
    const ok = await acceptDelivery(orderId);
    if (ok) {
      toast.success('Order accepted! Proceed to restaurant for pickup.');
    } else {
      toast.error('Failed to accept order.');
    }
  };

  const handlePickup = async (orderId: string) => {
    const ok = await confirmPickup(orderId);
    if (ok) {
      toast.success('Order picked up! Now Out for Delivery to customer.');
    } else {
      toast.error('Failed to confirm pickup.');
    }
  };

  const handleOpenPaymentModal = (order: DeliveryOrder) => {
    setCollectingPaymentOrder(order);
    setPaymentMode('CASH');
    setUpiAttempt(null);
    setQrCodeUrl(null);
    setPaymentVerifiedSuccess(false);
    setCashNotes('');
  };

  // Cash confirmation
  const handleConfirmCash = async () => {
    if (!collectingPaymentOrder) return;
    setIsCollectingCash(true);
    const res = await collectCodCash(collectingPaymentOrder.id, cashNotes || 'Cash received by delivery rider');
    setIsCollectingCash(false);

    if (res.success) {
      setPaymentVerifiedSuccess(true);
      toast.success(`₹${collectingPaymentOrder.totalAmount} cash collected successfully!`);
      setTimeout(() => {
        setCollectingPaymentOrder(null);
        setPaymentVerifiedSuccess(false);
      }, 1400);
    } else {
      toast.error(res.error || 'Failed to record cash collection.');
    }
  };

  // Switch to UPI mode & request dynamic QR
  const handleSwitchToUpi = async () => {
    setPaymentMode('UPI');
    if (!collectingPaymentOrder) return;

    setIsGeneratingUpi(true);
    const res = await generateCodUpiQr(collectingPaymentOrder.id);
    setIsGeneratingUpi(false);

    if (res.success && res.upiString) {
      setUpiAttempt({
        attemptId: res.attemptId!,
        amountDue: res.amountDue!,
        upiString: res.upiString,
        expiresAt: res.expiresAt!,
      });

      try {
        const url = await QRCode.toDataURL(res.upiString, {
          width: 240,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(url);
      } catch (err) {
        console.error('Failed to render QR code:', err);
      }
    } else {
      toast.error(res.error || 'Could not generate dynamic UPI QR.');
    }
  };

  // Real-time polling fallback while UPI QR is active
  useEffect(() => {
    if (!collectingPaymentOrder || paymentMode !== 'UPI' || paymentVerifiedSuccess) return;

    const interval = setInterval(async () => {
      const res = await checkCodPaymentStatus(collectingPaymentOrder.id);
      if (res.success && res.isPaid) {
        setPaymentVerifiedSuccess(true);
        toast.success(`Payment of ₹${collectingPaymentOrder.totalAmount} verified via UPI!`);
        setTimeout(() => {
          setCollectingPaymentOrder(null);
          setPaymentVerifiedSuccess(false);
        }, 1500);
      }
    }, 2800);

    return () => clearInterval(interval);
  }, [collectingPaymentOrder, paymentMode, paymentVerifiedSuccess, checkCodPaymentStatus]);

  // Submit delivery completion
  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingOrderId) return;

    setIsSubmitting(true);
    const res = await completeDelivery(completingOrderId, { notes: proofNote || 'Handed directly to customer' });

    if (res.success) {
      toast.success('Delivery completed and verified within proximity!');
      setCompletingOrderId(null);
      setProofNote('');
    } else {
      toast.error(res.error || 'Failed to complete delivery.');
    }
    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-extrabold text-white flex items-center gap-2">
          <Navigation className="w-5 h-5 text-amber-400" /> Active Deliveries
        </h1>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {activeOrders.length} Running
        </span>
      </div>

      {activeOrders.length === 0 ? (
        <div className="p-8 rounded-3xl bg-[#0F172A] border border-slate-800 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <strong className="text-sm font-bold text-white block">No Active Deliveries</strong>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            You are online and ready. New assigned deliveries from restaurant managers will ring here immediately.
          </p>
        </div>
      ) : (
        activeOrders.map((order: DeliveryOrder) => {
          const isAssigned = order.status === 'partner_assigned';
          const isAccepted = order.status === 'accepted' || order.status === 'preparing' || order.status === 'ready';
          const isOutForDelivery = order.status === 'out_for_delivery';

          const addressText = typeof order.deliveryAddress === 'string' 
            ? order.deliveryAddress 
            : order.deliveryAddress?.addressLine || order.deliveryAddress?.address || 'Rajnandgaon, Chhattisgarh';

          // Authoritative Payment Assessment
          const pMethod = (order.paymentMethod || 'COD').toUpperCase();
          const isCod = pMethod === 'COD' || order.isCod === true;
          const isPaid = order.isPaid === true || (order.paymentStatus || '').toUpperCase() === 'PAID' || (order.paymentStatus || '').toUpperCase() === 'COLLECTED';
          const isPaymentPending = isCod && !isPaid;

          return (
            <div
              key={order.id}
              className="p-4 rounded-3xl bg-[#0F172A] border border-slate-800 space-y-4 shadow-2xl relative overflow-hidden"
            >
              {/* Status Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-extrabold uppercase text-amber-400 tracking-wider block">
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <strong className="text-base font-black text-white">
                    Order #{order.dailyOrderNumber || order.id.slice(-5)}
                  </strong>
                </div>

                <div className="text-right">
                  <span className="text-xs font-extrabold text-amber-400 block">₹{order.totalAmount}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                    isPaid 
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                  }`}>
                    {isPaid ? `PAID (${order.paymentCollectionType || pMethod})` : `PAYMENT DUE (${pMethod})`}
                  </span>
                </div>
              </div>

              {/* Pickup & Destination Timeline */}
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Pickup Location</span>
                    <strong className="text-white text-xs block">{order.branchName || 'Olive Pizza — Rajnandgaon'}</strong>
                    <span className="text-[11px] text-slate-400 block">Dongargaon Rd, near Saraswati school, Gokul Nagar</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <span className="text-[10px] font-bold text-slate-400 block uppercase">Customer Destination</span>
                    <strong className="text-white text-xs block">{order.customerName || 'Customer'}</strong>
                    <span className="text-[11px] text-slate-300 block">{addressText}</span>
                  </div>
                </div>
              </div>

              {/* Order Items Summary */}
              <div className="p-3 rounded-2xl bg-[#131E35] border border-slate-800 text-xs space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Items to deliver:</span>
                {order.items?.map((item: OrderItem, idx: number) => (
                  <div key={idx} className="flex justify-between text-slate-200">
                    <span>{item.quantity}x {item.name}</span>
                    <span className="text-slate-400 font-mono">₹{item.price * item.quantity}</span>
                  </div>
                ))}
              </div>

              {/* Quick Actions (Call & Maps) */}
              <div className="grid grid-cols-2 gap-2">
                {order.contactPhone ? (
                  <a
                    href={'tel:' + order.contactPhone}
                    className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-emerald-400" /> Call Customer
                  </a>
                ) : (
                  <button
                    disabled
                    className="py-2.5 px-3 rounded-xl bg-slate-800/50 text-slate-500 font-bold text-xs flex items-center justify-center gap-1.5 cursor-not-allowed"
                  >
                    <Phone className="w-3.5 h-3.5 text-slate-600" /> Phone Unavailable
                  </button>
                )}

                <a
                  href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" /> Open Maps
                </a>
              </div>

              {/* COD Payment Collection Banner & Button */}
              {isOutForDelivery && isPaymentPending && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-amber-400" />
                      <div>
                        <strong className="text-white text-xs block">Collect Payment from Customer</strong>
                        <span className="text-[11px] text-amber-300">Exact amount due: ₹{order.totalAmount}</span>
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-md">
                      COD
                    </span>
                  </div>
                  <button
                    onClick={() => handleOpenPaymentModal(order)}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-transform active:scale-98 shadow-md shadow-amber-500/10"
                  >
                    <Banknote className="w-4 h-4" /> Collect Payment (Cash / UPI QR)
                  </button>
                </div>
              )}

              {/* Verified Payment Banner */}
              {isOutForDelivery && isPaid && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div>
                      <strong className="text-white block font-bold">Payment Verified (₹{order.totalAmount})</strong>
                      <span className="text-[10px] text-emerald-300/80">
                        Method: {order.paymentCollectionType || pMethod} • Ready for delivery completion
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Workflow Stepper Action Buttons */}
              {isAssigned && (
                <button
                  onClick={() => handleAccept(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Accept Delivery
                </button>
              )}

              {isAccepted && (
                <button
                  onClick={() => handlePickup(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-black text-sm uppercase tracking-wide shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Confirm Pickup & Start Trip
                </button>
              )}

              {isOutForDelivery && (
                <button
                  disabled={isPaymentPending}
                  onClick={() => {
                    if (isPaymentPending) {
                      toast.error('Payment collection required before marking delivered!');
                      return;
                    }
                    setCompletingOrderId(order.id);
                  }}
                  className={`w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-wide shadow-lg transition-all flex items-center justify-center gap-2 ${
                    isPaymentPending
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
                  }`}
                >
                  {isPaymentPending ? (
                    <>
                      <Lock className="w-4 h-4 text-amber-400" /> Collect Payment to Unlock Delivery
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" /> Mark Delivered (100m Proximity)
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })
      )}

      {/* ─── COD PAYMENT COLLECTION MODAL ─── */}
      {collectingPaymentOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#0F172A] border border-slate-800 w-full max-w-md rounded-3xl p-5 shadow-2xl space-y-4 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider block">
                  ORDER #{collectingPaymentOrder.dailyOrderNumber || collectingPaymentOrder.id.slice(-5)}
                </span>
                <strong className="text-base font-extrabold text-white flex items-center gap-2">
                  Collect Payment: ₹{collectingPaymentOrder.totalAmount}
                </strong>
              </div>
              <button
                onClick={() => setCollectingPaymentOrder(null)}
                className="w-7 h-7 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-slate-900 border border-slate-800">
              <button
                onClick={() => setPaymentMode('CASH')}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMode === 'CASH'
                    ? 'bg-amber-500 text-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Banknote className="w-4 h-4" /> Physical Cash
              </button>

              <button
                onClick={handleSwitchToUpi}
                className={`py-2 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-colors ${
                  paymentMode === 'UPI'
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <QrCode className="w-4 h-4" /> Dynamic UPI QR
              </button>
            </div>

            {/* Verification Success Splash */}
            {paymentVerifiedSuccess ? (
              <div className="py-8 text-center space-y-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                <div className="w-14 h-14 rounded-full bg-emerald-500 text-black flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30 animate-bounce">
                  <Check className="w-8 h-8 stroke-[3]" />
                </div>
                <strong className="text-base font-black text-white block">Payment Verified!</strong>
                <p className="text-xs text-emerald-300">
                  ₹{collectingPaymentOrder.totalAmount} collected via {paymentMode}. Unlocking delivery completion.
                </p>
              </div>
            ) : paymentMode === 'CASH' ? (
              /* CASH COLLECTION TAB */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-center space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                    Exact Amount to Collect
                  </span>
                  <div className="text-3xl font-black text-white tracking-tight flex items-center justify-center gap-1">
                    <span className="text-amber-400 font-normal">₹</span>
                    {collectingPaymentOrder.totalAmount}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Please physically receive the cash from customer before confirming. Server enforces authoritative amount.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-300 block">Notes / Observations (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Exact change provided by customer"
                    value={cashNotes}
                    onChange={(e) => setCashNotes(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-xs"
                  />
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCollectingPaymentOrder(null)}
                    className="w-1/3 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCollectingCash}
                    onClick={handleConfirmCash}
                    className="w-2/3 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black uppercase tracking-wide disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
                  >
                    {isCollectingCash ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Verifying...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Confirm Cash Received
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              /* DYNAMIC UPI QR TAB */
              <div className="space-y-3.5">
                <div className="p-4 rounded-2xl bg-white text-center shadow-lg border border-slate-700 flex flex-col items-center justify-center relative overflow-hidden">
                  {isGeneratingUpi ? (
                    <div className="py-12 space-y-2 text-slate-900">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-500" />
                      <span className="text-xs font-bold block">Generating Dynamic Order QR...</span>
                    </div>
                  ) : qrCodeUrl ? (
                    <div className="space-y-2">
                      <img
                        src={qrCodeUrl}
                        alt="Order Specific Dynamic UPI QR"
                        className="w-52 h-52 mx-auto rounded-lg"
                      />
                      <div className="text-[11px] font-extrabold text-slate-800">
                        Scan with GPay, PhonePe, Paytm, Cred, BHIM
                      </div>
                    </div>
                  ) : (
                    <div className="py-10 text-slate-700">QR Code Error</div>
                  )}
                </div>

                {/* Live Waiting Indicator */}
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-extrabold text-emerald-400">Waiting for webhook confirmation...</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">10 min expiry</span>
                </div>

                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  🛡️ Order-specific dynamic QR. The customer pays directly through any UPI app. Once verified via signed webhook, this screen updates automatically.
                </p>

                <button
                  type="button"
                  onClick={() => setCollectingPaymentOrder(null)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Close & Keep Waiting
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── COMPLETE DELIVERY MODAL ─── */}
      {completingOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#0F172A] border border-slate-800 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <strong className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" /> Verify & Complete Delivery
              </strong>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-1">
              <strong className="block text-[11px] font-bold">100m Geofence Verification Active</strong>
              <p className="text-[10px] leading-tight text-emerald-400/90">
                Your GPS coordinates will be verified against the customer delivery address on completion.
              </p>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-3">
              <div className="space-y-1">
                <label className="font-bold text-slate-300 block">Proof Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Handed to customer at door"
                  value={proofNote}
                  onChange={(e) => setProofNote(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#090E17] border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletingOrderId(null)}
                  className="w-1/2 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black disabled:opacity-50"
                >
                  {isSubmitting ? 'Verifying...' : 'Confirm Delivered'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
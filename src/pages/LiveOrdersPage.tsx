import React, { useState } from 'react';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  Camera, 
  AlertCircle,
  IndianRupee,
  ChevronRight,
  ExternalLink
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import type { DeliveryOrder, OrderItem } from '../types/delivery';
import toast from 'react-hot-toast';

export default function LiveOrdersPage() {
  const { 
    activeOrders, 
    acceptDelivery, 
    confirmPickup, 
    completeDelivery,
    currentLocation 
  } = useDeliveryStore();

  const [completingOrderId, setCompletingOrderId] = useState<string | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
                  <span className="text-[10px] text-slate-400 font-mono">{order.paymentMethod || 'COD'}</span>
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
                <a
                  href={'tel:' + (order.contactPhone || '9179944445')}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" /> Call Customer
                </a>

                <a
                  href={'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(addressText)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" /> Open Maps
                </a>
              </div>

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
                  onClick={() => setCompletingOrderId(order.id)}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-sm uppercase tracking-wide shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-5 h-5" /> Mark Delivered (100m Proximity)
                </button>
              )}
            </div>
          );
        })
      )}

      {/* COMPLETE DELIVERY MODAL */}
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
import React, { useEffect, useState } from 'react';
import { 
  History, 
  Search, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  MapPin, 
  IndianRupee,
  Clock,
  Filter
} from 'lucide-react';
import { useDeliveryStore } from '../store/deliveryStore';
import type { DeliveryOrder } from '../types/delivery';

export default function DeliveryHistoryPage() {
  const { currentMonthHistory, isHistoryLoading, fetchCurrentMonthHistory } = useDeliveryStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchCurrentMonthHistory();
  }, []);

  const filteredHistory = currentMonthHistory.filter((order: DeliveryOrder) => {
    const matchesSearch = 
      (order.id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.customerName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (String(order.dailyOrderNumber || '')).includes(searchQuery);

    if (!matchesSearch) return false;
    if (statusFilter !== 'all') {
      if (statusFilter === 'completed' && order.status !== 'delivered' && order.status !== 'completed') return false;
      if (statusFilter === 'cancelled' && order.status !== 'cancelled' && order.status !== 'rejected') return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-extrabold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" /> Delivery History
          </h1>
          <span className="text-xs text-amber-400 font-bold">
            August 2026 (Current Calendar Month)
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {filteredHistory.length} Trips
        </span>
      </div>

      <div className="p-3 rounded-2xl bg-[#0F172A] border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
        <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Detailed delivery ledger is preserved for the <strong>current month</strong>. Older months are archived into monthly summary reports on the Dashboard.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search order #..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
        >
          <option value="all">All Trips</option>
          <option value="completed">Completed Only</option>
          <option value="cancelled">Cancelled Only</option>
        </select>
      </div>

      <div className="space-y-2.5">
        {isHistoryLoading ? (
          <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
            Loading current month delivery records...
          </div>
        ) : filteredHistory.length > 0 ? (
          filteredHistory.map((order: DeliveryOrder) => {
            const isCompleted = order.status === 'delivered' || order.status === 'completed';
            const addressText = typeof order.deliveryAddress === 'string'
              ? order.deliveryAddress
              : order.deliveryAddress?.addressLine || 'Rajnandgaon';

            return (
              <div
                key={order.id}
                className="p-3.5 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <strong className="text-xs font-bold text-white">
                      Order #{order.dailyOrderNumber || order.id.slice(-5)}
                    </strong>
                  </div>

                  <span className="text-xs font-extrabold text-amber-400">
                    +₹{order.deliveryFee || 40}
                  </span>
                </div>

                <div className="text-[11px] text-slate-300 flex items-center gap-1.5 truncate">
                  <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                  <span className="truncate">{addressText}</span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
                  <span>
                    {order.deliveredAt 
                      ? new Date(order.deliveredAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                  <span>{order.deliveryDistanceKm || 3.5} km • {order.deliveryDurationMin || 22} min</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-slate-500">
            No completed delivery records found for this filter in the current month.
          </div>
        )}
      </div>
    </div>
  );
}
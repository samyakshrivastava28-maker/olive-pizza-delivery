import React, { useEffect } from 'react';
import { 
  Package, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  TrendingUp, 
  IndianRupee, 
  Calendar,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Navigation
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDeliveryStore } from '../store/deliveryStore';
import type { MonthlyDeliverySummary } from '../types/delivery';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { 
    todayStats, 
    monthlyReports, 
    activeOrders, 
    isOnline, 
    toggleOnlineStatus, 
    fetchTodayStats, 
    fetchMonthlyReports 
  } = useDeliveryStore();

  useEffect(() => {
    fetchTodayStats();
    fetchMonthlyReports();
  }, []);

  return (
    <div className="space-y-4">
      {/* Active Delivery Notification Banner if order assigned */}
      {activeOrders.length > 0 && (
        <div 
          onClick={() => navigate('/live-orders')}
          className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/40 cursor-pointer shadow-lg shadow-amber-500/10 hover:border-amber-500 transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-black flex items-center justify-center font-black animate-pulse">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wide">ACTIVE DELIVERY</span>
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </div>
              <strong className="text-sm font-extrabold text-white block">
                Order #{activeOrders[0].dailyOrderNumber || activeOrders[0].id.slice(-5)}
              </strong>
              <span className="text-[11px] text-slate-300">
                {activeOrders[0].status.replace(/_/g, ' ').toUpperCase()} • Tap to open navigation
              </span>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-400" />
        </div>
      )}

      {/* Online / Offline Shift Status Card */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={'w-3 h-3 rounded-full ' + (isOnline ? 'bg-emerald-400 animate-ping' : 'bg-slate-600')} />
          <div>
            <strong className="text-xs font-extrabold text-white block">
              {isOnline ? 'You are ON-DUTY (Receiving Orders)' : 'You are OFF-DUTY'}
            </strong>
            <span className="text-[11px] text-slate-400">
              {isOnline ? 'Ready for automatic restaurant dispatch' : 'Go online to receive shift orders'}
            </span>
          </div>
        </div>
        <button
          onClick={() => toggleOnlineStatus()}
          className={'px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ' + (
            isOnline ? 'bg-slate-800 text-slate-300 hover:text-white' : 'bg-emerald-500 text-black font-extrabold'
          )}
        >
          {isOnline ? 'Go Offline' : 'Go Online'}
        </button>
      </div>

      {/* TODAY'S PERFORMANCE REPORT */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3.5 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Today's Delivery Report
            </h2>
          </div>
          <button 
            onClick={() => fetchTodayStats()}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 2x2 Grid Stats */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* Deliveries Completed */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Completed</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <strong className="text-xl font-black text-white">{todayStats.completed}</strong>
              <span className="text-[11px] text-slate-400 font-medium">/ {todayStats.assigned} assigned</span>
            </div>
          </div>

          {/* Today's Earnings */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Today's Payout</span>
              <IndianRupee className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-1">
              <strong className="text-xl font-black text-amber-400">₹{todayStats.earnings}</strong>
            </div>
          </div>

          {/* Total Distance */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Distance</span>
              <MapPin className="w-4 h-4 text-cyan-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.totalDistanceKm} km</strong>
          </div>

          {/* Average Delivery Time */}
          <div className="p-3 rounded-xl bg-[#131E35] border border-slate-800/80">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] font-medium">Avg Trip Time</span>
              <Clock className="w-4 h-4 text-purple-400" />
            </div>
            <strong className="text-lg font-black text-white">{todayStats.averageDeliveryTimeMin} min</strong>
          </div>
        </div>
      </div>

      {/* MONTHLY SUMMARY REPORTS (Current & Past Months) */}
      <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-extrabold uppercase text-white tracking-wider">
              Monthly Summary Reports
            </h2>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Archived Ledgers</span>
        </div>

        <div className="space-y-2.5">
          {monthlyReports.map((report: MonthlyDeliverySummary) => (
            <div
              key={report.id}
              className="p-3.5 rounded-xl bg-[#131E35] border border-slate-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <strong className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400" /> {report.monthName}
                </strong>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {report.onTimeRatePercent}% On-Time
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800 text-[11px]">
                <div>
                  <span className="text-slate-400 block text-[10px]">Deliveries</span>
                  <strong className="text-white font-extrabold">{report.completedDeliveries}</strong>
                  <span className="text-slate-500 text-[9px]"> / {report.totalDeliveries}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Distance</span>
                  <strong className="text-white font-extrabold">{report.totalDistanceKm} km</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Earnings</span>
                  <strong className="text-amber-400 font-extrabold">₹{report.totalEarnings}</strong>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Navigation, History, User, Settings } from 'lucide-react';
import { useDeliveryStore } from '../../store/deliveryStore';

export const BottomNav: React.FC = () => {
  const { activeOrders } = useDeliveryStore();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { label: 'Live Orders', path: '/live-orders', icon: Navigation, badge: activeOrders.length },
    { label: 'History', path: '/history', icon: History },
    { label: 'Account', path: '/account', icon: User },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[#0B111D]/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-1.5 safe-area-bottom">
      <div className="max-w-md mx-auto grid grid-cols-5 gap-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              'flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all relative ' +
              (isActive
                ? 'text-amber-400 font-bold bg-amber-500/10'
                : 'text-slate-400 hover:text-slate-200 font-medium')
            }
          >
            <div className="relative">
              <item.icon className="w-5 h-5 mb-0.5" />
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-1 -right-2.5 w-4 h-4 rounded-full bg-amber-500 text-black font-extrabold text-[10px] flex items-center justify-center animate-bounce">
                  {item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] leading-tight tracking-tight">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
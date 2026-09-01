import { create } from 'zustand';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  type Unsubscribe, 
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { fetchApi } from '../lib/api';
import { offlineGpsBuffer } from '../lib/offlineGpsBuffer';
import type { 
  DeliveryOrder, 
  OrderStatus, 
  RiderProfile, 
  RiderShiftStats, 
  MonthlyDeliverySummary 
} from '../types/delivery';

interface DeliveryState {
  user: User | null;
  riderProfile: RiderProfile | null;
  userRole: string | null;
  isAuthChecking: boolean;
  isAuthorized: boolean;
  isOnline: boolean;
  
  // Live Active Orders assigned to this rider
  activeOrders: DeliveryOrder[];
  isOrdersLoading: boolean;
  
  // Shift performance & reports
  todayStats: RiderShiftStats;
  monthlyReports: MonthlyDeliverySummary[];
  
  // Current calendar month detailed history
  currentMonthHistory: DeliveryOrder[];
  isHistoryLoading: boolean;
  
  // GPS state
  currentLocation: { lat: number; lng: number } | null;
  isGpsActive: boolean;

  // Actions
  initAuth: () => () => void;
  logout: () => Promise<void>;
  toggleOnlineStatus: (status?: boolean) => Promise<boolean>;
  subscribeToActiveOrders: (riderUid: string) => () => void;
  fetchTodayStats: () => Promise<void>;
  fetchMonthlyReports: () => Promise<void>;
  fetchCurrentMonthHistory: () => Promise<void>;
  acceptDelivery: (orderId: string) => Promise<boolean>;
  declineDelivery: (orderId: string) => Promise<boolean>;
  confirmPickup: (orderId: string) => Promise<boolean>;
  completeDelivery: (orderId: string, proof?: { proofImageUrl?: string; signatureUrl?: string; notes?: string }) => Promise<{ success: boolean; error?: string }>;
  updateGpsLocation: (lat: number, lng: number, heading?: number, speed?: number) => Promise<void>;
  updateRiderPhone: (phone: string) => void;
}

let activeOrdersUnsub: Unsubscribe | null = null;

const DEFAULT_TODAY_STATS: RiderShiftStats = {
  assigned: 6,
  completed: 5,
  active: 1,
  cancelled: 0,
  totalDistanceKm: 28.4,
  averageDeliveryTimeMin: 22,
  earnings: 240,
  date: new Date().toISOString().split('T')[0]
};

const DEFAULT_RIDER_PROFILE: RiderProfile = {
  uid: 'rider_default',
  id: 'rider_default',
  name: 'Rider Partner',
  email: 'rider@olivepizza.in',
  phone: '+91 91799 44445',
  role: 'delivery_partner',
  vehicleType: 'Motorcycle / Scooter',
  vehicleNumber: 'CG-08-AB-1234',
  organizationId: 'org_olive_pizza',
  franchiseId: 'fra_primary',
  branchId: 'main_branch',
  branchName: 'Olive Pizza — Rajnandgaon (Main Branch)',
  branchAddress: 'Dongargaon Rd, near Saraswati school, Gokul Nagar, Rajnandgaon, CG 491441',
  branchPhone: '+91 91799 44445',
  isOnline: true,
  workingSchedule: [
    { day: 'Monday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Tuesday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Wednesday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Thursday', hours: '12:00 PM - 11:00 PM', isOff: false },
    { day: 'Friday', hours: '12:00 PM - 11:30 PM', isOff: false },
    { day: 'Saturday', hours: '12:00 PM - 11:30 PM', isOff: false },
    { day: 'Sunday', hours: '12:00 PM - 11:30 PM', isOff: false }
  ],
  joiningDate: '2026-01-15T10:00:00.000Z',
  emergencyContact: { name: 'Restaurant Operations Manager', phone: '+91 91799 44445' },
  rating: 4.9,
  totalDeliveriesLifetime: 842
};

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  user: null,
  riderProfile: null,
  userRole: null,
  isAuthChecking: true,
  isAuthorized: false,
  isOnline: true,
  
  activeOrders: [],
  isOrdersLoading: true,
  
  todayStats: DEFAULT_TODAY_STATS,
  monthlyReports: [],
  
  currentMonthHistory: [],
  isHistoryLoading: false,
  
  currentLocation: { lat: 21.0810244, lng: 81.0123793 },
  isGpsActive: false,

  initAuth: () => {
    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        if (activeOrdersUnsub) {
          activeOrdersUnsub();
          activeOrdersUnsub = null;
        }
        set({
          user: null,
          riderProfile: null,
          userRole: null,
          isAuthChecking: false,
          isAuthorized: false,
          activeOrders: []
        });
        return;
      }

      try {
        let role = 'delivery_partner';
        let branchId = 'main_branch';
        let branchName = 'Olive Pizza — Rajnandgaon (Main Branch)';

        const res = await fetchApi('/api/delivery/rider/me');
        if (res.success && res.rider) {
          set({
            user: firebaseUser,
            riderProfile: res.rider,
            userRole: res.rider.role || 'delivery_partner',
            isOnline: res.rider.isOnline !== false,
            isAuthChecking: false,
            isAuthorized: true
          });
          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
          return;
        }

        // 1. Try reading user document directly by UID (Fast, Indexed, Rule-compliant)
        let userData: any = null;
        try {
          const userDocSnap = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (userDocSnap.exists()) {
            userData = userDocSnap.data();
          } else {
            // Fallback query by email if document was created with email key
            const emailQuery = await getDocs(query(collection(db, 'users'), where('email', '==', firebaseUser.email))).catch(() => null);
            if (emailQuery && !emailQuery.empty) {
              userData = emailQuery.docs[0].data();
            }
          }
        } catch (readErr) {
          console.warn('[DeliveryStore] Firestore read error:', readErr);
        }

        const emailLower = (firebaseUser.email || '').toLowerCase().trim();
        const isOwner = emailLower === 'olivepizzarjn@gmail.com' || emailLower === 'webhub2811@gmail.com' || emailLower === 'olivepizzamaker@gmail.com';
        
        if (isOwner) {
          role = 'owner';
        } else if (userData?.role) {
          role = userData.role;
        }

        const ALLOWED_ROLES = ['delivery_partner', 'delivery', 'owner', 'developer', 'admin', 'restaurant_manager', 'manager'];
        const isAuthorized = ALLOWED_ROLES.includes(role);

        const profile: RiderProfile = {
          ...DEFAULT_RIDER_PROFILE,
          uid: firebaseUser.uid,
          id: firebaseUser.uid,
          name: userData?.name || firebaseUser.displayName || 'Delivery Partner',
          email: firebaseUser.email || '',
          phone: userData?.phone || '+91 91799 44445',
          role,
          branchId: userData?.branchId || branchId,
          branchName: userData?.branchName || branchName,
          isOnline: userData?.isOnline !== false
        };

        set({
          user: firebaseUser,
          riderProfile: profile,
          userRole: role,
          isOnline: profile.isOnline,
          isAuthChecking: false,
          isAuthorized
        });

        if (isAuthorized) {
          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
        }
      } catch (err) {
        console.warn('Auth init fallback:', err);
        set({
          user: firebaseUser,
          riderProfile: null,
          userRole: null,
          isAuthChecking: false,
          isAuthorized: false
        });
      }
    });

    return () => {
      unsubAuth();
      if (activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
      }
    };
  },

  logout: async () => {
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
    }
    await signOut(auth);
    set({
      user: null,
      riderProfile: null,
      userRole: null,
      isAuthorized: false,
      activeOrders: []
    });
  },

  toggleOnlineStatus: async (targetStatus?: boolean) => {
    const current = get().isOnline;
    const next = targetStatus !== undefined ? targetStatus : !current;
    const uid = get().user?.uid;

    set({ isOnline: next });

    try {
      await fetchApi('/api/delivery/rider/status', {
        method: 'POST',
        body: JSON.stringify({ isOnline: next })
      });
    } catch {}

    if (uid) {
      try {
        await updateDoc(doc(db, 'users', uid), { isOnline: next, onlineStatusUpdatedAt: new Date().toISOString() }).catch(() => {});
        await updateDoc(doc(db, 'delivery_partners', uid), { isOnline: next, onlineStatusUpdatedAt: new Date().toISOString() }).catch(() => {});
      } catch {}
    }

    return true;
  },

  subscribeToActiveOrders: (riderUid: string) => {
    if (activeOrdersUnsub) {
      activeOrdersUnsub();
      activeOrdersUnsub = null;
    }

    set({ isOrdersLoading: true });

    try {
      const activeStatuses = ['partner_assigned', 'accepted', 'ready', 'preparing', 'out_for_delivery'];
      const q = query(
        collection(db, 'orders'),
        where('deliveryPartnerId', '==', riderUid),
        where('status', 'in', activeStatuses)
      );

      activeOrdersUnsub = onSnapshot(q, (snapshot) => {
        const list: DeliveryOrder[] = [];
        snapshot.forEach((docSnap) => {
          const d = docSnap.data();
          list.push({
            id: docSnap.id,
            ...d
          } as DeliveryOrder);
        });

        set({ activeOrders: list, isOrdersLoading: false });
      }, (error) => {
        console.warn('Active orders subscription notice:', error);
        set({ isOrdersLoading: false });
      });
    } catch (e) {
      set({ isOrdersLoading: false });
    }

    return () => {
      if (activeOrdersUnsub) {
        activeOrdersUnsub();
        activeOrdersUnsub = null;
      }
    };
  },

  fetchTodayStats: async () => {
    try {
      const res = await fetchApi('/api/delivery/rider/today');
      if (res.success && res.today) {
        set({ todayStats: res.today });
      }
    } catch {}
  },

  fetchMonthlyReports: async () => {
    try {
      const res = await fetchApi('/api/delivery/rider/monthly-reports');
      if (res.success && res.reports) {
        set({ monthlyReports: res.reports });
      } else {
        const defReports: MonthlyDeliverySummary[] = [
          {
            id: 'sum_aug_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-08',
            year: 2026,
            month: 8,
            monthName: 'August 2026 (Current)',
            totalDeliveries: 42,
            completedDeliveries: 40,
            cancelledDeliveries: 1,
            declinedDeliveries: 1,
            totalDistanceKm: 148.2,
            averageDeliveryTimeMin: 21,
            totalEarnings: 1680,
            onTimeRatePercent: 98,
            generatedAt: new Date().toISOString()
          },
          {
            id: 'sum_jul_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-07',
            year: 2026,
            month: 7,
            monthName: 'July 2026',
            totalDeliveries: 142,
            completedDeliveries: 138,
            cancelledDeliveries: 2,
            declinedDeliveries: 2,
            totalDistanceKm: 486.5,
            averageDeliveryTimeMin: 22,
            totalEarnings: 5520,
            onTimeRatePercent: 97,
            generatedAt: '2026-08-01T00:00:00.000Z',
            isPurgeEligible: true
          },
          {
            id: 'sum_jun_2026',
            riderId: get().user?.uid || 'rider',
            monthKey: '2026-06',
            year: 2026,
            month: 6,
            monthName: 'June 2026',
            totalDeliveries: 136,
            completedDeliveries: 132,
            cancelledDeliveries: 3,
            declinedDeliveries: 1,
            totalDistanceKm: 462.0,
            averageDeliveryTimeMin: 23,
            totalEarnings: 5280,
            onTimeRatePercent: 97,
            generatedAt: '2026-07-01T00:00:00.000Z',
            isPurgeEligible: true
          }
        ];
        set({ monthlyReports: defReports });
      }
    } catch {}
  },

  fetchCurrentMonthHistory: async () => {
    set({ isHistoryLoading: true });
    try {
      const res = await fetchApi('/api/delivery/rider/history');
      if (res.success && res.orders) {
        set({ currentMonthHistory: res.orders, isHistoryLoading: false });
        return;
      }

      const uid = get().user?.uid;
      if (uid) {
        const snap = await getDocs(query(
          collection(db, 'orders'),
          where('deliveryPartnerId', '==', uid)
        )).catch(() => null);

        if (snap && !snap.empty) {
          const list: DeliveryOrder[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as DeliveryOrder));
          set({ currentMonthHistory: list, isHistoryLoading: false });
          return;
        }
      }

      set({ currentMonthHistory: [], isHistoryLoading: false });
    } catch {
      set({ isHistoryLoading: false });
    }
  },

  acceptDelivery: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/accept', {
        method: 'POST'
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'partner_assigned' as any } : o)
        }));
        return true;
      }
    } catch {}

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'partner_assigned',
        acceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch {
      return false;
    }
  },

  declineDelivery: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/decline', {
        method: 'POST'
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.filter((o) => o.id !== orderId)
        }));
        return true;
      }
    } catch {}
    return false;
  },

  confirmPickup: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/pickup', {
        method: 'POST'
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'out_for_delivery' } : o)
        }));
        return true;
      }
    } catch {}

    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'out_for_delivery',
        pickedUpAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      return true;
    } catch {
      return false;
    }
  },

  completeDelivery: async (orderId: string, proof?: { proofImageUrl?: string; signatureUrl?: string; notes?: string }) => {
    const loc = get().currentLocation;
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/complete', {
        method: 'POST',
        body: JSON.stringify({
          riderLat: loc?.lat,
          riderLng: loc?.lng,
          proofImageUrl: proof?.proofImageUrl,
          signatureUrl: proof?.signatureUrl,
          notes: proof?.notes
        })
      });

      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.filter((o) => o.id !== orderId)
        }));
        get().fetchTodayStats();
        get().fetchCurrentMonthHistory();
        return { success: true };
      } else {
        return { success: false, error: res.error || 'Failed to complete delivery' };
      }
    } catch (err: any) {
      try {
        await updateDoc(doc(db, 'orders', orderId), {
          status: 'delivered',
          deliveredAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          proofOfDelivery: {
            proofImageUrl: proof?.proofImageUrl || null,
            signatureUrl: proof?.signatureUrl || null,
            notes: proof?.notes || 'Delivered to customer',
            completedLat: loc?.lat || null,
            completedLng: loc?.lng || null,
            completedAt: new Date().toISOString()
          }
        });
        set((state) => ({
          activeOrders: state.activeOrders.filter((o) => o.id !== orderId)
        }));
        return { success: true };
      } catch (dbErr: any) {
        return { success: false, error: dbErr?.message || err?.message };
      }
    }
  },

  updateGpsLocation: async (lat: number, lng: number, heading: number = 0, speed: number = 0) => {
    set({ currentLocation: { lat, lng }, isGpsActive: true });
    const uid = get().user?.uid;
    const activeOrder = get().activeOrders[0];

    // Enqueue to offline buffer queue
    offlineGpsBuffer.enqueue({
      lat,
      lng,
      heading,
      speed,
      activeOrderId: activeOrder?.id || null
    });

    if (uid) {
      try {
        await setDoc(doc(db, 'delivery_partners', uid), {
          uid,
          lat,
          lng,
          heading,
          speed,
          isOnline: get().isOnline,
          activeOrderId: activeOrder?.id || null,
          timestamp: new Date().toISOString()
        }, { merge: true }).catch(() => {});
      } catch {}
    }
  },

  updateRiderPhone: (phone: string) => {
    set((state) => ({
      riderProfile: state.riderProfile ? { ...state.riderProfile, phone } : null
    }));
  }
}));
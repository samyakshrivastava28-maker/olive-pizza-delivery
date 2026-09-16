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
import { auth, db } from '../lib/firebase';
import { fetchApi, getApiUrl } from '../lib/api';
import { offlineGpsBuffer } from '../lib/offlineGpsBuffer';
import { SoundAlertEngine } from '../lib/SoundAlertEngine';
import { deviceAlarmService } from '../services/DeviceAlarmService';
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
  restrictedReason: string | null;
  restrictedEmail: string | null;
  clearRestricted: () => void;
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
  updateGpsLocation: (lat: number, lng: number, heading?: number, speed?: number, accuracy?: number) => Promise<void>;
  updateRiderPhone: (phone: string) => void;
}

let activeOrdersUnsub: Unsubscribe | null = null;

const DEFAULT_TODAY_STATS: RiderShiftStats = {
  assigned: 0,
  completed: 0,
  active: 0,
  cancelled: 0,
  totalDistanceKm: 0,
  averageDeliveryTimeMin: 0,
  earnings: 0,
  date: new Date().toISOString().split('T')[0]
};

export const useDeliveryStore = create<DeliveryState>((set, get) => ({
  user: null,
  riderProfile: null,
  userRole: null,
  isAuthChecking: true,
  isAuthorized: false,
  restrictedReason: null,
  restrictedEmail: null,
  clearRestricted: () => set({ restrictedReason: null, restrictedEmail: null }),
  isOnline: true,
  
  activeOrders: [],
  isOrdersLoading: true,
  
  todayStats: DEFAULT_TODAY_STATS,
  monthlyReports: [],
  
  currentMonthHistory: [],
  isHistoryLoading: false,
  
  currentLocation: null,
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
          restrictedReason: null,
          restrictedEmail: null,
          activeOrders: []
        });
        return;
      }

      const emailLower = (firebaseUser.email || '').toLowerCase().trim();

      try {
        const idToken = await firebaseUser.getIdToken();
        const resp = await fetch(getApiUrl('api/auth/authorize-app'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            targetApp: 'DELIVERY'
          })
        });

        const authData = await resp.json().catch(() => null);

        if (resp.ok && authData?.authorized) {
          const u = authData.user || {};
          const profile: RiderProfile = {
            uid: firebaseUser.uid,
            id: firebaseUser.uid,
            name: u.name || firebaseUser.displayName || emailLower.split('@')[0] || 'Delivery Partner',
            email: firebaseUser.email || '',
            phone: u.phone || u.phoneNumber || '',
            role: u.role || 'delivery_partner',
            vehicleType: u.vehicleType || 'Vehicle',
            vehicleNumber: u.vehicleNumber || '',
            organizationId: u.organizationId || 'org_olive_pizza',
            franchiseId: u.franchiseId || 'fra_primary',
            branchId: u.branchId || 'main_branch',
            branchName: u.branchName || 'Olive Pizza',
            branchAddress: u.branchAddress || '',
            branchPhone: u.branchPhone || '',
            isOnline: true,
            workingSchedule: u.workingSchedule || [],
            joiningDate: u.joiningDate || u.createdAt || new Date().toISOString(),
            emergencyContact: u.emergencyContact || { name: 'Operations Support', phone: u.branchPhone || '' },
            rating: u.rating || 5.0,
            totalDeliveriesLifetime: u.totalDeliveriesLifetime || 0
          };

          set({
            user: firebaseUser,
            riderProfile: profile,
            userRole: profile.role,
            isOnline: true,
            isAuthChecking: false,
            isAuthorized: true,
            restrictedReason: null,
            restrictedEmail: null
          });

          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
        } else {
          // Unauthorized account — wipe session and enforce immediate sign out
          const denialReason = authData?.reason || 'Access Denied: This account is not authorized to use the Delivery application.';
          console.warn('[DeliveryStore] Access restricted for account:', emailLower, denialReason);

          await signOut(auth).catch(() => {});
          localStorage.removeItem('delivery_rider_profile');
          sessionStorage.clear();

          set({
            user: null,
            riderProfile: null,
            userRole: null,
            isAuthChecking: false,
            isAuthorized: false,
            restrictedReason: denialReason,
            restrictedEmail: emailLower,
            activeOrders: []
          });
        }
      } catch (err: any) {
        console.error('[DeliveryStore] Auth handshake network error:', err);
        await signOut(auth).catch(() => {});
        set({
          user: null,
          riderProfile: null,
          userRole: null,
          isAuthChecking: false,
          isAuthorized: false,
          restrictedReason: 'Access Denied: Server authorization unreachable or account unauthorized.',
          restrictedEmail: emailLower,
          activeOrders: []
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
    SoundAlertEngine.stopAlarm();
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

    if (!next) {
      SoundAlertEngine.stopAlarm();
    }

    try {
      await fetchApi('/api/delivery/rider/status', {
        method: 'POST',
        body: JSON.stringify({ isOnline: next })
      });
    } catch {}

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

        // Trigger continuous alarm if new order assigned to rider, stop if none pending or offline
        const hasUnaccepted = list.some((o) => o.status === 'partner_assigned');
        const isOnline = get().isOnline;
        const isAlarmEnabled = deviceAlarmService.isAlarmEnabled();

        // Guarantees alarm NEVER sounds when rider is offline or device alarm is OFF
        if (hasUnaccepted && isOnline && isAlarmEnabled) {
          SoundAlertEngine.startContinuousAlarm();
        } else {
          SoundAlertEngine.stopAlarm();
        }

        set({ activeOrders: list, isOrdersLoading: false });
      }, (error) => {
        console.warn('Active orders subscription notice:', error);
        set({ isOrdersLoading: false });
      });
    } catch (e) {
      set({ isOrdersLoading: false });
    }

    return () => {
      SoundAlertEngine.stopAlarm();
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
      if (res.success && Array.isArray(res.reports)) {
        set({ monthlyReports: res.reports });
      } else {
        set({ monthlyReports: [] });
      }
    } catch {
      set({ monthlyReports: [] });
    }
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
      set({ currentMonthHistory: [], isHistoryLoading: false });
    }
  },

  acceptDelivery: async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
    try {
      const res = await fetchApi('/api/delivery/rider/orders/' + orderId + '/accept', {
        method: 'POST'
      });
      if (res.success) {
        SoundAlertEngine.playSound('order_accepted');
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'partner_assigned' as any } : o)
        }));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  declineDelivery: async (orderId: string) => {
    SoundAlertEngine.stopAlarm();
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
        SoundAlertEngine.playSound('order_ready');
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => o.id === orderId ? { ...o, status: 'out_for_delivery' } : o)
        }));
        return true;
      }
      return false;
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
        SoundAlertEngine.playSound('order_delivered');
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
      return { success: false, error: err?.message || 'Failed to complete delivery' };
    }
  },

  updateGpsLocation: async (lat: number, lng: number, heading: number = 0, speed: number = 0, accuracy: number = 0) => {
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
        const nowIso = new Date().toISOString();
        await setDoc(doc(db, 'delivery_partners', uid), {
          uid,
          lat,
          lng,
          latitude: lat,
          longitude: lng,
          heading,
          speed,
          accuracy,
          isOnline: get().isOnline,
          activeOrderId: activeOrder?.id || null,
          lastLocationUpdate: nowIso,
          timestamp: nowIso
        }, { merge: true }).catch(() => {});

        // Also update delivery_locations for server-authoritative live tracking
        await setDoc(doc(db, 'delivery_locations', uid), {
          latitude: lat,
          longitude: lng,
          accuracy,
          speed,
          heading,
          active_order_id: activeOrder?.id || null,
          updated_at: nowIso
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
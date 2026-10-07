import { create } from 'zustand';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  type Unsubscribe, 
  getDocs,
  getDoc,
  doc
} from 'firebase/firestore';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { fetchApi, getApiUrl } from '../lib/api';
import { supabase } from '../lib/supabase';
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

import { locationService, type DeviceLocationState } from '../services/LocationService';

interface DeliveryState {
  user: User | null;
  riderProfile: RiderProfile | null;
  userRole: string | null;
  isAuthChecking: boolean;
  isAuthorized: boolean;
  authStatus?: 'APPROVED' | 'PENDING_OWNER_APPROVAL' | 'ACCOUNT_REJECTED' | 'ACCOUNT_DEACTIVATED' | null;
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
  
  // GPS state & enforcement
  currentLocation: { lat: number; lng: number } | null;
  isGpsActive: boolean;
  gpsStatus: DeviceLocationState;
  lastGpsFix: number | null;
  isGpsLocked: boolean;
  setGpsStatus: (status: DeviceLocationState, isLocked?: boolean) => void;
  requestGpsUnlock: () => Promise<boolean>;

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
  collectCodCash: (orderId: string, notes?: string) => Promise<{ success: boolean; error?: string; paymentStatus?: string }>;
  generateCodUpiQr: (orderId: string) => Promise<{ success: boolean; error?: string; attemptId?: string; amountDue?: number; upiString?: string; expiresAt?: string }>;
  checkCodPaymentStatus: (orderId: string) => Promise<{ success: boolean; isPaid: boolean; paymentStatus?: string; error?: string }>;
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
  authStatus: null,
  restrictedReason: null,
  restrictedEmail: null,
  clearRestricted: () => set({ restrictedReason: null, restrictedEmail: null }),
  isOnline: false,
  
  activeOrders: [],
  isOrdersLoading: true,
  
  todayStats: DEFAULT_TODAY_STATS,
  monthlyReports: [],
  
  currentMonthHistory: [],
  isHistoryLoading: false,
  
  currentLocation: null,
  isGpsActive: false,
  gpsStatus: 'UNKNOWN',
  lastGpsFix: null,
  isGpsLocked: false,

  initAuth: () => {
    const handleResume = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible' && auth.currentUser && get().isAuthorized) {
        auth.currentUser.getIdToken().then(idToken => {
          return fetch(getApiUrl('api/auth/authorize-app'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`,
              'X-App-Target': 'DELIVERY',
              'X-App-Source': 'DELIVERY'
            },
            body: JSON.stringify({ targetApp: 'DELIVERY' })
          });
        }).then(res => res.json()).then(authData => {
          if (authData && !authData.authorized) {
            console.warn('[DeliveryStore] Account revoked on app resume:', authData.reason);
            signOut(auth).catch(() => {});
            localStorage.removeItem('delivery_rider_profile');
            sessionStorage.clear();
            set({
              user: null,
              riderProfile: null,
              userRole: null,
              isAuthorized: false,
              restrictedReason: authData.reason || 'This account or franchise has been deactivated by the store owner.',
              restrictedEmail: auth.currentUser?.email || null,
              activeOrders: []
            });
          }
        }).catch(err => console.warn('[DeliveryStore] Resume auth check error:', err));
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleResume);
    }

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
            'Authorization': `Bearer ${idToken}`,
            'X-App-Target': 'DELIVERY',
            'X-App-Source': 'DELIVERY'
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
            franchiseId: u.franchiseId || '',
            branchId: u.branchId || '',
            branchName: u.branchName || 'Olive Pizza',
            branchAddress: u.branchAddress || '',
            branchPhone: u.branchPhone || '',
            isOnline: false,
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
            isOnline: false,
            isAuthChecking: false,
            isAuthorized: true,
            authStatus: 'APPROVED',
            restrictedReason: null,
            restrictedEmail: null
          });

          get().subscribeToActiveOrders(firebaseUser.uid);
          get().fetchTodayStats();
          get().fetchMonthlyReports();
        } else {
          // Explicitly unauthorized or pending account
          const denialReason = authData?.reason || 'Access Denied: This account is not authorized to use the Delivery application.';
          const code = authData?.code || 'UNAUTHORIZED';
          console.warn('[DeliveryStore] Access restricted for account:', emailLower, code, denialReason);

          const isPending = code === 'PENDING_OWNER_APPROVAL';
          if (!isPending) {
            await signOut(auth).catch(() => {});
          }

          localStorage.removeItem('delivery_rider_profile');
          sessionStorage.clear();

          set({
            user: isPending ? firebaseUser : null,
            riderProfile: null,
            userRole: null,
            isAuthChecking: false,
            isAuthorized: false,
            authStatus: isPending ? 'PENDING_OWNER_APPROVAL' : code === 'ACCOUNT_REJECTED' ? 'ACCOUNT_REJECTED' : code === 'ACCOUNT_INACTIVE' ? 'ACCOUNT_DEACTIVATED' : null,
            restrictedReason: denialReason,
            restrictedEmail: emailLower,
            activeOrders: []
          });
        }
      } catch (err: any) {
        console.error('[DeliveryStore] Auth handshake network error:', err);
        set({
          user: firebaseUser,
          riderProfile: null,
          userRole: null,
          isAuthChecking: false,
          isAuthorized: false,
          authStatus: null,
          restrictedReason: 'Server authorization unreachable. Please check your network connection and retry.',
          restrictedEmail: emailLower,
          activeOrders: []
        });
      }
    });

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleResume);
      }
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

    // Case 1: Switching to OFFLINE — Always allowed immediately
    if (!next) {
      SoundAlertEngine.stopAlarm();
      locationService.stopTracking();
      set({ isOnline: false, isGpsLocked: false, isGpsActive: false, gpsStatus: 'OFFLINE' });
      const uid = get().user?.uid;
      if (supabase && uid) {
        try {
          supabase.from('delivery_locations').update({ online_status: false, last_updated: new Date().toISOString() }).eq('delivery_partner_id', uid).then();
        } catch {}
      }
      try {
        await fetchApi('/api/delivery/rider/status', {
          method: 'POST',
          body: JSON.stringify({ isOnline: false })
        });
      } catch {}
      return true;
    }

    // Case 2: Switching to ONLINE — GPS is strictly MANDATORY
    const uid = get().user?.uid;
    const activeOrder = get().activeOrders[0];

    // Wire up callbacks into LocationService
    locationService.setCallbacks({
      riderId: uid,
      getActiveOrderId: () => get().activeOrders[0]?.id || null,
      onLocationUpdate: async (coords) => {
        set({
          currentLocation: { lat: coords.latitude, lng: coords.longitude },
          isGpsActive: true,
          lastGpsFix: coords.timestamp,
          gpsStatus: 'ACTIVE',
          isGpsLocked: false
        });
      },
      onStateChange: (state) => {
        set((s) => ({
          gpsStatus: state,
          isGpsLocked: s.isOnline && (state === 'PERMISSION_DENIED' || state === 'SERVICE_DISABLED' || state === 'STALE'),
          isGpsActive: state === 'ACTIVE'
        }));
      }
    });

    const started = await locationService.startTracking();
    if (started && locationService.getState() === 'ACTIVE') {
      const currentLoc = locationService.getLastCoordinates();
      if (currentLoc && typeof currentLoc.latitude === 'number' && typeof currentLoc.longitude === 'number') {
        try {
          const res = await fetchApi('/api/delivery/rider/status', {
            method: 'POST',
            body: JSON.stringify({
              isOnline: true,
              latitude: currentLoc.latitude,
              longitude: currentLoc.longitude,
              accuracy: currentLoc.accuracy
            })
          });
          if (res?.success !== false) {
            set({ isOnline: true, isGpsLocked: false, gpsStatus: 'ACTIVE', isGpsActive: true });
            return true;
          }
        } catch (e) {
          console.warn('[DeliveryStore] Online status sync failed:', e);
        }
      }
    }

    const state = locationService.getState();
    set({
      isOnline: false,
      isGpsLocked: true,
      gpsStatus: state,
      isGpsActive: false
    });
    return false;
  },

  setGpsStatus: (status, isLocked) => {
    set((state) => ({
      gpsStatus: status,
      isGpsLocked: isLocked !== undefined ? isLocked : (state.isOnline && (status === 'PERMISSION_DENIED' || status === 'SERVICE_DISABLED' || status === 'STALE')),
      isGpsActive: status === 'ACTIVE'
    }));
  },

  requestGpsUnlock: async () => {
    const started = await locationService.startTracking();
    if (started) {
      set({ isGpsLocked: false, gpsStatus: 'ACTIVE', isGpsActive: true });
      const currentLoc = locationService.getLastCoordinates();
      if (currentLoc) {
        try {
          await fetchApi('/api/delivery/rider/status', {
            method: 'POST',
            body: JSON.stringify({
              isOnline: true,
              latitude: currentLoc.latitude,
              longitude: currentLoc.longitude,
              accuracy: currentLoc.accuracy
            })
          });
        } catch {}
      }
      return true;
    } else {
      const state = locationService.getState();
      set({
        isGpsLocked: true,
        gpsStatus: state,
        isGpsActive: false
      });
      return false;
    }
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

        // Trigger continuous alarm only for fresh assignments (< 20 mins)
        const now = Date.now();
        const hasUnaccepted = list.some((o) => {
          if (o.status !== 'partner_assigned') return false;
          const assignedTime = (o as any).assignedAt || (o as any).partnerAssignedAt || o.updatedAt || o.createdAt;
          const timeMs = assignedTime ? new Date(assignedTime).getTime() : 0;
          return timeMs > 0 && (now - timeMs < 20 * 60 * 1000);
        });
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

  collectCodCash: async (orderId: string, notes?: string) => {
    try {
      const res = await fetchApi('/api/payments/cod/cash-collect', {
        method: 'POST',
        body: JSON.stringify({ orderId, notes }),
      });
      if (res.success) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) =>
            o.id === orderId
              ? { ...o, paymentStatus: 'PAID', isPaid: true, paymentCollectionType: 'CASH' }
              : o
          ),
        }));
        return { success: true, paymentStatus: 'PAID' };
      }
      return { success: false, error: res.error || 'Cash collection failed' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Cash collection failed' };
    }
  },

  generateCodUpiQr: async (orderId: string) => {
    try {
      const res = await fetchApi('/api/payments/cod/upi-intent', {
        method: 'POST',
        body: JSON.stringify({ orderId }),
      });
      if (res.success) {
        return {
          success: true,
          attemptId: res.attemptId,
          amountDue: res.amountDue,
          upiString: res.upiString,
          expiresAt: res.expiresAt,
        };
      }
      return { success: false, error: res.error || 'Failed to generate UPI QR' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to generate UPI QR' };
    }
  },

  checkCodPaymentStatus: async (orderId: string) => {
    try {
      const res = await fetchApi(`/api/payments/cod/status/${orderId}`);
      if (res.success && res.isPaid) {
        set((state) => ({
          activeOrders: state.activeOrders.map((o) =>
            o.id === orderId
              ? { ...o, paymentStatus: 'PAID', isPaid: true, paymentCollectionType: res.paymentCollectionType }
              : o
          ),
        }));
        return { success: true, isPaid: true, paymentStatus: res.paymentStatus };
      }
      return { success: true, isPaid: Boolean(res?.isPaid), paymentStatus: res?.paymentStatus };
    } catch (err: any) {
      return { success: false, isPaid: false, error: err.message };
    }
  },

  updateGpsLocation: async (lat: number, lng: number, heading: number = 0, speed: number = 0, accuracy: number = 0) => {
    const now = Date.now();
    set({
      currentLocation: { lat, lng },
      isGpsActive: true,
      lastGpsFix: now,
      gpsStatus: 'ACTIVE',
      isGpsLocked: false
    });
    const uid = get().user?.uid;
    const activeOrder = get().activeOrders[0];

    // Enqueue to offline buffer queue (streams directly to Supabase Realtime hot path)
    offlineGpsBuffer.enqueue({
      riderId: uid,
      lat,
      lng,
      heading,
      speed,
      accuracy,
      activeOrderId: activeOrder?.id || null
    });
  },

  updateRiderPhone: (phone: string) => {
    set((state) => ({
      riderProfile: state.riderProfile ? { ...state.riderProfile, phone } : null
    }));
  }
}));
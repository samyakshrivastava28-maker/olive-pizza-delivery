import { Capacitor } from '@capacitor/core';
import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5000";

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (Capacitor.isNativePlatform()) {
    return PRODUCTION_BACKEND_URL;
  }
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'capacitor:' &&
    window.location.protocol !== 'ionic:'
  ) {
    return "";
  }
  return PRODUCTION_BACKEND_URL;
}

export function getWebSocketUrl(): string {
  const base = getApiBaseUrl() || PRODUCTION_BACKEND_URL;
  if (base.startsWith('https://')) {
    return base.replace('https://', 'wss://') + '/ws';
  }
  if (base.startsWith('http://')) {
    return base.replace('http://', 'ws://') + '/ws';
  }
  if (typeof window !== 'undefined' && window.location.host) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/ws`;
  }
  return PRODUCTION_BACKEND_URL.replace('https://', 'wss://') + '/ws';
}

export function getApiUrl(endpoint: string = ''): string {
  const clean = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    return baseUrl.replace(/\/+$/, '') + clean;
  }
  return clean;
}

export const API_BASE_URL = getApiBaseUrl();

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  rider?: any;
  today?: any;
  reports?: any[];
  orders?: any[];
  currentMonth?: string;
  message?: string;
  error?: string;
  status?: string;
  [key: string]: any;
}

function getOrGenerateDeviceId(): string {
  try {
    let id = localStorage.getItem('delivery_device_id');
    if (!id) {
      id = 'dev_rider_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      localStorage.setItem('delivery_device_id', id);
    }
    return id;
  } catch {
    return 'dev_delivery_client';
  }
}

export interface CacheOptions {
  ttlMs?: number;
  forceRefresh?: boolean;
}

const inFlightRequests = new Map<string, Promise<any>>();
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

export function invalidateDeliveryCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (typeof pattern === 'string' ? key.includes(pattern) : pattern.test(key)) {
      memoryCache.delete(key);
    }
  }
}

export async function fetchApi<T = any>(
  endpoint: string,
  options: RequestInit = {},
  cacheOptions?: CacheOptions
): Promise<ApiResponse<T>> {
  const method = (options.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const cleanKey = `GET:${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const ttlMs = cacheOptions?.ttlMs ?? 0;
  const forceRefresh = cacheOptions?.forceRefresh ?? false;

  if (isGet && !forceRefresh && ttlMs > 0) {
    const cached = memoryCache.get(cleanKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.data;
    }
  }

  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
    return inFlightRequests.get(cleanKey);
  }

  const executionPromise = (async () => {
    try {
      const primaryUrl = getApiUrl(endpoint);
      const headers = new Headers(options.headers || {});

      if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }

      if (!headers.has('X-App-Target')) {
        headers.set('X-App-Target', 'DELIVERY');
      }
      if (!headers.has('X-App-Source')) {
        headers.set('X-App-Source', 'DELIVERY');
      }

      if (!headers.has('X-Device-Id')) {
        headers.set('X-Device-Id', getOrGenerateDeviceId());
      }

      const token = await getCurrentAuthToken();
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', 'Bearer ' + token);
      }

      const config: RequestInit = {
        ...options,
        headers,
      };

      let res = await fetch(primaryUrl, config);

      if (!res.ok && primaryUrl.startsWith('/')) {
        try {
          const directUrl = DEV_BACKEND_URL + primaryUrl;
          const fallbackRes = await fetch(directUrl, config);
          if (fallbackRes.ok) {
            res = fallbackRes;
          }
        } catch {}
      }

      if (res.status === 429) {
        const json = await res.json().catch(() => null);
        return {
          success: false,
          code: 'AUTH_RATE_LIMITED',
          error: json?.message || 'Too many attempts from this device. Please try again later.',
          message: json?.message || 'Too many attempts from this device. Please try again later.',
          retryAfter: json?.retryAfter || json?.retryAfterSeconds || 120
        };
      }

      if (res.status === 401) {
        return { success: false, error: 'Authentication expired or invalid. Please sign in again.' };
      }

      if (res.status === 403) {
        return { success: false, error: 'Unauthorized. You do not have delivery partner permissions.' };
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        return {
          success: false,
          code: json?.code || 'ERROR',
          referenceId: json?.referenceId,
          error: json?.message || json?.error || 'A service error occurred. Please try again.'
        };
      }

      const result = json || { success: true };

      if (isGet && ttlMs > 0) {
        memoryCache.set(cleanKey, {
          data: result,
          expiresAt: Date.now() + ttlMs,
        });
      }

      return result;
    } catch (err: any) {
      console.warn('[fetchApi] Backend notice for ' + endpoint + ':', err?.message);
      return {
        success: false,
        code: 'NETWORK_ERROR',
        error: 'Unable to connect to the server. Please check your network.'
      };
    } finally {
      inFlightRequests.delete(cleanKey);
    }
  })();

  if (isGet) {
    inFlightRequests.set(cleanKey, executionPromise);
  }

  return executionPromise;
}

// ─── DELIVERY RIDER SMART BOOTSTRAP AGGREGATOR HELPER ─────────────────────────

export interface DeliveryLiveBootstrapResponse {
  success: boolean;
  activeOrders: any[];
  riderStatus: any;
  branchCoordinates: any;
  todayEarnings: any;
}

export async function fetchDeliveryLiveBootstrap(
  forceRefresh = false
): Promise<ApiResponse<DeliveryLiveBootstrapResponse>> {
  return fetchApi<DeliveryLiveBootstrapResponse>(
    '/api/v1/delivery/live/bootstrap',
    { method: 'GET' },
    { ttlMs: 15000, forceRefresh }
  );
}
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
  if (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.location.protocol !== 'capacitor:' &&
    window.location.protocol !== 'ionic:' &&
    window.location.protocol !== 'file:'
  ) {
    return "";
  }
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL.replace(/\/+$/, '');
  }
  if (Capacitor.isNativePlatform()) {
    return PRODUCTION_BACKEND_URL;
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return DEV_BACKEND_URL;
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
  persist?: boolean;
  swr?: boolean;
  onFreshData?: (data: any) => void;
}

// Canonical TTLs in milliseconds matching Backend Redis Layerbase cache
export const CLIENT_CACHE_TTL = {
  RESTAURANT_STATUS: 60 * 1000,    // 60s (1 min)
  LIVE_BOOTSTRAP: 15 * 1000,       // 15s
  RIDER_TODAY: 60 * 1000,          // 60s (1 min)
  RIDER_HISTORY: 120 * 1000,       // 120s (2 min)
  APP_CONFIG: 600 * 1000,          // 600s (10 min)
};

const STORAGE_PREFIX = 'op_deliv_cache_';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  timestamp: number;
}

const inFlightRequests = new Map<string, Promise<any>>();
const memoryCache = new Map<string, CacheEntry<any>>();

function getCachedEntry<T>(key: string): CacheEntry<T> | null {
  const mem = memoryCache.get(key);
  if (mem) return mem;

  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(raw);
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {}
  }
  return null;
}

function setCachedEntry<T>(key: string, data: T, ttlMs: number, persist: boolean = true): void {
  const now = Date.now();
  const entry: CacheEntry<T> = {
    data,
    timestamp: now,
    expiresAt: now + ttlMs,
  };
  memoryCache.set(key, entry);

  if (persist && typeof window !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(entry));
    } catch {}
  }
}

export function invalidateDeliveryCache(pattern?: string | RegExp): void {
  if (!pattern) {
    memoryCache.clear();
    if (typeof window !== 'undefined') {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) keysToRemove.push(k);
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
    return;
  }

  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      memoryCache.delete(key);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          const bare = k.replace(STORAGE_PREFIX, '');
          if (regex.test(bare)) keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}

export function invalidateRiderOrdersCache(): void {
  invalidateDeliveryCache(/(orders|bootstrap|active-orders|today)/);
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
  const persist = cacheOptions?.persist ?? true;
  const enableSwr = cacheOptions?.swr ?? true;

  // 1. Check multi-tier cache
  const cachedEntry = isGet && ttlMs > 0 ? getCachedEntry<ApiResponse<T>>(cleanKey) : null;
  const isFresh = cachedEntry ? Date.now() < cachedEntry.expiresAt : false;

  // 1a. Fresh cache hit -> immediate return (0ms)
  if (isGet && !forceRefresh && cachedEntry && isFresh) {
    return cachedEntry.data;
  }

  // 2. Request deduplication for simultaneous calls
  if (isGet && !forceRefresh && inFlightRequests.has(cleanKey)) {
    if (cachedEntry && enableSwr) {
      return cachedEntry.data;
    }
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

      let res: Response;
      try {
        res = await fetch(primaryUrl, config);
      } catch (fetchErr: any) {
        // Safe proxy fallback: Only on localhost when Vite proxy connection is refused
        const isLocalDev = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        if (isLocalDev && primaryUrl.startsWith('/')) {
          const directUrl = DEV_BACKEND_URL + primaryUrl;
          res = await fetch(directUrl, config);
        } else {
          throw fetchErr;
        }
      }

      // If local dev Vite proxy returned a gateway error (502/504), retry direct backend
      const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      if (isLocalHost && (res.status === 502 || res.status === 504) && primaryUrl.startsWith('/')) {
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
        const json = await res.json().catch(() => null);
        return { success: false, code: json?.code || 'UNAUTHORIZED', error: json?.message || json?.error || 'Authentication expired or invalid. Please sign in again.' };
      }

      if (res.status === 403) {
        const json = await res.json().catch(() => null);
        return { success: false, code: json?.code || 'FORBIDDEN', error: json?.message || json?.error || 'Unauthorized. You do not have delivery partner permissions.' };
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
        setCachedEntry(cleanKey, result, ttlMs, persist);
        if (cacheOptions?.onFreshData) {
          try {
            cacheOptions.onFreshData(result);
          } catch (e) {
            console.warn(`[fetchApi] onFreshData handler error for ${cleanKey}:`, e);
          }
        }
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

  // 3. Stale-While-Revalidate: Return stale cached data immediately (0ms) while background fetch updates
  if (isGet && !forceRefresh && cachedEntry && enableSwr) {
    return cachedEntry.data;
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
  forceRefresh = false,
  onFreshData?: (data: ApiResponse<DeliveryLiveBootstrapResponse>) => void
): Promise<ApiResponse<DeliveryLiveBootstrapResponse>> {
  return fetchApi<DeliveryLiveBootstrapResponse>(
    '/api/v1/delivery/live/bootstrap',
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.LIVE_BOOTSTRAP, // 15s
      forceRefresh,
      swr: true,
      onFreshData,
    }
  );
}

export async function fetchAppConfig(appName: string, forceRefresh = false): Promise<ApiResponse<any>> {
  return fetchApi(
    `/api/config/${encodeURIComponent(appName)}`,
    { method: 'GET' },
    {
      ttlMs: CLIENT_CACHE_TTL.APP_CONFIG, // 600s (10 min) matching Redis Layerbase
      forceRefresh,
      swr: true,
    }
  );
}
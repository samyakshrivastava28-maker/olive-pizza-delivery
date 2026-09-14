import { Capacitor } from '@capacitor/core';
import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5000";

export function getApiBaseUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return PRODUCTION_BACKEND_URL;
  }
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  return PRODUCTION_BACKEND_URL;
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

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const primaryUrl = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
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

  try {
    let res = await fetch(primaryUrl, config);

    // If proxy failed on local dev, fallback directly to backend URL
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

    return json || { success: true };
  } catch (err: any) {
    console.warn('[fetchApi] Backend notice for ' + endpoint + ':', err?.message);
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: 'Unable to connect to the server. Please check your network.'
    };
  }
}
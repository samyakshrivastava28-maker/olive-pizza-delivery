import { getCurrentAuthToken } from './firebase';

export const PRODUCTION_BACKEND_URL = "https://olivepizza-owner.onrender.com";
export const DEV_BACKEND_URL = "http://localhost:5175";

export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.PROD) {
    return PRODUCTION_BACKEND_URL;
  }
  return DEV_BACKEND_URL;
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

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const primaryUrl = getApiUrl(endpoint);
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
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
        error: json?.error || json?.message || ('Server returned error (' + res.status + ')')
      };
    }

    return json || { success: true };
  } catch (err: any) {
    console.warn('[fetchApi] Backend notice for ' + endpoint + ':', err?.message);
    return {
      success: false,
      error: err?.message || 'Network connection unavailable.'
    };
  }
}
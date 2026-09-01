import { registerPlugin, Capacitor } from '@capacitor/core';
import { fetchApi } from './api';

export interface TruecallerNativeResult {
  payload: string;
  signature: string;
  signatureAlgorithm?: string;
}

export interface TruecallerPlugin {
  isSupported(): Promise<{ isSupported: boolean }>;
  verify(): Promise<TruecallerNativeResult>;
}

export const Truecaller = registerPlugin<TruecallerPlugin>('Truecaller', {
  web: () => ({
    isSupported: async () => ({ isSupported: false }),
    verify: async () => {
      throw new Error('Native Truecaller SDK is available on Android devices. Use Web / QR verification on browsers.');
    }
  })
});

export interface TruecallerWebSessionResponse {
  success: boolean;
  requestId: string;
  deepLink: string;
  expiresAt: number;
}

export interface TruecallerSessionStatusResponse {
  success: boolean;
  status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'CANCELLED';
  phone?: string;
  error?: string;
  name?: string;
  country?: string;
}

export const TruecallerService = {
  isNative: (): boolean => {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  },

  isNativeSupported: async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return false;
    }
    try {
      const result = await Truecaller.isSupported();
      return Boolean(result?.isSupported);
    } catch {
      return false;
    }
  },

  verifyNative: async (): Promise<TruecallerNativeResult> => {
    return Truecaller.verify();
  },

  createWebSession: async (expectedPhone?: string): Promise<TruecallerWebSessionResponse> => {
    const res = await fetchApi<TruecallerWebSessionResponse>('/api/phone/truecaller/session', {
      method: 'POST',
      body: JSON.stringify({ expectedPhone })
    });
    if (!res.success) {
      throw new Error(res.error || 'Failed to initiate Truecaller web session.');
    }
    return res as any;
  },

  pollWebSession: async (requestId: string): Promise<TruecallerSessionStatusResponse> => {
    const res = await fetchApi<TruecallerSessionStatusResponse>(`/api/phone/truecaller/session/${requestId}`);
    return res as any;
  },

  verifyOnBackend: async (payload: any, expectedPhone?: string): Promise<any> => {
    const bodyPayload = {
      ...payload,
      expectedPhone
    };

    const res = await fetchApi('/api/phone/truecaller', {
      method: 'POST',
      body: JSON.stringify(bodyPayload)
    });
    if (!res.success) {
      throw new Error(res.error || 'Truecaller verification failed on server.');
    }
    return res;
  }
};

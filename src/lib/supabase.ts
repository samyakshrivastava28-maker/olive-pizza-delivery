import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 🛰️ Olive Pizza Delivery - Direct Supabase GPS Client
 * 
 * STRICT ARCHITECTURAL INVARIANT (Section 10 & 11):
 * High-frequency GPS coordinates stream directly to Supabase Realtime / WebSocket.
 * Coordinates DO NOT route through Node/Express per coordinate.
 */

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '') as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '') as string;

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnonKey) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      }
    });
  } catch (err: any) {
    console.warn('[Supabase GPS] Failed to initialize client:', err?.message);
  }
}

export const supabase = client;

export interface DeliveryLocationPayload {
  delivery_partner_id: string;
  active_order_id: string | null;
  latitude: number;
  longitude: number;
  heading: number;
  speed: number;
  accuracy: number;
  online_status: boolean;
  last_updated: string;
}

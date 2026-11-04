import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * 🛰️ Olive Pizza Delivery - Direct Supabase GPS Client
 * 
 * STRICT ARCHITECTURAL INVARIANT (Section 10 & 11):
 * High-frequency GPS coordinates stream directly to Supabase Realtime / WebSocket.
 * Coordinates DO NOT route through Node/Express per coordinate.
 */

const DEFAULT_SUPABASE_URL = 'https://tdjrkqmhdynbaciguyvr.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkanJrcW1oZHluYmFjaWd1eXZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDE4MzUsImV4cCI6MjA5Nzg3NzgzNX0.03rt77yV0zfnxbLNqbEOWijqpT0iAuEgYqSTGN0HPtI';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL) as string;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY) as string;

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

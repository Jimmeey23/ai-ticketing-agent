import { createClient } from '@supabase/supabase-js';

const fallbackUrl = 'https://hdtyjkcorrgzoxshalkb.databasepad.com';
const fallbackAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjNmZjFjZWI2LTUwODgtNDY5MC04NDQzLWIzYTVmYjQzNzAxNyJ9.eyJwcm9qZWN0SWQiOiJoZHR5amtjb3JyZ3pveHNoYWxrYiIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc4ODIyNTAwLCJleHAiOjIwOTQxODI1MDAsImlzcyI6ImZhbW91cy5kYXRhYmFzZXBhZCIsImF1ZCI6ImZhbW91cy5jbGllbnRzIn0.EexocF_GF9qaq0j3r-sHCHd-2QtUGGOWWNeJV_3B4nU';

const backendSupabaseUrl = import.meta.env.VITE_TICKETING_SUPABASE_URL || fallbackUrl;
const backendSupabaseAnonKey = import.meta.env.VITE_TICKETING_SUPABASE_ANON_KEY || fallbackAnonKey;

export const backendSupabase = createClient(backendSupabaseUrl, backendSupabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'p57-ticketing-auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

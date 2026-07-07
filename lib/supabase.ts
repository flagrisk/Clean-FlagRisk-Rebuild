// ============================================================================
// FlagRisk app — Supabase client
// ----------------------------------------------------------------------------
// The single connection point between the mobile app and your live backend.
// Every screen imports `supabase` from here to call the database (through RLS)
// and the Edge Functions (submit-report, trigger-panic).
//
// The anon key is PUBLIC and safe to ship in the app — it only grants what
// Row Level Security allows. Real protection lives in your RLS policies, not in
// hiding this key.
// ============================================================================

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://aqgkntulbuqqqjxjafmw.supabase.co";

// NOTE: paste your anon public key here (Settings -> API -> anon public).
// It's safe to commit; it is not a secret.
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxZ2tudHVsYnVxcXFqeGphZm13Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3Nzk2MjUsImV4cCI6MjA5NzM1NTYyNX0.QlGgZpTIp17Ip6XKMdrVEvoBHGZ61c_dVPcAZ1clNEs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // remember the logged-in session on the device between launches
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // RN has no URL bar, so there's no OAuth redirect to detect
    detectSessionInUrl: false,
  },
});

// Convenience: the base URL for calling Edge Functions from the app.
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

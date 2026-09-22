import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type Session } from "@supabase/supabase-js";
import { AppState, type AppStateStatus } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

let client: ReturnType<typeof createClient> | null = null;
let appStateBound = false;

function bindAppStateRefresh(sb: ReturnType<typeof createClient>) {
  if (appStateBound) return;
  appStateBound = true;
  // Expo / RN: refresh only while foregrounded (Supabase RN quickstart pattern).
  sb.auth.startAutoRefresh();
  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") sb.auth.startAutoRefresh();
    else sb.auth.stopAutoRefresh();
  });
}

export function isSupabaseConfigured() {
  return Boolean(url && anon);
}

export function getSupabase() {
  if (!url || !anon) {
    throw new Error("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required.");
  }
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
    bindAppStateRefresh(client);
  }
  return client;
}

export function sessionAccessToken(session: Session | null) {
  return session?.access_token ?? null;
}

/** Drop a corrupt persisted session without hitting the network. */
export async function clearLocalSupabaseSession() {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabase().auth.signOut({ scope: "local" });
  } catch (e) {
    console.warn("[auth] clearLocalSupabaseSession failed", e);
  }
}

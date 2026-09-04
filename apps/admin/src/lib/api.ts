import { createSupabaseBrowserClient } from "./supabase";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function isProductionEnv() {
  return process.env.NEXT_PUBLIC_APP_ENV === "production";
}

async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sb = createSupabaseBrowserClient();
  const { data } = await sb.auth.getSession();
  if (data.session?.access_token) {
    headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
  }
  if (!isProductionEnv() && typeof window !== "undefined") {
    const key = localStorage.getItem("playbyte_admin_key");
    if (key) headers["X-Admin-Key"] = key;
  }
  return headers;
}

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(await authHeaders()),
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? res.statusText);
  return data;
}

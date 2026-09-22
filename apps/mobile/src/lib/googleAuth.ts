import { Platform } from "react-native";
import { GoogleSignin, isSuccessResponse, statusCodes } from "@react-native-google-signin/google-signin";

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? "";

let configured = false;

export function isGoogleSignInConfigured(): boolean {
  return Boolean(webClientId);
}

function ensureConfigured() {
  if (configured) return;
  if (!webClientId) {
    throw new Error("Google Sign-In is not configured for this build.");
  }
  GoogleSignin.configure({
    webClientId,
    offlineAccess: false,
  });
  configured = true;
}

async function clearPriorGoogleSession() {
  try {
    const current = await GoogleSignin.getCurrentUser();
    if (current) await GoogleSignin.signOut();
  } catch {
    /* ignore — no prior session */
  }
}

export async function getGoogleIdToken(): Promise<string> {
  if (Platform.OS !== "android") {
    throw new Error("Google Sign-In is available on Android only.");
  }
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  await clearPriorGoogleSession();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) {
    throw new Error("Google Sign-In was cancelled.");
  }
  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error("Google did not return an ID token. Check EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.");
  }
  return idToken;
}

export function isGoogleNativeError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as { code?: string | number }).code;
  return (
    code === statusCodes.SIGN_IN_CANCELLED ||
    code === statusCodes.IN_PROGRESS ||
    code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE ||
    code === statusCodes.SIGN_IN_REQUIRED ||
    code === "SIGN_IN_CANCELLED" ||
    code === "DEVELOPER_ERROR" ||
    code === 10 // DEVELOPER_ERROR on Android
  );
}

export function mapGoogleSignInError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "Google Sign-In failed.";
  }
  const e = error as { code?: string | number; message?: string };
  if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === "SIGN_IN_CANCELLED") {
    return "Google Sign-In cancelled.";
  }
  if (e.code === statusCodes.IN_PROGRESS) {
    return "Google Sign-In is already in progress.";
  }
  if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
    return "Google Play Services is missing or outdated.";
  }
  if (e.code === "DEVELOPER_ERROR" || e.code === 10) {
    return "Google Sign-In misconfigured (package name or SHA-1). See google-auth-setup runbook.";
  }
  const msg = e.message || "";
  if (msg.toLowerCase().includes("provider") && msg.toLowerCase().includes("not enabled")) {
    return "Google Sign-In is not enabled on the server yet. Use email, or ask the team to enable Google in Supabase.";
  }
  return msg || "Google Sign-In failed.";
}

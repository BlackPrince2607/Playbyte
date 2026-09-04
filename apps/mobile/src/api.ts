import { assertMobileEnv, getApiBaseUrl } from "./lib/env";
import { getStoredGuestToken, setStoredGuestToken } from "./lib/storage";

assertMobileEnv();

const API_TIMEOUT_MS = 30_000;

let guestToken = "";
let userAccessToken = "";

type ErrorBody = { code?: string; message?: string; requestId?: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }

  get userMessage(): string {
    return friendlyMessage(this.status, this.code, this.message);
  }
}

function friendlyMessage(status: number, code: string, backendMessage: string): string {
  if (status === 401) return "Your session expired. Sign in again or continue as guest.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That content is no longer available.";
  if (status === 409) {
    if (code === "moment_closed") return "This moment is closed.";
    return backendMessage || "That action isn't available right now.";
  }
  if (status === 422) return backendMessage || "Check your input and try again.";
  if (status === 429) return "Too many requests — wait a moment and try again.";
  if (status >= 500) return "Something went wrong on our side. Try again shortly.";
  return backendMessage || `Request failed (${status}).`;
}

function parseErrorBody(data: unknown): ErrorBody {
  if (data && typeof data === "object") return data as ErrorBody;
  return {};
}

let unauthorizedHandler: (() => Promise<boolean>) | null = null;

export function setUnauthorizedHandler(handler: (() => Promise<boolean>) | null) {
  unauthorizedHandler = handler;
}

export function setUserAccessToken(value: string | null) {
  userAccessToken = value ?? "";
}

export function getGuestToken() {
  return guestToken;
}

export function setGuestToken(value: string) {
  guestToken = value;
  void setStoredGuestToken(value);
}

export async function loadToken() {
  const stored = await getStoredGuestToken();
  if (stored) guestToken = stored;
  return guestToken;
}

async function authorizationHeader(): Promise<string | undefined> {
  if (userAccessToken) return `Bearer ${userAccessToken}`;
  if (!guestToken) await ensureGuest();
  return guestToken ? `Bearer ${guestToken}` : undefined;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ApiError(0, "timeout", "Request timed out. Check your connection and try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchApi<T>(path: string, init: RequestInit, retried401: boolean): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };
  const auth = await authorizationHeader();
  if (auth) headers.Authorization = auth;

  const res = await fetchWithTimeout(`${getApiBaseUrl()}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  const body = parseErrorBody(data);

  if (res.status === 401 && !retried401 && unauthorizedHandler) {
    const recovered = await unauthorizedHandler();
    if (recovered) return fetchApi(path, init, true);
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      body.code ?? "request_failed",
      body.message ?? `HTTP ${res.status}`,
      body.requestId,
    );
  }
  return data as T;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return fetchApi(path, init, false);
}

export async function ensureGuest(): Promise<string> {
  if (userAccessToken) return guestToken;
  if (!guestToken) await loadToken();
  if (guestToken) return guestToken;
  const res = await fetchWithTimeout(`${getApiBaseUrl()}/v1/guest/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = (await res.json().catch(() => ({}))) as { token?: string; message?: string; code?: string };
  if (!res.ok || !data.token) {
    throw new ApiError(res.status, data.code ?? "guest_failed", data.message ?? `HTTP ${res.status}`);
  }
  setGuestToken(data.token);
  return data.token;
}

export type CrowdSnapshot = {
  totalResponses: number;
  optionCounts: Record<string, number>;
  joinedLastMinute?: number;
  volumeState?: string;
};

export type FeedMoment = {
  type: "moment";
  id: string;
  cardType: string;
  prompt: string;
  category: { slug: string; name: string } | null;
  status?: string;
  options: { id: string; label: string; sortOrder: number }[];
  myOptionId: string | null;
  result: CrowdSnapshot | null;
  friends?: { displayName: string; avatarKey: string | null; optionId: string }[];
};

export type FeedGame = {
  type: "mini_game";
  key: string;
  title: string;
  blurb: string;
  config?: Record<string, unknown>;
};

export type FeedItem = FeedMoment | FeedGame;

export type RespondResult = {
  responseId: string;
  optionId: string;
  created: boolean;
  promptAccountCreation: boolean;
  result: CrowdSnapshot | null;
};

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export type Friend = {
  userId: string;
  displayName: string;
  avatarKey: string | null;
  status: string;
};

export type FriendRequest = {
  id: string;
  userId: string;
  displayName: string;
  avatarKey: string | null;
};

export type MeProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarKey: string | null;
  defaultVisibility: "public" | "friends" | "private";
  ageVerified: boolean;
};

export type NotificationPreferences = {
  liveNow: boolean;
  trending: boolean;
  friendActivity: boolean;
};

export type WeeklyRecap = {
  periodStart: string;
  periodEnd: string;
  momentsJoined: number;
  gamesPlayed: number;
  majorityMatchPercent: number;
  activeDays: number;
  uniquePeopleAlongside: number;
  badges: string[];
};

export type ShareCardResponse = {
  assetUrl: string;
  deepLink: string;
};

export function shareErrorMessage(err: unknown): string {
  if (isApiError(err)) {
    if (err.status === 403) return "Answer this moment first to share your card.";
    return err.userMessage;
  }
  return err instanceof Error ? err.message : "Could not create share card.";
}

export function isShareCancelled(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code?: string }).code).toUpperCase();
    if (code.includes("CANCEL") || code.includes("DISMISS")) return true;
  }
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return m.includes("cancel") || m.includes("dismiss") || m.includes("did not share");
}

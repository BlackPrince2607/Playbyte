const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const IS_PRODUCTION = APP_ENV === "production";

export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (url) return url.replace(/\/$/, "");
  if (IS_PRODUCTION) {
    throw new Error("EXPO_PUBLIC_API_URL is required in production builds.");
  }
  return "http://localhost:8000";
}

export function validateMobileEnv(): string[] {
  const issues: string[] = [];

  if (IS_PRODUCTION) {
    if (!process.env.EXPO_PUBLIC_API_URL) {
      issues.push("EXPO_PUBLIC_API_URL is required.");
    } else if (
      process.env.EXPO_PUBLIC_API_URL.includes("localhost") ||
      process.env.EXPO_PUBLIC_API_URL.includes("127.0.0.1")
    ) {
      issues.push("EXPO_PUBLIC_API_URL must not use localhost in production.");
    }
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) {
      issues.push("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY are required in production.");
    }
  }

  const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
  if (appEnv === "staging" && process.env.EXPO_PUBLIC_API_URL?.includes("localhost")) {
    issues.push("EXPO_PUBLIC_API_URL should not use localhost in staging builds.");
  }

  for (const key of Object.keys(process.env)) {
    if (key.includes("SERVICE_ROLE")) {
      issues.push(`Remove ${key} from the mobile app — service role keys must not ship in the client.`);
    }
  }

  if (!process.env.EXPO_PUBLIC_API_URL && !IS_PRODUCTION) {
    issues.push("EXPO_PUBLIC_API_URL not set — using http://localhost:8000 for development.");
  }

  return issues;
}

export function assertMobileEnv(): void {
  const fatal = validateMobileEnv().filter(
    (m) =>
      m.includes("required") ||
      m.includes("must not") ||
      m.includes("Remove") ||
      m.includes("service role"),
  );
  if (fatal.length > 0 && IS_PRODUCTION) {
    throw new Error(fatal.join("\n"));
  }
}

export { APP_ENV, IS_PRODUCTION };

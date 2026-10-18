export type AppLang = "en" | "hi";

export function appLang(id: string): AppLang {
  return id === "hi" ? "hi" : "en";
}

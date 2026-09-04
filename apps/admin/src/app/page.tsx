"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { PlayLogo } from "@/components/PlayLogo";
import { StatusPill } from "@/components/StatusPill";
import { api, isProductionEnv } from "@/lib/api";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type MomentRow = {
  id: string;
  type: string;
  status: string;
  prompt: string;
  restrictedTopic: string;
  options: string[];
};

type WindowRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

type ReportRow = {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
};

type Category = { id: string; slug: string; name: string };

type Tab = "moments" | "windows" | "reports";

export default function CmsPage() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [devKey, setDevKey] = useState("");
  const [showDevLogin, setShowDevLogin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("moments");
  const [moments, setMoments] = useState<MomentRow[]>([]);
  const [windows, setWindows] = useState<WindowRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");

  const [prompt, setPrompt] = useState("");
  const [type, setType] = useState("predict");
  const [options, setOptions] = useState("India,Australia");
  const [restricted, setRestricted] = useState("none");
  const [categoryId, setCategoryId] = useState("");

  const [winSlug, setWinSlug] = useState("");
  const [winTitle, setWinTitle] = useState("");
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");

  const refresh = useCallback(async () => {
    const [m, w, r, cats] = await Promise.all([
      api("/v1/admin/moments"),
      api("/v1/admin/windows"),
      api("/v1/admin/reports"),
      fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/v1/categories`).then((res) =>
        res.json(),
      ),
    ]);
    setMoments(m.moments);
    setWindows(w.windows);
    setReports(r.reports);
    setCategories(cats.categories ?? []);
    if (!categoryId && cats.categories?.[0]) setCategoryId(cats.categories[0].id);
  }, [categoryId]);

  useEffect(() => {
    (async () => {
      try {
        if (isSupabaseConfigured()) {
          const sb = createSupabaseBrowserClient();
          const { data } = await sb.auth.getSession();
          if (data.session) {
            setUserEmail(data.session.user.email ?? null);
            await refresh();
            setAuthed(true);
            setChecking(false);
            return;
          }
        }
        if (!isProductionEnv()) {
          const stored = localStorage.getItem("playbyte_admin_key");
          if (stored) {
            setDevKey(stored);
            await refresh();
            setAuthed(true);
          }
        }
      } catch {
        /* not authed */
      } finally {
        setChecking(false);
      }
    })();
  }, [refresh]);

  async function supabaseLogin(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const sb = createSupabaseBrowserClient();
      const { data, error: authErr } = await sb.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      setUserEmail(data.user?.email ?? null);
      await refresh();
      setAuthed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    }
  }

  async function devLogin(e: FormEvent) {
    e.preventDefault();
    localStorage.setItem("playbyte_admin_key", devKey);
    try {
      await refresh();
      setAuthed(true);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid API key");
      localStorage.removeItem("playbyte_admin_key");
    }
  }

  async function signOut() {
    if (isSupabaseConfigured()) {
      const sb = createSupabaseBrowserClient();
      await sb.auth.signOut();
    }
    localStorage.removeItem("playbyte_admin_key");
    setAuthed(false);
    setUserEmail(null);
  }

  async function createMoment(e: FormEvent) {
    e.preventDefault();
    await api("/v1/admin/moments", {
      method: "POST",
      body: JSON.stringify({
        type,
        categoryId,
        prompt,
        options: options
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        restrictedTopic: restricted,
      }),
    });
    setPrompt("");
    await refresh();
  }

  async function createWindow(e: FormEvent) {
    e.preventDefault();
    await api("/v1/admin/windows", {
      method: "POST",
      body: JSON.stringify({
        slug: winSlug,
        title: winTitle,
        categoryId: categoryId || null,
        startsAt: new Date(winStart).toISOString(),
        endsAt: new Date(winEnd).toISOString(),
        status: "draft",
      }),
    });
    setWinSlug("");
    setWinTitle("");
    setWinStart("");
    setWinEnd("");
    await refresh();
  }

  async function go(id: string, status: string) {
    await api(`/v1/admin/moments/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    await refresh();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <PlayLogo />
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-8">
        <PlayLogo />
        <p className="text-sm text-lilac">
          Editorial console for moments, seasonal windows, and moderation. Sign in with your Supabase account
          (must be in <code className="font-mono text-paper">admin_users</code>).
        </p>

        {isSupabaseConfigured() ? (
          <form onSubmit={supabaseLogin} className="flex flex-col gap-3">
            <input
              className="rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-pink"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded-xl border border-line bg-card px-4 py-3 outline-none focus:border-pink"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="rounded-xl bg-pink py-3 font-display font-bold text-ink">Sign in</button>
          </form>
        ) : (
          <p className="rounded-xl bg-card-alt p-4 text-sm text-lilac">
            Set <code className="font-mono text-paper">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code className="font-mono text-paper">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in your env.
          </p>
        )}

        {!isProductionEnv() ? (
          <button
            type="button"
            className="text-left text-xs text-lilac underline"
            onClick={() => setShowDevLogin((v) => !v)}
          >
            {showDevLogin ? "Hide" : "Show"} developer API key login
          </button>
        ) : null}

        {!isProductionEnv() && showDevLogin ? (
          <form onSubmit={devLogin} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4">
            <input
              className="rounded-xl bg-card-alt px-4 py-3 font-mono text-sm outline-none"
              placeholder="ADMIN_API_KEY"
              value={devKey}
              onChange={(e) => setDevKey(e.target.value)}
            />
            <button className="rounded-xl border border-line py-2 text-sm text-lilac">Use API key</button>
          </form>
        ) : null}

        {error ? <p className="text-sm text-pink-soft">{error}</p> : null}
      </main>
    );
  }

  const inputCls =
    "w-full rounded-xl border border-line bg-card-alt px-3 py-2.5 text-sm outline-none focus:border-pink";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <PlayLogo size="sm" />
          <div className="flex items-center gap-4">
            {userEmail ? <span className="hidden text-sm text-lilac sm:inline">{userEmail}</span> : null}
            <button type="button" className="text-sm text-lilac hover:text-paper" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6 pb-3">
          {(["moments", "windows", "reports"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-wider ${
                tab === t ? "bg-pink text-ink" : "text-lilac hover:bg-card"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 p-6 pb-16">
        {tab === "moments" ? (
          <>
            <section className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-display text-xl font-bold">Create moment</h2>
              <p className="mt-1 text-sm text-lilac">Draft → ready → live. Restricted topics need approval.</p>
              <form onSubmit={createMoment} className="mt-4 grid gap-3 sm:grid-cols-2">
                <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="predict">Predict</option>
                  <option value="pulse">Pulse</option>
                  <option value="reaction">Reaction</option>
                </select>
                <select
                  className={inputCls}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  className={`${inputCls} sm:col-span-2`}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Prompt"
                  required
                />
                <input
                  className={`${inputCls} sm:col-span-2`}
                  value={options}
                  onChange={(e) => setOptions(e.target.value)}
                  placeholder="Options, comma-separated"
                />
                <select className={inputCls} value={restricted} onChange={(e) => setRestricted(e.target.value)}>
                  <option value="none">No restricted topic</option>
                  <option value="health">Health</option>
                  <option value="tragedy">Tragedy</option>
                  <option value="election">Election</option>
                </select>
                <button
                  type="submit"
                  className="rounded-xl bg-lime py-2.5 font-display font-bold text-ink sm:col-span-2"
                >
                  Save draft
                </button>
              </form>
            </section>

            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold">Moments ({moments.length})</h2>
              {moments.map((m) => (
                <article key={m.id} className="rounded-2xl border border-line bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={m.status} />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-lilac">{m.type}</span>
                    {m.restrictedTopic !== "none" ? (
                      <span className="font-mono text-[10px] uppercase text-pink-soft">{m.restrictedTopic}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-lg font-medium">{m.prompt}</p>
                  <p className="mt-1 text-sm text-lilac">{m.options.join(" · ")}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {m.status === "draft" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-card-alt px-3 py-1.5 text-sm"
                        onClick={() => void go(m.id, "ready")}
                      >
                        Mark ready
                      </button>
                    ) : null}
                    {m.status !== "live" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-live/20 px-3 py-1.5 text-sm text-live"
                        onClick={() => void go(m.id, "live")}
                      >
                        Go live
                      </button>
                    ) : null}
                    {m.status !== "closed" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-card-alt px-3 py-1.5 text-sm"
                        onClick={() => void go(m.id, "closed")}
                      >
                        Close
                      </button>
                    ) : null}
                    {m.restrictedTopic !== "none" ? (
                      <button
                        type="button"
                        className="rounded-lg bg-pink px-3 py-1.5 text-sm font-medium text-ink"
                        onClick={() =>
                          void api(`/v1/admin/moments/${m.id}/approvals`, {
                            method: "POST",
                            body: JSON.stringify({ decision: "approve" }),
                          }).then(refresh)
                        }
                      >
                        Record approval
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </section>
          </>
        ) : null}

        {tab === "windows" ? (
          <>
            <section className="rounded-2xl border border-line bg-card p-6">
              <h2 className="font-display text-xl font-bold">Seasonal window</h2>
              <form onSubmit={createWindow} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className={inputCls}
                  value={winSlug}
                  onChange={(e) => setWinSlug(e.target.value)}
                  placeholder="slug (e.g. ipl-2026)"
                  required
                />
                <input
                  className={inputCls}
                  value={winTitle}
                  onChange={(e) => setWinTitle(e.target.value)}
                  placeholder="Title"
                  required
                />
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={winStart}
                  onChange={(e) => setWinStart(e.target.value)}
                  required
                />
                <input
                  className={inputCls}
                  type="datetime-local"
                  value={winEnd}
                  onChange={(e) => setWinEnd(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="rounded-xl bg-lime py-2.5 font-display font-bold text-ink sm:col-span-2"
                >
                  Create window
                </button>
              </form>
            </section>
            <section className="space-y-3">
              {windows.map((w) => (
                <article key={w.id} className="rounded-2xl border border-line bg-card p-5">
                  <div className="flex items-center gap-2">
                    <StatusPill status={w.status} />
                    <span className="font-mono text-xs text-lilac">{w.slug}</span>
                  </div>
                  <p className="mt-2 font-medium">{w.title}</p>
                  <p className="mt-1 font-mono text-xs text-lilac">
                    {new Date(w.startsAt).toLocaleString()} → {new Date(w.endsAt).toLocaleString()}
                  </p>
                </article>
              ))}
              {!windows.length ? <p className="text-sm text-lilac">No seasonal windows yet.</p> : null}
            </section>
          </>
        ) : null}

        {tab === "reports" ? (
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold">Moderation queue</h2>
            {reports.map((r) => (
              <article key={r.id} className="rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} />
                  <span className="font-mono text-xs text-lilac">{r.targetType}</span>
                </div>
                <p className="mt-2 text-sm">{r.reason}</p>
                <p className="mt-1 font-mono text-[10px] text-lilac">{r.targetId}</p>
              </article>
            ))}
            {!reports.length ? <p className="text-sm text-lilac">No reports in the queue.</p> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}

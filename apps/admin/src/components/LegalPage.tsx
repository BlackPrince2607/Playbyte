import Link from "next/link";
import { MajaLogo } from "@/components/MajaLogo";
import { POLICY_UPDATED } from "@/lib/legal";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <MajaLogo size="sm" />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10 pb-16">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="mt-2 font-mono text-xs uppercase tracking-wider text-lilac">Last updated {POLICY_UPDATED}</p>
        <div className="mt-8 space-y-8 leading-relaxed text-paper/90">{children}</div>
      </main>
      <footer className="border-t border-line">
        <nav className="mx-auto flex max-w-3xl gap-6 px-6 py-6 text-sm text-lilac">
          <Link href="/privacy" className="hover:text-paper">
            Privacy Policy
          </Link>
          <Link href="/data-deletion" className="hover:text-paper">
            Delete your data
          </Link>
        </nav>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-bold text-paper">{title}</h2>
      {children}
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-pink">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

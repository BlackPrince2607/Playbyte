import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, List, Section } from "@/components/LegalPage";
import { PRIVACY_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Delete your data · MAJA",
  description: "How to delete your MAJA account data, in the app or by email.",
};

export default function DataDeletionPage() {
  return (
    <LegalPage title="Delete your MAJA data">
      <p>
        You can ask us to delete your MAJA account data at any time, either from inside the app or by email. Both
        options are free.
      </p>

      <Section title="Option 1: delete in the app">
        <ol className="list-decimal space-y-2 pl-5 marker:text-pink">
          <li>Open MAJA and make sure you are signed in to the account you want to delete.</li>
          <li>
            Tap the <strong>Vault</strong> tab.
          </li>
          <li>
            In the <strong>Privacy</strong> section, tap <strong>Delete my data</strong>.
          </li>
        </ol>
        <p>
          Confirm when asked. You are signed out and your data is then deleted automatically. Tip: tap{" "}
          <strong>Export my data</strong> first if you want a copy.
        </p>
      </Section>

      <Section title="Option 2: request deletion by email">
        <p>
          If you can&apos;t use the app, email{" "}
          <a href={`mailto:${PRIVACY_EMAIL}?subject=Delete%20my%20MAJA%20data`} className="text-pink underline">
            {PRIVACY_EMAIL}
          </a>{" "}
          with the subject &quot;Delete my MAJA data&quot;. Send it from the email address you use to sign in, and
          include your player ID if you know it. We may ask you to confirm the request, and we will complete it within
          30 days.
        </p>
      </Section>

      <Section title="What gets deleted">
        <List
          items={[
            "Your display name, bio, avatar and date of birth.",
            "Your answers to polls and quizzes, mini-game plays, scores, streaks and daily stats.",
            "Your comments, likes, shares and share card images.",
            "Your friend connections and requests.",
            "Your interests, notification preferences and push tokens.",
            "Any data export files we created for you.",
            "Your sign-in record (email address) with our authentication provider.",
          ]}
        />
        <p>
          Your MAJA account is then closed. Gameplay analytics and reports you made about
          other content may be kept in a form that no longer identifies you. Backups are overwritten on their normal
          schedule.
        </p>
      </Section>

      <Section title="Guest players">
        <p>
          If you only played as a guest, your activity is linked to a random token on your device, not to your name or
          email. Uninstalling the app removes that token. If you want guest activity deleted too, email us and
          we&apos;ll help.
        </p>
      </Section>

      <Section title="Facebook and Meta">
        <p>
          MAJA does not use Facebook Login and does not receive your Facebook profile. The app uses the Meta SDK only
          to measure ads; you can limit that as described in our{" "}
          <Link href="/privacy" className="text-pink underline">
            Privacy Policy
          </Link>
          , and manage data Meta holds about you in your Facebook settings.
        </p>
      </Section>
    </LegalPage>
  );
}

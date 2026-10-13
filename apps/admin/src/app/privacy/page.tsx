import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, List, Section } from "@/components/LegalPage";
import { LEGAL_ENTITY, PRIVACY_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy · MAJA",
  description: "How the MAJA app collects, uses, shares and deletes your information.",
};

const mail = (
  <a href={`mailto:${PRIVACY_EMAIL}`} className="text-pink underline">
    {PRIVACY_EMAIL}
  </a>
);

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        MAJA is a feed of quick polls, trivia and mini-games you can play alone or with friends. This policy explains
        what information the MAJA mobile app and its services collect, why, who it is shared with, and the choices you
        have. MAJA is operated by {LEGAL_ENTITY} (&quot;we&quot;, &quot;us&quot;).
      </p>

      <Section title="Information we collect">
        <List
          items={[
            <>
              <strong>Account details.</strong> If you create an account we receive your email address, or, if you
              sign in with Google, your Google account ID, name and email address. Passwords are handled by our
              authentication provider (Supabase) and are never visible to us. When you link a guest session to an
              account we may ask for your date of birth to confirm you meet the minimum age.
            </>,
            <>
              <strong>Profile.</strong> Your display name, bio, avatar, player ID and your default visibility setting
              (public, friends or private).
            </>,
            <>
              <strong>Activity in the app.</strong> Your answers to polls and quizzes, mini-games you play and your
              scores, streaks and daily stats, the topics you choose as interests, likes, comments, shares and share
              cards, friend requests and friendships, and reports you submit about content or other players.
            </>,
            <>
              <strong>Guest play.</strong> You can play without an account. We then create a random guest session
              token stored on your device; your activity is linked to that session, not to your name or email. If you
              later sign in, that activity moves to your account.
            </>,
            <>
              <strong>Gameplay analytics.</strong> Events such as a game starting, a round finishing, scores, timings
              and the app version, linked to your account or guest session. We use these to balance difficulty and
              improve games.
            </>,
            <>
              <strong>Device and technical data.</strong> Your IP address is used briefly to protect the service
              against abuse (for example rate limiting). Preferences such as language, sound settings and cached
              content are stored on your device. If you turn on push notifications we store a device push token and
              your notification preferences.
            </>,
            <>
              <strong>Advertising measurement (Meta SDK).</strong> The app includes the Meta (Facebook) SDK, which
              records app installs, app launches and app events, along with device information and your device
              advertising identifier, so we can measure which ads brought people to MAJA. On iOS the advertising
              identifier is only shared if you allow tracking in the App Tracking Transparency prompt.
            </>,
          ]}
        />
        <p>
          We do not collect your contacts, precise location, microphone or camera. The app only reads your clipboard
          when you tap the button to paste a friend&apos;s player ID.
        </p>
      </Section>

      <Section title="How we use information">
        <List
          items={[
            "To run MAJA: show your feed, record answers and scores, show crowd results, streaks and leaderboards.",
            "To power social features you choose to use, such as friends, comments, likes and sharing.",
            "To personalise content using the interests and language you pick.",
            "To keep MAJA safe: prevent abuse and spam, review reports and enforce our rules.",
            "To understand and improve the app, including game difficulty and performance.",
            "To measure the performance of our advertising campaigns.",
            "To send notifications you have opted in to.",
          ]}
        />
      </Section>

      <Section title="What other people can see">
        <p>
          Other players can see your display name, avatar, bio and player ID, comments you post, and, depending on
          your visibility setting, your answers and activity. You can change your default visibility at any time in
          the app under <strong>Vault → Privacy</strong>.
        </p>
      </Section>

      <Section title="Who we share information with">
        <p>We do not sell your personal information. We share it only with:</p>
        <List
          items={[
            <>
              <strong>Service providers</strong> that host and run MAJA for us: Supabase (authentication, database
              and file storage), Railway (API servers) and Vercel (website hosting).
            </>,
            <>
              <strong>Google</strong>, when you choose to sign in with Google.
            </>,
            <>
              <strong>Meta Platforms</strong>, through the Meta SDK described above, for ad measurement. Meta&apos;s
              use of this data is governed by the{" "}
              <a href="https://www.facebook.com/privacy/policy/" className="text-pink underline">
                Meta Privacy Policy
              </a>
              .
            </>,
            <>
              <strong>Apps you share to.</strong> When you share a result or invite, the content goes to the app you
              pick in your device&apos;s share sheet.
            </>,
            <>
              <strong>Legal and safety.</strong> When required by law, or to protect the rights, safety and property
              of our users, the public or us.
            </>,
          ]}
        />
      </Section>

      <Section title="Advertising choices">
        <List
          items={[
            <>
              <strong>iOS:</strong> choose &quot;Ask App Not to Track&quot; when prompted, or turn off tracking for
              MAJA in Settings → Privacy &amp; Security → Tracking.
            </>,
            <>
              <strong>Android:</strong> delete or reset your advertising ID in Settings → Privacy → Ads (the exact
              path varies by device).
            </>,
            <>
              You can also manage how Meta uses data for ads in your{" "}
              <a href="https://www.facebook.com/adpreferences/" className="text-pink underline">
                Facebook ad preferences
              </a>
              .
            </>,
          ]}
        />
      </Section>

      <Section title="How long we keep information">
        <p>
          We keep your information while your account is active. When you delete your data, we remove your profile
          details and activity as described on our{" "}
          <Link href="/data-deletion" className="text-pink underline">
            data deletion page
          </Link>
          , generally within 30 days. Limited records may be kept longer where needed for security, fraud
          prevention or legal obligations, and backups are overwritten on their normal schedule. Guest activity that
          is never linked to an account is not tied to your identity.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <List
          items={[
            "Edit your display name, bio and visibility in the app at any time.",
            <>
              Request a copy of your data in the app under <strong>Vault → Privacy → Export my data</strong>.
            </>,
            <>
              Delete your data in the app under <strong>Vault → Privacy → Delete my data</strong>, or by email (see{" "}
              <Link href="/data-deletion" className="text-pink underline">
                how to delete your data
              </Link>
              ).
            </>,
            "Turn notifications on or off in the app or in your device settings.",
          ]}
        />
        <p>
          Depending on where you live, you may have further rights to access, correct, delete or object to the use of
          your information. To exercise them, contact us at {mail}.
        </p>
      </Section>

      <Section title="Children">
        <p>
          MAJA is not intended for children under 13, and we do not knowingly collect personal information from them.
          If you believe a child under 13 has given us information, contact us at {mail} and we will delete it.
        </p>
      </Section>

      <Section title="Security and storage">
        <p>
          We use encryption in transit, access controls and other safeguards to protect your information. No method of
          storage or transmission is completely secure. Our providers may store and process information in countries
          other than yours.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy from time to time. We will change the &quot;Last updated&quot; date above and,
          for significant changes, let you know in the app.
        </p>
      </Section>

      <Section title="Contact us">
        <p>Questions or requests about your privacy: {mail}.</p>
      </Section>
    </LegalPage>
  );
}

# Google Sign-In setup (Android)

Playbyte uses **native** Google Sign-In on Android only (`@react-native-google-signin` → Supabase `signInWithIdToken`).

## 1. Google Cloud Console

1. Open [Google Auth Platform / Cloud Console](https://console.cloud.google.com/apis/credentials) for your project.
2. Configure the **OAuth consent screen** (External + Testing is fine for preview).
3. Create an OAuth client → type **Web application**
   - Save **Client ID** and **Client Secret**.
4. Create an OAuth client → type **Android**
   - Package name: `app.playbyte.mobile`
   - SHA-1: from EAS (see below).
5. You do **not** need an iOS client for Playbyte.

### Get Android SHA-1 from EAS

```bash
cd apps/mobile
eas credentials -p android
# Select the preview (or production) keystore → copy SHA-1 fingerprint
```

Add that SHA-1 to the Android OAuth client. Preview and production keystores often differ — add both if you use both profiles.

## 2. Supabase Dashboard

1. **Authentication → Providers → Google** → Enable.
2. Paste the **Web** Client ID and Client Secret.
3. If there is an “Authorized Client IDs” (or similar) field, also add the **Android** Client ID.
4. Save.

Email/password can stay enabled for Vault sign-in.

## 3. Mobile env

Put the **Web** Client ID in EAS / local env (never commit secrets beyond publishable keys):

```text
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

Also keep:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
```

Preview profile (`apps/mobile/eas.json`):

```json
"EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

Or:

```bash
cd apps/mobile
eas env:create --environment preview --name EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID --value "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com" --visibility plaintext
```

Do **not** put the Google Client **Secret** in the mobile app — only in Supabase.

## 4. Rebuild Android

Native Google Sign-In needs a new binary (not Expo Go):

```bash
cd apps/mobile
pnpm eas build --profile preview --platform android
```

## 5. Verify on device

1. Welcome → Continue with Google (or Vault → Sign in → Google).
2. Email sign-up / sign-in still works.
3. Guest answers/plays convert after auth (no wipe).
4. Sign out returns to guest session.

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| `DEVELOPER_ERROR` / sign-in fails immediately | Wrong SHA-1 or package name on Android client |
| `idToken` null | Missing/incorrect **Web** client ID in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| Supabase rejects token | Google provider disabled, or Web client ID/secret mismatch in Supabase |
| `Provider (issuer "https://accounts.google.com") is not enabled` | Supabase **Authentication → Providers → Google** is still off — enable it and paste the **Web** client ID + secret, then retry (no rebuild needed) |
| Audience / id_token / JWT verify errors | Supabase Google provider must use the same **Web** client ID (+ secret) as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in the APK; also add Android client ID under Authorized Client IDs if shown |
| Signed in (email shows) but Vault says session expired / feed won't load | Backend must verify **asymmetric** Supabase JWTs via JWKS (`SUPABASE_URL` → `/.well-known/jwks.json`). Legacy `SUPABASE_JWT_SECRET` (HS256) alone fails once the project uses signing keys. Redeploy the API after this fix; APK rebuild optional for recovery UX |
| App stuck on PLAY loading spinner | Fixed in auth init (async `onAuthStateChange` deadlock + session restore timeouts). **Must install a new APK.** If still stuck: force-stop → clear app storage → reopen, or tap Retry after 8s |
| Google sign-in spins then crashes | Often corrupt prior Google/Supabase session or SHA-1 mismatch. New build clears prior Google session before sign-in and times out `signInWithIdToken`. Confirm Android OAuth client SHA-1 matches EAS keystore |
| Button hidden in app | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` or Supabase URL/key missing in that build |

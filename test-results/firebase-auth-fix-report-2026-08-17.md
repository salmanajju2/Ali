# Firebase Login Fix — Ali Enterprises

**Repository:** `salmanajju2/Ali`  
**Architecture:** Firebase Authentication for email/password identity; Aiven PostgreSQL for users’ application profiles, transactions, inventory and sync data.

## Root cause

The previous release had replaced Firebase email/password login with a custom PostgreSQL password/session login. Existing users were present in Firebase, so their credentials were rejected by the custom backend and the UI displayed “Invalid email or password.”

## Fix implemented

The frontend now uses Firebase `signInWithEmailAndPassword`, Firebase registration and Firebase sign-out. It refreshes the Firebase ID token and sends it as a bearer token to the Aiven-backed API and Socket.IO connection. The backend uses Firebase Admin to verify the ID token, then creates or links the Aiven `app_users` profile by email and stores the Firebase UID mapping. Transaction records remain exclusively in Aiven PostgreSQL.

REST transaction, cash inventory and receipt proxy routes, plus Socket.IO, remain server-protected. The server-side `ADMIN_EMAILS` allowlist controls new application admin roles; client-side role data is not a security control. Live regression scripts now require `TEST_FIREBASE_ID_TOKEN` for authenticated production checks and skip explicitly when no disposable test token is supplied.

## Verification

| Check | Result |
|---|---:|
| TypeScript check | Pass |
| Server JavaScript syntax | Pass |
| Unit tests | Pass — 9/9 |
| Regression suite | Pass; live authenticated checks skipped without `TEST_FIREBASE_ID_TOKEN` |
| Production Vite build | Pass |
| Capacitor sync | Pass |
| Android debug APK build | Pass |

## Required Render variables

Configure either `FIREBASE_SERVICE_ACCOUNT_JSON` or all three `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY` on the backend. Keep `DATABASE_URL`, `ALLOWED_ORIGINS`, `ADMIN_EMAILS` and server-side integration credentials configured as before. Do not expose Firebase Admin credentials in frontend `VITE_` variables.

After the new backend is deployed, existing Firebase users should log in with their existing Firebase email/password. On first successful login, their Aiven application profile is linked automatically by email. If Firebase Email/Password provider is disabled in the Firebase Console, enable it before testing.

## APK

The rebuilt debug APK is `android/app/build/outputs/apk/debug/app-debug.apk` with package `com.ali.enterprises`, version `1.2`, version code `3`, and SHA-256:

```text
17dea5eed3edd1247f22f55bdc60384ea42e9b65df0c356aada08755d4eb2909
```

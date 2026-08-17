# Ali Enterprises — Post-Fix Build and Verification Report

**Repository:** `salmanajju2/Ali`  
**Pushed commit:** `ccd48c0b`  
**APK:** `com.ali.enterprises`, version `1.2`, version code `3`  
**APK type:** Debug APK, compiled with Android SDK 35, minimum SDK 23  
**APK SHA-256:** `16faa349d4722f603afd4f9d6394642d76e5e235960501b4f0f32c4ea16cc430`

## Work completed

The frontend has been moved from Firebase-only authentication to the backend session API. Login, session restoration and logout now use `/api/auth/*`; the bearer token is persisted locally and attached to database, receipt-proxy and Socket.IO requests. The frontend email-based admin fallback was removed, so the server-issued `isAdmin` role is the only client role signal.

The backend now hashes session tokens before storing or comparing them, requires authentication for transactions, cash inventory, Telegram/Discord proxies and Socket.IO handshakes, and uses a server-side `ADMIN_EMAILS` allowlist for new admin accounts. Duplicate registration returns a controlled conflict response. CORS is restricted to configured origins instead of accepting every origin.

Telegram and Discord credentials were removed from frontend request parameters. Proxy operations now use server-side environment variables, validate file IDs and message IDs, restrict upstream file hosts, limit upload/file sizes, validate MIME types, sanitize filenames and expose an authenticated Telegram delete route. The slip viewer now uses the shared API origin and sends the session token.

The root lockfile was regenerated and Docker installs now use `npm ci`; the README and `.env.example` were added with setup, security, deployment and APK instructions. The changes were committed and pushed to `main`.

## Validation results

| Check | Result |
|---|---:|
| Clean root `npm ci --ignore-scripts` | Pass |
| `npm run type-check` | Pass |
| `npm test` | Pass — 9/9 tests |
| `npm run test:regression` | Pass — offline queue, conflict, pagination and lazy-loading checks passed |
| `node --check server/index.js` | Pass |
| `npm run build` | Pass |
| `npx cap sync android` | Pass |
| Gradle `assembleDebug` | Pass |
| APK package metadata inspection | Pass |

The production web build still reports known non-fatal warnings: the PDF worker and initial JavaScript bundle are large, and Capacitor/browser compatibility data is stale. These warnings do not prevent the APK from building.

## APK delivery

The generated APK is the debug artifact at `android/app/build/outputs/apk/debug/app-debug.apk`. It was built successfully with JDK 17, Android SDK platform 35 and Gradle. The APK has package name `com.ali.enterprises`, target SDK 35 and minimum SDK 23.

## Important deployment step

The source changes are pushed to GitHub, but the backend deployment must use the new server code and define the following secrets/configuration before the fixed authentication flow works in production:

```text
DATABASE_URL
ALLOWED_ORIGINS
ADMIN_EMAILS
TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
PHOTO_BOT_TOKEN / PHOTO_CHAT_ID
DISCORD_WEBHOOK_URL
```

The server must be redeployed after the GitHub push. Existing users retain their database `is_admin` value; new accounts receive admin status only when their email is present in the server-side `ADMIN_EMAILS` list. Existing pre-fix plaintext session rows, if any, will not be accepted after the token-hashing change and users must sign in again.

## Remaining recommendations

The non-force dependency remediation reduced the audit result but did not remove every advisory. The remaining issues include high-severity `pdfjs-dist` and `sharp` advisories, a moderate React Router advisory, and a critical `tar` advisory in the Capacitor tooling chain. These should be upgraded in a dedicated dependency-maintenance change and revalidated because some available upgrades are major-version changes.

Authenticated CRUD tests against a disposable PostgreSQL database, real login/logout flow, role-isolation tests, receipt upload tests, Android device testing, and a post-deployment anonymous-access check should be run after the server redeploy. Destructive tests were not run against live financial records.

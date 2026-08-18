# Firebase Android Configuration and APK Build Report

The newly supplied Firebase configuration was validated before use.

| Check | Result |
|---|---|
| Firebase project | `ali-enterprises-21c89` |
| Android package | `com.ali.enterprises` |
| Ali app application ID | `com.ali.enterprises` |
| Android configuration location | `android/app/google-services.json` |
| TypeScript check | Pass |
| Backend syntax check | Pass |
| Production web build | Pass |
| Capacitor sync | Pass |
| Android debug APK | Pass |

The JSON file matches the Ali app and was used locally for the Android build. It is excluded from Git commits through `.gitignore`; the Firebase web configuration remains in the frontend, while Firebase Admin credentials must remain in Render environment variables. Aiven PostgreSQL continues to store transactions, inventory and application data.

The rebuilt APK is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Its SHA-256 checksum is:

```text
80e5c2d1eed79cd1e0da6f8212dd93dd859b25f7971abbb347db3b5e3cfcba1b
```

This is a debug APK. Before login testing, ensure Firebase Authentication → Sign-in method → Email/Password is enabled in project `ali-enterprises-21c89`, and ensure the user account exists in that same project. The backend deployment must also have valid Firebase Admin credentials and the existing Aiven `DATABASE_URL` configured.

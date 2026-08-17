# Ali Enterprises — Regression Test & APK Report

**Test date:** 17 August 2026  
**Scope:** Ali Enterprises web app, live Render/Aiven read paths, Socket.IO connectivity, durable change cursor, bulk-delete safety path, TypeScript/build validation, and APK artifact integrity.  
**GitHub status:** **No commit and no push were performed.**

## Executive result

The checked live backend is reachable and reported an active Aiven PostgreSQL connection. The non-destructive API checks, durable change-cursor audit, Socket.IO diagnostic acknowledgement, TypeScript compilation, production web build, and APK archive check all passed. No confirmed runtime defect was found in the tested bulk-delete persistence path, so the transaction-sync implementation was not changed unnecessarily.

The confirmed improvement is **testability**: standard commands now exist for local regression (`npm test`) and production-safe live regression (`npm run test:live:readonly`). These commands make the same checks repeatable before any future APK build or GitHub push.

> The production test deliberately did **not** create, update, or delete a real financial transaction. A valid live bulk-delete test would change business data, so it must be run only on a user-approved test transaction or from an authenticated phone session.

## Results

| Area | Verification performed | Result | Evidence |
|---|---|---|---|
| Live server and Aiven PostgreSQL | `GET /api/health` | **Passed** | Returned HTTP 200 with `{"ok":true,"database":"connected"}`. |
| Bounded startup fetch | `GET /api/transactions/recent?limit=1` | **Passed** | Returned one transaction at most, confirming the route accepts the configured limit. |
| Durable change replay | Full traversal of `/api/transactions/changes?after=…&limit=1000` | **Passed** | Audited 127 change rows; all actions were valid and cursors advanced monotonically. 59 delete records were present. |
| Deleted-row recovery handling | Cursor audit of `transaction: null` rows | **Passed with expected behavior** | 123 older add/update rows had no current transaction because their transaction was later deleted. The later delete event remains in the same ordered cursor stream, so reconciliation reaches the final deleted state. |
| Bulk-delete API safety | `DELETE /api/transactions/0` | **Passed** | Returned HTTP 400. Invalid IDs are rejected before any database mutation. |
| WebSocket connectivity | Socket.IO `sync-status` acknowledgement and `sync-status-check` diagnostic | **Passed** | Connected using the **WebSocket** transport; both acknowledgements returned `ok: true`. No transaction event was sent. |
| Pagination/filter unit tests | `npm test` | **Passed** | 4/4 tests passed for bounded pagination, exact payment filtering, parameterized filters, and safe invalid input fallback. |
| Static code validation | `npm run type-check` | **Passed** | TypeScript completed with no errors. |
| Production web compilation | `npm run build` | **Passed with non-blocking warnings** | Vite built successfully. It reported an outdated browser-data notice and a JavaScript chunk over 500 kB; neither blocked the build. |
| Android APK artifact | ZIP integrity, checksum, file-size check | **Passed** | `app-debug.apk` is 9,850,946 bytes; ZIP validation passed; SHA-256 is `b0b91a7ae4e53dc5670843a4c656070741ca7c8e8a093c51c3770e8be7d9a958`. |

## Bulk-delete and synchronization assessment

The client keeps a pending-deletion ID set in local storage, immediately hides those rows from the user interface, and replays queued deletion requests after reconnection. The client treats HTTP 404 as a successful final state for a queued delete, which makes a retry safe when a prior delete actually reached PostgreSQL but its response was lost. The backend broadcasts a delete only after PostgreSQL confirms the deletion, while the durable change log provides recovery for a web tab or APK that was closed during the event. The live cursor audit confirmed that delete events are being retained for recovery.

The live production app itself reached the login page normally. An authenticated cross-device write/delete test was not executed in this environment because it would require a real authorized account and would modify financial records. Therefore, the final user-device check should use one clearly marked test transaction: create it on the web, verify it appears in the APK; delete it in the APK, then verify it disappears from the web after reconnection or manual refresh.

## Change made

The application had unit checks but no standard test commands. `package.json` now includes the following repeatable scripts.

| Command | Purpose | Database safety |
|---|---|---|
| `npm test` | Runs the local pagination and filter regression suite. | Does not contact the live database. |
| `npm run test:live:readonly` | Checks Aiven health, bounded reads, durable change-log structure, invalid-delete validation, and Socket.IO diagnostic acknowledgement. | Does not create, edit, or delete any transaction. |

Three diagnostic scripts were added under `server/`: `live-api-readonly-test.mjs`, `live-change-cursor-audit.mjs`, and `live-socket-diagnostic.mjs`. They are safe to rerun before an APK release.

## APK installation

Use this debug APK for manual testing:

`/home/ubuntu/Ali-push/android/app/build/outputs/apk/debug/app-debug.apk`

Install it after uninstalling any older debug build with a conflicting signature. This is a **debug APK**, not a Play Store release APK.

## Remaining manual verification

The code and live service passed the checks above, but the following two actions require an authenticated user and a designated test transaction. They should be performed after the APK is installed.

| Step | Expected result |
|---|---|
| Create a marked test transaction on the website while the APK is open. | The APK receives the server-confirmed transaction through Socket.IO or its reconciliation refresh. |
| Delete that same marked test transaction from the APK, then refresh/reopen the website. | It does not reappear; the web reflects the PostgreSQL-confirmed deletion. |
| Turn off internet, delete a marked test transaction in the APK, then restore internet. | The row stays hidden locally, is replayed to PostgreSQL, and then remains absent on the web. |

## References

[1]: https://ali-ltyt.onrender.com "Ali Enterprises live Render deployment"

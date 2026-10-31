# WebToMobile Plan: Retiradas Android

Plan Status: Approved - implementation authorized on 2026-10-31

## Capabilities & Limits

Full source tier: local monorepo available. This release produces an installable Android APK/AAB backed by the existing PWA through a Trusted Web Activity (TWA). It does not rewrite the interface in React Native and therefore requires network access for uncached application flows.

## Source

- Target: `apps/retiradas/frontend` and `https://retiradas.tech/app`
- Audited branch: `master`
- Web stack: React 19, Vite 8, React Router, service worker, Web Push and HTTPS REST API.
- Existing unrelated untracked deployment packages and local secrets must remain untouched.

## Audit Findings

- [from-code] `public/manifest.webmanifest` already defines standalone display, portrait orientation, `/app?source=pwa`, theme colors and 192/512 icons.
- [from-code] `public/sw.js` implements application-shell caching, navigation fallback, Web Push and service-worker telemetry.
- [from-code] The application already uses browser geolocation, camera/file uploads, notifications, PDF downloads and external Google Maps/Waze/WhatsApp links.
- [from-code] Authentication and API calls are same-origin. Keeping the TWA on `retiradas.tech` avoids a new CORS and cookie migration in this release.
- [inferred] The corporate domain will require a later signed app update and a new Digital Asset Links file when it becomes externally reachable.

## Migration Fit Verdict

Recommended path: **PWA/TWA with Bubblewrap**.

The immediate requirement is an Android APK without rebuilding a large operational application. TWA preserves same-origin sessions, browser capabilities and instant web releases. Expo React Native is deferred because it would require a broad UI/navigation/browser-API rewrite without improving the first-release business outcome.

## Route To Mobile Navigation Map

| Web Route | Mobile Destination | Navigator Pattern | Reason | Confidence |
| --- | --- | --- | --- | --- |
| `/login` | Login | Existing protected web flow | Preserve authentication and MFA | [from-code] |
| `/app` and `/dashboard` | Initial authenticated screen | Existing React Router | Existing PWA start flow | [from-code] |
| `/tentativas` | Tentativas | Existing application navigation | Camera, WhatsApp and operational workflow | [from-code] |
| `/maps` | Maps | Existing application navigation | Geolocation and route workflows | [from-code] |
| Other authorized routes | Existing responsive pages | Existing sidebar/mobile navigation | Preserve complete RBAC surface | [from-code] |

## Target Mobile Architecture

- Android package: `br.com.brasiltecpar.retiradas`
- Application name: `Retiradas`
- Runtime: Chrome Trusted Web Activity.
- Production origin: `https://retiradas.tech`.
- Signing: persistent private Android keystore outside Git.
- Domain verification: `/.well-known/assetlinks.json` with the release certificate SHA-256 fingerprint.
- Distribution artifacts: signed release APK and AAB.

## API Needs

The application runtime keeps using the existing same-origin `/api/*` endpoints. A small administrative distribution API was added under `/api/maintenance/app` to publish the signed APK, expose a stable download URL and retain aggregate download/application-presence metrics. The later move to `retiradas.sempre.net.br` requires the new domain to be publicly reachable (or the device connected to VPN), a new `assetlinks.json`, and an app update signed with the same key.

## Reusable Code

- Entire deployed React/Vite UI and routing.
- Existing authentication, RBAC, API client and session handling.
- Existing PWA manifest, service worker, Web Push, geolocation and uploads.
- Existing responsive layouts and production CI/CD.

## Rewrite-Required Code

None for the first TWA release. A future Expo app would rewrite DOM components, CSS, React Router, browser storage, Leaflet/MapLibre integration and service-worker push.

## Native Feature Gaps

| Web Signal | Mobile Need | Suggested API | Status |
| --- | --- | --- | --- |
| Web Push | Android notifications | Existing Web Push in TWA | Validate on device |
| Geolocation | Technician location | Browser geolocation in TWA | Validate permission flow |
| Camera/file inputs | Evidence photos | Android file/camera chooser through Chrome | Validate on device |
| PDF/download links | Local receipt downloads | Chrome download handling | Validate on device |
| External navigation links | Google Maps, Waze, WhatsApp | Android intent resolution | Validate on device |

## Unknowns And Blockers

- Human installation test on at least one Android device is required.
- Google Play publication requires a developer account; APK generation does not.
- The signing keystore and password must be backed up securely. Losing the key prevents future manual APK updates.

## Implementation Checklist

- [x] Harden manifest identity/icons for TWA - `apps/retiradas/frontend/public/manifest.webmanifest` - install metadata validates - manifest fetch and JSON checks - [from-code]
- [x] Create permanent Android signing identity outside Git - local secure storage - SHA-256 fingerprint available without exposing private data - `keytool -list` - [inferred]
- [x] Publish Digital Asset Links - certificate fingerprint -> `apps/retiradas/frontend/public/.well-known/assetlinks.json` - HTTPS returns JSON 200 - curl validation - [from-code]
- [x] Generate Bubblewrap Android project - manifest -> `apps/retiradas/android-twa` - Gradle project uses fixed package ID - Bubblewrap validation - [inferred]
- [x] Build signed APK and AAB - Android project -> release artifacts - signatures verify - `apksigner verify` and bundle build - [inferred]
- [x] Run Retiradas verification and CI/CD deployment - source -> production - tests/build green and asset links live - `npm run verify:retiradas` plus GitHub Actions - [from-code]
- [ ] Validate production package on device - APK -> Android phone - login, session, push, location, camera, Maps, downloads and external links work - Test Plan T1-T8 - [assumption]

## Test Plan

- T1: Install the signed APK without Android package/signature warnings.
- T2: Open directly in standalone mode and reach the Retiradas login.
- T3: Authenticate and keep the session across close/reopen.
- T4: Grant notifications and receive a real push.
- T5: Grant location and update the technician position in Maps.
- T6: Capture and upload an evidence photo.
- T7: Download/open a return receipt PDF.
- T8: Open Google Maps, Waze and WhatsApp intents.

## Acceptance Criteria

- Signed APK and AAB exist and verify with package `br.com.brasiltecpar.retiradas`.
- `retiradas.tech/.well-known/assetlinks.json` trusts the signing certificate.
- The TWA opens without browser chrome after domain verification.
- Existing web CI and production behavior remain green.
- The same key can sign the future corporate-domain update.

## Human Sign-Off Required

- Confirm icon/splash appearance and Android navigation ergonomics.
- Confirm push, location, camera, downloads and external intents on a physical device.
- Approve distribution channel: direct internal APK, MDM, or Google Play.

## Approval

Approved by the user on 2026-10-31 with the explicit instruction: "Entao ja vamos lancar agora. Faca isso por favor." Scope: generate and launch the Android APK now on `retiradas.tech`, preserving the same application identity and signing key for the later migration to `retiradas.sempre.net.br`.

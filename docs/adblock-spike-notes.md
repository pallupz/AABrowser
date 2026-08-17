# Adblock / SponsorBlock spike - working notes

Working doc for the `feat/youtube-adblock` branch. Purpose: give a fresh session (or a future me) full context after the in-car test round. Last updated: 2026-08-17.

## Status

- Branch `feat/youtube-adblock` on `pallupz/AABrowser` (fork of `kododake/AABrowser`), 4 commits ahead of main plus this doc.
- Verified on Pixel 7 Pro API 36 emulator (including real adb-injected taps) and on the physical Samsung phone.
- **Pending: in-car head-unit test.** See checklist at the bottom.

## What was built

| Piece | File | Mechanism |
|---|---|---|
| App identity | `app/build.gradle.kts` | `applicationId` renamed to `com.pallupz.aabrowser` so the fork installs alongside upstream. Kotlin `namespace` stays `com.kododake.aabrowser` (minimal churn; manifest uses relative activity names, no authorities). |
| YouTube adblock | `app/src/main/assets/youtube_adblock.js` | Strips `adPlacements` / `adSlots` / `playerAds` / `adBreakHeartbeatParams` from player data at three interception points: a `JSON.parse` hook, a `Response.prototype.json` hook, and a property trap on `window.ytInitialPlayerResponse`. Plus cosmetic CSS for feed/banner ad renderers and a 500ms watchdog that clicks skip buttons and fast-forwards any ad that still plays (mutes during, unmutes after). |
| SponsorBlock | `app/src/main/assets/sponsorblock.js` | Fetches segments from `https://sponsor.ajay.app/api/skipSegments` per video ID (all 8 skippable categories), then shows a manual skip button while playback is inside a segment. No auto-skip by design. Tap jumps to segment end. |
| Injector | `app/src/main/java/com/kododake/aabrowser/web/YouTubeAdBlocker.kt` | Loads both assets and installs them via `WebViewCompat.addDocumentStartJavaScript`, gated on `WebViewFeature.DOCUMENT_START_SCRIPT`, restricted to YouTube origins. Called once per WebView from `configureWebView` in `ConfiguredWebView.kt`. |
| Debug aid | `ConfiguredWebView.kt` | `setWebContentsDebuggingEnabled(BuildConfig.DEBUG)` (was hardcoded false). Release behavior unchanged. |

### Key design decisions and why

- **Document-start injection, not `onPageFinished`**: YouTube's own scripts must not run first, or the JSON hooks miss the initial player payload. `addDocumentStartJavaScript` guarantees pre-page execution and scopes to YouTube origins only (no `JSON.parse` wrapping on other sites). minSdk 35 means the WebView feature is always present in practice.
- **No network-layer YouTube blocking**: ad video segments come from the same `googlevideo.com` CDN as content, decided server-side. Only script-layer stripping works. (Generic EasyList/hosts blocking via `shouldInterceptRequest` was assessed as easy and worthwhile but is NOT implemented in this spike.)
- **SponsorBlock fetch runs in page context**: verified live that neither CORS (`access-control-allow-origin: *`) nor YouTube's CSP blocks `fetch()` to `sponsor.ajay.app` from inside m.youtube.com. No native-side bridge needed.
- **Manual skip button, not auto-skip**: product decision by Antony.

### Hard-won fix: the tap problem (commit d0ddce3)

Symptom: on a real device, tapping the skip button toggled YouTube's control overlay instead. Synthetic `.click()` in tests worked fine, which masked it.

Two root causes, both needed fixing:

1. **Stacking**: mobile YouTube's `#movie_player` has a CSS transform, making it a stacking context at z-index 0. The touch overlay lives in a sibling `ytmWatchPlayerControlsHost` that always renders above it. Any element inside the player can NEVER be on top, regardless of z-index. Fix: mount the button inside `ytmWatchPlayerControlsHost` (fall back to the player if absent; re-mount into `document.fullscreenElement` when fullscreen).
2. **Events**: YouTube reacts to raw touch events. Fix: capture-phase `touchstart`/`touchend`/`click` listeners on `window`, registered at document start so they run before YouTube's listeners; when the target is our button, skip and `stopImmediatePropagation` + `preventDefault`, so the overlay never sees the tap.

Lesson: always verify taps with `adb shell input tap` (real input path), not JS `.click()`.

## Verification methodology (reusable recipe)

1. Build: `sh gradlew assembleDebug` (gradlew isn't executable; needs `local.properties` with `sdk.dir`, gitignored but present locally). APK lands in `app/build/renamedApks/debug/`.
2. Install to emulator, open a video: `adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d "https://m.youtube.com/watch?v=..." com.pallupz.aabrowser`.
3. Attach DevTools (debug builds only): `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`, list pages via `http://localhost:9222/json`, evaluate JS over the websocket (python `websocket-client`, must pass `suppress_origin=True` or Chrome rejects with 403).
4. Debug handles: `window.__aabYtAdblockInstalled`, `window.__aabSB` (`{videoId, segments, active, button}`).
5. Real taps: screen coords = 144px status-bar offset + CSS px x 3.5 (Pixel 7 Pro AVD, 1440px wide, dpr 3.5). Check `window.__aabSB` state before/after.
6. Test video: `Pd0N60YRjxc` has intro (0-135.3s), selfpromo (741-762), preview, outro. Find more segment-bearing IDs via `https://sponsor.ajay.app/api/skipSegments/<any-4-hex>` (hash-prefix endpoint returns real videoIDs).

### Emulator gotchas that burned time

- **Screen off / background tab freezes JS timers.** The watchdog stops; looks like a bug but is normal Android WebView lifecycle. Wake the screen and foreground the tab.
- **Two tabs after app relaunch** (tab restore + VIEW intent): DevTools page listing shows both; match on `watch?v=` and verify `location.href` before trusting a tab's state. One transient readout showed stale/odd segment data from a tab mid-restore; the scriptlet's own guard (discard fetch results if videoId changed) makes this harmless in-app.
- `adb install` on the Samsung installs into ALL profiles (Island, DUAL_APP, Secure Folder host), producing duplicate launcher icons. Use `adb install --user 0`. Removal: `pm uninstall --user <id> com.pallupz.aabrowser`.

## Android Auto landscape findings (researched 2026-08-17)

- **No Android 16 OS restriction blocks this app.** The relevant gates are elsewhere.
- **Since Android 14, plain projection-hack sideloaded apps do NOT appear on the car screen** (Fermata maintainer, primary source: Fermata discussion #432). Fermata-style apps need root or a MITM adapter (AAWireless, aa-proxy-rs). AABrowser survives because it's a Car App Library **navigation-category template app** (`androidx.car.app`, `CAR_LAUNCHER`/`APP_MAPS` intent categories, `distractionOptimized`), enabled via AA Developer settings > Unknown sources. Different validation path.
- **Fermata history** (cautionary tale): its Play listing was removed in early 2025 and every installed copy stopped appearing in AA, since AA validated against Play. Project alive on GitHub (2.0.1, June 2026) using the unknown-sources path. Google can and does squeeze video-capable AA apps at its discretion; that risk applies here too.
- **Developer verification**: user-facing enforcement starts 2026-09-30 in BR/ID/SG/TH, global through 2027. Installing an unverified-developer APK (like this personally-signed fork) will then need the "advanced sideloading flow" or `adb install`, or registering for the free limited-distribution developer tier. Affects phone install only, not AA visibility.
- Watch out for fake SEO sites (aabrowser.net, fermata-auto.com etc.); official sources are the GitHub repos only.

## Suspicions / open questions

- **Real ad delivery is unverified.** The emulator never got served an actual video ad (fresh profile, no account). The JSON-scrub approach is the standard one and the hooks are confirmed active, but "does a real mid-roll get stripped" is only provable with real-world usage. The watchdog is the fallback if stripping misses.
- **Desktop-mode YouTube untested.** The tap fix targets mobile DOM (`ytmWatchPlayerControlsHost`). Desktop layout (`.html5-video-player` mount fallback) should work for clicks but is untested for touch. Relevant because the app has Smart Desktop Mode.
- **YouTube churn**: class names (`ytmWatchPlayerControlsHost`, `.html5-video-player`, skip-button classes) and the ad JSON keys change periodically. Expect maintenance. The adblock and SponsorBlock scripts fail silent and never break playback (everything wrapped in try/catch).
- **Fullscreen on the head unit**: the app uses `onShowCustomView` (native fullscreen custom view). If m.youtube triggers element-fullscreen instead, the button re-mounts into the fullscreen element; if the native path detaches the video into a custom view, the button may not be visible in fullscreen. Untested.
- **No settings toggle yet**: both scripts are always-on for YouTube. A `BrowserPreferences` toggle (pattern: see existing prefs + `SettingsViews.kt`) is the obvious next step if this graduates from spike.
- **Generic (non-YouTube) adblock not implemented**: assessed as Tier 1 = hosts-list blocking in `shouldInterceptRequest` + `ServiceWorkerControllerCompat`; small effort, nearly maintenance-free. Do this next if the YouTube layer proves out.
- **SponsorBlock privacy option**: current fetch sends the videoID directly; the API also supports k-anonymous hash-prefix lookup (`/api/skipSegments/<sha256-prefix>`) if that ever matters.

## Ways of working (for continuity)

- Commits: conventional commit style, no co-author trailers. Push with the **personal `pallupz` gh account**: `gh auth switch --user pallupz`, push, then `gh auth switch --user pallupz-mnu` (work account stays default).
- Remotes: `origin` = pallupz/AABrowser, `upstream` = kododake/AABrowser.
- Upstream is receptive: README lists "No Ad Blocking (contributions welcome!)"; issue #120 requests an adblocker. A cleaned-up PR upstream (minus the app-id rename) is plausible if Antony wants.
- JDK: only Temurin 17 installed; Gradle toolchain (foojay resolver in settings.gradle.kts) handles the Java 21 target automatically.

## In-car test checklist

- [ ] App appears in AA launcher (Developer settings > Unknown sources on, AA cache sometimes needs a phone reboot / AA force-stop)
- [ ] YouTube: does a real pre-roll/mid-roll ad appear? If yes: does the watchdog skip/fast-forward it?
- [ ] SponsorBlock button: visible at head-unit scale? Comfortably tappable while parked?
- [ ] Tap actually skips (vs toggling controls) on the head unit's touch input
- [ ] Fullscreen video: is the button visible/usable in fullscreen?
- [ ] Desktop mode (if used in car): does the button appear and work?
- [ ] Parked-state gating: any "not available while driving" interference with the overlay?

# Changelog

## [v1.0.1.1.111.111.1] - 2026-06-16

### Fixed

- Card disappearing on launch — rewrote init flow using self-healing `observeElement` pattern
- Card disappearing when opening/closing queue — observer auto-detects anchor removal and re-insertion
- Card disappearing on NPV view switches (recently played, On Repeat, etc.)

### Improved

- Replaced complex multi-maid orchestration with single `MutationObserver` on `document.body` — inspired by Lucid Lyrics ; Thanks hehe <3
- Removed unused `Maid`, `Defer`, `Scheduler` (that complex multi-maid orchestration) imports from main entry point 

---

## [v1.0.1.1.111.11.1] - 2026-06-14

### Added

- Songwriter credits — displayed below lyrics when available from Spicy Lyrics API
- Skeleton shimmer loading animation — dynamic bars with gradient fade, matches lyrics font size

### Improved

- Skeleton bars use `rem` units to scale with lyrics font size
- Skeleton gradient fades top and bottom to blend smoothly into the card

---

## [v1.0.1.1.111.111] - 2026-06-13

### Added

- Development mode badge — small toast notification appears on startup when running `npm run dev`, auto-closes after 3 seconds

### Fixed

- Scrollbar track now hidden by default, only visible on card hover
- Scrollbar thumb only visible on card hover — no more showing during auto-scroll
- Scrollbar compatibility with Spicy Lyrics extension — scoped all scrollbar rules under `#SpicyCard-CardView` to win CSS specificity battle against Spicy Lyrics global overrides
- Last lyrics line getting chopped by bottom mask gradient — added scroll padding so content sits above the fade zone
- Card content overflowing past bottom edge — added `overflow: hidden`
- Horizontal scrollbar track hidden
- Scrollbar thumb given `min-height: 80px` for better usability on short lyrics
- NPV Ambience compatibility — boosted z-index on card and scrollbar to render above dynamic background overlays

### Improved

- Scrollbar track background fades in/out smoothly on hover instead of instantly appearing

---

## [v1.0.1.1.111.1] - 2026-05-09

### Fixed

- Lyrics text getting chopped/cut off during scale animations — added proper padding and margin compensation to prevent clipping

### Improved

- Code cleanup: removed unused `Maid` import and `PlaybarDetailsHidden` field from Store type
- Removed debug console.log from `adaptLyrics.ts` that was firing on every song change

---

## [v1.0.1.1.111] - 2026-05-09

### Added

- Romanization support for Japanese, Korean, and Chinese — yes, actually working this time. Kuroshiro, aromanize, and pinyin loaded in the background so the toggle is ready before you even think about pressing it.
- Romanization toggle in the expanded lyrics header — only appears when the song actually has CJK lyrics, because why show it otherwise.
- Lyrics always start in original mode on track change. No more being stuck reading romanized Mandarin you didn't ask for.

### Fixed

- Lyrics not showing on first load — `songchange` was firing too early and `waitForSpicetify` was lying about being ready. Both fixed.
- Pinyin clipping the text because romanized characters are longer than CJK. Font scales down automatically now.
- Romanization state resetting on track change — it does now, intentionally.

### Credits

- Romanization powered by Spicy Lyrics CDN (pkgs.spikerko.org) — Kuroshiro + Kuromoji for Japanese, aromanize for Korean, pinyin for Chinese; all running client-side before you even touch the toggle.

---

## [v1.0.1.1.1] - 2026-05-05

### Fixed

- Card no longer silently disappears when a track has no lyrics — now shows a "No lyrics available" message in the sidebar instead

---

## [v1.0.1.1] - 2026-05-04

### Changed

- Switched lyrics font to `SpicyLyrics` (loaded from `fonts.spikerko.org`) for a consistent look with Spicy Lyrics

### Fixed

- "Show lyrics" button rendering with a white background due to Spotify's global button CSS overrides
- Close (×) button rendering as a broken image box instead of the SVG icon
- Button styles now applied via inline `setProperty` with `!important` to reliably override Spotify's stylesheet

### Internal

- Added proper attribution in `README.md` for Beautiful Lyrics (SoCalifornian) and Spicy Lyrics (Spikerko, AGPL-3.0)

---

## [v1.0.1] - Initial release

- Synced lyrics card view in the Spotify right sidebar
- Line-by-line lyrics support
- Static lyrics fallback
- ~~Romanization support for Japanese, Korean, and Chinese~~ ~~(not working)~~
- Powered by the Spicy Lyrics API


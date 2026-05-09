# Changelog

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
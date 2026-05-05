# Changelog


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
- Line-by-line  lyrics support
- Static lyrics fallback
- ~~Romanization support for Japanese, Korean, and Chinese~~ (not working)
- Powered by the Spicy Lyrics API


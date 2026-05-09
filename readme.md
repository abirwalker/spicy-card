# Spicy Card

A Spicetify extension that brings a synced lyrics card view right into Spotify's sidebar. It hooks into the [Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) API by Spikerko and inspired from [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics) by SoCalifornian.

## Preview

![Spicy Card Preview](preview.gif)

## Requirements

- [Spicetify](https://spicetify.app/) installed and configured
- Node.js (for building from source)

## Installation

### From Spicetify Marketplace (Recommended)

The easiest way to install Spicy Card is through the Spicetify Marketplace:

1. Make sure you have [Spicetify](https://spicetify.app/) installed
2. Open Spotify and click on "Marketplace" in the sidebar
3. Search for "Spicy Card"
4. Click "Install"

That's it! The extension will be automatically installed and enabled.

### Manual Installation (Alternative)

If you prefer to install manually or want to use a development build:

1. Download the extension file from `Extension/Build/(latest version)/spicy-card.js`
2. Locate your Spicetify extensions directory:
   - **Windows**: `%APPDATA%\spicetify\Extensions`
   - **macOS**: `~/.config/spicetify/Extensions`
   - **Linux**: `~/.config/spicetify/Extensions`
3. Place `spicy-card.js` in the extensions directory
4. Run `spicetify config extensions spicy-card.js`
5. Run `spicetify apply`

### Build from Source

If you want to build the extension yourself:

```bash
npm install
npm run build
```

The built extension will be available at `dist/spicy-card.js`. Copy this file to your Spicetify extensions directory and follow the installation steps from Option 1.

## Credits

### Beautiful Lyrics — SoCalifornian

The card view UI, Maid lifecycle pattern, sidebar injection logic, and lyrics renderer
architecture are inspired from [Beautiful Lyrics](https://github.com/surfbryce/beautiful-lyrics)
by [SoCalifornian](https://github.com/surfbryce).

### Spicy Lyrics — Spikerko

The lyrics API client (`Query.ts`) and API protocol are adapted from
[Spicy Lyrics](https://github.com/Spikerko/spicy-lyrics) by [Spikerko](https://github.com/Spikerko),
licensed under the [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html).

In accordance with the AGPL-3.0, the source code for this extension is made available publicly.

## License

Source code is made available under the terms of the
[GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
as required by the Spicy Lyrics dependency.


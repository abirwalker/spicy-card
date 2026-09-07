import { TransformedLyrics } from '../types/Lyrics'
import { fetchBiniLyrics, TrackQuery } from './BiniLyrics'
import { processRomanization, detectCJKLanguage } from './processLyrics'
import { getLyricsFromCache, setLyricsCache, setLyricsCacheNegative } from './LyricsCache'

export type LyricsResult = {
	lyrics: TransformedLyrics
	// Resolves when background romanization is complete (or failed).
	// CardView awaits this before re-rendering when the user clicks romanize.
	romanizationReady: Promise<void>
}

export async function fetchAndAdaptLyrics(trackId: string): Promise<LyricsResult | null> {
	// Check cache first
	const cached = getLyricsFromCache(trackId)
	if (cached === null) {
		return null
	}
	if (cached !== undefined) {
		const cjkLanguage = detectCJKLanguage(cached)
		if (cjkLanguage && !cached.RomanizedLanguage) {
			cached.RomanizedLanguage = cjkLanguage
		}

		const romanizationReady = cjkLanguage
			? processRomanization(cached).catch(() => {})
			: Promise.resolve()

		return { lyrics: cached, romanizationReady }
	}

	try {
		const item = Spicetify.Player.data?.item
		const meta = (item as any)?.metadata
		const songTitle = meta?.title || item?.name || ""

		let artistName = meta?.artist_name || ""
		if (!artistName && Array.isArray(item?.artists)) {
			artistName = item.artists.map((a: any) => a?.name).filter(Boolean).join(", ")
		} else if (!artistName && item?.artists?.[0]?.name) {
			artistName = item.artists[0].name
		}

		if (!songTitle && !artistName) {
			return null
		}

		const query: TrackQuery = {
			title: songTitle,
			artist: artistName,
			album: meta?.album_title || item?.album?.name,
			durationMs: Number(meta?.duration || item?.duration || 0),
			isrc: meta?.isrc
		}

		const lyrics = await fetchBiniLyrics(query)

		if (!lyrics) {
			setLyricsCacheNegative(trackId)
			return null
		}

		// Cache the adapted lyrics
		setLyricsCache(trackId, lyrics)

		// Detect CJK language for romanization toggle
		const cjkLanguage = detectCJKLanguage(lyrics)
		if (cjkLanguage) {
			lyrics.RomanizedLanguage = cjkLanguage
		}

		// Start romanization in background: don't await.
		// RomanizedText fields are populated in-place on lyrics objects.
		// romanizationReady resolves when done so CardView can wait on it if needed.
		const romanizationReady = cjkLanguage
			? processRomanization(lyrics).catch((err) =>
				console.warn("[SpicyCardView] Background romanization failed:", err)
			  )
			: Promise.resolve()

		return { lyrics, romanizationReady }
	} catch (error) {
		console.error("[SpicyCardView] fetchAndAdaptLyrics error:", error)
		return null
	}
}

import { TransformedLyrics } from '../types/Lyrics'
import { fetchBiniLyrics, TrackQuery } from './BiniLyrics'
import { processRomanization, detectCJKLanguage } from './processLyrics'
import { getLyricsFromCache, setLyricsCache, setLyricsCacheNegative } from './LyricsCache'
import { populateSpotifyCredits } from './SpotifyCredits'

export type LyricsResult = {
	lyrics: TransformedLyrics
	// Resolves when background romanization is complete (or failed).
	// CardView awaits this before re-rendering when the user clicks romanize.
	romanizationReady: Promise<void>
	creditsReady: Promise<void>
}

function cleanIsrc(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(cleaned) ? cleaned : undefined
}

function findIsrc(value: unknown, depth = 0): string | undefined {
	if (!value || depth > 8 || typeof value !== "object") return undefined
	for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
		if (/isrc/i.test(key)) {
			const valid = cleanIsrc(child)
			if (valid) return valid
		}
		if (typeof child === "object" && child !== null) {
			const record = child as Record<string, unknown>
			if (record.type === "isrc" || /isrc/i.test(String(record.type ?? ""))) {
				const fromId = cleanIsrc(record.id) || cleanIsrc(record.value)
				if (fromId) return fromId
			}
			const nested = findIsrc(child, depth + 1)
			if (nested) return nested
		}
	}
	return undefined
}

async function getTrackIsrc(trackId: string, item: any, meta: any): Promise<string | undefined> {
	const direct = cleanIsrc(meta?.isrc) || cleanIsrc(meta?.isrc_id) || cleanIsrc(meta?.track_isrc) ||
		cleanIsrc(item?.isrc) || cleanIsrc(item?.external_ids?.isrc)
	if (direct) return direct

	if (Array.isArray(item?.external_id)) {
		for (const entry of item.external_id) {
			const isrc = cleanIsrc(entry?.id || entry?.value)
			if (isrc) return isrc
		}
	}

	const embedded = findIsrc(meta) ?? findIsrc(item)
	if (embedded) return embedded

	try {
		const metadata = await Promise.race([
			Spicetify.CosmosAsync.get(`sp://metadata/track/${trackId}`),
			new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error("Cosmos timeout")), 1500))
		])
		const isrc = findIsrc(metadata)
		if (isrc) return isrc
	} catch {
		// Cosmos metadata is optional; title and artist lookup can still continue.
	}

	return undefined
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

		return { lyrics: cached, romanizationReady, creditsReady: populateSpotifyCredits(trackId, cached) }
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

		const isrc = await getTrackIsrc(trackId, item, meta)
		console.info("[SpicyCardView] Lyrics lookup", {
			trackId,
			title: songTitle,
			artist: artistName,
			isrc: isrc ?? "unavailable"
		})

		const query: TrackQuery = {
			title: songTitle,
			artist: artistName,
			album: meta?.album_title || item?.album?.name,
			durationMs: Number(meta?.duration || item?.duration || 0),
			isrc,
			spotifyId: trackId
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

		return { lyrics, romanizationReady, creditsReady: populateSpotifyCredits(trackId, lyrics) }
	} catch (error) {
		console.error("[SpicyCardView] fetchAndAdaptLyrics error:", error)
		return null
	}
}

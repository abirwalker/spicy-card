import { TransformedLyrics } from '../types/Lyrics'
import { Query } from './Query'
import { adaptLyrics } from './adaptLyrics'
import { processRomanization, detectCJKLanguage } from './processLyrics'

async function getAccessToken(): Promise<string> {
	try {
		const result = await Spicetify.CosmosAsync.get("sp://oauth/v2/token")
		return result.accessToken
	} catch {
		// Fallback for older Spotify versions
		const token = (Spicetify.Platform?.Session as any)?.accessToken
		if (token) return token
		throw new Error("[SpicyCardView] Could not obtain Spotify access token")
	}
}

export type LyricsResult = {
	lyrics: TransformedLyrics
	// Resolves when background romanization is complete (or failed).
	// CardView awaits this before re-rendering when the user clicks romanize.
	romanizationReady: Promise<void>
}

export async function fetchAndAdaptLyrics(trackId: string): Promise<LyricsResult | null> {
	try {
		const accessToken = await getAccessToken()

		const queries = await Query(
			[{ operation: "lyrics", variables: { id: trackId, auth: "SpicyLyrics-WebAuth" } }],
			{ "SpicyLyrics-WebAuth": `Bearer ${accessToken}` }
		)

		const result = queries.get("0")
		if (!result) {
			console.warn("[SpicyCardView] No lyrics query result returned")
			return null
		}

		if (result.httpStatus === 404) return null

		if (result.httpStatus !== 200) {
			console.warn(`[SpicyCardView] Lyrics fetch returned status ${result.httpStatus}`)
			return null
		}

		// Start romanization in background — don't await.
		// RomanizedText fields are populated in-place on the raw data object.
		// romanizationReady resolves when done so CardView can wait on it if needed.
		const romanizationReady = detectCJKLanguage(result.data)
			? processRomanization(result.data).catch(err =>
				console.warn("[SpicyCardView] Background romanization failed:", err)
			  )
			: Promise.resolve()

		return { lyrics: adaptLyrics(result.data), romanizationReady }
	} catch (error) {
		console.error("[SpicyCardView] fetchAndAdaptLyrics error:", error)
		return null
	}
}

import { TransformedLyrics } from '../types/Lyrics'
import { setLyricsCache } from './LyricsCache'

type Contributor = { name?: string; role?: string; roleGroup?: { name?: string } }
type CreditsResponse = {
	data?: { trackUnion?: { creditsTrait?: { contributors?: { items?: Contributor[] } } } }
}

// Persisted query used by Spotify's credits modal; prefer the installed definition when loaded.
const QUERY_NAME = 'queryTrackCreditsGroupedModal'
const QUERY_HASH = 'f135fb9be58a72d041ab5d214d817021a272405d883860468e2627afb01a3ca9'
const requests = new Map<string, Promise<string[]>>()

async function fetchSongwriters(trackId: string): Promise<string[]> {
	const variables = { trackUri: `spotify:track:${trackId}`, contributorsLimit: 100, contributorsOffset: 0 }
	const definition = Spicetify.GraphQL?.Definitions?.[QUERY_NAME]
	let timeout: ReturnType<typeof setTimeout> | undefined
	try {
		const params = new URLSearchParams({
			operationName: QUERY_NAME,
			variables: JSON.stringify(variables),
			extensions: JSON.stringify({ persistedQuery: { version: 1, sha256Hash: QUERY_HASH } })
		})
		const request = definition && Spicetify.GraphQL?.Request
			? Spicetify.GraphQL.Request(definition, variables)
			: Spicetify.CosmosAsync.get(`https://api-partner.spotify.com/pathfinder/v1/query?${params}`, undefined, { 'Accept-Language': 'en' })
		const response = await Promise.race<CreditsResponse>([
			request,
			new Promise<CreditsResponse>((_, reject) => {
				timeout = setTimeout(() => reject(new Error('Credits request timed out')), 5000)
			})
		])
		const contributors = response.data?.trackUnion?.creditsTrait?.contributors?.items
		if (!Array.isArray(contributors)) return []
		return [...new Set(contributors
			.filter(person => Boolean(person) && /\b(writer|songwriter|composer|lyricist|written by|composition|lyrics)\b/i.test(`${person?.role ?? ''} ${person?.roleGroup?.name ?? ''}`))
			.map(person => person?.name?.trim() ?? '')
			.filter(Boolean))]
	} catch (error) {
		console.warn('[SpicyCardView] Spotify credits unavailable:', error)
		return []
	} finally {
		clearTimeout(timeout)
	}
}

export async function populateSpotifyCredits(trackId: string, lyrics: TransformedLyrics): Promise<void> {
	if (lyrics.SongWriters !== undefined) return
	let request = requests.get(trackId)
	if (!request) {
		request = fetchSongwriters(trackId)
		requests.set(trackId, request)
		void request.finally(() => requests.delete(trackId))
	}
	const writers = await request
	lyrics.SongWriters = writers
	if (writers.length > 0) {
		setLyricsCache(trackId, lyrics)
	}
}

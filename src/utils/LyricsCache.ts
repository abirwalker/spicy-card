// Two-tier lyrics cache: in-memory Map + Spicetify.LocalStorage

const CACHE_PREFIX = "SpicyCard/lyrics/"
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

type CacheEntry = {
	data: any
	fetchedAt: number
}

// Tier 1: In-memory
const memoryCache = new Map<string, CacheEntry>()

// --- Tier 2: LocalStorage ---
function storageGet(trackId: string): CacheEntry | null {
	try {
		const raw = Spicetify.LocalStorage.get(CACHE_PREFIX + trackId)
		if (!raw) return null
		const entry: CacheEntry = JSON.parse(raw)
		if (Date.now() - entry.fetchedAt > TTL_MS) {
			Spicetify.LocalStorage.set(CACHE_PREFIX + trackId, "")
			return null
		}
		return entry
	} catch {
		return null
	}
}

function storageSet(trackId: string, entry: CacheEntry): void {
	try {
		Spicetify.LocalStorage.set(CACHE_PREFIX + trackId, JSON.stringify(entry))
	} catch {
		// Storage full or blocked — silently ignore
	}
}

// --- Public API ---

export function getLyricsFromCache(trackId: string): any | undefined {
	// Tier 1
	const mem = memoryCache.get(trackId)
	if (mem) return mem.data

	// Tier 2
	const stored = storageGet(trackId)
	if (stored) {
		memoryCache.set(trackId, stored)
		return stored.data
	}

	return undefined
}

export function setLyricsCache(trackId: string, data: any): void {
	const entry: CacheEntry = { data, fetchedAt: Date.now() }
	memoryCache.set(trackId, entry)
	storageSet(trackId, entry)
}

export function setLyricsCacheNegative(trackId: string): void {
	const entry: CacheEntry = { data: null, fetchedAt: Date.now() }
	memoryCache.set(trackId, entry)
	storageSet(trackId, entry)
}

export function clearLyricsCache(): void {
	memoryCache.clear()
	// Clear all SpicyCard/lyrics/* keys from LocalStorage
	// Spicetify.LocalStorage doesn't expose keys, so we clear memory only.
	// Full clear requires page reload or manual干预.
}

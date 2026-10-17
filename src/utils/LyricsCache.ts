// Two-tier lyrics cache: in-memory Map + LocalStorage with LRU eviction and cleanup

const CACHE_PREFIX = "SpicyCard/lyrics/v2/";
const LEGACY_PREFIX = "SpicyCard/lyrics/";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_ENTRIES = 150;

type CacheEntry = {
	data: any;
	fetchedAt: number;
};

// Tier 1: In-memory
const memoryCache = new Map<string, CacheEntry>();

function pruneOldestEntries(count: number): void {
	try {
		const entries: { key: string; fetchedAt: number }[] = [];
		const keys = Object.keys(localStorage);

		for (const key of keys) {
			if (!key.startsWith(CACHE_PREFIX)) continue;
			try {
				const raw = localStorage.getItem(key);
				if (!raw) {
					localStorage.removeItem(key);
					continue;
				}
				const parsed = JSON.parse(raw);
				entries.push({ key, fetchedAt: Number(parsed?.fetchedAt) || 0 });
			} catch {
				localStorage.removeItem(key);
			}
		}

		entries.sort((a, b) => a.fetchedAt - b.fetchedAt);
		const toRemove = Math.min(count, entries.length);
		for (let i = 0; i < toRemove; i++) {
			localStorage.removeItem(entries[i].key);
			const trackId = entries[i].key.slice(CACHE_PREFIX.length);
			memoryCache.delete(trackId);
		}
	} catch (err) {
		console.warn("[SpicyCardView] Error during cache prune:", err);
	}
}

// Cleans up legacy v1 keys, expired v2 entries, and enforces the max cache capacity
export function cleanupLyricsCache(): void {
	try {
		const now = Date.now();
		const validEntries: { key: string; fetchedAt: number }[] = [];
		const keys = Object.keys(localStorage);

		for (const key of keys) {
			// Remove any old v1 keys that were saved before v1.2.0 prefix change
			if (key.startsWith(LEGACY_PREFIX) && !key.startsWith(CACHE_PREFIX)) {
				localStorage.removeItem(key);
				continue;
			}

			if (key.startsWith(CACHE_PREFIX)) {
				try {
					const raw = localStorage.getItem(key);
					if (!raw) {
						localStorage.removeItem(key);
						continue;
					}
					const entry: CacheEntry = JSON.parse(raw);
					if (!entry || typeof entry.fetchedAt !== "number" || now - entry.fetchedAt > TTL_MS) {
						localStorage.removeItem(key);
						const trackId = key.slice(CACHE_PREFIX.length);
						memoryCache.delete(trackId);
					} else {
						validEntries.push({ key, fetchedAt: entry.fetchedAt });
					}
				} catch {
					localStorage.removeItem(key);
				}
			}
		}

		if (validEntries.length > MAX_CACHE_ENTRIES) {
			validEntries.sort((a, b) => a.fetchedAt - b.fetchedAt);
			const excess = validEntries.length - MAX_CACHE_ENTRIES;
			for (let i = 0; i < excess; i++) {
				localStorage.removeItem(validEntries[i].key);
				const trackId = validEntries[i].key.slice(CACHE_PREFIX.length);
				memoryCache.delete(trackId);
			}
		}
	} catch (err) {
		console.warn("[SpicyCardView] Error cleaning up lyrics cache:", err);
	}
}

// --- Tier 2: LocalStorage ---
function storageGet(trackId: string): CacheEntry | null {
	const key = CACHE_PREFIX + trackId;
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const entry: CacheEntry = JSON.parse(raw);
		if (Date.now() - entry.fetchedAt > TTL_MS) {
			localStorage.removeItem(key);
			return null;
		}
		return entry;
	} catch {
		try {
			localStorage.removeItem(key);
		} catch {}
		return null;
	}
}

function storageSet(trackId: string, entry: CacheEntry): void {
	const key = CACHE_PREFIX + trackId;
	try {
		// Proactively enforce cap so long listening sessions don't grow unbounded
		let v2KeyCount = 0;
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k && k.startsWith(CACHE_PREFIX)) v2KeyCount++;
		}
		if (v2KeyCount >= MAX_CACHE_ENTRIES) {
			pruneOldestEntries(Math.max(1, v2KeyCount - MAX_CACHE_ENTRIES + 1));
		}

		localStorage.setItem(key, JSON.stringify(entry));
	} catch {
		// If quota exceeded or storage blocked, aggressively evict oldest 25% and retry once
		try {
			pruneOldestEntries(Math.max(10, Math.floor(MAX_CACHE_ENTRIES * 0.25)));
			localStorage.setItem(key, JSON.stringify(entry));
		} catch {
			// Silently fail if storage is permanently full to keep extension working
		}
	}
}

// --- Public API ---

export function getLyricsFromCache(trackId: string): any | undefined {
	const now = Date.now();

	// Tier 1: In-memory with TTL check
	const mem = memoryCache.get(trackId);
	if (mem) {
		if (now - mem.fetchedAt > TTL_MS) {
			memoryCache.delete(trackId);
			localStorage.removeItem(CACHE_PREFIX + trackId);
		} else {
			return mem.data;
		}
	}

	// Tier 2: LocalStorage
	const stored = storageGet(trackId);
	if (stored) {
		memoryCache.set(trackId, stored);
		// Keep in-memory cache bounded as well
		if (memoryCache.size > MAX_CACHE_ENTRIES) {
			const oldestKey = memoryCache.keys().next().value;
			if (oldestKey) memoryCache.delete(oldestKey);
		}
		return stored.data;
	}

	return undefined;
}

export function setLyricsCache(trackId: string, data: any): void {
	const entry: CacheEntry = { data, fetchedAt: Date.now() };
	memoryCache.set(trackId, entry);
	if (memoryCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = memoryCache.keys().next().value;
		if (oldestKey) memoryCache.delete(oldestKey);
	}
	storageSet(trackId, entry);
}

export function setLyricsCacheNegative(trackId: string): void {
	const entry: CacheEntry = { data: null, fetchedAt: Date.now() };
	memoryCache.set(trackId, entry);
	if (memoryCache.size > MAX_CACHE_ENTRIES) {
		const oldestKey = memoryCache.keys().next().value;
		if (oldestKey) memoryCache.delete(oldestKey);
	}
	storageSet(trackId, entry);
}

export function clearLyricsCache(): void {
	memoryCache.clear();
	try {
		const keys = Object.keys(localStorage);
		for (const key of keys) {
			if (key.startsWith(LEGACY_PREFIX)) {
				localStorage.removeItem(key);
			}
		}
	} catch (err) {
		console.warn("[SpicyCardView] Failed to clear lyrics cache:", err);
	}
}

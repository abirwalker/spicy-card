// High-resolution smooth progress tracking for Spotify Desktop.
// Eliminates 250ms polling quantization (staircase effect) by extrapolating
// from Spotify's internal positionAsOfTimestamp and wall-clock timestamp.

interface SyncedPosition {
	position: number
	timestamp: number
}

let lastSynced: SyncedPosition | null = null

function updateSync(): void {
	try {
		const state =
			(Spicetify.Platform as any)?.PlayerAPI?._state ||
			(Spicetify.Player as any)?.origin?._state

		if (
			state &&
			typeof state.positionAsOfTimestamp === "number" &&
			typeof state.timestamp === "number"
		) {
			lastSynced = {
				position: state.positionAsOfTimestamp,
				timestamp: state.timestamp
			}
		}
	} catch {
		// Ignore retrieval failures
	}
}

export function getSmoothProgress(): number {
	updateSync()

	const isPlaying = Spicetify.Player?.isPlaying?.() ?? true

	if (!isPlaying) {
		if (lastSynced) return lastSynced.position
		return Spicetify.Player?.getProgress?.() || 0
	}

	if (lastSynced) {
		const elapsed = Date.now() - lastSynced.timestamp
		// Extrapolate if within valid window (under 10 seconds since last state update)
		if (elapsed >= 0 && elapsed < 10000) {
			return lastSynced.position + elapsed
		}
	}

	return Spicetify.Player?.getProgress?.() || 0
}

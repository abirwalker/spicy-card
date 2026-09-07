import {
	TransformedLyrics,
	SyllableSyncedLyrics,
	LineSyncedLyrics,
	StaticSyncedLyrics,
	SyllableVocalSet,
	LineVocal,
	Interlude,
	SyllableMetadata,
	TextMetadata
} from '../types/Lyrics'

const BINILYRICS_API = "https://lyrics-api.binimum.org"
const LRCLIB_API = "https://lrclib.net/api/get"
const REQUEST_TIMEOUT_MS = 7000

export type TrackQuery = {
	title: string
	artist: string
	album?: string
	durationMs?: number
	isrc?: string
}

interface BiniItem {
	track_name?: string
	artist_name?: string
	album_name?: string
	duration?: number
	isrc?: string
	timing_type?: string
	lyricsUrl?: string
}

function parseTime(timeStr: string | null | undefined): number {
	if (!timeStr) return 0
	const parts = timeStr.trim().split(":")

	if (parts.length === 1) {
		const val = parseFloat(parts[0])
		return Number.isFinite(val) ? Math.max(0, val) : 0
	}

	if (parts.length === 2) {
		const minutes = parseInt(parts[0], 10)
		const seconds = parseFloat(parts[1])
		if (Number.isFinite(minutes) && Number.isFinite(seconds)) {
			return Math.max(0, minutes * 60 + seconds)
		}
	}

	if (parts.length === 3) {
		const hours = parseInt(parts[0], 10)
		const minutes = parseInt(parts[1], 10)
		const seconds = parseFloat(parts[2])
		if (Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds)) {
			return Math.max(0, hours * 3600 + minutes * 60 + seconds)
		}
	}

	return 0
}

function decodeHtmlEntities(str: string): string {
	return str
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
}

function isRTLLanguage(lang?: string): boolean {
	if (!lang) return false
	const rtlCodes = ["ara", "ar", "heb", "he", "fas", "fa", "urd", "ur"]
	return rtlCodes.includes(lang.toLowerCase())
}

function scoreBiniItem(item: BiniItem, query: TrackQuery): number {
	const norm = (s: string | undefined) => (s || "").toLowerCase()
	let score = 0

	const songLower = query.title.toLowerCase()
	const artistLower = query.artist.toLowerCase()

	if (norm(item.track_name) === songLower) score += 10
	else if (norm(item.track_name).includes(songLower)) score += 5

	if (norm(item.artist_name) === artistLower) score += 10
	else if (norm(item.artist_name).includes(artistLower)) score += 5

	if (typeof query.durationMs === "number" && query.durationMs > 0 && typeof item.duration === "number") {
		const diff = Math.abs(item.duration - Math.round(query.durationMs / 1000))
		if (diff <= 3) score += 5
		else if (diff <= 8) score += 2
	}
	return score
}

function parseSongwriters(ttml: string): string[] | undefined {
	const matches = [...ttml.matchAll(/<songwriter>([^<]+)<\/songwriter>/gi)]
	if (matches.length === 0) return undefined
	const list = matches.map((m) => decodeHtmlEntities(m[1].trim())).filter((s) => s.length > 0)
	return list.length > 0 ? list : undefined
}

function parseLanguage(ttml: string): string {
	const match = ttml.match(/xml:lang="([^"]+)"/i)
	return match ? match[1].toLowerCase() : "und"
}

const P_PATTERN = /<p\s+([^>]*)begin="([^"]+)"(?:\s+[^>]*end="([^"]+)")?[^>]*>([\s\S]*?)<\/p>/gi
const SPAN_PATTERN = /<span\s+[^>]*begin="([^"]+)"(?:\s+[^>]*end="([^"]+)")?[^>]*>([\s\S]*?)<\/span>(\s*)/gi

type ParsedRawLine = {
	startTime: number
	endTime: number
	oppositeAligned: boolean
	syllables: SyllableMetadata[]
	plainText: string
}

export function parseTTML(ttmlXml: string): TransformedLyrics | null {
	if (!ttmlXml || typeof ttmlXml !== "string") return null

	const language = parseLanguage(ttmlXml)
	const songWriters = parseSongwriters(ttmlXml)
	const naturalAlignment = isRTLLanguage(language) ? "Right" : "Left"

	const rawLines: ParsedRawLine[] = []
	let hasSyllableTiming = false

	for (const pMatch of ttmlXml.matchAll(P_PATTERN)) {
		const pAttrs = pMatch[1] ?? ""
		const lineBegin = parseTime(pMatch[2])
		const lineEnd = pMatch[3] ? parseTime(pMatch[3]) : lineBegin
		const content = pMatch[4] ?? ""

		const oppositeAligned = /ttm:agent="v2"/i.test(pAttrs)

		const syllables: SyllableMetadata[] = []
		const spanMatches = [...content.matchAll(SPAN_PATTERN)]

		if (spanMatches.length > 0) {
			for (let i = 0; i < spanMatches.length; i++) {
				const sm = spanMatches[i]
				const spanBegin = parseTime(sm[1])
				const spanEnd = sm[2] ? parseTime(sm[2]) : lineEnd
				const rawWord = decodeHtmlEntities((sm[3] ?? "").replace(/<[^>]+>/g, "")).trim()
				const trailingSpace = sm[4] ?? ""

				if (rawWord.length > 0) {
					const isPartOfWord = (i < spanMatches.length - 1) && (trailingSpace.length === 0)
					syllables.push({
						StartTime: spanBegin,
						EndTime: spanEnd,
						Text: rawWord,
						IsPartOfWord: isPartOfWord
					})
				}
			}
		}

		const plainText = decodeHtmlEntities(content.replace(/<[^>]+>/g, "")).trim()

		if (syllables.length > 1) {
			hasSyllableTiming = true
		}

		if (syllables.length > 0 || plainText.length > 0) {
			rawLines.push({
				startTime: lineBegin,
				endTime: lineEnd > lineBegin ? lineEnd : (syllables.length > 0 ? syllables[syllables.length - 1].EndTime : lineBegin + 3),
				oppositeAligned,
				syllables,
				plainText
			})
		}
	}

	if (rawLines.length === 0) return null

	const totalStartTime = rawLines[0].startTime
	const totalEndTime = rawLines[rawLines.length - 1].endTime

	const baseHeader = {
		NaturalAlignment: naturalAlignment as "Left" | "Right",
		Language: language,
		...(songWriters ? { SongWriters: songWriters } : {})
	}

	if (hasSyllableTiming) {
		const content: (SyllableVocalSet | Interlude)[] = []

		for (let i = 0; i < rawLines.length; i++) {
			const line = rawLines[i]

			if (i === 0 && line.startTime >= 3.0) {
				content.push({
					Type: "Interlude",
					StartTime: 0,
					EndTime: line.startTime
				})
			} else if (i > 0) {
				const prevEnd = rawLines[i - 1].endTime
				if (line.startTime - prevEnd >= 2.5) {
					content.push({
						Type: "Interlude",
						StartTime: prevEnd,
						EndTime: line.startTime
					})
				}
			}

			const syllables = line.syllables.length > 0
				? line.syllables
				: [{
					StartTime: line.startTime,
					EndTime: line.endTime,
					Text: line.plainText,
					IsPartOfWord: false
				}]

			content.push({
				Type: "Vocal",
				OppositeAligned: line.oppositeAligned,
				Lead: {
					StartTime: line.startTime,
					EndTime: line.endTime,
					Syllables: syllables
				}
			})
		}

		const result: SyllableSyncedLyrics & typeof baseHeader = {
			...baseHeader,
			Type: "Syllable",
			StartTime: totalStartTime,
			EndTime: totalEndTime,
			Content: content
		}
		return result
	} else {
		const content: (LineVocal | Interlude)[] = []

		for (let i = 0; i < rawLines.length; i++) {
			const line = rawLines[i]

			if (i === 0 && line.startTime >= 3.0) {
				content.push({
					Type: "Interlude",
					StartTime: 0,
					EndTime: line.startTime
				})
			} else if (i > 0) {
				const prevEnd = rawLines[i - 1].endTime
				if (line.startTime - prevEnd >= 2.5) {
					content.push({
						Type: "Interlude",
						StartTime: prevEnd,
						EndTime: line.startTime
					})
				}
			}

			content.push({
				Type: "Vocal",
				OppositeAligned: line.oppositeAligned,
				StartTime: line.startTime,
				EndTime: line.endTime,
				Text: line.plainText
			})
		}

		const result: LineSyncedLyrics & typeof baseHeader = {
			...baseHeader,
			Type: "Line",
			StartTime: totalStartTime,
			EndTime: totalEndTime,
			Content: content
		}
		return result
	}
}

const LRC_LINE_PATTERN = /\[(\d+):(\d+(?:\.\d+)?)\]/g

function parseLRC(lrcText: string): TransformedLyrics | null {
	if (!lrcText || typeof lrcText !== "string") return null

	const stamped: { startTime: number; text: string }[] = []
	for (const rawLine of lrcText.split("\n")) {
		const line = rawLine.trim()
		if (!line) continue
		const stamps = [...line.matchAll(LRC_LINE_PATTERN)]
		if (stamps.length === 0) continue
		const text = line.replace(LRC_LINE_PATTERN, "").trim()
		if (!text) continue
		for (const stamp of stamps) {
			const minutes = parseInt(stamp[1] ?? "0", 10)
			const seconds = parseFloat(stamp[2] ?? "0")
			if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue
			stamped.push({ startTime: Math.max(0, minutes * 60 + seconds), text })
		}
	}

	if (stamped.length === 0) return null
	stamped.sort((a, b) => a.startTime - b.startTime)

	const content: (LineVocal | Interlude)[] = []
	for (let i = 0; i < stamped.length; i++) {
		const current = stamped[i]
		const nextStart = i + 1 < stamped.length ? stamped[i + 1].startTime : current.startTime + 4.0
		const endTime = Math.max(nextStart, current.startTime + 1.0)

		if (i === 0 && current.startTime >= 3.0) {
			content.push({
				Type: "Interlude",
				StartTime: 0,
				EndTime: current.startTime
			})
		} else if (i > 0) {
			const prevEnd = content[content.length - 1].EndTime
			if (current.startTime - prevEnd >= 2.5) {
				content.push({
					Type: "Interlude",
					StartTime: prevEnd,
					EndTime: current.startTime
				})
			}
		}

		content.push({
			Type: "Vocal",
			OppositeAligned: false,
			StartTime: current.startTime,
			EndTime: endTime,
			Text: current.text
		})
	}

	const result: LineSyncedLyrics & { NaturalAlignment: "Left" | "Right"; Language: string } = {
		Type: "Line",
		NaturalAlignment: "Left",
		Language: "und",
		StartTime: stamped[0].startTime,
		EndTime: content[content.length - 1].EndTime,
		Content: content
	}
	return result
}

function parsePlainLyrics(plainText: string): TransformedLyrics | null {
	const lines = plainText
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0)

	if (lines.length === 0) return null

	const textMetadata: TextMetadata[] = lines.map((text) => ({ Text: text }))
	const result: StaticSyncedLyrics & { NaturalAlignment: "Left" | "Right"; Language: string } = {
		Type: "Static",
		NaturalAlignment: "Left",
		Language: "und",
		Lines: textMetadata
	}
	return result
}

async function fetchWithTimeout(url: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<Response> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
	try {
		return await fetch(url, { signal: controller.signal })
	} finally {
		clearTimeout(timeoutId)
	}
}

async function fetchLrclibFallback(query: TrackQuery): Promise<TransformedLyrics | null> {
	const song = query.title.trim()
	const artist = query.artist.trim()
	if (!song || !artist) return null

	const params = new URLSearchParams()
	params.set("track_name", song)
	params.set("artist_name", artist)
	if (query.album?.trim()) params.set("album_name", query.album.trim())
	if (typeof query.durationMs === "number" && query.durationMs > 0) {
		params.set("duration", Math.round(query.durationMs / 1000).toString())
	}

	try {
		const res = await fetchWithTimeout(`${LRCLIB_API}?${params.toString()}`)
		if (!res.ok) return null
		const data = await res.json()
		if (!data || typeof data !== "object" || data.instrumental === true) return null

		if (typeof data.syncedLyrics === "string" && data.syncedLyrics.trim()) {
			const parsed = parseLRC(data.syncedLyrics)
			if (parsed) return parsed
		}

		if (typeof data.plainLyrics === "string" && data.plainLyrics.trim()) {
			const parsed = parsePlainLyrics(data.plainLyrics)
			if (parsed) return parsed
		}
	} catch {
		// Fallback fails silently
	}

	return null
}

export async function fetchBiniLyrics(query: TrackQuery): Promise<TransformedLyrics | null> {
	const song = query.title?.trim() ?? ""
	const artist = query.artist?.trim() ?? ""
	if (!song && !artist && !query.isrc) return null

	try {
		let results: BiniItem[] = []

		if (query.isrc) {
			try {
				const isrcRes = await fetchWithTimeout(
					`${BINILYRICS_API}/getLyrics?isrc=${encodeURIComponent(query.isrc)}`
				)
				if (isrcRes.ok) {
					const body = await isrcRes.json()
					if (Array.isArray(body?.results) && body.results.length > 0) {
						results = body.results
					}
				}
			} catch {
				// Continue to title + artist search
			}
		}

		if (results.length === 0 && song) {
			const searchQuery = `${song} ${artist}`.trim()
			const res = await fetchWithTimeout(
				`${BINILYRICS_API}/getLyrics?q=${encodeURIComponent(searchQuery)}`
			)
			if (res.ok) {
				const body = await res.json()
				if (Array.isArray(body?.results)) {
					results = body.results
				}
			}
		}

		if (results.length > 0) {
			const ranked = [...results].sort((a, b) => scoreBiniItem(b, query) - scoreBiniItem(a, query))

			for (const item of ranked.slice(0, 3)) {
				if (typeof item?.lyricsUrl !== "string" || !item.lyricsUrl) continue

				try {
					const lyrRes = await fetchWithTimeout(item.lyricsUrl)
					if (!lyrRes.ok) continue
					const ttml = await lyrRes.text()
					if (!ttml.includes("<p")) continue

					const parsed = parseTTML(ttml)
					if (parsed) return parsed
				} catch {
					continue
				}
			}
		}
	} catch (error) {
		console.warn("[SpicyCardView] BiniLyrics request failed:", error)
	}

	// Open-source LRCLIB fallback for tracks not present in BiniLyrics
	return fetchLrclibFallback(query)
}

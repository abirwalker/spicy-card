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
const AMLL_API = "https://api.amll.dev/v1/lyrics"
const LRCLIB_API = "https://lrclib.net/api"
const LRCLIB_HEADERS = {
	"User-Agent": "SpicyCard/1.2.2 (https://github.com/abirwalker/spicy-card)"
}
const REQUEST_TIMEOUT_MS = 7000

export type TrackQuery = {
	title: string
	artist: string
	album?: string
	durationMs?: number
	isrc?: string
	spotifyId?: string
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

const VERSION_MARKER = /\b(remix|stripped|acoustic|live|edit|version|instrumental|karaoke|sped[ -]?up|slowed|rework|vip|demo|radio[ -]?edit)\b/i

function normalizeMatchText(value?: string): string {
	return (value ?? "")
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
}

function getVersionMarkers(value: string): string[] {
	return value.match(new RegExp(VERSION_MARKER.source, "gi"))?.map(marker => marker.toLowerCase()) ?? []
}

function hasUnexpectedVersion(item: BiniItem, query: TrackQuery): boolean {
	const queryIsrc = query.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	const itemIsrc = item.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	if (queryIsrc && itemIsrc && queryIsrc === itemIsrc) return false

	// Compare track titles only; album names often include "Deluxe Version", "Bonus Track Version", etc.
	const candidate = item.track_name ?? ""
	const requested = query.title
	const requestedMarkers = new Set(getVersionMarkers(requested))
	return getVersionMarkers(candidate).some(marker => !requestedMarkers.has(marker))
}

function cleanTitleForSearch(title: string): string {
	return title
		.replace(/\s*(\(|\[)\s*(with|feat\.?|ft\.?)\b[^)\]]*(\)|\])/gi, "")
		.replace(/\s*-\s*(with|feat\.?|ft\.?)\b.*$/gi, "")
		.trim()
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
	const norm = normalizeMatchText
	let score = 0

	const songLower = norm(query.title)
	const artists = query.artist.split(",").map(a => norm(a)).filter(Boolean)
	const candidateTitle = norm(item.track_name)
	const candidateArtist = norm(item.artist_name)

	if (candidateTitle === songLower) score += 100
	else if (candidateTitle.includes(songLower) || songLower.includes(candidateTitle)) score += 20

	const hasArtistMatch = artists.some(a => candidateArtist === a || candidateArtist.includes(a) || a.includes(candidateArtist))
	if (hasArtistMatch) {
		score += 60
	} else if (artists.length > 0) {
		score -= 50
	}

	if (typeof query.durationMs === "number" && query.durationMs > 0 && typeof item.duration === "number" && item.duration > 0) {
		const diff = Math.abs(item.duration - Math.round(query.durationMs / 1000))
		if (diff <= 2) score += 80
		else if (diff <= 5) score += 35
		else if (diff <= 10) score += 5
		else score -= 100
	}
	if (item.timing_type?.toLowerCase() === "word") score += 3
	return score
}

function isValidBiniCandidate(item: BiniItem, query: TrackQuery): boolean {
	const queryIsrc = query.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	const itemIsrc = item.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	if (queryIsrc && itemIsrc && queryIsrc === itemIsrc) return true

	const norm = normalizeMatchText
	const artists = query.artist.split(",").map(a => norm(a)).filter(Boolean)
	const candidateArtist = norm(item.artist_name)
	const hasArtistMatch = Boolean(
		candidateArtist && artists.length > 0 &&
		artists.some(a => candidateArtist === a || candidateArtist.includes(a) || a.includes(candidateArtist))
	)

	let durationDiff: number | undefined
	if (typeof query.durationMs === "number" && query.durationMs > 0 && typeof item.duration === "number" && item.duration > 0) {
		durationDiff = Math.abs(item.duration - Math.round(query.durationMs / 1000))
	}

	// If artist does not match and duration is off by more than 4 seconds, it is a completely different song.
	if (!hasArtistMatch && durationDiff !== undefined && durationDiff > 4) {
		return false
	}

	// If artist does not match and no duration info exists, reject if an artist was requested.
	if (!hasArtistMatch && durationDiff === undefined && artists.length > 0) {
		return false
	}

	return scoreBiniItem(item, query) >= 60
}

function parseSongwriters(ttml: string): string[] | undefined {
	const matches = [...ttml.matchAll(/<songwriter>([^<]+)<\/songwriter>/gi)]
	if (matches.length === 0) return undefined
	const list = matches.map((m) => decodeHtmlEntities(m[1].trim())).filter((s) => s.length > 0)
	return list.length > 0 ? list : undefined
}

function parseLanguage(ttml: string): string {
	const ttMatch = ttml.match(/<tt[^>]*\bxml:lang="([^"]+)"/i)
	if (ttMatch) return ttMatch[1].toLowerCase()
	const match = ttml.match(/xml:lang="([^"]+)"/i)
	return match ? match[1].toLowerCase() : "und"
}

function isWordBoundary(rawContent: string, trailingSpace: string, nextRawContent: string | null): boolean {
	if (nextRawContent === null) return true
	if (/\s+$/.test(rawContent) || trailingSpace.length > 0) return true
	if (/^\s+/.test(nextRawContent)) return true
	if (/[\s,.!?;:\-\u2014\u3001\u3002\uFF01\uFF1F]+$/.test(rawContent.trim())) return true
	return false
}

type ParsedSpansResult = {
	leadSyllables: SyllableMetadata[]
	backgroundVocalParts: { StartTime: number; EndTime: number; Syllables: SyllableMetadata[] }[]
}

function parseSimpleSpans(content: string, defaultBegin: number, defaultEnd: number): SyllableMetadata[] {
	const SPAN_RE = /<span([^>]*?)>([\s\S]*?)<\/span>(\s*)/gi
	const rawList: { rawInner: string; trailingSpace: string; begin: number; end: number }[] = []

	for (const m of content.matchAll(SPAN_RE)) {
		const attrs = m[1] ?? ""
		const rawInner = m[2] ?? ""
		const trailingSpace = m[3] ?? ""
		const beginMatch = attrs.match(/begin="([^"]+)"/i)
		const endMatch = attrs.match(/end="([^"]+)"/i)
		const begin = beginMatch ? parseTime(beginMatch[1]) : defaultBegin
		let end = endMatch ? parseTime(endMatch[1]) : defaultEnd
		if (end <= begin) end = begin + 0.05

		rawList.push({ rawInner, trailingSpace, begin, end })
	}

	const syllables: SyllableMetadata[] = []
	for (let i = 0; i < rawList.length; i++) {
		const curr = rawList[i]
		const cleanText = decodeHtmlEntities(curr.rawInner.replace(/<[^>]+>/g, "")).trim()
		if (!cleanText) continue

		const nextRaw = i + 1 < rawList.length ? rawList[i + 1].rawInner : null
		const isBoundary = isWordBoundary(curr.rawInner, curr.trailingSpace, nextRaw)

		syllables.push({
			StartTime: curr.begin,
			EndTime: curr.end,
			Text: cleanText,
			IsPartOfWord: !isBoundary
		})
	}
	return syllables
}

function parseTTMLSpans(pContent: string, lineBegin: number, lineEnd: number): ParsedSpansResult {
	const backgroundVocalParts: { StartTime: number; EndTime: number; Syllables: SyllableMetadata[] }[] = []
	const rawLeadList: { rawInner: string; trailingSpace: string; begin: number; end: number }[] = []

	let i = 0
	while (i < pContent.length) {
		const spanStart = pContent.indexOf("<span", i)
		if (spanStart === -1) break

		const openTagEnd = pContent.indexOf(">", spanStart)
		if (openTagEnd === -1) break

		const openTag = pContent.slice(spanStart, openTagEnd + 1)
		if (/ttm:role="(x-translation|x-roman)"/i.test(openTag)) {
			const closeTag = pContent.indexOf("</span>", openTagEnd)
			if (closeTag === -1) break
			i = closeTag + 7
			continue
		}
		const isBg = /ttm:role="x-bg"/i.test(openTag)

		if (isBg) {
			let depth = 1
			let cur = openTagEnd + 1
			let bgInner = ""
			while (cur < pContent.length && depth > 0) {
				const nextOpen = pContent.indexOf("<span", cur)
				const nextClose = pContent.indexOf("</span>", cur)

				if (nextClose === -1) break

				if (nextOpen !== -1 && nextOpen < nextClose) {
					depth++
					cur = nextOpen + 5
				} else {
					depth--
					if (depth === 0) {
						bgInner = pContent.slice(openTagEnd + 1, nextClose)
						i = nextClose + 7
					} else {
						cur = nextClose + 7
					}
				}
			}

			const bgSpans = parseSimpleSpans(bgInner, lineBegin, lineEnd)
			if (bgSpans.length > 0) {
				backgroundVocalParts.push({
					StartTime: bgSpans[0].StartTime,
					EndTime: bgSpans[bgSpans.length - 1].EndTime,
					Syllables: bgSpans
				})
			}
		} else {
			const closeTag = pContent.indexOf("</span>", openTagEnd)
			if (closeTag === -1) break

			const innerText = pContent.slice(openTagEnd + 1, closeTag)
			let afterClose = closeTag + 7
			let trailingSpace = ""
			while (afterClose < pContent.length && /\s/.test(pContent[afterClose])) {
				trailingSpace += pContent[afterClose]
				afterClose++
			}

			const beginMatch = openTag.match(/begin="([^"]+)"/i)
			const endMatch = openTag.match(/end="([^"]+)"/i)
			const begin = beginMatch ? parseTime(beginMatch[1]) : lineBegin
			let end = endMatch ? parseTime(endMatch[1]) : lineEnd
			if (end <= begin) end = begin + 0.05

			rawLeadList.push({
				rawInner: innerText,
				trailingSpace,
				begin,
				end
			})

			i = afterClose
		}
	}

	const leadSyllables: SyllableMetadata[] = []
	for (let idx = 0; idx < rawLeadList.length; idx++) {
		const curr = rawLeadList[idx]
		const cleanText = decodeHtmlEntities(curr.rawInner.replace(/<[^>]+>/g, "")).trim()
		if (!cleanText) continue

		const nextRaw = idx + 1 < rawLeadList.length ? rawLeadList[idx + 1].rawInner : null
		const isBoundary = isWordBoundary(curr.rawInner, curr.trailingSpace, nextRaw)

		leadSyllables.push({
			StartTime: curr.begin,
			EndTime: curr.end,
			Text: cleanText,
			IsPartOfWord: !isBoundary
		})
	}

	return { leadSyllables, backgroundVocalParts }
}

const P_PATTERN = /<p([^>]*?)>([\s\S]*?)<\/p>/gi

type ParsedRawLine = {
	startTime: number
	endTime: number
	oppositeAligned: boolean
	syllables: SyllableMetadata[]
	backgroundVocalParts: { StartTime: number; EndTime: number; Syllables: SyllableMetadata[] }[]
	plainText: string
}

export function parseTTML(ttmlXml: string): TransformedLyrics | null {
	if (!ttmlXml || typeof ttmlXml !== "string") return null

	const language = parseLanguage(ttmlXml)
	const songWriters = parseSongwriters(ttmlXml)
	const naturalAlignment = isRTLLanguage(language) ? "Right" : "Left"

	const baseHeader = {
		NaturalAlignment: naturalAlignment as "Left" | "Right",
		Language: language,
		...(songWriters ? { SongWriters: songWriters } : {})
	}

	const hasAnyTimestamps = /<p[^>]*\bbegin=/i.test(ttmlXml)
	if (!hasAnyTimestamps) {
		const lines: TextMetadata[] = []
		for (const pMatch of ttmlXml.matchAll(P_PATTERN)) {
			const content = (pMatch[2] ?? "").replace(/<span[^>]*ttm:role="(x-translation|x-roman)"[^>]*>[\s\S]*?<\/span>/gi, "")
			const plainText = decodeHtmlEntities(content.replace(/<[^>]+>/g, "")).trim()
			if (plainText) {
				lines.push({ Text: plainText })
			}
		}
		if (lines.length === 0) return null
		return {
			...baseHeader,
			Type: "Static",
			Lines: lines
		}
	}

	const rawLines: ParsedRawLine[] = []
	let hasSyllableTiming = false

	for (const pMatch of ttmlXml.matchAll(P_PATTERN)) {
		const pAttrs = pMatch[1] ?? ""
		// Strip translation and romanization spans (e.g. AMLL Chinese translation: <span ttm:role="x-translation"...>...</span>)
		const content = (pMatch[2] ?? "").replace(/<span[^>]*ttm:role="(x-translation|x-roman)"[^>]*>[\s\S]*?<\/span>/gi, "")

		const beginMatch = pAttrs.match(/begin="([^"]+)"/i)
		const endMatch = pAttrs.match(/end="([^"]+)"/i)
		const prevLineEnd = rawLines.length > 0 ? rawLines[rawLines.length - 1].endTime : 0
		const lineBegin = beginMatch ? parseTime(beginMatch[1]) : prevLineEnd
		let lineEnd = endMatch ? parseTime(endMatch[1]) : lineBegin + 3
		if (lineEnd <= lineBegin) lineEnd = lineBegin + 3

		const oppositeAligned = /ttm:agent="v2"/i.test(pAttrs)

		const { leadSyllables, backgroundVocalParts } = parseTTMLSpans(content, lineBegin, lineEnd)
		const plainText = decodeHtmlEntities(content.replace(/<[^>]+>/g, "")).trim()

		if (leadSyllables.length > 1 || backgroundVocalParts.length > 0) {
			hasSyllableTiming = true
		}

		if (leadSyllables.length > 0 || plainText.length > 0) {
			const effectiveStart = leadSyllables.length > 0 ? leadSyllables[0].StartTime : lineBegin
			const effectiveEnd = leadSyllables.length > 0
				? leadSyllables[leadSyllables.length - 1].EndTime
				: Math.max(lineEnd, lineBegin + 0.5)

			rawLines.push({
				startTime: effectiveStart,
				endTime: effectiveEnd,
				oppositeAligned,
				syllables: leadSyllables,
				backgroundVocalParts,
				plainText
			})
		}
	}

	if (rawLines.length === 0) return null

	rawLines.sort((a, b) => a.startTime - b.startTime)

	const totalStartTime = Math.min(...rawLines.map((l) => l.startTime))
	const totalEndTime = Math.max(...rawLines.map((l) => l.endTime))

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

			const lineLeadStart = line.syllables.length > 0 ? line.syllables[0].StartTime : line.startTime
			const lineLeadEnd = line.syllables.length > 0 ? line.syllables[line.syllables.length - 1].EndTime : line.endTime

			const vocalSet: SyllableVocalSet = {
				Type: "Vocal",
				OppositeAligned: line.oppositeAligned,
				Lead: {
					StartTime: lineLeadStart,
					EndTime: lineLeadEnd,
					Syllables: syllables
				},
				...(line.backgroundVocalParts.length > 0 ? { Background: line.backgroundVocalParts } : {})
			}

			content.push(vocalSet)
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
		const endTime = Math.max(nextStart, current.startTime + 0.5)

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

async function fetchWithTimeout(
	url: string,
	timeoutMs: number = REQUEST_TIMEOUT_MS,
	headers?: Record<string, string>
): Promise<Response> {
	const controller = new AbortController()
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
	try {
		return await fetch(url, { signal: controller.signal, headers })
	} finally {
		clearTimeout(timeoutId)
	}
}

async function fetchLrclibLyrics(query: TrackQuery): Promise<TransformedLyrics | null> {
	const song = query.title.trim()
	const artist = query.artist.trim()
	if (!song || !artist) return null

	let staticCandidate: TransformedLyrics | null = null

	const params = new URLSearchParams()
	params.set("track_name", song)
	params.set("artist_name", artist)
	if (query.album?.trim()) params.set("album_name", query.album.trim())
	if (typeof query.durationMs === "number" && query.durationMs > 0) {
		params.set("duration", Math.round(query.durationMs / 1000).toString())
	}

	try {
		const res = await fetchWithTimeout(`${LRCLIB_API}/get?${params.toString()}`, REQUEST_TIMEOUT_MS, LRCLIB_HEADERS)
		if (res.ok) {
			const data = await res.json()
			if (data && typeof data === "object" && data.instrumental !== true) {
				if (typeof data.syncedLyrics === "string" && data.syncedLyrics.trim()) {
					const parsed = parseLRC(data.syncedLyrics)
					if (parsed) return parsed
				}
				if (typeof data.plainLyrics === "string" && data.plainLyrics.trim()) {
					staticCandidate = parsePlainLyrics(data.plainLyrics)
				}
			}
		}
	} catch {
		// Continue to search
	}

	// If /get only had static lyrics or no lyrics, search LRCLIB to find synced lyrics
	try {
		const primaryArtist = artist.split(",")[0].trim()
		const cleanSong = cleanTitleForSearch(song)
		const searchQueries = [
			`${cleanSong} ${primaryArtist}`.trim(),
			cleanSong !== song ? `${song} ${primaryArtist}`.trim() : null
		].filter((q): q is string => Boolean(q))

		for (const q of searchQueries) {
			const searchParams = new URLSearchParams()
			searchParams.set("q", q)
			const res = await fetchWithTimeout(`${LRCLIB_API}/search?${searchParams.toString()}`, REQUEST_TIMEOUT_MS, LRCLIB_HEADERS)
			if (!res.ok) continue
			const items = await res.json()
			if (!Array.isArray(items) || items.length === 0) continue

			for (const item of items.slice(0, 5)) {
				if (!item || item.instrumental === true) continue

				const itemTrack = normalizeMatchText(item.trackName ?? item.name ?? "")
				const itemArtist = normalizeMatchText(item.artistName ?? "")
				const qSong = normalizeMatchText(cleanSong)
				const qArtist = normalizeMatchText(primaryArtist)

				const titleMatch = itemTrack === qSong || itemTrack.includes(qSong) || qSong.includes(itemTrack)
				if (!titleMatch) continue

				const artistMatch = itemArtist === qArtist || itemArtist.includes(qArtist) || qArtist.includes(itemArtist)
				if (!artistMatch) continue

				if (typeof query.durationMs === "number" && query.durationMs > 0 && typeof item.duration === "number" && item.duration > 0) {
					const diff = Math.abs(item.duration - Math.round(query.durationMs / 1000))
					if (diff > 4) continue
				}

				if (typeof item.syncedLyrics === "string" && item.syncedLyrics.trim()) {
					const parsed = parseLRC(item.syncedLyrics)
					if (parsed) return parsed
				}

				if (!staticCandidate && typeof item.plainLyrics === "string" && item.plainLyrics.trim()) {
					staticCandidate = parsePlainLyrics(item.plainLyrics)
				}
			}
		}
	} catch {
		// Fallback continues
	}

	return staticCandidate
}

async function fetchAmllLyrics(query: TrackQuery): Promise<TransformedLyrics | null> {
	let staticCandidate: TransformedLyrics | null = null

	const fetchTtml = async (params: URLSearchParams): Promise<TransformedLyrics | null> => {
		try {
			const response = await fetchWithTimeout(`${AMLL_API}/get?${params.toString()}`)
			if (!response.ok) return null
			const body = await response.json()
			const ttml = body?.data?.lyrics
			if (typeof ttml !== "string" || !ttml.includes("<p")) return null
			return parseTTML(ttml)
		} catch {
			return null
		}
	}

	if (query.spotifyId) {
		const params = new URLSearchParams()
		params.append("spotifyId", query.spotifyId)
		const parsed = await fetchTtml(params)
		if (parsed) {
			if (parsed.Type !== "Static") return parsed
			if (!staticCandidate) staticCandidate = parsed
		}
	}

	const cleanIsrc = query.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	if (cleanIsrc) {
		const params = new URLSearchParams()
		params.append("isrc", cleanIsrc)
		const parsed = await fetchTtml(params)
		if (parsed) {
			if (parsed.Type !== "Static") return parsed
			if (!staticCandidate) staticCandidate = parsed
		}
	}

	if (!query.title.trim() && !query.artist.trim()) return staticCandidate

	try {
		const primaryArtist = query.artist.split(",")[0].trim()
		const cleanedTitle = cleanTitleForSearch(query.title)
		const searchQuery = `${cleanedTitle || query.title.trim()} ${primaryArtist}`.trim()
		const params = new URLSearchParams()
		params.set("q", searchQuery)
		params.set("pageSize", "5")
		const response = await fetchWithTimeout(`${AMLL_API}/search?${params.toString()}`)
		if (response.ok) {
			const body = await response.json()
			const items = Array.isArray(body?.data?.items) ? body.data.items : []

			for (const item of items.slice(0, 3)) {
				const itemParams = new URLSearchParams()
				if (typeof item?.filename === "string" && item.filename) itemParams.set("filename", item.filename)
				else if (item?.id !== undefined) itemParams.set("id", String(item.id))
				else continue
				const parsed = await fetchTtml(itemParams)
				if (parsed) {
					if (parsed.Type !== "Static") return parsed
					if (!staticCandidate) staticCandidate = parsed
				}
			}
		}
	} catch {
		// AMLL search fails silently
	}

	return staticCandidate
}

async function fetchBiniSource(query: TrackQuery, cleanIsrc?: string): Promise<TransformedLyrics | null> {
	let results: BiniItem[] = []

	if (cleanIsrc) {
		try {
			const isrcRes = await fetchWithTimeout(
				`${BINILYRICS_API}/getLyrics?isrc=${encodeURIComponent(cleanIsrc)}`
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

	const song = query.title?.trim() ?? ""
	const artist = query.artist?.trim() ?? ""

	if (results.length === 0 && song) {
		const cleanedSong = cleanTitleForSearch(song)
		const primaryArtist = artist.split(",")[0].trim()
		const cleanArtist = artist.replace(/,/g, " ").replace(/\s+/g, " ").trim()
		const queriesToTry = [
			`${cleanedSong} ${primaryArtist}`.trim(),
			primaryArtist !== cleanArtist ? `${cleanedSong} ${cleanArtist}`.trim() : null,
			cleanedSong !== song ? `${song} ${primaryArtist}`.trim() : null,
			cleanedSong
		].filter((q): q is string => Boolean(q))

		for (const q of queriesToTry) {
			const res = await fetchWithTimeout(
				`${BINILYRICS_API}/getLyrics?q=${encodeURIComponent(q)}`
			)
			if (res.ok) {
				const body = await res.json()
				if (Array.isArray(body?.results) && body.results.length > 0) {
					results = body.results
					break
				}
			}
		}
	}

	if (results.length === 0) return null

	const candidates = results.filter(item => !hasUnexpectedVersion(item, query) && isValidBiniCandidate(item, query))
	const ranked = [...candidates].sort((a, b) => {
		const aIsrc = a.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
		const bIsrc = b.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
		if (cleanIsrc && aIsrc === cleanIsrc) return -1
		if (cleanIsrc && bIsrc === cleanIsrc) return 1
		return scoreBiniItem(b, query) - scoreBiniItem(a, query)
	})

	let staticCandidate: TransformedLyrics | null = null

	for (const item of ranked.slice(0, 3)) {
		if (typeof item?.lyricsUrl !== "string" || !item.lyricsUrl) continue

		try {
			const lyrRes = await fetchWithTimeout(item.lyricsUrl)
			if (!lyrRes.ok) continue
			const ttml = await lyrRes.text()
			if (!ttml.includes("<p")) continue

			const parsed = parseTTML(ttml)
			if (parsed) {
				if (parsed.Type !== "Static") return parsed
				if (!staticCandidate) staticCandidate = parsed
			}
		} catch {
			continue
		}
	}

	return staticCandidate
}

export async function fetchBiniLyrics(query: TrackQuery): Promise<TransformedLyrics | null> {
	const song = query.title?.trim() ?? ""
	const artist = query.artist?.trim() ?? ""
	const cleanIsrc = query.isrc?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
	if (!song && !artist && !cleanIsrc) return null

	let staticFallback: TransformedLyrics | null = null

	// 1. Primary: BiniLyrics (word-synced Apple Music TTML)
	try {
		const biniLyrics = await fetchBiniSource(query, cleanIsrc)
		if (biniLyrics) {
			if (biniLyrics.Type !== "Static") {
				return biniLyrics
			}
			staticFallback = biniLyrics
		}
	} catch (error) {
		console.warn("[SpicyCardView] BiniLyrics request failed:", error)
	}

	// 2. Secondary: AMLL (Apple Music-like Lyrics TTML database)
	try {
		const amllLyrics = await fetchAmllLyrics(query)
		if (amllLyrics) {
			if (amllLyrics.Type !== "Static") {
				return amllLyrics
			}
			if (!staticFallback) {
				staticFallback = amllLyrics
			}
		}
	} catch (error) {
		console.warn("[SpicyCardView] AMLL request failed:", error)
	}

	// 3. Tertiary: LRCLIB (LRC synced lyrics & plain text fallback)
	try {
		const lrclibLyrics = await fetchLrclibLyrics(query)
		if (lrclibLyrics) {
			if (lrclibLyrics.Type !== "Static") {
				return lrclibLyrics
			}
			if (!staticFallback) {
				staticFallback = lrclibLyrics
			}
		}
	} catch (error) {
		console.warn("[SpicyCardView] LRCLIB request failed:", error)
	}

	// All providers checked. If none provided synced lyrics, fall back to static lyrics if available.
	return staticFallback
}

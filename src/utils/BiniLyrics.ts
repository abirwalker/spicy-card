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

	const rawLines: ParsedRawLine[] = []
	let hasSyllableTiming = false

	for (const pMatch of ttmlXml.matchAll(P_PATTERN)) {
		const pAttrs = pMatch[1] ?? ""
		const content = pMatch[2] ?? ""

		const beginMatch = pAttrs.match(/begin="([^"]+)"/i)
		const endMatch = pAttrs.match(/end="([^"]+)"/i)
		const lineBegin = beginMatch ? parseTime(beginMatch[1]) : 0
		const lineEnd = endMatch ? parseTime(endMatch[1]) : lineBegin + 3

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

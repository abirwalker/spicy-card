import { TransformedLyrics, RomanizedLanguage } from '../types/Lyrics'

// Maps Spicy Lyrics language codes to Beautiful Lyrics' RomanizedLanguage type
function toRomanizedLanguage(lang?: string): RomanizedLanguage | undefined {
	if (!lang) return undefined
	if (lang === "jpn" || lang === "ja") return "Japanese"
	if (lang === "cmn" || lang === "zh") return "Chinese"
	if (lang === "kor" || lang === "ko") return "Korean"
	return undefined
}

// Detect language from lyrics content when API doesn't provide it
function detectLanguageFromContent(response: any): RomanizedLanguage | undefined {
	const KanaTest    = /[\u3040-\u309F\u30A0-\u30FF]/
	const KoreanTest  = /[\uAC00-\uD7AF\u1100-\u11FF]/
	const ChineseTest = /[\u4E00-\u9FFF]/

	let hasCJK = false

	// Check Content (Line/Syllable synced lyrics)
	for (const group of response.Content ?? []) {
		if (group.Type !== "Vocal") continue
		const text = group.Text ?? ""
		if (KanaTest.test(text)) return "Japanese"
		if (KoreanTest.test(text)) return "Korean"
		if (ChineseTest.test(text)) hasCJK = true

		// Check syllables if present
		for (const s of group.Lead?.Syllables ?? []) {
			const t = s.Text ?? ""
			if (KanaTest.test(t)) return "Japanese"
			if (KoreanTest.test(t)) return "Korean"
			if (ChineseTest.test(t)) hasCJK = true
		}
	}

	// Check Lines (Static lyrics)
	for (const line of response.Lines ?? []) {
		const text = line.Text ?? ""
		if (KanaTest.test(text)) return "Japanese"
		if (KoreanTest.test(text)) return "Korean"
		if (ChineseTest.test(text)) hasCJK = true
	}

	return hasCJK ? "Chinese" : undefined
}

// Computes EndTime from the last item in a Content array
function getEndTime(content: any[]): number {
	if (!content || content.length === 0) return 0
	const last = content[content.length - 1]
	// For Syllable Vocal groups, EndTime is on Lead
	if (last.Type === "Vocal" && last.Lead) return last.Lead.EndTime ?? 0
	return last.EndTime ?? 0
}

export function adaptLyrics(response: any): TransformedLyrics {
	// Try API-provided language first, fall back to content detection
	let romanizedLanguage = response.IncludesRomanization
		? toRomanizedLanguage(response.Language ?? response.LanguageISO2)
		: undefined

	// If API didn't provide language info, detect from content
	if (!romanizedLanguage) {
		romanizedLanguage = detectLanguageFromContent(response)
	}

	console.log("[SpicyCardView] adaptLyrics:", {
		IncludesRomanization: response.IncludesRomanization,
		Language: response.Language,
		LanguageISO2: response.LanguageISO2,
		detectedLanguage: romanizedLanguage
	})

	const base = {
		NaturalAlignment: "Left" as const,
		Language: response.Language ?? "und",
		...(romanizedLanguage ? { RomanizedLanguage: romanizedLanguage } : {}),
	}

	if (response.Type === "Static") {
		return {
			...base,
			Type: "Static",
			Lines: response.Lines ?? [],
		}
	} else if (response.Type === "Line") {
		return {
			...base,
			Type: "Line",
			StartTime: response.StartTime ?? 0,
			EndTime: response.EndTime ?? getEndTime(response.Content ?? []),
			Content: response.Content ?? [],
		}
	} else if (response.Type === "Syllable") {
		return {
			...base,
			Type: "Syllable",
			StartTime: response.StartTime ?? 0,
			EndTime: response.EndTime ?? getEndTime(response.Content ?? []),
			Content: response.Content ?? [],
		}
	}

	throw new Error(`[SpicyCardView] Unknown lyrics type: ${response.Type}`)
}

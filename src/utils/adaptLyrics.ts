import { TransformedLyrics, RomanizedLanguage } from '../types/Lyrics'

// Maps Spicy Lyrics language codes to Beautiful Lyrics' RomanizedLanguage type
function toRomanizedLanguage(lang?: string): RomanizedLanguage | undefined {
	if (!lang) return undefined
	if (lang === "jpn" || lang === "ja") return "Japanese"
	if (lang === "cmn" || lang === "zh") return "Chinese"
	if (lang === "kor" || lang === "ko") return "Korean"
	return undefined
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
	const romanizedLanguage = response.IncludesRomanization
		? toRomanizedLanguage(response.Language ?? response.LanguageISO2)
		: undefined

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

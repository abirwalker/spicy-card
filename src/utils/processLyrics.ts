// Client-side romanization — mirrors Spicy Lyrics' ProcessLyrics.ts exactly.
// All packages loaded from Spicy Lyrics' public CDN (pkgs.spikerko.org).
// DO NOT use npm packages for romanization — they are Node.js only and won't work in browser.

import Kuroshiro from 'kuroshiro'
import * as KuromojiAnalyzer from './KuromojiAnalyzer'

const AROMANIZE_URL = "https://pkgs.spikerko.org/aromanize/aromanize@1.0.0.js"
const PINYIN_URL    = "https://pkgs.spikerko.org/pinyin/pinyin@4.0.0.mjs"

const KanaTest    = /[\u3040-\u309F\u30A0-\u30FF]/  // hiragana/katakana
const KoreanTest  = /[\uAC00-\uD7AF\u1100-\u11FF]/  // hangul
const ChineseTest = /[\u4E00-\u9FFF]/               // CJK

// Kuroshiro — init once, reuse
const romajiConverter = new Kuroshiro()
const romajiReady = romajiConverter.init(KuromojiAnalyzer)

export function detectCJKLanguage(response: any): "Japanese" | "Korean" | "Chinese" | undefined {
	let hasCJK = false

	for (const group of response.Content ?? []) {
		if (group.Type !== "Vocal") continue

		for (const s of group.Lead?.Syllables ?? []) {
			const t: string = s.Text ?? ""
			if (KanaTest.test(t))    return "Japanese"
			if (KoreanTest.test(t))  return "Korean"
			if (ChineseTest.test(t)) hasCJK = true
		}

		for (const bg of group.Background ?? []) {
			for (const s of bg.Syllables ?? []) {
				const t: string = s.Text ?? ""
				if (KanaTest.test(t))    return "Japanese"
				if (KoreanTest.test(t))  return "Korean"
				if (ChineseTest.test(t)) hasCJK = true
			}
		}

		const lt: string = group.Text ?? ""
		if (KanaTest.test(lt))    return "Japanese"
		if (KoreanTest.test(lt))  return "Korean"
		if (ChineseTest.test(lt)) hasCJK = true
	}

	for (const line of response.Lines ?? []) {
		const t: string = line.Text ?? ""
		if (KanaTest.test(t))    return "Japanese"
		if (KoreanTest.test(t))  return "Korean"
		if (ChineseTest.test(t)) hasCJK = true
	}

	return hasCJK ? "Chinese" : undefined
}

async function romanize(text: string, language: "Japanese" | "Korean" | "Chinese"): Promise<string> {
	if (!text.trim()) return text

	if (language === "Japanese") {
		await romajiReady
		return romajiConverter.convert(text, { to: "romaji", mode: "spaced" })
	}

	if (language === "Korean") {
		const url = AROMANIZE_URL
		const pkg = await import(url) as any
		return pkg.default(text, "RevisedRomanizationTransliteration")
	}

	if (language === "Chinese") {
		const url = PINYIN_URL
		const pkg = await import(url) as any
		const result = pkg.pinyin(text, { segment: false, group: true })
		return Array.isArray(result) ? result.join("-") : result
	}

	return text
}

export async function processRomanization(response: any): Promise<void> {
	const language = detectCJKLanguage(response)
	if (!language) return

	const promises: Promise<void>[] = []

	for (const group of response.Content ?? []) {
		if (group.Type !== "Vocal") continue

		for (const s of group.Lead?.Syllables ?? []) {
			promises.push(romanize(s.Text, language).then(r => { s.RomanizedText = r }))
		}

		for (const bg of group.Background ?? []) {
			for (const s of bg.Syllables ?? []) {
				promises.push(romanize(s.Text, language).then(r => { s.RomanizedText = r }))
			}
		}

		if (group.Text !== undefined) {
			promises.push(romanize(group.Text, language).then(r => { group.RomanizedText = r }))
		}
	}

	for (const line of response.Lines ?? []) {
		if (line.Text !== undefined) {
			promises.push(romanize(line.Text, language).then(r => { line.RomanizedText = r }))
		}
	}

	await Promise.all(promises)
}

export function prewarmKuroshiro(): void {
	romajiReady.catch(() => {})
}

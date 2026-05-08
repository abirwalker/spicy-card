declare module 'kuroshiro' {
	interface ConvertOptions {
		to?: "hiragana" | "katakana" | "romaji"
		mode?: "normal" | "spaced" | "okurigana" | "furigana"
		romajiSystem?: "nippon" | "passport" | "hepburn"
		delimiter_start?: string
		delimiter_end?: string
	}

	class Kuroshiro {
		init(analyzer: any): Promise<void>
		convert(str: string, options?: ConvertOptions): Promise<string>
		static Util: {
			isHiragana(ch: string): boolean
			isKatakana(ch: string): boolean
			isKana(ch: string): boolean
			isKanji(ch: string): boolean
			isJapanese(ch: string): boolean
			hasHiragana(str: string): boolean
			hasKatakana(str: string): boolean
			hasKana(str: string): boolean
			hasKanji(str: string): boolean
			hasJapanese(str: string): boolean
			kanaToHiragna(str: string): string
			kanaToKatakana(str: string): string
			kanaToRomaji(str: string, system: string): string
		}
	}

	export default Kuroshiro
}

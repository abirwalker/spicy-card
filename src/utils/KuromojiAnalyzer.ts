// Adapted from spicy-lyrics/src/utils/Lyrics/KuromojiAnalyzer.ts
// Uses Spicy Lyrics' public CDN — same approach, same URLs.

const KUROMOJI_URL = "https://pkgs.spikerko.org/Kuromoji/Kuromoji@1.0.0.js"
const KUROMOJI_DIC = "https://kuromoji.pkgs.spikerko.org"

loadKuromoji().catch(() => {})

async function loadKuromoji(): Promise<void> {
	if ((window as any).kuromoji) return
	const url = KUROMOJI_URL
	await import(url)
	while (!(window as any).kuromoji) {
		await new Promise(r => setTimeout(r, 50))
	}
}

let analyzer: any

export const init = (): Promise<void> => {
	if (analyzer !== undefined) return Promise.resolve()
	return new Promise(async (resolve, reject) => {
		try {
			await loadKuromoji();
			(window as any).kuromoji.builder({ dicPath: KUROMOJI_DIC }).build((err: any, built: any) => {
				if (err) return reject(err)
				analyzer = built
				resolve()
			})
		} catch (err) {
			reject(err)
		}
	})
}

export const parse = (text = ""): Promise<any[]> => {
	if (!text.trim() || !analyzer) return Promise.resolve([])
	return Promise.resolve(analyzer.tokenize(text))
}

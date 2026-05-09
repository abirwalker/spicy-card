import { RomanizedLanguage } from '../types/Lyrics'
import { Signal } from './Signal'

// Simple localStorage-backed store
function GetInstantStore<T extends object>(key: string, _version: number, defaults: T) {
	let items: T
	try {
		const raw = Spicetify.LocalStorage.get(key)
		items = raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
	} catch {
		items = { ...defaults }
	}

	return {
		Items: items,
		SaveChanges() {
			try {
				Spicetify.LocalStorage.set(key, JSON.stringify(items))
			} catch (e) {
				console.warn('[SpicyCardView] Failed to save store:', e)
			}
		}
	}
}

export const Store = GetInstantStore<{
	CardLyricsVisible: boolean
	RomanizedLanguages: { [key in RomanizedLanguage]: boolean }
}>(
	"SpicyCard/LyricViews", 1,
	{
		CardLyricsVisible: false,
		RomanizedLanguages: { Chinese: false, Japanese: false, Korean: false }
	}
)

const LanguageRomanizationChangedSignal = new Signal<(language: string, isRomanized: boolean) => void>()
export const LanguageRomanizationChanged = LanguageRomanizationChangedSignal.GetEvent()

export const CreateElement = <E = HTMLElement>(text: string) => {
	const element = document.createElement("div")
	element.innerHTML = text
	return element.firstElementChild as E
}

export const ToggleLanguageRomanization = (language: RomanizedLanguage, isRomanized: boolean) => {
	if (Store.Items.RomanizedLanguages[language] !== isRomanized) {
		Store.Items.RomanizedLanguages[language] = isRomanized
		// Don't persist romanization — it resets per song
		LanguageRomanizationChangedSignal.Fire(language, isRomanized)
	}
}

// Called on every song change to ensure lyrics always start in original state
export const ResetRomanization = () => {
	const languages: RomanizedLanguage[] = ["Chinese", "Japanese", "Korean"]
	for (const lang of languages) {
		if (Store.Items.RomanizedLanguages[lang]) {
			Store.Items.RomanizedLanguages[lang] = false
			LanguageRomanizationChangedSignal.Fire(lang, false)
		}
	}
}

export const IsLanguageRomanized = (language: RomanizedLanguage): boolean => {
	return (Store.Items.RomanizedLanguages[language] === true)
}

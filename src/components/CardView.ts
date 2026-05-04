// Adapted from Beautiful Lyrics Card/mod.ts
// Changes: accepts TransformedLyrics as constructor param, removed "Open Page" button,
//          removed SpotifyHistory dependency, removed SongLyrics global import

import { Maid, Giveable } from '../utils/Maid'
import { TransformedLyrics, RomanizedLanguage } from '../types/Lyrics'
import LyricsRenderer from '../modules/LyricsRenderer/index'
import {
	CreateElement,
	ToggleLanguageRomanization, IsLanguageRomanized, LanguageRomanizationChanged,
	Store
} from '../utils/Shared'

const CardContainer = `
	<div id="SpicyCard-CardView" style="">
		<div class="Header" data-encore-id="type">
			<div class="Title">Lyrics</div>
		</div>
	</div>
`
const ShowLyricsButton = `<button class="ShowLyrics">Show lyrics</button>`
const RomanizationIcons = {
	Disabled: `
		<svg role="img" height="17" width="17" aria-hidden="true" viewBox="0 0 125.45 131.07" data-encore-id="icon" class="Svg-sc-ytk21e-0 Svg-img-16-icon">
			<path class="cls-1" d="m53.38,130.41c-12.54-2.87-20.86-14.36-19.98-27.42.59-7.62,5.8-15.12,13.07-18.69,4.28-2.11,11.02-3.4,17.75-3.46h4.8v-12.71c.06-16,.64-17.99,5.98-20.74,4.86-2.46,10.96-.47,13.3,4.34,1.17,2.34,1.23,3.52,1.23,17.23v14.65l2.81,1.05c13.59,5.1,30.59,17.87,32.34,24.38,1.17,4.34-.88,8.79-4.92,10.72-4.1,1.93-5.63,1.41-13.89-5.27-4.69-3.69-12.83-9.02-15.29-9.96-.88-.29-1.05,0-1.05,1.64,0,2.93-1.58,8.5-3.34,11.78-1.93,3.46-6.74,8.03-10.43,9.79-6.21,2.99-15.88,4.16-22.38,2.7v-.03Zm11.84-20.51c1.05-.47,2.4-1.46,2.87-2.29,1-1.52,1.41-5.39.7-6.15-.64-.59-12.66-.18-13.95.53-1.23.64-1.46,4.92-.29,6.45,1.82,2.34,6.86,3.05,10.66,1.46h0Z"></path>
			<path class="cls-1" d="m6.33,103.4c-4.39-1.99-6.91-6.04-6.21-9.9.23-1.11,2.23-4.8,4.51-8.32,7.21-11.19,17.64-31.23,18.98-36.56l.35-1.46h-8.67c-7.62,0-8.91-.18-10.66-1.17-2.99-1.76-4.34-3.93-4.34-6.91,0-3.52,1.64-6.04,5.1-7.73,2.81-1.41,3.4-1.46,13.89-1.46h10.96l.64-3.93c.35-2.23,1.05-6.86,1.58-10.43,1-7.21,1.93-9.79,4.22-12.19,2.34-2.46,4.39-3.34,7.85-3.34,5.74,0,9.26,3.34,9.26,8.79,0,1.46-.64,5.8-1.46,9.67-.76,3.87-1.46,7.27-1.46,7.56,0,.94,2.99-.29,7.97-3.28,6.04-3.57,9.32-4.22,12.42-2.23,4.51,2.81,4.92,10.84.82,16.35-2.7,3.63-10.9,6.33-20.92,6.91l-6.45.35-1.99,5.33c-3.63,9.67-9.43,22.73-15.35,34.34-6.74,13.3-9.43,17.64-11.72,18.98-2.46,1.46-6.86,1.76-9.32.64h0Z"></path>
			<path class="cls-1" d="m109.17,57.17c-11.19-4.69-29.82-13.3-30.88-14.24-4.69-4.22-3.46-12.42,2.17-15.12,4.28-1.99,6.56-1.29,24.9,7.73,15.12,7.38,16.88,8.44,18.34,10.61,1.99,2.87,2.34,6.8.76,9.2-1.29,1.99-5.21,3.81-8.26,3.81-1.35,0-4.34-.88-7.03-1.99Z"></path>
		</svg>
	`.trim(),
	Enabled: `
		<svg role="img" height="20" width="20" aria-hidden="true" viewBox="0 0 750 900" data-encore-id="icon" class="Svg-sc-ytk21e-0 Svg-img-16-icon">
			<path class="cls-1" d="m529.42,632.32H214.71l-81.89,163.5H13.31L377.06,80.35l350.9,715.47h-121.41l-77.13-163.5Zm-45.23-95.48l-109.03-228.9-114.27,228.9h223.3Z"></path>
		</svg>
	`.trim()
}
// "Open Page" button removed — no page view in this extension
const ExpandedControls = `
	<div class="Controls">
		<button id="Romanize" class="ViewControl"></button>
		<button id="Close" class="ViewControl">
			<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" class="Svg-sc-ytk21e-0 Svg-img-16-icon"><path d="M1.47 1.47a.75.75 0 0 1 1.06 0L8 6.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L9.06 8l5.47 5.47a.75.75 0 1 1-1.06 1.06L8 9.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L6.94 8 1.47 2.53a.75.75 0 0 1 0-1.06z"></path></svg>
		</button>
	</div>
`.trim()
const LyricsContainer = `<div class="LyricsContent"><div class="ContentContainer"></div></div>`

export default class CardView implements Giveable {
	private readonly Maid = new Maid()
	private readonly Container: HTMLDivElement
	private readonly Header: HTMLDivElement
	private readonly ShowLyricsButton: HTMLButtonElement
	private readonly ExpandedControls: {
		Container: HTMLDivElement
		RomanizeButton: HTMLButtonElement
		CloseButton: HTMLButtonElement
	}
	private readonly RomanizeTooltip: any
	private readonly LyricsContainer: HTMLDivElement
	private readonly LyricsContentContainer: HTMLDivElement
	private readonly TransformedLyrics: TransformedLyrics

	constructor(insertAfter: HTMLDivElement, transformedLyrics: TransformedLyrics) {
		this.TransformedLyrics = transformedLyrics

		{
			this.Container = this.Maid.Give(CreateElement<HTMLDivElement>(CardContainer))
			this.Header = this.Container.querySelector<HTMLDivElement>(".Header")!
			this.ShowLyricsButton = this.Maid.Give(CreateElement<HTMLButtonElement>(ShowLyricsButton))

			const expandedControlsContainer = this.Maid.Give(CreateElement<HTMLDivElement>(ExpandedControls))
			this.ExpandedControls = {
				Container: expandedControlsContainer,
				RomanizeButton: expandedControlsContainer.querySelector<HTMLButtonElement>("#Romanize")!,
				CloseButton: expandedControlsContainer.querySelector<HTMLButtonElement>("#Close")!,
			}

			// Hide romanize button if no romanization available
			if (transformedLyrics.RomanizedLanguage === undefined) {
				this.ExpandedControls.RomanizeButton.remove()
			}

			this.LyricsContainer = this.Maid.Give(CreateElement<HTMLDivElement>(LyricsContainer))
			this.LyricsContentContainer = this.LyricsContainer.querySelector<HTMLDivElement>(".ContentContainer")!
		}

		// Tooltips (use Spicetify.Tippy if available)
		{
			const tippy = (Spicetify as any).Tippy
			const tippyProps = (Spicetify as any).TippyProps ?? {}

			if (tippy) {
				const closeTooltip = tippy(this.ExpandedControls.CloseButton, { ...tippyProps, content: "Close Lyrics" })
				this.Maid.Give(() => closeTooltip.destroy())

				if (transformedLyrics.RomanizedLanguage !== undefined) {
					const romanizeTooltip = tippy(this.ExpandedControls.RomanizeButton, { ...tippyProps, content: "Waiting For Update" })
					this.Maid.Give(() => romanizeTooltip.destroy())
					this.RomanizeTooltip = romanizeTooltip
				}
			}
		}

		// Romanization updates
		if (transformedLyrics.RomanizedLanguage !== undefined) {
			const SetContent = (isRomanized: boolean) => {
				if (this.RomanizeTooltip) {
					this.RomanizeTooltip.setContent(isRomanized ? "Disable Romanization" : "Enable Romanization")
				}
				this.ExpandedControls.RomanizeButton.innerHTML = (
					isRomanized ? RomanizationIcons.Enabled : RomanizationIcons.Disabled
				)
			}

			this.Maid.Give(
				LanguageRomanizationChanged.Connect((language, isRomanized) => {
					if (language === transformedLyrics.RomanizedLanguage) {
						SetContent(isRomanized)
						if (this.Maid.Has("LyricsRenderer")) this.CreateLyricsRenderer()
					}
				})
			)

			SetContent(IsLanguageRomanized(transformedLyrics.RomanizedLanguage))
		}

		// Button handlers
		{
			this.ShowLyricsButton.addEventListener("click", () => this.SetLyricsVisibility(true))
			this.ExpandedControls.CloseButton.addEventListener("click", () => this.SetLyricsVisibility(false))

			if (transformedLyrics.RomanizedLanguage !== undefined) {
				const romanizedLanguage = transformedLyrics.RomanizedLanguage
				this.ExpandedControls.RomanizeButton.addEventListener("click", () =>
					ToggleLanguageRomanization(romanizedLanguage, !IsLanguageRomanized(romanizedLanguage))
				)
			}
		}

		// Force reset button styles that Spotify's global CSS overrides
		this.ForceButtonStyles()
		this.ReactToLyricsVisibility()
		insertAfter.after(this.Container)
	}

	private ForceButtonStyles() {
		// Spotify's global CSS overrides button backgrounds — force reset via inline styles
		const resetBtn = (el: HTMLElement) => {
			el.style.setProperty('background', 'transparent', 'important')
			el.style.setProperty('background-color', 'transparent', 'important')
			el.style.setProperty('border', 'none', 'important')
			el.style.setProperty('-webkit-appearance', 'none', 'important')
			el.style.setProperty('appearance', 'none', 'important')
			el.style.setProperty('box-shadow', 'none', 'important')
		}
		resetBtn(this.ExpandedControls.CloseButton)
		if (this.ExpandedControls.RomanizeButton.isConnected) {
			resetBtn(this.ExpandedControls.RomanizeButton)
		}
		// ShowLyrics button needs border preserved but background reset
		this.ShowLyricsButton.style.setProperty('background', 'transparent', 'important')
		this.ShowLyricsButton.style.setProperty('background-color', 'transparent', 'important')
		this.ShowLyricsButton.style.setProperty('-webkit-appearance', 'none', 'important')
		this.ShowLyricsButton.style.setProperty('appearance', 'none', 'important')
	}

	private SetLyricsVisibility(visible: boolean) {
		Store.Items.CardLyricsVisible = visible
		this.ReactToLyricsVisibility()
		Store.SaveChanges()
	}

	private CreateLyricsRenderer() {
		this.Maid.Give(
			new LyricsRenderer(
				this.LyricsContentContainer,
				this.TransformedLyrics,
				(this.TransformedLyrics.RomanizedLanguage === undefined)
					? false
					: IsLanguageRomanized(this.TransformedLyrics.RomanizedLanguage)
			),
			"LyricsRenderer"
		)
	}

	private ReactToLyricsVisibility() {
		const isVisible = Store.Items.CardLyricsVisible
		const visibleHeaderElement = isVisible ? this.ExpandedControls.Container : this.ShowLyricsButton
		this.Header.appendChild(visibleHeaderElement)
		this.Maid.Give(() => visibleHeaderElement.remove(), "VisibleHeaderElement")

		if (isVisible) {
			this.CreateLyricsRenderer()
			this.Container.appendChild(this.LyricsContainer)
		} else {
			this.LyricsContainer.remove()
			this.Maid.Clean("LyricsRenderer")
		}
	}

	public Destroy() {
		this.Maid.Destroy()
	}
}

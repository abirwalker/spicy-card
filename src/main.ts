// Spicy Card View — main orchestrator
// Adapted from Beautiful Lyrics LyricViews/mod.ts
// Removed: page view routing, fullscreen button, WebGL background, analytics, playbar buttons

import './styles/CardView.scss'
import './styles/Lyrics.scss'
import './styles/simplebar.css'

import { Maid } from './utils/Maid'
import { Defer } from './utils/Scheduler'
import { CreateElement } from './utils/Shared'
import { fetchAndAdaptLyrics } from './utils/fetchLyrics'
import CardView from './components/CardView'

// Load SpicyLyrics font
const fontLink = document.createElement('link')
fontLink.rel = 'stylesheet'
fontLink.type = 'text/css'
fontLink.href = 'https://fonts.spikerko.org/spicy-lyrics/source.css'
document.head.appendChild(fontLink)

// DOM selectors
const RightSidebar = ".Root__right-sidebar"
const ContentsContainer = "aside, section.main-buddyFeed-container"
// Explicitly avoid matching the spicy-dynamic-bg canvas injected by other extensions
const CardInsertAnchor = ".main-nowPlayingView-nowPlayingWidget"
const CardInsertAnchorFallback = ".main-nowPlayingView-coverArtContainer"
const SpotifyCardViewQuery = ".main-nowPlayingView-section:not(:is(#SpicyCard-CardView)):has(.main-nowPlayingView-lyricsTitle)"

const LoadingLyricsCard = `<div class="LoadingLyricsCard Loading"></div>`

const GlobalMaid = new Maid()

const getCurrentTrackId = (): string | null => {
	const uri = Spicetify.Player.data?.item?.uri
	if (!uri || !uri.startsWith("spotify:track:")) return null
	return uri.split(":")[2] ?? null
}

const isStreamedTrack = (): boolean => {
	const item = Spicetify.Player.data?.item
	if (!item) return false
	const type = item.type
	const provider = (item as any).provider ?? ""
	// Exclude DJ, podcasts, local files, videos
	if (type === "unknown" && provider.startsWith("narration")) return false
	if (type !== "track") return false
	if ((item.metadata as any)?.is_local === "true") return false
	return true
}

const waitForSpicetify = (): Promise<void> => {
	return new Promise((resolve) => {
		const check = () => {
			if (
				Spicetify?.Player &&
				Spicetify?.LocalStorage &&
				Spicetify?.CosmosAsync
			) {
				resolve()
			} else {
				setTimeout(check, 100)
			}
		}
		check()
	})
}

async function init() {
	await waitForSpicetify()

	let sidebar: HTMLDivElement
	let contentsContainer: HTMLDivElement | undefined

	const contentsContainerMaid = GlobalMaid.Give(new Maid())
	const nowPlayingViewMaid = GlobalMaid.Give(new Maid())

	const CheckForNowPlaying = () => {
		nowPlayingViewMaid.CleanUp()

		// Try primary anchor first, then fallback
		const cardAnchor = (
			contentsContainer!.querySelector<HTMLDivElement>(CardInsertAnchor)
			?? contentsContainer!.querySelector<HTMLDivElement>(CardInsertAnchorFallback)
		)
		if (cardAnchor === null) return

		// Suppress Spotify's native lyrics card
		const cardContainer = cardAnchor.parentElement!
		const CheckForNativeLyricsCard = () => {
			const nativeCard = cardContainer.querySelector<HTMLDivElement>(SpotifyCardViewQuery)
			if (nativeCard !== null) nativeCard.style.display = "none"
		}
		CheckForNativeLyricsCard()
		const containerObserver = nowPlayingViewMaid.Give(new MutationObserver(CheckForNativeLyricsCard))
		containerObserver.observe(cardContainer, { childList: true })

		// Handle song changes
		let currentFetchId = 0

		const onSongChange = async () => {
			nowPlayingViewMaid.Clean("Card")

			if (!isStreamedTrack()) return

			const trackId = getCurrentTrackId()
			if (!trackId) return

			// Show loading placeholder
			const loadingCard = nowPlayingViewMaid.Give(
				CreateElement<HTMLDivElement>(LoadingLyricsCard), "Card"
			)
			cardAnchor.after(loadingCard)

			const fetchId = ++currentFetchId
			const lyrics = await fetchAndAdaptLyrics(trackId)

			// Discard stale results if track changed during fetch
			if (fetchId !== currentFetchId) return

			nowPlayingViewMaid.Clean("Card")

			if (lyrics) {
				nowPlayingViewMaid.Give(new CardView(cardAnchor, lyrics), "Card")
			}
		}

		nowPlayingViewMaid.Give(() => { currentFetchId++ }) // Cancel any in-flight fetch on cleanup

		Spicetify.Player.addEventListener("songchange", onSongChange)
		nowPlayingViewMaid.Give(() => Spicetify.Player.removeEventListener("songchange", onSongChange))

		// Trigger immediately for the current song
		onSongChange()
	}

	const DeferCheckForNowPlaying = () =>
		GlobalMaid.Give(Defer(CheckForNowPlaying), "CheckForNowPlaying")

	const CheckForContentsContainer = () => {
		contentsContainerMaid.CleanUp()
		nowPlayingViewMaid.CleanUp()

		contentsContainer = (sidebar.querySelector<HTMLDivElement>(ContentsContainer) ?? undefined)
		if (contentsContainer === undefined) return

		CheckForNowPlaying()

		// Re-check when song changes (NPV content may reload)
		Spicetify.Player.addEventListener("songchange", DeferCheckForNowPlaying)
		contentsContainerMaid.Give(() =>
			Spicetify.Player.removeEventListener("songchange", DeferCheckForNowPlaying)
		)
	}

	const DeferCheckForContentsContainer = () =>
		GlobalMaid.Give(Defer(CheckForContentsContainer), "CheckForContentsContainer")

	const CheckForSidebar = () => {
		const newSidebar = document.querySelector<HTMLDivElement>(RightSidebar)
		if (newSidebar === null) {
			GlobalMaid.Give(Defer(CheckForSidebar), "CheckForSidebar")
			return
		}
		sidebar = newSidebar

		const sidebarChildObserver = GlobalMaid.Give(new MutationObserver(DeferCheckForContentsContainer))
		CheckForContentsContainer()

		sidebarChildObserver.observe(sidebar, { childList: true })
		for (const element of sidebar.children) {
			if (
				(element instanceof HTMLDivElement)
				&& ((element.children.length === 0) || (element.querySelector(ContentsContainer) !== null))
			) {
				sidebarChildObserver.observe(element, { childList: true })
			}
		}
	}

	CheckForSidebar()
}

init()

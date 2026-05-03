import SimpleBar from 'simplebar'
import { Maid, Giveable } from '../../utils/Maid'
import { Timeout, Defer } from '../../utils/Scheduler'
import { BaseVocals, SyncedVocals } from './Types.d'

type VocalGroup<V extends (BaseVocals | SyncedVocals)> = {
	GroupContainer: HTMLDivElement | HTMLButtonElement
	Vocals: V[]
}
export type VocalGroups<V extends (BaseVocals | SyncedVocals)> = VocalGroup<V>[]

const DistanceToMaximumBlur = 4
const BlurScale = 1.25
const UserScrollingStopsAfter = 0.75
const AutoScrollingStopsAfter = (1 / 30)

const GetTotalElementHeight = (element: HTMLElement): number => {
	const style = globalThis.getComputedStyle(element)
	return (element.offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom))
}

export class LyricsScroller<V extends (BaseVocals | SyncedVocals)> implements Giveable {
	private readonly Maid: Maid
	private readonly ScrollContainer: HTMLDivElement
	private readonly LyricsContainer: HTMLDivElement
	private readonly VocalGroups: VocalGroups<V>
	private readonly LyricsAreSynced: boolean
	private readonly Scroller: SimpleBar
	private readonly ScrollerObject: HTMLElement
	private GroupDimensions: { Height: number; Center: number }[] = []
	private AutoScrollBlocked: boolean = false
	private AutoScrolling: boolean = false
	private LastActiveVocalIndex: number = 0
	private LyricsEnded: boolean = false

	public constructor(
		scrollContainer: HTMLDivElement, lyricsContainer: HTMLDivElement,
		vocalGroups: VocalGroups<V>, lyricsAreSynced: boolean
	) {
		this.LyricsAreSynced = lyricsAreSynced
		this.Maid = new Maid()
		this.Scroller = new SimpleBar(scrollContainer)
		this.ScrollerObject = this.Scroller.getScrollElement()!
		this.Maid.Give(this.Scroller.unMount.bind(this.Scroller))
		this.ScrollContainer = scrollContainer
		this.LyricsContainer = lyricsContainer
		this.VocalGroups = vocalGroups

		this.WatchAutoScrollBlocking()

		const resizeObserver = this.Maid.Give(new ResizeObserver(() => {
			this.UpdateLyricHeights()
			if (lyricsAreSynced) this.MoveToActiveLyrics()
		}))
		resizeObserver.observe(this.ScrollContainer)
		this.UpdateLyricHeights()

		if (lyricsAreSynced) {
			this.HandleLyricActiveStateChanges()
			this.MoveToActiveLyrics(true)
		}
	}

	private ToggleAutoScrollBlock(blocked: boolean) {
		if (this.AutoScrollBlocked !== blocked) {
			if (blocked) { this.AutoScrollBlocked = true; this.ScrollContainer.classList.add("UserScrolling") }
			else { this.AutoScrollBlocked = false; this.ScrollContainer.classList.remove("UserScrolling") }
		}
	}

	private WatchAutoScrollBlocking() {
		const callback = () => {
			if (this.AutoScrolling === false) {
				this.ToggleAutoScrollBlock(true)
				this.Maid.Give(Timeout(UserScrollingStopsAfter, () => this.MoveToActiveLyrics()), "WaitForUserToStopScrolling")
			} else {
				this.Maid.Give(Timeout(AutoScrollingStopsAfter, () => this.AutoScrolling = false), "WaitForAutoScroll")
			}
		}
		this.ScrollerObject.addEventListener("scroll", callback)
		this.Maid.Give(() => this.ScrollerObject.removeEventListener("scroll", callback))
	}

	private HandleLyricActiveStateChanges() {
		for (const vocalGroup of this.VocalGroups as VocalGroups<SyncedVocals>) {
			for (const vocal of vocalGroup.Vocals) {
				this.Maid.Give(vocal.ActivityChanged.Connect(() => this.MoveToActiveLyrics(true)))
			}
		}
	}

	private UpdateLyricHeights() {
		this.GroupDimensions = []
		let totalHeight = 0
		for (const vocalGroup of this.VocalGroups) {
			const groupHeight = GetTotalElementHeight(vocalGroup.GroupContainer)
			this.GroupDimensions.push({ Height: (groupHeight / 2), Center: (totalHeight + (groupHeight / 2)) })
			totalHeight += groupHeight
		}
		this.LyricsContainer.style.height = `${totalHeight}px`
		this.Scroller.recalculate()
	}

	private DetermineLyricBlur() {
		let startIndex: number | undefined, endIndex: number | undefined
		const vocals = []
		for (const vocalGroup of (this.VocalGroups as VocalGroups<SyncedVocals>)) {
			for (const vocal of vocalGroup.Vocals) {
				if (vocal.IsActive()) {
					const vocalIndex = vocals.length
					if (startIndex === undefined) startIndex = vocalIndex
					endIndex = vocalIndex
				}
				vocals.push(vocal)
			}
		}
		if ((startIndex === undefined) || (endIndex === undefined)) {
			startIndex = this.LastActiveVocalIndex
			endIndex = startIndex
		} else {
			this.LastActiveVocalIndex = startIndex
		}
		for (const [index, vocal] of vocals.entries()) {
			const distance = Math.min(
				(index < startIndex! ? (startIndex! - index) : (index > endIndex! ? (index - endIndex!) : 0)),
				DistanceToMaximumBlur
			)
			vocal.SetBlur(distance * BlurScale)
		}
	}

	private MoveToActiveLyrics(redetermineBlur?: true) {
		if (this.LyricsAreSynced === false) return
		if (redetermineBlur) this.DetermineLyricBlur()
		if (this.AutoScrollBlocked && this.Scroller.isScrolling) return

		const lyricsContainerStyle = globalThis.getComputedStyle(this.LyricsContainer)
		const lyricsContainerMarginTop = parseInt(lyricsContainerStyle.marginTop!)
		const offset = (lyricsContainerStyle.getPropertyValue("--use-offset") === "1") ? parseInt(lyricsContainerStyle.lineHeight!) : 0
		const scrollViewportHeight = this.ScrollContainer.offsetHeight
		const viewportCenter = ((scrollViewportHeight / 2) - offset)
		const minimumDistanceToAutoScroll = (viewportCenter - lyricsContainerMarginTop)
		const currentScrollTop = this.ScrollerObject.scrollTop
		const maximumScrollTop = (this.ScrollerObject.scrollHeight - scrollViewportHeight)

		const activeVocalGroups = []
		for (const [index, vocalGroup] of (this.VocalGroups as VocalGroups<SyncedVocals>).entries()) {
			if (vocalGroup.Vocals.some(vocal => vocal.IsActive())) {
				activeVocalGroups.push({ Dimensions: this.GroupDimensions[index], Group: vocalGroup })
			}
		}

		if (activeVocalGroups.length === 0) {
			if ((this.AutoScrollBlocked === false) && this.LyricsEnded) {
				if (currentScrollTop < maximumScrollTop) this.ScrollTo(maximumScrollTop)
			}
			return
		}

		let center = 0, totalHalfHeight = 0
		for (const avg of activeVocalGroups) { totalHalfHeight += avg.Dimensions.Height; center += avg.Dimensions.Center }
		center /= activeVocalGroups.length

		let scrollY: number | undefined
		if (this.AutoScrollBlocked || (center > minimumDistanceToAutoScroll)) {
			if (this.AutoScrollBlocked) {
				if ((center >= (currentScrollTop - totalHalfHeight)) && (center <= (currentScrollTop + scrollViewportHeight))) {
					this.ToggleAutoScrollBlock(false)
					this.DetermineLyricBlur()
				}
			}
			if (this.AutoScrollBlocked === false) {
				scrollY = ((center - viewportCenter) + lyricsContainerMarginTop + offset)
			}
		} else if (currentScrollTop > 0) {
			scrollY = 0
		}

		if (scrollY !== undefined) this.ScrollTo(scrollY)
	}

	private ScrollTo(yPosition: number) {
		this.AutoScrolling = true
		this.ScrollerObject.scrollTop = yPosition
		this.Scroller.scrollY()
	}

	public SetLyricsEnded(ended: boolean) { this.LyricsEnded = ended }

	public ForceToActive(skippedByVocal?: true) {
		if (this.LyricsAreSynced === false) return
		this.ToggleAutoScrollBlock(false)
		if (skippedByVocal) {
			this.Maid.Clean("ForceToActiveCSS")
		} else {
			this.ScrollContainer.classList.add("InstantScroll")
			this.Maid.Give(Defer(() => this.ScrollContainer.classList.remove("InstantScroll")), "ForceToActiveCSS")
		}
		this.MoveToActiveLyrics()
	}

	public ForceToTop() { this.ToggleAutoScrollBlock(false); this.ScrollTo(0) }
	public Destroy() { this.Maid.Destroy() }
}

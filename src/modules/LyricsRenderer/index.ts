import { TransformedLyrics } from '../../types/Lyrics'
import { Maid, Giveable } from '../../utils/Maid'
import { OnPreRender } from '../../utils/Scheduler'
import { BaseVocals, SyncedVocals } from './Types.d'
import { LyricsScroller, VocalGroups } from './LyricsScroller'
import InterludeVisual from './Interlude'
import StaticVocals from './StaticVocals'
import LineVocals from './LineVocals'
import SyllableVocals from './SyllableVocals'

export default class LyricsRenderer implements Giveable {
	private Maid: Maid = new Maid()

	constructor(
		parentContainer: HTMLDivElement,
		transformedLyrics: TransformedLyrics,
		isRomanized: boolean
	) {
		const scrollContainer = this.Maid.Give(document.createElement("div"))
		scrollContainer.classList.add("LyricsScrollContainer")
		const lyricsContainer = this.Maid.Give(document.createElement("div"))
		lyricsContainer.classList.add("Lyrics")
		scrollContainer.appendChild(lyricsContainer)

		lyricsContainer.classList.add(`NaturallyAligned${transformedLyrics.NaturalAlignment}`)

		if (transformedLyrics.Type === "Static") {
			const lines: VocalGroups<BaseVocals> = []
			for (const line of transformedLyrics.Lines) {
				const lineContainer = this.Maid.Give(document.createElement("div"))
				lineContainer.classList.add("VocalsGroup")
				lines.push({
					GroupContainer: lineContainer,
					Vocals: [this.Maid.Give(new StaticVocals(lineContainer, line, isRomanized))]
				})
				lyricsContainer.appendChild(lineContainer)
			}
			this.Maid.Give(new LyricsScroller(scrollContainer, lyricsContainer, lines, false))
		} else {
			const vocalGroups: VocalGroups<SyncedVocals> = []
			const vocalGroupStartTimes: number[] = []

			if (transformedLyrics.Type === "Line") {
				for (const vocalGroup of transformedLyrics.Content) {
					const vocalGroupContainer = this.Maid.Give(document.createElement("button"))
					vocalGroupContainer.classList.add("VocalsGroup")

					if (vocalGroup.Type === "Vocal") {
						if (vocalGroup.OppositeAligned) vocalGroupContainer.classList.add("AlignedOpposite")
						vocalGroups.push({
							GroupContainer: vocalGroupContainer,
							Vocals: [this.Maid.Give(new LineVocals(vocalGroupContainer, vocalGroup, isRomanized))]
						})
						vocalGroupStartTimes.push(vocalGroup.StartTime)
					} else {
						vocalGroups.push({
							GroupContainer: vocalGroupContainer,
							Vocals: [this.Maid.Give(new InterludeVisual(vocalGroupContainer, vocalGroup))]
						})
						vocalGroupStartTimes.push(vocalGroup.StartTime)
					}
					lyricsContainer.appendChild(vocalGroupContainer)
				}
			} else {
				for (const vocalGroup of transformedLyrics.Content) {
					const vocalGroupContainer = this.Maid.Give(document.createElement("button"))
					vocalGroupContainer.classList.add("VocalsGroup")

					if (vocalGroup.Type === "Vocal") {
						if (vocalGroup.OppositeAligned) vocalGroupContainer.classList.add("AlignedOpposite")
						const vocals = []
						let startTime = vocalGroup.Lead.StartTime
						vocals.push(this.Maid.Give(new SyllableVocals(vocalGroupContainer, vocalGroup.Lead.Syllables, false, isRomanized)))
						if (vocalGroup.Background !== undefined) {
							for (const backgroundVocal of vocalGroup.Background) {
								startTime = Math.min(startTime, backgroundVocal.StartTime)
								vocals.push(this.Maid.Give(new SyllableVocals(vocalGroupContainer, backgroundVocal.Syllables, true, isRomanized)))
							}
						}
						vocalGroups.push({ GroupContainer: vocalGroupContainer, Vocals: vocals })
						vocalGroupStartTimes.push(startTime)
					} else {
						vocalGroups.push({
							GroupContainer: vocalGroupContainer,
							Vocals: [this.Maid.Give(new InterludeVisual(vocalGroupContainer, vocalGroup))]
						})
						vocalGroupStartTimes.push(vocalGroup.StartTime)
					}
					lyricsContainer.appendChild(vocalGroupContainer)
				}
			}

			const scroller = this.Maid.Give(new LyricsScroller(scrollContainer, lyricsContainer, vocalGroups, true))

			let justSkippedByVocal = false
			// Timestamp-driven animation loop
			let lastTimestamp = -1
			const animationLoop = () => {
				const currentTimestamp = (Spicetify.Player.getProgress() / 1000)
				const deltaTime = (lastTimestamp < 0) ? (1 / 60) : Math.min(currentTimestamp - lastTimestamp, 0.1)
				const skipped = (lastTimestamp >= 0 && Math.abs(currentTimestamp - lastTimestamp) > 0.5) ? true : undefined

				for (const vocalGroup of vocalGroups) {
					for (const vocal of vocalGroup.Vocals) {
						vocal.Animate(currentTimestamp, deltaTime, skipped)
					}
				}
				scroller.SetLyricsEnded(currentTimestamp >= transformedLyrics.EndTime)
				if (skipped) scroller.ForceToActive(justSkippedByVocal || undefined)
				if (skipped && justSkippedByVocal) justSkippedByVocal = false

				lastTimestamp = currentTimestamp
				this.Maid.Give(OnPreRender(animationLoop), "AnimationLoop")
			}
			this.Maid.Give(OnPreRender(animationLoop), "AnimationLoop")

			for (const [index, vocalGroup] of vocalGroups.entries()) {
				const startTime = vocalGroupStartTimes[index]
				for (const vocal of vocalGroup.Vocals) {
					vocal.RequestedTimeSkip.Connect(() => {
						justSkippedByVocal = true
						Spicetify.Player.seek(startTime * 1000)
					})
				}
			}
		}

		parentContainer.appendChild(scrollContainer)
	}

	public Destroy() {
		this.Maid.Destroy()
	}
}

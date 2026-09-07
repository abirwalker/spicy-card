import { easeSinOut } from 'd3-ease'
import { Maid, Giveable } from '../../utils/Maid'
import { Signal } from '../../utils/Signal'
import Spring from '../../utils/LegacySpring'
import { GetSpline, Clamp } from './SharedMethods'
import { LiveText, LyricState, SyncedVocals } from './Types.d'
import { SyllableList, SyllableMetadata } from '../../types/Lyrics'

type AnimatedLetter = {
	Start: number; Duration: number; GlowDuration: number; LiveText: LiveText
}
type AnimatedSyllable = {
	Start: number; Duration: number; StartScale: number; DurationScale: number; LiveText: LiveText
} & ({ Type: "Syllable" } | { Type: "Letters"; Letters: AnimatedLetter[] })

const ScaleRange = [{ Time: 0, Value: 0.97 }, { Time: 0.7, Value: 1.025 }, { Time: 1, Value: 1 }]
const LetterScaleRange = [{ Time: 0, Value: 0.97 }, { Time: 0.7, Value: 1.08 }, { Time: 1, Value: 1 }]
const YOffsetRange = [{ Time: 0, Value: (1 / 100) }, { Time: 0.9, Value: -(1 / 60) }, { Time: 1, Value: 0 }]
const LetterYOffsetRange = [{ Time: 0, Value: (1 / 100) }, { Time: 0.9, Value: -(1 / 56) }, { Time: 1, Value: 0 }]
const GlowRange = [{ Time: 0, Value: 0 }, { Time: 0.15, Value: 1 }, { Time: 0.6, Value: 1 }, { Time: 1, Value: 0 }]
const ScaleSpline = GetSpline(ScaleRange)
const LetterScaleSpline = GetSpline(LetterScaleRange)
const YOffsetSpline = GetSpline(YOffsetRange)
const LetterYOffsetSpline = GetSpline(LetterYOffsetRange)
const GlowSpline = GetSpline(GlowRange)

const YOffsetDamping = 0.4, YOffsetFrequency = 1.45
const ScaleDamping = 0.68, ScaleFrequency = 1.2
const GlowDamping = 0.56, GlowFrequency = 1.18

const CreateSprings = () => ({
	Scale: new Spring(0, ScaleDamping, ScaleFrequency),
	YOffset: new Spring(0, YOffsetDamping, YOffsetFrequency),
	Glow: new Spring(0, GlowDamping, GlowFrequency)
})

const MinimumEmphasizedDuration = 1
const MaximumEmphasizedCharacters = 12
const IsEmphasized = (metadata: SyllableMetadata, isRomanized: boolean) => (
	((metadata.EndTime - metadata.StartTime) >= MinimumEmphasizedDuration)
	&& ((isRomanized && metadata.RomanizedText || metadata.Text).length <= MaximumEmphasizedCharacters)
)

export default class SyllableVocals implements SyncedVocals, Giveable {
	private readonly Maid: Maid = new Maid()
	private readonly Container: HTMLDivElement
	private readonly StartTime: number
	private readonly Duration: number
	private readonly Syllables: AnimatedSyllable[] = []
	private State: LyricState = "Idle"
	private IsSleeping: boolean = true
	private CurrentBlur: number = -1

	private readonly ActivityChangedSignal = this.Maid.Give(new Signal<(isActive: boolean) => void>())
	private readonly RequestedTimeSkipSignal = this.Maid.Give(new Signal<() => void>())

	public readonly ActivityChanged = this.ActivityChangedSignal.GetEvent()
	public readonly RequestedTimeSkip = this.RequestedTimeSkipSignal.GetEvent()

	public constructor(lineContainer: HTMLElement, syllablesMetadata: SyllableList, isBackground: boolean, isRomanized: boolean) {
		const container = this.Maid.Give(document.createElement('div'))
		container.classList.add('Vocals', isBackground ? 'Background' : 'Lead')
		this.Container = container
		container.addEventListener('click', () => this.RequestedTimeSkipSignal.Fire())

		this.StartTime = syllablesMetadata[0].StartTime
		this.Duration = Math.max(0.05, syllablesMetadata[syllablesMetadata.length - 1].EndTime - this.StartTime)

		const syllableGroups: SyllableList[] = []
		{
			let currentGroup: SyllableList = []
			for (const s of syllablesMetadata) {
				currentGroup.push(s)
				if (s.IsPartOfWord === false) { syllableGroups.push(currentGroup); currentGroup = [] }
			}
			if (currentGroup.length > 0) syllableGroups.push(currentGroup)
		}

		for (const group of syllableGroups) {
			let parentElement: HTMLElement = container
			const count = group.length
			const isInWordGroup = (count > 1)
			if (isInWordGroup) {
				const parent = this.Maid.Give(document.createElement('span'))
				parent.classList.add('Word')
				parentElement = parent
				container.appendChild(parent)
			}

			for (const [index, meta] of group.entries()) {
				const isEmphasized = IsEmphasized(meta, isRomanized)
				const span = this.Maid.Give(document.createElement('span'))
				span.classList.add('Lyric', 'Syllable')
				if (isEmphasized) span.classList.add('Emphasis')
				else span.classList.add('Synced')

				const isEndOfWord = (isInWordGroup && (index === (count - 1)))
				if (meta.IsPartOfWord) {
					span.classList.add('PartOfWord')
					if (index === 0) span.classList.add('StartOfWord')
					else if (isEndOfWord) span.classList.add('EndOfWord')
				} else if (isEndOfWord) span.classList.add('EndOfWord')

				let letters: AnimatedLetter[] | undefined
				if (isEmphasized) {
					const letterTexts = [...(isRomanized && meta.RomanizedText || meta.Text)]
					const relativeTimestep = (1 / letterTexts.length)
					letters = []
					let relativeTimestamp = 0
					for (const letter of letterTexts) {
						const letterSpan = this.Maid.Give(document.createElement('span'))
						letterSpan.classList.add('Letter', 'Synced')
						letterSpan.innerText = letter
						span.appendChild(letterSpan)
						letters.push({ Start: relativeTimestamp, Duration: relativeTimestep, GlowDuration: (1 - relativeTimestamp), LiveText: { Object: letterSpan, Springs: CreateSprings() } })
						relativeTimestamp += relativeTimestep
					}
				} else {
					span.innerText = (isRomanized && meta.RomanizedText || meta.Text)
				}

				const relativeStart = Math.max(0, meta.StartTime - this.StartTime)
				const relativeEnd = Math.max(relativeStart + 0.05, meta.EndTime - this.StartTime)
				const relativeStartScale = (relativeStart / this.Duration)
				const relativeEndScale = (relativeEnd / this.Duration)
				const duration = (relativeEnd - relativeStart)
				const durationScale = Math.max(0.0001, relativeEndScale - relativeStartScale)
				const syllableLiveText = { Object: span, Springs: CreateSprings() }

				if (isEmphasized) {
					this.Syllables.push({ Type: "Letters", Start: relativeStart, Duration: duration, StartScale: relativeStartScale, DurationScale: durationScale, LiveText: syllableLiveText, Letters: letters! })
				} else {
					this.Syllables.push({ Type: "Syllable", Start: relativeStart, Duration: duration, StartScale: relativeStartScale, DurationScale: durationScale, LiveText: syllableLiveText })
				}
				parentElement.appendChild(span)
			}
		}

		this.SetToGeneralState(false)
		lineContainer.appendChild(container)
	}

	private UpdateLiveTextState = (liveText: LiveText, isEmphasized: boolean, timeScale: number, glowTimeScale: number, forceTo?: true) => {
		const scale = (isEmphasized ? LetterScaleSpline : ScaleSpline).at(timeScale)
		const yOffset = (isEmphasized ? LetterYOffsetSpline : YOffsetSpline).at(timeScale)
		const glowAlpha = GlowSpline.at(glowTimeScale)
		if (forceTo) { liveText.Springs.Scale.Set(scale); liveText.Springs.YOffset.Set(yOffset); liveText.Springs.Glow.Set(glowAlpha) }
		else { liveText.Springs.Scale.Final = scale; liveText.Springs.YOffset.Final = yOffset; liveText.Springs.Glow.Final = glowAlpha }
	}

	private UpdateLiveTextVisuals = (liveText: LiveText, isEmphasized: boolean, timeScale: number, deltaTime: number): boolean => {
		const scale = liveText.Springs.Scale.Update(deltaTime)
		const yOffset = liveText.Springs.YOffset.Update(deltaTime)
		const glowAlpha = liveText.Springs.Glow.Update(deltaTime)

		const progress = Math.round((-20 + (120 * timeScale)) * 2) / 2
		if (liveText.LastProgress !== progress) {
			liveText.LastProgress = progress
			liveText.Object.style.setProperty("--gradient-progress", `${progress}%`)
		}

		const roundedY = Math.round(yOffset * (isEmphasized ? 2 : 1) * 10000) / 10000
		const roundedScale = Math.round(scale * 1000) / 1000
		const transformStr = `translate3d(0, ${roundedY}em, 0) scale(${roundedScale})`
		if (liveText.LastTransform !== transformStr) {
			liveText.LastTransform = transformStr
			liveText.Object.style.transform = transformStr
		}

		const shadowOpacity = Math.round((glowAlpha * (isEmphasized ? 100 : 35)) / 2) * 2
		if (liveText.LastShadowOpacity !== shadowOpacity) {
			liveText.LastShadowOpacity = shadowOpacity
			liveText.Object.style.setProperty("--text-shadow-opacity", `${shadowOpacity}%`)
		}

		const blurRadius = Math.round((4 + (2 * glowAlpha * (isEmphasized ? 3 : 1))) * 2) / 2
		if (liveText.LastBlurRadius !== blurRadius) {
			liveText.LastBlurRadius = blurRadius
			liveText.Object.style.setProperty("--text-shadow-blur-radius", `${blurRadius}px`)
		}

		return (liveText.Springs.Scale.IsSleeping() && liveText.Springs.YOffset.IsSleeping() && liveText.Springs.Glow.IsSleeping())
	}

	private EvaluateClassState() {
		const removeClasses = ["Active", "Sung"]
		let classToAdd: string | undefined
		if (this.State === "Active") { removeClasses.splice(0, 1); classToAdd = "Active" }
		else if (this.State == "Sung") { removeClasses.splice(1, 1); classToAdd = "Sung" }
		for (const className of removeClasses) {
			if (this.Container.classList.contains(className)) this.Container.classList.remove(className)
		}
		if (classToAdd !== undefined) this.Container.classList.add(classToAdd)
	}

	private SetToGeneralState(state: boolean) {
		const timeScale = (state ? 1 : 0)
		for (const syllable of this.Syllables) {
			this.UpdateLiveTextState(syllable.LiveText, false, timeScale, timeScale, true)
			this.UpdateLiveTextVisuals(syllable.LiveText, false, timeScale, 0)
			if (syllable.Type === "Letters") {
				for (const letter of syllable.Letters) {
					this.UpdateLiveTextState(letter.LiveText, true, timeScale, timeScale, true)
					this.UpdateLiveTextVisuals(letter.LiveText, true, timeScale, 0)
				}
			}
		}
		this.State = (state ? "Sung" : "Idle")
		this.EvaluateClassState()
	}

	public Animate(songTimestamp: number, deltaTime: number, isImmediate?: true) {
		const relativeTime = (songTimestamp - this.StartTime)
		const timeScale = Clamp((relativeTime / this.Duration), 0, 1)
		const pastStart = (relativeTime >= 0), beforeEnd = (relativeTime <= this.Duration)
		const isActive = (pastStart && beforeEnd)
		const stateNow = isActive ? "Active" : pastStart ? "Sung" : "Idle"
		const stateChanged = (stateNow != this.State)
		const shouldUpdateVisualState = (stateChanged || isActive || isImmediate)

		if (stateChanged) {
			const oldState = this.State
			this.State = stateNow
			if (this.State !== "Sung") this.EvaluateClassState()
			if (oldState === "Active") this.ActivityChangedSignal.Fire(false)
			else if (isActive) this.ActivityChangedSignal.Fire(true)
		}
		if (shouldUpdateVisualState) this.IsSleeping = false

		const isMoving = (this.IsSleeping === false)
		if (shouldUpdateVisualState || isMoving) {
			let isSleeping = true
			for (const syllable of this.Syllables) {
				const syllableTimeScale = (syllable.DurationScale > 0)
					? Clamp(((timeScale - syllable.StartScale) / syllable.DurationScale), 0, 1)
					: (timeScale >= syllable.StartScale ? 1 : 0)
				if (syllable.Type == "Letters") {
					const timeAlpha = easeSinOut(syllableTimeScale)
					for (const letter of syllable.Letters) {
						const letterTime = (timeAlpha - letter.Start)
						const letterTimeScale = (letter.Duration > 0) ? Clamp((letterTime / letter.Duration), 0, 1) : 0
						const glowTimeScale = (letter.GlowDuration > 0) ? Clamp((letterTime / letter.GlowDuration), 0, 1) : 0
						if (shouldUpdateVisualState) this.UpdateLiveTextState(letter.LiveText, true, letterTimeScale, glowTimeScale, isImmediate)
						if (isMoving) { if (!this.UpdateLiveTextVisuals(letter.LiveText, true, letterTimeScale, deltaTime)) isSleeping = false }
					}
				}
				if (shouldUpdateVisualState) this.UpdateLiveTextState(syllable.LiveText, false, syllableTimeScale, syllableTimeScale, isImmediate)
				if (isMoving) { if (!this.UpdateLiveTextVisuals(syllable.LiveText, false, syllableTimeScale, deltaTime)) isSleeping = false }
			}
			if (isSleeping) {
				this.IsSleeping = true
				if (isActive === false) this.EvaluateClassState()
			}
		}
	}

	public ForceState(state: boolean) { this.SetToGeneralState(state) }
	public IsActive() { return (this.State === "Active") }
	public SetBlur(blurDistance: number) {
		const rounded = Math.round(blurDistance * 10) / 10
		if (this.CurrentBlur !== rounded) {
			this.CurrentBlur = rounded
			this.Container.style.setProperty('--text-blur', `${rounded}px`)
		}
	}
	public Destroy() { this.Maid.Destroy() }
}

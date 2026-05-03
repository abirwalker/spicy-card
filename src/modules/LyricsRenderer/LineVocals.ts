import { Maid, Giveable } from '../../utils/Maid'
import { Signal } from '../../utils/Signal'
import Spring from '../../utils/LegacySpring'
import { GetSpline, Clamp } from './SharedMethods'
import { SyncedVocals, LyricState } from './Types.d'
import { LineVocal } from '../../types/Lyrics'

const GlowRange = [
	{ Time: 0, Value: 0 },
	{ Time: 0.5, Value: 1 },
	{ Time: 0.925, Value: 1 },
	{ Time: 1, Value: 0 }
]
const GlowSpline = GetSpline(GlowRange)
const GlowDamping = 0.5
const GlowFrequency = 1

export default class LineVocals implements SyncedVocals, Giveable {
	private readonly Maid: Maid = new Maid()
	private readonly Container: HTMLDivElement
	private readonly StartTime: number
	private readonly Duration: number
	private readonly Span: HTMLSpanElement
	private readonly GlowSpring: Spring
	private State: LyricState = "Idle"
	private IsSleeping: boolean = true

	private readonly ActivityChangedSignal = this.Maid.Give(new Signal<(isActive: boolean) => void>())
	private readonly RequestedTimeSkipSignal = this.Maid.Give(new Signal<() => void>())

	public readonly ActivityChanged = this.ActivityChangedSignal.GetEvent()
	public readonly RequestedTimeSkip = this.RequestedTimeSkipSignal.GetEvent()

	public constructor(lineContainer: HTMLElement, lineMetadata: LineVocal, isRomanized: boolean) {
		const container = this.Maid.Give(document.createElement('div'))
		container.classList.add('Vocals', 'Lead')
		this.Container = container

		container.addEventListener('click', () => this.RequestedTimeSkipSignal.Fire())

		this.StartTime = lineMetadata.StartTime
		this.Duration = (lineMetadata.EndTime - lineMetadata.StartTime)

		const syllableSpan = this.Maid.Give(document.createElement('span'))
		syllableSpan.classList.add('Lyric', 'Synced', 'Line')
		syllableSpan.innerText = (isRomanized && lineMetadata.RomanizedText || lineMetadata.Text)
		container.appendChild(syllableSpan)

		this.Span = syllableSpan
		this.GlowSpring = new Spring(0, GlowDamping, GlowFrequency)

		this.SetToGeneralState(false)
		lineContainer.appendChild(container)
	}

	private UpdateLiveTextState = (timeScale: number, forceTo?: true) => {
		const glowAlpha = GlowSpline.at(timeScale)
		if (forceTo) {
			this.GlowSpring.Set(glowAlpha)
		} else {
			this.GlowSpring.Final = glowAlpha
		}
	}

	private UpdateLiveTextVisuals = (timeScale: number, deltaTime: number): boolean => {
		const glowAlpha = this.GlowSpring.Update(deltaTime)
		this.Span.style.setProperty("--text-shadow-blur-radius", `${4 + (8 * glowAlpha)}px`)
		this.Span.style.setProperty("--text-shadow-opacity", `${glowAlpha * 50}%`)
		this.Span.style.setProperty("--gradient-progress", `${0 + (120 * timeScale)}%`)
		return this.GlowSpring.IsSleeping()
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
		this.UpdateLiveTextState(timeScale, true)
		this.UpdateLiveTextVisuals(timeScale, 0)
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

		if (shouldUpdateVisualState) {
			this.IsSleeping = false
			this.UpdateLiveTextState(timeScale, (isImmediate || (relativeTime < 0) || undefined))
		}

		if (this.IsSleeping === false) {
			const isSleeping = this.UpdateLiveTextVisuals(timeScale, deltaTime)
			if (isSleeping) {
				this.IsSleeping = true
				if (isActive === false) this.EvaluateClassState()
			}
		}
	}

	public ForceState(state: boolean) { this.SetToGeneralState(state) }
	public IsActive() { return (this.State === "Active") }
	public SetBlur(blurDistance: number) { this.Container.style.setProperty('--text-blur', `${blurDistance}px`) }

	public Destroy() { this.Maid.Destroy() }
}

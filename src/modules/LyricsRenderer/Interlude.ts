import { CurveInterpolator } from 'curve-interpolator'
import { easeSinOut } from 'd3-ease'
import { Maid, Giveable } from '../../utils/Maid'
import { Signal } from '../../utils/Signal'
import Spring from '../../utils/LegacySpring'
import { GetSpline, Clamp } from './SharedMethods'
import { SyncedVocals, LyricState } from './Types.d'
import { Interlude } from '../../types/Lyrics'

type DotSprings = { Scale: Spring; YOffset: Spring; Glow: Spring; Opacity: Spring }
type DotLiveText = { Object: HTMLSpanElement; Springs: DotSprings }
type MainSprings = { Scale: Spring; YOffset: Spring; Opacity: Spring }
type MainLiveText = { Object: HTMLSpanElement; Springs: MainSprings }
type AnimatedDot = { Start: number; Duration: number; GlowDuration: number; LiveText: DotLiveText }

const DotCount = 3
const DotAnimations = {
	YOffsetDamping: 0.4, YOffsetFrequency: 1.25, ScaleDamping: 0.6, ScaleFrequency: 0.7, GlowDamping: 0.5, GlowFrequency: 1,
	ScaleRange: [{ Time: 0, Value: 0.75 }, { Time: 0.7, Value: 1.05 }, { Time: 1, Value: 1 }],
	YOffsetRange: [{ Time: 0, Value: 0.125 }, { Time: 0.9, Value: -0.2 }, { Time: 1, Value: 0 }],
	GlowRange: [{ Time: 0, Value: 0 }, { Time: 0.6, Value: 1 }, { Time: 1, Value: 1 }],
	OpacityRange: [{ Time: 0, Value: 0.35 }, { Time: 0.6, Value: 1 }, { Time: 1, Value: 1 }]
}
const DotSplines = {
	ScaleSpline: GetSpline(DotAnimations.ScaleRange),
	YOffsetSpline: GetSpline(DotAnimations.YOffsetRange),
	GlowSpline: GetSpline(DotAnimations.GlowRange),
	OpacitySpline: GetSpline(DotAnimations.OpacityRange)
}
const CreateDotSprings = (): DotSprings => ({
	Scale: new Spring(0, DotAnimations.ScaleDamping, DotAnimations.ScaleFrequency),
	YOffset: new Spring(0, DotAnimations.YOffsetDamping, DotAnimations.YOffsetFrequency),
	Glow: new Spring(0, DotAnimations.GlowDamping, DotAnimations.GlowFrequency),
	Opacity: new Spring(0, DotAnimations.GlowDamping, DotAnimations.GlowFrequency)
})

const MainAnimations = {
	YOffsetDamping: 0.4, YOffsetFrequency: 1.25, ScaleDamping: 0.7, ScaleFrequency: 5,
	BaseScaleRange: [{ Time: 0, Value: 0 }, { Time: 0.2, Value: 1.05 }, { Time: -0.075, Value: 1.15 }, { Time: -0, Value: 0 }],
	OpacityRange: [{ Time: 0, Value: 0 }, { Time: 0.5, Value: 1 }, { Time: -0.075, Value: 1 }, { Time: -0, Value: 0 }],
	YOffsetRange: [{ Time: 0, Value: (1 / 100) }, { Time: 0.9, Value: -(1 / 60) }, { Time: 1, Value: 0 }]
}
const PulseInterval = 2.25
const DownPulse = 0.95
const UpPulse = 1.05
const MainYOffsetSpline = new CurveInterpolator(MainAnimations.YOffsetRange.map((m) => [m.Time, m.Value]))
const CreateMainSprings = (): MainSprings => ({
	Scale: new Spring(0, MainAnimations.ScaleDamping, MainAnimations.ScaleFrequency),
	YOffset: new Spring(0, MainAnimations.YOffsetDamping, MainAnimations.YOffsetFrequency),
	Opacity: new Spring(0, MainAnimations.YOffsetDamping, MainAnimations.YOffsetFrequency)
})

export default class InterludeVisual implements SyncedVocals, Giveable {
	private readonly Maid: Maid = new Maid()
	private readonly Container: HTMLDivElement
	private readonly StartTime: number
	private readonly Duration: number
	private readonly Dots: AnimatedDot[] = []
	private readonly LiveText: MainLiveText
	private readonly ScaleSpline: CurveInterpolator
	private readonly OpacitySpline: CurveInterpolator
	private State: LyricState = "Idle"
	private IsSleeping: boolean = true

	private readonly ActivityChangedSignal = this.Maid.Give(new Signal<(isActive: boolean) => void>())
	private readonly RequestedTimeSkipSignal = this.Maid.Give(new Signal<() => void>())

	public readonly ActivityChanged = this.ActivityChangedSignal.GetEvent()
	public readonly RequestedTimeSkip = this.RequestedTimeSkipSignal.GetEvent()

	public constructor(lineContainer: HTMLElement, interludeMetadata: Interlude) {
		const container = this.Maid.Give(document.createElement('div'))
		container.classList.add('Interlude')
		this.Container = container
		this.LiveText = { Object: container, Springs: CreateMainSprings() }
		this.StartTime = interludeMetadata.StartTime
		this.Duration = (interludeMetadata.EndTime - this.StartTime)

		{
			const scaleRange = MainAnimations.BaseScaleRange.map(p => ({ Time: p.Time, Value: p.Value }))
			const opacityRange = MainAnimations.OpacityRange.map(p => ({ Time: p.Time, Value: p.Value }))
			scaleRange[2].Time += this.Duration
			opacityRange[2].Time += this.Duration
			scaleRange[3].Time = this.Duration
			opacityRange[3].Time = this.Duration
			{
				const startPoint = scaleRange[1], endPoint = scaleRange[2]
				const deltaTime = (endPoint.Time - startPoint.Time)
				for (let iteration = Math.floor(deltaTime / PulseInterval); iteration > 0; iteration -= 1) {
					const time = (startPoint.Time + (iteration * PulseInterval))
					const value = ((iteration % 2 === 0) ? UpPulse : DownPulse)
					scaleRange.splice(2, 0, { Time: time, Value: value })
				}
			}
			for (const range of [scaleRange, opacityRange]) {
				for (const point of range) point.Time /= this.Duration
			}
			this.ScaleSpline = new CurveInterpolator(scaleRange.map(m => [m.Time, m.Value]))
			this.OpacitySpline = new CurveInterpolator(opacityRange.map(m => [m.Time, m.Value]))
		}

		{
			const dotStep = (0.925 / DotCount)
			let startTime = 0
			for (let i = 0; i < DotCount; i++) {
				const span = this.Maid.Give(document.createElement('span'))
				span.classList.add("InterludeDot")
				this.Dots.push({ Start: startTime, Duration: dotStep, GlowDuration: (1 - startTime), LiveText: { Object: span, Springs: CreateDotSprings() } })
				container.appendChild(span)
				startTime += dotStep
			}
		}

		this.SetToGeneralState(false)
		lineContainer.appendChild(container)
	}

	private UpdateLiveDotState = (liveText: DotLiveText, timeScale: number, glowTimeScale: number, forceTo?: true) => {
		const scale = DotSplines.ScaleSpline.at(timeScale)
		const yOffset = DotSplines.YOffsetSpline.at(timeScale)
		const glowAlpha = DotSplines.GlowSpline.at(glowTimeScale)
		const opacity = DotSplines.OpacitySpline.at(timeScale)
		if (forceTo) { liveText.Springs.Scale.Set(scale); liveText.Springs.YOffset.Set(yOffset); liveText.Springs.Glow.Set(glowAlpha); liveText.Springs.Opacity.Set(opacity) }
		else { liveText.Springs.Scale.Final = scale; liveText.Springs.YOffset.Final = yOffset; liveText.Springs.Glow.Final = glowAlpha; liveText.Springs.Opacity.Final = opacity }
	}

	private UpdateLiveDotVisuals = (liveText: DotLiveText, deltaTime: number): boolean => {
		const scale = liveText.Springs.Scale.Update(deltaTime)
		const yOffset = liveText.Springs.YOffset.Update(deltaTime)
		const glowAlpha = liveText.Springs.Glow.Update(deltaTime)
		const opacity = liveText.Springs.Opacity.Update(deltaTime)
		liveText.Object.style.transform = `translateY(calc(var(--dot-size) * ${yOffset}))`
		liveText.Object.style.scale = scale.toString()
		liveText.Object.style.setProperty("--text-shadow-blur-radius", `${4 + (6 * glowAlpha)}px`)
		liveText.Object.style.setProperty("--text-shadow-opacity", `${glowAlpha * 90}%`)
		liveText.Object.style.opacity = opacity.toString()
		return (liveText.Springs.Scale.IsSleeping() && liveText.Springs.YOffset.IsSleeping() && liveText.Springs.Glow.IsSleeping() && liveText.Springs.Opacity.IsSleeping())
	}

	private UpdateLiveMainState = (liveText: MainLiveText, timeScale: number, forceTo?: true) => {
		const yOffset = MainYOffsetSpline.getPointAt(timeScale)[1]
		const scaleIntersections = (this.ScaleSpline.getIntersects(timeScale) as number[][])
		const opacityIntersections = (this.OpacitySpline.getIntersects(timeScale) as number[][])
		const scale = (scaleIntersections.length === 0) ? 1 : scaleIntersections[scaleIntersections.length - 1][1]
		const opacity = (opacityIntersections.length === 0) ? 1 : opacityIntersections[opacityIntersections.length - 1][1]
		if (forceTo) { liveText.Springs.Scale.Set(scale); liveText.Springs.YOffset.Set(yOffset); liveText.Springs.Opacity.Set(opacity) }
		else { liveText.Springs.Scale.Final = scale; liveText.Springs.YOffset.Final = yOffset; liveText.Springs.Opacity.Final = opacity }
	}

	private UpdateLiveMainVisuals = (liveText: MainLiveText, deltaTime: number): boolean => {
		const scale = liveText.Springs.Scale.Update(deltaTime)
		const yOffset = liveText.Springs.YOffset.Update(deltaTime)
		const opacity = liveText.Springs.Opacity.Update(deltaTime)
		liveText.Object.style.transform = `translateY(calc(var(--dot-size) * ${yOffset}))`
		liveText.Object.style.scale = scale.toString()
		liveText.Object.style.opacity = easeSinOut(opacity).toString()
		return (liveText.Springs.Scale.IsSleeping() && liveText.Springs.YOffset.IsSleeping() && liveText.Springs.Opacity.IsSleeping())
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
		for (const dot of this.Dots) {
			this.UpdateLiveDotState(dot.LiveText, timeScale, timeScale, true)
			this.UpdateLiveDotVisuals(dot.LiveText, 0)
		}
		this.UpdateLiveMainState(this.LiveText, timeScale, true)
		this.UpdateLiveMainVisuals(this.LiveText, 0)
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
			for (const dot of this.Dots) {
				const dotTimeScale = Clamp(((timeScale - dot.Start) / dot.Duration), 0, 1)
				if (shouldUpdateVisualState) this.UpdateLiveDotState(dot.LiveText, dotTimeScale, dotTimeScale, isImmediate)
				if (isMoving) { if (!this.UpdateLiveDotVisuals(dot.LiveText, deltaTime)) isSleeping = false }
			}
			if (shouldUpdateVisualState) this.UpdateLiveMainState(this.LiveText, timeScale, isImmediate)
			if (isMoving) { if (!this.UpdateLiveMainVisuals(this.LiveText, deltaTime)) isSleeping = false }
			if (isSleeping) {
				this.IsSleeping = true
				if (isActive === false) this.EvaluateClassState()
			}
		}
	}

	public ForceState(state: boolean) { this.SetToGeneralState(state) }
	public IsActive() { return (this.State === "Active") }
	public SetBlur() {} // Interlude never uses blur

	public Destroy() { this.Maid.Destroy() }
}

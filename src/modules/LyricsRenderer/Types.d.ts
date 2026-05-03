import Spring from '../../utils/LegacySpring'
import { Event } from '../../utils/Signal'

type TimeValue = {
	Time: number
	Value: number
}
type TimeValueRange = TimeValue[]
type Springs = {
	Scale: Spring
	YOffset: Spring
	Glow: Spring
}
type LiveText = {
	Object: HTMLSpanElement
	Springs: Springs
}
type LyricState = "Idle" | "Active" | "Sung"

type BaseVocals = object
interface SyncedVocals extends BaseVocals {
	ActivityChanged: Event<(isActive: boolean) => void>
	RequestedTimeSkip: Event<() => void>
	Animate(songTimestamp: number, deltaTime: number, isImmediate?: true): void
	SetBlur(blurDistance: number): void
	IsActive(): boolean
}

export { TimeValue, TimeValueRange, Springs, LiveText, LyricState, BaseVocals, SyncedVocals }

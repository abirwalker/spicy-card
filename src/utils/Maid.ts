import { GetUniqueId } from './UniqueId'
import { Signal, IsConnection, type Event, type Connection, type CallbackDefinition } from './Signal'
import { type Scheduled, IsScheduled, Cancel } from './Scheduler'

type Callback = (() => void)
type DestroyingSignal = (() => void)
type CleanedSignal = (() => void)
type DestroyedSignal = (() => void)

type Item = (
	Giveable
	| Scheduled
	| MutationObserver | ResizeObserver
	| Element
	| Signal<CallbackDefinition> | Connection
	| Callback
)
export type GiveableItem = Item

abstract class Giveable {
	abstract Destroy(): void
}

const IsGiveable = (item: object): item is Giveable => {
	return ("Destroy" in item)
}

class Maid implements Giveable {
	private Items: Map<unknown, Item>
	private DestroyedState: boolean

	private DestroyingSignal: Signal<DestroyingSignal>
	private CleanedSignal: Signal<CleanedSignal>
	private DestroyedSignal: Signal<DestroyedSignal>

	public Destroying: Event<DestroyingSignal>
	public Cleaned: Event<CleanedSignal>
	public Destroyed: Event<DestroyedSignal>

	constructor() {
		this.Items = new Map()
		this.DestroyedState = false
		this.DestroyingSignal = new Signal()
		this.CleanedSignal = new Signal()
		this.DestroyedSignal = new Signal()
		this.Destroying = this.DestroyingSignal.GetEvent()
		this.Cleaned = this.CleanedSignal.GetEvent()
		this.Destroyed = this.DestroyedSignal.GetEvent()
	}

	private CleanItem<T extends Item>(item: T) {
		if (IsGiveable(item)) {
			item.Destroy()
		} else if (IsScheduled(item)) {
			Cancel(item)
		} else if ((item instanceof MutationObserver) || (item instanceof ResizeObserver)) {
			item.disconnect()
		} else if (IsConnection(item)) {
			item.Disconnect()
		} else if (item instanceof Element) {
			item.remove()
		} else if (typeof item === "function") {
			item()
		} else {
			console.warn("UNSUPPORTED MAID ITEM", typeof item, item)
		}
	}

	public Give<T extends Item>(item: T, key?: unknown): T {
		if (this.DestroyedState) {
			this.CleanItem(item)
			return item
		}
		const finalKey = (key ?? GetUniqueId())
		if (this.Has(finalKey)) {
			this.Clean(finalKey)
		}
		this.Items.set(finalKey, item)
		return item
	}

	public GiveItems<T extends Item[]>(...args: T): T {
		for (const item of args) {
			this.Give(item)
		}
		return args
	}

	public Get<T extends Item>(key: unknown): (T | undefined) {
		return (this.DestroyedState ? undefined : (this.Items.get(key) as T))
	}

	public Has(key: unknown): boolean {
		return (this.DestroyedState ? false : this.Items.has(key))
	}

	public Clean(key: unknown) {
		if (this.DestroyedState) return
		const item = this.Items.get(key)
		if (item !== undefined) {
			this.Items.delete(key)
			this.CleanItem(item)
		}
	}

	public CleanUp() {
		if (this.DestroyedState) return
		for (const [key, _] of this.Items) {
			this.Clean(key)
		}
		if (this.DestroyedState === false) {
			this.CleanedSignal.Fire()
		}
	}

	public IsDestroyed() {
		return this.DestroyedState
	}

	public Destroy() {
		if (this.DestroyedState === false) {
			this.DestroyingSignal.Fire()
			this.CleanUp()
			this.DestroyedState = true
			this.DestroyedSignal.Fire()
			this.DestroyingSignal.Destroy()
			this.CleanedSignal.Destroy()
			this.DestroyedSignal.Destroy()
		}
	}
}

export { Maid, Giveable }

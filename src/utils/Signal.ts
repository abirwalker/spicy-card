import { FreeArray } from './FreeArray'

type DefaultCallback = () => void
type Callback = (...args: any[]) => void
export type CallbackDefinition = Callback
type SignalConnectionReferences = FreeArray<{ Callback: Callback; Connection: Connection }>

class Connection {
	private ConnectionReferences: SignalConnectionReferences
	private Location: string
	private Disconnected: boolean

	constructor(connections: SignalConnectionReferences, callback: Callback) {
		this.ConnectionReferences = connections
		this.Disconnected = false
		this.Location = connections.Push({ Callback: callback, Connection: this })
	}

	public Disconnect() {
		if (this.Disconnected) return
		this.Disconnected = true
		this.ConnectionReferences.Remove(this.Location)
	}

	public IsDisconnected() {
		return this.Disconnected
	}
}

class Event<P extends Callback = DefaultCallback> {
	private Signal: Signal<P>

	constructor(signal: Signal<P>) {
		this.Signal = signal
	}

	public Connect(callback: P) {
		return this.Signal.Connect(callback)
	}

	public IsDestroyed() {
		return this.Signal.IsDestroyed()
	}
}

class Signal<P extends Callback = DefaultCallback> {
	private ConnectionReferences: SignalConnectionReferences
	private DestroyedState: boolean

	constructor() {
		this.ConnectionReferences = new FreeArray()
		this.DestroyedState = false
	}

	public Connect(callback: P): Connection {
		if (this.DestroyedState) throw('Cannot connect to a Destroyed Signal')
		return new Connection(this.ConnectionReferences, callback)
	}

	public Fire(...args: Parameters<P>) {
		if (this.DestroyedState) throw('Cannot fire a Destroyed Signal')
		for (const [_, reference] of this.ConnectionReferences.GetIterator()) {
			reference.Callback(...args)
		}
	}

	public GetEvent(): Event<P> {
		return new Event(this)
	}

	public IsDestroyed() {
		return this.DestroyedState
	}

	public Destroy() {
		if (this.DestroyedState) return
		for (const [_, reference] of this.ConnectionReferences.GetIterator()) {
			reference.Connection.Disconnect()
		}
		this.DestroyedState = true
	}
}

export type { Event, Connection }
export const IsConnection = (value: unknown): value is Connection => (value instanceof Connection)
export { Signal }

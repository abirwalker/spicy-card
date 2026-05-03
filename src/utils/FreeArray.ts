import { GetUniqueId } from './UniqueId'

class FreeArray<I> {
	private Items: Map<string, I>
	private DestroyedState: boolean

	constructor() {
		this.Items = new Map()
		this.DestroyedState = false
	}

	public Push(item: I): string {
		const key = GetUniqueId()
		this.Items.set(key, item)
		return key
	}

	public Get(key: string): (I | undefined) {
		return this.Items.get(key)
	}

	public Remove(key: string): (I | undefined) {
		const item = this.Items.get(key)
		if (item !== undefined) {
			this.Items.delete(key)
			return item
		}
	}

	public GetIterator() {
		return this.Items.entries()
	}

	public IsDestroyed() {
		return this.DestroyedState
	}

	public Destroy() {
		if (this.DestroyedState) return
		this.DestroyedState = true
	}
}

export { FreeArray }

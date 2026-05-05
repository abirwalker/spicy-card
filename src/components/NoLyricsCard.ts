// NoLyricsCard — shown when a track has no lyrics available
// Follows the same CreateElement + Maid pattern as CardView.ts

import { Maid, Giveable } from '../utils/Maid'
import { CreateElement } from '../utils/Shared'

const NoLyricsCardTemplate = `<div id="SpicyCard-NoLyrics"><p class="NoLyricsMessage">No lyrics available</p></div>`

export default class NoLyricsCard implements Giveable {
	private readonly InternalMaid = new Maid()
	private readonly Container: HTMLDivElement

	constructor(insertAfter: HTMLDivElement) {
		this.Container = this.InternalMaid.Give(
			CreateElement<HTMLDivElement>(NoLyricsCardTemplate)
		)
		insertAfter.after(this.Container)
	}

	public Destroy() {
		this.InternalMaid.Destroy()
	}
}

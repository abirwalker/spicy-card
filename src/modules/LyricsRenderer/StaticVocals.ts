import { Maid, Giveable } from '../../utils/Maid'
import { TextMetadata } from '../../types/Lyrics'
import { BaseVocals } from './Types.d'

export default class StaticVocals implements BaseVocals, Giveable {
	private readonly Maid: Maid
	private readonly LyricMetadata: TextMetadata

	public constructor(
		lineContainer: HTMLElement, lyricMetadata: TextMetadata,
		isRomanized: boolean
	) {
		this.LyricMetadata = lyricMetadata
		this.Maid = new Maid()

		const container = this.Maid.Give(document.createElement('div'))
		container.classList.add('Vocals', 'Lead', 'Active')

		const syllableSpan = this.Maid.Give(document.createElement('span'))
		syllableSpan.classList.add('Lyric', 'Static')
		syllableSpan.innerText = (isRomanized && lyricMetadata.RomanizedText || lyricMetadata.Text)
		container.appendChild(syllableSpan)

		lineContainer.appendChild(container)
	}

	public Destroy() {
		this.Maid.Destroy()
	}
}

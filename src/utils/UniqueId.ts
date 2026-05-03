const GeneratedIds: Set<string> = new Set()
export function GetUniqueId(): string {
	while (true) {
		const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
			let r = Math.random() * 16 | 0,
				v = c == 'x' ? r : (r & 0x3 | 0x8)
			return v.toString(16)
		})
		if (GeneratedIds.has(id) === false) {
			GeneratedIds.add(id)
			return id
		}
	}
}

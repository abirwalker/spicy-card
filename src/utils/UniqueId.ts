let idCounter = 0

export function GetUniqueId(): string {
	return (++idCounter).toString(36)
}


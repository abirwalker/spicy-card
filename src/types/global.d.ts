declare const Spicetify: typeof import('./spicetify.d')

declare namespace NodeJS {
	interface Process {
		env: Record<string, string>
	}
}

declare const process: NodeJS.Process

declare namespace NodeJS {
	interface Process {
		env: Record<string, string>;
	}
}

declare const process: NodeJS.Process;

declare module '@spicemod/creator';

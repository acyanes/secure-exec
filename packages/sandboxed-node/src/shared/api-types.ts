export interface ProcessConfig {
	platform?: string;
	arch?: string;
	version?: string;
	cwd?: string;
	env?: Record<string, string>;
	argv?: string[];
	execPath?: string;
	pid?: number;
	ppid?: number;
	uid?: number;
	gid?: number;
	/** Stdin data to provide to the script */
	stdin?: string;
}

export interface OSConfig {
	platform?: string;
	arch?: string;
	type?: string;
	release?: string;
	version?: string;
	homedir?: string;
	tmpdir?: string;
	hostname?: string;
}

export interface RunResult<T = unknown> {
	stdout: string;
	stderr: string;
	code: number;
	exports?: T;
}

export interface ExecOptions {
	filePath?: string;
	env?: Record<string, string>;
	cwd?: string;
	/** Stdin data to pass to the script */
	stdin?: string;
}

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number;
}

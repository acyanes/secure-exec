export interface SystemError extends Error {
	code?: string;
	errno?: number | string;
	path?: string;
	syscall?: string;
}

export function createSystemError(
	code: string,
	message: string,
	details?: {
		path?: string;
		syscall?: string;
	},
): SystemError {
	const err = new Error(message) as SystemError;
	err.code = code;
	if (details?.path) err.path = details.path;
	if (details?.syscall) err.syscall = details.syscall;
	return err;
}

export function createEaccesError(op: string, path?: string): SystemError {
	const suffix = path ? ` '${path}'` : "";
	return createSystemError(
		"EACCES",
		`EACCES: permission denied, ${op}${suffix}`,
		{ path, syscall: op },
	);
}

export function createEnosysError(op: string, path?: string): SystemError {
	const suffix = path ? ` '${path}'` : "";
	return createSystemError(
		"ENOSYS",
		`ENOSYS: function not implemented, ${op}${suffix}`,
		{ path, syscall: op },
	);
}

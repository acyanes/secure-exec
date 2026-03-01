import ivm from "isolated-vm";
import type { TimingMitigation } from "./shared/api-types.js";

/** Default timing side-channel mitigation: freeze Date.now/performance.now inside the isolate. */
export const DEFAULT_TIMING_MITIGATION: TimingMitigation = "freeze";

/** Matches GNU `timeout` convention where 124 indicates execution timed out. */
export const TIMEOUT_EXIT_CODE = 124;
export const TIMEOUT_ERROR_MESSAGE = "CPU time limit exceeded";

/** Thrown when an isolate execution exceeds its CPU time budget. */
export class ExecutionTimeoutError extends Error {
	constructor() {
		super(TIMEOUT_ERROR_MESSAGE);
		this.name = "ExecutionTimeoutError";
	}
}

/** Create a new V8 isolate with the given heap memory limit (in MB). */
export function createIsolate(memoryLimit: number): ivm.Isolate {
	return new ivm.Isolate({ memoryLimit });
}

/** Convert a relative timeout duration into an absolute wall-clock deadline. */
export function getExecutionDeadlineMs(timeoutMs?: number): number | undefined {
	if (timeoutMs === undefined) {
		return undefined;
	}
	return Date.now() + timeoutMs;
}

/**
 * Build isolated-vm `ScriptRunOptions` with a timeout derived from the remaining
 * wall-clock budget. Throws immediately if the deadline has already passed.
 */
export function getExecutionRunOptions(
	executionDeadlineMs?: number,
): Pick<ivm.ScriptRunOptions, "timeout"> {
	if (executionDeadlineMs === undefined) {
		return {};
	}
	const remainingMs = Math.floor(executionDeadlineMs - Date.now());
	if (remainingMs <= 0) {
		throw new ExecutionTimeoutError();
	}
	return { timeout: Math.max(1, remainingMs) };
}

/**
 * Race an async operation against the execution deadline.
 * Used for host-side awaits (e.g. active-handle drain) that happen outside
 * the isolate's own timeout enforcement.
 */
export async function runWithExecutionDeadline<T>(
	operation: Promise<T>,
	executionDeadlineMs?: number,
): Promise<T> {
	if (executionDeadlineMs === undefined) {
		return operation;
	}
	const remainingMs = Math.floor(executionDeadlineMs - Date.now());
	if (remainingMs <= 0) {
		throw new ExecutionTimeoutError();
	}
	return await new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new ExecutionTimeoutError()), remainingMs);
		operation.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(err) => {
				clearTimeout(timer);
				reject(err);
			},
		);
	});
}

/**
 * Detect timeout errors from both our own `ExecutionTimeoutError` and
 * isolated-vm's native timeout messages.
 */
export function isExecutionTimeoutError(error: unknown): boolean {
	if (error instanceof ExecutionTimeoutError) {
		return true;
	}
	const message = error instanceof Error ? error.message : String(error);
	return /timed out|time limit exceeded/i.test(message);
}

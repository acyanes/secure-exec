/**
 * Process and FD-stat bridge for WASI polyfill kernel delegation.
 *
 * Abstracts process state (args, env, exit) and FD stat so the polyfill
 * does not directly touch FDTable entries for stat or hold its own
 * args/env copies. In standalone mode the bridge wraps FDTable + options;
 * when mounted in the kernel it wraps KernelInterface with a bound pid.
 */

import type { FDTable, FDEntry } from './fd-table.ts';
import { ERRNO_SUCCESS, ERRNO_EBADF } from './fd-table.ts';

/**
 * Process and FD-stat interface for the WASI polyfill.
 *
 * Method signatures are designed to map cleanly to KernelInterface
 * fdStat / ProcessContext when the kernel is connected.
 */
export interface WasiProcessIO {
  /** Get command-line arguments. */
  getArgs(): string[];

  /** Get environment variables. */
  getEnviron(): Record<string, string>;

  /** Get FD stat (filetype, flags, rights). */
  fdFdstatGet(fd: number): {
    errno: number;
    filetype: number;
    fdflags: number;
    rightsBase: bigint;
    rightsInheriting: bigint;
  };

  /**
   * Record process exit. Called before the WasiProcExit exception is thrown.
   * In kernel mode this delegates to process table markExited.
   */
  procExit(exitCode: number): void;
}

/**
 * Create a standalone process I/O bridge that wraps FDTable + options.
 * Moves args/env/fdstat/proc_exit logic out of the polyfill.
 */
export function createStandaloneProcessIO(
  fdTable: FDTable,
  args: string[],
  env: Record<string, string>,
): WasiProcessIO {
  let exitCode: number | null = null;

  return {
    getArgs() {
      return args;
    },

    getEnviron() {
      return env;
    },

    fdFdstatGet(fd) {
      const entry = fdTable.get(fd);
      if (!entry) {
        return { errno: ERRNO_EBADF, filetype: 0, fdflags: 0, rightsBase: 0n, rightsInheriting: 0n };
      }
      return {
        errno: ERRNO_SUCCESS,
        filetype: entry.filetype,
        fdflags: entry.fdflags,
        rightsBase: entry.rightsBase,
        rightsInheriting: entry.rightsInheriting,
      };
    },

    procExit(code) {
      exitCode = code;
    },
  };
}

/**
 * @secure-exec/kernel
 *
 * Thin re-export layer. Canonical source now lives in @secure-exec/core/src/kernel/.
 * This package exists for backward compatibility and will be removed in a future release.
 */

// Re-export the full kernel barrel from @secure-exec/core.
export {
	// Kernel factory
	createKernel,

	// Structured kernel error and termios defaults
	KernelError,
	defaultTermios,

	// Kernel components
	FDTableManager,
	ProcessFDTable,
	ProcessTable,
	createDeviceLayer,
	PipeManager,
	PtyManager,
	CommandRegistry,
	FileLockManager,
	LOCK_SH,
	LOCK_EX,
	LOCK_UN,
	LOCK_NB,
	UserManager,

	// Kernel permission helpers
	checkChildProcess,

	// Constants
	O_RDONLY, O_WRONLY, O_RDWR, O_CREAT, O_EXCL, O_TRUNC, O_APPEND, O_CLOEXEC,
	F_DUPFD, F_GETFD, F_SETFD, F_GETFL, F_DUPFD_CLOEXEC, FD_CLOEXEC,
	SEEK_SET, SEEK_CUR, SEEK_END,
	FILETYPE_UNKNOWN, FILETYPE_CHARACTER_DEVICE, FILETYPE_DIRECTORY,
	FILETYPE_REGULAR_FILE, FILETYPE_SYMBOLIC_LINK, FILETYPE_PIPE,
	SIGHUP, SIGINT, SIGQUIT, SIGKILL, SIGPIPE, SIGALRM, SIGTERM, SIGCHLD, SIGCONT, SIGSTOP, SIGTSTP, SIGWINCH,
	WNOHANG,

	// POSIX wstatus
	encodeExitStatus,
	encodeSignalStatus,
	WIFEXITED,
	WEXITSTATUS,
	WIFSIGNALED,
	WTERMSIG,
} from "@secure-exec/core";

// Re-export types
export type {
	Kernel,
	KernelOptions,
	KernelInterface,
	KernelExecOptions as ExecOptions,
	KernelExecResult as ExecResult,
	KernelSpawnOptions as SpawnOptions,
	ManagedProcess,
	KernelRuntimeDriver as RuntimeDriver,
	ProcessContext,
	DriverProcess,
	ProcessEntry,
	ProcessInfo,
	FDStat,
	FileDescription,
	FDEntry,
	Pipe,
	Permissions,
	PermissionDecision,
	PermissionCheck,
	FsAccessRequest,
	NetworkAccessRequest,
	ChildProcessAccessRequest,
	EnvAccessRequest,
	KernelErrorCode,
	Termios,
	TermiosCC,
	OpenShellOptions,
	ShellHandle,
	ConnectTerminalOptions,
	VirtualFileSystem,
	VirtualDirEntry,
	VirtualStat,
	LineDisciplineConfig,
	UserConfig,
} from "@secure-exec/core";

// Kernel permission helpers that conflict with core's SDK-level permissions.
// These are re-exported from the internal kernel barrel.
export {
	wrapFileSystem,
	filterEnv,
	allowAll,
	allowAllFs,
	allowAllNetwork,
	allowAllChildProcess,
	allowAllEnv,
} from "@secure-exec/core/internal/kernel";

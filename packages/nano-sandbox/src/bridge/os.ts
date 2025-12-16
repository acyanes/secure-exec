// os polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js os API compatibility

import type * as nodeOs from "os";

// Configuration interface for customization
export interface OSConfig {
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  type?: string;
  release?: string;
  version?: string;
  homedir?: string;
  tmpdir?: string;
  hostname?: string;
}

// Default configuration
const config: Required<OSConfig> = {
  platform: "linux",
  arch: "x64",
  type: "Linux",
  release: "5.15.0",
  version: "#1 SMP",
  homedir: "/root",
  tmpdir: "/tmp",
  hostname: "sandbox",
};

// Allow configuration from host
declare const _osConfig: OSConfig | undefined;
if (typeof _osConfig !== "undefined") {
  Object.assign(config, _osConfig);
}

// CPU info type
interface CpuInfo {
  model: string;
  speed: number;
  times: {
    user: number;
    nice: number;
    sys: number;
    idle: number;
    irq: number;
  };
}

// User info type that matches Node.js
interface UserInfo<T> {
  username: T;
  uid: number;
  gid: number;
  shell: T;
  homedir: T;
}

// Network interface info type
type NetworkInterfaceInfo = nodeOs.NetworkInterfaceInfo;

// Signal constants
const signals: Record<string, number> = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGIOT: 6,
  SIGBUS: 7,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 10,
  SIGSEGV: 11,
  SIGUSR2: 12,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15,
  SIGSTKFLT: 16,
  SIGCHLD: 17,
  SIGCONT: 18,
  SIGSTOP: 19,
  SIGTSTP: 20,
  SIGTTIN: 21,
  SIGTTOU: 22,
  SIGURG: 23,
  SIGXCPU: 24,
  SIGXFSZ: 25,
  SIGVTALRM: 26,
  SIGPROF: 27,
  SIGWINCH: 28,
  SIGIO: 29,
  SIGPOLL: 29,
  SIGPWR: 30,
  SIGSYS: 31,
  SIGUNUSED: 31,
};

// Errno constants
const errno: Record<string, number> = {
  E2BIG: 7,
  EACCES: 13,
  EADDRINUSE: 98,
  EADDRNOTAVAIL: 99,
  EAFNOSUPPORT: 97,
  EAGAIN: 11,
  EALREADY: 114,
  EBADF: 9,
  EBADMSG: 74,
  EBUSY: 16,
  ECANCELED: 125,
  ECHILD: 10,
  ECONNABORTED: 103,
  ECONNREFUSED: 111,
  ECONNRESET: 104,
  EDEADLK: 35,
  EDESTADDRREQ: 89,
  EDOM: 33,
  EDQUOT: 122,
  EEXIST: 17,
  EFAULT: 14,
  EFBIG: 27,
  EHOSTUNREACH: 113,
  EIDRM: 43,
  EILSEQ: 84,
  EINPROGRESS: 115,
  EINTR: 4,
  EINVAL: 22,
  EIO: 5,
  EISCONN: 106,
  EISDIR: 21,
  ELOOP: 40,
  EMFILE: 24,
  EMLINK: 31,
  EMSGSIZE: 90,
  EMULTIHOP: 72,
  ENAMETOOLONG: 36,
  ENETDOWN: 100,
  ENETRESET: 102,
  ENETUNREACH: 101,
  ENFILE: 23,
  ENOBUFS: 105,
  ENODATA: 61,
  ENODEV: 19,
  ENOENT: 2,
  ENOEXEC: 8,
  ENOLCK: 37,
  ENOLINK: 67,
  ENOMEM: 12,
  ENOMSG: 42,
  ENOPROTOOPT: 92,
  ENOSPC: 28,
  ENOSR: 63,
  ENOSTR: 60,
  ENOSYS: 38,
  ENOTCONN: 107,
  ENOTDIR: 20,
  ENOTEMPTY: 39,
  ENOTSOCK: 88,
  ENOTSUP: 95,
  ENOTTY: 25,
  ENXIO: 6,
  EOPNOTSUPP: 95,
  EOVERFLOW: 75,
  EPERM: 1,
  EPIPE: 32,
  EPROTO: 71,
  EPROTONOSUPPORT: 93,
  EPROTOTYPE: 91,
  ERANGE: 34,
  EROFS: 30,
  ESPIPE: 29,
  ESRCH: 3,
  ESTALE: 116,
  ETIME: 62,
  ETIMEDOUT: 110,
  ETXTBSY: 26,
  EWOULDBLOCK: 11,
  EXDEV: 18,
};

// Priority constants
const priority = {
  PRIORITY_LOW: 19,
  PRIORITY_BELOW_NORMAL: 10,
  PRIORITY_NORMAL: 0,
  PRIORITY_ABOVE_NORMAL: -7,
  PRIORITY_HIGH: -14,
  PRIORITY_HIGHEST: -20,
};

// Dlopen constants
const dlopen = {
  RTLD_LAZY: 1,
  RTLD_NOW: 2,
  RTLD_GLOBAL: 256,
  RTLD_LOCAL: 0,
};

// Constants object
const constants = {
  signals,
  errno,
  priority,
  dlopen,
  UV_UDP_REUSEADDR: 4,
};

// The os module implementation
const os = {
  // Platform information
  platform(): NodeJS.Platform {
    return config.platform;
  },

  arch(): NodeJS.Architecture {
    return config.arch;
  },

  type(): string {
    return config.type;
  },

  release(): string {
    return config.release;
  },

  version(): string {
    return config.version;
  },

  // Directory information
  homedir(): string {
    return config.homedir;
  },

  tmpdir(): string {
    return config.tmpdir;
  },

  // System information
  hostname(): string {
    return config.hostname;
  },

  // User information
  userInfo<T extends "buffer" | "utf8" = "utf8">(
    _options?: { encoding: T }
  ): UserInfo<T extends "buffer" ? Buffer : string> {
    return {
      username: "root",
      uid: 0,
      gid: 0,
      shell: "/bin/bash",
      homedir: config.homedir,
    } as UserInfo<T extends "buffer" ? Buffer : string>;
  },

  // CPU information
  cpus(): CpuInfo[] {
    return [
      {
        model: "Virtual CPU",
        speed: 2000,
        times: {
          user: 100000,
          nice: 0,
          sys: 50000,
          idle: 800000,
          irq: 0,
        },
      },
    ];
  },

  // Memory information
  totalmem(): number {
    return 1073741824; // 1GB
  },

  freemem(): number {
    return 536870912; // 512MB
  },

  // System load
  loadavg(): number[] {
    return [0.1, 0.1, 0.1];
  },

  // System uptime
  uptime(): number {
    return 3600; // 1 hour
  },

  // Network interfaces (empty - not supported)
  networkInterfaces(): NodeJS.Dict<NetworkInterfaceInfo[]> {
    return {};
  },

  // System endianness
  endianness(): "BE" | "LE" {
    return "LE";
  },

  // Line endings
  EOL: "\n",

  // Dev null path
  devNull: "/dev/null",

  // Machine type (same as arch for our purposes)
  machine(): string {
    return config.arch;
  },

  // Constants
  constants,

  // Priority getters/setters (stubs)
  getPriority(_pid?: number): number {
    return 0;
  },

  setPriority(pidOrPriority: number, priority?: number): void {
    // No-op - just accept the call for compatibility
    void pidOrPriority;
    void priority;
  },

  // Temp directory function (aliases tmpdir)
  tmpDir(): string {
    return config.tmpdir;
  },

  // Parallelism hint (returns 1 for single CPU)
  availableParallelism(): number {
    return 1;
  },
};

// Type check: validate key methods match Node.js signatures
type _CheckPlatform = typeof os.platform extends typeof nodeOs.platform ? true : never;
type _CheckArch = typeof os.arch extends typeof nodeOs.arch ? true : never;
type _CheckHomedir = typeof os.homedir extends typeof nodeOs.homedir ? true : never;
type _CheckTmpdir = typeof os.tmpdir extends typeof nodeOs.tmpdir ? true : never;
type _CheckHostname = typeof os.hostname extends typeof nodeOs.hostname ? true : never;
type _CheckCpus = typeof os.cpus extends typeof nodeOs.cpus ? true : never;
type _CheckTotalmem = typeof os.totalmem extends typeof nodeOs.totalmem ? true : never;
type _CheckFreemem = typeof os.freemem extends typeof nodeOs.freemem ? true : never;
type _CheckLoadavg = typeof os.loadavg extends typeof nodeOs.loadavg ? true : never;
type _CheckUptime = typeof os.uptime extends typeof nodeOs.uptime ? true : never;
type _CheckEndianness = typeof os.endianness extends typeof nodeOs.endianness ? true : never;

// Validate types are used (prevent "unused" warnings)
const _typeChecks: [
  _CheckPlatform,
  _CheckArch,
  _CheckHomedir,
  _CheckTmpdir,
  _CheckHostname,
  _CheckCpus,
  _CheckTotalmem,
  _CheckFreemem,
  _CheckLoadavg,
  _CheckUptime,
  _CheckEndianness
] = [true, true, true, true, true, true, true, true, true, true, true];
void _typeChecks;

export default os;

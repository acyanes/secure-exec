// module polyfill for isolated-vm
// Provides module.createRequire and other module utilities for npm compatibility

import type * as nodeModule from "module";

// Declare globals that are set up by the host environment
declare const _requireFrom: (request: string, dirname: string) => unknown;
declare const _resolveModule: {
  applySyncPromise: (ctx: undefined, args: [string, string]) => string | null;
};
declare const _moduleCache: Record<string, NodeJS.Module>;

// Path utilities for module resolution
function pathDirname(p: string): string {
  const lastSlash = p.lastIndexOf("/");
  if (lastSlash === -1) return ".";
  if (lastSlash === 0) return "/";
  return p.slice(0, lastSlash);
}

function pathResolve(...segments: string[]): string {
  let resolvedPath = "";
  let resolvedAbsolute = false;

  for (let i = segments.length - 1; i >= 0 && !resolvedAbsolute; i--) {
    const segment = segments[i];
    if (!segment) continue;

    resolvedPath = segment + "/" + resolvedPath;
    resolvedAbsolute = segment.charAt(0) === "/";
  }

  // Normalize the path
  const parts = resolvedPath.split("/").filter(Boolean);
  const result: string[] = [];
  for (const part of parts) {
    if (part === "..") {
      result.pop();
    } else if (part !== ".") {
      result.push(part);
    }
  }

  return (resolvedAbsolute ? "/" : "") + result.join("/") || ".";
}

function parseFileUrl(url: string): string {
  // Handle file:// URLs
  if (url.startsWith("file://")) {
    // Remove file:// prefix
    let path = url.slice(7);
    // Handle file:///path on Unix (3 slashes = absolute path)
    if (path.startsWith("/")) {
      return path;
    }
    // Handle file://host/path (rare, treat host as empty)
    return "/" + path;
  }
  return url;
}

// Built-in module list
const builtinModules = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "dns",
  "events",
  "fs",
  "http",
  "https",
  "net",
  "os",
  "path",
  "querystring",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "tty",
  "url",
  "util",
  "zlib",
  "vm",
  "module",
];

// NodeRequire interface for the require function
interface NodeRequire {
  (request: string): unknown;
  resolve: {
    (request: string, options?: { paths?: string[] }): string;
    paths(request: string): string[] | null;
  };
  cache: Record<string, NodeJS.Module>;
  main: NodeJS.Module | undefined;
  extensions: Record<string, (module: NodeJS.Module, filename: string) => void>;
}

/**
 * Create a require function that resolves relative to the given filename.
 * This mimics Node.js's module.createRequire(filename).
 */
function createRequire(filename: string | URL): NodeRequire {
  const filenameStr = typeof filename === "string" ? filename : filename.toString();
  const filepath = parseFileUrl(filenameStr);
  const dirname = pathDirname(filepath);

  // Create a require function bound to this directory
  const requireFn = function (request: string): unknown {
    return _requireFrom(request, dirname);
  } as NodeRequire;

  // Create resolve function with paths method
  const resolveFunc = function (request: string, _options?: { paths?: string[] }): string {
    const resolved = _resolveModule.applySyncPromise(undefined, [request, dirname]);
    if (resolved === null) {
      const err = new Error("Cannot find module '" + request + "'") as Error & { code: string };
      err.code = "MODULE_NOT_FOUND";
      throw err;
    }
    return resolved;
  } as {
    (request: string, options?: { paths?: string[] }): string;
    paths(request: string): string[] | null;
  };

  // Add require.resolve.paths (stub - returns null for built-ins)
  resolveFunc.paths = function (request: string): string[] | null {
    // For built-in modules, return null
    if (builtinModules.includes(request) || request.startsWith("node:")) {
      return null;
    }
    // For relative paths, return array starting from dirname
    if (request.startsWith("./") || request.startsWith("../") || request.startsWith("/")) {
      return [dirname];
    }
    // For bare specifiers, return node_modules search paths
    const paths: string[] = [];
    let current = dirname;
    while (current !== "/") {
      paths.push(current + "/node_modules");
      current = pathDirname(current);
    }
    paths.push("/node_modules");
    return paths;
  };

  // Assign resolve function
  requireFn.resolve = resolveFunc;

  // Add require.cache reference to global module cache
  requireFn.cache = _moduleCache;

  // Add require.main (null for dynamically created require)
  requireFn.main = undefined;

  // Add require.extensions (deprecated but still used by some tools)
  requireFn.extensions = {
    ".js": function (_module: NodeJS.Module, _filename: string): void {
      // This is a stub - actual loading is handled by our require implementation
    },
    ".json": function (_module: NodeJS.Module, _filename: string): void {
      // JSON loading stub
    },
    ".node": function (_module: NodeJS.Module, _filename: string): void {
      throw new Error(".node extensions are not supported in sandbox");
    },
  };

  return requireFn;
}

// Module class constructor (for compatibility with promzard and similar)
class Module implements NodeJS.Module {
  id: string;
  path: string;
  exports: unknown = {};
  filename: string;
  loaded = false;
  children: NodeJS.Module[] = [];
  paths: string[];
  parent: NodeJS.Module | null;
  isPreloading = false;
  require: NodeRequire;

  constructor(id: string, parent?: NodeJS.Module | null) {
    this.id = id;
    this.path = pathDirname(id);
    this.filename = id;
    this.parent = parent || null;
    this.paths = [];

    // Build module paths
    let current = this.path;
    while (current !== "/") {
      this.paths.push(current + "/node_modules");
      current = pathDirname(current);
    }
    this.paths.push("/node_modules");

    // Create require function for this module
    this.require = createRequire(id);
  }

  _compile(content: string, filename: string): unknown {
    // Create wrapper function and execute
    const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", content);
    const moduleRequire = createRequire(filename);
    wrapper(this.exports, moduleRequire, this, filename, this.path);
    this.loaded = true;
    return this.exports;
  }

  static _extensions: Record<string, (module: Module, filename: string) => void> = {
    ".js": function (module: Module, filename: string): void {
      // This would need fs to work properly
      void module;
      void filename;
    },
    ".json": function (module: Module, filename: string): void {
      // This would need fs to work properly
      void module;
      void filename;
    },
    ".node": function (): void {
      throw new Error(".node extensions are not supported in sandbox");
    },
  };

  static _cache = typeof _moduleCache !== "undefined" ? _moduleCache : {};

  static _resolveFilename(
    request: string,
    parent?: NodeJS.Module | null,
    _isMain?: boolean,
    _options?: { paths?: string[] }
  ): string {
    const parentDir = parent && parent.path ? parent.path : "/";
    const resolved = _resolveModule.applySyncPromise(undefined, [request, parentDir]);
    if (resolved === null) {
      const err = new Error("Cannot find module '" + request + "'") as Error & { code: string };
      err.code = "MODULE_NOT_FOUND";
      throw err;
    }
    return resolved;
  }

  static wrap(content: string): string {
    return "(function (exports, require, module, __filename, __dirname) { " + content + "\n});";
  }

  static builtinModules = builtinModules;

  static isBuiltin(moduleName: string): boolean {
    const name = moduleName.replace(/^node:/, "");
    return builtinModules.includes(name);
  }

  static createRequire = createRequire;

  static syncBuiltinESMExports(): void {
    // No-op in our environment
  }

  static findSourceMap(_path: string): undefined {
    return undefined;
  }

  static _nodeModulePaths(from: string): string[] {
    // Return array of node_modules paths from the given directory up to root
    const paths: string[] = [];
    let current = from;
    while (current !== "/") {
      paths.push(current + "/node_modules");
      current = pathDirname(current);
      if (current === ".") break;
    }
    paths.push("/node_modules");
    return paths;
  }

  static _load(request: string, parent?: NodeJS.Module | null, _isMain?: boolean): unknown {
    const parentDir = parent && parent.path ? parent.path : "/";
    return _requireFrom(request, parentDir);
  }

  static runMain(): void {
    // No-op - we don't have a main module in this context
  }
}

// SourceMap class (stub)
class SourceMap {
  payload: unknown;
  constructor(payload: unknown) {
    this.payload = payload;
  }
  findEntry(_line: number, _column: number): object {
    return {};
  }
}

// Module object with createRequire and other utilities
const moduleModule = {
  Module: Module as unknown as typeof nodeModule.Module,
  createRequire,

  // Module._extensions (deprecated alias)
  _extensions: Module._extensions,

  // Module._cache reference
  _cache: Module._cache,

  // Built-in module list
  builtinModules,

  // isBuiltin check
  isBuiltin: Module.isBuiltin,

  // Module._resolveFilename (internal but sometimes used)
  _resolveFilename: Module._resolveFilename,

  // wrap function
  wrap: Module.wrap,

  // syncBuiltinESMExports (stub for ESM interop)
  syncBuiltinESMExports(): void {
    // No-op in our environment
  },

  // findSourceMap (stub)
  findSourceMap(_path: string): undefined {
    return undefined;
  },

  // SourceMap class (stub)
  SourceMap,
};

export { createRequire, Module, SourceMap };
export default moduleModule;

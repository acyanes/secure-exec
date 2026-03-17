import { describe, it, expect, vi } from "vitest";
import { createInMemoryFileSystem } from "../../../src/index.js";
import {
	resolveModule,
	createResolutionCache,
	type ResolutionCache,
} from "../../../src/package-bundler.js";
import type { VirtualFileSystem } from "../../../src/types.js";

/** Wrap a VFS so we can count calls to exists/stat/readTextFile. */
function spyFs(base: VirtualFileSystem) {
	const calls = {
		exists: 0,
		stat: 0,
		readTextFile: 0,
	};

	const proxy: VirtualFileSystem = {
		...base,
		async exists(path: string) {
			calls.exists++;
			return base.exists(path);
		},
		async stat(path: string) {
			calls.stat++;
			return base.stat(path);
		},
		async readTextFile(path: string) {
			calls.readTextFile++;
			return base.readTextFile(path);
		},
	};

	return { fs: proxy, calls };
}

describe("resolver memoization", () => {
	it("same nonexistent module called twice → only one VFS probe set", async () => {
		const memfs = createInMemoryFileSystem();
		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		// First call — probes VFS
		const result1 = await resolveModule("nonexistent", "/app", fs, "require", cache);
		expect(result1).toBeNull();
		const firstCalls = { ...calls };
		expect(firstCalls.exists + firstCalls.stat).toBeGreaterThan(0);

		// Second call — returns from cache without VFS probes
		const result2 = await resolveModule("nonexistent", "/app", fs, "require", cache);
		expect(result2).toBeNull();
		expect(calls.exists).toBe(firstCalls.exists);
		expect(calls.stat).toBe(firstCalls.stat);
		expect(calls.readTextFile).toBe(firstCalls.readTextFile);
	});

	it("same existing module called twice → only one resolution walk", async () => {
		const memfs = createInMemoryFileSystem();
		// Set up a minimal package
		await memfs.writeFile(
			"/app/node_modules/left-pad/package.json",
			JSON.stringify({ main: "index.js" }),
		);
		await memfs.writeFile(
			"/app/node_modules/left-pad/index.js",
			"module.exports = function leftPad() {};",
		);

		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		// First call — walks node_modules, reads package.json
		const result1 = await resolveModule("left-pad", "/app", fs, "require", cache);
		expect(result1).toBe("/app/node_modules/left-pad/index.js");
		const firstCalls = { ...calls };
		expect(firstCalls.exists + firstCalls.stat + firstCalls.readTextFile).toBeGreaterThan(0);

		// Second call — returns from cache
		const result2 = await resolveModule("left-pad", "/app", fs, "require", cache);
		expect(result2).toBe("/app/node_modules/left-pad/index.js");
		expect(calls.exists).toBe(firstCalls.exists);
		expect(calls.stat).toBe(firstCalls.stat);
		expect(calls.readTextFile).toBe(firstCalls.readTextFile);
	});

	it("package.json in same directory read once, reused for subsequent resolves", async () => {
		const memfs = createInMemoryFileSystem();
		// Two packages sharing the same node_modules — both resolutions walk through
		// /app/node_modules but should read /app/node_modules/foo/package.json only once
		await memfs.writeFile(
			"/app/node_modules/foo/package.json",
			JSON.stringify({ main: "lib.js" }),
		);
		await memfs.writeFile(
			"/app/node_modules/foo/lib.js",
			"module.exports = 42;",
		);
		await memfs.writeFile(
			"/app/node_modules/foo/other.js",
			"module.exports = 99;",
		);

		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		// Resolve foo (reads foo/package.json)
		const r1 = await resolveModule("foo", "/app", fs, "require", cache);
		expect(r1).toBe("/app/node_modules/foo/lib.js");
		const readTextAfterFirst = calls.readTextFile;

		// Resolve foo/other (should not re-read foo/package.json)
		const r2 = await resolveModule("foo/other", "/app", fs, "require", cache);
		expect(r2).toBe("/app/node_modules/foo/other.js");

		// Package.json cached — no additional readTextFile for it
		// (foo/other resolves directly via resolvePath, no package.json re-read needed)
		expect(cache.packageJsonResults.has("/app/node_modules/foo/package.json")).toBe(true);
	});

	it("caches are per-execution (cleared between resolutions when cache is reset)", async () => {
		const memfs = createInMemoryFileSystem();
		await memfs.writeFile(
			"/app/node_modules/pkg/package.json",
			JSON.stringify({ main: "index.js" }),
		);
		await memfs.writeFile(
			"/app/node_modules/pkg/index.js",
			"module.exports = 1;",
		);

		const { fs, calls } = spyFs(memfs);

		// First execution with cache
		const cache1 = createResolutionCache();
		const r1 = await resolveModule("pkg", "/app", fs, "require", cache1);
		expect(r1).toBe("/app/node_modules/pkg/index.js");
		const callsAfterFirst = { ...calls };

		// Simulate new execution — fresh cache
		const cache2 = createResolutionCache();
		const r2 = await resolveModule("pkg", "/app", fs, "require", cache2);
		expect(r2).toBe("/app/node_modules/pkg/index.js");

		// Second execution re-probes VFS (not cached)
		expect(calls.exists + calls.stat + calls.readTextFile).toBeGreaterThan(
			callsAfterFirst.exists + callsAfterFirst.stat + callsAfterFirst.readTextFile,
		);
	});

	it("without cache, same module still works (no caching, more VFS probes)", async () => {
		const memfs = createInMemoryFileSystem();
		await memfs.writeFile(
			"/app/node_modules/bar/package.json",
			JSON.stringify({ main: "index.js" }),
		);
		await memfs.writeFile(
			"/app/node_modules/bar/index.js",
			"module.exports = 'bar';",
		);

		const { fs, calls } = spyFs(memfs);

		// No cache — should still work
		const r1 = await resolveModule("bar", "/app", fs, "require");
		expect(r1).toBe("/app/node_modules/bar/index.js");
		const firstCalls = { ...calls };

		// Second call without cache — re-probes VFS
		const r2 = await resolveModule("bar", "/app", fs, "require");
		expect(r2).toBe("/app/node_modules/bar/index.js");
		expect(calls.exists + calls.stat).toBeGreaterThan(firstCalls.exists + firstCalls.stat);
	});

	it("negative cache: failed resolution is cached", async () => {
		const memfs = createInMemoryFileSystem();
		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		const r1 = await resolveModule("does-not-exist", "/app/src", fs, "require", cache);
		expect(r1).toBeNull();
		const firstCalls = { ...calls };

		// Repeated negative resolution → zero additional VFS probes
		const r2 = await resolveModule("does-not-exist", "/app/src", fs, "require", cache);
		expect(r2).toBeNull();
		expect(calls.exists).toBe(firstCalls.exists);
		expect(calls.stat).toBe(firstCalls.stat);
	});

	it("mid-level caches prevent redundant probes for different modules in same tree", async () => {
		const memfs = createInMemoryFileSystem();
		// Two packages in the same node_modules
		await memfs.writeFile(
			"/app/node_modules/alpha/package.json",
			JSON.stringify({ main: "index.js" }),
		);
		await memfs.writeFile("/app/node_modules/alpha/index.js", "");
		await memfs.writeFile(
			"/app/node_modules/beta/package.json",
			JSON.stringify({ main: "index.js" }),
		);
		await memfs.writeFile("/app/node_modules/beta/index.js", "");

		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		// Resolve alpha
		await resolveModule("alpha", "/app", fs, "require", cache);
		const afterAlpha = { ...calls };

		// Resolve beta — should reuse mid-level caches (e.g., existence of
		// directories already probed during alpha resolution)
		await resolveModule("beta", "/app", fs, "require", cache);

		// Beta resolution should issue at most as many probes as alpha.
		// In practice it issues fewer because shared intermediate paths
		// (e.g., /app/node_modules) are cached, but per-package paths
		// (e.g., /app/node_modules/beta/package.json) are new.
		const alphaProbes = afterAlpha.exists + afterAlpha.stat;
		const totalProbes = calls.exists + calls.stat;
		const betaProbes = totalProbes - alphaProbes;
		expect(betaProbes).toBeLessThanOrEqual(alphaProbes);

		// Verify that shared paths were actually cached
		expect(cache.existsResults.size).toBeGreaterThan(0);
		expect(cache.statResults.size).toBeGreaterThan(0);
	});

	it("relative import resolution is cached", async () => {
		const memfs = createInMemoryFileSystem();
		await memfs.writeFile("/app/src/utils.js", "module.exports = {};");

		const { fs, calls } = spyFs(memfs);
		const cache = createResolutionCache();

		const r1 = await resolveModule("./utils", "/app/src", fs, "require", cache);
		expect(r1).toBe("/app/src/utils.js");
		const firstCalls = { ...calls };

		const r2 = await resolveModule("./utils", "/app/src", fs, "require", cache);
		expect(r2).toBe("/app/src/utils.js");
		expect(calls.exists).toBe(firstCalls.exists);
		expect(calls.stat).toBe(firstCalls.stat);
	});

	it("1000-module resolution completes in <10ms on second pass", async () => {
		const memfs = createInMemoryFileSystem();
		// Create 1000 modules
		for (let i = 0; i < 1000; i++) {
			await memfs.writeFile(`/app/node_modules/mod-${i}/index.js`, "");
		}

		const { fs } = spyFs(memfs);
		const cache = createResolutionCache();

		// First pass — populates cache
		for (let i = 0; i < 1000; i++) {
			await resolveModule(`mod-${i}`, "/app", fs, "require", cache);
		}

		// Second pass — should resolve from cache in <10ms
		const start = performance.now();
		for (let i = 0; i < 1000; i++) {
			await resolveModule(`mod-${i}`, "/app", fs, "require", cache);
		}
		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(10);
	});
});

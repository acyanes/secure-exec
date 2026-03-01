import type { VirtualFileSystem } from "../types.js";

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

function normalizePath(path: string): string {
	if (!path) return "/";
	let normalized = path.startsWith("/") ? path : `/${path}`;
	normalized = normalized.replace(/\/+/g, "/");
	if (normalized.length > 1 && normalized.endsWith("/")) {
		normalized = normalized.slice(0, -1);
	}
	return normalized;
}

function splitPath(path: string): string[] {
	const normalized = normalizePath(path);
	return normalized === "/" ? [] : normalized.slice(1).split("/");
}

function dirname(path: string): string {
	const parts = splitPath(path);
	if (parts.length <= 1) return "/";
	return `/${parts.slice(0, -1).join("/")}`;
}

/**
 * A fully in-memory VirtualFileSystem backed by Maps.
 * Used as the default filesystem for the browser sandbox and for tests.
 * Paths are always POSIX-style (forward slashes, rooted at "/").
 */
export class InMemoryFileSystem implements VirtualFileSystem {
	private files = new Map<string, Uint8Array>();
	private dirs = new Set<string>(["/"]);

	private listDirEntries(
		path: string,
	): Array<{ name: string; isDirectory: boolean }> {
		const normalized = normalizePath(path);
		if (!this.dirs.has(normalized)) {
			throw new Error(
				`ENOENT: no such file or directory, scandir '${normalized}'`,
			);
		}
		const prefix = normalized === "/" ? "/" : `${normalized}/`;
		const entries = new Map<string, boolean>();
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				const rest = filePath.slice(prefix.length);
				if (rest && !rest.includes("/")) {
					entries.set(rest, false);
				}
			}
		}
		for (const dirPath of this.dirs.values()) {
			if (dirPath.startsWith(prefix)) {
				const rest = dirPath.slice(prefix.length);
				if (rest && !rest.includes("/")) {
					entries.set(rest, true);
				}
			}
		}
		return Array.from(entries.entries()).map(([name, isDirectory]) => ({
			name,
			isDirectory,
		}));
	}

	async readFile(path: string): Promise<Uint8Array> {
		const normalized = normalizePath(path);
		const data = this.files.get(normalized);
		if (!data) {
			throw new Error(`ENOENT: no such file or directory, open '${normalized}'`);
		}
		return data;
	}

	async readTextFile(path: string): Promise<string> {
		const data = await this.readFile(path);
		return new TextDecoder().decode(data);
	}

	async readDir(path: string): Promise<string[]> {
		return this.listDirEntries(path).map((entry) => entry.name);
	}

	async readDirWithTypes(
		path: string,
	): Promise<Array<{ name: string; isDirectory: boolean }>> {
		return this.listDirEntries(path);
	}

	async writeFile(path: string, content: string | Uint8Array): Promise<void> {
		const normalized = normalizePath(path);
		await this.mkdir(dirname(normalized));
		const data =
			typeof content === "string" ? new TextEncoder().encode(content) : content;
		this.files.set(normalized, data);
	}

	async createDir(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const parent = dirname(normalized);
		if (!this.dirs.has(parent)) {
			throw new Error(`ENOENT: no such file or directory, mkdir '${normalized}'`);
		}
		this.dirs.add(normalized);
	}

	async mkdir(path: string): Promise<void> {
		const parts = splitPath(path);
		let current = "";
		for (const part of parts) {
			current += `/${part}`;
			if (!this.dirs.has(current)) {
				this.dirs.add(current);
			}
		}
	}

	async exists(path: string): Promise<boolean> {
		const normalized = normalizePath(path);
		return this.files.has(normalized) || this.dirs.has(normalized);
	}

	async stat(path: string): Promise<{
		mode: number;
		size: number;
		isDirectory: boolean;
		atimeMs: number;
		mtimeMs: number;
		ctimeMs: number;
		birthtimeMs: number;
	}> {
		const normalized = normalizePath(path);
		const now = Date.now();
		const file = this.files.get(normalized);
		if (file) {
			return {
				mode: S_IFREG | 0o644,
				size: file.byteLength,
				isDirectory: false,
				atimeMs: now,
				mtimeMs: now,
				ctimeMs: now,
				birthtimeMs: now,
			};
		}
		if (this.dirs.has(normalized)) {
			return {
				mode: S_IFDIR | 0o755,
				size: 4096,
				isDirectory: true,
				atimeMs: now,
				mtimeMs: now,
				ctimeMs: now,
				birthtimeMs: now,
			};
		}
		throw new Error(`ENOENT: no such file or directory, stat '${normalized}'`);
	}

	async removeFile(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (!this.files.delete(normalized)) {
			throw new Error(`ENOENT: no such file or directory, unlink '${normalized}'`);
		}
	}

	async removeDir(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (normalized === "/") {
			throw new Error("EPERM: operation not permitted, rmdir '/'");
		}
		if (!this.dirs.has(normalized)) {
			throw new Error(`ENOENT: no such file or directory, rmdir '${normalized}'`);
		}
		const prefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalized}'`);
			}
		}
		for (const dirPath of this.dirs.values()) {
			if (dirPath !== normalized && dirPath.startsWith(prefix)) {
				throw new Error(`ENOTEMPTY: directory not empty, rmdir '${normalized}'`);
			}
		}
		this.dirs.delete(normalized);
	}

	async rename(oldPath: string, newPath: string): Promise<void> {
		const oldNormalized = normalizePath(oldPath);
		const newNormalized = normalizePath(newPath);
		if (oldNormalized === newNormalized) {
			return;
		}

		if (!this.dirs.has(dirname(newNormalized))) {
			throw new Error(
				`ENOENT: no such file or directory, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}

		if (this.files.has(oldNormalized)) {
			if (this.dirs.has(newNormalized)) {
				throw new Error(
					`EISDIR: illegal operation on a directory, rename '${oldNormalized}' -> '${newNormalized}'`,
				);
			}
			const content = this.files.get(oldNormalized)!;
			this.files.set(newNormalized, content);
			this.files.delete(oldNormalized);
			return;
		}

		if (!this.dirs.has(oldNormalized)) {
			throw new Error(
				`ENOENT: no such file or directory, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}
		if (oldNormalized === "/") {
			throw new Error(`EPERM: operation not permitted, rename '${oldNormalized}'`);
		}
		if (newNormalized.startsWith(`${oldNormalized}/`)) {
			throw new Error(
				`EINVAL: invalid argument, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}
		if (this.dirs.has(newNormalized) || this.files.has(newNormalized)) {
			throw new Error(
				`EEXIST: file already exists, rename '${oldNormalized}' -> '${newNormalized}'`,
			);
		}

		const sourcePrefix = `${oldNormalized}/`;
		const targetPrefix = `${newNormalized}/`;
		const dirPaths = Array.from(this.dirs.values())
			.filter((path) => path === oldNormalized || path.startsWith(sourcePrefix))
			.sort((a, b) => a.length - b.length);
		const filePaths = Array.from(this.files.keys()).filter((path) =>
			path.startsWith(sourcePrefix),
		);

		for (const path of dirPaths) {
			this.dirs.delete(path);
		}
		for (const path of filePaths) {
			const content = this.files.get(path)!;
			this.files.delete(path);
			this.files.set(`${targetPrefix}${path.slice(sourcePrefix.length)}`, content);
		}

		this.dirs.add(newNormalized);
		for (const path of dirPaths) {
			if (path === oldNormalized) {
				continue;
			}
			this.dirs.add(`${targetPrefix}${path.slice(sourcePrefix.length)}`);
		}
	}
}

export function createInMemoryFileSystem(): InMemoryFileSystem {
	return new InMemoryFileSystem();
}

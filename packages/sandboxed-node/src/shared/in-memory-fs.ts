import type { VirtualFileSystem } from "../types.js";

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

export class InMemoryFileSystem implements VirtualFileSystem {
	private files = new Map<string, Uint8Array>();
	private dirs = new Set<string>(["/"]);

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
		const normalized = normalizePath(path);
		if (!this.dirs.has(normalized)) {
			throw new Error(`ENOENT: no such file or directory, scandir '${normalized}'`);
		}
		const prefix = normalized === "/" ? "/" : `${normalized}/`;
		const entries = new Set<string>();
		for (const filePath of this.files.keys()) {
			if (filePath.startsWith(prefix)) {
				const rest = filePath.slice(prefix.length);
				if (rest && !rest.includes("/")) entries.add(rest);
			}
		}
		for (const dirPath of this.dirs.values()) {
			if (dirPath.startsWith(prefix)) {
				const rest = dirPath.slice(prefix.length);
				if (rest && !rest.includes("/")) entries.add(rest);
			}
		}
		return Array.from(entries);
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
}

export function createInMemoryFileSystem(): InMemoryFileSystem {
	return new InMemoryFileSystem();
}

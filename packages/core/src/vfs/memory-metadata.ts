/**
 * Pure JS Map-based FsMetadataStore for ephemeral VMs and tests.
 *
 * All data lives in memory. Root inode (ino=1, type='directory') is created
 * at construction time. transaction() just calls the callback directly since
 * single-threaded JS has no interleaving risk within synchronous sections.
 */

import { KernelError } from "../kernel/types.js";
import type {
	CreateInodeAttrs,
	DentryInfo,
	DentryStatInfo,
	FsMetadataStore,
	InodeMeta,
	InodeType,
} from "./types.js";

const SYMLOOP_MAX = 40;

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

interface DentryEntry {
	childIno: number;
	type: InodeType;
}

export class InMemoryMetadataStore implements FsMetadataStore {
	private nextIno = 2;
	private inodes = new Map<number, InodeMeta>();
	private dentries = new Map<number, Map<string, DentryEntry>>();
	private symlinkTargets = new Map<number, string>();
	private chunks = new Map<number, Map<number, string>>();

	constructor() {
		const now = Date.now();
		const rootInode: InodeMeta = {
			ino: 1,
			type: "directory",
			mode: S_IFDIR | 0o755,
			uid: 0,
			gid: 0,
			size: 0,
			nlink: 2,
			atimeMs: now,
			mtimeMs: now,
			ctimeMs: now,
			birthtimeMs: now,
			storageMode: "inline",
			inlineContent: null,
		};
		this.inodes.set(1, rootInode);
		this.dentries.set(1, new Map());
	}

	// -- Transactions --

	async transaction<T>(fn: () => Promise<T>): Promise<T> {
		return fn();
	}

	// -- Inode lifecycle --

	async createInode(attrs: CreateInodeAttrs): Promise<number> {
		const ino = this.nextIno++;
		const now = Date.now();

		let mode = attrs.mode;
		if (attrs.type === "file") mode |= S_IFREG;
		else if (attrs.type === "directory") mode |= S_IFDIR;
		else if (attrs.type === "symlink") mode |= S_IFLNK;

		const meta: InodeMeta = {
			ino,
			type: attrs.type,
			mode,
			uid: attrs.uid,
			gid: attrs.gid,
			size: 0,
			nlink: 0,
			atimeMs: now,
			mtimeMs: now,
			ctimeMs: now,
			birthtimeMs: now,
			storageMode: "inline",
			inlineContent: null,
		};
		this.inodes.set(ino, meta);

		if (attrs.type === "directory") {
			this.dentries.set(ino, new Map());
		}

		if (attrs.type === "symlink" && attrs.symlinkTarget !== undefined) {
			this.symlinkTargets.set(ino, attrs.symlinkTarget);
		}

		return ino;
	}

	async getInode(ino: number): Promise<InodeMeta | null> {
		return this.inodes.get(ino) ?? null;
	}

	async updateInode(ino: number, updates: Partial<InodeMeta>): Promise<void> {
		const meta = this.inodes.get(ino);
		if (!meta) return;
		Object.assign(meta, updates);
	}

	async deleteInode(ino: number): Promise<void> {
		this.inodes.delete(ino);
		this.dentries.delete(ino);
		this.symlinkTargets.delete(ino);
		this.chunks.delete(ino);
	}

	// -- Directory entries --

	async lookup(parentIno: number, name: string): Promise<number | null> {
		const dir = this.dentries.get(parentIno);
		if (!dir) return null;
		const entry = dir.get(name);
		return entry ? entry.childIno : null;
	}

	async createDentry(
		parentIno: number,
		name: string,
		childIno: number,
		type: InodeType,
	): Promise<void> {
		let dir = this.dentries.get(parentIno);
		if (!dir) {
			dir = new Map();
			this.dentries.set(parentIno, dir);
		}
		if (dir.has(name)) {
			throw new KernelError("EEXIST", `'${name}' already exists in directory`);
		}
		dir.set(name, { childIno, type });
	}

	async removeDentry(parentIno: number, name: string): Promise<void> {
		const dir = this.dentries.get(parentIno);
		if (dir) {
			dir.delete(name);
		}
	}

	async listDir(parentIno: number): Promise<DentryInfo[]> {
		const dir = this.dentries.get(parentIno);
		if (!dir) return [];
		const result: DentryInfo[] = [];
		for (const [name, entry] of dir) {
			result.push({ name, ino: entry.childIno, type: entry.type });
		}
		return result;
	}

	async listDirWithStats(parentIno: number): Promise<DentryStatInfo[]> {
		const dir = this.dentries.get(parentIno);
		if (!dir) return [];
		const result: DentryStatInfo[] = [];
		for (const [name, entry] of dir) {
			const meta = this.inodes.get(entry.childIno);
			if (meta) {
				result.push({ name, ino: entry.childIno, type: entry.type, stat: meta });
			}
		}
		return result;
	}

	async renameDentry(
		srcParentIno: number,
		srcName: string,
		dstParentIno: number,
		dstName: string,
	): Promise<void> {
		const srcDir = this.dentries.get(srcParentIno);
		if (!srcDir) return;
		const entry = srcDir.get(srcName);
		if (!entry) return;

		srcDir.delete(srcName);

		let dstDir = this.dentries.get(dstParentIno);
		if (!dstDir) {
			dstDir = new Map();
			this.dentries.set(dstParentIno, dstDir);
		}
		dstDir.set(dstName, entry);
	}

	// -- Path resolution --

	async resolvePath(path: string): Promise<number> {
		const components = splitPathComponents(path);
		return this.resolveComponents(components, 0);
	}

	async resolveParentPath(
		path: string,
	): Promise<{ parentIno: number; name: string }> {
		const components = splitPathComponents(path);
		if (components.length === 0) {
			throw new KernelError("ENOENT", `cannot resolve parent of root`);
		}
		const name = components[components.length - 1]!;
		const parentComponents = components.slice(0, -1);
		const parentIno = await this.resolveComponents(parentComponents, 0);
		return { parentIno, name };
	}

	// -- Symlinks --

	async readSymlink(ino: number): Promise<string> {
		const target = this.symlinkTargets.get(ino);
		if (target === undefined) {
			throw new KernelError("EINVAL", `inode ${ino} is not a symlink`);
		}
		return target;
	}

	// -- Chunk mapping --

	async getChunkKey(ino: number, chunkIndex: number): Promise<string | null> {
		const map = this.chunks.get(ino);
		if (!map) return null;
		return map.get(chunkIndex) ?? null;
	}

	async setChunkKey(
		ino: number,
		chunkIndex: number,
		key: string,
	): Promise<void> {
		let map = this.chunks.get(ino);
		if (!map) {
			map = new Map();
			this.chunks.set(ino, map);
		}
		map.set(chunkIndex, key);
	}

	async getAllChunkKeys(
		ino: number,
	): Promise<{ chunkIndex: number; key: string }[]> {
		const map = this.chunks.get(ino);
		if (!map) return [];
		const entries: { chunkIndex: number; key: string }[] = [];
		for (const [chunkIndex, key] of map) {
			entries.push({ chunkIndex, key });
		}
		entries.sort((a, b) => a.chunkIndex - b.chunkIndex);
		return entries;
	}

	async deleteAllChunks(ino: number): Promise<string[]> {
		const map = this.chunks.get(ino);
		if (!map) return [];
		const keys = Array.from(map.values());
		this.chunks.delete(ino);
		return keys;
	}

	async deleteChunksFrom(ino: number, startIndex: number): Promise<string[]> {
		const map = this.chunks.get(ino);
		if (!map) return [];
		const deleted: string[] = [];
		for (const [idx, key] of map) {
			if (idx >= startIndex) {
				deleted.push(key);
				map.delete(idx);
			}
		}
		return deleted;
	}

	// -- Internal helpers --

	private async resolveComponents(
		components: string[],
		symlinkDepth: number,
	): Promise<number> {
		let currentIno = 1; // root

		for (let i = 0; i < components.length; i++) {
			const name = components[i]!;
			const meta = this.inodes.get(currentIno);
			if (!meta || meta.type !== "directory") {
				throw new KernelError(
					"ENOENT",
					`no such file or directory: component '${name}'`,
				);
			}

			const dir = this.dentries.get(currentIno);
			if (!dir) {
				throw new KernelError(
					"ENOENT",
					`no such file or directory: component '${name}'`,
				);
			}

			const entry = dir.get(name);
			if (!entry) {
				throw new KernelError(
					"ENOENT",
					`no such file or directory: '${name}'`,
				);
			}

			currentIno = entry.childIno;

			// Follow symlinks.
			const childMeta = this.inodes.get(currentIno);
			if (childMeta && childMeta.type === "symlink") {
				if (symlinkDepth >= SYMLOOP_MAX) {
					throw new KernelError("ELOOP", "too many levels of symbolic links");
				}
				const target = this.symlinkTargets.get(currentIno);
				if (!target) {
					throw new KernelError("ENOENT", "dangling symlink");
				}

				// Resolve symlink target relative to current position.
				const targetComponents = splitPathComponents(target);
				const remaining = components.slice(i + 1);
				const fullComponents = target.startsWith("/")
					? [...targetComponents, ...remaining]
					: [
							...this.getPathComponents(currentIno, components.slice(0, i)),
							...targetComponents,
							...remaining,
						];

				return this.resolveComponents(fullComponents, symlinkDepth + 1);
			}
		}

		return currentIno;
	}

	/**
	 * Get the parent path components for resolving a relative symlink.
	 * We need to reconstruct the parent directory path from the components
	 * we have already resolved (everything before the symlink).
	 */
	private getPathComponents(
		_symlinkIno: number,
		parentComponents: string[],
	): string[] {
		return parentComponents;
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitPathComponents(path: string): string[] {
	if (!path || path === "/") return [];
	const normalized = path.startsWith("/") ? path.slice(1) : path;
	return normalized.split("/").filter((c) => c.length > 0);
}

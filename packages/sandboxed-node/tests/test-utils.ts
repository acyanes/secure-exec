import { createInMemoryFileSystem } from "../src/index.js";
import type { VirtualFileSystem } from "../src/types.js";

export function createTestFileSystem(): VirtualFileSystem {
	return createInMemoryFileSystem();
}

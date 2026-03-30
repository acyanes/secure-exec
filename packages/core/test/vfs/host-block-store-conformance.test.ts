import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { defineBlockStoreTests } from "../../src/test/block-store-conformance.js";
import { HostBlockStore } from "../../src/vfs/host-block-store.js";

let tmpDir: string;

defineBlockStoreTests({
	name: "HostBlockStore",
	createStore: async () => {
		tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "host-block-store-"));
		return new HostBlockStore(tmpDir);
	},
	cleanup: async () => {
		if (tmpDir) {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
	},
	capabilities: {
		copy: true,
	},
});

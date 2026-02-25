import { afterEach, describe, expect, it } from "vitest";
import { NodeProcess, createInMemoryFileSystem } from "../src/index.js";

function createFs() {
	return createInMemoryFileSystem();
}

describe("NodeProcess", () => {
	let proc: NodeProcess | undefined;

	afterEach(() => {
		proc?.dispose();
		proc = undefined;
	});

	it("runs basic code and returns module.exports", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`module.exports = 1 + 1`);
		expect(result.exports).toBe(2);
	});

	it("captures stdout and stderr", async () => {
		proc = new NodeProcess();
		const result = await proc.exec(`console.log('hello'); console.error('oops');`);
		expect(result.stdout).toBe("hello\n");
		expect(result.stderr).toBe("oops\n");
		expect(result.code).toBe(0);
	});

	it("loads node stdlib polyfills", async () => {
		proc = new NodeProcess();
		const result = await proc.run(`
      const path = require('path');
      module.exports = path.join('foo', 'bar');
    `);
		expect(result.exports).toBe("foo/bar");
	});

	it("errors for unknown modules", async () => {
		proc = new NodeProcess();
		const result = await proc.exec(`require('nonexistent-module')`);
		expect(result.code).toBe(1);
		expect(result.stderr).toContain("Cannot find module");
	});

	it("loads packages from virtual node_modules", async () => {
		const fs = createFs();
		await fs.mkdir("/node_modules/my-pkg");
		await fs.writeFile(
			"/node_modules/my-pkg/package.json",
			JSON.stringify({ name: "my-pkg", main: "index.js" }),
		);
		await fs.writeFile(
			"/node_modules/my-pkg/index.js",
			"module.exports = { add: (a, b) => a + b };",
		);

		proc = new NodeProcess({ filesystem: fs });
		const result = await proc.run(`
      const pkg = require('my-pkg');
      module.exports = pkg.add(2, 3);
    `);
		expect(result.exports).toBe(5);
	});

	it("exposes fs module backed by virtual filesystem", async () => {
		const fs = createFs();
		await fs.mkdir("/data");
		await fs.writeFile("/data/hello.txt", "hello world");

		proc = new NodeProcess({ filesystem: fs });
		const result = await proc.run(`
      const fs = require('fs');
      module.exports = fs.readFileSync('/data/hello.txt', 'utf8');
    `);
		expect(result.exports).toBe("hello world");
	});
});

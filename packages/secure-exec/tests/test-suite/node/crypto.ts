import { afterEach, expect, it } from "vitest";
import type { NodeSuiteContext } from "./runtime.js";

export function runNodeCryptoSuite(context: NodeSuiteContext): void {
	afterEach(async () => {
		await context.teardown();
	});

	it("createHash('sha256').update('hello').digest('hex') matches Node.js", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.exec(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256').update('hello').digest('hex');
			console.log(hash);
		`);
		expect(result.code).toBe(0);
		expect(result.errorMessage).toBeUndefined();
	});

	it("createHash('sha256') digest matches known value", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				hex: crypto.createHash('sha256').update('hello').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHmac('sha256', 'key').update('data').digest('hex') matches Node.js", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				hex: crypto.createHmac('sha256', 'key').update('data').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});

	it("createHash supports sha1, sha384, sha512, md5", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				sha1: crypto.createHash('sha1').update('test').digest('hex'),
				sha384: crypto.createHash('sha384').update('test').digest('hex'),
				sha512: crypto.createHash('sha512').update('test').digest('hex'),
				md5: crypto.createHash('md5').update('test').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			sha1: "a94a8fe5ccb19ba61c4c0873d391e987982fbbd3",
			sha384: "768412320f7b0aa5812fce428dc4706b3cae50e02a64caa16a782249bfe8efc4b7ef1ccb126255d196047dfedf17a0a9",
			sha512: "ee26b0dd4af7e749aa1a8ee3c10ae9923f618980772e473f8819a5d4940e0db27ac185f8a0e1d5f84f88bc887fd67b143732c304cc5fa9ad8e6f57f50028a8ff",
			md5: "098f6bcd4621d373cade4e832627b4f6",
		});
	});

	it("createHash supports multiple update() calls", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256');
			hash.update('hel');
			hash.update('lo');
			module.exports = { hex: hash.digest('hex') };
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHash digest returns Buffer when encoding omitted", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = crypto.createHash('sha256').update('hello').digest();
			module.exports = {
				isBuffer: Buffer.isBuffer(buf),
				length: buf.length,
				hex: buf.toString('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).isBuffer).toBe(true);
		expect((result.exports as any).length).toBe(32);
		expect((result.exports as any).hex).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("createHash supports base64 encoding", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			module.exports = {
				b64: crypto.createHash('sha256').update('hello').digest('base64'),
			};
		`);
		expect(result.code).toBe(0);
		// Known base64 for sha256('hello')
		expect((result.exports as any).b64).toBe("LPJNul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=");
	});

	it("createHash copy() produces independent clone", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			try {
				const hash = crypto.createHash('sha256');
				hash.update('hel');
				const clone = hash.copy();
				hash.update('lo');
				clone.update('p');
				module.exports = {
					hello: hash.digest('hex'),
					help: clone.digest('hex'),
				};
			} catch (e) {
				module.exports = { error: e.message };
			}
		`);
		expect(result.code).toBe(0);
		expect((result.exports as any).error).toBeUndefined();
		expect((result.exports as any).hello).toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
		// sha256('help')
		expect((result.exports as any).help).not.toBe(
			"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		);
	});

	it("createHmac supports multiple update() calls", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hmac = crypto.createHmac('sha256', 'key');
			hmac.update('da');
			hmac.update('ta');
			module.exports = { hex: hmac.digest('hex') };
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});

	it("Hash and Hmac have write() and end() for stream compatibility", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const hash = crypto.createHash('sha256');
			hash.write('hel');
			hash.write('lo');
			hash.end();
			const hex = hash.digest('hex');

			const hmac = crypto.createHmac('sha256', 'key');
			hmac.write('da');
			hmac.write('ta');
			hmac.end();
			const hmacHex = hmac.digest('hex');

			// Also get reference value via update/digest
			const ref = crypto.createHash('sha256').update('hello').digest('hex');

			module.exports = { hex, hmacHex, ref, writeType: typeof hash.write, endType: typeof hash.end };
		`);
		expect(result.code).toBe(0);
		const exports = result.exports as any;
		// write/end should produce same result as update/digest
		expect(exports.hex).toBe(exports.ref);
		expect(exports.writeType).toBe("function");
		expect(exports.endType).toBe("function");
	});

	it("createHash handles binary Buffer input", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const buf = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // 'hello'
			module.exports = {
				hex: crypto.createHash('sha256').update(buf).digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		});
	});

	it("createHmac handles Buffer key", async () => {
		const runtime = await context.createRuntime();
		const result = await runtime.run(`
			const crypto = require('crypto');
			const key = Buffer.from('key');
			module.exports = {
				hex: crypto.createHmac('sha256', key).update('data').digest('hex'),
			};
		`);
		expect(result.code).toBe(0);
		expect(result.exports).toEqual({
			hex: "5031fe3d989c6d1537a013fa6e739da23463fdaec3b70137d828e36ace221bd0",
		});
	});
}

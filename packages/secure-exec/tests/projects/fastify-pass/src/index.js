"use strict";

const Fastify = require("fastify");
const { EventEmitter } = require("events");

// ---- App setup ----

const app = Fastify({ logger: false });

app.get("/hello", async () => {
	return { message: "hello" };
});

app.get("/users/:id", async (request) => {
	return { id: request.params.id, name: "test-user" };
});

app.post("/data", async (request) => {
	return { method: request.method, url: request.url, body: request.body };
});

// Async handler with await
app.get("/async", async () => {
	const value = await Promise.resolve(42);
	return { value };
});

// ---- Programmatic request dispatch ----

function dispatch(method, url, options) {
	return new Promise((resolve, reject) => {
		const headers = (options && options.headers) || {};
		const bodyData = options && options.body;

		const req = new EventEmitter();
		req.method = method;
		req.url = url;
		req.headers = Object.assign(
			{ host: "localhost" },
			Object.fromEntries(
				Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v])
			)
		);
		req.connection = { remoteAddress: "127.0.0.1", encrypted: false };
		req.socket = {
			remoteAddress: "127.0.0.1",
			encrypted: false,
			writable: true,
			on: function () { return this; },
			removeListener: function () { return this; },
			destroy: function () {},
			end: function () {},
		};
		req.unpipe = function () {};
		req.pause = function () {};
		req.resume = function () {};
		req.readable = true;
		req.setEncoding = function () { return this; };
		req.read = function () { return null; };
		req.destroy = function () { return this; };
		req.pipe = function (dest) { return dest; };
		req.isPaused = function () { return false; };
		req._readableState = { flowing: null };
		req.httpVersion = "1.1";
		req.httpVersionMajor = 1;
		req.httpVersionMinor = 1;

		const mockSocket = {
			writable: true,
			on: function () { return mockSocket; },
			removeListener: function () { return mockSocket; },
			destroy: function () {},
			end: function () {},
			cork: function () {},
			uncork: function () {},
			write: function () { return true; },
		};

		const res = new EventEmitter();
		res.statusCode = 200;
		res.statusMessage = "OK";
		res._headers = {};
		res.headersSent = false;
		res.finished = false;
		res.writableFinished = false;
		res.writableEnded = false;
		res.socket = mockSocket;
		res.connection = mockSocket;
		res._headerNames = {};
		res.outputData = [];

		res.setHeader = function (k, v) {
			this._headers[k.toLowerCase()] = v;
			this._headerNames[k.toLowerCase()] = k;
		};
		res.getHeader = function (k) {
			return this._headers[k.toLowerCase()];
		};
		res.removeHeader = function (k) {
			delete this._headers[k.toLowerCase()];
			delete this._headerNames[k.toLowerCase()];
		};
		res.hasHeader = function (k) {
			return k.toLowerCase() in this._headers;
		};
		res.getHeaderNames = function () {
			return Object.keys(this._headers);
		};
		res.getHeaders = function () {
			return Object.assign({}, this._headers);
		};
		res.writeHead = function (code, reason, headers) {
			this.statusCode = code;
			if (typeof reason === "string") {
				this.statusMessage = reason;
			} else if (typeof reason === "object" && reason !== null) {
				headers = reason;
			}
			if (headers) {
				Object.entries(headers).forEach(([k, v]) => this.setHeader(k, v));
			}
			this.headersSent = true;
			return this;
		};
		res.assignSocket = function () {};
		res.detachSocket = function () {};
		res.writeContinue = function () {};
		res.writeProcessing = function () {};
		res.setTimeout = function () { return this; };
		res.addTrailers = function () {};
		res.flushHeaders = function () { this.headersSent = true; };
		res.cork = function () {};
		res.uncork = function () {};

		let body = "";
		res.write = function (chunk, encoding, cb) {
			if (typeof encoding === "function") { cb = encoding; }
			body +=
				typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
			if (cb) cb();
			return true;
		};
		res.end = function (data, encoding, cb) {
			if (typeof data === "function") {
				cb = data;
				data = undefined;
			} else if (typeof encoding === "function") {
				cb = encoding;
			}
			if (data) {
				body +=
					typeof data === "string" ? data : Buffer.from(data).toString();
			}
			this.headersSent = true;
			this.finished = true;
			this.writableFinished = true;
			this.writableEnded = true;
			this.emit("finish");
			this.emit("close");
			if (cb) cb();
			resolve({ status: this.statusCode, body });
		};

		// Route through Fastify's request handler
		app.routing(req, res);

		// Emit body data and end for POST requests
		if (bodyData) {
			const payload =
				typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData);
			req.emit("data", Buffer.from(payload));
		}
		req.emit("end");
	});
}

// ---- Run tests ----

async function main() {
	await app.ready();

	const results = [];

	const r1 = await dispatch("GET", "/hello");
	results.push({
		route: "GET /hello",
		status: r1.status,
		body: JSON.parse(r1.body),
	});

	const r2 = await dispatch("GET", "/users/42");
	results.push({
		route: "GET /users/42",
		status: r2.status,
		body: JSON.parse(r2.body),
	});

	const r3 = await dispatch("POST", "/data", {
		headers: { "Content-Type": "application/json" },
		body: { key: "value" },
	});
	results.push({
		route: "POST /data",
		status: r3.status,
		body: JSON.parse(r3.body),
	});

	const r4 = await dispatch("GET", "/async");
	results.push({
		route: "GET /async",
		status: r4.status,
		body: JSON.parse(r4.body),
	});

	console.log(JSON.stringify(results));

	await app.close();
}

main().catch((err) => {
	console.error(err.message);
	process.exit(1);
});

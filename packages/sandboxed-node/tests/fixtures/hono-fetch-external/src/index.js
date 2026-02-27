const { fetch } = require("./router");

async function routerFetchEnvelope(input) {
	const init = {
		method: input.method,
		headers: input.headers,
	};
	const request = new Request(input.url, init);
	const response = await fetch(request);
	const body = await response.text();

	return {
		status: response.status,
		headers: Object.fromEntries(response.headers.entries()),
		bodyBase64: Buffer.from(body, "utf8").toString("base64"),
	};
}

module.exports = { routerFetchEnvelope };

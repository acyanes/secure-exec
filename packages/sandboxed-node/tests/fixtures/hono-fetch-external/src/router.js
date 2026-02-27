const { Hono } = require("hono");

const app = new Hono();
let incrementCount = 0;

app.get("/hello", (c) => c.text("hello from sandboxed hono"));
app.get("/increment", (c) => {
	incrementCount += 1;
	return c.text(String(incrementCount));
});

module.exports = { fetch: app.fetch };

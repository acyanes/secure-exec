"use strict";

var mysql = require("mysql2");

var result = {
	createConnectionExists: typeof mysql.createConnection === "function",
	createPoolExists: typeof mysql.createPool === "function",
	createPoolClusterExists: typeof mysql.createPoolCluster === "function",
};

// Verify mysql2 internal protocol classes loaded (via public re-exports)
var Types = mysql.Types;
result.typesExists = typeof Types === "object" && Types !== null;

// Verify charset constants
result.hasCharsets = typeof mysql.Charsets === "object" && mysql.Charsets !== null;

// Verify escape/format utilities
result.escapeString = mysql.escape("hello 'world'");
result.escapeId = mysql.escapeId("table name");
result.formatSql = mysql.format("SELECT ? FROM ??", ["value", "table"]);

// Verify raw() for prepared statements
result.hasRaw = typeof mysql.raw === "function";

// Verify promise wrapper is available
var mysqlPromise = require("mysql2/promise");
result.promiseCreateConnection = typeof mysqlPromise.createConnection === "function";
result.promiseCreatePool = typeof mysqlPromise.createPool === "function";

console.log(JSON.stringify(result));

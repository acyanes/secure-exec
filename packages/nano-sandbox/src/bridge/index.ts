// Bridge module entry point
// This file is compiled to a single JS bundle that gets injected into the isolate

import fs from "./fs.js";
import os from "./os.js";
import childProcess from "./child-process.js";
import process, { ProcessExitError } from "./process.js";
import zlib from "./zlib.js";
import moduleModule, { createRequire, Module } from "./module.js";
import {
  fetch,
  Headers,
  Request,
  Response,
  dns,
  http,
  https,
  IncomingMessage,
  ClientRequest,
} from "./network.js";

// Export all bridge modules
export {
  // Core modules
  fs,
  os,
  childProcess,
  process,
  zlib,
  moduleModule,

  // Module utilities
  createRequire,
  Module,
  ProcessExitError,

  // Network modules
  fetch,
  Headers,
  Request,
  Response,
  dns,
  http,
  https,
  IncomingMessage,
  ClientRequest,
};

// Make fs available as the default export for convenience
export default fs;

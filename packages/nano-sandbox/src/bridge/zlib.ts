// zlib polyfill module for isolated-vm
// This module runs inside the isolate and provides Node.js zlib API compatibility

import { Buffer } from "buffer";
import type * as nodeZlib from "zlib";

// Constants
const constants = {
  Z_NO_FLUSH: 0,
  Z_PARTIAL_FLUSH: 1,
  Z_SYNC_FLUSH: 2,
  Z_FULL_FLUSH: 3,
  Z_FINISH: 4,
  Z_BLOCK: 5,
  Z_OK: 0,
  Z_STREAM_END: 1,
  Z_NEED_DICT: 2,
  Z_ERRNO: -1,
  Z_STREAM_ERROR: -2,
  Z_DATA_ERROR: -3,
  Z_MEM_ERROR: -4,
  Z_BUF_ERROR: -5,
  Z_VERSION_ERROR: -6,
  Z_NO_COMPRESSION: 0,
  Z_BEST_SPEED: 1,
  Z_BEST_COMPRESSION: 9,
  Z_DEFAULT_COMPRESSION: -1,
  Z_FILTERED: 1,
  Z_HUFFMAN_ONLY: 2,
  Z_RLE: 3,
  Z_FIXED: 4,
  Z_DEFAULT_STRATEGY: 0,
  Z_BINARY: 0,
  Z_TEXT: 1,
  Z_UNKNOWN: 2,
  DEFLATE: 1,
  INFLATE: 2,
  GZIP: 3,
  GUNZIP: 4,
  DEFLATERAW: 5,
  INFLATERAW: 6,
  UNZIP: 7,
  Z_MIN_WINDOWBITS: 8,
  Z_MAX_WINDOWBITS: 15,
  Z_DEFAULT_WINDOWBITS: 15,
  Z_MIN_CHUNK: 64,
  Z_MAX_CHUNK: Infinity,
  Z_DEFAULT_CHUNK: 16384,
  Z_MIN_MEMLEVEL: 1,
  Z_MAX_MEMLEVEL: 9,
  Z_DEFAULT_MEMLEVEL: 8,
  Z_MIN_LEVEL: -1,
  Z_MAX_LEVEL: 9,
  Z_DEFAULT_LEVEL: -1,
  BROTLI_DECODE: 0,
  BROTLI_ENCODE: 1,
  BROTLI_OPERATION_PROCESS: 0,
  BROTLI_OPERATION_FLUSH: 1,
  BROTLI_OPERATION_FINISH: 2,
  BROTLI_OPERATION_EMIT_METADATA: 3,
  BROTLI_PARAM_MODE: 0,
  BROTLI_PARAM_QUALITY: 1,
  BROTLI_PARAM_LGWIN: 2,
  BROTLI_PARAM_LGBLOCK: 3,
  BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING: 4,
  BROTLI_PARAM_SIZE_HINT: 5,
  BROTLI_PARAM_LARGE_WINDOW: 6,
  BROTLI_PARAM_NPOSTFIX: 7,
  BROTLI_PARAM_NDIRECT: 8,
  BROTLI_DEFAULT_MODE: 0,
  BROTLI_MODE_GENERIC: 0,
  BROTLI_MODE_TEXT: 1,
  BROTLI_MODE_FONT: 2,
  BROTLI_DEFAULT_QUALITY: 11,
  BROTLI_MIN_QUALITY: 0,
  BROTLI_MAX_QUALITY: 11,
  BROTLI_DEFAULT_WINDOW: 22,
  BROTLI_MIN_WINDOW_BITS: 10,
  BROTLI_MAX_WINDOW_BITS: 24,
  BROTLI_LARGE_MAX_WINDOW_BITS: 30,
  BROTLI_MIN_INPUT_BLOCK_BITS: 16,
  BROTLI_MAX_INPUT_BLOCK_BITS: 24,
  BROTLI_DECODER_RESULT_ERROR: 0,
  BROTLI_DECODER_RESULT_SUCCESS: 1,
  BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT: 2,
  BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT: 3,
  BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION: 0,
  BROTLI_DECODER_PARAM_LARGE_WINDOW: 1,
  BROTLI_DECODER_NO_ERROR: 0,
  BROTLI_DECODER_SUCCESS: 1,
  BROTLI_DECODER_NEEDS_MORE_INPUT: 2,
  BROTLI_DECODER_NEEDS_MORE_OUTPUT: 3,
};

// ZlibError class
class ZlibError extends Error {
  code: string;
  constructor(message: string) {
    super(message);
    this.name = "ZlibError";
    this.code = "Z_DATA_ERROR";
  }
}

// CRC32 calculation
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return crc ^ 0xffffffff;
}

// Inflate raw deflate data (no gzip header)
function inflateDeflate(input: Uint8Array): Buffer {
  let pos = 0;
  let bitBuf = 0;
  let bitCnt = 0;
  const output: number[] = [];

  function readBits(n: number): number {
    while (bitCnt < n) {
      if (pos >= input.length) {
        throw new ZlibError("Unexpected end of data");
      }
      bitBuf |= input[pos++] << bitCnt;
      bitCnt += 8;
    }
    const val = bitBuf & ((1 << n) - 1);
    bitBuf >>= n;
    bitCnt -= n;
    return val;
  }

  // Static Huffman tables
  const staticLitLen = new Uint16Array(288);
  const staticDist = new Uint16Array(32);

  // Build static literal/length table
  for (let i = 0; i < 144; i++) staticLitLen[i] = (8 << 8) | (i + 48);
  for (let i = 144; i < 256; i++) staticLitLen[i] = (9 << 8) | (i - 144 + 400);
  for (let i = 256; i < 280; i++) staticLitLen[i] = (7 << 8) | (i - 256);
  for (let i = 280; i < 288; i++) staticLitLen[i] = (8 << 8) | (i - 280 + 192);

  // Build static distance table
  for (let i = 0; i < 32; i++) staticDist[i] = (5 << 8) | i;

  // Length base values
  const lenBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const lenExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];

  // Distance base values
  const distBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const distExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

  while (true) {
    const bfinal = readBits(1);
    const btype = readBits(2);

    if (btype === 0) {
      // Stored block
      bitBuf = 0;
      bitCnt = 0;
      if (pos + 4 > input.length) throw new ZlibError("Unexpected end of data");
      const len = input[pos] | (input[pos + 1] << 8);
      pos += 4;
      if (pos + len > input.length) throw new ZlibError("Unexpected end of data");
      for (let i = 0; i < len; i++) {
        output.push(input[pos++]);
      }
    } else if (btype === 1 || btype === 2) {
      // Fixed or dynamic Huffman
      if (btype === 2) {
        // Dynamic Huffman - not fully implemented
        throw new ZlibError("Dynamic Huffman not fully implemented");
      }

      // Decode using static Huffman tables
      while (true) {
        // Read literal/length code
        let code = 0;
        for (let bits = 1; bits <= 15; bits++) {
          code = (code << 1) | readBits(1);
          // Simple linear search
          for (let i = 0; i < 288; i++) {
            const entry = staticLitLen[i];
            if ((entry >> 8) === bits && (entry & 0xff) === code) {
              code = i;
              break;
            }
          }
          if (code < 288) break;
        }

        if (code < 256) {
          output.push(code);
        } else if (code === 256) {
          break; // End of block
        } else {
          // Length code
          code -= 257;
          const len = lenBase[code] + readBits(lenExtra[code]);

          // Read distance code
          let dist = readBits(5);
          dist = distBase[dist] + readBits(distExtra[dist]);

          // Copy from output buffer
          const srcPos = output.length - dist;
          for (let i = 0; i < len; i++) {
            output.push(output[srcPos + i]);
          }
        }
      }
    } else {
      throw new ZlibError("Invalid block type");
    }

    if (bfinal) break;
  }

  return Buffer.from(output);
}

// Gunzip implementation
function gunzipSync(input: Buffer | Uint8Array): Buffer {
  let data: Uint8Array;
  if (Buffer.isBuffer(input)) {
    data = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else if (input instanceof ArrayBuffer) {
    data = new Uint8Array(input);
  } else {
    data = input;
  }

  // Validate gzip header
  if (data.length < 10) {
    throw new ZlibError("Invalid gzip data: too short");
  }

  if (data[0] !== 0x1f || data[1] !== 0x8b) {
    throw new ZlibError("Invalid gzip header");
  }

  const method = data[2];
  if (method !== 8) {
    throw new ZlibError("Unknown compression method");
  }

  const flags = data[3];
  let pos = 10;

  // Skip extra field
  if (flags & 0x04) {
    const extraLen = data[pos] | (data[pos + 1] << 8);
    pos += 2 + extraLen;
  }

  // Skip filename
  if (flags & 0x08) {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  }

  // Skip comment
  if (flags & 0x10) {
    while (pos < data.length && data[pos] !== 0) pos++;
    pos++;
  }

  // Skip header CRC
  if (flags & 0x02) {
    pos += 2;
  }

  // Get compressed data (excluding 8-byte trailer: 4-byte CRC + 4-byte size)
  const compressed = data.subarray(pos, data.length - 8);

  return inflateDeflate(compressed);
}

// Gzip implementation (compress)
function gzipSync(input: Buffer | string | Uint8Array): Buffer {
  let data: Buffer;
  if (typeof input === "string") {
    data = Buffer.from(input);
  } else if (input instanceof Uint8Array && !Buffer.isBuffer(input)) {
    data = Buffer.from(input);
  } else {
    data = input as Buffer;
  }

  const header = Buffer.from([
    0x1f, 0x8b, // Magic
    0x08, // Compression method (deflate)
    0x00, // Flags
    0x00, 0x00, 0x00, 0x00, // Modification time
    0x00, // Extra flags
    0xff, // OS (unknown)
  ]);

  // Create stored deflate block (no compression)
  const len = data.length;
  const stored = Buffer.alloc(5 + len);
  stored[0] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  stored[1] = len & 0xff;
  stored[2] = (len >> 8) & 0xff;
  stored[3] = ~len & 0xff;
  stored[4] = (~len >> 8) & 0xff;
  data.copy(stored, 5);

  // Calculate CRC32
  const crc = crc32(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));

  // Write trailer
  const trailer = Buffer.alloc(8);
  trailer[0] = crc & 0xff;
  trailer[1] = (crc >>> 8) & 0xff;
  trailer[2] = (crc >>> 16) & 0xff;
  trailer[3] = (crc >>> 24) & 0xff;
  trailer[4] = len & 0xff;
  trailer[5] = (len >>> 8) & 0xff;
  trailer[6] = (len >>> 16) & 0xff;
  trailer[7] = (len >>> 24) & 0xff;

  return Buffer.concat([header, stored, trailer]);
}

// Deflate (raw)
function deflateSync(input: Buffer | string | Uint8Array): Buffer {
  let data: Buffer;
  if (typeof input === "string") {
    data = Buffer.from(input);
  } else if (input instanceof Uint8Array && !Buffer.isBuffer(input)) {
    data = Buffer.from(input);
  } else {
    data = input as Buffer;
  }

  // Create stored deflate block (no compression)
  const len = data.length;
  const output = Buffer.alloc(5 + len);
  output[0] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  output[1] = len & 0xff;
  output[2] = (len >> 8) & 0xff;
  output[3] = ~len & 0xff;
  output[4] = (~len >> 8) & 0xff;
  data.copy(output, 5);
  return output;
}

// Inflate (raw deflate)
function inflateSync(input: Buffer | Uint8Array): Buffer {
  const data = Buffer.isBuffer(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : input;
  return inflateDeflate(data);
}

// Raw variants
function deflateRawSync(input: Buffer | string | Uint8Array): Buffer {
  return deflateSync(input);
}

function inflateRawSync(input: Buffer | Uint8Array): Buffer {
  return inflateSync(input);
}

// Event listener type
type EventListener = (...args: unknown[]) => void;

// ZlibStream class - Transform-like interface
class ZlibStream {
  protected _mode: string;
  protected _chunks: Buffer[] = [];
  protected _listeners: Record<string, EventListener[]> = {};
  protected _finished = false;
  protected _closed = false;
  readable = true;
  writable = true;

  // _handle is needed for minizlib compatibility
  _handle: {
    close: () => void;
    _processChunk: (chunk: Buffer, flushFlag: number) => Buffer;
    reset: () => void;
    on: () => unknown;
    once: () => unknown;
    removeAllListeners: () => unknown;
    emit: () => boolean;
  };

  constructor(mode: string) {
    this._mode = mode;

    // Create handle for minizlib compatibility
    this._handle = {
      close: () => {},
      _processChunk: (chunk: Buffer, flushFlag: number) => this._processChunkSync(chunk, flushFlag),
      reset: () => {
        this._chunks = [];
        this._finished = false;
      },
      on: () => this,
      once: () => this,
      removeAllListeners: () => this,
      emit: () => false,
    };
  }

  _processChunk(chunk: Buffer, flushFlag: number): Buffer {
    return this._processChunkSync(chunk, flushFlag);
  }

  protected _processChunkSync(chunk: Buffer, flushFlag: number): Buffer {
    if (chunk && chunk.length > 0) {
      this._chunks.push(chunk);
    }

    if (flushFlag === constants.Z_FINISH || flushFlag === constants.Z_SYNC_FLUSH) {
      const input = Buffer.concat(this._chunks);
      let result: Buffer;

      switch (this._mode) {
        case "gunzip":
          result = gunzipSync(input);
          break;
        case "gzip":
          result = gzipSync(input);
          break;
        case "inflate":
          result = inflateSync(input);
          break;
        case "deflate":
          result = deflateSync(input);
          break;
        case "inflateRaw":
          result = inflateRawSync(input);
          break;
        case "deflateRaw":
          result = deflateRawSync(input);
          break;
        default:
          result = Buffer.alloc(0);
      }

      this._chunks = [];
      return result;
    }

    return Buffer.alloc(0);
  }

  reset(): this {
    this._chunks = [];
    this._finished = false;
    return this;
  }

  on(event: string, handler: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(handler);
    return this;
  }

  addListener(event: string, handler: EventListener): this {
    return this.on(event, handler);
  }

  once(event: string, handler: EventListener): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      handler(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, handler: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(handler);
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string, handler: EventListener): this {
    return this.off(event, handler);
  }

  removeAllListeners(event?: string): this {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    if (this._listeners[event]) {
      this._listeners[event].forEach((h) => h(...args));
      return true;
    }
    return false;
  }

  write(chunk: Buffer, _encoding?: BufferEncoding, callback?: () => void): boolean {
    this._chunks.push(chunk);
    if (callback) Promise.resolve().then(callback);
    return true;
  }

  end(chunk?: Buffer | (() => void), _encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    let cb: (() => void) | undefined;
    if (typeof chunk === "function") {
      cb = chunk;
      chunk = undefined;
    } else if (typeof _encoding === "function") {
      cb = _encoding;
    } else {
      cb = callback;
    }

    if (chunk && Buffer.isBuffer(chunk)) this._chunks.push(chunk);

    try {
      const input = Buffer.concat(this._chunks);
      let result: Buffer;

      switch (this._mode) {
        case "gunzip":
          result = gunzipSync(input);
          break;
        case "gzip":
          result = gzipSync(input);
          break;
        case "inflate":
          result = inflateSync(input);
          break;
        case "deflate":
          result = deflateSync(input);
          break;
        case "inflateRaw":
          result = inflateRawSync(input);
          break;
        case "deflateRaw":
          result = deflateRawSync(input);
          break;
        default:
          throw new Error("Unknown zlib mode: " + this._mode);
      }

      this._finished = true;
      Promise.resolve().then(() => {
        this.emit("data", result);
        this.emit("end");
        this.emit("finish");
        if (cb) cb();
      });
    } catch (err) {
      Promise.resolve().then(() => {
        this.emit("error", err);
        if (cb) cb();
      });
    }
    return this;
  }

  close(callback?: () => void): this {
    this._closed = true;
    this.writable = false;
    this.readable = false;
    Promise.resolve().then(() => {
      this.emit("close");
      if (callback) callback();
    });
    return this;
  }

  destroy(err?: Error): this {
    this._closed = true;
    this.writable = false;
    this.readable = false;
    if (err) {
      Promise.resolve().then(() => {
        this.emit("error", err);
        this.emit("close");
      });
    } else {
      Promise.resolve().then(() => {
        this.emit("close");
      });
    }
    return this;
  }

  flush(kind?: number | (() => void), callback?: () => void): this {
    if (typeof kind === "function") {
      callback = kind;
    }
    if (callback) Promise.resolve().then(callback);
    return this;
  }

  pipe<T extends NodeJS.WritableStream>(dest: T): T {
    this.on("data", (chunk) => dest.write(chunk as Buffer));
    this.on("end", () => {
      if (typeof dest.end === "function") dest.end();
    });
    this.on("error", (err) => {
      if ("emit" in dest && typeof dest.emit === "function") dest.emit("error", err);
    });
    return dest;
  }

  unpipe(): this {
    return this;
  }

  setEncoding(): this {
    return this;
  }

  pause(): this {
    return this;
  }

  resume(): this {
    return this;
  }
}

// Zlib stream classes
class Gzip extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("gzip");
  }
}

class Gunzip extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("gunzip");
  }
}

class Deflate extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("deflate");
  }
}

class Inflate extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("inflate");
  }
}

class DeflateRaw extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("deflateRaw");
  }
}

class InflateRaw extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("inflateRaw");
  }
}

class Unzip extends ZlibStream {
  constructor(_options?: nodeZlib.ZlibOptions) {
    super("gunzip"); // Unzip handles both gzip and deflate
  }
}

// Factory functions
function createGunzip(options?: nodeZlib.ZlibOptions): Gunzip {
  return new Gunzip(options);
}

function createGzip(options?: nodeZlib.ZlibOptions): Gzip {
  return new Gzip(options);
}

function createInflate(options?: nodeZlib.ZlibOptions): Inflate {
  return new Inflate(options);
}

function createDeflate(options?: nodeZlib.ZlibOptions): Deflate {
  return new Deflate(options);
}

function createInflateRaw(options?: nodeZlib.ZlibOptions): InflateRaw {
  return new InflateRaw(options);
}

function createDeflateRaw(options?: nodeZlib.ZlibOptions): DeflateRaw {
  return new DeflateRaw(options);
}

function createUnzip(options?: nodeZlib.ZlibOptions): Unzip {
  return new Unzip(options);
}

// Callback versions
function gunzip(input: Buffer, callback: (error: Error | null, result: Buffer) => void): void {
  try {
    const result = gunzipSync(input);
    Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    Promise.resolve().then(() => callback(err as Error, Buffer.alloc(0)));
  }
}

function gzip(input: Buffer | string, callback: (error: Error | null, result: Buffer) => void): void {
  try {
    const result = gzipSync(input);
    Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    Promise.resolve().then(() => callback(err as Error, Buffer.alloc(0)));
  }
}

function inflate(input: Buffer, callback: (error: Error | null, result: Buffer) => void): void {
  try {
    const result = inflateSync(input);
    Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    Promise.resolve().then(() => callback(err as Error, Buffer.alloc(0)));
  }
}

function deflate(input: Buffer | string, callback: (error: Error | null, result: Buffer) => void): void {
  try {
    const result = deflateSync(input);
    Promise.resolve().then(() => callback(null, result));
  } catch (err) {
    Promise.resolve().then(() => callback(err as Error, Buffer.alloc(0)));
  }
}

// Brotli stubs (not implemented)
function brotliCompressSync(): never {
  throw new Error("Brotli compression is not supported in sandbox");
}

function brotliDecompressSync(): never {
  throw new Error("Brotli decompression is not supported in sandbox");
}

function createBrotliCompress(): never {
  throw new Error("Brotli compression is not supported in sandbox");
}

function createBrotliDecompress(): never {
  throw new Error("Brotli decompression is not supported in sandbox");
}

// Export the zlib module
const zlib = {
  // Sync methods
  gunzipSync,
  gzipSync,
  deflateSync,
  inflateSync,
  deflateRawSync,
  inflateRawSync,

  // Async methods (callback style)
  gunzip,
  gzip,
  deflate,
  inflate,

  // Stream factories
  createGunzip,
  createGzip,
  createInflate,
  createDeflate,
  createInflateRaw,
  createDeflateRaw,
  createUnzip,

  // Constructor classes
  Gzip,
  Gunzip,
  Deflate,
  Inflate,
  DeflateRaw,
  InflateRaw,
  Unzip,

  // Aliases
  unzip: gunzip,
  unzipSync: gunzipSync,

  // Brotli stubs
  brotliCompressSync,
  brotliDecompressSync,
  createBrotliCompress,
  createBrotliDecompress,
  brotliCompress: brotliCompressSync,
  brotliDecompress: brotliDecompressSync,

  // Constants
  constants,

  // Also expose constants at top level for compatibility
  ...constants,
};

export default zlib;

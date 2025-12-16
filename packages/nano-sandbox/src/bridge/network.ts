// Network polyfill module for isolated-vm
// Provides fetch, http, https, and dns module emulation

import { Buffer } from "buffer";
import type * as nodeHttp from "http";
import type * as nodeDns from "dns";

// Declare globals that are set up by the host environment
declare const _networkFetchRaw: {
  apply: (ctx: undefined, args: [string, string], options: { result: { promise: true } }) => Promise<string>;
};
declare const _networkDnsLookupRaw: {
  apply: (ctx: undefined, args: [string], options: { result: { promise: true } }) => Promise<string>;
};
declare const _networkHttpRequestRaw: {
  apply: (ctx: undefined, args: [string, string], options: { result: { promise: true } }) => Promise<string>;
};

// Event listener type
type EventListener = (...args: unknown[]) => void;

// Response interface from host
interface HostResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  url?: string;
  redirected?: boolean;
  body?: string;
}

// Fetch polyfill
async function fetch(url: string | URL, options: RequestInit = {}): Promise<Response> {
  const optionsJson = JSON.stringify({
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null,
  });

  const responseJson = await _networkFetchRaw.apply(undefined, [String(url), optionsJson], { result: { promise: true } });
  const response = JSON.parse(responseJson) as HostResponse;

  // Create Response-like object
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers || {}),
    url: response.url || String(url),
    redirected: response.redirected || false,
    type: "basic",
    bodyUsed: false,

    async text(): Promise<string> {
      return response.body || "";
    },
    async json(): Promise<unknown> {
      return JSON.parse(response.body || "{}");
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      // Not fully supported - return empty buffer
      return new ArrayBuffer(0);
    },
    async blob(): Promise<Blob> {
      throw new Error("Blob not supported in sandbox");
    },
    async formData(): Promise<FormData> {
      throw new Error("FormData not supported in sandbox");
    },
    clone(): Response {
      return { ...this } as Response;
    },
  } as Response;
}

// Headers class
class HeadersImpl implements Headers {
  private _headers: Record<string, string> = {};

  constructor(init?: HeadersInit | null) {
    if (init) {
      if (init instanceof HeadersImpl) {
        this._headers = { ...init._headers };
      } else if (Array.isArray(init)) {
        init.forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value;
        });
      } else if (typeof init === "object") {
        Object.entries(init).forEach(([key, value]) => {
          this._headers[key.toLowerCase()] = value;
        });
      }
    }
  }

  get(name: string): string | null {
    return this._headers[name.toLowerCase()] || null;
  }
  set(name: string, value: string): void {
    this._headers[name.toLowerCase()] = value;
  }
  has(name: string): boolean {
    return name.toLowerCase() in this._headers;
  }
  delete(name: string): void {
    delete this._headers[name.toLowerCase()];
  }
  append(name: string, value: string): void {
    const existing = this._headers[name.toLowerCase()];
    this._headers[name.toLowerCase()] = existing ? existing + ", " + value : value;
  }
  getSetCookie(): string[] {
    return [];
  }
  *entries(): IterableIterator<[string, string]> {
    yield* Object.entries(this._headers);
  }
  *keys(): IterableIterator<string> {
    yield* Object.keys(this._headers);
  }
  *values(): IterableIterator<string> {
    yield* Object.values(this._headers);
  }
  forEach(callback: (value: string, key: string, parent: Headers) => void): void {
    Object.entries(this._headers).forEach(([k, v]) => callback(v, k, this));
  }
  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }
}

// Request class
class RequestImpl {
  url: string;
  method: string;
  headers: HeadersImpl;
  body: null = null;
  bodyUsed = false;
  mode: RequestMode = "cors";
  credentials: RequestCredentials = "same-origin";
  cache: RequestCache = "default";
  redirect: RequestRedirect = "follow";
  referrer = "about:client";
  referrerPolicy: ReferrerPolicy = "";
  integrity = "";
  keepalive = false;
  signal: AbortSignal = new AbortController().signal;
  destination: RequestDestination = "";

  constructor(input: RequestInfo | URL, init: RequestInit = {}) {
    this.url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    this.method = init.method || (typeof input === "object" && "method" in input ? (input as Request).method : "GET");
    this.headers = new HeadersImpl(init.headers || (typeof input === "object" && "headers" in input ? (input as Request).headers : undefined));
  }

  clone(): RequestImpl {
    return new RequestImpl(this.url, { method: this.method, headers: this.headers });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  async blob(): Promise<Blob> {
    throw new Error("Not supported");
  }
  async formData(): Promise<FormData> {
    throw new Error("Not supported");
  }
  async json(): Promise<unknown> {
    return {};
  }
  async text(): Promise<string> {
    return "";
  }
  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
}

// Response class
class ResponseImpl {
  private _body: string | null;
  status: number;
  statusText: string;
  headers: HeadersImpl;
  ok: boolean;
  type: ResponseType = "default";
  url = "";
  redirected = false;
  bodyUsed = false;
  body: null = null;

  constructor(body?: BodyInit | null, init: ResponseInit = {}) {
    this._body = body as string | null;
    this.status = init.status || 200;
    this.statusText = init.statusText || "OK";
    this.headers = new HeadersImpl(init.headers);
    this.ok = this.status >= 200 && this.status < 300;
  }

  async text(): Promise<string> {
    return String(this._body || "");
  }
  async json(): Promise<unknown> {
    return JSON.parse(this._body || "{}");
  }
  async arrayBuffer(): Promise<ArrayBuffer> {
    return new ArrayBuffer(0);
  }
  async blob(): Promise<Blob> {
    throw new Error("Not supported");
  }
  async formData(): Promise<FormData> {
    throw new Error("Not supported");
  }
  async bytes(): Promise<Uint8Array> {
    return new Uint8Array(0);
  }
  clone(): ResponseImpl {
    return new ResponseImpl(this._body, { status: this.status, statusText: this.statusText, headers: this.headers });
  }

  static error(): ResponseImpl {
    return new ResponseImpl(null, { status: 0, statusText: "" });
  }

  static redirect(url: string | URL, status = 302): ResponseImpl {
    return new ResponseImpl(null, { status, headers: { Location: String(url) } });
  }

  static json(data: unknown, init?: ResponseInit): ResponseImpl {
    const headers = new HeadersImpl(init?.headers);
    headers.set("content-type", "application/json");
    return new ResponseImpl(JSON.stringify(data), { ...init, headers });
  }
}

// DNS module polyfill
const dns = {
  lookup(
    hostname: string,
    optionsOrCallback?: nodeDns.LookupOptions | ((err: NodeJS.ErrnoException | null, address: string, family: number) => void),
    callback?: (err: NodeJS.ErrnoException | null, address: string, family: number) => void
  ): void {
    const cb = typeof optionsOrCallback === "function" ? optionsOrCallback : callback;
    if (!cb) return;

    _networkDnsLookupRaw
      .apply(undefined, [hostname], { result: { promise: true } })
      .then((resultJson: string) => {
        const result = JSON.parse(resultJson) as { error?: string; code?: string; address?: string; family?: number };
        if (result.error) {
          const err = new Error(result.error) as NodeJS.ErrnoException;
          err.code = result.code || "ENOTFOUND";
          cb(err, "", 0);
        } else {
          cb(null, result.address || "", result.family || 4);
        }
      })
      .catch((err: Error) => {
        cb(err as NodeJS.ErrnoException, "", 0);
      });
  },

  resolve(
    hostname: string,
    rrtypeOrCallback?: string | ((err: NodeJS.ErrnoException | null, addresses: string[]) => void),
    callback?: (err: NodeJS.ErrnoException | null, addresses: string[]) => void
  ): void {
    const cb = typeof rrtypeOrCallback === "function" ? rrtypeOrCallback : callback;
    if (!cb) return;

    dns.lookup(hostname, (err, address) => {
      if (err) {
        cb(err, []);
      } else {
        cb(null, [address]);
      }
    });
  },

  resolve4(hostname: string, callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void): void {
    dns.resolve(hostname, "A", callback);
  },

  resolve6(hostname: string, callback: (err: NodeJS.ErrnoException | null, addresses: string[]) => void): void {
    dns.resolve(hostname, "AAAA", callback);
  },

  promises: {
    lookup(hostname: string, _options?: nodeDns.LookupOptions): Promise<{ address: string; family: number }> {
      return new Promise((resolve, reject) => {
        dns.lookup(hostname, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address, family });
        });
      });
    },
    resolve(hostname: string, _rrtype?: string): Promise<string[]> {
      return new Promise((resolve, reject) => {
        dns.resolve(hostname, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });
    },
  },
};

// IncomingMessage class
class IncomingMessage {
  headers: nodeHttp.IncomingHttpHeaders;
  rawHeaders: string[] = [];
  trailers: NodeJS.Dict<string> = {};
  rawTrailers: string[] = [];
  httpVersion = "1.1";
  httpVersionMajor = 1;
  httpVersionMinor = 1;
  method: string | undefined = undefined;
  url: string;
  statusCode: number | undefined;
  statusMessage: string | undefined;
  private _body: string;
  private _listeners: Record<string, EventListener[]> = {};
  complete = false;
  aborted = false;
  socket = null;
  private _bodyConsumed = false;
  private _ended = false;
  private _flowing = false;
  readable = true;
  readableEnded = false;
  readableFlowing: boolean | null = null;

  constructor(response?: HostResponse) {
    this.headers = response?.headers || {};
    if (this.headers && typeof this.headers === "object") {
      Object.entries(this.headers).forEach(([k, v]) => {
        this.rawHeaders.push(k, v as string);
      });
    }
    this.url = response?.url || "";
    this.statusCode = response?.status;
    this.statusMessage = response?.statusText;
    this._body = response?.body || "";
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);

    // When 'data' listener is added, start flowing mode
    if (event === "data" && !this._bodyConsumed && this._body) {
      this._flowing = true;
      this.readableFlowing = true;
      Promise.resolve().then(() => {
        if (!this._bodyConsumed) {
          this._bodyConsumed = true;
          const buf = Buffer.from(this._body);
          this.emit("data", buf);
          Promise.resolve().then(() => {
            if (!this._ended) {
              this._ended = true;
              this.complete = true;
              this.readable = false;
              this.readableEnded = true;
              this.emit("end");
            }
          });
        }
      });
    }

    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    (wrapper as unknown as { _originalListener: EventListener })._originalListener = listener;
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].findIndex(
        (fn) => fn === listener || (fn as unknown as { _originalListener: EventListener })._originalListener === listener
      );
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener);
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
    const handlers = this._listeners[event];
    if (handlers) {
      handlers.slice().forEach((fn) => fn(...args));
    }
    return handlers !== undefined && handlers.length > 0;
  }

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  read(_size?: number): Buffer | null {
    if (this._bodyConsumed) return null;
    this._bodyConsumed = true;
    const buf = Buffer.from(this._body);
    Promise.resolve().then(() => {
      if (!this._ended) {
        this._ended = true;
        this.complete = true;
        this.readable = false;
        this.readableEnded = true;
        this.emit("end");
      }
    });
    return buf;
  }

  pipe<T extends NodeJS.WritableStream>(dest: T): T {
    const buf = Buffer.from(this._body || "");
    if (typeof dest.write === "function" && buf.length > 0) {
      dest.write(buf);
    }
    if (typeof dest.end === "function") {
      Promise.resolve().then(() => dest.end());
    }
    this._bodyConsumed = true;
    this._ended = true;
    this.complete = true;
    this.readable = false;
    this.readableEnded = true;
    return dest;
  }

  pause(): this {
    this._flowing = false;
    this.readableFlowing = false;
    return this;
  }

  resume(): this {
    this._flowing = true;
    this.readableFlowing = true;
    if (!this._bodyConsumed && this._body) {
      Promise.resolve().then(() => {
        if (!this._bodyConsumed) {
          this._bodyConsumed = true;
          const buf = Buffer.from(this._body);
          this.emit("data", buf);
          Promise.resolve().then(() => {
            if (!this._ended) {
              this._ended = true;
              this.complete = true;
              this.readable = false;
              this.readableEnded = true;
              this.emit("end");
            }
          });
        }
      });
    }
    return this;
  }

  unpipe(): this {
    return this;
  }

  destroy(err?: Error): this {
    this.readable = false;
    if (err) this.emit("error", err);
    this.emit("close");
    return this;
  }

  async *[Symbol.asyncIterator](): AsyncIterableIterator<Buffer> {
    if (!this._bodyConsumed) {
      this._bodyConsumed = true;
      const buf = Buffer.from(this._body || "");
      yield buf;
    }
    this._ended = true;
    this.complete = true;
    this.readable = false;
    this.readableEnded = true;
  }
}

// ClientRequest class
class ClientRequest {
  private _options: nodeHttp.RequestOptions;
  private _callback?: (res: IncomingMessage) => void;
  private _listeners: Record<string, EventListener[]> = {};
  private _body = "";
  private _ended = false;
  socket = null;
  finished = false;
  aborted = false;

  constructor(options: nodeHttp.RequestOptions, callback?: (res: IncomingMessage) => void) {
    this._options = options;
    this._callback = callback;

    // Execute request asynchronously
    Promise.resolve().then(() => this._execute());
  }

  private async _execute(): Promise<void> {
    try {
      const url = this._buildUrl();
      const optionsJson = JSON.stringify({
        method: this._options.method || "GET",
        headers: this._options.headers || {},
        body: this._body || null,
      });

      const responseJson = await _networkHttpRequestRaw.apply(undefined, [url, optionsJson], { result: { promise: true } });
      const response = JSON.parse(responseJson) as HostResponse;

      const res = new IncomingMessage(response);
      this.finished = true;

      if (this._callback) {
        this._callback(res);
      }
      this._emit("response", res);
    } catch (err) {
      this._emit("error", err);
    }
  }

  private _buildUrl(): string {
    const opts = this._options;
    const protocol = opts.protocol || (opts.port === 443 ? "https:" : "http:");
    const host = opts.hostname || opts.host || "localhost";
    const port = opts.port ? ":" + opts.port : "";
    const path = opts.path || "/";
    return protocol + "//" + host + port + path;
  }

  on(event: string, listener: EventListener): this {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: EventListener): this {
    const wrapper = (...args: unknown[]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventListener): this {
    if (this._listeners[event]) {
      const idx = this._listeners[event].indexOf(listener);
      if (idx !== -1) this._listeners[event].splice(idx, 1);
    }
    return this;
  }

  private _emit(event: string, ...args: unknown[]): void {
    if (this._listeners[event]) {
      this._listeners[event].forEach((fn) => fn(...args));
    }
  }

  write(data: string | Buffer): boolean {
    this._body += typeof data === "string" ? data : data.toString();
    return true;
  }

  end(data?: string | Buffer): this {
    if (data) this._body += typeof data === "string" ? data : data.toString();
    this._ended = true;
    return this;
  }

  abort(): void {
    this.aborted = true;
  }

  setTimeout(_timeout: number): this {
    return this;
  }
  setNoDelay(): this {
    return this;
  }
  setSocketKeepAlive(): this {
    return this;
  }
  flushHeaders(): void {}
}

// HTTP module factory
function createHttpModule(_protocol: string): typeof nodeHttp {
  return {
    request(
      options: string | nodeHttp.RequestOptions | URL,
      callback?: (res: nodeHttp.IncomingMessage) => void
    ): nodeHttp.ClientRequest {
      let opts: nodeHttp.RequestOptions;
      if (typeof options === "string") {
        const url = new URL(options);
        opts = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
        };
      } else if (options instanceof URL) {
        opts = {
          protocol: options.protocol,
          hostname: options.hostname,
          port: options.port,
          path: options.pathname + options.search,
        };
      } else {
        opts = options;
      }
      return new ClientRequest(opts, callback as unknown as (res: IncomingMessage) => void) as unknown as nodeHttp.ClientRequest;
    },

    get(
      options: string | nodeHttp.RequestOptions | URL,
      callback?: (res: nodeHttp.IncomingMessage) => void
    ): nodeHttp.ClientRequest {
      let opts: nodeHttp.RequestOptions;
      if (typeof options === "string") {
        const url = new URL(options);
        opts = {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: "GET",
        };
      } else if (options instanceof URL) {
        opts = {
          protocol: options.protocol,
          hostname: options.hostname,
          port: options.port,
          path: options.pathname + options.search,
          method: "GET",
        };
      } else {
        opts = { ...options, method: "GET" };
      }
      const req = new ClientRequest(opts, callback as unknown as (res: IncomingMessage) => void) as unknown as nodeHttp.ClientRequest;
      req.end();
      return req;
    },

    createServer(): never {
      throw new Error("http.createServer is not supported in sandbox");
    },

    Agent: class Agent {
      constructor() {}
    } as unknown as typeof nodeHttp.Agent,

    globalAgent: {} as nodeHttp.Agent,

    IncomingMessage: IncomingMessage as unknown as typeof nodeHttp.IncomingMessage,
    ClientRequest: ClientRequest as unknown as typeof nodeHttp.ClientRequest,

    METHODS: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
    STATUS_CODES: {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved Permanently",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      500: "Internal Server Error",
    } as Record<number, string>,
  } as unknown as typeof nodeHttp;
}

const http = createHttpModule("http");
const https = createHttpModule("https");

// Export modules
export { fetch, HeadersImpl as Headers, RequestImpl as Request, ResponseImpl as Response, dns, http, https, IncomingMessage, ClientRequest };

# npm Compatibility Spec - Phase 4: Remaining Issues

## Current State After Phase 4b

Phase 4a implemented:
- URL module patching for npm-package-arg file: URL resolution
- zlib constructor classes (Gzip, Gunzip, Deflate, Inflate, etc.)
- Improved zlib stream interface methods

Phase 4b implemented:
- Fixed isolated-vm Promise awaiting (exec() now properly awaits async IIFE results)
- Fixed existsSync for binary files (uses readFile instead of readTextFile)
- Added callback support to zlib _processChunk/_handle._processChunk
- minizlib compatibility: _processChunk is called directly on ZlibStream instance

| Command | Status | Notes |
|---------|--------|-------|
| npm --version | ✅ Working | Returns version string |
| npm config list | ✅ Working | Shows configuration |
| npm ls | ✅ Working | Shows package tree |
| npm init -y | ✅ Working | Creates package.json |
| npm ping | ✅ Working | Registry connectivity |
| npm view | ✅ Working | Fetches package info |
| npm pack | ⚠️ Hangs | Gzip works, cacache writes, then hangs |
| npm install | ⚠️ Hangs | Network works, no node_modules |

## Fixed Issues

### 1. URL Module Patching for file: URLs

**Problem:** npm-package-arg tries to create URLs like `file:.` which are invalid standalone. The URL property in the bundled polyfill was defined as a non-writable getter.

**Solution:**
```javascript
// In url module patching:
// The URL property is a getter from esbuild's bundled output
// We need to create a new object that copies all properties manually
const patchedResult = {};
const allKeys = Object.getOwnPropertyNames(result);
for (let i = 0; i < allKeys.length; i++) {
  const key = allKeys[i];
  if (key === 'URL') {
    patchedResult.URL = PatchedURL;  // Use patched version
  } else {
    patchedResult[key] = result[key];
  }
}
```

The patched URL constructor detects relative file: URLs without a base and automatically adds process.cwd() as the base.

### 2. zlib Constructor Classes

**Problem:** npm expects zlib classes (Gzip, Gunzip, etc.) to be usable with `new` keyword.

**Solution:** Added proper ES6 classes that extend ZlibStream:
- Gzip, Gunzip, Deflate, Inflate, DeflateRaw, InflateRaw, Unzip
- Added stream interface methods: close(), destroy(), flush(), pause(), resume()
- Proper event handling for 'close', 'finish', 'end', 'error'

### 3. Fixed isolated-vm Promise Awaiting

**Problem:** The exec() method wasn't properly awaiting async IIFE results from scripts. The Promise was detected but never actually awaited across the isolate boundary.

**Solution:**
```javascript
// Fixed code - properly captures async IIFE result using eval
const wrappedCode = `
  globalThis.__scriptResult__ = eval(${JSON.stringify(transformedCode)});
`;
const script = await this.isolate.compileScript(wrappedCode);
await script.run(context);

// If the script returned a promise, await it with { promise: true }
const hasPromise = await context.eval(
  `globalThis.__scriptResult__ && typeof globalThis.__scriptResult__.then === 'function'`,
  { copy: true }
);
if (hasPromise) {
  await context.eval(`globalThis.__scriptResult__`, { promise: true });
}
```

### 4. Fixed existsSync for Binary Files

**Problem:** `exists()` in SystemBridge used `readTextFile()` which fails for binary content.

**Solution:** Changed to use `readFile()` which works for both text and binary:
```typescript
async exists(path: string): Promise<boolean> {
  try {
    await this.directory.readFile(path);  // Works for binary
    return true;
  } catch {
    // Try as directory...
  }
}
```

## Remaining Issues

### 1. npm pack - Stream Pipeline Hang

**Symptom:**
```
[ZLIB] Gzip constructor called
(gzip produces 5143 bytes, cacache writes 5139 bytes to temp file)
Promise was abandoned
```

**Status:** File URL fixed, gzip works, cacache writes, then **hangs** waiting for something.

**Root Cause Analysis (Phase 4b Investigation):**

Detailed tracing revealed:
1. Gzip compression works correctly (5143 bytes output)
2. minizlib calls `_processChunk` directly on ZlibStream instance (not `_handle`)
3. Data flows through to cacache (writes to temp file successfully)
4. Then npm's internal Promise chain **hangs indefinitely**
5. No rename/move of temp file occurs
6. "Promise was abandoned" indicates the main Promise never resolves

The issue is likely:
1. **Missing stream.pipeline/finished** - cacache/ssri may wait for stream events
2. **Event loop issues in isolated-vm** - Promise.resolve().then() microtasks may not flush
3. **Missing stream 'end'/'finish' events** - Some callback or event never fires

**Key Finding:** Writing a binary file before npm pack causes npm to fail early (sees corrupted tarball), avoiding the hang. This is not a real fix, just causes earlier failure.

**Files to investigate:**
- `node_modules/npm/node_modules/cacache/lib/content/write.js`
- `node_modules/npm/node_modules/ssri/lib/index.js`
- How stream.finished() is used by cacache

**Potential Solutions:**

1. **Add stream.pipeline/finished polyfills** - These may be waiting for completion
2. **Investigate isolated-vm microtask handling** - Ensure Promise.resolve().then() works
3. **Mock cacache operations** - Override to use synchronous file operations

### 2. npm install - Incomplete Installation

**Symptom:**
```
[Network] httpRequest: https://registry.npmjs.org/is-number
node_modules exists: false
```

**Status:** Network requests work, but no files installed.

**Root Cause Analysis:**

The installation pipeline stalls between metadata fetch and tarball download:
```
1. Resolve package metadata ✅ (network request seen)
2. Build dependency tree ❓ (may be hanging or erroring)
3. Fetch tarballs ❌ (no .tgz requests seen)
4. Extract to node_modules ❌
```

**Likely Causes:**

1. **Arborist tree building** - @npmcli/arborist may hang on fs operations
2. **cacache operations** - Cache writes may not complete
3. **Silent promise rejection** - Internal errors not surfacing

**Debug Steps:**
```javascript
// Add to process polyfill
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED]', reason);
});
```

### 3. Stream Pipeline Issues

Both npm pack and npm install likely need:

1. **stream.pipeline()** - For piping streams with proper cleanup
2. **stream.finished()** - For waiting on stream completion
3. **Proper backpressure handling** - For large file operations

## Implementation Priority

### Phase 4b: Debug npm pack tar operations (Medium Effort)
1. Add logging to fs.createWriteStream
2. Trace where the 'close' method is being called
3. Ensure WriteStream has all required methods
4. Test tar operations in isolation

### Phase 4c: Debug npm install arborist (High Effort)
1. Add unhandled rejection logging
2. Trace arborist.buildIdealTree()
3. Check if cacache operations complete
4. Verify packument processing

### Phase 4d: Implement stream utilities (Medium Effort)
1. Add stream.pipeline polyfill
2. Add stream.finished polyfill
3. Improve WriteStream implementation

## Test Cases

```typescript
describe("npm pack tar operations", () => {
  it("should create WriteStream with close method", async () => {
    const ws = fs.createWriteStream('/test.txt');
    expect(typeof ws.close).toBe('function');
  });

  it("should handle tar.create", async () => {
    const tar = require('tar');
    // Test basic tar creation
  });
});

describe("npm install debugging", () => {
  it("should complete arborist tree building", async () => {
    const Arborist = require('@npmcli/arborist');
    const arb = new Arborist({ path: '/app' });
    const tree = await arb.buildIdealTree();
    expect(tree).toBeDefined();
  });
});
```

## Alternative Approaches

### Option A: Mock tar at Higher Level

Instead of fixing stream issues, mock npm's tar operations:

```javascript
const tar = require('tar');
tar.create = async function(options, files) {
  // Create a simple tarball without streaming
  const entries = [];
  for (const file of files) {
    const content = fs.readFileSync(file);
    entries.push({ name: file, content });
  }
  // Use our gzipSync to compress
  return zlib.gzipSync(packEntries(entries));
};
```

### Option B: Simplified Package Manager

For npm install, implement core operations directly:

```javascript
async function installPackage(spec) {
  // 1. Fetch metadata
  const meta = await fetch(`https://registry.npmjs.org/${spec}`);
  const version = meta['dist-tags'].latest;

  // 2. Download tarball
  const tarball = await fetch(meta.versions[version].dist.tarball);

  // 3. Extract
  await extractTarball(tarball, `node_modules/${spec}`);

  // 4. Update package-lock.json
  await updateLockfile(spec, version);
}
```

### Option C: Use npm Programmatic API

Instead of CLI, use npm's programmatic interface:

```javascript
const { Arborist } = require('@npmcli/arborist');
const arb = new Arborist({ path: '/app' });
await arb.buildIdealTree({ add: ['is-number'] });
await arb.reify();
```

This may have fewer dependencies on CLI-specific features.

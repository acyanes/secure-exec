import * as esbuild from 'esbuild';

const result = await esbuild.build({
  entryPoints: ['/Users/nathan/misc/lightweight-sandbox/node_modules/.pnpm/constants-browserify@1.0.0/node_modules/constants-browserify'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
});

const code = result.outputFiles[0].text;

// Check if this is a JSON module (esbuild creates *_default but doesn't export it)
const defaultExportMatch = code.match(/var\s+(\w+_default)\s*=\s*\{/);

let wrappedCode;
if (defaultExportMatch && !code.includes('module.exports')) {
  // JSON module: wrap and return the default export object
  const defaultVar = defaultExportMatch[1];
  wrappedCode = `(function() {
    ${code}
    return ${defaultVar};
  })()`;
  console.log('Detected JSON module, using default:', defaultVar);
} else {
  // Regular CommonJS module: wrap and return module.exports
  wrappedCode = `(function() {
    var module = { exports: {} };
    var exports = module.exports;
    ${code}
    return module.exports;
  })()`;
  console.log('Detected CommonJS module');
}

console.log('=== Testing wrapped code ===');
const constants = eval(wrappedCode);
console.log('constants type:', typeof constants);
console.log('O_SYMLINK:', constants.O_SYMLINK);
console.log('hasOwnProperty:', constants.hasOwnProperty('O_SYMLINK'));

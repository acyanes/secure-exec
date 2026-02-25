/**
 * Detect if code uses ESM syntax.
 */
export function isESM(code: string, filePath?: string): boolean {
	if (filePath?.endsWith(".mjs")) return true;
	if (filePath?.endsWith(".cjs")) return false;

	const hasImport =
		/^\s*import\s*(?:[\w{},*\s]+\s*from\s*)?['"][^'"]+['"]/m.test(code) ||
		/^\s*import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]/m.test(code);
	const hasExport =
		/^\s*export\s+(?:default|const|let|var|function|class|{)/m.test(code) ||
		/^\s*export\s*\{/m.test(code);

	return hasImport || hasExport;
}

/**
 * Transform dynamic import() calls to __dynamicImport() calls.
 */
export function transformDynamicImport(code: string): string {
	return code.replace(/(?<![a-zA-Z_$])import\s*\(/g, "__dynamicImport(");
}

/**
 * Extract static import specifiers from transformed code.
 */
export function extractDynamicImportSpecifiers(code: string): string[] {
	const regex = /__dynamicImport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
	const specifiers = new Set<string>();
	for (const match of code.matchAll(regex)) {
		specifiers.add(match[1]);
	}
	return Array.from(specifiers);
}

/**
 * Convert CJS module to ESM-compatible wrapper.
 */
export function wrapCJSForESM(code: string): string {
	return `
    const module = { exports: {} };
    const exports = module.exports;
    ${code}
    export default module.exports;
    export const __cjsModule = true;
  `;
}

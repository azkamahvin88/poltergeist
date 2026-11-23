/**
 * tarball.ts — Re-exports from the shared analyzer tarball module.
 * The implementation moved to src/analyzer/tarball.ts so the MCP server
 * can import it without pulling in src/server/.
 */
export { extractTarball } from '../analyzer/tarball.js';

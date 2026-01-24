/**
 * Prepend script for injecting React DevTools hook BEFORE React loads.
 *
 * This script must be injected using:
 * - Playwright: page.addInitScript(script)
 * - Puppeteer: page.evaluateOnNewDocument(script)
 *
 * It installs __REACT_DEVTOOLS_GLOBAL_HOOK__ so React can register itself
 * when it loads, enabling the main react-devtools-mcp tools to work.
 */

import {initialize} from 'react-devtools-core';

// Check if a proper DevTools hook exists (not just react-refresh stub)
// A proper hook has rendererInterfaces Map that we need for inspection
const existingHook = (globalThis as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
const hasProperHook =
  existingHook &&
  existingHook.rendererInterfaces instanceof Map;

if (!hasProperHook) {
  // Install the hook before React loads
  // This will replace any existing stub (like react-refresh)
  initialize();

  // Mark that we installed it (for main script to detect)
  (globalThis as any).__REACT_DEVTOOLS_MCP_HOOK_INSTALLED__ = true;

  console.log('[react-devtools-mcp] Hook installed via prepend script');
} else {
  console.log('[react-devtools-mcp] Using existing DevTools hook');
}

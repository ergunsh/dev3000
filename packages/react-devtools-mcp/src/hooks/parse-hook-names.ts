/**
 * Hook name parsing - extracts variable names from source code for hooks.
 *
 * This module ports the hook name parsing functionality from React DevTools.
 * It fetches source files, parses source maps, and uses AST traversal to
 * extract the variable names assigned to hook calls.
 *
 * Example:
 *   const [count, setCount] = useState(0);
 *   -> Hook name: "count"
 *
 *   const theme = useTheme();
 *   -> Hook name: "theme"
 */

import type {HookSource} from '../types';
import {getHookName} from './ast-utils';
import {createSourceMapConsumer, SourceMapConsumer} from './source-map-consumer';
import {parseSource} from './babel-parser';

// Location key format: "fileName:lineNumber:columnNumber"
type LocationKey = string;

// Simple LRU-like cache for parsed source metadata
const sourceCache = new Map<string, {ast: unknown; code: string}>();
const MAX_CACHE_SIZE = 20;

function addToCache(url: string, data: {ast: unknown; code: string}): void {
  if (sourceCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = sourceCache.keys().next().value;
    if (firstKey) {
      sourceCache.delete(firstKey);
    }
  }
  sourceCache.set(url, data);
}

/**
 * Create a location key for a hook source
 */
function getHookSourceLocationKey(hookSource: HookSource): LocationKey {
  const {fileName, lineNumber, columnNumber} = hookSource;
  if (fileName == null || lineNumber == null || columnNumber == null) {
    throw Error('Hook source code location not found.');
  }
  return `${fileName}:${lineNumber}:${columnNumber}`;
}

/**
 * Check if a hook should be skipped (built-in hooks that don't get variable names)
 */
function isUnnamedBuiltInHook(hookName: string): boolean {
  return ['Effect', 'ImperativeHandle', 'LayoutEffect', 'DebugValue', 'InsertionEffect'].includes(
    hookName
  );
}

/**
 * Fetch a file with caching
 */
async function fetchFile(url: string): Promise<string> {
  try {
    const response = await fetch(url, {cache: 'force-cache'});
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    return await response.text();
  } catch (error) {
    console.warn(`[parseHookNames] Failed to fetch ${url}:`, error);
    throw error;
  }
}

/**
 * Extract source map URL from source code
 */
function extractSourceMapURL(source: string, baseURL: string): {url: string | null; isInline: boolean; inlineData: string | null} {
  const sourceMapRegex = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)/g;
  let match: RegExpExecArray | null;
  let lastMatch: RegExpExecArray | null = null;

  while ((match = sourceMapRegex.exec(source)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    return {url: null, isInline: false, inlineData: null};
  }

  const sourceMappingURL = lastMatch[1];

  // Check for inline base64 source map
  if (sourceMappingURL.includes('base64,')) {
    const base64Match = sourceMappingURL.match(/base64,([a-zA-Z0-9+/=]+)/);
    if (base64Match) {
      return {url: null, isInline: true, inlineData: base64Match[1]};
    }
  }

  // External source map - resolve relative URL
  let url = sourceMappingURL;
  if (!url.startsWith('http') && !url.startsWith('/')) {
    const lastSlashIdx = baseURL.lastIndexOf('/');
    if (lastSlashIdx !== -1) {
      const baseDir = baseURL.slice(0, lastSlashIdx);
      url = `${baseDir}/${url}`;
    }
  }

  return {url, isInline: false, inlineData: null};
}

/**
 * Parse source map JSON from inline data or fetch from URL
 */
async function loadSourceMap(
  sourceCode: string,
  sourceURL: string
): Promise<{json: unknown; consumer: SourceMapConsumer} | null> {
  const {url, isInline, inlineData} = extractSourceMapURL(sourceCode, sourceURL);

  let sourceMapJSON: unknown;

  if (isInline && inlineData) {
    try {
      const decoded = atob(inlineData);
      sourceMapJSON = JSON.parse(decoded);
    } catch (error) {
      console.warn('[parseHookNames] Failed to decode inline source map:', error);
      return null;
    }
  } else if (url) {
    try {
      const sourceMapText = await fetchFile(url);
      sourceMapJSON = JSON.parse(sourceMapText);
    } catch (error) {
      console.warn('[parseHookNames] Failed to load source map:', error);
      return null;
    }
  } else {
    return null;
  }

  const consumer = createSourceMapConsumer(sourceMapJSON);
  return {json: sourceMapJSON, consumer};
}

/**
 * Flatten hooks tree into a list, skipping unnamed built-in hooks
 */
function flattenHooksList(
  hooks: Array<{name: string; hookSource: HookSource | null; subHooks?: unknown[]}>
): Array<{name: string; hookSource: HookSource}> {
  const result: Array<{name: string; hookSource: HookSource}> = [];

  for (const hook of hooks) {
    if (!isUnnamedBuiltInHook(hook.name) && hook.hookSource) {
      result.push({name: hook.name, hookSource: hook.hookSource});
    }

    if (hook.subHooks && Array.isArray(hook.subHooks)) {
      const subResult = flattenHooksList(
        hook.subHooks as Array<{name: string; hookSource: HookSource | null; subHooks?: unknown[]}>
      );
      result.push(...subResult);
    }
  }

  return result;
}

/**
 * Parse hook names from hooks data.
 * Returns a Map of location keys to parsed hook names.
 */
export async function parseHookNames(
  hooks: Array<{
    id: number | null;
    name: string;
    value: unknown;
    subHooks: unknown[];
    hookSource: HookSource | null;
  }>
): Promise<Map<string, string | null>> {
  const hookNames = new Map<string, string | null>();

  // Flatten hooks list and filter out unnamed built-in hooks
  const hooksList = flattenHooksList(hooks);

  if (hooksList.length === 0) {
    return hookNames;
  }

  // Group hooks by source file
  const fileToHooks = new Map<string, typeof hooksList>();
  for (const hook of hooksList) {
    const fileName = hook.hookSource.fileName;
    if (fileName) {
      const existing = fileToHooks.get(fileName) || [];
      existing.push(hook);
      fileToHooks.set(fileName, existing);
    }
  }

  // Process each source file
  for (const [sourceURL, fileHooks] of fileToHooks) {
    try {
      // Skip non-http URLs (like webpack internal modules)
      if (!sourceURL.startsWith('http') && !sourceURL.startsWith('/')) {
        continue;
      }

      // Fetch source code
      let runtimeSourceCode: string;
      try {
        runtimeSourceCode = await fetchFile(sourceURL);
      } catch {
        // If we can't fetch the source, skip this file
        continue;
      }

      // Check for max source length (avoid parsing huge files)
      if (runtimeSourceCode.length > 5_000_000) {
        console.warn(`[parseHookNames] Source file too large: ${sourceURL}`);
        continue;
      }

      // Try to load source map
      const sourceMapResult = await loadSourceMap(runtimeSourceCode, sourceURL);

      // Process each hook in this file
      for (const hook of fileHooks) {
        const locationKey = getHookSourceLocationKey(hook.hookSource);

        try {
          let originalSourceCode: string;
          let originalSourceLineNumber: number;
          let originalSourceColumnNumber: number;
          let originalSourceURL: string;

          if (sourceMapResult) {
            // Use source map to find original source location
            const {consumer} = sourceMapResult;
            const original = consumer.originalPositionFor({
              line: hook.hookSource.lineNumber!,
              column: hook.hookSource.columnNumber!,
            });

            if (original.source && original.line !== null && original.column !== null) {
              // Get original source content from source map
              const originalContent = consumer.sourceContentFor(original.source);
              if (originalContent) {
                originalSourceCode = originalContent;
                originalSourceLineNumber = original.line;
                originalSourceColumnNumber = original.column;
                originalSourceURL = original.source;
              } else {
                // Fall back to runtime source if original not available
                originalSourceCode = runtimeSourceCode;
                originalSourceLineNumber = hook.hookSource.lineNumber!;
                originalSourceColumnNumber = hook.hookSource.columnNumber!;
                originalSourceURL = sourceURL;
              }
            } else {
              // Mapping failed, use runtime source
              originalSourceCode = runtimeSourceCode;
              originalSourceLineNumber = hook.hookSource.lineNumber!;
              originalSourceColumnNumber = hook.hookSource.columnNumber!;
              originalSourceURL = sourceURL;
            }
          } else {
            // No source map, use runtime source directly
            originalSourceCode = runtimeSourceCode;
            originalSourceLineNumber = hook.hookSource.lineNumber!;
            originalSourceColumnNumber = hook.hookSource.columnNumber!;
            originalSourceURL = sourceURL;
          }

          // Check cache for parsed AST
          let ast: unknown;
          const cached = sourceCache.get(originalSourceURL);
          if (cached && cached.code === originalSourceCode) {
            ast = cached.ast;
          } else {
            // Parse the source to AST
            ast = parseSource(originalSourceCode);
            addToCache(originalSourceURL, {ast, code: originalSourceCode});
          }

          // Extract hook name from AST
          const hookName = getHookName(
            hook,
            ast,
            originalSourceCode,
            originalSourceLineNumber,
            originalSourceColumnNumber
          );

          hookNames.set(locationKey, hookName);
        } catch (error) {
          console.warn(`[parseHookNames] Failed to parse hook at ${locationKey}:`, error);
          hookNames.set(locationKey, null);
        }
      }
    } catch (error) {
      console.warn(`[parseHookNames] Failed to process source file ${sourceURL}:`, error);
    }
  }

  return hookNames;
}

/**
 * Clear the source cache
 */
export function clearSourceCache(): void {
  sourceCache.clear();
}

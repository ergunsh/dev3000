/**
 * Resolves compiled source locations to original source files using source maps.
 *
 * Handles both:
 * - SSR chunks: `about://React/Server/file:///.../.next/dev/server/chunks/ssr/...`
 *   → resolved via sectioned source maps from `/__nextjs_source-map` endpoint
 * - Client chunks: `about://React/Client/file:///.../.next/static/chunks/...`
 *   → resolved by fetching the chunk directly and extracting `//# sourceMappingURL`
 */

import {createSourceMapConsumer} from '../hooks/source-map-consumer';

export interface ResolvedSource {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
}

interface StandardSourceMap {
  version: number;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

interface SectionedSourceMap {
  version: number;
  sections: Array<{
    offset: {line: number; column: number};
    map: StandardSourceMap;
  }>;
}

type SourceMapData = SectionedSourceMap | StandardSourceMap;

// Cache source maps to avoid re-fetching for the same chunk
const sourceMapCache = new Map<string, SourceMapData | null>();

/**
 * Extract the .next-relative chunk path from a React DevTools stack frame URL.
 *
 * SSR: "about://React/Server/file:///path/to/.next/dev/server/chunks/ssr/file.js?162"
 *   -> ".next/dev/server/chunks/ssr/file.js"
 *
 * Client: "http://localhost:3999/_next/static/chunks/file.js"
 *   -> ".next/static/chunks/file.js"
 */
function extractChunkPath(url: string): string | null {
  // Match .next/ path (SSR URLs with about://React/Server/file:///...)
  const dotNextMatch = url.match(/(\.next\/[^?]+)/);
  if (dotNextMatch) {
    return decodeURIComponent(dotNextMatch[1]);
  }

  // Match /_next/ path (client URLs like http://localhost:PORT/_next/static/...)
  // Convert /_next/ -> .next/ for consistency
  const underscoreNextMatch = url.match(/\/_next\/([^?]+)/);
  if (underscoreNextMatch) {
    return '.next/' + decodeURIComponent(underscoreNextMatch[1]);
  }

  return null;
}

/**
 * Clean a source URL from the source map to a readable file name.
 * e.g., "file:///Users/ergunsh/.../src/components/RecentTransactions.tsx"
 *    -> "src/components/RecentTransactions.tsx"
 */
function cleanResolvedSource(source: string): string {
  let cleaned = source;

  // Strip file:// prefix
  cleaned = cleaned.replace(/^file:\/\//, '');

  // Try to find a common root marker like /src/ or /app/ and return from there
  for (const marker of ['/src/', '/app/', '/pages/', '/components/']) {
    const idx = cleaned.indexOf(marker);
    if (idx !== -1) {
      return cleaned.substring(idx + 1); // +1 to skip the leading /
    }
  }

  // Fallback: just return the file name
  return cleaned.split('/').pop() ?? cleaned;
}

/**
 * Fetch a source map from the Next.js dev server.
 * Returns either a sectioned source map (SSR/Turbopack) or a standard V3 map.
 */
async function fetchSourceMap(chunkPath: string): Promise<SourceMapData | null> {
  if (sourceMapCache.has(chunkPath)) {
    return sourceMapCache.get(chunkPath)!;
  }

  try {
    const resp = await fetch(
      `/__nextjs_source-map?filename=${encodeURIComponent(chunkPath)}`
    );
    if (!resp.ok) {
      sourceMapCache.set(chunkPath, null);
      return null;
    }

    const text = await resp.text();
    if (!text || text.length === 0) {
      sourceMapCache.set(chunkPath, null);
      return null;
    }

    const sm = JSON.parse(text) as SourceMapData;
    sourceMapCache.set(chunkPath, sm);
    return sm;
  } catch {
    sourceMapCache.set(chunkPath, null);
    return null;
  }
}

/**
 * Resolve a compiled position using a sectioned source map.
 * Sectioned source maps have `sections` where each section has an offset
 * and its own inner source map.
 */
function resolveWithSectionedMap(
  sm: SectionedSourceMap,
  line: number,
  column: number
): ResolvedSource | null {
  if (!sm.sections || sm.sections.length === 0) {
    return null;
  }

  // Find the section that contains this line
  // Sections are sorted by offset; find the last one whose offset <= our position
  let section = sm.sections[0];
  for (let i = 1; i < sm.sections.length; i++) {
    const s = sm.sections[i];
    if (s.offset.line <= line) {
      section = s;
    } else {
      break;
    }
  }

  if (!section.map || !section.map.mappings) {
    return null;
  }

  // Adjust position relative to section offset
  const adjustedLine = line - section.offset.line;
  const adjustedColumn =
    line === section.offset.line ? column - section.offset.column : column;

  try {
    const consumer = createSourceMapConsumer(section.map);
    const pos = consumer.originalPositionFor({
      line: adjustedLine,
      column: adjustedColumn,
    });

    if (pos.source && pos.line !== null) {
      return {
        fileName: cleanResolvedSource(pos.source),
        lineNumber: pos.line,
        columnNumber: pos.column ?? 0,
      };
    }
  } catch {
    // Source map parsing failed
  }

  // Fallback: if we know the source file from the section, use it directly
  if (section.map.sources.length === 1) {
    return {
      fileName: cleanResolvedSource(section.map.sources[0]),
      lineNumber: adjustedLine,
      columnNumber: adjustedColumn,
    };
  }

  return null;
}

/**
 * Resolve a compiled position using a standard (non-sectioned) V3 source map.
 */
function resolveWithStandardMap(
  sm: StandardSourceMap,
  line: number,
  column: number
): ResolvedSource | null {
  if (!sm.mappings) {
    return null;
  }

  try {
    const consumer = createSourceMapConsumer(sm);
    const pos = consumer.originalPositionFor({line, column});

    if (pos.source && pos.line !== null) {
      return {
        fileName: cleanResolvedSource(pos.source),
        lineNumber: pos.line,
        columnNumber: pos.column ?? 0,
      };
    }
  } catch {
    // Source map parsing failed
  }

  return null;
}

/**
 * Check if a chunk path is a client-side chunk.
 */
function isClientChunk(chunkPath: string): boolean {
  return chunkPath.startsWith('.next/static/');
}

/**
 * Extract source map URL from source code (last `//# sourceMappingURL=` comment).
 */
function extractSourceMapURL(
  source: string,
  baseURL: string
): {url: string | null; isInline: boolean; inlineData: string | null} {
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
  let smUrl = sourceMappingURL;
  if (!smUrl.startsWith('http') && !smUrl.startsWith('/')) {
    const lastSlashIdx = baseURL.lastIndexOf('/');
    if (lastSlashIdx !== -1) {
      const baseDir = baseURL.slice(0, lastSlashIdx);
      smUrl = `${baseDir}/${smUrl}`;
    }
  }

  return {url: smUrl, isInline: false, inlineData: null};
}

/**
 * Resolve a client-side chunk by fetching it directly and loading its source map
 * via the `//# sourceMappingURL` comment.
 */
async function resolveClientChunk(
  chunkPath: string,
  line: number,
  column: number
): Promise<ResolvedSource | null> {
  // Convert .next/static/... → /_next/static/... for HTTP fetch
  const httpPath = chunkPath.replace(/^\.next\//, '/_next/');

  try {
    const resp = await fetch(httpPath);
    if (!resp.ok) {
      return null;
    }

    const sourceCode = await resp.text();
    const {url: smUrl, isInline, inlineData} = extractSourceMapURL(sourceCode, httpPath);

    let sourceMapJSON: unknown;

    if (isInline && inlineData) {
      try {
        sourceMapJSON = JSON.parse(atob(inlineData));
      } catch {
        return null;
      }
    } else if (smUrl) {
      try {
        const smResp = await fetch(smUrl);
        if (!smResp.ok) {
          return null;
        }
        sourceMapJSON = JSON.parse(await smResp.text());
      } catch {
        return null;
      }
    } else {
      return null;
    }

    const sm = sourceMapJSON as SourceMapData;

    // Cache the loaded map for future lookups
    sourceMapCache.set(chunkPath, sm);

    // Handle both sectioned and standard maps
    if ('sections' in sm && sm.sections) {
      return resolveWithSectionedMap(sm as SectionedSourceMap, line, column);
    }
    if ('mappings' in sm && sm.mappings) {
      return resolveWithStandardMap(sm as StandardSourceMap, line, column);
    }
  } catch {
    // Fetch or parse failed
  }

  return null;
}

/**
 * Resolve a compiled source location from a React DevTools stack frame
 * to the original source file and line number.
 *
 * @param url - The compiled file URL from the stack frame
 *              (e.g., "about://React/Server/file:///.../.next/.../file.js?N")
 * @param line - The compiled line number (1-based)
 * @param column - The compiled column number (0-based)
 * @returns The resolved original source location, or null if resolution fails
 */
export async function resolveSourceLocation(
  url: string,
  line: number,
  column: number
): Promise<ResolvedSource | null> {
  const chunkPath = extractChunkPath(url);
  if (!chunkPath) {
    return null;
  }

  const sm = await fetchSourceMap(chunkPath);
  if (sm) {
    // Handle sectioned source maps (Turbopack SSR)
    if ('sections' in sm && sm.sections) {
      return resolveWithSectionedMap(sm as SectionedSourceMap, line, column);
    }
    // Handle standard V3 source maps
    if ('mappings' in sm && sm.mappings) {
      return resolveWithStandardMap(sm as StandardSourceMap, line, column);
    }
  }

  // Fallback: for client chunks, fetch the chunk directly and load its source map
  if (isClientChunk(chunkPath)) {
    return resolveClientChunk(chunkPath, line, column);
  }

  return null;
}

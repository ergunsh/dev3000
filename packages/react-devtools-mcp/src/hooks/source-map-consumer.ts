/**
 * Source map consumer for mapping runtime code locations to original source.
 *
 * This is a simplified source map consumer that handles the subset of
 * source map functionality needed for hook name parsing.
 */

interface SourceMapV3 {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

interface OriginalPosition {
  source: string | null;
  line: number | null;
  column: number | null;
  name: string | null;
}

interface GeneratedPosition {
  line: number;
  column: number;
}

interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  originalLine: number | null;
  originalColumn: number | null;
  source: string | null;
  name: string | null;
}

// Base64 VLQ decoding
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_MAP = new Map<string, number>();
for (let i = 0; i < BASE64_CHARS.length; i++) {
  BASE64_MAP.set(BASE64_CHARS[i], i);
}

function decodeVLQ(str: string, index: number): {value: number; index: number} {
  let value = 0;
  let shift = 0;
  let continuation = true;

  while (continuation && index < str.length) {
    const char = str[index++];
    const digit = BASE64_MAP.get(char);
    if (digit === undefined) {
      throw new Error(`Invalid base64 character: ${char}`);
    }

    continuation = (digit & 32) !== 0;
    value += (digit & 31) << shift;
    shift += 5;
  }

  // Convert from unsigned to signed
  const isNegative = (value & 1) !== 0;
  value = value >> 1;
  if (isNegative) {
    value = -value;
  }

  return {value, index};
}

/**
 * Parse source map mappings into an array of mapping objects
 */
function parseMappings(mappings: string, sources: string[], names: string[]): Mapping[] {
  const result: Mapping[] = [];

  let generatedLine = 1;
  let generatedColumn = 0;
  let originalLine = 0;
  let originalColumn = 0;
  let sourceIndex = 0;
  let nameIndex = 0;

  const lines = mappings.split(';');

  for (const line of lines) {
    generatedColumn = 0;

    if (line.length > 0) {
      const segments = line.split(',');

      for (const segment of segments) {
        if (segment.length === 0) continue;

        let index = 0;

        // Generated column (always present)
        const genCol = decodeVLQ(segment, index);
        generatedColumn += genCol.value;
        index = genCol.index;

        if (index < segment.length) {
          // Source index
          const srcIdx = decodeVLQ(segment, index);
          sourceIndex += srcIdx.value;
          index = srcIdx.index;

          // Original line
          const origLine = decodeVLQ(segment, index);
          originalLine += origLine.value;
          index = origLine.index;

          // Original column
          const origCol = decodeVLQ(segment, index);
          originalColumn += origCol.value;
          index = origCol.index;

          // Optional: name index
          let mappingName: string | null = null;
          if (index < segment.length) {
            const nameIdx = decodeVLQ(segment, index);
            nameIndex += nameIdx.value;
            mappingName = names[nameIndex] ?? null;
          }

          result.push({
            generatedLine,
            generatedColumn,
            originalLine: originalLine + 1, // Convert to 1-based
            originalColumn,
            source: sources[sourceIndex] ?? null,
            name: mappingName,
          });
        } else {
          // No original position
          result.push({
            generatedLine,
            generatedColumn,
            originalLine: null,
            originalColumn: null,
            source: null,
            name: null,
          });
        }
      }
    }

    generatedLine++;
  }

  return result;
}

export interface SourceMapConsumer {
  originalPositionFor(pos: GeneratedPosition): OriginalPosition;
  sourceContentFor(source: string): string | null;
  sources: string[];
}

/**
 * Create a source map consumer from a source map JSON object
 */
export function createSourceMapConsumer(sourceMapJSON: unknown): SourceMapConsumer {
  const sourceMap = sourceMapJSON as SourceMapV3;

  if (sourceMap.version !== 3) {
    throw new Error(`Unsupported source map version: ${sourceMap.version}`);
  }

  // Resolve sources relative to sourceRoot
  const sourceRoot = sourceMap.sourceRoot || '';
  const sources = sourceMap.sources.map(source => {
    if (source.startsWith('/') || source.startsWith('http')) {
      return source;
    }
    return sourceRoot ? `${sourceRoot}/${source}` : source;
  });

  // Parse mappings lazily
  let mappings: Mapping[] | null = null;
  const getMappings = (): Mapping[] => {
    if (mappings === null) {
      mappings = parseMappings(sourceMap.mappings, sources, sourceMap.names);
    }
    return mappings;
  };

  // Create source content map
  const sourceContentMap = new Map<string, string>();
  if (sourceMap.sourcesContent) {
    for (let i = 0; i < sources.length; i++) {
      const content = sourceMap.sourcesContent[i];
      if (content !== null && content !== undefined) {
        sourceContentMap.set(sources[i], content);
        // Also add with original source name for flexibility
        if (sourceMap.sources[i] !== sources[i]) {
          sourceContentMap.set(sourceMap.sources[i], content);
        }
      }
    }
  }

  return {
    sources,

    originalPositionFor(pos: GeneratedPosition): OriginalPosition {
      const allMappings = getMappings();

      // Find the mapping closest to the given position
      let bestMapping: Mapping | null = null;

      for (const mapping of allMappings) {
        if (mapping.generatedLine === pos.line) {
          if (mapping.generatedColumn <= pos.column) {
            if (!bestMapping || mapping.generatedColumn > bestMapping.generatedColumn) {
              bestMapping = mapping;
            }
          }
        } else if (mapping.generatedLine > pos.line) {
          break;
        }
      }

      if (bestMapping && bestMapping.originalLine !== null) {
        return {
          source: bestMapping.source,
          line: bestMapping.originalLine,
          column: bestMapping.originalColumn,
          name: bestMapping.name,
        };
      }

      return {
        source: null,
        line: null,
        column: null,
        name: null,
      };
    },

    sourceContentFor(source: string): string | null {
      return sourceContentMap.get(source) ?? null;
    },
  };
}

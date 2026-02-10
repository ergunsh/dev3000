import type {ReactStackFrame, ReactStackTrace} from '../types';

/**
 * Normalize a single stack frame from the serialized array format to an object.
 * React DevTools serializes stack frames as arrays for efficiency:
 *   [functionName, fileName, lineNumber, columnNumber, enclosingLine, enclosingCol, isEnvName]
 * This converts them to the ReactStackFrame object format and cleans URLs.
 */
export function normalizeStackFrame(frame: unknown): ReactStackFrame | null {
  if (Array.isArray(frame)) {
    const [functionName, fileName, lineNumber, columnNumber] = frame;
    if (fileName && lineNumber !== undefined) {
      return {
        functionName: functionName ?? null,
        fileName: cleanSourceUrl(String(fileName)),
        lineNumber,
        columnNumber: columnNumber ?? 0,
      };
    }
    return null;
  }

  if (frame && typeof frame === 'object' && 'fileName' in frame) {
    const obj = frame as ReactStackFrame;
    if (obj.fileName && obj.lineNumber !== undefined) {
      return {
        ...obj,
        fileName: cleanSourceUrl(obj.fileName),
      };
    }
  }

  return null;
}

/**
 * Normalize an entire stack trace (array of frames) to ReactStackTrace.
 */
export function normalizeStackTrace(stack: unknown): ReactStackTrace | null {
  if (!Array.isArray(stack) || stack.length === 0) {
    return null;
  }

  const frames: ReactStackFrame[] = [];
  for (const frame of stack) {
    const normalized = normalizeStackFrame(frame);
    if (normalized) {
      frames.push(normalized);
    }
  }

  return frames.length > 0 ? frames : null;
}

/**
 * Clean up source URLs from React DevTools stack frames.
 * React 19+ uses URLs like "about://React/Server/file:///path/to/file.js?N"
 * for server component stack frames. This extracts a cleaner file path.
 */
export function cleanSourceUrl(url: string): string {
  let cleaned = url;

  // Strip "about://React/<env>/" prefix (e.g., "about://React/Server/")
  const aboutPrefix = /^about:\/\/React\/[^/]+\//;
  cleaned = cleaned.replace(aboutPrefix, '');

  // Strip "file://" prefix
  cleaned = cleaned.replace(/^file:\/\//, '');

  // Strip query string (e.g., "?8")
  cleaned = cleaned.replace(/\?.*$/, '');

  // Decode URL encoding (e.g., %5B -> [)
  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // If decoding fails, use as-is
  }

  return cleaned;
}

/**
 * Extract the raw URL from a stack frame without cleaning.
 * Used to pass the original compiled URL to source map resolution.
 */
export function extractRawUrl(frame: unknown): string | null {
  if (Array.isArray(frame)) {
    const fileName = frame[1];
    return fileName ? String(fileName) : null;
  }
  if (frame && typeof frame === 'object' && 'fileName' in frame) {
    return (frame as {fileName: string}).fileName ?? null;
  }
  return null;
}

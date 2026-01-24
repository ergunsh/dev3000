/**
 * Known dehydrated value types from React DevTools.
 * These are the types returned by getDataType() in DevTools hydration.js
 */
const DEHYDRATED_TYPES = new Set([
  // Primitives
  'null',
  'undefined',
  'boolean',
  'number',
  'nan',
  'infinity',
  'bigint',
  'string',
  'symbol',
  // Complex types
  'function',
  'object',
  'array',
  'typed_array',
  'array_buffer',
  'data_view',
  'iterator',
  'opaque_iterator',
  'regexp',
  'date',
  'thenable',
  'error',
  'class_instance',
  // React-specific
  'react_element',
  'react_lazy',
  // DOM
  'html_element',
  'html_all_collection',
  // Unknown
  'unknown',
]);

/**
 * Check if an object is a DevTools dehydrated value marker.
 * DevTools dehydrates nested objects to: { inspectable, type, preview_long, preview_short, name, size }
 */
function isDehydratedValue(obj: Record<string, unknown>): boolean {
  return (
    'type' in obj &&
    'preview_long' in obj &&
    'preview_short' in obj &&
    typeof obj.type === 'string' &&
    typeof obj.preview_long === 'string' &&
    DEHYDRATED_TYPES.has(obj.type as string)
  );
}

/**
 * Simple parser for DevTools preview_long format.
 * The format is JavaScript object literal notation:
 * - Objects: {key1: value1, key2: value2} (unquoted keys)
 * - Arrays: [value1, value2, ...]
 * - Strings: "value" (double-quoted)
 * - Numbers: 123, 123.45, -123
 * - Booleans: true, false
 * - Null/undefined: null, undefined
 * - Truncated data ends with … character
 */
class PreviewParser {
  private pos = 0;
  private input: string;

  constructor(input: string) {
    this.input = input;
  }

  parse(): unknown {
    this.skipWhitespace();
    const result = this.parseValue();
    return result;
  }

  private parseValue(): unknown {
    this.skipWhitespace();
    const char = this.peek();

    if (char === '{') {
      return this.parseObject();
    }
    if (char === '[') {
      return this.parseArray();
    }
    if (char === '"') {
      return this.parseString();
    }
    if (char === '-' || this.isDigit(char)) {
      return this.parseNumber();
    }
    // Keywords: true, false, null, undefined, NaN, Infinity
    return this.parseKeyword();
  }

  private parseObject(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    this.consume('{');
    this.skipWhitespace();

    if (this.peek() === '}') {
      this.consume('}');
      return result;
    }

    // Check for truncation marker
    if (this.peek() === '…') {
      this.consume('…');
      this.skipWhitespace();
      if (this.peek() === '}') {
        this.consume('}');
      }
      return result; // Return empty object for truncated
    }

    while (true) {
      this.skipWhitespace();

      // Check for truncation marker in the middle
      if (this.peek() === '…') {
        this.consume('…');
        this.skipWhitespace();
        if (this.peek() === '}') {
          this.consume('}');
        }
        break;
      }

      // Parse key (unquoted identifier or quoted string)
      let key: string;
      if (this.peek() === '"') {
        key = this.parseString();
      } else {
        key = this.parseIdentifier();
      }

      this.skipWhitespace();
      this.consume(':');
      this.skipWhitespace();

      // Parse value
      const value = this.parseValue();
      result[key] = value;

      this.skipWhitespace();
      if (this.peek() === ',') {
        this.consume(',');
        this.skipWhitespace();
        // Check for trailing truncation after comma
        if (this.peek() === '…') {
          this.consume('…');
          this.skipWhitespace();
          if (this.peek() === '}') {
            this.consume('}');
          }
          break;
        }
      } else if (this.peek() === '}') {
        this.consume('}');
        break;
      } else {
        // Unexpected end or character
        break;
      }
    }

    return result;
  }

  private parseArray(): unknown[] {
    const result: unknown[] = [];
    this.consume('[');
    this.skipWhitespace();

    if (this.peek() === ']') {
      this.consume(']');
      return result;
    }

    // Check for truncation marker
    if (this.peek() === '…') {
      this.consume('…');
      this.skipWhitespace();
      if (this.peek() === ']') {
        this.consume(']');
      }
      return result;
    }

    while (true) {
      this.skipWhitespace();

      // Check for truncation marker
      if (this.peek() === '…') {
        this.consume('…');
        this.skipWhitespace();
        if (this.peek() === ']') {
          this.consume(']');
        }
        break;
      }

      const value = this.parseValue();
      result.push(value);

      this.skipWhitespace();
      if (this.peek() === ',') {
        this.consume(',');
        this.skipWhitespace();
        // Check for trailing truncation
        if (this.peek() === '…') {
          this.consume('…');
          this.skipWhitespace();
          if (this.peek() === ']') {
            this.consume(']');
          }
          break;
        }
      } else if (this.peek() === ']') {
        this.consume(']');
        break;
      } else {
        break;
      }
    }

    return result;
  }

  private parseString(): string {
    this.consume('"');
    let result = '';
    while (this.pos < this.input.length) {
      const char = this.input[this.pos];
      if (char === '"') {
        this.pos++;
        break;
      }
      if (char === '\\' && this.pos + 1 < this.input.length) {
        this.pos++;
        const escaped = this.input[this.pos];
        switch (escaped) {
          case 'n':
            result += '\n';
            break;
          case 't':
            result += '\t';
            break;
          case 'r':
            result += '\r';
            break;
          case '\\':
            result += '\\';
            break;
          case '"':
            result += '"';
            break;
          default:
            result += escaped;
        }
        this.pos++;
      } else {
        result += char;
        this.pos++;
      }
    }
    return result;
  }

  private parseNumber(): number {
    let numStr = '';
    if (this.peek() === '-') {
      numStr += this.input[this.pos++];
    }
    while (this.pos < this.input.length && this.isDigit(this.peek())) {
      numStr += this.input[this.pos++];
    }
    if (this.peek() === '.') {
      numStr += this.input[this.pos++];
      while (this.pos < this.input.length && this.isDigit(this.peek())) {
        numStr += this.input[this.pos++];
      }
    }
    // Handle exponential notation
    if (this.peek() === 'e' || this.peek() === 'E') {
      numStr += this.input[this.pos++];
      if (this.peek() === '+' || this.peek() === '-') {
        numStr += this.input[this.pos++];
      }
      while (this.pos < this.input.length && this.isDigit(this.peek())) {
        numStr += this.input[this.pos++];
      }
    }
    return parseFloat(numStr);
  }

  private parseIdentifier(): string {
    let result = '';
    while (
      this.pos < this.input.length &&
      (this.isAlphaNumeric(this.peek()) || this.peek() === '_' || this.peek() === '$')
    ) {
      result += this.input[this.pos++];
    }
    return result;
  }

  private parseKeyword(): unknown {
    const identifier = this.parseIdentifier();
    switch (identifier) {
      case 'true':
        return true;
      case 'false':
        return false;
      case 'null':
        return null;
      case 'undefined':
        return undefined;
      case 'NaN':
        return NaN;
      case 'Infinity':
        return Infinity;
      default:
        // Return as string if not a recognized keyword
        return identifier;
    }
  }

  private peek(): string {
    return this.input[this.pos] || '';
  }

  private consume(expected: string): void {
    if (this.input[this.pos] === expected) {
      this.pos++;
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isAlphaNumeric(char: string): boolean {
    return (
      (char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      (char >= '0' && char <= '9')
    );
  }
}

/**
 * Try to parse a dehydrated value's preview_long field back to actual data.
 * DevTools uses JavaScript object literal format:
 * - Objects: {key: value, ...} with unquoted keys
 * - Arrays: [value1, value2, ...]
 * - Strings: "quoted"
 * - Numbers, booleans, null as literals
 * Returns the parsed value or null if parsing fails.
 */
function tryParseDehydratedPreview(preview: string, type: string): unknown {
  try {
    // Only parse object and array types - these have structured data
    if (type === 'object' || type === 'array') {
      const parser = new PreviewParser(preview);
      return parser.parse();
    }
    // For other types (string, number, etc.), the preview is just a display string
    return null;
  } catch {
    // If parsing fails, return null to indicate we should use the original format
    return null;
  }
}

/**
 * Safely serialize a value for JSON output, handling:
 * - Functions (convert to string representation)
 * - Circular references (replace with [Circular])
 * - Symbols (convert to string)
 * - BigInt (convert to string)
 * - DOM nodes (summarize)
 * - Errors (extract message and stack)
 */
export function safeSerialize(
  value: unknown,
  maxDepth: number = 10,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const type = typeof value;

  // Primitives
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value;
  }

  // BigInt
  if (type === 'bigint') {
    return `BigInt(${value.toString()})`;
  }

  // Symbol
  if (type === 'symbol') {
    return value.toString();
  }

  // Function
  if (type === 'function') {
    const fn = value as Function;
    const name = fn.name || 'anonymous';
    return `[Function: ${name}]`;
  }

  // Objects
  if (type === 'object') {
    // Max depth check
    if (maxDepth <= 0) {
      if (Array.isArray(value)) {
        return `[Array(${value.length})]`;
      }
      return '[Object]';
    }

    // Circular reference check
    if (seen.has(value as object)) {
      return '[Circular]';
    }
    seen.add(value as object);

    // Array
    if (Array.isArray(value)) {
      return value.map((item) => safeSerialize(item, maxDepth - 1, seen));
    }

    // Date
    if (value instanceof Date) {
      return value.toISOString();
    }

    // RegExp
    if (value instanceof RegExp) {
      return value.toString();
    }

    // Error
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    // Map
    if (value instanceof Map) {
      const obj: Record<string, unknown> = {__type__: 'Map'};
      for (const [k, v] of value.entries()) {
        const keyStr =
          typeof k === 'object' ? JSON.stringify(k) : String(k);
        obj[keyStr] = safeSerialize(v, maxDepth - 1, seen);
      }
      return obj;
    }

    // Set
    if (value instanceof Set) {
      return {
        __type__: 'Set',
        values: Array.from(value).map((v) =>
          safeSerialize(v, maxDepth - 1, seen)
        ),
      };
    }

    // WeakMap/WeakSet (can't enumerate)
    if (value instanceof WeakMap) {
      return '[WeakMap]';
    }
    if (value instanceof WeakSet) {
      return '[WeakSet]';
    }

    // Promise
    if (value instanceof Promise) {
      return '[Promise]';
    }

    // DOM Node
    if (typeof Node !== 'undefined' && value instanceof Node) {
      const node = value as Node;
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        return `[Element: <${el.tagName.toLowerCase()}>]`;
      }
      return `[Node: ${node.nodeName}]`;
    }

    // React element (check for $$typeof)
    const obj = value as Record<string, unknown>;
    if (obj.$$typeof) {
      // Get component name from type
      const type = obj.type;
      let typeName = 'Unknown';
      if (typeof type === 'string') {
        typeName = type;
      } else if (typeof type === 'function') {
        typeName = (type as Function).name || 'Anonymous';
      } else if (type && typeof type === 'object' && (type as {displayName?: string}).displayName) {
        typeName = (type as {displayName: string}).displayName;
      }
      return `[ReactElement: ${typeName}]`;
    }

    // DevTools dehydrated value - try to parse the preview back to actual data
    if (isDehydratedValue(obj)) {
      const parsed = tryParseDehydratedPreview(
        obj.preview_long as string,
        obj.type as string
      );
      if (parsed !== null) {
        // Successfully parsed - recursively serialize the parsed value
        return safeSerialize(parsed, maxDepth - 1, seen);
      }
      // If parsing failed, return a descriptive placeholder with the preview
      return `[${obj.type}: ${obj.preview_short}]`;
    }

    // Plain object
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      try {
        result[key] = safeSerialize(obj[key], maxDepth - 1, seen);
      } catch {
        result[key] = '[Error accessing property]';
      }
    }
    return result;
  }

  return String(value);
}

/**
 * Get the type name string for an element type number
 */
export function getElementTypeName(type: number): string {
  switch (type) {
    case 1:
      return 'Class';
    case 2:
      return 'Context';
    case 5:
      return 'Function';
    case 6:
      return 'ForwardRef';
    case 7:
      return 'HostComponent';
    case 8:
      return 'Memo';
    case 9:
      return 'Other';
    case 10:
      return 'Profiler';
    case 11:
      return 'Root';
    case 12:
      return 'Suspense';
    case 13:
      return 'SuspenseList';
    case 14:
      return 'TracingMarker';
    case 15:
      return 'Virtual';
    case 16:
      return 'ViewTransition';
    case 17:
      return 'Activity';
    default:
      return 'Unknown';
  }
}

/**
 * Check if an element type represents a host component (DOM element)
 */
export function isHostComponent(type: number): boolean {
  return type === 7; // ElementTypeHostComponent
}

/**
 * Check if the data is in DehydratedData format (wrapped by cleanForBridge)
 * DehydratedData has: { data: ..., cleaned: [...], unserializable: [...] }
 */
export function isDehydratedData(
  value: unknown
): value is {data: unknown; cleaned: unknown[]; unserializable: unknown[]} {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return 'data' in obj && 'cleaned' in obj && 'unserializable' in obj;
}

/**
 * Unwrap DehydratedData to get the actual data
 */
export function unwrapDehydratedData(value: unknown): unknown {
  if (isDehydratedData(value)) {
    return value.data;
  }
  return value;
}

/**
 * Unwrap DehydratedData format and then safely serialize the result.
 * Use this for props, state, context, etc. that come from DevTools.
 */
export function unwrapAndSerialize(
  value: unknown
): Record<string, unknown> | null {
  if (!value) {
    return null;
  }

  const unwrapped = unwrapDehydratedData(value);
  if (!unwrapped) {
    return null;
  }

  return safeSerialize(unwrapped) as Record<string, unknown>;
}

/**
 * HookSource type for source location information
 */
interface HookSource {
  lineNumber: number | null;
  columnNumber: number | null;
  fileName: string | null;
  functionName: string | null;
}

/**
 * Process a single hook node into a cleaner format
 */
function processHookNode(hook: unknown): {
  id: number | null;
  name: string;
  value: unknown;
  subHooks: unknown[];
  hookSource: HookSource | null;
} | null {
  if (!hook || typeof hook !== 'object') {
    return null;
  }

  const hookObj = hook as Record<string, unknown>;

  // Extract the hook name - could be directly on the object or need unwrapping
  const name = (hookObj.name as string) ?? 'unknown';

  // Extract the value - may be dehydrated
  let value = hookObj.value;
  if (isDehydratedData(value)) {
    // The value itself might be dehydrated, unwrap it
    value = unwrapDehydratedData(value);
  }

  // Process subHooks recursively
  let subHooks: unknown[] = [];
  if (hookObj.subHooks) {
    const unwrappedSubHooks = unwrapDehydratedData(hookObj.subHooks);
    if (Array.isArray(unwrappedSubHooks)) {
      subHooks = unwrappedSubHooks
        .map((sh) => processHookNode(sh))
        .filter((h): h is NonNullable<typeof h> => h !== null);
    }
  }

  // Extract hookSource for source location information
  let hookSource: HookSource | null = null;
  if (hookObj.hookSource && typeof hookObj.hookSource === 'object') {
    const source = hookObj.hookSource as Record<string, unknown>;
    hookSource = {
      lineNumber: (source.lineNumber as number) ?? null,
      columnNumber: (source.columnNumber as number) ?? null,
      fileName: (source.fileName as string) ?? null,
      functionName: (source.functionName as string) ?? null,
    };
  }

  return {
    id: (hookObj.id as number) ?? null,
    name,
    value: safeSerialize(value),
    subHooks,
    hookSource,
  };
}

/**
 * Process hooks data from inspected element into a cleaner format.
 * Handles DevTools' DehydratedData format: { data: [...], cleaned: [...], unserializable: [...] }
 */
export function processHooksData(
  hooks: unknown
): Array<{
  id: number | null;
  name: string;
  value: unknown;
  subHooks: unknown[];
  hookSource: HookSource | null;
}> | null {
  if (!hooks) {
    return null;
  }

  // Unwrap DehydratedData format if present
  // DevTools wraps hooks in { data: [...], cleaned: [...], unserializable: [...] }
  const unwrappedHooks = unwrapDehydratedData(hooks);

  if (!unwrappedHooks || typeof unwrappedHooks !== 'object') {
    return null;
  }

  // Hooks should be an array of HooksNode
  if (!Array.isArray(unwrappedHooks)) {
    // If it's a single hook object (rare case)
    const hookObj = unwrappedHooks as Record<string, unknown>;
    if (hookObj.name !== undefined || hookObj.id !== undefined) {
      const processed = processHookNode(hookObj);
      return processed ? [processed] : null;
    }
    return null;
  }

  // Process each hook in the array
  const result = unwrappedHooks
    .map((hook) => processHookNode(hook))
    .filter((h): h is NonNullable<typeof h> => h !== null);

  return result.length > 0 ? result : null;
}

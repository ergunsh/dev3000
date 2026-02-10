# Architecture

This document describes the internal architecture and implementation details of `react-devtools-mcp`.

## Directory Structure

```
src/
├── index.ts                 # Main entry point, auto-initializes on load
├── prepend.ts               # Hook installer (must run BEFORE React loads)
├── types.ts                 # All TypeScript types (self-contained, no external deps)
├── core/
│   ├── hook-accessor.ts     # Access to __REACT_DEVTOOLS_GLOBAL_HOOK__
│   ├── renderer-bridge.ts   # Wraps RendererInterface methods
│   ├── tree-store.ts        # Maintains component tree from operations events
│   ├── profiler-store.ts    # Manages profiling state and data collection
│   └── suspense-store.ts    # Maintains Suspense boundary tree from operations
├── tools/
│   ├── index.ts             # Tool registration
│   ├── get-component-tree.ts
│   ├── inspect-element.ts
│   ├── search-components.ts
│   ├── find-component-source.ts
│   ├── profiler-start.ts    # Start profiling tool
│   ├── profiler-stop.ts     # Stop profiling and format results
│   ├── get-suspense-tree.ts # Get Suspense boundary tree
│   ├── inspect-suspense.ts  # Inspect specific Suspense boundary
│   └── get-suspense-timeline.ts # Get Suspense resolution timeline
├── hooks/
│   ├── index.ts             # Hook name parsing exports
│   ├── parse-hook-names.ts  # Main orchestration for hook name parsing
│   ├── ast-utils.ts         # AST traversal and variable name extraction
│   ├── babel-parser.ts      # Babel parser wrapper
│   └── source-map-consumer.ts # Source map parsing
├── formatters/
│   ├── index.ts             # Formatter exports
│   ├── tree-formatter.ts    # Formats component tree as text
│   ├── element-formatter.ts # Formats inspected element details
│   ├── search-formatter.ts  # Formats search results
│   ├── source-formatter.ts  # Formats source location results
│   ├── profiler-formatter.ts # Formats profiling results as text
│   └── suspense-formatter.ts # Formats Suspense boundary info as text
└── utils/
    ├── operations-parser.ts # Parses DevTools operations format
    ├── serialization.ts     # Safe serialization, DehydratedData handling
    ├── css-selector.ts      # Generates CSS selectors for DOM elements
    ├── stack-utils.ts       # Stack frame normalization and URL helpers
    └── source-location-resolver.ts # Resolves compiled source locations via source maps

e2e/
├── hook-injection.spec.ts       # E2E tests for hook injection
├── get-component-tree.spec.ts   # E2E tests for component tree
├── inspect-element.spec.ts      # E2E tests for element inspection
├── search-components.spec.ts    # E2E tests for component search
├── find-component-source.spec.ts # E2E tests for source location
├── profiler.spec.ts             # E2E tests for profiler tools
├── suspense.spec.ts             # E2E tests for Suspense tools
├── nextjs.suspense.spec.ts      # E2E tests for Suspense with Next.js
└── nextjs.inspect-element.spec.ts # E2E tests for inspect-element with Next.js

sample-app/                  # Minimal React app for testing (Vite, port 5199)
sample-app-for-suspense/     # Next.js App Router app for Suspense testing (port 3999)
```

## Core Modules

### hook-accessor.ts

Provides typed access to the React DevTools global hook.

```typescript
interface HookAccessor {
  getHook(): DevToolsHook | null;
  isReady(): boolean;
  waitForRenderer(timeout?: number): Promise<void>;
  getRendererInterfaces(): Map<RendererID, RendererInterface>;
  getFirstRendererID(): RendererID | null;
  subscribeToOperations(callback: (ops: number[]) => void): () => void;
}
```

**Key responsibilities:**
- Check if `window.__REACT_DEVTOOLS_GLOBAL_HOOK__` exists
- Wait for `renderer-attached` event if no renderers yet
- Subscribe to `operations` events for tree updates

### renderer-bridge.ts

Wraps RendererInterface methods for easier consumption.

```typescript
interface RendererBridge {
  inspectElement(id: number, path?: Array<string | number> | null, forceFullData?: boolean): Promise<InspectedElementData | null>;
  getDisplayName(id: number): string | null;
  getOwners(id: number): SerializedElement[] | null;
  getPath(id: number): PathFrame[] | null;
  hasElement(id: number): boolean;
  findRendererForElement(id: number): RendererID | null;
  findHostInstances(id: number): Element[] | null;
  getElementIdForDomNode(element: Element): { id: number; rendererID: number } | null;
  flushInitialOperations(): void;
}
```

**Key responsibilities:**
- Find correct renderer for each element ID
- Handle multiple renderers
- Wrap RendererInterface method calls with error handling
- Map between DOM nodes and React element IDs

### tree-store.ts

Maintains the component tree by parsing DevTools operations.

```typescript
interface TreeStore {
  initialize(): void;
  cleanup(): void;
  getElements(): Map<number, ElementInfo>;
  getElement(id: number): ElementInfo | null;
  getRoots(): number[];
  getChildren(parentId: number): number[];
  getRendererIDForRoot(rootId: number): number | null;
}
```

**Key responsibilities:**
- Listen to `operations` events from hook
- Parse operation codes (ADD, REMOVE, REORDER)
- Maintain element tree structure with parent/child relationships

### profiler-store.ts

Manages profiling state and data collection from React DevTools profiler.

```typescript
interface ProfilerStore {
  isProfiling(): boolean;
  startProfiling(): void;
  stopProfiling(): ProfilingDataBackend[] | null;
}
```

**Key responsibilities:**
- Start/stop profiling on all renderer interfaces
- Collect profiling data from multiple renderers
- Return combined profiling results (commit durations, fiber actual/self durations)

### suspense-store.ts

Maintains the Suspense boundary tree by parsing DevTools Suspense operations.

```typescript
interface SuspenseStore {
  initialize(): void;
  cleanup(): void;
  getSuspenseByID(id: number): SuspenseNode | null;
  getAllSuspenseBoundaries(): Map<number, SuspenseNode>;
  getSuspenseRoots(): number[];
  getSuspenseChildren(parentId: number): number[];
  getTimeline(limit?: number): SuspenseTimelineStep[];
  getSuspendedCount(): number;
  buildSuspenseTree(maxDepth?: number): SuspenseTreeNode[];
}
```

**Key responsibilities:**
- Listen to `operations` events for Suspense-specific operations (codes 8-12)
- Track Suspense boundary hierarchy (parent/child relationships)
- Monitor suspension status changes (SUSPENDED → RESOLVED)
- Record resolution timeline with timing information
- Track server environments (RSC) for each boundary

**Note on timeline:** The store's live-captured timeline relies on observing state transitions via operations events. When MCP initializes after page load, `flushInitialOperations()` emits boundaries in their final state, so the store may miss transitions. The `react_get_suspense_timeline` tool compensates by inspecting each boundary's live fiber data at query time (via `rendererBridge.inspectElement`) to reconstruct per-suspender resolution entries. The store timeline serves as a fallback for boundaries without fiber data.

## Key Implementation Details

### 1. Hook Access (not Agent/Bridge)

We directly access `RendererInterface` from the hook rather than setting up the full Agent/Bridge message-passing infrastructure:

```typescript
const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
const rendererInterfaces = hook.rendererInterfaces; // Map<RendererID, RendererInterface>
```

### 2. Operations Parsing

DevTools emits `operations` events with encoded tree updates. Format:
```
[rendererID, rootID, stringTableSize, ...stringTable, ...operations]
```

**Critical:** Each operation type has different payload sizes. The parser MUST skip the correct number of values or it gets out of sync and misinterprets data as operation codes.

Operation types (from `react-devtools-shared/src/constants.js`):
- 1: TREE_OPERATION_ADD
- 2: TREE_OPERATION_REMOVE
- 3: TREE_OPERATION_REORDER_CHILDREN
- 4: TREE_OPERATION_UPDATE_TREE_BASE_DURATION
- 5: TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS
- 6: TREE_OPERATION_REMOVE_ROOT
- 7: TREE_OPERATION_SET_SUBTREE_MODE
- 8: SUSPENSE_TREE_OPERATION_ADD (parsed for Suspense tracking)
- 9: SUSPENSE_TREE_OPERATION_REMOVE (parsed for Suspense tracking)
- 10: SUSPENSE_TREE_OPERATION_REORDER_CHILDREN (parsed for Suspense tracking)
- 11: SUSPENSE_TREE_OPERATION_RESIZE (skipped - visual bounds not needed)
- 12: SUSPENSE_TREE_OPERATION_SUSPENDERS (parsed for Suspense tracking)
- 13: TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE

### 3. DehydratedData Format

**IMPORTANT:** Data from `inspectElement` (props, state, hooks, context) is wrapped in `DehydratedData`:

```typescript
{
  data: <actual data>,      // The real props/state/hooks/context
  cleaned: [...],           // Paths that were dehydrated
  unserializable: [...]     // Paths that couldn't be serialized
}
```

Must call `unwrapDehydratedData()` before processing. See `serialization.ts`.

### 4. inspectElement Signature

**Gotcha:** The type definition in `backend/types.js` says `inspectedPaths: Object` but the actual implementation expects `path: Array<string | number> | null`:

```typescript
// CORRECT - what the implementation actually expects:
renderer.inspectElement(requestID, id, path, forceFullData)
// where path is Array<string | number> | null, NOT an object
```

Passing `{}` instead of `null` causes "forEach is not a function" errors.

### 5. HooksNode Structure

Hooks from DevTools have this structure:
```typescript
interface HooksNode {
  id: number | null;
  isStateEditable: boolean;
  name: string;           // "State", "Callback", "Effect", etc.
  value: mixed;
  subHooks: HooksNode[];
  hookSource: {           // Source location for jump-to-source
    lineNumber: number | null;
    columnNumber: number | null;
    fileName: string | null;
    functionName: string | null;
  } | null;
}
```

### 6. Hook Name Parsing

The `react_inspect_element` tool automatically parses hook variable names from source code. This is ported from React DevTools' hook name parsing feature.

**How it works:**
1. Uses `hookSource` (fileName, lineNumber, columnNumber) from hooks data
2. Fetches the source file from the runtime URL
3. Loads source maps (inline base64 or external) to map to original source
4. Parses the original source to AST using `@babel/parser`
5. Traverses AST with `@babel/traverse` to find variable declarations at hook locations
6. Extracts the variable name from the declaration

**Example output:**
```
hooks:
  1. State(count): 5        // from: const [count, setCount] = useState(5)
  2. Ref(inputRef): ...     // from: const inputRef = useRef(null)
  3. Callback(onClick): ... // from: const onClick = useCallback(...)
```

**Key files:**
- `src/hooks/parse-hook-names.ts` - Main orchestration, source fetching, source map loading
- `src/hooks/ast-utils.ts` - AST traversal and name extraction (ported from React DevTools)
- `src/hooks/source-map-consumer.ts` - VLQ decoding and source map parsing
- `src/hooks/babel-parser.ts` - Babel parser wrapper with error recovery

**Gotchas:**
- Source files must be fetchable (same-origin or CORS-enabled)
- Source maps must be available for transpiled code to get original variable names
- Parsing is best-effort; failures don't break inspection (hooks still show without names)

### 7. Source Location Resolution

In React 19+, `_debugSource` was removed. Source info now lives in `_debugStack`, which React DevTools serializes as stack frames in array format:
```typescript
// [functionName, fileName, lineNumber, columnNumber, enclosingLine, enclosingCol, isEnvName]
["SlowData", "about://React/Server/file:///path/to/.next/dev/server/chunks/ssr/file.js?162", 942, 0, ...]
```

For Server Components (SSR), the file URLs point to compiled Turbopack chunks (e.g., `[root-of-the-server]__55484ccc._.js:942`). These compiled paths are not useful for users.

The `source-location-resolver.ts` utility resolves these back to original source files:

**SSR chunks** (`.next/dev/server/chunks/ssr/...`):
1. Extracting the `.next/...` chunk path from the `about://React/Server/file:///...` URL
2. Fetching a **sectioned source map** from Next.js's `/__nextjs_source-map?filename=...` endpoint
3. Finding the correct section (by line offset) and using the inner V3 source map to resolve original positions
4. Cleaning the resolved source path (e.g., `file:///Users/.../src/components/Foo.tsx` → `src/components/Foo.tsx`)

**Client chunks** (`_next/static/chunks/...`):
1. Extracting the chunk path from the `http://localhost:PORT/_next/static/chunks/...` URL (converting `_next/` → `.next/`)
2. Fetching the chunk directly via `/_next/static/chunks/...`
3. Extracting the `//# sourceMappingURL` comment from the chunk source
4. Loading the source map (inline base64 or external `.map` file) and resolving with `createSourceMapConsumer`

The `inspect-suspense.ts` tool integrates this resolution:
- Resolves the element's own `Source:` line when derived from stack frames
- Resolves owner stack frame URLs in the `rendered by:` section
- All resolutions run in parallel via `Promise.all`
- Falls back to the cleaned compiled URL if source map resolution fails

**Key files:**
- `src/utils/source-location-resolver.ts` - Fetch + resolve via sectioned source maps
- `src/hooks/source-map-consumer.ts` - V3 source map consumer (VLQ decoding), used for individual sections

**Limitations:**
- Only works with Next.js dev server (SSR requires `/__nextjs_source-map` endpoint; client requires fetchable chunks)
- Source maps are cached per chunk path for the lifetime of the page

### 8. Stack Frame Normalization

React DevTools serializes stack frames as arrays for efficiency. The `normalizeStackFrame` function in `src/utils/stack-utils.ts` converts them to typed objects:

```typescript
// Input (array format from React DevTools):
["SlowData", "about://React/Server/file:///.../.next/.../file.js?8", 942, 0, 940, 0, false]

// Output (ReactStackFrame object):
{ functionName: "SlowData", fileName: "/path/to/.next/.../file.js", lineNumber: 942, columnNumber: 0 }
```

The `cleanSourceUrl` function strips `about://React/<env>/` prefixes, `file://` prefixes, query strings, and decodes URL encoding to produce readable file paths.

### 9. Tool Output Format

All tools return **formatted text strings** (not JSON objects) optimized for LLM consumption. The formatters in `src/formatters/` convert structured data to human/LLM-readable text output.

## Key Reference Files in react-devtools-shared

When investigating DevTools behavior, check these files:

| File | Purpose |
|------|---------|
| `src/backend/fiber/renderer.js` | RendererInterface implementation, `inspectElement` |
| `src/backend/types.js` | Type definitions (note: some outdated) |
| `src/constants.js` | Operation type constants |
| `src/devtools/store.js` | Frontend operations parsing (reference implementation) |
| `src/hydration.js` | DehydratedData format, `dehydrate()` function |
| `src/backend/utils/index.js` | `cleanForBridge()` function |

## Serialization

The `serialization.ts` utility handles non-JSON-serializable values:
- Functions → `[Function: name]`
- Circular references → `[Circular]`
- Symbols → `Symbol(description)`
- BigInt → `BigInt(value)`
- DOM nodes → `[Element: <tagname>]`
- React elements → `[ReactElement: ComponentName]`
- Promises → `[Promise]`
- WeakMap/WeakSet → `[WeakMap]`/`[WeakSet]`

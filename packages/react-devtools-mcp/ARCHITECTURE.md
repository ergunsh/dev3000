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
│   └── tree-store.ts        # Maintains component tree from operations events
├── tools/
│   ├── index.ts             # Tool registration
│   ├── get-component-tree.ts
│   ├── inspect-element.ts
│   ├── search-components.ts
│   └── find-component-source.ts
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
│   └── source-formatter.ts  # Formats source location results
└── utils/
    ├── operations-parser.ts # Parses DevTools operations format
    ├── serialization.ts     # Safe serialization, DehydratedData handling
    └── css-selector.ts      # Generates CSS selectors for DOM elements

e2e/
└── hook-injection.spec.ts   # Playwright E2E tests

sample-app/                  # Minimal React app for testing
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
- 8-12: SUSPENSE_TREE_OPERATION_* (must skip correctly even if not processing)
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

### 7. Tool Output Format

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

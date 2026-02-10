# AGENTS.md - React DevTools MCP

This file contains essential context for AI agents working on this codebase.

## Documentation Maintenance

**IMPORTANT:** When making changes to this package, ensure all relevant documentation is updated:

- **README.md** - User-facing documentation (quick start, usage examples, tool API)
- **ARCHITECTURE.md** - Internal architecture and implementation details
- **CONTRIBUTING.md** - Build, test, and development instructions
- **AGENTS.md** (this file) - Agent-specific context and gotchas

All four documents must be kept in sync. When adding new tools, changing APIs, modifying the directory structure, or fixing bugs, update the relevant documentation files.

## Project Overview

`react-devtools-mcp` is a **fully self-contained package** that exposes React DevTools functionality as tools on `globalThis.__REACT_DEVTOOLS_MCP__.tools`. It builds to two IIFE bundles that can be injected into any page with React to programmatically inspect components.

**No browser extension required.** The package includes its own hook injection via `react-devtools-core`.

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

For additional architecture details, see [ARCHITECTURE.md](./ARCHITECTURE.md).

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

### 7. Source Location Resolution (Next.js / Turbopack)

React 19+ removed `_debugSource`; source info now lives in `_debugStack` serialized as array-format stack frames:
```
[functionName, fileName, lineNumber, columnNumber, enclosingLine, enclosingCol, isEnvName]
```

For SSR components, the `fileName` is a compiled chunk URL like `about://React/Server/file:///path/to/.next/dev/server/chunks/ssr/[chunk].js?N`. These chunks return 404 from the dev server (not fetchable), but Next.js exposes a `/__nextjs_source-map?filename=.next/dev/server/chunks/ssr/[chunk].js` endpoint that returns **sectioned source maps** (V3 with `sections` array).

For client components, the `fileName` is a direct HTTP URL like `http://localhost:PORT/_next/static/chunks/[hash].js`. These chunks are fetchable and contain a `//# sourceMappingURL` comment pointing to their source map (inline base64 or external `.map` file).

`source-location-resolver.ts` handles both cases:
- SSR: fetches sectioned source maps from `/__nextjs_source-map` endpoint
- Client: fetches the chunk directly, extracts `sourceMappingURL`, loads the standard V3 source map

`inspect-suspense.ts` integrates this to resolve both the element's `Source:` line and owner stack frames in the `rendered by:` section.

**Gotchas:**
- Must preserve raw URLs before `cleanSourceUrl` strips the `.next/` path needed by the resolver
- Source map resolution is async; all resolutions run in parallel via `Promise.all`
- `normalizeStackFrame` converts array-format frames to `ReactStackFrame` objects — raw frames must be accessed separately for resolution

### 8. Tool Output Format

All tools return **formatted text strings** optimized for LLM consumption, not JSON objects. The formatters in `src/formatters/` convert structured data to readable output.

## Available Tools

All tools are async and registered on `globalThis.__REACT_DEVTOOLS_MCP__.tools`:

| Tool | Description |
|------|-------------|
| `react_get_component_tree` | Get hierarchical component tree |
| `react_inspect_element` | Get props, state, hooks (with parsed variable names), context for element ID |
| `react_search_components` | Find components by name pattern |
| `react_find_component_source` | Find source file for component rendering a DOM element |
| `react_profiler_start` | Begin profiling session to record render times |
| `react_profiler_stop` | End profiling and return formatted results |
| `react_get_suspense_tree` | Get hierarchical Suspense boundary tree with status |
| `react_inspect_suspense` | Get detailed info about a specific Suspense boundary |
| `react_get_suspense_timeline` | Get timeline of Suspense boundary resolutions with source locations (reconstructs from live fiber data) |

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

## Common Issues & Solutions

### "Unknown operation type" warnings
**Cause:** Operations parser not handling all operation types, gets out of sync.
**Fix:** Ensure ALL operation types are handled with correct skip lengths in `operations-parser.ts`.

### inspectElement returns null or errors
**Cause:** Passing wrong parameter type for `path`.
**Fix:** Pass `null` (not `{}`) when no path needed. Pass `Array<string|number>` for hydration paths.

### hooks/props/state showing weird nested structure
**Cause:** Not unwrapping DehydratedData format.
**Fix:** Use `unwrapDehydratedData()` or `unwrapAndSerialize()` from `serialization.ts`.

### Element IDs not found
**Cause:** Tree store not populated yet.
**Fix:** Ensure `flushInitialOperations()` is called after initialization.

### Source locations showing compiled chunk paths
**Cause:** React 19+ removed `_debugSource`; stack frames contain compiled Turbopack chunk URLs.
**Fix:** Use `source-location-resolver.ts` which resolves both SSR chunks (via `/__nextjs_source-map` endpoint) and client chunks (via `//# sourceMappingURL` in the fetched chunk). Only works with Next.js dev server.

### Owner stacks showing ID instead of file location
**Cause:** `owner.stack` is in serialized array format `[[fn, file, line, ...]]`, not object format. Code expecting `owner.stack[0].fileName` gets `undefined`.
**Fix:** Use `normalizeStackFrame()` / `normalizeStackTrace()` to convert array-format frames to `ReactStackFrame` objects before accessing properties.

## Build & Test

```bash
npm install
npm run build          # Produces both IIFE bundles in dist/
npm run build:main     # Build main tools script only
npm run build:prepend  # Build prepend (hook installer) script only
npm run dev            # Watch mode
npm run start          # Interactive development (builds, starts sample app, launches Chrome)
npm run typecheck      # Type checking only
npm run test:e2e       # Run Playwright E2E tests
npm run test:e2e:ui    # Run tests with Playwright UI
```

**Build outputs:**
- `dist/react-devtools-mcp.iife.js` - Main tools script (inject after React mounts)
- `dist/react-devtools-mcp-prepend.iife.js` - Hook installer (inject BEFORE page loads)

**Injection order is critical:**
1. Prepend script must run BEFORE React loads (installs the hook)
2. Main script runs AFTER React mounts (uses the hook to inspect)

For full build and test instructions, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Future Work

See [ROADMAP.md](./ROADMAP.md) for planned features:
- Write operations (modify state/props)
- Component highlighting

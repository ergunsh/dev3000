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

All tools return **formatted text strings** optimized for LLM consumption, not JSON objects. The formatters in `src/formatters/` convert structured data to readable output.

## Available Tools

All tools are async and registered on `globalThis.__REACT_DEVTOOLS_MCP__.tools`:

| Tool | Description |
|------|-------------|
| `react_get_component_tree` | Get hierarchical component tree |
| `react_inspect_element` | Get props, state, hooks (with parsed variable names), context for element ID |
| `react_search_components` | Find components by name pattern |
| `react_find_component_source` | Find source file for component rendering a DOM element |

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
- Profiling support
- Component highlighting

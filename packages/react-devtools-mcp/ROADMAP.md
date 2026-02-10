# React DevTools MCP - Roadmap

This document tracks future implementation ideas and improvements for the `react-devtools-mcp` package.

---

## High Priority

### 1. Callback Source Location Parsing

**Status:** Not Started

**Problem:**
When inspecting components, callback functions (onClick handlers, event handlers, etc.) are shown as `[Function: onClick]` without source location information. This makes it difficult for LLMs to understand where the callback is defined or what it does.

**Solution:**
Parse source locations for callback functions and return the file/line/column where they are defined. This would allow LLMs to read the actual callback implementation.

**Output Format:**
```
props:
  onClick: [Function] → src/components/Button.tsx:45:15
  onSubmit: [Function] → src/hooks/useForm.ts:23:8

hooks:
  1. Callback(handleClick): [Function] → src/App.tsx:67:20
```

**Implementation Notes:**
- Callbacks in props often have source locations available via function `.toString()` or DevTools metadata
- For hooks created with `useCallback`, the `hookSource` already has location info
- Could extend to show a snippet of the callback body (first line or signature)
- Consider caching parsed source to avoid repeated fetches
- Reference: Current hook name parsing in `src/hooks/` uses similar source fetching

**Benefits:**
- LLMs can navigate to callback definitions to understand behavior
- Easier debugging of event handler issues
- Better context for understanding component behavior

---

### ~~2. Profiling Support~~ ✅ Completed

See Completed section below.

---

## Medium Priority

### 3. Write Operations Support

**Status:** Not Started

**Problem:**
Currently all tools are read-only. Users cannot modify component state, props, or trigger actions.

**Potential Tools:**
- `react_set_prop` - Modify a component's props
- `react_set_state` - Modify a component's state
- `react_set_hook_value` - Modify a hook's value (for editable hooks)
- `react_trigger_suspense` - Force a Suspense boundary to show fallback
- `react_trigger_error` - Trigger an error boundary

**Implementation Notes:**
- RendererInterface has methods like `overrideValueAtPath`, `overrideHookState`, etc.
- Need to handle the `canEditHooks`, `canEditFunctionProps` flags from InspectedElement
- Consider safety implications of write operations

---

### 4. Component Highlighting

**Status:** Not Started

**Problem:**
Cannot visually highlight components in the browser like DevTools does.

**Potential Tools:**
- `react_highlight_element` - Highlight a component's DOM nodes
- `react_scroll_to_element` - Scroll element into view

**Implementation Notes:**
- Reference: `react-devtools-shared/src/backend/views/Highlighter/`
- Uses overlay divs positioned over target elements
- Need access to `findHostInstancesForElementID`

---

## Low Priority

### 5. Timeline/Scheduler Integration

**Status:** Not Started (Suspense-related tools already completed — see below)

**Problem:**
No visibility into React's scheduling and concurrent features.

**Potential Tools:**
- `react_get_pending_transitions` - See in-progress transitions

**Note:** Suspense boundary inspection (`react_get_suspense_tree`, `react_inspect_suspense`, `react_get_suspense_timeline`) is already implemented. What remains is scheduler/transition-level visibility.

---

## Completed

- [x] Initial implementation with 4 read-only tools
- [x] Fix `inspectElement` path parameter (was passing object instead of array)
- [x] Fix hooks/props/state/context DehydratedData unwrapping
- [x] Add `hookSource` for hook source location information
- [x] **Self-contained hook injection** - Package now includes its own DevTools hook injection via `react-devtools-core`. No browser extension required. Two-script approach:
  - `react-devtools-mcp-prepend.iife.js` - Injects hook before React loads
  - `react-devtools-mcp.iife.js` - Main tools that use the hook
  - Works with Playwright (`page.addInitScript`) and Puppeteer (`page.evaluateOnNewDocument`)
  - E2E tests verify hook injection works correctly
- [x] **Hook name parsing** - Automatically parses variable names from source code for hooks:
  - Fetches source files and source maps (inline or external)
  - Uses Babel parser + AST traversal to extract variable names
  - Output shows `State(count):` instead of `State:`
  - Graceful degradation when source can't be fetched
  - Ported from React DevTools' `parseHookNames` implementation
- [x] **Profiling support** - Two tools for profiling component render times:
  - `react_profiler_start` - Start recording render timing data
  - `react_profiler_stop` - Stop recording and return formatted profiling results
  - Shows per-commit render trees with self/total durations
  - Core module: `profiler-store.ts` manages profiling state across renderers
  - Formatter: `profiler-formatter.ts` produces ASCII-tree output
  - E2E tests in `profiler.spec.ts`
- [x] **Suspense boundary tools** - Three tools for inspecting React Suspense boundaries:
  - `react_get_suspense_tree` - Hierarchical Suspense boundary tree with live status
  - `react_inspect_suspense` - Detailed boundary info (props, owner chain, suspendedBy, source)
  - `react_get_suspense_timeline` - Timeline of boundary resolutions (reconstructed from fiber data)
  - Core module: `suspense-store.ts` tracks boundaries via DevTools operations
  - Formatter: `suspense-formatter.ts` produces text output with status badges
  - E2E tests in `suspense.spec.ts` and `nextjs.suspense.spec.ts`
- [x] **Source location resolution (Next.js / Turbopack)** - Resolves compiled chunk paths to original source files:
  - SSR chunks: uses Next.js `/__nextjs_source-map` endpoint with sectioned source maps
  - Client chunks: fetches chunk source and extracts `//# sourceMappingURL`
  - Integrated into `react_inspect_suspense` for element source and owner stacks
  - Utility: `source-location-resolver.ts`

---

## Notes

### Key Architecture Decisions

1. **Direct RendererInterface Access:** We access `RendererInterface` directly from the hook rather than setting up the full Agent/Bridge architecture. This is simpler but means we don't get the message-passing benefits of the bridge.

2. **Operations Parsing:** We maintain our own `TreeStore` by parsing operations events. This duplicates some logic from `react-devtools-shared/src/devtools/store.js`.

3. **IIFE Bundle:** Single injectable bundle format keeps deployment simple but limits code splitting.

### Testing Considerations

- Need to test with various React versions (18.x, 19.x)
- Test with different rendering modes (legacy, concurrent, server components)
- ~~Test with and without React DevTools extension present~~ ✅ E2E tests now verify this
- Test with minified production React builds

### E2E Test Coverage

Current E2E tests (`npm run test:e2e`) verify:
- Hook injection works without browser extension (`hook-injection.spec.ts`)
- Component tree retrieval returns valid data (`get-component-tree.spec.ts`)
- Element inspection with props, hooks, state (`inspect-element.spec.ts`)
- Component search by name (`search-components.spec.ts`)
- Source file location for DOM elements (`find-component-source.spec.ts`)
- Profiler start/stop with render data (`profiler.spec.ts`)
- Suspense boundary tree and inspection (`suspense.spec.ts`)
- Next.js-specific Suspense with SSR and source map resolution (`nextjs.suspense.spec.ts`)

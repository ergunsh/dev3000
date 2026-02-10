# React Suspense Tools Specification

## Overview

Add tools to expose React Suspense boundary tracking functionality:
- `react_get_suspense_tree` - Get hierarchical Suspense boundary tree
- `react_get_suspense_timeline` - Get timeline of Suspense boundary resolutions
- **Enhance `react_inspect_element`** - Add `suspendedBy` data to show what caused suspensions

### The Key Question This Solves

> "Something flickers, the page flashes white. Something suspends, but there's no obvious suspense boundary. It's super hard to figure out which part has a suspense. What actually caused the page to suspend?"

**Answer workflow:**
1. Use `react_get_suspense_tree` → Find which Suspense boundaries exist and which are suspended
2. Use `react_inspect_element` on the suspended boundary → See exactly what async operations are blocking it (fetch URLs, server components, etc.) with stack traces

## Background

React DevTools tracks Suspense boundaries to help developers understand async loading sequences. Key concepts:

- **Suspense Boundary**: A `<Suspense>` component that catches async operations and shows fallback UI
- **Suspended**: A boundary is "suspended" when it's waiting for async operations (data fetching, lazy components, server components)
- **Environment**: For React Server Components (Flight), tracks which server environment is blocking (e.g., "react", "edge")
- **Unique Suspenders**: Async operations that only block this boundary, not a parent (useful for identifying bottlenecks)
- **End Time**: When the boundary finished loading (resolved)

---

## Data Structures

### SuspenseNode (for tree tools)

```typescript
interface SuspenseNode {
  id: number;                    // Element ID of the Suspense boundary
  parentID: number;              // Parent Suspense boundary ID (0 = root)
  children: number[];            // Child Suspense boundary IDs
  name: string | null;           // Boundary name (from name prop or heuristic)
  isSuspended: boolean;          // Currently waiting for async operations?
  hasUniqueSuspenders: boolean;  // Has suspenders not shared with parent?
  environments: string[];        // Server environment names (Flight/RSC)
  endTime: number;               // Resolution time in ms (0 if still suspended)
}
```

### SuspenseTimelineStep

```typescript
interface SuspenseTimelineStep {
  id: number;                    // Suspense boundary ID
  name: string | null;           // Boundary name
  environment: string | null;    // Server environment (if applicable)
  endTime: number;               // When this step resolved (ms from page load)
}
```

### SuspendedByInfo (the critical "what caused it" data)

This is the key data structure for answering "what caused the suspension":

```typescript
// Information about an async operation that's causing suspension
interface SerializedIOInfo {
  name: string;                  // "fetch", "use", "lazy", "RSC stream", etc.
  description: string;           // URL for fetches, or other details
  start: number;                 // When the async operation started (ms)
  end: number;                   // When it resolved (ms), 0 if pending
  byteSize: number | null;       // Response size for network requests
  env: string | null;            // Server environment (RSC)
  owner: SerializedElement | null;  // Component that STARTED this async op
  stack: ReactStackTrace | null;    // Stack trace where it was started
}

// Who is waiting on the async operation
interface SerializedAsyncInfo {
  awaited: SerializedIOInfo;     // The async operation being awaited
  env: string | null;            // Environment where it's being awaited
  owner: SerializedElement | null;  // Component that's AWAITING this
  stack: ReactStackTrace | null;    // Stack trace where it's being awaited
}

interface SerializedElement {
  displayName: string | null;
  id: number;
  env: string | null;
  type: ElementType;
}

type ReactStackTrace = Array<{
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  functionName: string | null;
}>;
```

---

## Enhancement: `react_inspect_element` (PRIORITY: HIGH)

**This is the most important change for answering "what caused the suspension?"**

The existing `react_inspect_element` tool needs to include the `suspendedBy` data that React DevTools already provides but we currently ignore.

### New Fields to Add to InspectElementResult

```typescript
interface InspectElementResult {
  // ... existing fields ...

  // NEW: Suspension information
  isSuspended: boolean;                    // Is this element currently suspended?
  suspendedBy: SuspendedByInfo[] | null;   // What's causing the suspension?
  suspendedByRange: [number, number] | null; // Time range of suspensions
  unknownSuspenders: UnknownSuspendersReason;
}

interface SuspendedByInfo {
  // What async operation is blocking
  name: string;           // "fetch", "use", "lazy", "RSC stream"
  description: string;    // URL or other details
  startTime: number;      // When it started (ms)
  endTime: number;        // When it resolved (ms), 0 if pending
  byteSize: number | null;
  environment: string | null;  // Server environment (RSC)

  // Where it was started
  startedBy: {
    componentName: string | null;
    componentId: number | null;
    stack: StackFrame[] | null;
  } | null;

  // Where it's being awaited
  awaitedBy: {
    componentName: string | null;
    componentId: number | null;
    stack: StackFrame[] | null;
  } | null;
}

type UnknownSuspendersReason =
  | 'none'           // We know all suspenders
  | 'production'     // Production build, can't track
  | 'old-version'    // Old React version
  | 'thrown-promise' // Legacy thrown promise pattern
```

### Updated Output Format

When inspecting a suspended Suspense boundary:

```
Element [id=42] Suspense "MainContent"
Type: Suspense
Status: ⏳ SUSPENDED

suspended by:
  1. fetch "/api/users" (pending, started 234ms ago)
     started by: UserList [id=45] at src/components/UserList.tsx:23
     awaited by: UserList [id=45] at src/components/UserList.tsx:25

  2. RSC stream (resolved in 156ms, 12.4 kB)
     environment: edge
     started by: ServerComponent [id=38]
     awaited by: MainContent [id=42]

props:
  fallback: <Spinner />
  ...
```

### Implementation Notes

The `suspendedBy` data already exists in the DevTools response - we just need to extract and format it:

```typescript
// In inspect-element.ts, add:
const suspendedBy = element.suspendedBy; // Already in the response!
const suspendedByRange = element.suspendedByRange;
const unknownSuspenders = element.unknownSuspenders;
const isSuspended = element.isSuspended;
```

---

## Tool: `react_get_suspense_tree`

### Description
Get the hierarchical tree of all Suspense boundaries in the React application.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rootID` | `number` | No | all roots | Specific React root to query |
| `suspendedOnly` | `boolean` | No | `false` | Only show currently suspended boundaries |
| `uniqueSuspendersOnly` | `boolean` | No | `false` | Only show boundaries with unique suspenders |

### Return Value
Formatted text showing Suspense boundary hierarchy:

```
Suspense Boundaries (3 total, 1 suspended)

Root #1:
  Suspense "AppShell" [id=5]
    └─ Suspense "MainContent" [id=12] ⏳ SUSPENDED
    │    environments: react, edge
    │    has unique suspenders
    └─ Suspense "Sidebar" [id=18] ✓ resolved at 234ms

Root #2:
  (no Suspense boundaries)
```

### Behavior
1. Collects all Suspense boundaries from the tree store
2. Builds hierarchical structure based on parent-child relationships
3. Filters by `suspendedOnly` and `uniqueSuspendersOnly` if specified
4. Formats as readable text with status indicators

---

## Tool: `react_get_suspense_timeline`

### Description
Get the timeline showing the order in which Suspense boundaries resolved. Useful for understanding the loading sequence and identifying slow async operations.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `rootID` | `number` | No | all roots | Specific React root to query |
| `uniqueSuspendersOnly` | `boolean` | No | `false` | Only include boundaries with unique suspenders |

### Return Value
Formatted text showing resolution timeline:

```
Suspense Timeline (5 steps)

  0ms  ▶ Initial Paint
 45ms  │ Suspense "AppShell" [id=5] resolved
        │   environment: react
123ms  │ Suspense "Sidebar" [id=18] resolved
234ms  │ Suspense "MainContent" [id=12] resolved
        │   environments: react, edge
        │   unique suspenders: yes
 ---   │ Suspense "UserProfile" [id=23] ⏳ still pending

Total load time: 234ms (1 boundary still pending)
```

### Behavior
1. Collects all Suspense boundaries
2. Orders by `endTime` (resolution time)
3. Filters by `uniqueSuspendersOnly` if specified
4. Includes still-pending boundaries at the end
5. Formats as timeline with timestamps

---

## Implementation Notes

### Suspense Store

Create `src/core/suspense-store.ts` to manage Suspense boundary state:

```typescript
interface SuspenseStore {
  // Core state
  suspenseNodes: Map<number, SuspenseNode>;

  // Query methods
  getSuspenseByID(id: number): SuspenseNode | null;
  getAllSuspenseBoundaries(rootID?: number): SuspenseNode[];
  getSuspenseChildren(id: number): number[];
  getSuspenseLineage(id: number): number[];

  // Timeline methods
  getTimeline(options?: TimelineOptions): SuspenseTimelineStep[];

  // Operations handling
  handleOperations(operations: number[]): void;
}
```

### Operations Parsing

Must handle these operation types from `react-devtools-shared/src/constants.js`:

| Operation | Code | Payload |
|-----------|------|---------|
| `SUSPENSE_TREE_OPERATION_ADD` | 8 | `id, parentID, nameStringID, isSuspended, numRects, ...rects` |
| `SUSPENSE_TREE_OPERATION_REMOVE` | 9 | `removeLength, id1, id2, ...` |
| `SUSPENSE_TREE_OPERATION_REORDER_CHILDREN` | 10 | `parentID, numChildren, childID1, ...` |
| `SUSPENSE_TREE_OPERATION_RESIZE` | 11 | `id, numRects, ...rects` (skip for MCP) |
| `SUSPENSE_TREE_OPERATION_SUSPENDERS` | 12 | `changeLength, (id, hasUniqueSuspenders, endTime, isSuspended, envCount, envNameIDs...)...` |

**Note:** Rect data can be skipped for MCP purposes since we format as text, not visual.

### Hook Events

Listen for Suspense events on `__REACT_DEVTOOLS_GLOBAL_HOOK__`:

```typescript
hook.on('operations', (operations: number[]) => {
  // Parse and update Suspense store
  suspenseStore.handleOperations(operations);
});
```

The operations array interleaves component tree operations with Suspense tree operations. The parser must handle both.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No Suspense boundaries exist | Return informative message: "No Suspense boundaries found" |
| Invalid boundary ID | Return error: "Suspense boundary with id X not found" |
| ID exists but not a Suspense boundary | Return error: "Element X is not a Suspense boundary" |
| React not detected | Return standard "React not detected" error |

---

## Output Format

All tools return text summaries (human-readable), consistent with other tools in this package. This format is optimized for LLM consumption.

---

## Example Use Cases

### Use Case 1: "The page flashes white - what's causing the suspension?"

**Step 1: Find which Suspense boundary is triggering**
```
> react_get_suspense_tree --suspendedOnly

Suspense Boundaries (1 suspended)

Root #1:
  Suspense "PageShell" [id=12] ⏳ SUSPENDED
    has unique suspenders
```

**Step 2: Inspect the boundary to see what's blocking it**
```
> react_inspect_element --id 12

Element [id=12] Suspense "PageShell"
Type: Suspense
Status: ⏳ SUSPENDED

suspended by:
  1. fetch "/api/dashboard" (pending, started 1.2s ago)
     started by: DashboardData [id=34] at src/data/DashboardData.tsx:15
     awaited by: Dashboard [id=28] at src/pages/Dashboard.tsx:42

  2. fetch "/api/user/preferences" (pending, started 1.1s ago)
     started by: UserPreferences [id=41] at src/hooks/usePreferences.ts:8
     awaited by: Header [id=19] at src/components/Header.tsx:23

props:
  fallback: <FullPageSpinner />
```

**Answer:** The page is showing the fallback because two API calls (`/api/dashboard` and `/api/user/preferences`) are still pending. The slow one is `/api/dashboard` started by `DashboardData` component at line 15.

---

### Use Case 2: "Which of these 20 dashboard widgets caused the suspend?"

```
> react_get_suspense_tree

Suspense Boundaries (5 total, 1 suspended)

Root #1:
  Suspense "AppShell" [id=5] ✓ resolved at 45ms
    └─ Suspense "Dashboard" [id=12] ✓ resolved at 234ms
        └─ Suspense "WidgetA" [id=18] ✓ resolved at 123ms
        └─ Suspense "WidgetB" [id=23] ✓ resolved at 189ms
        └─ Suspense "WidgetC" [id=31] ⏳ SUSPENDED  ← Found it!
            has unique suspenders

> react_inspect_element --id 31

suspended by:
  1. fetch "/api/analytics/slow-query" (pending, started 3.4s ago)
     started by: AnalyticsChart [id=45] at src/widgets/AnalyticsChart.tsx:67
```

---

### Use Case 3: Understanding the loading sequence

```
> react_get_suspense_timeline

Suspense Timeline (4 steps)

   0ms  ▶ Initial Paint
  45ms  │ Suspense "AppShell" resolved
 123ms  │ Suspense "WidgetA" resolved
 189ms  │ Suspense "WidgetB" resolved
 234ms  │ Suspense "Dashboard" resolved
  ---   │ Suspense "WidgetC" ⏳ still pending  ← Bottleneck!

Total load time: 234ms (1 boundary still pending)
```

---

### Use Case 4: React Server Components debugging

```
> react_inspect_element --id 42

Element [id=42] Suspense "ServerContent"
Status: ⏳ SUSPENDED

suspended by:
  1. RSC stream (pending, 2.1s)
     environment: edge
     started by: EdgeFunction [server]

  2. RSC stream (resolved in 456ms, 24.5 kB)
     environment: react
     started by: DataFetcher [server]
```

**Answer:** The Edge function server component is still streaming. The main React server resolved quickly but we're waiting on the edge environment.

---

## Implementation Priority

| Priority | Item | Reason |
|----------|------|--------|
| **1 (Critical)** | Enhance `react_inspect_element` with `suspendedBy` | Answers "what caused the suspension?" |
| **2 (High)** | `react_get_suspense_tree` | Find which boundaries exist and are suspended |
| **3 (Medium)** | `react_get_suspense_timeline` | Understand loading sequence and find bottlenecks |

The `suspendedBy` enhancement is the most valuable because it directly answers the debugging question with actionable information (URLs, component names, stack traces).

---

## Future Enhancements

- **Activity/Transition Support**: Track named Activity boundaries for transitions (requires `enableActivity` feature flag)
- **Suspense Override**: Allow programmatically setting suspense state for debugging (via `overrideSuspenseMilestone` bridge message)
- **Rect Bounds**: Include visual bounds for use with screenshot analysis (currently omitted for text-only output)

---

## Summary

To answer **"What actually caused the page to suspend?"**:

1. **`react_get_suspense_tree`** → Shows WHICH Suspense boundaries exist and which are currently suspended
2. **`react_inspect_element`** (enhanced) → Shows WHAT is causing each suspension:
   - The async operation type (fetch, lazy, RSC stream, use())
   - The URL or description
   - Which component started it + stack trace
   - Which component is awaiting it + stack trace
   - Timing information (how long it's been pending)

This combination gives complete visibility into Suspense behavior without needing to use the browser DevTools UI.

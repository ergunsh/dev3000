# Suspense Tool Improvements

## Goal

Replicate the key functionality of the React DevTools Suspense panel sidebar through our MCP tools. The panel shows three sections for a selected Suspense boundary:

1. **"suspended by"** — What async operations are blocking this boundary (the critical missing piece)
2. **"props"** — The Suspense component's props (already partially handled)
3. **"rendered by"** — Component ancestry with source locations and environment tags (needs enrichment)

---

## What the React DevTools Panel Shows (from screenshot)

When selecting a Suspense boundary like "RecentTransactions", the sidebar shows:

```
suspended by
  ▶ rsc stream                                    [====== blue bar ======]
      awaited at:
        <TransactionsContent> Server
      awaited value: ReadableStream

  ▼ delay                                         [===== green bar =====]
      delay @ data.ts:55
      fetchRecentTransactions @ data.ts:72
      TransactionsContent @ RecentTransactions.tsx:89
      <TransactionsContent> Server
      awaited value: undefined

props
  ▶ children: fulfilled lazy() {<div />}
  ▶ fallback: <div />

rendered by
  RecentTransactions @ RecentTransactions.tsx:111
  <RecentTransactions> Server
  Dashboard @ page.tsx:56
  <Dashboard> Server
  Home @ page.tsx:78
  <Home> Server
  hydrateRoot()
  react-dom@19.3.0-canary-f93b9fd4-20251217
```

---

## Gap Analysis: What's Missing

### 1. `suspendedBy` data — NOT IMPLEMENTED (Critical)

The `inspectElement` response from React DevTools already includes `suspendedBy`, `suspendedByRange`, `isSuspended`, and `unknownSuspenders` fields. We receive this data but completely ignore it.

**What we need:**
- Extract `suspendedBy` (array of `SerializedAsyncInfo`) from the inspected element response
- Extract `suspendedByRange` (`[startTime, endTime] | null`)
- Extract `unknownSuspenders` (reason code)
- Format as readable text

**Where the data lives:**

The renderer's `inspectElement()` at `renderer.js:7105-7107` returns:
```js
{
  suspendedBy: suspendedBy,         // Array<SerializedAsyncInfo>
  suspendedByRange: suspendedByRange, // [number, number] | null
  unknownSuspenders: unknownSuspenders, // 0|1|2|3
}
```

Each `SerializedAsyncInfo` contains:
```typescript
{
  awaited: {
    name: string,          // "rsc stream", "delay", "fetch", "Promise", etc.
    description: string,   // URL, resolved value description
    start: number,         // ms timestamp when async op started
    end: number,           // ms timestamp when it resolved (0 if pending)
    byteSize: number|null, // byte size for streams
    value: Promise|null,   // the actual promise (we can check status)
    env: string|null,      // server environment ("rsc", "server", etc.)
    owner: SerializedElement|null,  // component that STARTED this I/O
    stack: ReactStackTrace|null,    // stack trace where I/O was initiated
  },
  env: string|null,                 // environment where it was awaited
  owner: SerializedElement|null,    // component that's AWAITING this
  stack: ReactStackTrace|null,      // stack trace of the await location
}
```

Where `SerializedElement` is:
```typescript
{
  displayName: string|null,
  id: number,
  key: number|string|null,
  env: string|null,       // "Server", etc.
  stack: ReactStackTrace|null,
  hocDisplayNames: string[]|null,
  compiledWithForget: boolean,
  type: ElementType,
}
```

And `ReactStackTrace` is:
```typescript
Array<{
  fileName: string,
  lineNumber: number,
  columnNumber: number,
  functionName: string|null,
}>
```

### 2. Richer "rendered by" — PARTIALLY IMPLEMENTED (Enhancement)

Our current "rendered by" shows: `ComponentName (#id) > ComponentName (#id)`

The React DevTools panel shows:
```
RecentTransactions @ RecentTransactions.tsx:111
<RecentTransactions> Server
Dashboard @ page.tsx:56
...
hydrateRoot()
react-dom@19.3.0-canary-...
```

Each owner entry includes source location (`@ file:line`) and environment tags (`Server`).

This data is available in the `owners` array (typed as `SerializedElement[]`) and in the `rootType` and `rendererPackageName`/`rendererVersion` fields of the inspect response. We already receive all of these but only extract `displayName`, `id`, and `type`.

### 3. Our `InspectedElementData` type is incomplete

Our type definition at `src/types.ts:282-315` does not include:
- `suspendedBy` — the array of async operation info
- `suspendedByRange` — time range of suspensions
- `unknownSuspenders` — reason code for unknown suspenders
- `stack` — component stack trace

These fields ARE returned by the renderer but we never typed them, so we never extract them.

### 4. `react_inspect_suspense` is shallow

Our current `react_inspect_suspense` tool only returns data from the `SuspenseStore` (boundary hierarchy, status, timing). It doesn't call `inspectElement` at all, so it can never show what *caused* the suspension. The React DevTools panel gets all the "suspended by" data by calling `inspectElement` on the boundary.

---

## Implementation Plan

### Change 1: Add missing fields to `InspectedElementData` type

**File:** `src/types.ts`

Add the missing fields to `InspectedElementData`:

```typescript
export interface InspectedElementData {
  // ... existing fields ...

  // Suspension information (already returned by renderer, just not typed)
  suspendedBy: SerializedAsyncInfo[] | null;
  suspendedByRange: [number, number] | null;
  unknownSuspenders: number; // 0=none, 1=production, 2=old-version, 3=thrown-promise

  // Component stack (for richer rendered-by)
  stack: ReactStackTrace | null;
}
```

Add new types:

```typescript
export type ReactStackFrame = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  functionName: string | null;
};

export type ReactStackTrace = ReactStackFrame[];

export interface SerializedIOInfo {
  name: string;
  description: string;
  start: number;
  end: number;
  byteSize: number | null;
  value: unknown;
  env: string | null;
  owner: SerializedElement | null;
  stack: ReactStackTrace | null;
}

export interface SerializedAsyncInfo {
  awaited: SerializedIOInfo;
  env: string | null;
  owner: SerializedElement | null;
  stack: ReactStackTrace | null;
}
```

Also update `SerializedElement` to include the fields we've been ignoring:

```typescript
export interface SerializedElement {
  displayName: string | null;
  id: number;
  key: number | string | null;
  env: string | null;              // NEW: environment name ("Server", etc.)
  stack: ReactStackTrace | null;   // NEW: component stack trace
  hocDisplayNames: string[] | null; // NEW: HOC wrapper names
  compiledWithForget: boolean;     // NEW: compiled with React Compiler
  type: ElementType;
}
```

### Change 2: Add `suspendedBy` to `InspectElementResult`

**File:** `src/types.ts`

```typescript
export interface InspectElementResult {
  // ... existing fields ...

  // Suspension info (new)
  isSuspended: boolean | null;
  suspendedBy: SuspendedByInfo[] | null;
  unknownSuspendersReason: string | null; // "production" | "old-version" | "thrown-promise" | null
}

export interface SuspendedByInfo {
  name: string;             // "rsc stream", "delay", "fetch", etc.
  description: string;      // URL or resolved value description
  startTime: number;        // ms
  endTime: number;          // ms (0 if pending)
  duration: number;         // endTime - startTime (or time-since-start if pending)
  byteSize: number | null;
  environment: string | null;

  // Where the I/O was started
  startedBy: {
    componentName: string | null;
    componentId: number | null;
    environment: string | null;
    stack: ReactStackFrame[] | null;
  } | null;

  // Where it's being awaited
  awaitedBy: {
    componentName: string | null;
    componentId: number | null;
    environment: string | null;
    stack: ReactStackFrame[] | null;
  } | null;
}
```

### Change 3: Extract suspendedBy in inspect-element tool

**File:** `src/tools/inspect-element.ts`

After calling `rendererBridge.inspectElement()`, extract the suspension data:

```typescript
// Extract suspension info from the element response
const isSuspended = element.isSuspended ?? null;
let suspendedBy: SuspendedByInfo[] | null = null;
let unknownSuspendersReason: string | null = null;

if (element.suspendedBy && Array.isArray(element.suspendedBy) && element.suspendedBy.length > 0) {
  suspendedBy = element.suspendedBy.map(asyncInfo => ({
    name: asyncInfo.awaited.name,
    description: asyncInfo.awaited.description,
    startTime: asyncInfo.awaited.start,
    endTime: asyncInfo.awaited.end,
    duration: asyncInfo.awaited.end > 0
      ? asyncInfo.awaited.end - asyncInfo.awaited.start
      : performance.now() - asyncInfo.awaited.start,
    byteSize: asyncInfo.awaited.byteSize,
    environment: asyncInfo.awaited.env,
    startedBy: asyncInfo.awaited.owner ? {
      componentName: asyncInfo.awaited.owner.displayName,
      componentId: asyncInfo.awaited.owner.id,
      environment: asyncInfo.awaited.owner.env,
      stack: asyncInfo.awaited.stack,
    } : null,
    awaitedBy: asyncInfo.owner ? {
      componentName: asyncInfo.owner.displayName,
      componentId: asyncInfo.owner.id,
      environment: asyncInfo.owner.env,
      stack: asyncInfo.stack,
    } : null,
  }));
}

// Map unknownSuspenders code to reason string
if (element.unknownSuspenders) {
  switch (element.unknownSuspenders) {
    case 1: unknownSuspendersReason = 'production'; break;
    case 2: unknownSuspendersReason = 'old-version'; break;
    case 3: unknownSuspendersReason = 'thrown-promise'; break;
  }
}
```

**Note:** The `suspendedBy` data may be wrapped in `DehydratedData` format (like props/hooks/state). Check `cleanForBridge` usage in `renderer.js:7575-7577` — it applies `cleanForBridge` to `suspendedBy` with a path allowlist. We need to handle this the same way we handle props/hooks unwrapping via `unwrapAndSerialize` or similar. The `suspendedBy[i].awaited.value` field is the promise itself and will be dehydrated — we likely don't need the raw promise value for our text output, just the metadata around it.

### Change 4: Enrich "rendered by" with source locations and env tags

**File:** `src/tools/inspect-element.ts`

Update the owners processing to include source and env info:

```typescript
// Process owners - include source location and environment
const owners: OwnerInfo[] = [];
if (element.owners) {
  for (const owner of element.owners) {
    owners.push({
      id: owner.id,
      displayName: owner.displayName,
      type: getElementTypeName(owner.type),
      env: owner.env ?? null,          // NEW
      stack: owner.stack ?? null,      // NEW: has source location
    });
  }
}
```

**File:** `src/types.ts`

Update `OwnerInfo`:

```typescript
export interface OwnerInfo {
  id: number;
  displayName: string | null;
  type: string;
  env: string | null;                 // NEW: "Server", etc.
  stack: ReactStackFrame[] | null;    // NEW: source location
}
```

Also include `rootType` and renderer info from the response for the bottom of the chain:

```typescript
export interface InspectElementResult {
  // ... existing fields ...
  rootType: string | null;            // NEW: "hydrateRoot()", "createRoot()", etc.
  rendererPackageName: string | null; // NEW: "react-dom"
  rendererVersion: string | null;     // NEW: "19.3.0-canary-..."
}
```

### Change 5: Update element formatter for suspendedBy

**File:** `src/formatters/element-formatter.ts`

Add a `formatSuspendedBy` function:

```typescript
function formatSuspendedBy(
  suspendedBy: SuspendedByInfo[],
  unknownReason: string | null
): string {
  const lines: string[] = ['suspended by:'];

  for (let i = 0; i < suspendedBy.length; i++) {
    const info = suspendedBy[i];
    const num = i + 1;

    // Header: name and timing
    const status = info.endTime > 0
      ? `resolved in ${info.duration.toFixed(0)}ms`
      : `pending, ${info.duration.toFixed(0)}ms so far`;
    const bytes = info.byteSize != null
      ? `, ${formatByteSize(info.byteSize)}`
      : '';
    const desc = info.description ? ` "${info.description}"` : '';
    const env = info.environment ? ` [${info.environment}]` : '';

    lines.push(`  ${num}. ${info.name}${desc} (${status}${bytes})${env}`);

    // I/O stack trace (where the async operation was initiated)
    if (info.startedBy?.stack && info.startedBy.stack.length > 0) {
      for (const frame of info.startedBy.stack) {
        const fn = frame.functionName ?? '(anonymous)';
        const file = frame.fileName.split('/').pop();
        lines.push(`     ${fn} @ ${file}:${frame.lineNumber}`);
      }
    }

    // Started by component
    if (info.startedBy?.componentName) {
      const envTag = info.startedBy.environment
        ? ` [${info.startedBy.environment}]`
        : '';
      lines.push(`     started by: ${info.startedBy.componentName}${envTag}`);
    }

    // Awaited at stack trace
    if (info.awaitedBy?.stack && info.awaitedBy.stack.length > 0) {
      lines.push('     awaited at:');
      for (const frame of info.awaitedBy.stack) {
        const fn = frame.functionName ?? '(anonymous)';
        const file = frame.fileName.split('/').pop();
        lines.push(`       ${fn} @ ${file}:${frame.lineNumber}`);
      }
    }

    // Awaited by component
    if (info.awaitedBy?.componentName) {
      const envTag = info.awaitedBy.environment
        ? ` [${info.awaitedBy.environment}]`
        : '';
      lines.push(`     awaited by: ${info.awaitedBy.componentName}${envTag}`);
    }
  }

  // Unknown suspenders warning
  if (unknownReason) {
    switch (unknownReason) {
      case 'production':
        lines.push('  (some suspenders unknown — use development build for details)');
        break;
      case 'old-version':
        lines.push('  (some suspenders unknown — upgrade React for full tracking)');
        break;
      case 'thrown-promise':
        lines.push('  (some suspenders unknown — library using thrown Promises instead of use())');
        break;
    }
  }

  return lines.join('\n');
}
```

Update `formatInspectedElement` to include suspension info:

```typescript
export function formatInspectedElement(result: InspectElementResult): string {
  const lines: string[] = [];

  // Header
  const name = result.name ?? 'Unknown';
  const envTag = result.env ? ` [${result.env}]` : '';
  lines.push(`${name} (#${result.id})${envTag}`);

  // Suspension status (show prominently if suspended)
  if (result.isSuspended === true) {
    lines.push('Status: SUSPENDED');
  }
  lines.push('');

  // Suspended by (BEFORE props — most important for debugging)
  if (result.suspendedBy && result.suspendedBy.length > 0) {
    lines.push(formatSuspendedBy(result.suspendedBy, result.unknownSuspendersReason));
    lines.push('');
  } else if (result.unknownSuspendersReason) {
    lines.push(formatSuspendedBy([], result.unknownSuspendersReason));
    lines.push('');
  }

  // Props, hooks, context (existing)
  // ...

  // Rendered by (enriched with source + env)
  lines.push(formatRenderedBy(result.owners, result.rootType, result.rendererInfo));
  // ...
}
```

Update `formatRenderedBy` for richer output:

```typescript
function formatRenderedBy(
  owners: OwnerInfo[],
  rootType?: string | null,
  rendererInfo?: string | null
): string {
  if (owners.length === 0 && !rootType) {
    return 'rendered by: (root)';
  }

  const lines: string[] = ['rendered by:'];

  for (const owner of owners) {
    const name = owner.displayName ?? 'Anonymous';
    const envTag = owner.env ? ` [${owner.env}]` : '';

    // Include source location from first stack frame
    if (owner.stack && owner.stack.length > 0) {
      const frame = owner.stack[0];
      const file = frame.fileName.split('/').pop();
      lines.push(`  ${name} @ ${file}:${frame.lineNumber}${envTag}`);
    } else {
      lines.push(`  ${name} (#${owner.id})${envTag}`);
    }
  }

  // Root type (e.g., "hydrateRoot()", "createRoot()")
  if (rootType) {
    lines.push(`  ${rootType}`);
  }

  // Renderer info
  if (rendererInfo) {
    lines.push(`  ${rendererInfo}`);
  }

  return lines.join('\n');
}
```

### Change 6: Update `react_inspect_suspense` to also call `inspectElement`

**File:** `src/tools/inspect-suspense.ts`

The current `react_inspect_suspense` only uses the SuspenseStore. It should also call `inspectElement` to get the `suspendedBy` data, making it a superset of information.

This tool should accept a `rendererBridge` in addition to `suspenseStore`, and merge the data:

```typescript
export function createInspectSuspenseTool(
  suspenseStore: SuspenseStore,
  rendererBridge: RendererBridge   // NEW
): Tool<InspectSuspenseParams, string> {
  const handler = async (params: InspectSuspenseParams): Promise<string> => {
    const {id} = params;

    // Get boundary info from suspense store
    const node = suspenseStore.getSuspenseByID(id);
    if (!node) {
      return `Suspense boundary with ID ${id} not found.`;
    }

    // Also call inspectElement to get suspendedBy data
    const element = await rendererBridge.inspectElement(id, null, true);

    // Merge and format both data sources
    return formatInspectedSuspense(node, depth, element);
  };
}
```

### Change 7: Update suspense formatter to include suspendedBy

**File:** `src/formatters/suspense-formatter.ts`

Update `formatInspectedSuspense` to also render the `suspendedBy` data, props, and rendered-by chain from the inspected element. The output should match the React DevTools sidebar:

```
=== Suspense Boundary ===

RecentTransactions (#42)
Status: SUSPENDED

suspended by:
  1. rsc stream (pending, 1234ms so far) [react]
     awaited at:
       <TransactionsContent> [Server]
     awaited value: ReadableStream

  2. delay (resolved in 500ms)
     delay @ data.ts:55
     fetchRecentTransactions @ data.ts:72
     TransactionsContent @ RecentTransactions.tsx:89
     started by: TransactionsContent [Server]
     awaited value: undefined

props:
  children: fulfilled lazy() {<div />}
  fallback: <div />

rendered by:
  RecentTransactions @ RecentTransactions.tsx:111 [Server]
  Dashboard @ page.tsx:56 [Server]
  Home @ page.tsx:78 [Server]
  hydrateRoot()
  react-dom@19.3.0-canary-...
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/types.ts` | Add `SerializedAsyncInfo`, `SerializedIOInfo`, `ReactStackFrame`, `SuspendedByInfo` types. Update `InspectedElementData`, `InspectElementResult`, `OwnerInfo`, `SerializedElement`. |
| `src/tools/inspect-element.ts` | Extract `suspendedBy`, `suspendedByRange`, `unknownSuspenders`, `isSuspended` from element response. Enrich owners with `env` and `stack`. Extract `rootType` and renderer info. |
| `src/formatters/element-formatter.ts` | Add `formatSuspendedBy()`. Update `formatRenderedBy()` for source locations and env tags. Update `formatInspectedElement()` to include suspension section. |
| `src/tools/inspect-suspense.ts` | Accept `rendererBridge`, call `inspectElement` to get suspension detail alongside store data. |
| `src/formatters/suspense-formatter.ts` | Update `formatInspectedSuspense()` to render suspendedBy, props, and enriched rendered-by when element data is available. |
| `src/tools/index.ts` | Pass `rendererBridge` to `createInspectSuspenseTool`. |

---

## DehydratedData Handling

The `suspendedBy` field is run through `cleanForBridge()` (renderer.js:7575-7577) before being sent, which means it follows the same `DehydratedData` wrapping as props/hooks/state. However, the path allowlist for `suspendedBy` is:

```js
createIsPathAllowed('suspendedBy', 'suspendedBy')
```

This means nested values under `suspendedBy[i].awaited.value` are dehydrated (they're Promise objects), but the metadata fields (name, description, start, end, stack, owner, etc.) should come through as-is since they're primitive values or small objects.

We should use `unwrapDehydratedData()` on the `suspendedBy` array if it's wrapped, similar to how we handle props. But we can skip trying to serialize the `value` field (the raw Promise) since we only need the metadata.

---

## Priority

1. **Changes 1-3, 5**: Add `suspendedBy` to `react_inspect_element` — this is the critical missing feature that answers "what caused the suspension?"
2. **Change 4**: Enrich "rendered by" — nice improvement but not blocking
3. **Changes 6-7**: Update `react_inspect_suspense` — makes it a more complete single tool for Suspense debugging

---

## Testing

### E2E tests to add

1. **Suspense boundary with active suspenders**: Create a test app with `<Suspense>` wrapping a component that uses `use()` or `fetch()`, inspect the boundary, verify `suspendedBy` data appears in output.

2. **RSC stream suspender**: If possible with the test setup, verify RSC stream entries show name, byte size, and environment.

3. **Resolved suspension**: After a suspension resolves, inspect again and verify timing data (duration) is present.

4. **Unknown suspenders**: Test with a component that throws a Promise directly (legacy pattern), verify the warning message appears.

5. **Enriched rendered-by**: Inspect a component and verify source locations and environment tags appear in the rendered-by chain.

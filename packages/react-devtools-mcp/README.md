# react-devtools-mcp

A fully self-contained package that exposes React DevTools functionality as tools on `globalThis.__REACT_DEVTOOLS_MCP__.tools`. Designed for browser automation with Puppeteer, Playwright, or similar tools to programmatically inspect React applications.

**No browser extension required.** The package includes its own DevTools hook injection via `react-devtools-core`.

## Quick Start

### Installation

```bash
npm install
npm run build
```

This produces two files in `dist/`:
- `react-devtools-mcp-prepend.iife.js` - Hook installer (inject BEFORE React loads)
- `react-devtools-mcp.iife.js` - Main tools (inject AFTER React mounts)

### Usage with Playwright

```typescript
import { chromium } from 'playwright';
import fs from 'fs';

const prependScript = fs.readFileSync('dist/react-devtools-mcp-prepend.iife.js', 'utf-8');
const mainScript = fs.readFileSync('dist/react-devtools-mcp.iife.js', 'utf-8');

const browser = await chromium.launch();
const page = await browser.newPage();

// 1. Inject hook installer BEFORE page loads
await page.addInitScript(prependScript);

// 2. Navigate to React app
await page.goto('http://localhost:3000');

// 3. Wait for React to mount
await page.waitForSelector('#root');

// 4. Inject main tools AFTER React mounts
await page.evaluate(mainScript);

// 5. Use tools
const tree = await page.evaluate(() =>
  globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_component_tree.handler({})
);
console.log(tree);
```

### Usage with Puppeteer

```typescript
import puppeteer from 'puppeteer';
import fs from 'fs';

const prependScript = fs.readFileSync('dist/react-devtools-mcp-prepend.iife.js', 'utf-8');
const mainScript = fs.readFileSync('dist/react-devtools-mcp.iife.js', 'utf-8');

const browser = await puppeteer.launch();
const page = await browser.newPage();

// 1. Inject hook installer
await page.evaluateOnNewDocument(prependScript);

// 2. Navigate to React app
await page.goto('http://localhost:3000');

// 3. Wait for React to mount
await page.waitForSelector('#root');

// 4. Inject main tools
await page.evaluate(mainScript);

// 5. Use tools
const tree = await page.evaluate(() =>
  globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_component_tree.handler({})
);
```

### Tool Examples

```javascript
// Get the component tree
const tree = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_component_tree.handler({});

// Inspect a specific component by ID
const details = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_inspect_element.handler({ id: 3 });

// Search for components by name
const results = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_search_components.handler({
  query: 'Button'
});

// Find source location for a component rendering a DOM element
const source = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_find_component_source.handler({
  selector: '.my-button'
});

// Profile component render times
await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_profiler_start.handler({});
// ... interact with application ...
const profilingResults = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_profiler_stop.handler({});

// Get Suspense boundary tree
const suspenseTree = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_tree.handler({});

// Inspect a specific Suspense boundary
const suspenseDetails = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_inspect_suspense.handler({ id: 5 });

// Get Suspense resolution timeline
const timeline = await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_timeline.handler({ limit: 20 });
```

## Available Tools

All tools are async and return formatted text output optimized for LLM consumption.

### `react_get_component_tree`

Get the React component tree structure.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | number | unlimited | Maximum depth to traverse |
| `includeHostComponents` | boolean | false | Include DOM elements in tree |

### `react_inspect_element`

Get detailed information about a specific component including props, state, hooks, and context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | yes | Element ID to inspect |
| `path` | (string\|number)[] | no | Path to hydrate nested data |

### `react_search_components`

Find components by name pattern.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `caseSensitive` | boolean | false | Case-sensitive search |
| `limit` | number | 50 | Max results to return |

### `react_find_component_source`

Find the source file location for a React component that renders a specific DOM element.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `selector` | string | yes | CSS selector for the DOM element |

### `react_profiler_start`

Start React profiling to record component render times. Call `react_profiler_stop` to end profiling and get results.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (none) | - | - | No parameters required |

### `react_profiler_stop`

Stop React profiling and return results showing component render times. Must call `react_profiler_start` first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (none) | - | - | No parameters required |

**Output format:**
```
=== Profiling Results (N commits captured) ===

Commit 1 | 2.3ms total
├─ App (self: 0.1ms, total: 2.3ms)
│  └─ Header (self: 0.2ms, total: 0.3ms)
│     └─ NavLink (0.1ms)

=== Summary ===
Total commits: N
Total render time: Xms
```

### `react_get_suspense_tree`

Get the React Suspense boundary tree structure showing suspension status. Boundary names are automatically inferred from owner components when not explicitly set. Boundaries marked as suspended are verified against live fiber data to ensure accurate status.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `depth` | number | unlimited | Maximum depth to traverse |

**Output format:**
```
=== Legend ===
[SUSPENDED]               → boundary is currently suspended (loading)
[RESOLVED]                → boundary has resolved (content shown)
[RESOLVED 123ms]          → boundary resolved after 123ms
(env: react, edge)        → server environments (RSC)
[unique suspenders]       → boundary has unique pending suspenders

Use react_inspect_suspense(id) for full boundary details.

=== Suspense Tree ===
Total: 3 | Suspended: 1

Dashboard (#5) [RESOLVED 234ms] (env: react)
└─ RecentTransactions (#8) [SUSPENDED] [unique suspenders]
ImageGallery (#12) [RESOLVED]
```

### `react_inspect_suspense`

Get detailed information about a specific Suspense boundary including what async operations are blocking it, its props, and the component ancestry that rendered it. Uses live fiber data for accurate suspension status. For Next.js apps, automatically resolves compiled chunk paths to original source files via source maps.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | yes | Suspense boundary ID to inspect |

**Output format:**
```
=== Suspense Boundary ===

RecentTransactions (#8)
Status: SUSPENDED
Resolution Time: pending...

suspended by:
  1. rsc stream (resolved in 234ms, 15.3KB) [rsc]
     stream @ data.ts:55
     started by: TransactionsContent [Server]
  2. delay (pending, 120ms so far)
     delay @ utils.ts:12
     fetchRecentTransactions @ data.ts:72
     started by: TransactionsContent [Server]
     awaited at:
       TransactionsContent @ RecentTransactions.tsx:89
     awaited by: RecentTransactions [Server]

props:
  fallback: <div />

rendered by:
  RecentTransactions @ RecentTransactions.tsx:111 [Server]
  Dashboard @ page.tsx:56 [Server]
  Home @ page.tsx:78 [Server]
  react-dom@19.3.0-canary...

Depth: 1
Parent ID: 5
Children: 10, 11
Has Unique Suspenders: yes
Environments: react, rsc
```

### `react_get_suspense_timeline`

Get the timeline of Suspense boundary resolutions with source locations. Reconstructs resolution data at query time by inspecting live fiber data for each boundary, so it captures resolutions even when MCP initializes after page load. Source locations are resolved via source maps to show original file paths.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 50 | Maximum entries to return |

**Output format:**
```
=== Suspense Timeline ===
Resolved: 5 | Pending: 2

Recent resolutions (most recent first):

1. [5ms]      stylesheet resolved -> Dashboard (#8) [rsc]
   started by: DataFetcherInternal @ layout.tsx:25 [rsc]
2. [3001ms]   DataFetcherInternal resolved -> Server(Home) (#70)
   started by: DataFetcherInternal @ page.tsx:13 [Server]
3. Suspense (#42) resolved at 150ms
```

## Constraints

- **Read-only**: This package only provides read access to DevTools data
- **Injection order matters**: Prepend script must run before React loads
- **Latest React only**: Targets the latest React version; older versions may not work
- **Browser automation focused**: Designed for Puppeteer/Playwright injection

## Documentation

- [CONTRIBUTING.md](./CONTRIBUTING.md) - How to build, test, and develop
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture and implementation details
- [ROADMAP.md](./ROADMAP.md) - Planned features

## License

MIT

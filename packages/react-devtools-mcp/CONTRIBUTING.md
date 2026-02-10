# Contributing

This document covers how to build, test, and develop `react-devtools-mcp`.

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
npm install
```

## Build

```bash
npm run build          # Build both IIFE bundles
npm run build:main     # Build main tools script only
npm run build:prepend  # Build prepend (hook installer) script only
npm run dev            # Build in watch mode
npm run typecheck      # Run TypeScript type checking only
```

### Build Outputs

- `dist/react-devtools-mcp.iife.js` - Main tools script (inject after React mounts)
- `dist/react-devtools-mcp-prepend.iife.js` - Hook installer (inject BEFORE page loads)

## Development

### Interactive Development with `npm run start`

The easiest way to develop and test is using the interactive development script:

```bash
npm run start
```

This script:
1. Builds the project (both prepend and main scripts)
2. Starts the sample React app on `http://localhost:5199`
3. Launches Chrome with DevTools open
4. Injects the prepend script (before React loads)
5. Navigates to the sample app
6. Injects the main script (after React loads)
7. Leaves the browser open for you to interact with the tools in the Console

Once running, open the Console tab in DevTools and try:

```javascript
// Get the component tree
await tools.react_get_component_tree.handler({})

// Search for components by name
await tools.react_search_components.handler({ query: "Counter" })

// Inspect a specific component (use ID from search/tree)
await tools.react_inspect_element.handler({ id: 3 })
```

Close the browser window or press `Ctrl+C` to exit.

## Testing

### Automated E2E Tests (Recommended)

```bash
npm run test:e2e       # Run Playwright E2E tests
npm run test:e2e:ui    # Run tests with Playwright UI
```

This runs Playwright tests against two sample apps:
- **sample-app** (Vite, port 5199): Core tool tests (hook injection, tree, inspect, search, profiler, suspense)
- **sample-app-for-suspense** (Next.js App Router, port 3999): Next.js-specific Suspense tests (SSR boundaries, source map resolution, nested boundaries)

Both servers are started automatically by Playwright via the `webServer` config.

### Manual Testing

1. Build the scripts: `npm run build`
2. Start the sample app:
   ```bash
   cd sample-app && npm run dev
   ```
3. In another terminal, run tests with UI:
   ```bash
   npm run test:e2e:ui
   ```

### Testing with Browser Automation

You can also test manually with Puppeteer or Playwright:

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

## Injection Order

**Critical:** The injection order matters:

1. **Prepend script** must run BEFORE React loads (installs the hook)
2. **Main script** runs AFTER React mounts (uses the hook to inspect)

For Playwright, use `page.addInitScript()` for the prepend script.
For Puppeteer, use `page.evaluateOnNewDocument()` for the prepend script.

## Project Structure

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed information about the codebase structure and implementation details.

## Common Issues

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

### Source locations showing compiled chunk paths instead of original files
**Cause:** SSR chunks use compiled URLs (`[root-of-the-server]__55484ccc._.js:942`). The runtime URLs return 404 from the dev server.
**Fix:** Use `source-location-resolver.ts` which fetches sectioned source maps from the Next.js `/__nextjs_source-map` endpoint and resolves to original source files. This only works with Next.js dev server.

## Code Style

- Run `npm run typecheck` before committing to ensure no TypeScript errors
- All tools return formatted text strings (not JSON objects)
- Tool handlers are async for consistency

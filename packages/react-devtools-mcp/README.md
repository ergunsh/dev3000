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

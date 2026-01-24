# React DevTools MCP Integration

This document describes the React DevTools integration for d3k, enabling AI agents to inspect React component trees, state, props, and hooks via MCP tools.

## Overview

When d3k detects a React project, it automatically injects React DevTools scripts into the browser. This exposes four MCP tools that AI agents (like Claude) can use to understand and debug React applications.

**Key Features:**
- No browser extension required - scripts are injected automatically
- Read-only access to React component internals
- Output formatted for LLM consumption
- Hook variable names parsed from source maps

## MCP Tools

| Tool | Description |
|------|-------------|
| `react_devtools_get_component_tree` | Get hierarchical component tree with names, types, and IDs |
| `react_devtools_inspect_element` | Get props, state, hooks, context for a specific component by ID |
| `react_devtools_search_components` | Find components by name pattern |
| `react_devtools_find_component_source` | Map a CSS selector to the React component source file |

## How It Works

1. **Detection**: d3k auto-detects React projects via `package.json`
2. **Hook injection**: A prepend script installs the DevTools hook BEFORE React loads
3. **Tools injection**: After React mounts, the main tools script is injected
4. **MCP exposure**: Tools are available at `globalThis.__REACT_DEVTOOLS_MCP__.tools`
5. **MCP server**: The d3k MCP server wraps these tools and exposes them via MCP protocol

## Example Usage

An AI agent can inspect a component like this:

```
1. Call react_devtools_get_component_tree to see the hierarchy
2. Find the component ID of interest (e.g., id: 5 for "Header")
3. Call react_devtools_inspect_element with id: 5 to see its props, state, hooks
4. Or use react_devtools_find_component_source with selector: "nav" to find the source file
```

## Implementation

The implementation lives in `packages/react-devtools-mcp/` as a self-contained package that:

- Uses `react-devtools-core` for DevTools hook infrastructure
- Directly accesses `RendererInterface` (no Agent/Bridge setup needed)
- Parses hook variable names from source maps
- Formats output as readable text for AI consumption

## Try It Out

1. **Build the canary version:**
   ```bash
   bun run canary
   ```

2. **Run d3k in a React project:**
   ```bash
   cd /path/to/your-react-app
   d3k
   ```
   or the sample app in `react-devtools-mcp` package
   ```bash
   cd packages/react-devtools-mcp/sample-app
   d3k
   ```

3. **Configure MCP client:** Ensure the d3k MCP server is configured in your MCP client.

4. **Test with a prompt:**
   ```
   What are the React components on http://localhost:5173? use dev3000.
   ```

   The agent will use `react_devtools_get_component_tree` to show the component hierarchy, and can follow up with `react_devtools_inspect_element` to dive into specific components.

## Documentation

For technical details, see the package documentation:

- [packages/react-devtools-mcp/README.md](./packages/react-devtools-mcp/README.md) - Quick start and API reference
- [packages/react-devtools-mcp/ARCHITECTURE.md](./packages/react-devtools-mcp/ARCHITECTURE.md) - Internal architecture
- [packages/react-devtools-mcp/CONTRIBUTING.md](./packages/react-devtools-mcp/CONTRIBUTING.md) - Build and test instructions
- [packages/react-devtools-mcp/ROADMAP.md](./packages/react-devtools-mcp/ROADMAP.md) - Future plans (write operations, profiling)

## Constraints

- **Read-only**: No state/props modifications (intentional for safety)
- **Latest React**: Targets current React version; older versions may not work
- **Same-origin sources**: Hook name parsing requires fetchable source files

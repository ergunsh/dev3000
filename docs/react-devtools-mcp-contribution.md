# React DevTools MCP Tool Contribution Guide

This skill provides comprehensive guidance for creating or modifying React DevTools MCP tools through the full stack.

> **MAINTENANCE REQUIREMENT**: After making ANY changes to React DevTools MCP tools (adding tools, modifying parameters, changing output formats, updating types), you MUST update this skill document to reflect those changes. This ensures future Claude Code sessions have accurate context.

## Architecture Overview

The React DevTools MCP tools span two layers:

1. **MCP Server Layer** (`mcp-server/app/mcp/route.ts`) - Exposes tools to Claude/AI clients via MCP protocol
2. **react-devtools-mcp Package** (`packages/react-devtools-mcp/`) - Browser-side implementation that interfaces with React DevTools

### Data Flow

```
Claude/AI Client
    ↓ (MCP protocol)
mcp-server/app/mcp/route.ts
    ↓ (calls executeBrowserAction with JS expression)
Chrome DevTools Protocol (CDP)
    ↓ (evaluates in page context)
globalThis.__REACT_DEVTOOLS_MCP__.tools.react_*
    ↓ (calls tool handler)
react-devtools-mcp package (injected in page)
    ↓ (uses DevTools hook)
__REACT_DEVTOOLS_GLOBAL_HOOK__.rendererInterfaces
    ↓ (inspects components)
React Fiber Tree
```

---

## Key Files to Read

Before making changes, read these files in order:

### MCP Server Side
| File | Purpose |
|------|---------|
| `mcp-server/app/mcp/route.ts` (lines 719-853) | React DevTools tool registrations |
| `mcp-server/app/mcp/tools.ts` | Tool descriptions and helper functions |

### react-devtools-mcp Package
| File | Purpose |
|------|---------|
| `packages/react-devtools-mcp/src/types.ts` | All TypeScript interfaces |
| `packages/react-devtools-mcp/src/tools/index.ts` | Tool registration |
| `packages/react-devtools-mcp/src/tools/*.ts` | Individual tool implementations |
| `packages/react-devtools-mcp/src/core/renderer-bridge.ts` | Bridge to React DevTools RendererInterface |
| `packages/react-devtools-mcp/src/core/tree-store.ts` | Cached component tree state |
| `packages/react-devtools-mcp/src/formatters/*.ts` | Output formatters |
| `packages/react-devtools-mcp/src/hooks/*.ts` | Hook name parsing from source code |
| `packages/react-devtools-mcp/CLAUDE.md` | Package-specific AI context |

---

## Adding a New Tool

### Step 1: Define Types in `packages/react-devtools-mcp/src/types.ts`

```typescript
// Add parameter interface
export interface MyToolParams {
  requiredParam: string;
  optionalParam?: number;
}

// Add result interface (if complex)
export interface MyToolResult {
  data: string;
  count: number;
}

// Add to Tools interface
export interface Tools {
  // ... existing tools
  react_my_new_tool: Tool<MyToolParams, string>;
}
```

### Step 2: Create Tool Factory in `packages/react-devtools-mcp/src/tools/my-tool.ts`

```typescript
import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {Tool, MyToolParams} from '../types';
import {formatMyTool} from '../formatters/my-tool-formatter';

export function createMyTool(
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tool<MyToolParams, string> {
  const handler = async (params: MyToolParams): Promise<string> => {
    const {requiredParam, optionalParam = 10} = params;

    // 1. Validate inputs
    if (!requiredParam) {
      return formatMyTool({error: 'requiredParam is required'});
    }

    // 2. Use treeStore for cached tree data (fast)
    const elements = treeStore.getElements();
    const roots = treeStore.getRoots();

    // 3. Use rendererBridge for detailed inspection (slower)
    // rendererBridge.inspectElement(id, path, forceFullData)
    // rendererBridge.getDisplayName(id)
    // rendererBridge.getOwners(id)
    // rendererBridge.getElementIdForDomNode(element)

    // 4. Process data
    const result = /* your logic */;

    // 5. Format and return
    return formatMyTool(result);
  };

  return {
    description: 'Brief description of what this tool does for the MCP client',
    inputs: {
      type: 'object',
      properties: {
        requiredParam: {
          type: 'string',
          description: 'Description of this parameter',
        },
        optionalParam: {
          type: 'number',
          description: 'Optional parameter description',
        },
      },
      required: ['requiredParam'],
    },
    handler,
  };
}
```

### Step 3: Create Formatter in `packages/react-devtools-mcp/src/formatters/my-tool-formatter.ts`

```typescript
import type {MyToolResult} from '../types';

export function formatMyTool(
  result: MyToolResult & {error?: string}
): string {
  const lines: string[] = [];

  // Handle error case
  if (result.error) {
    lines.push(`## My Tool`);
    lines.push(``);
    lines.push(`**Error:** ${result.error}`);
    return lines.join('\n');
  }

  // Format success case
  lines.push(`## My Tool Results`);
  lines.push(``);
  lines.push(`**Data:** ${result.data}`);
  lines.push(`**Count:** ${result.count}`);

  return lines.join('\n');
}
```

### Step 4: Export Formatter in `packages/react-devtools-mcp/src/formatters/index.ts`

```typescript
export {formatMyTool} from './my-tool-formatter';
```

### Step 5: Register Tool in `packages/react-devtools-mcp/src/tools/index.ts`

```typescript
import {createMyTool} from './my-tool';

export function createTools(
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tools {
  return {
    // ... existing tools
    react_my_new_tool: createMyTool(treeStore, rendererBridge),
  };
}

export {createMyTool} from './my-tool';
```

### Step 6: Expose Tool in MCP Server (`mcp-server/app/mcp/route.ts`)

Add after line ~825 (after existing react_devtools_* tools):

```typescript
server.tool(
  "react_devtools_my_new_tool",  // MCP tool name
  "Description of what this tool does. Explain when to use it " +
    "and what information it returns.",
  {
    requiredParam: z.string().describe("Description for Claude"),
    optionalParam: z.number().optional().describe("Optional description")
  },
  async (params) => {
    return executeBrowserAction({
      action: "evaluate",
      params: {
        expression: `(async () => {
          if (!globalThis.__REACT_DEVTOOLS_MCP__?.tools?.react_my_new_tool) {
            return { error: 'React DevTools not available. Ensure this is a React app and the page has loaded.' };
          }
          return await globalThis.__REACT_DEVTOOLS_MCP__.tools.react_my_new_tool.handler(${JSON.stringify(params)});
        })()`
      },
      rawResult: true
    })
  }
)
```

### Step 7: Build and Test

```bash
# Build the package
cd packages/react-devtools-mcp
bun run build

# Run E2E tests
bun run test:e2e

# Build canary for d3k testing
cd ../..
bun run canary
```

### Step 8: Update This Skill Document

After completing your changes, update the following sections in this document:
- **Quick Reference: Current Tools** - Add/update tool entry
- **Core APIs Reference** - If you added new RendererBridge or TreeStore methods
- **Common Gotchas** - If you discovered new gotchas

---

## Modifying an Existing Tool

### Common Modification Patterns

#### Adding a New Parameter

1. **Update types.ts**: Add to the params interface
2. **Update tool implementation**: Handle the new parameter
3. **Update MCP server**: Add Zod schema for the parameter
4. **Update this skill**: Document the new parameter

#### Changing Output Format

1. **Update formatter**: Modify the formatter function
2. **Test**: Ensure output is readable by Claude

#### Adding New Data to Output

1. **Update result interface** in types.ts
2. **Fetch new data** in tool handler (use treeStore or rendererBridge)
3. **Update formatter** to display new data

---

## Core APIs Reference

### TreeStore (Fast, Cached)

```typescript
interface TreeStore {
  getElements(): Map<number, ElementInfo>;  // All components
  getElement(id: number): ElementInfo | null;
  getRoots(): number[];                      // Root component IDs
  getChildren(parentId: number): number[];
  getRendererIDForRoot(rootId: number): number | null;
}

interface ElementInfo {
  id: number;
  parentID: number;
  children: number[];
  displayName: string | null;
  key: string | number | null;
  type: ElementType;  // 1=Class, 5=Function, 7=Host, etc.
  ownerID: number;
  depth: number;
  hocDisplayNames: string[] | null;
  compiledWithForget: boolean;
}
```

### RendererBridge (Slower, Detailed)

```typescript
interface RendererBridge {
  // Get full component details (props, state, hooks, source)
  inspectElement(
    id: number,
    path?: Array<string | number> | null,  // For hydrating nested data
    forceFullData?: boolean
  ): Promise<InspectedElementData | null>;

  getDisplayName(id: number): string | null;
  getOwners(id: number): SerializedElement[] | null;
  getPath(id: number): PathFrame[] | null;
  hasElement(id: number): boolean;

  // DOM-to-React mapping
  getElementIdForDomNode(element: Element): {id: number; rendererId: RendererID} | null;
}
```

### InspectedElementData (from inspectElement)

```typescript
interface InspectedElementData {
  id: number;
  type: ElementType;
  props: object | null;       // Component props
  state: object | null;       // Class component state
  hooks: object | null;       // Hooks data
  context: object | null;     // Context values
  errors: Array<[string, number]>;
  warnings: Array<[string, number]>;
  owners: SerializedElement[] | null;
  source: {fileName: string; lineNumber: number; columnNumber?: number} | null;
  key: number | string | null;
  env: string | null;
  // ... many more fields
}
```

---

## Common Gotchas

### 1. inspectElement Path Parameter

```typescript
// CORRECT - pass null when no path needed
renderer.inspectElement(requestID, id, null, true)

// WRONG - passing {} causes "forEach is not a function" error
renderer.inspectElement(requestID, id, {}, true)

// For hydrating nested data, pass array path
renderer.inspectElement(requestID, id, ['props', 'items', '0'], true)
```

### 2. DehydratedData Format

Props, state, hooks, context are wrapped in DehydratedData:

```typescript
{
  data: <actual values>,     // What you want
  cleaned: [...],            // Paths that were cleaned
  unserializable: [...]      // Paths that couldn't serialize
}
```

Use `unwrapDehydratedData()` from `serialization.ts` before processing.

### 3. Source Format Normalization

Source can be array or object format:

```typescript
// Array format: [componentName, fileName, lineNumber, columnNumber]
// Object format: {fileName, lineNumber, columnNumber}

let normalizedSource = null;
if (inspected.source) {
  if (Array.isArray(inspected.source)) {
    const [, fileName, lineNumber, columnNumber] = inspected.source;
    normalizedSource = {fileName, lineNumber, columnNumber};
  } else {
    normalizedSource = inspected.source;
  }
}
```

### 4. Host Components

Host components (div, span, etc.) have `type === ElementTypeHostComponent (7)`.
Most tools should skip these unless `includeHostComponents` is true.

```typescript
if (element.type === ElementTypeHostComponent && !includeHostComponents) {
  continue;
}
```

### 5. Element IDs are Ephemeral

Element IDs change when components remount. Don't cache IDs across page navigations.

---

## Testing Checklist

Before submitting changes:

1. [ ] `bun run typecheck` passes in `packages/react-devtools-mcp`
2. [ ] `bun run build` succeeds
3. [ ] `bun run test:e2e` passes
4. [ ] `bun run lint` passes in root
5. [ ] `bun run typecheck` passes in root
6. [ ] Tool works via MCP server (test with d3k)
7. [ ] **This skill document is updated with any changes**

---

## Example: Tracing a Tool from MCP to React

Let's trace `react_devtools_find_component_source`:

1. **MCP Server** (`route.ts:829-853`):
   - Receives `selector` parameter
   - Calls `executeBrowserAction` with JS expression
   - Expression calls `globalThis.__REACT_DEVTOOLS_MCP__.tools.react_find_component_source.handler(params)`

2. **Tool Factory** (`tools/find-component-source.ts`):
   - `createFindComponentSourceTool(rendererBridge)` returns tool object
   - Handler: queries DOM, calls `rendererBridge.getElementIdForDomNode(element)`
   - Calls `rendererBridge.inspectElement(id)` for source location
   - Returns `formatFindComponentSource(result)`

3. **RendererBridge** (`core/renderer-bridge.ts`):
   - `getElementIdForDomNode`: iterates renderers, calls `getNearestMountedDOMNode`, `getElementIDForHostInstance`
   - `inspectElement`: calls `renderer.inspectElement(requestID, id, path, forceFullData)`

4. **Formatter** (`formatters/source-formatter.ts`):
   - Formats result as markdown for Claude to read

---

## Quick Reference: Current Tools

| Tool | Purpose | Parameters | Key Implementation |
|------|---------|------------|-------------------|
| `react_get_component_tree` | Get component hierarchy | `depth?`, `includeHostComponents?` | Uses TreeStore recursively |
| `react_inspect_element` | Get props/state/hooks with parsed hook names | `id`, `path?` | Uses RendererBridge.inspectElement + parseHookNames |
| `react_search_components` | Find by name | `query`, `caseSensitive?`, `limit?` | Iterates TreeStore.getElements() |
| `react_find_component_source` | DOM to source | `selector` | Uses getElementIdForDomNode |

### Hook Name Parsing

The `react_inspect_element` tool automatically parses hook variable names from source code. For example:
- `const [count, setCount] = useState(0)` → displays as `State(count): 0`
- `const theme = useTheme()` → displays as custom hook with variable name

This feature:
- Fetches source files from the runtime URL
- Loads source maps (inline or external) to map to original source
- Parses the original source to AST using Babel
- Extracts variable names from hook declarations

Key files for hook name parsing:
- `packages/react-devtools-mcp/src/hooks/parse-hook-names.ts` - Main orchestration
- `packages/react-devtools-mcp/src/hooks/ast-utils.ts` - AST traversal and name extraction
- `packages/react-devtools-mcp/src/hooks/source-map-consumer.ts` - Source map parsing
- `packages/react-devtools-mcp/src/hooks/babel-parser.ts` - Babel parser wrapper

---

## Document Maintenance

**Last updated**: 2025-01-24 (removed errors/warnings tool and functionality)

When you modify React DevTools MCP tools, update this document:

1. **New tool added**: Add to "Quick Reference: Current Tools" table
2. **Parameter changed**: Update the table and any relevant examples
3. **New API method**: Add to "Core APIs Reference" section
4. **New gotcha discovered**: Add to "Common Gotchas" section
5. **File location changed**: Update "Key Files to Read" section

This ensures future Claude Code sessions have accurate context for contributing to React DevTools MCP tools.

---

## Need More Context?

Read the package's own Claude context:
- `packages/react-devtools-mcp/CLAUDE.md` - Detailed implementation notes
- `packages/react-devtools-mcp/src/types.ts` - All type definitions

The CLAUDE.md file contains deep implementation details about:
- Operations parser format
- DehydratedData handling
- HooksNode structure
- Common issues and solutions

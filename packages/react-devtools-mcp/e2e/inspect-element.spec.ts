import {test, expect} from '@playwright/test';
import fs from 'fs';
import path from 'path';

const prependScript = fs.readFileSync(
  path.join(__dirname, '../dist/react-devtools-mcp-prepend.iife.js'),
  'utf-8'
);
const mainScript = fs.readFileSync(
  path.join(__dirname, '../dist/react-devtools-mcp.iife.js'),
  'utf-8'
);

// Helper to set up page with scripts injected
async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(prependScript);
  await page.goto('http://localhost:5199');
  await page.waitForSelector('#root');
  await page.evaluate(mainScript);
  await page.waitForFunction(
    () =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__?: {
            tools?: {react_inspect_element?: unknown};
          };
        }
      ).__REACT_DEVTOOLS_MCP__?.tools?.react_inspect_element
  );
}

// Helper to search for a component by name and return its ID
async function findComponentId(
  page: import('@playwright/test').Page,
  name: string
): Promise<number | null> {
  const result: string = await page.evaluate(
    (n) =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__: {
            tools: {
              react_search_components: {
                handler: (params: unknown) => Promise<string>;
              };
            };
          };
        }
      ).__REACT_DEVTOOLS_MCP__.tools.react_search_components.handler({query: n}),
    name
  );

  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = result.match(new RegExp(`${escapedName}.*?\\(#(\\d+)\\)`));
  return match ? parseInt(match[1], 10) : null;
}

// Helper to inspect an element
async function inspectElement(
  page: import('@playwright/test').Page,
  id: number
): Promise<string> {
  return await page.evaluate(
    (elementId) =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__: {
            tools: {
              react_inspect_element: {
                handler: (params: unknown) => Promise<string>;
              };
            };
          };
        }
      ).__REACT_DEVTOOLS_MCP__.tools.react_inspect_element.handler({id: elementId}),
    id
  );
}

// Helper to normalize IDs and dynamic values in output for stable snapshots
function normalizeOutput(output: string): string {
  return output
    // Replace (#123) with (#ID)
    .replace(/\(#\d+\)/g, '(#ID)')
    // Remove Vite HMR timestamps from URLs (e.g., ?t=1234567890)
    .replace(/\?t=\d+/g, '')
    // Normalize file paths - keep just the filename (remove line:col for less brittleness)
    .replace(/source:\n\s+.*\/([^/]+):\d+:\d+/g, 'source:\n  $1')
    .replace(/source:\n\s+([^/\n]+):\d+:\d+/g, 'source:\n  $1')
    // Normalize DOM selectors - they change with any HTML restructuring
    .replace(
      /dom:\n\s+selector:.*$/gm,
      'dom:\n  selector: [normalized]'
    );
}

test.describe('react_inspect_element', () => {
  // === SNAPSHOT TESTS (3 total - verify output format) ===

  test('snapshot: component with hooks', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'Counter');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);
    expect(normalizeOutput(result)).toMatchSnapshot('inspect-counter.txt');
  });

  test('snapshot: component without hooks', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'SearchableAlpha');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);
    expect(normalizeOutput(result)).toMatchSnapshot(
      'inspect-searchable-alpha.txt'
    );
  });

  test('snapshot: invalid element ID', async ({page}) => {
    await setupPage(page);
    const result = await inspectElement(page, 999999);

    expect(normalizeOutput(result)).toMatchSnapshot('inspect-invalid-id.txt');
  });

  // === ASSERTION TESTS (verify behavior without full output matching) ===

  test('inspects App root component', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'App');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('App');
    expect(result).toContain('rendered by:');
  });

  test('inspects Timer component with state', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'Timer');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('Timer');
    expect(result).toContain('hooks:');
    expect(result).toContain('State');
  });

  test('inspects component with complex props', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'ComplexPropsComponent');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('ComplexPropsComponent');
    expect(result).toContain('props:');
    // Should have various prop types
    expect(result).toContain('stringProp');
    expect(result).toContain('objectProp');
  });

  test('inspects component with context', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'ThemeDisplay');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('ThemeDisplay');
    // Context appears as a hook (useContext)
    expect(result).toContain('Context');
    expect(result).toContain('theme');
  });

  test('inspects component with multiple hook types', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'MultipleHooksComponent');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('MultipleHooksComponent');
    expect(result).toContain('hooks:');
    // Should have various hook types
    expect(result).toContain('State');
  });

  test('inspects memoized component', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'MemoizedDisplay');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('MemoizedDisplay');
    expect(result).toContain('rendered by:');
  });

  test('inspects ForwardRef component', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'ForwardRefInput');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('ForwardRefInput');
    expect(result).toContain('rendered by:');
  });

  test('inspects nested component with owner chain', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'NestedLevel');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('NestedLevel');
    expect(result).toContain('rendered by:');
    expect(result).toContain('props:');
    expect(result).toContain('level');
  });

  test('inspects component with array props', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'ItemList');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('ItemList');
    expect(result).toContain('props:');
    expect(result).toContain('items');
  });

  test('inspects Context.Provider', async ({page}) => {
    await setupPage(page);
    const id = await findComponentId(page, 'Provider');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    expect(result).toContain('Context.Provider');
    expect(result).toContain('props:');
    expect(result).toContain('value');
  });

  test('hooks without parsed names when source fetch fails', async ({page}) => {
    // First, let the page load normally
    await setupPage(page);

    // Now block source file fetches to simulate source inspection failure
    // This will affect subsequent fetch() calls for hook name parsing
    await page.route('**/src/**', (route) => route.abort());
    await page.route('**/*.map', (route) => route.abort());

    const id = await findComponentId(page, 'Counter');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    // Hooks should still be present but without parsed variable names
    // e.g., "State:" instead of "State(count):"
    expect(result).toContain('hooks:');
    expect(result).toContain('State:');
    // Should NOT have parsed hook names like State(count)
    expect(result).not.toMatch(/State\([a-zA-Z]+\):/);
  });
});

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

// Helper to set up page with scripts injected for Next.js app
async function setupPage(page: import('@playwright/test').Page) {
  await page.addInitScript(prependScript);
  await page.goto('http://localhost:3999');
  await page.waitForSelector('[data-testid="main"]');
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

test.describe('Next.js react_inspect_element', () => {
  test.use({navigationTimeout: 15000, actionTimeout: 15000});

  test('server component source resolves to original file', async ({page}) => {
    await setupPage(page);

    // Wait for slow data to resolve so SlowData is inspectable
    await page.waitForSelector('[data-testid="slow-data"]', {timeout: 5000});

    const id = await findComponentId(page, 'SlowData');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    // The source should resolve to a .tsx file, not a compiled chunk path
    // It should show something like slow-data.tsx:NN or page.tsx:NN
    expect(result).toMatch(/source:\n\s+\S+\.tsx:\d+/);
    // Should NOT show compiled chunk paths
    expect(result).not.toMatch(/source:\n\s+.*_[a-f0-9]+\._.js/);
  });

  test('client component source resolves to original file', async ({page}) => {
    await setupPage(page);

    // Wait for client component to render
    await page.waitForSelector('[data-testid="client-data"]', {timeout: 5000});

    const id = await findComponentId(page, 'ClientSuspenseDemo');
    expect(id).not.toBeNull();

    const result = await inspectElement(page, id!);

    // The source should resolve to client-suspense.tsx
    expect(result).toMatch(/source:\n\s+client-suspense\.tsx:\d+/);
  });

  test('rendered-by chain shows source locations when owners have stacks', async ({page}) => {
    await setupPage(page);

    // Wait for client component to render
    await page.waitForSelector('[data-testid="client-data"]', {timeout: 5000});

    // Search for all components and try to find one with rendered-by source locations
    // Components deeper in the client component tree should have owners with stacks
    const tree: string = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__: {
              tools: {
                react_get_component_tree: {
                  handler: (params: unknown) => Promise<string>;
                };
              };
            };
          }
        ).__REACT_DEVTOOLS_MCP__.tools.react_get_component_tree.handler({})
    );

    // Extract all component IDs
    const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
    const ids = idMatches.map((m) => parseInt(m[1], 10));

    // Check every component — at least one should have rendered-by with @ file:line
    let foundRenderedByWithSource = false;
    for (const id of ids) {
      const result = await inspectElement(page, id);
      if (/rendered by:[\s\S]*@ \S+\.tsx:\d+/.test(result)) {
        foundRenderedByWithSource = true;
        break;
      }
    }

    // At minimum, verify the rendered-by section format works correctly
    // If no component has owners with stacks (all server components), that's OK
    // as long as the fallback format (#id) is used correctly
    if (!foundRenderedByWithSource) {
      // Verify the fallback format still works
      const id = await findComponentId(page, 'SlowData');
      expect(id).not.toBeNull();
      const result = await inspectElement(page, id!);
      expect(result).toContain('rendered by:');
      // Should show Home (#NN) format as fallback
      expect(result).toMatch(/rendered by:[\s\S]*Home \(#\d+\)/);
    }
  });

  test('suspended-by stacks do not show (unknown):undefined', async ({page}) => {
    await setupPage(page);

    // Wait for all data to resolve
    await page.waitForSelector('[data-testid="very-slow-data"]', {timeout: 5000});

    // Get the suspense tree to find boundary IDs
    const tree: string = await page.evaluate(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__: {
              tools: {
                react_get_suspense_tree: {
                  handler: (params: unknown) => Promise<string>;
                };
              };
            };
          }
        ).__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_tree.handler({})
    );

    // Extract all boundary IDs
    const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
    const ids = idMatches.map((m) => parseInt(m[1], 10));

    // Inspect each boundary via react_inspect_element
    for (const id of ids) {
      const result = await inspectElement(page, id);

      // If there are suspended by sections, they should NOT contain
      // "(unknown):undefined" which indicates un-normalized array-format frames
      if (result.includes('suspended by:')) {
        expect(result).not.toContain('(unknown):undefined');
      }
    }
  });
});

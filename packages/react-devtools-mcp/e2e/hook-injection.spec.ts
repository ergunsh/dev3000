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

test.describe('Hook Injection', () => {
  test('should inject hook and get component tree', async ({page}) => {
    // Inject prepend script before page loads
    await page.addInitScript(prependScript);

    // Navigate to sample React app
    await page.goto('http://localhost:5199');

    // Wait for React to mount
    await page.waitForSelector('#root');

    // Inject main tools script
    await page.evaluate(mainScript);

    // Wait for tools to initialize
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__?: {
              tools?: {react_get_component_tree?: unknown};
            };
          }
        ).__REACT_DEVTOOLS_MCP__?.tools?.react_get_component_tree
    );

    // Call get_component_tree - now returns string
    const result: string = await page.evaluate(() =>
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

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Component Tree ===');
    expect(result).toMatch(/\(#\d+\)/); // Contains component IDs
  });

  test('should inspect element props and state', async ({page}) => {
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

    // Search for a component first to get its ID
    const searchResult: string = await page.evaluate(() =>
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
      ).__REACT_DEVTOOLS_MCP__.tools.react_search_components.handler({
        query: 'App',
      })
    );

    // Parse the ID from the search result
    const match = searchResult.match(/App \(#(\d+)\)/);
    expect(match).not.toBeNull();
    const appId = parseInt(match![1], 10);

    // Inspect that element
    const inspectResult: string = await page.evaluate(
      (id: number) =>
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
        ).__REACT_DEVTOOLS_MCP__.tools.react_inspect_element.handler({id}),
      appId
    );

    expect(typeof inspectResult).toBe('string');
    expect(inspectResult).toContain('App');
    expect(inspectResult).toContain('props:');
    expect(inspectResult).toContain('hooks:');
  });

  test('should search for components by name', async ({page}) => {
    await page.addInitScript(prependScript);
    await page.goto('http://localhost:5199');
    await page.waitForSelector('#root');
    await page.evaluate(mainScript);
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__?: {
              tools?: {react_search_components?: unknown};
            };
          }
        ).__REACT_DEVTOOLS_MCP__?.tools?.react_search_components
    );

    // Search for Counter components - now returns string
    const result: string = await page.evaluate(() =>
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
      ).__REACT_DEVTOOLS_MCP__.tools.react_search_components.handler({
        query: 'Counter',
      })
    );

    expect(typeof result).toBe('string');
    expect(result).toContain('Found');
    // We have 2 Counter components in our sample app, plus CounterDisplay and counterHelper
    expect(result).toContain('Counter');
  });

  test('should work without DevTools extension', async ({page}) => {
    // Ensure no DevTools extension hook exists before our injection
    await page.addInitScript(() => {
      // Verify hook doesn't exist yet
      if (
        (globalThis as unknown as {__REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown})
          .__REACT_DEVTOOLS_GLOBAL_HOOK__
      ) {
        throw new Error('Hook should not exist before injection');
      }
    });

    await page.addInitScript(prependScript);

    // Verify hook was created by our script
    await page.addInitScript(() => {
      if (
        !(globalThis as unknown as {__REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown})
          .__REACT_DEVTOOLS_GLOBAL_HOOK__
      ) {
        throw new Error('Hook should exist after prepend script');
      }
      if (
        !(
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP_HOOK_INSTALLED__?: unknown;
          }
        ).__REACT_DEVTOOLS_MCP_HOOK_INSTALLED__
      ) {
        throw new Error('Hook installed marker should be set');
      }
    });

    await page.goto('http://localhost:5199');
    await page.waitForSelector('#root');
    await page.evaluate(mainScript);

    // Wait for tools and verify they work
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__?: {
              tools?: {react_get_component_tree?: unknown};
            };
          }
        ).__REACT_DEVTOOLS_MCP__?.tools?.react_get_component_tree
    );

    const result: string = await page.evaluate(() =>
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

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Component Tree ===');
  });

  test('should find components with props and state', async ({page}) => {
    await page.addInitScript(prependScript);
    await page.goto('http://localhost:5199');
    await page.waitForSelector('#root');
    await page.evaluate(mainScript);
    await page.waitForFunction(
      () =>
        (
          globalThis as unknown as {
            __REACT_DEVTOOLS_MCP__?: {
              tools?: {react_search_components?: unknown};
            };
          }
        ).__REACT_DEVTOOLS_MCP__?.tools?.react_search_components
    );

    // Search for Counter
    const searchResult: string = await page.evaluate(() =>
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
      ).__REACT_DEVTOOLS_MCP__.tools.react_search_components.handler({
        query: 'Counter',
      })
    );

    expect(typeof searchResult).toBe('string');
    expect(searchResult).toContain('Counter');

    // Parse the ID from the search result
    const match = searchResult.match(/Counter \(#(\d+)\)/);
    expect(match).not.toBeNull();
    const counterId = parseInt(match![1], 10);

    // Inspect the Counter
    const inspectResult: string = await page.evaluate(
      (id: number) =>
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
        ).__REACT_DEVTOOLS_MCP__.tools.react_inspect_element.handler({id}),
      counterId
    );

    expect(typeof inspectResult).toBe('string');
    expect(inspectResult).toContain('Counter');
    expect(inspectResult).toContain('props:');
  });
});

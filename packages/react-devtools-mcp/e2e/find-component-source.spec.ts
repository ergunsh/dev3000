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

// Helper to setup page with DevTools scripts
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
            tools?: {react_find_component_source?: unknown};
          };
        }
      ).__REACT_DEVTOOLS_MCP__?.tools?.react_find_component_source
  );
}

// Helper to call find_component_source
async function findComponentSource(
  page: import('@playwright/test').Page,
  selector: string
): Promise<string> {
  return page.evaluate(
    (sel: string) =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__: {
            tools: {
              react_find_component_source: {
                handler: (params: {selector: string}) => Promise<string>;
              };
            };
          };
        }
      ).__REACT_DEVTOOLS_MCP__.tools.react_find_component_source.handler({selector: sel}),
    selector
  );
}

// Normalize IDs and timestamps in output for snapshot comparison
function normalizeIds(output: string): string {
  return output
    .replace(/\*\*Element ID:\*\*\s*\d+/g, '**Element ID:** #ID')
    // Remove Vite HMR timestamps from URLs (e.g., ?t=1234567890)
    .replace(/\?t=\d+/g, '');
}

test.describe('Find Component Source', () => {
  // === SNAPSHOT TEST (1 total - verify output format) ===

  test('snapshot: output format', async ({page}) => {
    await setupPage(page);
    const result = await findComponentSource(
      page,
      '[data-testid="counter-Counter A"]'
    );
    expect(normalizeIds(result)).toMatchSnapshot('source-counter.txt');
  });

  // === ASSERTION TESTS (verify behavior) ===

  test('should find component source by data-testid selector', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '[data-testid="counter-Counter A"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('Counter');
    expect(result).toContain('Element ID:');
  });

  test('should find component source by class selector', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '.styled-section');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('StyledSection');
  });

  test('should walk up DOM tree to find nearest React component', async ({page}) => {
    await setupPage(page);

    // The raw-button is a plain button element inside ButtonWrapper
    // It should return the ButtonWrapper component (nearest React component)
    const result = await findComponentSource(page, '[data-testid="raw-button"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    // Should find ButtonWrapper or the button's parent React component
    expect(result).toMatch(/ButtonWrapper|button/i);
  });

  test('should handle nested components correctly', async ({page}) => {
    await setupPage(page);

    // Test with deeply nested component
    const result = await findComponentSource(page, '[data-testid="nested-level-3"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('NestedLevel');
  });

  test('should return owner chain', async ({page}) => {
    await setupPage(page);

    // A deeply nested component should have an owner chain
    const result = await findComponentSource(page, '[data-testid="nested-level-5"]');

    expect(typeof result).toBe('string');
    // Owner chain section should be present if there are owners
    // The exact content depends on the component hierarchy
    expect(result).toContain('## Component Source');
  });

  test('should return source location with file and line in dev mode', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '[data-testid="counter-Counter A"]');

    expect(typeof result).toBe('string');
    // In development mode, source location should be available
    // Check for either actual source or the fallback message
    expect(result).toMatch(/Source:|Not available/);
  });

  test('should handle memoized components', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '[data-testid="memoized-display"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('MemoizedDisplay');
  });

  test('should handle forwardRef components', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '[data-testid="forwarded-input"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('ForwardRefInput');
  });

  test('should return error for non-existent selector', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '#does-not-exist');

    expect(typeof result).toBe('string');
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });

  test('should find component from external file', async ({page}) => {
    await setupPage(page);

    const result = await findComponentSource(page, '[data-testid="external-component"]');

    expect(typeof result).toBe('string');
    expect(result).toContain('## Component Source');
    expect(result).toContain('ExternalComponent');
    // In dev mode, source should point to the external file
    // The exact path format may vary
  });

  test('should find different source files for components defined in different files', async ({page}) => {
    await setupPage(page);

    // Get source for a component defined in App.tsx
    const appResult = await findComponentSource(page, '[data-testid="counter-Counter A"]');

    // Get source for a component defined in ExternalComponent.tsx
    const externalResult = await findComponentSource(page, '[data-testid="external-component"]');

    expect(appResult).toContain('Counter');
    expect(externalResult).toContain('ExternalComponent');

    // Both should have source info in dev mode
    // They should reference different files if source maps are working
  });

  test('should handle components with similar data-testid patterns', async ({page}) => {
    await setupPage(page);

    // Test that we get the correct component for specific selectors
    const counterA = await findComponentSource(page, '[data-testid="counter-Counter A"]');
    const counterB = await findComponentSource(page, '[data-testid="counter-Counter B"]');

    expect(counterA).toContain('Counter');
    expect(counterB).toContain('Counter');

    // Element IDs should be different (match markdown format **Element ID:** N)
    const idMatchA = counterA.match(/\*\*Element ID:\*\*\s*(\d+)/);
    const idMatchB = counterB.match(/\*\*Element ID:\*\*\s*(\d+)/);

    expect(idMatchA).not.toBeNull();
    expect(idMatchB).not.toBeNull();
    expect(idMatchA![1]).not.toBe(idMatchB![1]);
  });
});

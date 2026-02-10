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
            tools?: {react_get_suspense_tree?: unknown};
          };
        }
      ).__REACT_DEVTOOLS_MCP__?.tools?.react_get_suspense_tree
  );
}

// Helper to get suspense tree
async function getSuspenseTree(
  page: import('@playwright/test').Page,
  params: {depth?: number} = {}
): Promise<string> {
  return await page.evaluate(
    (p) =>
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
      ).__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_tree.handler(p),
    params
  );
}

// Helper to inspect suspense boundary
async function inspectSuspense(
  page: import('@playwright/test').Page,
  id: number
): Promise<string> {
  return await page.evaluate(
    (suspenseId) =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__: {
            tools: {
              react_inspect_suspense: {
                handler: (params: unknown) => Promise<string>;
              };
            };
          };
        }
      ).__REACT_DEVTOOLS_MCP__.tools.react_inspect_suspense.handler({
        id: suspenseId,
      }),
    id
  );
}

// Helper to get suspense timeline
async function getSuspenseTimeline(
  page: import('@playwright/test').Page,
  params: {limit?: number} = {}
): Promise<string> {
  return await page.evaluate(
    (p) =>
      (
        globalThis as unknown as {
          __REACT_DEVTOOLS_MCP__: {
            tools: {
              react_get_suspense_timeline: {
                handler: (params: unknown) => Promise<string>;
              };
            };
          };
        }
      ).__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_timeline.handler(p),
    params
  );
}

test.describe('Suspense Tools', () => {
  test('react_get_suspense_tree returns string with header', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTree(page);

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Suspense Tree ===');
    expect(result).toContain('=== Legend ===');
  });

  test('react_get_suspense_tree with depth parameter', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTree(page, {depth: 1});

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Suspense Tree ===');
  });

  test('react_inspect_suspense with invalid ID returns not found', async ({
    page,
  }) => {
    await setupPage(page);
    const result = await inspectSuspense(page, 999999);

    expect(typeof result).toBe('string');
    expect(result).toContain('not found');
  });

  test('react_get_suspense_timeline returns string with header', async ({
    page,
  }) => {
    await setupPage(page);
    const result = await getSuspenseTimeline(page);

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Suspense Timeline ===');
  });

  test('react_get_suspense_timeline with limit parameter', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTimeline(page, {limit: 10});

    expect(typeof result).toBe('string');
    expect(result).toContain('=== Suspense Timeline ===');
  });

  test('react_get_suspense_timeline shows resolution data when boundaries exist', async ({
    page,
  }) => {
    await setupPage(page);

    // First check if there are any suspense boundaries
    const tree = await getSuspenseTree(page);
    const hasBoundaries = /\(#\d+\)/.test(tree);

    const result = await getSuspenseTimeline(page);

    expect(result).toContain('=== Suspense Timeline ===');

    // If boundaries exist with resolved suspenders, timeline should have entries
    if (hasBoundaries && tree.includes('[RESOLVED')) {
      // Should show resolution entries (either rich or simple format)
      expect(result).toMatch(/resolved/);
    }
  });

  test('suspense tree shows total and suspended counts', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTree(page);

    // The tree output should include stats
    expect(result).toMatch(/Total: \d+/);
    expect(result).toMatch(/Suspended: \d+/);
  });

  test('suspense timeline shows resolved and pending counts', async ({
    page,
  }) => {
    await setupPage(page);
    const result = await getSuspenseTimeline(page);

    // The timeline output should include stats
    expect(result).toMatch(/Resolved: \d+/);
    expect(result).toMatch(/Pending: \d+/);
  });
});

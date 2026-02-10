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
  // Wait for Next.js to hydrate - the main element is rendered by our page
  await page.waitForSelector('[data-testid="main"]');
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

// Helper to get component tree
async function getComponentTree(
  page: import('@playwright/test').Page
): Promise<string> {
  return await page.evaluate(
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
}

test.describe('Next.js Suspense Tools', () => {
  test.use({navigationTimeout: 15000, actionTimeout: 15000});
  test('suspense tree shows boundaries from Next.js app', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTree(page);

    expect(result).toContain('=== Suspense Tree ===');
    expect(result).toMatch(/Total: \d+/);
    expect(result).toMatch(/Suspended: \d+/);
  });

  test('multiple suspense boundaries are detected', async ({page}) => {
    await setupPage(page);
    const result = await getSuspenseTree(page);

    // Count boundary entries - each boundary has an ID like (#123)
    const boundaryMatches = result.match(/\(#\d+\)/g);
    expect(boundaryMatches).not.toBeNull();
    expect(boundaryMatches!.length).toBeGreaterThanOrEqual(2);
  });

  test('can inspect a specific suspense boundary', async ({page}) => {
    await setupPage(page);

    // Get the tree and extract a real boundary ID
    const tree = await getSuspenseTree(page);
    const idMatch = tree.match(/\(#(\d+)\)/);
    expect(idMatch).not.toBeNull();
    const boundaryId = parseInt(idMatch![1], 10);

    // Inspect the boundary
    const result = await inspectSuspense(page, boundaryId);

    expect(result).toContain('=== Suspense Boundary ===');
  });

  test('inspected boundary shows status and structural info', async ({page}) => {
    await setupPage(page);

    // Get the tree and extract a real boundary ID
    const tree = await getSuspenseTree(page);
    const idMatch = tree.match(/\(#(\d+)\)/);
    expect(idMatch).not.toBeNull();
    const boundaryId = parseInt(idMatch![1], 10);

    // Inspect the boundary
    const result = await inspectSuspense(page, boundaryId);

    expect(result).toContain('=== Suspense Boundary ===');
    // Should show status (RESOLVED or SUSPENDED)
    expect(result).toMatch(/Status: (RESOLVED|SUSPENDED)/);
    // Should show depth info
    expect(result).toMatch(/Depth: \d+/);
  });

  test('inspected boundary includes source location', async ({page}) => {
    await setupPage(page);

    // Get the tree and extract all boundary IDs
    const tree = await getSuspenseTree(page);
    const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
    expect(idMatches.length).toBeGreaterThan(0);
    const ids = idMatches.map((m) => parseInt(m[1], 10));

    // At least one boundary should have source location info
    let foundSource = false;
    for (const id of ids) {
      const result = await inspectSuspense(page, id);
      if (/Source: .+:\d+/.test(result)) {
        foundSource = true;
        break;
      }
    }
    expect(foundSource).toBe(true);
  });

  test('client-side suspense boundary is detected', async ({page}) => {
    await setupPage(page);

    // Wait for client component to render and its Suspense to resolve
    await page.waitForSelector('[data-testid="client-data"]');

    // The component tree should include the client suspense component
    const tree = await getComponentTree(page);
    expect(tree).toContain('ClientSuspenseDemo');
  });

  test('client-side suspense boundary source resolves to original file', async ({page}) => {
    await setupPage(page);

    // Wait for client component to render and its Suspense to resolve
    await page.waitForSelector('[data-testid="client-data"]');

    // Get the suspense tree and extract all boundary IDs
    const tree = await getSuspenseTree(page);
    const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
    expect(idMatches.length).toBeGreaterThan(0);
    const ids = idMatches.map((m) => parseInt(m[1], 10));

    // Inspect each boundary and find the ClientSuspenseDemo one
    let foundClientSource = false;
    for (const id of ids) {
      const result = await inspectSuspense(page, id);
      if (result.includes('ClientSuspenseDemo') || result.includes('client-suspense')) {
        // The source should resolve to the original client-suspense.tsx file
        if (/Source:.*client-suspense\.tsx:\d+/.test(result)) {
          foundClientSource = true;
          break;
        }
      }
    }
    expect(foundClientSource).toBe(true);
  });

  test('suspendedBy stack frames show resolved source locations', async ({page}) => {
    await setupPage(page);

    // Wait for all data to resolve
    await page.waitForSelector('[data-testid="very-slow-data"]', {timeout: 5000});

    // Get the suspense tree and find the SlowData boundary (Server(Home) with delay)
    const tree = await getSuspenseTree(page);
    const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
    const ids = idMatches.map((m) => parseInt(m[1], 10));

    // Find a boundary with suspendedBy stack frames (the Server(Home) ones have delay stacks)
    let foundResolvedStack = false;
    for (const id of ids) {
      const result = await inspectSuspense(page, id);
      // Only look at boundaries that have "started by:" (these have stack frames)
      if (!result.includes('started by:')) continue;

      // The stack frames should NOT contain "(unknown):undefined" pattern
      // which indicates un-normalized array-format frames
      const hasUnresolvedFrames = result.includes('(unknown):undefined');
      if (hasUnresolvedFrames) {
        // Fail: we found stack frames that weren't normalized/resolved
        expect(hasUnresolvedFrames).toBe(false);
        return;
      }

      // Stack frames before "started by:" should have proper source locations
      // e.g., "functionName @ file.tsx:42" instead of "(anonymous) @ (unknown):undefined"
      foundResolvedStack = true;
    }

    expect(foundResolvedStack).toBe(true);
  });

  test('suspense timeline captures resolution data even after page load', async ({page}) => {
    await setupPage(page);

    // Wait for slow data components to resolve (the slowest is 2000ms)
    await page.waitForSelector('[data-testid="very-slow-data"]', {timeout: 5000});

    const result = await getSuspenseTimeline(page);

    expect(result).toContain('=== Suspense Timeline ===');

    // The Next.js app has server components with delays that resolve before
    // MCP initializes. The timeline should still capture them because it
    // reconstructs from live fiber data at query time (not from store events).
    expect(result).not.toContain('No resolutions recorded yet.');
    expect(result).toContain('resolved');

    // Should report a non-zero resolved count
    const resolvedMatch = result.match(/Resolved: (\d+)/);
    expect(resolvedMatch).not.toBeNull();
    expect(parseInt(resolvedMatch![1], 10)).toBeGreaterThan(0);
  });

  test('suspense timeline shows source locations for started-by components', async ({page}) => {
    await setupPage(page);

    // Wait for all data to resolve
    await page.waitForSelector('[data-testid="very-slow-data"]', {timeout: 5000});

    const result = await getSuspenseTimeline(page);

    // Find "started by:" lines
    const startedByLines = result.split('\n').filter((line: string) => line.includes('started by:'));
    expect(startedByLines.length).toBeGreaterThan(0);

    // At least one should contain "@ <file>.tsx:<line>" pattern
    const hasSourceLocation = startedByLines.some((line: string) => /@ .+\.tsx:\d+/.test(line));
    expect(hasSourceLocation).toBe(true);

    // None should contain compiled chunk paths
    const hasCompiledPaths = startedByLines.some((line: string) =>
      /chunks\/ssr\//.test(line) || /\.js\?/.test(line)
    );
    expect(hasCompiledPaths).toBe(false);
  });

  test('suspense timeline shows per-suspender details with timing', async ({page}) => {
    await setupPage(page);

    // Wait for components to resolve
    await page.waitForSelector('[data-testid="very-slow-data"]', {timeout: 5000});

    const result = await getSuspenseTimeline(page);

    // The rich format includes duration in brackets like [500ms] or [1000ms]
    // and shows "resolved ->" with boundary name and ID
    const hasRichFormat = /\[\d+ms\]/.test(result) && /resolved ->/.test(result);
    // The simple fallback shows "resolved at Xms"
    const hasSimpleFormat = /resolved at \d+ms/.test(result);

    // At least one format should be present since boundaries have resolved
    expect(hasRichFormat || hasSimpleFormat).toBe(true);
  });
});

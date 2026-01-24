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
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#root');
  await page.evaluate(mainScript);
  await page.waitForFunction(
    () =>
      (
        globalThis as unknown as {
          tools?: {react_get_component_tree?: unknown};
        }
      ).tools?.react_get_component_tree
  );
}

// Helper to get component tree
async function getComponentTree(
  page: import('@playwright/test').Page,
  params: {depth?: number; includeHostComponents?: boolean} = {}
): Promise<string> {
  return await page.evaluate(
    (p) =>
      (
        globalThis as unknown as {
          tools: {
            react_get_component_tree: {
              handler: (params: unknown) => Promise<string>;
            };
          };
        }
      ).tools.react_get_component_tree.handler(p),
    params
  );
}

// Helper to normalize IDs in output for stable snapshots
// Component IDs change between runs, so we replace them with stable placeholders
function normalizeIds(output: string): string {
  // Replace (#123) with (#ID)
  return output.replace(/\(#\d+\)/g, '(#ID)');
}

// Helper to count occurrences of a pattern
function countMatches(result: string, pattern: RegExp | string): number {
  const matches = result.match(
    typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern
  );
  return matches?.length ?? 0;
}

test.describe('react_get_component_tree', () => {
  // === SNAPSHOT TESTS (2 total - verify output format and structure) ===

  test('snapshot: full tree output', async ({page}) => {
    await setupPage(page);
    const result = await getComponentTree(page);

    expect(normalizeIds(result)).toMatchSnapshot('full-tree.txt');
  });

  // === ASSERTION TESTS (verify behavior without full output matching) ===

  test('depth limit restricts tree depth', async ({page}) => {
    await setupPage(page);

    const depth1 = await getComponentTree(page, {depth: 1});
    const depth2 = await getComponentTree(page, {depth: 2});
    const fullTree = await getComponentTree(page);

    // Depth 1 should have fewer components than depth 2
    const depth1Components = countMatches(depth1, /\(#\d+\)/g);
    const depth2Components = countMatches(depth2, /\(#\d+\)/g);
    const fullComponents = countMatches(fullTree, /\(#\d+\)/g);

    expect(depth1Components).toBeLessThan(depth2Components);
    expect(depth2Components).toBeLessThan(fullComponents);

    // Depth 1 shows root (Initial Paint) and App
    expect(depth1).toContain('App');
    // Depth 2 adds the next level (Context.Provider)
    expect(depth2).toContain('Context.Provider');
    // Full tree has deeply nested components
    expect(fullTree).toContain('NestedLevel');
  });

  test('includeHostComponents option works', async ({page}) => {
    await setupPage(page);

    const withHost = await getComponentTree(page, {includeHostComponents: true});
    const withoutHost = await getComponentTree(page, {includeHostComponents: false});

    // Both should return valid trees with React components
    expect(withHost).toContain('Counter');
    expect(withoutHost).toContain('Counter');
    expect(withHost).toContain('App');
    expect(withoutHost).toContain('App');

    // With host components, tree should have more elements
    const withHostCount = countMatches(withHost, /\(#\d+\)/g);
    const withoutHostCount = countMatches(withoutHost, /\(#\d+\)/g);
    expect(withHostCount).toBeGreaterThanOrEqual(withoutHostCount);
  });

  test('tree updates when component is toggled off', async ({page}) => {
    await setupPage(page);

    // Get tree with Timer
    const beforeToggle = await getComponentTree(page);
    expect(beforeToggle).toContain('Timer');

    // Toggle off the Timer
    await page.click('input[type="checkbox"]:near(:text("Show Timer"))');
    await page.waitForTimeout(100);

    // Get tree without Timer
    const afterToggle = await getComponentTree(page);

    // Timer should be gone
    expect(afterToggle).not.toContain('Timer');
    // Other components should still be present
    expect(afterToggle).toContain('Counter');
    expect(afterToggle).toContain('App');
  });


  test('tree shows component type badges', async ({page}) => {
    await setupPage(page);
    const result = await getComponentTree(page);

    // Should show [Memo] and [ForwardRef] badges
    expect(result).toMatch(/\[Memo\]|\[ForwardRef\]/);
    expect(result).toContain('[Context]');
  });
});

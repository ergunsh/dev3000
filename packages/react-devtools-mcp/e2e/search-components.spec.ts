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
          tools?: {react_search_components?: unknown};
        }
      ).tools?.react_search_components
  );
}

// Helper to search components
async function searchComponents(
  page: import('@playwright/test').Page,
  params: {query: string; caseSensitive?: boolean; limit?: number}
): Promise<string> {
  return await page.evaluate(
    (p) =>
      (
        globalThis as unknown as {
          tools: {
            react_search_components: {
              handler: (params: unknown) => Promise<string>;
            };
          };
        }
      ).tools.react_search_components.handler(p),
    params
  );
}

// Helper to normalize IDs in output for stable snapshots
function normalizeIds(output: string): string {
  return output.replace(/\(#\d+\)/g, '(#ID)');
}

// Helper to count matches in search results
function countMatches(result: string, pattern: RegExp | string): number {
  const matches = result.match(
    typeof pattern === 'string' ? new RegExp(pattern, 'g') : pattern
  );
  return matches?.length ?? 0;
}

test.describe('react_search_components', () => {
  // === SNAPSHOT TESTS (3 total - verify output format) ===

  test('snapshot: search with results', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'Counter'});
    expect(normalizeIds(result)).toMatchSnapshot('search-counter.txt');
  });

  test('snapshot: search no matches', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {
      query: 'NonExistentComponent',
    });
    expect(normalizeIds(result)).toMatchSnapshot('search-no-matches.txt');
  });

  test('snapshot: search empty query', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: ''});
    expect(normalizeIds(result)).toMatchSnapshot('search-empty-query.txt');
  });

  // === ASSERTION TESTS (verify behavior without full output matching) ===

  test('finds components by partial name match', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'Searchable'});

    expect(result).toContain('SearchableAlpha');
    expect(result).toContain('SearchableBeta');
    expect(result).toContain('SearchableGamma');
    expect(countMatches(result, /Searchable\w+/g)).toBe(3);
  });

  test('finds root App component', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'App'});

    expect(result).toContain('App');
    expect(result).toContain('Initial Paint');
  });

  test('finds nested components at all levels', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'NestedLevel'});

    // Should find all 5 nested levels (count numbered list items)
    expect(countMatches(result, /^\d+\.\s+NestedLevel/gm)).toBe(5);
    expect(result).toContain('Found 5 components');
  });

  test('finds components by suffix pattern', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'Component'});

    expect(result).toContain('ComplexPropsComponent');
    expect(result).toContain('CustomHookComponent');
    expect(result).toContain('MultipleHooksComponent');
    expect(result).toContain('ExternalComponent');
  });

  test('finds Provider components', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'Provider'});

    expect(result).toContain('Context.Provider');
  });

  test('search is case-insensitive by default', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'counter'});

    // Should match Counter (uppercase) even with lowercase query
    expect(result).toContain('Counter');
    expect(result).toContain('counterHelper');
    expect(countMatches(result, /Counter|counterHelper/gi)).toBeGreaterThan(2);
  });

  test('search respects caseSensitive option', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {
      query: 'counter',
      caseSensitive: true,
    });

    // Should only match lowercase 'counter' (counterHelper)
    expect(result).toContain('counterHelper');
    // Should NOT match uppercase Counter
    expect(result).not.toMatch(/\bCounter\b\s*\(#\d+\)/);
  });

  test('search respects limit option', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {
      query: 'NestedLevel',
      limit: 2,
    });

    // Should only show 2 results despite 5 matching (count numbered list items)
    expect(countMatches(result, /^\d+\.\s+NestedLevel/gm)).toBe(2);
    // Message indicates total found and how many are shown
    expect(result).toMatch(/Found 5 components.*showing first 2/);
  });

  test('finds Timer when it exists', async ({page}) => {
    await setupPage(page);
    const result = await searchComponents(page, {query: 'Timer'});

    expect(result).toContain('Timer');
    expect(result).toContain('Found 1 component');
  });

  test('does not find Timer after toggle off', async ({page}) => {
    await setupPage(page);

    // Toggle off Timer
    await page.click('input[type="checkbox"]:near(:text("Show Timer"))');
    await page.waitForTimeout(100);

    const result = await searchComponents(page, {query: 'Timer'});

    expect(result).toContain('No components found');
    expect(result).not.toMatch(/Timer\s*\(#\d+\)/);
  });
});

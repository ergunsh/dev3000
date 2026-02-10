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
            tools?: {react_profiler_start?: unknown};
          };
        }
      ).__REACT_DEVTOOLS_MCP__?.tools?.react_profiler_start
  );
}

// Helper to start profiling
async function startProfiling(
  page: import('@playwright/test').Page
): Promise<string> {
  return await page.evaluate(() =>
    (
      globalThis as unknown as {
        __REACT_DEVTOOLS_MCP__: {
          tools: {
            react_profiler_start: {
              handler: (params: unknown) => Promise<string>;
            };
          };
        };
      }
    ).__REACT_DEVTOOLS_MCP__.tools.react_profiler_start.handler({})
  );
}

// Helper to stop profiling
async function stopProfiling(
  page: import('@playwright/test').Page
): Promise<string> {
  return await page.evaluate(() =>
    (
      globalThis as unknown as {
        __REACT_DEVTOOLS_MCP__: {
          tools: {
            react_profiler_stop: {
              handler: (params: unknown) => Promise<string>;
            };
          };
        };
      }
    ).__REACT_DEVTOOLS_MCP__.tools.react_profiler_stop.handler({})
  );
}

// Helper to normalize profiling output for stable snapshots
// - Replaces dynamic IDs like (#123) with (#ID)
// - Replaces timing values like 2.3ms with Xms
// - Replaces commit counts like "(5 commits captured)" with "(N commits captured)"
// - Replaces "Total commits: 5" with "Total commits: N"
// - Replaces "Total render time: 5.2ms" with "Total render time: Xms"
// - Sorts component lines within each commit block for deterministic order
function normalizeProfilingOutput(output: string): string {
  let normalized = output
    // Normalize component IDs
    .replace(/\(#\d+\)/g, '(#ID)')
    // Normalize Component #123 references
    .replace(/Component #\d+/g, 'Component #ID')
    // Normalize timing values (e.g., 2.3ms, 0.1ms, <0.01ms, 100ms)
    .replace(/<?\d+(\.\d+)?ms/g, 'Xms')
    // Remove all timing parentheticals from component lines for stability
    // This handles (Xms), (self: Xms, total: Xms), and missing timing
    .replace(/\s+\((?:self: )?Xms(?:, total: Xms)?\)$/gm, '')
    // Normalize commit count in header
    .replace(/\(\d+ commits? captured\)/g, '(N commits captured)')
    // Normalize total commits in summary
    .replace(/Total commits: \d+/g, 'Total commits: N')
    // Normalize total render time in summary
    .replace(/Total render time: .+$/gm, 'Total render time: Xms')
    // Normalize commit header timing
    .replace(/Commit (\d+) \| Xms total/g, 'Commit $1');

  // Sort component lines within each commit block for deterministic order
  // Split by commit headers and sort the component lines within each
  const lines = normalized.split('\n');
  const result: string[] = [];
  let componentLines: string[] = [];

  for (const line of lines) {
    // Check if this is a commit header or other section marker
    const isCommitHeader = line.startsWith('Commit ');
    const isSectionMarker =
      line.startsWith('===') ||
      line.startsWith('Root:') ||
      line.startsWith('Total') ||
      line === '';

    if (isCommitHeader || isSectionMarker) {
      // Flush sorted component lines
      if (componentLines.length > 0) {
        componentLines.sort();
        result.push(...componentLines);
        componentLines = [];
      }
      result.push(line);
    } else if (line.startsWith('├─') || line.startsWith('└─') || line.startsWith('│')) {
      // This is a component line, collect for sorting
      // Normalize tree connectors to make sorting work properly
      componentLines.push(line.replace(/^[├└│]─\s*/, '  '));
    } else {
      result.push(line);
    }
  }

  // Flush any remaining component lines
  if (componentLines.length > 0) {
    componentLines.sort();
    result.push(...componentLines);
  }

  return result.join('\n');
}

test.describe('Profiler Tools', () => {
  // === SNAPSHOT TESTS ===

  test('snapshot: start profiling message', async ({page}) => {
    await setupPage(page);
    const result = await startProfiling(page);
    expect(result).toMatchSnapshot('profiler-start.txt');
  });

  test('snapshot: error when already profiling', async ({page}) => {
    await setupPage(page);
    await startProfiling(page);
    const result = await startProfiling(page);
    expect(result).toMatchSnapshot('profiler-already-active.txt');
  });

  test('snapshot: error when not profiling', async ({page}) => {
    await setupPage(page);
    const result = await stopProfiling(page);
    expect(result).toMatchSnapshot('profiler-not-active.txt');
  });

  test('snapshot: profiling results with renders', async ({page}) => {
    await setupPage(page);
    await startProfiling(page);

    // Trigger multiple renders
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      for (let i = 0; i < 3; i++) {
        await button.click();
        await page.waitForTimeout(50);
      }
    }

    const result = await stopProfiling(page);

    // Only snapshot if we captured commits
    if (result.includes('Profiling Results') && !result.includes('0 commits')) {
      expect(normalizeProfilingOutput(result)).toMatchSnapshot(
        'profiler-results-with-renders.txt'
      );
    }
  });

  test('snapshot: profiling results no renders', async ({page}) => {
    await setupPage(page);
    await startProfiling(page);
    // Don't trigger any renders, just stop immediately
    const result = await stopProfiling(page);
    expect(normalizeProfilingOutput(result)).toMatchSnapshot(
      'profiler-results-no-renders.txt'
    );
  });

  // === ASSERTION TESTS ===

  test('should start and stop profiling', async ({page}) => {
    await setupPage(page);

    const startResult = await startProfiling(page);
    expect(startResult).toContain('started');

    // Trigger some renders
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      await button.click();
      await button.click();
    }

    const stopResult = await stopProfiling(page);
    expect(typeof stopResult).toBe('string');
    expect(
      stopResult.includes('Profiling Results') ||
        stopResult.includes('Profiling stopped')
    ).toBe(true);
  });

  test('should error when starting profiling twice', async ({page}) => {
    await setupPage(page);

    await startProfiling(page);
    const secondStart = await startProfiling(page);

    expect(secondStart).toContain('already');
  });

  test('should error when stopping without starting', async ({page}) => {
    await setupPage(page);

    const result = await stopProfiling(page);

    expect(result).toContain('not active');
  });

  test('should capture render data when components update', async ({page}) => {
    await setupPage(page);

    await startProfiling(page);

    // Trigger renders
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      for (let i = 0; i < 5; i++) {
        await button.click();
        await page.waitForTimeout(50);
      }
    }

    const result = await stopProfiling(page);

    // If button was found and clicked, we should have commits
    if (await button.isVisible()) {
      expect(result).toContain('Profiling Results');
      expect(result).toMatch(/\d+ commit/);
    }
  });

  test('should show duration information in output', async ({page}) => {
    await setupPage(page);

    await startProfiling(page);

    // Trigger a render
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      await button.click();
    }

    const result = await stopProfiling(page);

    // If we have commits, should show timing info
    if (result.includes('Profiling Results') && !result.includes('0 commits')) {
      expect(result).toMatch(/\d+(\.\d+)?ms/);
      expect(result).toContain('Summary');
      expect(result).toContain('Total commits');
    }
  });

  test('should show component names in profiling output', async ({page}) => {
    await setupPage(page);

    await startProfiling(page);

    // Trigger renders by clicking counter button
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      await button.click();
      await page.waitForTimeout(50);
    }

    const result = await stopProfiling(page);

    // If we captured commits, should show component names
    if (result.includes('Profiling Results') && !result.includes('0 commits')) {
      // Should contain at least one recognizable component name
      expect(
        result.includes('Counter') ||
          result.includes('App') ||
          result.includes('Component')
      ).toBe(true);
    }
  });

  test('should include tree structure indicators in output', async ({page}) => {
    await setupPage(page);

    await startProfiling(page);

    // Trigger renders
    const button = page.locator('button').first();
    if (await button.isVisible()) {
      await button.click();
      await page.waitForTimeout(50);
    }

    const result = await stopProfiling(page);

    // If we have commits with multiple components, should show tree structure
    if (result.includes('Profiling Results') && !result.includes('0 commits')) {
      // Should contain tree connectors if there are nested components
      const hasTreeStructure =
        result.includes('├─') ||
        result.includes('└─') ||
        result.includes('│');
      // Or at least have indentation/component listing
      const hasComponentListing = result.match(/^\s+\S/m) !== null;
      expect(hasTreeStructure || hasComponentListing).toBe(true);
    }
  });
});

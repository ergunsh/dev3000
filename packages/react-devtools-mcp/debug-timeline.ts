import {chromium} from 'playwright';
import fs from 'fs';
import path from 'path';

const prependScript = fs.readFileSync(
  path.join(__dirname, 'dist/react-devtools-mcp-prepend.iife.js'),
  'utf-8'
);
const mainScript = fs.readFileSync(
  path.join(__dirname, 'dist/react-devtools-mcp.iife.js'),
  'utf-8'
);

async function main() {
  const browser = await chromium.launch({headless: true});
  const page = await browser.newPage();

  await page.addInitScript(prependScript);
  await page.goto('http://localhost:3999', {waitUntil: 'networkidle'});
  await page.evaluate(mainScript);
  await page.waitForFunction(
    () =>
      (globalThis as any).__REACT_DEVTOOLS_MCP__?.tools?.react_get_suspense_tree,
    null,
    {timeout: 15000}
  );

  // Give boundaries extra time to resolve
  await page.waitForTimeout(3000);

  // 1. Get suspense tree
  const tree: string = await page.evaluate(() =>
    (globalThis as any).__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_tree.handler({})
  );
  console.log('=== SUSPENSE TREE ===');
  console.log(tree);
  console.log('');

  // 2. Get timeline result
  const timeline: string = await page.evaluate(() =>
    (globalThis as any).__REACT_DEVTOOLS_MCP__.tools.react_get_suspense_timeline.handler({})
  );
  console.log('=== TIMELINE RESULT ===');
  console.log(timeline);
  console.log('');

  // 3. Extract boundary IDs from tree and inspect raw fiber data for each
  const idMatches = [...tree.matchAll(/\(#(\d+)\)/g)];
  const ids = idMatches.map((m: RegExpMatchArray) => parseInt(m[1], 10));
  console.log(`=== RAW FIBER DATA FOR ${ids.length} BOUNDARIES ===`);

  for (const id of ids) {
    const rawData = await page.evaluate(async (boundaryId: number) => {
      const hook = (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) return {error: 'no hook'};

      for (const [, renderer] of hook.rendererInterfaces) {
        if (!renderer.hasElementWithId(boundaryId)) continue;

        let payload: any;
        try {
          payload = renderer.inspectElement(99999, boundaryId, null, true);
        } catch (e: any) {
          return {error: e.message};
        }

        if (!payload?.value) return {payloadType: payload?.type, payload};

        const el = payload.value;
        return {
          isSuspended: el.isSuspended,
          unknownSuspenders: el.unknownSuspenders,
          suspendedByRange: el.suspendedByRange,
          hasSuspendedByKey: 'suspendedBy' in el,
          suspendedByIsNull: el.suspendedBy === null,
          suspendedByType: el.suspendedBy === null ? 'null' : typeof el.suspendedBy,
          // Check if it's DehydratedData shape
          suspendedByKeys: el.suspendedBy && typeof el.suspendedBy === 'object'
            ? Object.keys(el.suspendedBy)
            : null,
          // If DehydratedData, look at .data
          suspendedByDataType: el.suspendedBy?.data !== undefined
            ? typeof el.suspendedBy.data
            : 'no .data key',
          suspendedByDataIsArray: Array.isArray(el.suspendedBy?.data),
          suspendedByDataLength: Array.isArray(el.suspendedBy?.data)
            ? el.suspendedBy.data.length
            : null,
          // Try to serialize first item
          suspendedByFirstItem: (() => {
            try {
              const data = el.suspendedBy?.data;
              if (Array.isArray(data) && data.length > 0) {
                const item = data[0];
                return {
                  type: typeof item,
                  keys: item && typeof item === 'object' ? Object.keys(item) : null,
                  hasAwaited: item?.awaited !== undefined,
                  awaitedKeys: item?.awaited && typeof item.awaited === 'object'
                    ? Object.keys(item.awaited)
                    : null,
                  awaitedEnd: item?.awaited?.end,
                  awaitedStart: item?.awaited?.start,
                  awaitedName: item?.awaited?.name,
                };
              }
              return null;
            } catch {
              return 'serialization error';
            }
          })(),
        };
      }
      return {error: 'element not found in any renderer'};
    }, id);

    console.log(`\n--- Boundary #${id} ---`);
    console.log(JSON.stringify(rawData, null, 2));
  }

  await browser.close();
}

main().catch(console.error);

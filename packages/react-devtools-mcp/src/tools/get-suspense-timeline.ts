import type {SuspenseStore} from '../core/suspense-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {TreeStore} from '../core/tree-store';
import type {Tool, GetSuspenseTimelineParams, SuspenseTimelineStep} from '../types';
import {formatSuspenseTimeline} from '../formatters';
import {extractSuspendedBy, unwrapRawSuspendedBy} from './inspect-suspense';
import {resolveSourceLocation} from '../utils/source-location-resolver';
import {extractRawUrl} from '../utils/stack-utils';

/**
 * Guess a Suspense boundary name from the owner in the component tree.
 * Mirrors React DevTools' _guessSuspenseName behavior.
 */
function guessSuspenseName(id: number, treeStore: TreeStore): string | null {
  const element = treeStore.getElement(id);
  if (element && element.ownerID !== 0) {
    const owner = treeStore.getElement(element.ownerID);
    if (owner?.displayName) {
      return owner.displayName;
    }
  }
  return null;
}

export function createGetSuspenseTimelineTool(
  suspenseStore: SuspenseStore,
  rendererBridge: RendererBridge,
  treeStore: TreeStore
): Tool<GetSuspenseTimelineParams, string> {
  const handler = async (params: GetSuspenseTimelineParams): Promise<string> => {
    const {limit = 50} = params;

    const boundaries = suspenseStore.getAllSuspenseBoundaries();
    const fiberEntries: SuspenseTimelineStep[] = [];
    const inspectedBoundaryIds = new Set<number>();

    // Inspect each boundary to extract per-suspender resolution data from live fibers
    const inspectPromises: Promise<void>[] = [];
    for (const [id, node] of boundaries) {
      inspectPromises.push(
        (async () => {
          try {
            const element = await rendererBridge.inspectElement(id, null, true);
            if (!element) return;

            const suspendedBy = extractSuspendedBy(element);
            if (!suspendedBy || suspendedBy.length === 0) return;

            // Get raw data for source map resolution (before URL cleaning)
            const rawAsyncInfos = unwrapRawSuspendedBy(element);

            // Resolve startedBy source locations via source maps
            const resolutionPromises: Promise<void>[] = [];
            const resolvedSources: (string | null)[] = new Array(suspendedBy.length).fill(null);

            if (rawAsyncInfos) {
              for (let i = 0; i < suspendedBy.length; i++) {
                const info = suspendedBy[i];
                const rawAsync = rawAsyncInfos[i];

                if (info.startedBy?.stack?.[0] && rawAsync?.awaited?.stack) {
                  const frame = info.startedBy.stack[0];
                  const rawFrame = Array.isArray(rawAsync.awaited.stack)
                    ? rawAsync.awaited.stack[0]
                    : null;
                  const rawUrl = rawFrame ? extractRawUrl(rawFrame) : null;
                  if (rawUrl) {
                    const idx = i;
                    resolutionPromises.push(
                      resolveSourceLocation(rawUrl, frame.lineNumber, frame.columnNumber ?? 0).then(resolved => {
                        if (resolved) {
                          resolvedSources[idx] = `${resolved.fileName}:${resolved.lineNumber}`;
                        }
                      })
                    );
                  }
                }
              }
            }

            await Promise.all(resolutionPromises);

            inspectedBoundaryIds.add(id);
            const boundaryName = node.name ?? guessSuspenseName(id, treeStore);

            for (let i = 0; i < suspendedBy.length; i++) {
              const suspender = suspendedBy[i];
              // Only include resolved suspenders in timeline
              if (suspender.endTime <= 0) continue;

              fiberEntries.push({
                id,
                name: boundaryName,
                environment: suspender.environment ?? (node.environments.length > 0 ? node.environments[0] : null),
                endTime: suspender.endTime,
                suspenderName: suspender.name,
                suspenderDescription: suspender.description,
                duration: suspender.duration,
                startTime: suspender.startTime,
                startedByComponent: suspender.startedBy?.componentName ?? null,
                startedBySource: resolvedSources[i],
                suspenderEnvironment: suspender.environment,
              });
            }
          } catch {
            // Skip boundaries that fail inspection
          }
        })()
      );
    }

    await Promise.all(inspectPromises);

    // Fall back to store's live-captured timeline for boundaries without fiber data
    const storeTimeline = suspenseStore.getTimeline();
    for (const step of storeTimeline) {
      if (!inspectedBoundaryIds.has(step.id)) {
        fiberEntries.push(step);
      }
    }

    // Sort by endTime descending (most recent first) and apply limit
    fiberEntries.sort((a, b) => b.endTime - a.endTime);
    const limited = limit > 0 ? fiberEntries.slice(0, limit) : fiberEntries;

    const suspendedCount = suspenseStore.getSuspendedCount();

    return formatSuspenseTimeline(limited, {
      totalResolved: limited.length,
      pendingCount: suspendedCount,
    });
  };

  return {
    description: `Get the timeline of Suspense boundary resolutions. Shows which I/O operations caused suspensions, how long each took, which component started them, and which boundary caught them. Most recent resolutions first.

Example output:
  === Suspense Timeline ===
  Resolved: 3 | Pending: 1

  Recent resolutions (most recent first):

  1. [1234ms]  fetch("users") "Loading" [react] resolved -> DataSection (#10) [server]
     started by: App @ App.tsx:123 [server]

  2. [567ms]   fetch("posts") [react] resolved -> ItemList (#12) [client]
     started by: Feed @ Feed.tsx:45 [react]`,
    inputs: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Maximum number of timeline entries to return. Defaults to 50.',
          default: 50,
        },
      },
    },
    handler,
  };
}

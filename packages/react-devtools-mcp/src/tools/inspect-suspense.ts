import type {SuspenseStore} from '../core/suspense-store';
import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {
  Tool,
  InspectSuspenseParams,
  InspectedElementData,
  SuspendedByInfo,
  SerializedAsyncInfo,
  OwnerInfo,
  SuspenseNode,
} from '../types';
import {formatInspectedSuspense} from '../formatters';
import {
  getElementTypeName,
  unwrapDehydratedData,
  unwrapAndSerialize,
} from '../utils/serialization';
import {resolveSourceLocation} from '../utils/source-location-resolver';
import {
  normalizeStackTrace,
  extractRawUrl,
} from '../utils/stack-utils';

/**
 * Extract suspendedBy info from an inspected element's data.
 * Shared logic with inspect-element.ts.
 */
/**
 * Unwrap and return the raw SerializedAsyncInfo array from suspendedBy data.
 * Needed separately for source map resolution (raw URLs must be preserved).
 */
export function unwrapRawSuspendedBy(element: InspectedElementData): SerializedAsyncInfo[] | null {
  if (!element.suspendedBy) {
    return null;
  }
  const unwrapped = unwrapDehydratedData(element.suspendedBy);
  if (!Array.isArray(unwrapped) || unwrapped.length === 0) {
    return null;
  }
  return unwrapped as SerializedAsyncInfo[];
}

export function extractSuspendedBy(element: InspectedElementData): SuspendedByInfo[] | null {
  const rawAsyncInfos = unwrapRawSuspendedBy(element);
  if (!rawAsyncInfos) {
    return null;
  }

  const now = performance.now();
  return rawAsyncInfos.map(asyncInfo => ({
    name: asyncInfo.awaited.name,
    description: asyncInfo.awaited.description,
    startTime: asyncInfo.awaited.start,
    endTime: asyncInfo.awaited.end,
    duration: asyncInfo.awaited.end > 0
      ? asyncInfo.awaited.end - asyncInfo.awaited.start
      : now - asyncInfo.awaited.start,
    byteSize: asyncInfo.awaited.byteSize,
    environment: asyncInfo.awaited.env,
    startedBy: asyncInfo.awaited.owner ? {
      componentName: asyncInfo.awaited.owner.displayName,
      componentId: asyncInfo.awaited.owner.id,
      environment: asyncInfo.awaited.owner.env,
      stack: normalizeStackTrace(asyncInfo.awaited.stack),
    } : null,
    awaitedBy: asyncInfo.owner ? {
      componentName: asyncInfo.owner.displayName,
      componentId: asyncInfo.owner.id,
      environment: asyncInfo.owner.env,
      stack: normalizeStackTrace(asyncInfo.stack),
    } : null,
  }));
}

/**
 * Extract enriched owners from an inspected element's data.
 */
function extractOwners(element: InspectedElementData): OwnerInfo[] {
  if (!element.owners) {
    return [];
  }

  return element.owners.map(owner => ({
    id: owner.id,
    displayName: owner.displayName,
    type: getElementTypeName(owner.type),
    env: owner.env ?? null,
    stack: normalizeStackTrace(owner.stack),
  }));
}

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

/**
 * Determine the authoritative isSuspended status by combining:
 * 1. Live fiber data from inspectElement (most accurate)
 * 2. Inference from suspendedBy data (all resolved = not suspended)
 * 3. SuspenseStore cached value (fallback)
 */
function resolveIsSuspended(
  storeValue: boolean,
  liveValue: boolean | null | undefined,
  suspendedBy: SuspendedByInfo[] | null
): boolean {
  // Live fiber data is the most accurate source
  if (liveValue != null) {
    return liveValue;
  }

  // If we have suspendedBy data and all are resolved, infer not suspended
  if (suspendedBy && suspendedBy.length > 0) {
    const allResolved = suspendedBy.every(s => s.endTime > 0);
    if (allResolved) {
      return false;
    }
  }

  return storeValue;
}

export function createInspectSuspenseTool(
  suspenseStore: SuspenseStore,
  rendererBridge: RendererBridge,
  treeStore: TreeStore
): Tool<InspectSuspenseParams, string> {
  const handler = async (params: InspectSuspenseParams): Promise<string> => {
    const {id} = params;

    const node = suspenseStore.getSuspenseByID(id);
    if (!node) {
      return `Suspense boundary with ID ${id} not found.`;
    }

    // Calculate depth by traversing up to root
    let depth = 0;
    let currentId = node.parentID;
    while (currentId !== 0) {
      const parent = suspenseStore.getSuspenseByID(currentId);
      if (parent) {
        depth++;
        currentId = parent.parentID;
      } else {
        break;
      }
    }

    // Also call inspectElement to get live suspendedBy data and accurate status
    const element = await rendererBridge.inspectElement(id, null, true);

    // Extract enriched data from element if available
    let suspendedBy: SuspendedByInfo[] | null = null;
    let unknownSuspendersReason: string | null = null;
    let owners: OwnerInfo[] = [];
    let props: Record<string, unknown> | null = null;
    let source: {fileName: string; lineNumber: number; columnNumber?: number} | null = null;
    let rootType: string | null = null;
    let rendererPackageName: string | null = null;
    let rendererVersion: string | null = null;

    if (element) {
      suspendedBy = extractSuspendedBy(element);

      if (element.unknownSuspenders) {
        switch (element.unknownSuspenders) {
          case 1: unknownSuspendersReason = 'production'; break;
          case 2: unknownSuspendersReason = 'old-version'; break;
          case 3: unknownSuspendersReason = 'thrown-promise'; break;
        }
      }

      owners = extractOwners(element);
      props = unwrapAndSerialize(element.props);
      rootType = element.rootType ?? null;
      rendererPackageName = element.rendererPackageName ?? null;
      rendererVersion = element.rendererVersion ?? null;

      // Normalize source format (can be array or object)
      // Track raw URL for source map resolution (before cleaning strips .next/ paths)
      let sourceRawUrl: string | null = null;
      if (element.source) {
        if (Array.isArray(element.source)) {
          const [, fileName, lineNumber, columnNumber] = element.source;
          if (fileName && lineNumber !== undefined) {
            source = {fileName, lineNumber, columnNumber};
            sourceRawUrl = String(fileName);
          }
        } else {
          source = element.source;
          sourceRawUrl = element.source.fileName ?? null;
        }
      }

      // Fallback: derive source from element.stack when element.source is null
      // In React 19+, _debugSource was removed; source info lives in _debugStack
      // which is serialized as stack frames on the inspected element
      if (!source && element.stack) {
        const normalizedStack = normalizeStackTrace(element.stack);
        if (normalizedStack && normalizedStack.length > 0) {
          const frame = normalizedStack[0];
          source = {fileName: frame.fileName, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber};
          sourceRawUrl = Array.isArray(element.stack) && element.stack.length > 0
            ? extractRawUrl(element.stack[0])
            : null;
        }
      }

      // Resolve compiled source locations to original files via source maps.
      // Stack frames from React 19+ contain compiled chunk URLs; the Next.js
      // /__nextjs_source-map endpoint provides sectioned source maps to map back.
      const resolutionPromises: Promise<void>[] = [];

      // Resolve the element's own source location
      if (source && sourceRawUrl) {
        resolutionPromises.push(
          resolveSourceLocation(sourceRawUrl, source.lineNumber, source.columnNumber ?? 0).then(resolved => {
            if (resolved) {
              source = resolved;
            }
          })
        );
      }

      // Resolve owner stack frame URLs
      if (element.owners) {
        for (let i = 0; i < owners.length; i++) {
          const owner = owners[i];
          if (owner.stack && owner.stack.length > 0 && element.owners[i]) {
            const rawStack = element.owners[i].stack;
            const rawUrl = Array.isArray(rawStack) && rawStack.length > 0
              ? extractRawUrl(rawStack[0])
              : null;
            if (rawUrl) {
              const frame = owner.stack[0];
              resolutionPromises.push(
                resolveSourceLocation(rawUrl, frame.lineNumber, frame.columnNumber ?? 0).then(resolved => {
                  if (resolved) {
                    owner.stack![0] = {
                      ...frame,
                      fileName: resolved.fileName,
                      lineNumber: resolved.lineNumber,
                      columnNumber: resolved.columnNumber,
                    };
                  }
                })
              );
            }
          }
        }
      }

      // Resolve suspendedBy stack frame URLs
      if (suspendedBy) {
        const rawAsyncInfos = unwrapRawSuspendedBy(element);
        if (rawAsyncInfos) {
          for (let i = 0; i < suspendedBy.length; i++) {
            const info = suspendedBy[i];
            const rawAsync = rawAsyncInfos[i];

            // Resolve startedBy stack (I/O origin stack)
            if (info.startedBy?.stack && rawAsync?.awaited?.stack) {
              for (let j = 0; j < info.startedBy.stack.length; j++) {
                const frame = info.startedBy.stack[j];
                const rawFrame = Array.isArray(rawAsync.awaited.stack)
                  ? rawAsync.awaited.stack[j]
                  : null;
                const rawUrl = rawFrame ? extractRawUrl(rawFrame) : null;
                if (rawUrl) {
                  resolutionPromises.push(
                    resolveSourceLocation(rawUrl, frame.lineNumber, frame.columnNumber ?? 0).then(resolved => {
                      if (resolved) {
                        info.startedBy!.stack![j] = {
                          ...frame,
                          fileName: resolved.fileName,
                          lineNumber: resolved.lineNumber,
                          columnNumber: resolved.columnNumber,
                        };
                      }
                    })
                  );
                }
              }
            }

            // Resolve awaitedBy stack (component that awaited the I/O)
            if (info.awaitedBy?.stack && rawAsync?.stack) {
              for (let j = 0; j < info.awaitedBy.stack.length; j++) {
                const frame = info.awaitedBy.stack[j];
                const rawFrame = Array.isArray(rawAsync.stack)
                  ? rawAsync.stack[j]
                  : null;
                const rawUrl = rawFrame ? extractRawUrl(rawFrame) : null;
                if (rawUrl) {
                  resolutionPromises.push(
                    resolveSourceLocation(rawUrl, frame.lineNumber, frame.columnNumber ?? 0).then(resolved => {
                      if (resolved) {
                        info.awaitedBy!.stack![j] = {
                          ...frame,
                          fileName: resolved.fileName,
                          lineNumber: resolved.lineNumber,
                          columnNumber: resolved.columnNumber,
                        };
                      }
                    })
                  );
                }
              }
            }
          }
        }
      }

      await Promise.all(resolutionPromises);
    }

    // Create a corrected copy of the node with:
    // 1. Live isSuspended status (overrides stale store value)
    // 2. Guessed name from owner when explicit name is null
    const correctedNode: SuspenseNode = {
      ...node,
      isSuspended: resolveIsSuspended(
        node.isSuspended,
        element?.isSuspended,
        suspendedBy
      ),
      name: node.name ?? guessSuspenseName(id, treeStore),
    };

    return formatInspectedSuspense(correctedNode, depth, {
      suspendedBy,
      unknownSuspendersReason,
      owners,
      props,
      source,
      rootType,
      rendererPackageName,
      rendererVersion,
    });
  };

  return {
    description: `Get detailed information about a specific Suspense boundary by ID. Returns status, timing, source location, suspension causes with I/O details and stack traces, rendered-by owner chain, and hierarchy info.

Example output:
  === Suspense Boundary ===

  DataSection (#10)
  Status: SUSPENDED
  Source: DataSection.tsx:42
  Resolution Time: pending...

  suspended by:
    1. fetch("api/data") "Loading users" (pending, 2345ms so far, 5.2KB) [react]
       started by: App [server]
       awaited by: DataSection [client]

  rendered by:
    App @ App.tsx:10 [server]
    createRoot

  Depth: 1
  Parent ID: (root-level)
  Children: 12, 15`,
    inputs: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The ID of the Suspense boundary to inspect.',
        },
      },
      required: ['id'],
    },
    handler,
  };
}

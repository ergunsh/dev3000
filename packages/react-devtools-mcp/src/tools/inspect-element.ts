import type {RendererBridge} from '../core/renderer-bridge';
import type {
  Tool,
  InspectElementParams,
  InspectElementResult,
  HookInfo,
  OwnerInfo,
  DomPathInfo,
  HookSource,
  SuspendedByInfo,
  SerializedAsyncInfo,
} from '../types';
import {
  getElementTypeName,
  processHooksData,
  unwrapAndSerialize,
  unwrapDehydratedData,
} from '../utils/serialization';
import {formatInspectedElement} from '../formatters';
import {generateCssSelector} from '../utils/css-selector';
import {parseHookNames} from '../hooks';
import {resolveSourceLocation} from '../utils/source-location-resolver';
import {
  normalizeStackTrace,
  extractRawUrl,
} from '../utils/stack-utils';

/**
 * Create a location key for a hook source
 */
function getHookSourceLocationKey(hookSource: HookSource): string {
  const {fileName, lineNumber, columnNumber} = hookSource;
  if (fileName == null || lineNumber == null || columnNumber == null) {
    return '';
  }
  return `${fileName}:${lineNumber}:${columnNumber}`;
}

/**
 * Get DOM path info for a React element.
 * Uses React DevTools' findHostInstancesForElementID which returns DOM elements
 * for any React element ID (walks the fiber tree to find host instances).
 */
function getDomPathInfo(
  id: number,
  rendererBridge: RendererBridge
): DomPathInfo | null {
  // findHostInstances uses React DevTools' findHostInstancesForElementID
  // which works for any React element ID, not just host components.
  // It walks the fiber tree to find all host instances rendered by this element.
  const hostInstances = rendererBridge.findHostInstances(id);

  if (hostInstances && hostInstances.length > 0) {
    const selector = generateCssSelector(hostInstances[0]);
    return {selector};
  }

  return null;
}

export function createInspectElementTool(
  rendererBridge: RendererBridge
): Tool<InspectElementParams, string> {
  const handler = async (params: InspectElementParams): Promise<string> => {
    const {id, path} = params;

    // Pass path directly as an array or null
    // The DevTools renderer expects Array<string | number> | null
    const inspectPath = path && path.length > 0 ? path : null;

    const element = await rendererBridge.inspectElement(
      id,
      inspectPath,
      true
    );

    if (!element) {
      const notFoundResult: InspectElementResult = {
        id,
        name: null,
        type: 'Unknown',
        props: null,
        state: null,
        hooks: null,
        context: null,
        owners: [],
        source: null,
        key: null,
        env: null,
        domPath: null,
        isSuspended: null,
        suspendedBy: null,
        unknownSuspendersReason: null,
        rootType: null,
        rendererPackageName: null,
        rendererVersion: null,
      };
      return formatInspectedElement(notFoundResult);
    }

    // Get display name
    const displayName = rendererBridge.getDisplayName(id);

    // Process owners (enriched with env and normalized stack)
    const owners: OwnerInfo[] = [];
    if (element.owners) {
      for (const owner of element.owners) {
        owners.push({
          id: owner.id,
          displayName: owner.displayName,
          type: getElementTypeName(owner.type),
          env: owner.env ?? null,
          stack: normalizeStackTrace(owner.stack),
        });
      }
    }

    // Extract suspension info
    const isSuspended = element.isSuspended ?? null;
    let suspendedBy: SuspendedByInfo[] | null = null;
    let unknownSuspendersReason: string | null = null;

    if (element.suspendedBy) {
      const unwrappedSuspendedBy = unwrapDehydratedData(element.suspendedBy);
      if (Array.isArray(unwrappedSuspendedBy) && unwrappedSuspendedBy.length > 0) {
        const now = performance.now();
        suspendedBy = (unwrappedSuspendedBy as SerializedAsyncInfo[]).map(asyncInfo => ({
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
    }

    // Map unknownSuspenders code to reason string
    if (element.unknownSuspenders) {
      switch (element.unknownSuspenders) {
        case 1: unknownSuspendersReason = 'production'; break;
        case 2: unknownSuspendersReason = 'old-version'; break;
        case 3: unknownSuspendersReason = 'thrown-promise'; break;
      }
    }

    // Process hooks
    let processedHooks: HookInfo[] | null = null;
    if (element.hooks) {
      const hooksData = processHooksData(element.hooks);
      if (hooksData) {
        processedHooks = hooksData.map((h) => ({
          id: h.id,
          name: h.name,
          value: h.value,
          subHooks: h.subHooks as HookInfo[],
          hookSource: h.hookSource,
        }));

        // Parse hook names from source code
        try {
          const hookNames = await parseHookNames(hooksData);

          // Merge parsed hook names into processedHooks
          const mergeHookNames = (hooks: HookInfo[]): void => {
            for (const hook of hooks) {
              if (hook.hookSource) {
                const locationKey = getHookSourceLocationKey(hook.hookSource);
                const parsedName = hookNames.get(locationKey);
                if (parsedName) {
                  hook.hookName = parsedName;
                }
              }
              // Recursively process subHooks
              if (hook.subHooks && hook.subHooks.length > 0) {
                mergeHookNames(hook.subHooks);
              }
            }
          };

          mergeHookNames(processedHooks);
        } catch (error) {
          // Hook name parsing is best-effort; don't fail the whole inspection
          console.warn('[inspect-element] Failed to parse hook names:', error);
        }
      }
    }

    // Normalize source format
    // React DevTools can return source as either:
    // - Array: [componentName, fileName, lineNumber, columnNumber]
    // - Object: {fileName, lineNumber, columnNumber}
    let normalizedSource: {fileName: string; lineNumber: number; columnNumber?: number} | null = null;
    // Track raw URL for source map resolution (before cleaning strips .next/ paths)
    let sourceRawUrl: string | null = null;
    if (element.source) {
      if (Array.isArray(element.source)) {
        const [, fileName, lineNumber, columnNumber] = element.source;
        if (fileName && lineNumber !== undefined) {
          normalizedSource = {fileName, lineNumber, columnNumber};
          sourceRawUrl = String(fileName);
        }
      } else {
        normalizedSource = element.source;
        sourceRawUrl = element.source.fileName ?? null;
      }
    }

    // Fallback: derive source from element.stack when element.source is null
    // In React 19+, _debugSource was removed; source info lives in _debugStack
    // which is serialized as stack frames on the inspected element
    if (!normalizedSource && element.stack) {
      const stackForSource = normalizeStackTrace(element.stack);
      if (stackForSource && stackForSource.length > 0) {
        const frame = stackForSource[0];
        normalizedSource = {fileName: frame.fileName, lineNumber: frame.lineNumber, columnNumber: frame.columnNumber};
        // Get raw URL from the original stack frame (before cleanSourceUrl)
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
    if (normalizedSource && sourceRawUrl) {
      resolutionPromises.push(
        resolveSourceLocation(sourceRawUrl, normalizedSource.lineNumber, normalizedSource.columnNumber ?? 0).then(resolved => {
          if (resolved) {
            normalizedSource = resolved;
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
    if (suspendedBy && element.suspendedBy) {
      const rawSuspendedBy = unwrapDehydratedData(element.suspendedBy);
      if (Array.isArray(rawSuspendedBy)) {
        const rawAsyncInfos = rawSuspendedBy as SerializedAsyncInfo[];
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

    // Get DOM path info
    const domPath = getDomPathInfo(id, rendererBridge);

    // Build renderer info string
    let rendererPackageName = element.rendererPackageName ?? null;
    let rendererVersion = element.rendererVersion ?? null;

    const result: InspectElementResult = {
      id,
      name: displayName,
      type: getElementTypeName(element.type),
      props: unwrapAndSerialize(element.props),
      state: unwrapAndSerialize(element.state),
      hooks: processedHooks,
      context: unwrapAndSerialize(element.context),
      owners,
      source: normalizedSource,
      key: element.key,
      env: element.env,
      domPath,
      isSuspended,
      suspendedBy,
      unknownSuspendersReason,
      rootType: element.rootType ?? null,
      rendererPackageName,
      rendererVersion,
    };

    return formatInspectedElement(result);
  };

  return {
    description: `Get detailed information about a specific React component by its ID.

Returns props, state, hooks (with parsed variable names from source), context, rendered-by owner chain with source locations, source file location, DOM CSS selector, and suspension status with I/O details. Environment tags [server]/[client] are shown for RSC components.

Use the path parameter to hydrate large nested data (e.g., ["props", "items", "0"]).

Example output:
  Counter (#42) [client]

  props:
    initialValue: 0
    label: "Click count"

  hooks:
    1. State(count): 5
    2. Callback(handleClick): () => {}

  rendered by:
    App @ App.tsx:10 [server]
    createRoot

  source:
    Counter.tsx:15

  dom:
    selector: div.counter`,
    inputs: {
      type: 'object',
      properties: {
        id: {
          type: 'number',
          description: 'The element ID to inspect (required)',
        },
        path: {
          type: 'array',
          items: {
            type: 'string',
          },
          description:
            'Optional path to hydrate nested data (e.g., ["props", "items", "0"])',
        },
      },
      required: ['id'],
    },
    handler,
  };
}

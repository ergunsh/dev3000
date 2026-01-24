import type {RendererBridge} from '../core/renderer-bridge';
import type {
  Tool,
  InspectElementParams,
  InspectElementResult,
  HookInfo,
  OwnerInfo,
  DomPathInfo,
  HookSource,
} from '../types';
import {
  getElementTypeName,
  processHooksData,
  unwrapAndSerialize,
} from '../utils/serialization';
import {formatInspectedElement} from '../formatters';
import {generateCssSelector} from '../utils/css-selector';
import {parseHookNames} from '../hooks';

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
      };
      return formatInspectedElement(notFoundResult);
    }

    // Get display name
    const displayName = rendererBridge.getDisplayName(id);

    // Process owners
    const owners: OwnerInfo[] = [];
    if (element.owners) {
      for (const owner of element.owners) {
        owners.push({
          id: owner.id,
          displayName: owner.displayName,
          type: getElementTypeName(owner.type),
        });
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
    if (element.source) {
      if (Array.isArray(element.source)) {
        const [, fileName, lineNumber, columnNumber] = element.source;
        if (fileName && lineNumber !== undefined) {
          normalizedSource = {fileName, lineNumber, columnNumber};
        }
      } else {
        normalizedSource = element.source;
      }
    }

    // Get DOM path info
    const domPath = getDomPathInfo(id, rendererBridge);

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
    };

    return formatInspectedElement(result);
  };

  return {
    description:
      'Get detailed information about a specific React component by its ID. Returns props, state, hooks, context, and other metadata.',
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

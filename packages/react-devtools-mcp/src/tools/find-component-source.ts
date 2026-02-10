import type {RendererBridge} from '../core/renderer-bridge';
import type {Tool, FindComponentSourceParams, FindComponentSourceResult} from '../types';
import {formatFindComponentSource} from '../formatters/source-formatter';

export function createFindComponentSourceTool(
  rendererBridge: RendererBridge
): Tool<FindComponentSourceParams, string> {
  const handler = async (params: FindComponentSourceParams): Promise<string> => {
    const {selector} = params;

    // 1. Find DOM element
    const element = document.querySelector(selector);
    if (!element) {
      return formatFindComponentSource({
        selector,
        componentName: null,
        componentId: -1,
        source: null,
        owners: [],
        error: `Element not found with selector: ${selector}`,
      });
    }

    // 2. Get element ID using official DevTools method
    const match = rendererBridge.getElementIdForDomNode(element);
    if (!match) {
      return formatFindComponentSource({
        selector,
        componentName: null,
        componentId: -1,
        source: null,
        owners: [],
        error: 'No React component found for this element. The element may not be rendered by React.',
      });
    }

    // 3. Inspect element to get source location
    const inspected = await rendererBridge.inspectElement(match.id, null, true);
    if (!inspected) {
      return formatFindComponentSource({
        selector,
        componentName: rendererBridge.getDisplayName(match.id),
        componentId: match.id,
        source: null,
        owners: [],
        error: 'Could not inspect component details',
      });
    }

    // 4. Get display name and owners
    const displayName = rendererBridge.getDisplayName(match.id);
    const ownersData = rendererBridge.getOwners(match.id);
    const owners = ownersData?.map(o => o.displayName).filter((n): n is string => n !== null) || [];

    // 5. Normalize source format
    // React DevTools can return source as either:
    // - Array: [componentName, fileName, lineNumber, columnNumber]
    // - Object: {fileName, lineNumber, columnNumber}
    let normalizedSource: {fileName: string; lineNumber: number; columnNumber?: number} | null = null;
    if (inspected.source) {
      if (Array.isArray(inspected.source)) {
        // Array format: [componentName, fileName, lineNumber, columnNumber]
        const [, fileName, lineNumber, columnNumber] = inspected.source;
        if (fileName && lineNumber !== undefined) {
          normalizedSource = {fileName, lineNumber, columnNumber};
        }
      } else {
        // Object format
        normalizedSource = inspected.source;
      }
    }

    // 6. Format result
    const result: FindComponentSourceResult & {error?: string} = {
      selector,
      componentName: displayName,
      componentId: match.id,
      source: normalizedSource,
      owners,
    };

    return formatFindComponentSource(result);
  };

  return {
    description: `Find the source file location for a React component that renders a specific DOM element. Takes a CSS selector and returns the component name, source file path, line number, and owner chain. Falls back to grep search patterns when source maps are unavailable (production builds).

Example output:
  ## Component Source

  **Selector:** \`.submit-button\`
  **Component:** SubmitButton
  **Element ID:** 78
  **Source:** \`SubmitButton.tsx:23:5\`

  ### Owner chain:
  \`App -> Form -> SubmitButton\``,
    inputs: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: "CSS selector for the DOM element (e.g., 'nav', '.header', '#main', '[data-testid=\"button\"]')",
        },
      },
      required: ['selector'],
    },
    handler,
  };
}

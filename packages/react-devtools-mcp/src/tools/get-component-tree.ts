import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {Tool, GetComponentTreeParams, TreeNode} from '../types';
import {getElementTypeName, isHostComponent} from '../utils/serialization';
import {formatComponentTree} from '../formatters';

export function createGetComponentTreeTool(
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tool<GetComponentTreeParams, string> {
  const buildTreeNode = (
    elementId: number,
    currentDepth: number,
    maxDepth: number | undefined,
    includeHostComponents: boolean
  ): TreeNode | null => {
    const element = treeStore.getElement(elementId);
    if (!element) {
      return null;
    }

    // Skip host components if not included
    if (!includeHostComponents && isHostComponent(element.type)) {
      // Still process children to find non-host components
      const childNodes: TreeNode[] = [];
      for (const childId of element.children) {
        const childNode = buildTreeNode(
          childId,
          currentDepth,
          maxDepth,
          includeHostComponents
        );
        if (childNode) {
          childNodes.push(childNode);
        }
      }
      // Return children directly (flattening host components out)
      if (childNodes.length === 1) {
        return childNodes[0];
      }
      return null;
    }

    // Get display name from renderer bridge for more accurate names
    const displayName =
      rendererBridge.getDisplayName(elementId) ?? element.displayName;

    const node: TreeNode = {
      id: elementId,
      name: displayName,
      type: getElementTypeName(element.type),
      key: element.key,
      depth: element.depth,
      children: [],
    };

    // Check depth limit
    if (maxDepth !== undefined && currentDepth >= maxDepth) {
      return node;
    }

    // Build children
    for (const childId of element.children) {
      const childNode = buildTreeNode(
        childId,
        currentDepth + 1,
        maxDepth,
        includeHostComponents
      );
      if (childNode) {
        node.children.push(childNode);
      }
    }

    return node;
  };

  const handler = async (params: GetComponentTreeParams): Promise<string> => {
    const {depth, includeHostComponents = false} = params;

    const roots = treeStore.getRoots();
    const rootNodes: TreeNode[] = [];

    for (const rootId of roots) {
      const rootElement = treeStore.getElement(rootId);
      if (!rootElement) {
        continue;
      }

      // Get display name for root
      const displayName =
        rendererBridge.getDisplayName(rootId) ?? rootElement.displayName;

      const rootNode: TreeNode = {
        id: rootId,
        name: displayName ?? 'Root',
        type: getElementTypeName(rootElement.type),
        key: rootElement.key,
        depth: 0,
        children: [],
      };

      // Build tree for root's children
      for (const childId of rootElement.children) {
        const childNode = buildTreeNode(
          childId,
          1,
          depth,
          includeHostComponents
        );
        if (childNode) {
          rootNode.children.push(childNode);
        }
      }

      rootNodes.push(rootNode);
    }

    // Format as text output
    return formatComponentTree(rootNodes);
  };

  return {
    description: `Get the React component tree structure. Returns a hierarchical view of all mounted React components with component IDs for use with react_inspect_element.

Shows type badges [Memo], [ForwardRef], [Suspense], [Context] for special component types.

Example output:
  === Component Tree ===

  App (#1)
  ├─ Header (#2) [Memo]
  │  ├─ Nav (#3)
  │  └─ Logo (#4) [ForwardRef]
  └─ Main (#5)
     └─ Content (#6)`,
    inputs: {
      type: 'object',
      properties: {
        depth: {
          type: 'number',
          description:
            'Maximum depth to traverse. If not specified, returns the full tree.',
        },
        includeHostComponents: {
          type: 'boolean',
          description:
            'Whether to include host (DOM) components. Defaults to false.',
          default: false,
        },
      },
    },
    handler,
  };
}

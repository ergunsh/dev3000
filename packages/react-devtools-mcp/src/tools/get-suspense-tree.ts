import type {SuspenseStore} from '../core/suspense-store';
import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {Tool, GetSuspenseTreeParams, SuspenseTreeNode} from '../types';
import {formatSuspenseTree} from '../formatters';

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
 * Post-process tree nodes to fill in guessed names and verify live status.
 * Mutates the tree nodes in-place since they're freshly built copies.
 */
async function enrichTreeNodes(
  nodes: SuspenseTreeNode[],
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Promise<void> {
  for (const node of nodes) {
    // Guess name from owner if not explicitly set
    if (node.name === null) {
      node.name = guessSuspenseName(node.id, treeStore);
    }

    // For SUSPENDED boundaries, verify with live fiber data
    if (node.isSuspended) {
      try {
        const element = await rendererBridge.inspectElement(node.id, null, true);
        if (element?.isSuspended != null) {
          node.isSuspended = element.isSuspended;
        }
      } catch {
        // Keep the store value if live check fails
      }
    }

    // Recurse into children
    if (node.childNodes.length > 0) {
      await enrichTreeNodes(node.childNodes, treeStore, rendererBridge);
    }
  }
}

export function createGetSuspenseTreeTool(
  suspenseStore: SuspenseStore,
  rendererBridge: RendererBridge,
  treeStore: TreeStore
): Tool<GetSuspenseTreeParams, string> {
  const handler = async (params: GetSuspenseTreeParams): Promise<string> => {
    const {depth} = params;

    const tree = suspenseStore.buildSuspenseTree(depth);

    // Enrich tree with guessed names and live status verification
    await enrichTreeNodes(tree, treeStore, rendererBridge);

    const totalBoundaries = suspenseStore.getAllSuspenseBoundaries().size;

    // Recount suspended after live verification
    let suspendedCount = 0;
    const countSuspended = (nodes: SuspenseTreeNode[]): void => {
      for (const node of nodes) {
        if (node.isSuspended) suspendedCount++;
        countSuspended(node.childNodes);
      }
    };
    countSuspended(tree);

    return formatSuspenseTree(tree, {
      includeLegend: true,
      totalBoundaries,
      suspendedCount,
    });
  };

  return {
    description: `Get the React Suspense boundary tree structure. Returns a hierarchical view of all Suspense boundaries with their suspension status.

Status markers: [SUSPENDED] (loading), [RESOLVED] (done), [RESOLVED 234ms] (done with timing). Environment tags (env: react, edge) show RSC server environments. Includes a legend. Use react_inspect_suspense(id) for full details on a boundary.

Example output:
  === Suspense Tree ===
  Total: 3 | Suspended: 1

  DataSection (#10) [SUSPENDED] (env: react)
  ├─ ItemList (#12) [RESOLVED 234ms]
  └─ Details (#15) [RESOLVED]`,
    inputs: {
      type: 'object',
      properties: {
        depth: {
          type: 'number',
          description:
            'Maximum depth to traverse. If not specified, returns the full tree.',
        },
      },
    },
    handler,
  };
}

import type {HookAccessor} from './hook-accessor';
import type {
  SuspenseNode,
  SuspenseTreeNode,
  SuspenseTimelineStep,
} from '../types';
import {parseOperations} from '../utils/operations-parser';

export interface SuspenseStore {
  initialize(): void;
  cleanup(): void;
  getSuspenseByID(id: number): SuspenseNode | null;
  getAllSuspenseBoundaries(): Map<number, SuspenseNode>;
  getSuspenseRoots(): number[];
  getSuspenseChildren(parentId: number): number[];
  getTimeline(limit?: number): SuspenseTimelineStep[];
  getSuspendedCount(): number;
  buildSuspenseTree(maxDepth?: number): SuspenseTreeNode[];
}

export function createSuspenseStore(hookAccessor: HookAccessor): SuspenseStore {
  const boundaries: Map<number, SuspenseNode> = new Map();
  const roots: number[] = [];
  const timeline: SuspenseTimelineStep[] = [];
  let unsubscribe: (() => void) | null = null;

  const handleOperations = (operations: number[]): void => {
    const parsed = parseOperations(operations);

    for (const op of parsed.operations) {
      switch (op.type) {
        case 'suspenseAdd': {
          const node: SuspenseNode = {
            id: op.id,
            parentID: op.parentID,
            children: [],
            name: op.name,
            isSuspended: op.isSuspended,
            hasUniqueSuspenders: false,
            environments: [],
            endTime: 0,
          };

          if (op.parentID === 0) {
            // Root-level suspense boundary
            roots.push(op.id);
          } else {
            // Add to parent's children
            const parent = boundaries.get(op.parentID);
            if (parent) {
              parent.children.push(op.id);
            }
          }

          boundaries.set(op.id, node);
          break;
        }

        case 'suspenseRemove': {
          for (const id of op.ids) {
            const node = boundaries.get(id);
            if (node) {
              // Remove from parent's children
              if (node.parentID !== 0) {
                const parent = boundaries.get(node.parentID);
                if (parent) {
                  const index = parent.children.indexOf(id);
                  if (index !== -1) {
                    parent.children.splice(index, 1);
                  }
                }
              }

              // Remove from roots if it's a root
              const rootIndex = roots.indexOf(id);
              if (rootIndex !== -1) {
                roots.splice(rootIndex, 1);
              }

              boundaries.delete(id);
            }
          }
          break;
        }

        case 'suspenseReorderChildren': {
          const parent = boundaries.get(op.parentID);
          if (parent) {
            parent.children = op.children;
          }
          break;
        }

        case 'suspenseSuspenders': {
          for (const change of op.changes) {
            const node = boundaries.get(change.id);
            if (node) {
              // Track resolution: was suspended, now resolved
              const wasResolving =
                node.isSuspended && !change.isSuspended && change.endTime > 0;

              node.hasUniqueSuspenders = change.hasUniqueSuspenders;
              node.endTime = change.endTime;
              node.isSuspended = change.isSuspended;
              node.environments = change.environments;

              // Add to timeline when a boundary resolves
              if (wasResolving) {
                timeline.push({
                  id: change.id,
                  name: node.name,
                  environment:
                    change.environments.length > 0
                      ? change.environments[0]
                      : null,
                  endTime: change.endTime,
                });
              }
            }
          }
          break;
        }
      }
    }
  };

  const initialize = (): void => {
    unsubscribe = hookAccessor.subscribeToOperations(handleOperations);
  };

  const cleanup = (): void => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    boundaries.clear();
    roots.length = 0;
    timeline.length = 0;
  };

  const getSuspenseByID = (id: number): SuspenseNode | null => {
    return boundaries.get(id) ?? null;
  };

  const getAllSuspenseBoundaries = (): Map<number, SuspenseNode> => {
    return boundaries;
  };

  const getSuspenseRoots = (): number[] => {
    return [...roots];
  };

  const getSuspenseChildren = (parentId: number): number[] => {
    const node = boundaries.get(parentId);
    return node ? [...node.children] : [];
  };

  const getTimeline = (limit?: number): SuspenseTimelineStep[] => {
    // Return timeline sorted by most recent first
    const sorted = [...timeline].sort((a, b) => b.endTime - a.endTime);
    if (limit !== undefined && limit > 0) {
      return sorted.slice(0, limit);
    }
    return sorted;
  };

  const getSuspendedCount = (): number => {
    let count = 0;
    for (const node of boundaries.values()) {
      if (node.isSuspended) {
        count++;
      }
    }
    return count;
  };

  const buildSuspenseTree = (maxDepth?: number): SuspenseTreeNode[] => {
    const buildNode = (
      id: number,
      currentDepth: number
    ): SuspenseTreeNode | null => {
      const node = boundaries.get(id);
      if (!node) {
        return null;
      }

      const treeNode: SuspenseTreeNode = {
        ...node,
        depth: currentDepth,
        childNodes: [],
      };

      // Check depth limit
      if (maxDepth !== undefined && currentDepth >= maxDepth) {
        return treeNode;
      }

      // Build children
      for (const childId of node.children) {
        const childNode = buildNode(childId, currentDepth + 1);
        if (childNode) {
          treeNode.childNodes.push(childNode);
        }
      }

      return treeNode;
    };

    const result: SuspenseTreeNode[] = [];
    for (const rootId of roots) {
      const treeNode = buildNode(rootId, 0);
      if (treeNode) {
        result.push(treeNode);
      }
    }

    return result;
  };

  return {
    initialize,
    cleanup,
    getSuspenseByID,
    getAllSuspenseBoundaries,
    getSuspenseRoots,
    getSuspenseChildren,
    getTimeline,
    getSuspendedCount,
    buildSuspenseTree,
  };
}

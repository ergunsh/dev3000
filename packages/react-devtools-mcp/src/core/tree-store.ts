import type {HookAccessor} from './hook-accessor';
import type {ElementInfo, ElementType} from '../types';
import {parseOperations} from '../utils/operations-parser';
import {ElementTypeRoot} from '../types';

export interface TreeStore {
  initialize(): void;
  cleanup(): void;
  getElements(): Map<number, ElementInfo>;
  getElement(id: number): ElementInfo | null;
  getRoots(): number[];
  getChildren(parentId: number): number[];
  getRendererIDForRoot(rootId: number): number | null;
}

export function createTreeStore(hookAccessor: HookAccessor): TreeStore {
  const elements: Map<number, ElementInfo> = new Map();
  const roots: number[] = [];
  const rootIDToRendererID: Map<number, number> = new Map();
  let unsubscribe: (() => void) | null = null;

  const handleOperations = (operations: number[]): void => {
    const parsed = parseOperations(operations);

    for (const op of parsed.operations) {
      switch (op.type) {
        case 'add': {
          const element: ElementInfo = {
            id: op.id,
            parentID: op.parentID,
            children: [],
            displayName: op.displayName,
            key: op.key,
            type: op.elementType as ElementType,
            ownerID: op.ownerID,
            depth: 0,
            hocDisplayNames: op.hocDisplayNames,
            compiledWithForget: op.compiledWithForget,
          };

          if (op.elementType === ElementTypeRoot) {
            roots.push(op.id);
            rootIDToRendererID.set(op.id, parsed.rendererID);
            element.depth = -1;
          } else {
            const parent = elements.get(op.parentID);
            if (parent) {
              parent.children.push(op.id);
              element.depth = parent.depth + 1;
            }
          }

          elements.set(op.id, element);
          break;
        }

        case 'remove': {
          for (const id of op.ids) {
            const element = elements.get(id);
            if (element) {
              // Remove from parent's children
              if (element.parentID !== 0) {
                const parent = elements.get(element.parentID);
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
                rootIDToRendererID.delete(id);
              }

              elements.delete(id);
            }
          }
          break;
        }

        case 'removeRoot': {
          const recursivelyDelete = (id: number) => {
            const element = elements.get(id);
            if (element) {
              for (const childId of element.children) {
                recursivelyDelete(childId);
              }
              elements.delete(id);
            }
          };

          recursivelyDelete(op.id);

          const rootIndex = roots.indexOf(op.id);
          if (rootIndex !== -1) {
            roots.splice(rootIndex, 1);
            rootIDToRendererID.delete(op.id);
          }
          break;
        }

        case 'reorderChildren': {
          const element = elements.get(op.id);
          if (element) {
            element.children = op.children;
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
    elements.clear();
    roots.length = 0;
    rootIDToRendererID.clear();
  };

  const getElements = (): Map<number, ElementInfo> => {
    return elements;
  };

  const getElement = (id: number): ElementInfo | null => {
    return elements.get(id) ?? null;
  };

  const getRoots = (): number[] => {
    return [...roots];
  };

  const getChildren = (parentId: number): number[] => {
    const element = elements.get(parentId);
    return element ? [...element.children] : [];
  };

  const getRendererIDForRoot = (rootId: number): number | null => {
    return rootIDToRendererID.get(rootId) ?? null;
  };

  return {
    initialize,
    cleanup,
    getElements,
    getElement,
    getRoots,
    getChildren,
    getRendererIDForRoot,
  };
}

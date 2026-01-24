import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {Tool, SearchComponentsParams, SearchMatch} from '../types';
import {getElementTypeName, isHostComponent} from '../utils/serialization';
import {formatSearchResults} from '../formatters';

export function createSearchComponentsTool(
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tool<SearchComponentsParams, string> {
  const handler = async (params: SearchComponentsParams): Promise<string> => {
    const {query, caseSensitive = false, limit = 50} = params;

    if (!query || query.trim() === '') {
      return formatSearchResults([], 0, query);
    }

    const searchQuery = caseSensitive ? query : query.toLowerCase();
    const matches: SearchMatch[] = [];
    let totalCount = 0;

    // Build ancestor path for context
    const getAncestorPath = (elementId: number): string[] => {
      const path: string[] = [];
      let currentId = elementId;
      let element = treeStore.getElement(currentId);

      while (element && element.parentID !== 0) {
        const parent = treeStore.getElement(element.parentID);
        if (parent) {
          const parentName =
            rendererBridge.getDisplayName(parent.id) ?? parent.displayName;
          if (parentName && !isHostComponent(parent.type)) {
            path.unshift(parentName);
          }
        }
        currentId = element.parentID;
        element = treeStore.getElement(currentId);
      }

      return path;
    };

    // Search through all elements
    const elements = treeStore.getElements();

    for (const [id, element] of elements) {
      // Skip host components
      if (isHostComponent(element.type)) {
        continue;
      }

      // Get display name
      const displayName =
        rendererBridge.getDisplayName(id) ?? element.displayName;

      if (!displayName) {
        continue;
      }

      // Check if name matches query
      const nameToSearch = caseSensitive
        ? displayName
        : displayName.toLowerCase();

      if (nameToSearch.includes(searchQuery)) {
        totalCount++;

        // Only add to matches if under limit
        if (matches.length < limit) {
          matches.push({
            id,
            name: displayName,
            type: getElementTypeName(element.type),
            path: getAncestorPath(id),
          });
        }
      }

      // Also check HOC display names
      if (element.hocDisplayNames) {
        for (const hocName of element.hocDisplayNames) {
          const hocNameToSearch = caseSensitive
            ? hocName
            : hocName.toLowerCase();

          if (hocNameToSearch.includes(searchQuery)) {
            totalCount++;

            if (matches.length < limit) {
              // Avoid duplicates
              if (!matches.some((m) => m.id === id)) {
                matches.push({
                  id,
                  name: displayName,
                  type: getElementTypeName(element.type),
                  path: getAncestorPath(id),
                });
              }
            }
            break;
          }
        }
      }
    }

    return formatSearchResults(matches, totalCount, query);
  };

  return {
    description:
      'Find React components by name pattern. Searches through all mounted components and returns matches with their context.',
    inputs: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (component name or partial match)',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Whether the search should be case-sensitive',
          default: false,
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 50,
        },
      },
      required: ['query'],
    },
    handler,
  };
}

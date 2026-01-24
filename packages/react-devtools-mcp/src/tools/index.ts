import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {Tools} from '../types';

import {createGetComponentTreeTool} from './get-component-tree';
import {createInspectElementTool} from './inspect-element';
import {createSearchComponentsTool} from './search-components';
import {createFindComponentSourceTool} from './find-component-source';

export function createTools(
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tools {
  return {
    react_get_component_tree: createGetComponentTreeTool(
      treeStore,
      rendererBridge
    ),
    react_inspect_element: createInspectElementTool(rendererBridge),
    react_search_components: createSearchComponentsTool(
      treeStore,
      rendererBridge
    ),
    react_find_component_source: createFindComponentSourceTool(rendererBridge),
  };
}

export {createGetComponentTreeTool} from './get-component-tree';
export {createInspectElementTool} from './inspect-element';
export {createSearchComponentsTool} from './search-components';
export {createFindComponentSourceTool} from './find-component-source';

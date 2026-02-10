import type {TreeStore} from '../core/tree-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {ProfilerStore} from '../core/profiler-store';
import type {SuspenseStore} from '../core/suspense-store';
import type {Tools} from '../types';

import {createGetComponentTreeTool} from './get-component-tree';
import {createInspectElementTool} from './inspect-element';
import {createSearchComponentsTool} from './search-components';
import {createFindComponentSourceTool} from './find-component-source';
import {createProfilerStartTool} from './profiler-start';
import {createProfilerStopTool} from './profiler-stop';
import {createGetSuspenseTreeTool} from './get-suspense-tree';
import {createInspectSuspenseTool} from './inspect-suspense';
import {createGetSuspenseTimelineTool} from './get-suspense-timeline';

export function createTools(
  treeStore: TreeStore,
  rendererBridge: RendererBridge,
  profilerStore: ProfilerStore,
  suspenseStore: SuspenseStore
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
    react_profiler_start: createProfilerStartTool(profilerStore),
    react_profiler_stop: createProfilerStopTool(profilerStore, treeStore, rendererBridge),
    react_get_suspense_tree: createGetSuspenseTreeTool(suspenseStore, rendererBridge, treeStore),
    react_inspect_suspense: createInspectSuspenseTool(suspenseStore, rendererBridge, treeStore),
    react_get_suspense_timeline: createGetSuspenseTimelineTool(suspenseStore, rendererBridge, treeStore),
  };
}

export {createGetComponentTreeTool} from './get-component-tree';
export {createInspectElementTool} from './inspect-element';
export {createSearchComponentsTool} from './search-components';
export {createFindComponentSourceTool} from './find-component-source';
export {createProfilerStartTool} from './profiler-start';
export {createProfilerStopTool} from './profiler-stop';
export {createGetSuspenseTreeTool} from './get-suspense-tree';
export {createInspectSuspenseTool} from './inspect-suspense';
export {createGetSuspenseTimelineTool} from './get-suspense-timeline';

import type {ProfilerStore} from '../core/profiler-store';
import type {RendererBridge} from '../core/renderer-bridge';
import type {TreeStore} from '../core/tree-store';
import type {Tool, ProfilerStopParams} from '../types';
import {formatProfilingData} from '../formatters/profiler-formatter';

export function createProfilerStopTool(
  profilerStore: ProfilerStore,
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): Tool<ProfilerStopParams, string> {
  const handler = async (_params: ProfilerStopParams): Promise<string> => {
    const result = profilerStore.stopProfiling();

    if (!result.success) {
      return `Failed to stop profiling: ${result.error}`;
    }

    if (!result.data) {
      return 'Profiling stopped but no data was collected.';
    }

    return formatProfilingData(result.data, treeStore, rendererBridge);
  };

  return {
    description: `Stop React profiling and return render timing results. Must call react_profiler_start first.

Returns per-commit breakdown with hierarchical component tree showing self and total durations, sorted by render time. Includes a summary with total commits and total render time.

Example output:
  === Profiling Results (2 commits captured) ===

  Root: App

  Commit 1 | 45ms total | priority: normal
  ├─ Header (self: 1.2ms, total: 5ms)
  │  └─ Nav (3.8ms)
  └─ TodoList (self: 2ms, total: 40ms)
     ├─ TodoItem (18ms)
     └─ TodoItem (20ms)

  === Summary ===
  Total commits: 2
  Total render time: 57ms`,
    inputs: {
      type: 'object',
      properties: {},
    },
    handler,
  };
}

import type {ProfilerStore} from '../core/profiler-store';
import type {Tool, ProfilerStartParams} from '../types';

export function createProfilerStartTool(
  profilerStore: ProfilerStore
): Tool<ProfilerStartParams, string> {
  const handler = async (_params: ProfilerStartParams): Promise<string> => {
    const result = profilerStore.startProfiling();

    if (result.success) {
      return 'Profiling started. Interact with the application to record renders, then call react_profiler_stop to see results.';
    }

    return `Failed to start profiling: ${result.error}`;
  };

  return {
    description:
      'Start React profiling to record component render times. Call react_profiler_stop to end profiling and get results.',
    inputs: {
      type: 'object',
      properties: {},
    },
    handler,
  };
}

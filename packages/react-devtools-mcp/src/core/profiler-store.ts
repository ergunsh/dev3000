import type {HookAccessor} from './hook-accessor';
import type {ProfilingDataBackend} from '../types';

export interface ProfilerStore {
  isProfiling(): boolean;
  startProfiling(): {success: boolean; error?: string};
  stopProfiling(): {success: boolean; data?: ProfilingDataBackend; error?: string};
}

export function createProfilerStore(hookAccessor: HookAccessor): ProfilerStore {
  let profilingActive = false;

  const isProfiling = (): boolean => profilingActive;

  const startProfiling = (): {success: boolean; error?: string} => {
    if (profilingActive) {
      return {success: false, error: 'Profiling is already active'};
    }

    const interfaces = hookAccessor.getRendererInterfaces();
    if (interfaces.size === 0) {
      return {success: false, error: 'No React renderer found'};
    }

    try {
      for (const [, renderer] of interfaces) {
        // Start profiling without change descriptions or timeline
        // to minimize overhead
        renderer.startProfiling(false, false);
      }

      profilingActive = true;
      return {success: true};
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to start profiling';
      return {success: false, error: message};
    }
  };

  const stopProfiling = (): {
    success: boolean;
    data?: ProfilingDataBackend;
    error?: string;
  } => {
    if (!profilingActive) {
      return {success: false, error: 'Profiling is not active'};
    }

    const interfaces = hookAccessor.getRendererInterfaces();
    let combinedData: ProfilingDataBackend | null = null;

    try {
      for (const [rendererID, renderer] of interfaces) {
        renderer.stopProfiling();
        const data = renderer.getProfilingData();

        if (!combinedData) {
          combinedData = {
            dataForRoots: [...data.dataForRoots],
            rendererID: rendererID,
            timelineData: data.timelineData,
          };
        } else {
          // Merge data from multiple renderers
          combinedData.dataForRoots.push(...data.dataForRoots);
        }
      }

      profilingActive = false;
      return {success: true, data: combinedData ?? undefined};
    } catch (error) {
      profilingActive = false;
      const message =
        error instanceof Error ? error.message : 'Failed to stop profiling';
      return {success: false, error: message};
    }
  };

  return {isProfiling, startProfiling, stopProfiling};
}

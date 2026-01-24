import type {
  DevToolsHook,
  RendererID,
  RendererInterface,
  Handler,
} from '../types';

export interface HookAccessor {
  getHook(): DevToolsHook | null;
  isReady(): boolean;
  waitForRenderer(timeout?: number): Promise<void>;
  getRendererInterfaces(): Map<RendererID, RendererInterface>;
  getFirstRendererID(): RendererID | null;
  subscribeToOperations(callback: (ops: number[]) => void): () => void;
}

export function createHookAccessor(): HookAccessor {
  const getHook = (): DevToolsHook | null => {
    return globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ ?? null;
  };

  const isReady = (): boolean => {
    const hook = getHook();
    if (!hook) {
      return false;
    }
    return hook.rendererInterfaces.size > 0;
  };

  const waitForRenderer = (timeout: number = 5000): Promise<void> => {
    return new Promise((resolve, reject) => {
      const hook = getHook();

      if (!hook) {
        reject(new Error('React DevTools hook not found'));
        return;
      }

      if (hook.rendererInterfaces.size > 0) {
        resolve();
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
      };

      const handler: Handler = () => {
        if (hook.rendererInterfaces.size > 0) {
          cleanup();
          resolve();
        }
      };

      unsubscribe = hook.sub('renderer-attached', handler);

      timeoutId = setTimeout(() => {
        cleanup();
        if (hook.rendererInterfaces.size > 0) {
          resolve();
        } else {
          reject(new Error('Timeout waiting for React renderer'));
        }
      }, timeout);
    });
  };

  const getRendererInterfaces = (): Map<RendererID, RendererInterface> => {
    const hook = getHook();
    if (!hook) {
      return new Map();
    }
    return hook.rendererInterfaces;
  };

  const getFirstRendererID = (): RendererID | null => {
    const interfaces = getRendererInterfaces();
    const firstKey = interfaces.keys().next().value;
    return firstKey ?? null;
  };

  const subscribeToOperations = (
    callback: (ops: number[]) => void
  ): (() => void) => {
    const hook = getHook();
    if (!hook) {
      return () => {};
    }

    const handler: Handler = (data: unknown) => {
      if (Array.isArray(data)) {
        callback(data as number[]);
      }
    };

    return hook.sub('operations', handler);
  };

  return {
    getHook,
    isReady,
    waitForRenderer,
    getRendererInterfaces,
    getFirstRendererID,
    subscribeToOperations,
  };
}

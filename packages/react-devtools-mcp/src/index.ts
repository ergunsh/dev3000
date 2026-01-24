import {createHookAccessor} from './core/hook-accessor';
import {createTreeStore} from './core/tree-store';
import {createRendererBridge} from './core/renderer-bridge';
import {createTools} from './tools';
import type {Tools} from './types';

export interface InitializeOptions {
  /**
   * Whether to wait for a renderer to be attached before initializing.
   * Defaults to true.
   */
  waitForRenderer?: boolean;

  /**
   * Timeout in milliseconds to wait for a renderer.
   * Defaults to 5000.
   */
  rendererTimeout?: number;

  /**
   * Whether to automatically flush initial operations from the renderer.
   * This ensures the tree store has the current component tree.
   * Defaults to true.
   */
  flushInitialOperations?: boolean;
}

export interface InitializeResult {
  success: boolean;
  tools?: Tools;
  error?: string;
}

/**
 * Initialize the React DevTools MCP package.
 * This sets up the hook accessor, tree store, renderer bridge, and tools.
 *
 * @param options Configuration options for initialization
 * @returns A promise that resolves with the initialization result
 */
export async function initialize(
  options: InitializeOptions = {}
): Promise<InitializeResult> {
  const {
    waitForRenderer = true,
    rendererTimeout = 5000,
    flushInitialOperations = true,
  } = options;

  try {
    const hookAccessor = createHookAccessor();

    // Check if hook exists
    const hook = hookAccessor.getHook();
    if (!hook) {
      return {
        success: false,
        error:
          'React DevTools hook not found. Make sure React DevTools is installed.',
      };
    }

    // Wait for renderer if needed
    if (waitForRenderer && !hookAccessor.isReady()) {
      try {
        await hookAccessor.waitForRenderer(rendererTimeout);
      } catch (error) {
        return {
          success: false,
          error:
            'Timeout waiting for React renderer. Make sure a React application is running.',
        };
      }
    }

    // Create core modules
    const treeStore = createTreeStore(hookAccessor);
    const rendererBridge = createRendererBridge(hookAccessor);

    // Initialize tree store to listen for operations
    treeStore.initialize();

    // Flush initial operations to populate tree store
    if (flushInitialOperations) {
      rendererBridge.flushInitialOperations();
    }

    // Create tools
    const tools = createTools(treeStore, rendererBridge);

    // Register tools on globalThis
    (globalThis as {__REACT_DEVTOOLS_MCP__?: {tools: Tools}}).__REACT_DEVTOOLS_MCP__ = {tools};

    console.log('[react-devtools-mcp] Initialized successfully');
    console.log('[react-devtools-mcp] Available tools:');
    console.log('  - react_get_component_tree: Get component tree structure');
    console.log(
      '  - react_inspect_element: Get detailed info about a component'
    );
    console.log('  - react_search_components: Find components by name');
    console.log(
      '  - react_find_component_source: Find source file for a DOM element'
    );

    return {
      success: true,
      tools,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Check if React DevTools MCP is initialized and tools are available.
 */
export function isInitialized(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    (globalThis as {__REACT_DEVTOOLS_MCP__?: {tools: Tools}}).__REACT_DEVTOOLS_MCP__?.tools !== undefined
  );
}

/**
 * Get the registered tools, or null if not initialized.
 */
export function getTools(): Tools | null {
  if (!isInitialized()) {
    return null;
  }
  return (globalThis as {__REACT_DEVTOOLS_MCP__?: {tools: Tools}}).__REACT_DEVTOOLS_MCP__?.tools ?? null;
}

// Auto-initialize when the script is loaded
// Use a slight delay to ensure React has had time to mount
if (typeof window !== 'undefined') {
  // In browser context, wait for DOM to be ready and React to mount
  const autoInit = () => {
    // Give React a moment to mount
    setTimeout(() => {
      initialize().then((result) => {
        if (!result.success) {
          console.warn('[react-devtools-mcp]', result.error);
        }
      });
    }, 100);
  };

  if (document.readyState === 'complete') {
    autoInit();
  } else {
    window.addEventListener('load', autoInit);
  }
}

// Export types
export type {
  Tools,
  Tool,
  GetComponentTreeParams,
  GetComponentTreeResult,
  TreeNode,
  InspectElementParams,
  InspectElementResult,
  HookInfo,
  OwnerInfo,
  SearchComponentsParams,
  SearchComponentsResult,
  SearchMatch,
} from './types';

// Export core modules for advanced usage
export {createHookAccessor} from './core/hook-accessor';
export {createTreeStore} from './core/tree-store';
export {createRendererBridge} from './core/renderer-bridge';
export {createTools} from './tools';

import type {HookAccessor} from './hook-accessor';
import type {
  RendererInterface,
  SerializedElement,
  InspectedElementPayload,
  InspectedElementData,
  PathFrame,
  RendererID,
} from '../types';

export interface RendererBridge {
  inspectElement(
    id: number,
    path?: Array<string | number> | null,
    forceFullData?: boolean
  ): Promise<InspectedElementData | null>;
  getDisplayName(id: number): string | null;
  getOwners(id: number): SerializedElement[] | null;
  getPath(id: number): PathFrame[] | null;
  hasElement(id: number): boolean;
  findRendererForElement(id: number): RendererID | null;
  flushInitialOperations(): void;
  getElementIdForDomNode(element: Element): {id: number; rendererId: RendererID} | null;
  findHostInstances(id: number): Element[] | null;
}

let requestIdCounter = 0;

export function createRendererBridge(hookAccessor: HookAccessor): RendererBridge {
  const getRendererForElement = (id: number): RendererInterface | null => {
    const interfaces = hookAccessor.getRendererInterfaces();

    for (const [, rendererInterface] of interfaces) {
      if (rendererInterface.hasElementWithId(id)) {
        return rendererInterface;
      }
    }

    return null;
  };

  const findRendererForElement = (id: number): RendererID | null => {
    const interfaces = hookAccessor.getRendererInterfaces();

    for (const [rendererID, rendererInterface] of interfaces) {
      if (rendererInterface.hasElementWithId(id)) {
        return rendererID;
      }
    }

    return null;
  };

  const inspectElement = async (
    id: number,
    path: Array<string | number> | null = null,
    forceFullData: boolean = true
  ): Promise<InspectedElementData | null> => {
    const renderer = getRendererForElement(id);
    if (!renderer) {
      return null;
    }

    const requestID = ++requestIdCounter;

    try {
      const payload: InspectedElementPayload = renderer.inspectElement(
        requestID,
        id,
        path,
        forceFullData
      );

      if (payload.type === 'full-data' && payload.value) {
        return payload.value as InspectedElementData;
      }

      if (payload.type === 'not-found') {
        return null;
      }

      if (payload.type === 'error') {
        console.error('[react-devtools-mcp] inspectElement error:', payload.message);
        return null;
      }

      return null;
    } catch (error) {
      console.error('[react-devtools-mcp] inspectElement exception:', error);
      return null;
    }
  };

  const getDisplayName = (id: number): string | null => {
    const renderer = getRendererForElement(id);
    if (!renderer) {
      return null;
    }

    try {
      return renderer.getDisplayNameForElementID(id);
    } catch {
      return null;
    }
  };

  const getOwners = (id: number): SerializedElement[] | null => {
    const renderer = getRendererForElement(id);
    if (!renderer) {
      return null;
    }

    try {
      return renderer.getOwnersList(id);
    } catch {
      return null;
    }
  };

  const getPath = (id: number): PathFrame[] | null => {
    const renderer = getRendererForElement(id);
    if (!renderer) {
      return null;
    }

    try {
      return renderer.getPathForElement(id);
    } catch {
      return null;
    }
  };

  const hasElement = (id: number): boolean => {
    const interfaces = hookAccessor.getRendererInterfaces();

    for (const [, rendererInterface] of interfaces) {
      if (rendererInterface.hasElementWithId(id)) {
        return true;
      }
    }

    return false;
  };

  const flushInitialOperations = (): void => {
    const interfaces = hookAccessor.getRendererInterfaces();

    for (const [, rendererInterface] of interfaces) {
      try {
        rendererInterface.flushInitialOperations();
      } catch (error) {
        console.error(
          '[react-devtools-mcp] flushInitialOperations error:',
          error
        );
      }
    }
  };

  /**
   * Find the React element ID for a given DOM node.
   * Uses the official React DevTools methods:
   * - getNearestMountedDOMNode: walks up DOM tree to find React-mounted node
   * - getElementIDForHostInstance: gets element ID from the publicInstanceToDevToolsInstanceMap
   *
   * This matches the logic in react-devtools-shared/src/backend/agent.js:458-533
   */
  const getElementIdForDomNode = (
    target: Element
  ): {id: number; rendererId: RendererID} | null => {
    const interfaces = hookAccessor.getRendererInterfaces();

    let bestMatch: Element | null = null;
    let bestRenderer: RendererInterface | null = null;
    let bestRendererID: RendererID = 0;

    // Find the nearest ancestor mounted by React (same logic as agent.js)
    for (const [rendererID, renderer] of interfaces) {
      try {
        const nearestNode = renderer.getNearestMountedDOMNode(target);
        if (nearestNode !== null) {
          if (nearestNode === target) {
            // Exact match - exit early
            bestMatch = nearestNode;
            bestRenderer = renderer;
            bestRendererID = rendererID;
            break;
          }
          if (bestMatch === null || bestMatch.contains(nearestNode)) {
            // New match is deeper - better match
            bestMatch = nearestNode;
            bestRenderer = renderer;
            bestRendererID = rendererID;
          }
        }
      } catch {
        // Renderer might not support these methods
        continue;
      }
    }

    if (bestRenderer && bestMatch) {
      try {
        const id = bestRenderer.getElementIDForHostInstance(bestMatch);
        if (id !== null) {
          return {id, rendererId: bestRendererID};
        }
      } catch {
        // Failed to get element ID
      }
    }

    return null;
  };

  /**
   * Find the DOM host instances (Elements) for a React element ID.
   * Uses RendererInterface.findHostInstancesForElementID which returns
   * the DOM nodes associated with a React component.
   */
  const findHostInstances = (id: number): Element[] | null => {
    const renderer = getRendererForElement(id);
    if (!renderer) {
      return null;
    }

    try {
      const instances = renderer.findHostInstancesForElementID(id);
      if (!instances || instances.length === 0) {
        return null;
      }

      // Filter to only Element instances (not text nodes or other)
      const elements = instances.filter(
        (instance): instance is Element => instance instanceof Element
      );

      return elements.length > 0 ? elements : null;
    } catch {
      return null;
    }
  };

  return {
    inspectElement,
    getDisplayName,
    getOwners,
    getPath,
    hasElement,
    findRendererForElement,
    flushInitialOperations,
    getElementIdForDomNode,
    findHostInstances,
  };
}

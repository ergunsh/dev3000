// Element types from react-devtools-shared
export const ElementTypeClass = 1;
export const ElementTypeContext = 2;
export const ElementTypeFunction = 5;
export const ElementTypeForwardRef = 6;
export const ElementTypeHostComponent = 7;
export const ElementTypeMemo = 8;
export const ElementTypeOtherOrUnknown = 9;
export const ElementTypeProfiler = 10;
export const ElementTypeRoot = 11;
export const ElementTypeSuspense = 12;
export const ElementTypeSuspenseList = 13;
export const ElementTypeTracingMarker = 14;
export const ElementTypeVirtual = 15;
export const ElementTypeViewTransition = 16;
export const ElementTypeActivity = 17;

export type ElementType =
  | 1
  | 2
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17;

// Tool API types
export interface JSONSchema {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: (string | number | boolean)[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
}

export interface Tool<TParams = unknown, TResult = unknown> {
  description: string;
  inputs: JSONSchema;
  handler: (params: TParams) => Promise<TResult>;
}

export interface Tools {
  react_get_component_tree: Tool<GetComponentTreeParams, string>;
  react_inspect_element: Tool<InspectElementParams, string>;
  react_search_components: Tool<SearchComponentsParams, string>;
  react_find_component_source: Tool<FindComponentSourceParams, string>;
  react_profiler_start: Tool<ProfilerStartParams, string>;
  react_profiler_stop: Tool<ProfilerStopParams, string>;
  react_get_suspense_tree: Tool<GetSuspenseTreeParams, string>;
  react_inspect_suspense: Tool<InspectSuspenseParams, string>;
  react_get_suspense_timeline: Tool<GetSuspenseTimelineParams, string>;
}

// Tool parameter and result types
export interface GetComponentTreeParams {
  depth?: number;
  includeHostComponents?: boolean;
}

export interface TreeNode {
  id: number;
  name: string | null;
  type: string;
  key: string | number | null;
  depth: number;
  children: TreeNode[];
}

export interface GetComponentTreeResult {
  roots: TreeNode[];
}

export interface InspectElementParams {
  id: number;
  path?: (string | number)[];
}

export interface HookSource {
  lineNumber: number | null;
  columnNumber: number | null;
  fileName: string | null;
  functionName: string | null;
}

export interface HookInfo {
  id: number | null;
  name: string;
  value: unknown;
  subHooks: HookInfo[];
  hookSource: HookSource | null;
  /**
   * Parsed hook variable name from source code.
   * Example: for `const [count, setCount] = useState(0)`, this would be "count"
   */
  hookName?: string | null;
}

export interface OwnerInfo {
  id: number;
  displayName: string | null;
  type: string;
  env: string | null;
  stack: ReactStackFrame[] | null;
}

export interface DomPathInfo {
  selector: string; // CSS selector path
}

export interface InspectElementResult {
  id: number;
  name: string | null;
  type: string;
  props: Record<string, unknown> | null;
  state: Record<string, unknown> | null;
  hooks: HookInfo[] | null;
  context: Record<string, unknown> | null;
  owners: OwnerInfo[];
  source: {fileName: string; lineNumber: number; columnNumber?: number} | null;
  key: string | number | null;
  env: string | null;
  domPath: DomPathInfo | null;

  // Suspension info
  isSuspended: boolean | null;
  suspendedBy: SuspendedByInfo[] | null;
  unknownSuspendersReason: string | null;

  // Root and renderer info (for rendered-by chain)
  rootType: string | null;
  rendererPackageName: string | null;
  rendererVersion: string | null;
}

export interface SearchComponentsParams {
  query: string;
  caseSensitive?: boolean;
  limit?: number;
}

export interface SearchMatch {
  id: number;
  name: string | null;
  type: string;
  path: string[];
}

export interface SearchComponentsResult {
  matches: SearchMatch[];
  totalCount: number;
}

export interface FindComponentSourceParams {
  selector: string;
}

export interface FindComponentSourceResult {
  selector: string;
  componentName: string | null;
  componentId: number;
  source: {fileName: string; lineNumber: number; columnNumber?: number} | null;
  owners: string[];
}

// Profiler tool parameter types
export interface ProfilerStartParams {}
export interface ProfilerStopParams {}

// Suspense types
export interface SuspenseNode {
  id: number;
  parentID: number; // 0 = root-level
  children: number[];
  name: string | null;
  isSuspended: boolean;
  hasUniqueSuspenders: boolean;
  environments: string[]; // Server environments (RSC)
  endTime: number; // Resolution time (0 = pending)
}

export interface SuspenseTreeNode extends SuspenseNode {
  depth: number;
  childNodes: SuspenseTreeNode[];
}

export interface SuspenseTimelineStep {
  id: number;
  name: string | null;
  environment: string | null;
  endTime: number;
  // Per-suspender detail (from fiber inspection at query time)
  suspenderName?: string | null;
  suspenderDescription?: string | null;
  duration?: number;
  startTime?: number;
  startedByComponent?: string | null;
  startedBySource?: string | null;
  suspenderEnvironment?: string | null;
}

// Suspense tool parameter types
export interface GetSuspenseTreeParams {
  depth?: number;
}

export interface InspectSuspenseParams {
  id: number;
}

export interface GetSuspenseTimelineParams {
  limit?: number;
}

// Profiling data types from React DevTools
export interface ChangeDescription {
  context: Array<string> | boolean | null;
  didHooksChange: boolean;
  isFirstMount: boolean;
  props: Array<string> | null;
  state: Array<string> | null;
  hooks: Array<number> | null;
}

export interface CommitDataBackend {
  changeDescriptions: Array<[number, ChangeDescription]> | null;
  duration: number;
  effectDuration: number | null;
  fiberActualDurations: Array<[number, number]>;
  fiberSelfDurations: Array<[number, number]>;
  passiveEffectDuration: number | null;
  priorityLevel: string | null;
  timestamp: number;
  updaters: SerializedElement[] | null;
}

export interface ProfilingDataForRootBackend {
  commitData: CommitDataBackend[];
  displayName: string;
  initialTreeBaseDurations: Array<[number, number]>;
  rootID: number;
}

export interface ProfilingDataBackend {
  dataForRoots: ProfilingDataForRootBackend[];
  rendererID: number;
  timelineData: unknown | null;
}

// Element info stored in TreeStore
export interface ElementInfo {
  id: number;
  parentID: number;
  children: number[];
  displayName: string | null;
  key: string | number | null;
  type: ElementType;
  ownerID: number;
  depth: number;
  hocDisplayNames: string[] | null;
  compiledWithForget: boolean;
}

// DevTools Hook types (simplified for our use)
export type RendererID = number;

export interface SerializedElement {
  displayName: string | null;
  id: number;
  key: number | string | null;
  env: string | null;
  stack: ReactStackTrace | null;
  hocDisplayNames: string[] | null;
  compiledWithForget: boolean;
  type: ElementType;
}

// Stack trace types from React DevTools
export type ReactStackFrame = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  functionName: string | null;
};

export type ReactStackTrace = ReactStackFrame[];

// Suspension tracking types
export interface SerializedIOInfo {
  name: string;
  description: string;
  start: number;
  end: number;
  byteSize: number | null;
  value: unknown;
  env: string | null;
  owner: SerializedElement | null;
  stack: ReactStackTrace | null;
}

export interface SerializedAsyncInfo {
  awaited: SerializedIOInfo;
  env: string | null;
  owner: SerializedElement | null;
  stack: ReactStackTrace | null;
}

export interface SuspendedByInfo {
  name: string;
  description: string;
  startTime: number;
  endTime: number;
  duration: number;
  byteSize: number | null;
  environment: string | null;

  startedBy: {
    componentName: string | null;
    componentId: number | null;
    environment: string | null;
    stack: ReactStackFrame[] | null;
  } | null;

  awaitedBy: {
    componentName: string | null;
    componentId: number | null;
    environment: string | null;
    stack: ReactStackFrame[] | null;
  } | null;
}

export interface PathFrame {
  key: string | null;
  index: number;
  displayName: string | null;
}

export interface InspectedElementPayload {
  id: number;
  responseID: number;
  type: 'error' | 'full-data' | 'hydrated-path' | 'no-change' | 'not-found';
  value?: InspectedElementData;
  message?: string;
  errorType?: string;
  path?: (string | number)[];
}

export interface InspectedElementData {
  id: number;
  type: ElementType;
  props: object | null;
  state: object | null;
  hooks: object | null;
  context: object | null;
  errors: Array<[string, number]>;
  warnings: Array<[string, number]>;
  owners: SerializedElement[] | null;
  // Source can be either:
  // - Array format: [componentName, fileName, lineNumber, columnNumber]
  // - Object format: {fileName, lineNumber, columnNumber}
  // - null if not available
  source: [string, string, number, number] | {fileName: string; lineNumber: number; columnNumber?: number} | null;
  key: number | string | null;
  env: string | null;
  canEditHooks: boolean;
  canEditFunctionProps: boolean;
  canEditHooksAndDeletePaths: boolean;
  canEditHooksAndRenamePaths: boolean;
  canEditFunctionPropsDeletePaths: boolean;
  canEditFunctionPropsRenamePaths: boolean;
  canToggleError: boolean;
  isErrored: boolean;
  canToggleSuspense: boolean;
  isSuspended: boolean | null;
  hasLegacyContext: boolean;
  rootType: string | null;
  rendererPackageName: string | null;
  rendererVersion: string | null;
  plugins: object;
  nativeTag: number | null;

  // Suspension information (returned by renderer, previously not typed)
  suspendedBy: object | null; // DehydratedData-wrapped Array<SerializedAsyncInfo>
  suspendedByRange: [number, number] | null;
  unknownSuspenders: number; // 0=none, 1=production, 2=old-version, 3=thrown-promise

  // Component stack (for richer rendered-by)
  stack: ReactStackTrace | null;
}

export interface RendererInterface {
  cleanup: () => void;
  clearErrorsAndWarnings: () => void;
  clearErrorsForElementID: (id: number) => void;
  clearWarningsForElementID: (id: number) => void;
  findHostInstancesForElementID: (id: number) => object[] | null;
  flushInitialOperations: () => void;
  getDisplayNameForElementID: (id: number) => string | null;
  getOwnersList: (id: number) => SerializedElement[] | null;
  getPathForElement: (id: number) => PathFrame[] | null;
  hasElementWithId: (id: number) => boolean;
  inspectElement: (
    requestID: number,
    id: number,
    path: Array<string | number> | null,
    forceFullData: boolean
  ) => InspectedElementPayload;
  logElementToConsole: (id: number) => void;
  // DOM-to-component mapping methods (official React DevTools API)
  getNearestMountedDOMNode: (publicInstance: Element) => Element | null;
  getElementIDForHostInstance: (publicInstance: Element) => number | null;
  // Profiling methods
  startProfiling: (recordChangeDescriptions: boolean, recordTimeline: boolean) => void;
  stopProfiling: () => void;
  getProfilingData: () => ProfilingDataBackend;
}

export interface ReactRenderer {
  version: string;
  rendererPackageName: string;
  bundleType: number;
  reconcilerVersion?: string;
}

export type Handler = (data: unknown) => void;

export interface DevToolsHook {
  listeners: Record<string, Handler[]>;
  rendererInterfaces: Map<RendererID, RendererInterface>;
  renderers: Map<RendererID, ReactRenderer>;
  hasUnsupportedRendererAttached: boolean;

  emit: (event: string, data: unknown) => void;
  getFiberRoots: (rendererID: RendererID) => Set<object>;
  inject: (renderer: ReactRenderer) => number | null;
  on: (event: string, handler: Handler) => void;
  off: (event: string, handler: Handler) => void;
  sub: (event: string, handler: Handler) => () => void;
  reactDevtoolsAgent?: object;
}

// Extend globalThis
declare global {
  // eslint-disable-next-line no-var
  var __REACT_DEVTOOLS_GLOBAL_HOOK__: DevToolsHook | undefined;
  // eslint-disable-next-line no-var
  var __REACT_DEVTOOLS_MCP__: {tools: Tools} | undefined;
}

import type {SuspenseNode, SuspenseTreeNode, SuspenseTimelineStep, SuspendedByInfo, OwnerInfo, ReactStackFrame} from '../types';

/**
 * Options for suspense tree formatting
 */
export interface SuspenseTreeFormatOptions {
  includeLegend?: boolean;
  totalBoundaries?: number;
  suspendedCount?: number;
}

/**
 * Options for suspense timeline formatting
 */
export interface SuspenseTimelineFormatOptions {
  totalResolved?: number;
  pendingCount?: number;
}

/**
 * Element data from inspectElement, used to enrich suspense boundary output
 */
export interface SuspenseElementData {
  suspendedBy: SuspendedByInfo[] | null;
  unknownSuspendersReason: string | null;
  owners: OwnerInfo[];
  props: Record<string, unknown> | null;
  source: {fileName: string; lineNumber: number; columnNumber?: number} | null;
  rootType: string | null;
  rendererPackageName: string | null;
  rendererVersion: string | null;
}

/**
 * Format status marker for a suspense boundary
 */
function formatStatus(node: SuspenseNode | SuspenseTreeNode): string {
  if (node.isSuspended) {
    return '[SUSPENDED]';
  }
  if (node.endTime > 0) {
    return `[RESOLVED ${node.endTime}ms]`;
  }
  return '[RESOLVED]';
}

/**
 * Format environment tags
 */
function formatEnvironments(environments: string[]): string {
  if (environments.length === 0) {
    return '';
  }
  return `(env: ${environments.join(', ')})`;
}

/**
 * Format byte size for display
 */
function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Format a stack frame for display
 */
function formatStackFrame(frame: ReactStackFrame): string {
  const fn = frame.functionName ?? '(anonymous)';
  const file = frame.fileName?.split('/').pop() ?? '(unknown)';
  return `${fn} @ ${file}:${frame.lineNumber}`;
}

/**
 * Format a value for display
 */
function formatValue(value: unknown, indent = 0): string {
  const padding = '  '.repeat(indent);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.replace(/"/g, '\\"')}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 5) return `Array(${value.length})`;
    const items = value.map((v) => formatValue(v, 0)).join(', ');
    return `[${items}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length > 5) {
      return `{${keys.slice(0, 3).join(', ')}, ... (${keys.length} keys)}`;
    }
    const entries = keys.map((k) => `${k}: ${formatValue(obj[k], 0)}`);
    const inline = `{${entries.join(', ')}}`;
    if (inline.length < 60) return inline;
    return `{\n${entries.map((e) => `${padding}  ${e}`).join(',\n')}\n${padding}}`;
  }

  return String(value);
}

/**
 * Render the ASCII tree structure for suspense boundaries
 */
function renderSuspenseTree(
  nodes: SuspenseTreeNode[],
  isLast: boolean[],
  lines: string[]
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLastNode = i === nodes.length - 1;

    // Build the connector prefix
    let connector = '';
    for (let j = 0; j < isLast.length; j++) {
      if (isLast[j]) {
        connector += '   ';
      } else {
        connector += '│  ';
      }
    }
    connector += isLastNode ? '└─ ' : '├─ ';

    // Get boundary info
    const name = node.name ?? 'Suspense';
    const id = `(#${node.id})`;
    const status = formatStatus(node);
    const envTags = formatEnvironments(node.environments);

    // Build the line
    let line = `${connector}${name} ${id} ${status}`;
    if (envTags) line += ` ${envTags}`;
    if (node.hasUniqueSuspenders) line += ' [unique suspenders]';

    lines.push(line);

    // Recurse for children
    if (node.childNodes.length > 0) {
      const newIsLast = [...isLast, isLastNode];
      renderSuspenseTree(node.childNodes, newIsLast, lines);
    }
  }
}

/**
 * The legend explaining the suspense tree output format
 */
const SUSPENSE_TREE_LEGEND = `=== Legend ===
[SUSPENDED]               → boundary is currently suspended (loading)
[RESOLVED]                → boundary has resolved (content shown)
[RESOLVED 123ms]          → boundary resolved after 123ms
(env: react, edge)        → server environments (RSC)
[unique suspenders]       → boundary has unique pending suspenders

Use react_inspect_suspense(id) for full boundary details.
`;

/**
 * Format a suspense tree as ASCII text output
 */
export function formatSuspenseTree(
  roots: SuspenseTreeNode[],
  options: SuspenseTreeFormatOptions = {}
): string {
  const {includeLegend = true, totalBoundaries, suspendedCount} = options;

  const lines: string[] = [];

  if (includeLegend) {
    lines.push(SUSPENSE_TREE_LEGEND);
  }

  lines.push('=== Suspense Tree ===');

  // Add summary stats if provided
  if (totalBoundaries !== undefined || suspendedCount !== undefined) {
    const stats: string[] = [];
    if (totalBoundaries !== undefined) {
      stats.push(`Total: ${totalBoundaries}`);
    }
    if (suspendedCount !== undefined) {
      stats.push(`Suspended: ${suspendedCount}`);
    }
    lines.push(stats.join(' | '));
  }

  lines.push('');

  if (roots.length === 0) {
    lines.push('No Suspense boundaries found.');
    return lines.join('\n');
  }

  // Render each root
  for (const root of roots) {
    const name = root.name ?? 'Suspense';
    const id = `(#${root.id})`;
    const status = formatStatus(root);
    const envTags = formatEnvironments(root.environments);

    let line = `${name} ${id} ${status}`;
    if (envTags) line += ` ${envTags}`;
    if (root.hasUniqueSuspenders) line += ' [unique suspenders]';

    lines.push(line);

    if (root.childNodes.length > 0) {
      renderSuspenseTree(root.childNodes, [], lines);
    }
  }

  return lines.join('\n');
}

/**
 * Format suspendedBy section for suspense boundary output
 */
function formatSuspendedBySection(
  suspendedBy: SuspendedByInfo[],
  unknownReason: string | null
): string {
  const lines: string[] = ['suspended by:'];

  for (let i = 0; i < suspendedBy.length; i++) {
    const info = suspendedBy[i];
    const num = i + 1;

    const status = info.endTime > 0
      ? `resolved in ${info.duration.toFixed(0)}ms`
      : `pending, ${info.duration.toFixed(0)}ms so far`;
    const bytes = info.byteSize != null
      ? `, ${formatByteSize(info.byteSize)}`
      : '';
    const desc = info.description ? ` "${info.description}"` : '';
    const env = info.environment ? ` [${info.environment}]` : '';

    lines.push(`  ${num}. ${info.name}${desc} (${status}${bytes})${env}`);

    // I/O stack trace
    if (info.startedBy?.stack && info.startedBy.stack.length > 0) {
      for (const frame of info.startedBy.stack) {
        lines.push(`     ${formatStackFrame(frame)}`);
      }
    }

    // Started by component
    if (info.startedBy?.componentName) {
      const envTag = info.startedBy.environment
        ? ` [${info.startedBy.environment}]`
        : '';
      lines.push(`     started by: ${info.startedBy.componentName}${envTag}`);
    }

    // Awaited at stack trace
    if (info.awaitedBy?.stack && info.awaitedBy.stack.length > 0) {
      lines.push('     awaited at:');
      for (const frame of info.awaitedBy.stack) {
        lines.push(`       ${formatStackFrame(frame)}`);
      }
    }

    // Awaited by component
    if (info.awaitedBy?.componentName) {
      const envTag = info.awaitedBy.environment
        ? ` [${info.awaitedBy.environment}]`
        : '';
      lines.push(`     awaited by: ${info.awaitedBy.componentName}${envTag}`);
    }
  }

  // Unknown suspenders warning
  if (unknownReason) {
    switch (unknownReason) {
      case 'production':
        lines.push('  (some suspenders unknown — use development build for details)');
        break;
      case 'old-version':
        lines.push('  (some suspenders unknown — upgrade React for full tracking)');
        break;
      case 'thrown-promise':
        lines.push('  (some suspenders unknown — library using thrown Promises instead of use())');
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Format detailed info about a single suspense boundary
 */
export function formatInspectedSuspense(
  node: SuspenseNode,
  depth: number,
  elementData?: SuspenseElementData
): string {
  const lines: string[] = [];

  lines.push('=== Suspense Boundary ===');
  lines.push('');

  // Basic info
  lines.push(`${node.name ?? 'Suspense'} (#${node.id})`);
  lines.push(`Status: ${node.isSuspended ? 'SUSPENDED' : 'RESOLVED'}`);

  // Source location
  if (elementData?.source) {
    const file = elementData.source.fileName.split('/').pop();
    lines.push(`Source: ${file}:${elementData.source.lineNumber}`);
  }

  // Timing
  if (node.endTime > 0) {
    lines.push(`Resolution Time: ${node.endTime}ms`);
  } else if (node.isSuspended) {
    lines.push('Resolution Time: pending...');
  }

  lines.push('');

  // Suspended by (from inspectElement data)
  if (elementData?.suspendedBy && elementData.suspendedBy.length > 0) {
    lines.push(formatSuspendedBySection(elementData.suspendedBy, elementData.unknownSuspendersReason));
    lines.push('');
  } else if (elementData?.unknownSuspendersReason) {
    lines.push(formatSuspendedBySection([], elementData.unknownSuspendersReason));
    lines.push('');
  }

  // Props (from inspectElement data)
  if (elementData?.props && Object.keys(elementData.props).length > 0) {
    lines.push('props:');
    for (const [key, value] of Object.entries(elementData.props)) {
      lines.push(`  ${key}: ${formatValue(value, 1)}`);
    }
    lines.push('');
  }

  // Rendered by (enriched with source locations and env tags)
  if (elementData?.owners && elementData.owners.length > 0) {
    lines.push('rendered by:');
    for (const owner of elementData.owners) {
      const name = owner.displayName ?? 'Anonymous';
      const envTag = owner.env ? ` [${owner.env}]` : '';

      if (owner.stack && owner.stack.length > 0 && owner.stack[0].fileName) {
        const frame = owner.stack[0];
        const file = frame.fileName.split('/').pop();
        lines.push(`  ${name} @ ${file}:${frame.lineNumber}${envTag}`);
      } else {
        lines.push(`  ${name} (#${owner.id})${envTag}`);
      }
    }

    if (elementData.rootType) {
      lines.push(`  ${elementData.rootType}`);
    }

    if (elementData.rendererPackageName && elementData.rendererVersion) {
      lines.push(`  ${elementData.rendererPackageName}@${elementData.rendererVersion}`);
    }

    lines.push('');
  }

  // Hierarchy info
  lines.push(`Depth: ${depth}`);
  lines.push(`Parent ID: ${node.parentID === 0 ? '(root-level)' : node.parentID}`);
  lines.push(`Children: ${node.children.length > 0 ? node.children.join(', ') : '(none)'}`);

  // Suspender info
  lines.push(`Has Unique Suspenders: ${node.hasUniqueSuspenders ? 'yes' : 'no'}`);

  // Environments
  if (node.environments.length > 0) {
    lines.push(`Environments: ${node.environments.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Format suspense timeline as text output
 */
export function formatSuspenseTimeline(
  steps: SuspenseTimelineStep[],
  options: SuspenseTimelineFormatOptions = {}
): string {
  const {totalResolved, pendingCount} = options;

  const lines: string[] = [];

  lines.push('=== Suspense Timeline ===');

  // Add summary stats if provided
  if (totalResolved !== undefined || pendingCount !== undefined) {
    const stats: string[] = [];
    if (totalResolved !== undefined) {
      stats.push(`Resolved: ${totalResolved}`);
    }
    if (pendingCount !== undefined) {
      stats.push(`Pending: ${pendingCount}`);
    }
    lines.push(stats.join(' | '));
  }

  lines.push('');

  if (steps.length === 0) {
    lines.push('No resolutions recorded yet.');
    return lines.join('\n');
  }

  lines.push('Recent resolutions (most recent first):');
  lines.push('');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const name = step.name ?? 'Suspense';

    if (step.suspenderName) {
      // Rich per-suspender format
      const duration = step.duration != null ? `[${step.duration.toFixed(0)}ms]` : '';
      const suspenderEnv = step.suspenderEnvironment ? ` [${step.suspenderEnvironment}]` : '';
      const desc = step.suspenderDescription ? ` "${step.suspenderDescription}"` : '';
      const boundaryEnv = step.environment ? ` [${step.environment}]` : '';

      const durationPad = duration ? `${duration.padEnd(10)} ` : '';
      lines.push(`${i + 1}. ${durationPad}${step.suspenderName}${desc}${suspenderEnv} resolved -> ${name} (#${step.id})${boundaryEnv}`);

      if (step.startedByComponent) {
        const startedEnv = step.suspenderEnvironment ? ` [${step.suspenderEnvironment}]` : '';
        const source = step.startedBySource ? ` @ ${step.startedBySource}` : '';
        lines.push(`   started by: ${step.startedByComponent}${source}${startedEnv}`);
      }
    } else {
      // Simple format (from store fallback)
      const time = `${step.endTime}ms`;
      const env = step.environment ? ` (env: ${step.environment})` : '';
      lines.push(`${i + 1}. ${name} (#${step.id}) resolved at ${time}${env}`);
    }
  }

  return lines.join('\n');
}

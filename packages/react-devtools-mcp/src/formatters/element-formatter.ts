import type {InspectElementResult, HookInfo, OwnerInfo, DomPathInfo, SuspendedByInfo, ReactStackFrame} from '../types';

/**
 * Format a value for display with proper indentation
 */
function formatValue(value: unknown, indent = 0): string {
  const padding = '  '.repeat(indent);

  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') {
    // Escape and quote strings
    return `"${value.replace(/"/g, '\\"')}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'function' || (typeof value === 'string' && value.startsWith('[Function:'))) {
    return '() => {}';
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 5) {
      return `Array(${value.length})`;
    }
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
    // Multi-line for longer objects
    return `{\n${entries.map((e) => `${padding}  ${e}`).join(',\n')}\n${padding}}`;
  }

  return String(value);
}

/**
 * Format props section
 */
function formatProps(props: Record<string, unknown> | null): string {
  if (!props || Object.keys(props).length === 0) {
    return 'props: (none)';
  }

  const lines: string[] = ['props:'];
  for (const [key, value] of Object.entries(props)) {
    lines.push(`  ${key}: ${formatValue(value, 1)}`);
  }
  return lines.join('\n');
}

/**
 * Format hooks section with numbered list
 */
function formatHooks(hooks: HookInfo[] | null): string {
  if (!hooks || hooks.length === 0) {
    return 'hooks: (none)';
  }

  const lines: string[] = ['hooks:'];
  let hookNumber = 1;

  for (const hook of hooks) {
    const value = formatValue(hook.value, 1);
    // Format with parsed hook name if available:
    // "1. State(count): 5" or "1. State: 5" (if no parsed name)
    const hookNameDisplay = hook.hookName ? `(${hook.hookName})` : '';
    lines.push(`  ${hookNumber}. ${hook.name}${hookNameDisplay}: ${value}`);
    hookNumber++;
  }

  return lines.join('\n');
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
 * Format stack frame for display
 */
function formatStackFrame(frame: ReactStackFrame): string {
  const fn = frame.functionName ?? '(anonymous)';
  const file = frame.fileName?.split('/').pop() ?? '(unknown)';
  return `${fn} @ ${file}:${frame.lineNumber}`;
}

/**
 * Format suspendedBy section
 */
function formatSuspendedBy(
  suspendedBy: SuspendedByInfo[],
  unknownReason: string | null
): string {
  const lines: string[] = ['suspended by:'];

  for (let i = 0; i < suspendedBy.length; i++) {
    const info = suspendedBy[i];
    const num = i + 1;

    // Header: name and timing
    const status = info.endTime > 0
      ? `resolved in ${info.duration.toFixed(0)}ms`
      : `pending, ${info.duration.toFixed(0)}ms so far`;
    const bytes = info.byteSize != null
      ? `, ${formatByteSize(info.byteSize)}`
      : '';
    const desc = info.description ? ` "${info.description}"` : '';
    const env = info.environment ? ` [${info.environment}]` : '';

    lines.push(`  ${num}. ${info.name}${desc} (${status}${bytes})${env}`);

    // I/O stack trace (where the async operation was initiated)
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
 * Format rendered-by chain (owners) with source locations and env tags
 */
function formatRenderedBy(
  owners: OwnerInfo[],
  rootType?: string | null,
  rendererInfo?: string | null
): string {
  if (owners.length === 0 && !rootType) {
    return 'rendered by: (root)';
  }

  const lines: string[] = ['rendered by:'];

  for (const owner of owners) {
    const name = owner.displayName ?? 'Anonymous';
    const envTag = owner.env ? ` [${owner.env}]` : '';

    // Include source location from first stack frame
    if (owner.stack && owner.stack.length > 0 && owner.stack[0].fileName) {
      const frame = owner.stack[0];
      const file = frame.fileName.split('/').pop();
      lines.push(`  ${name} @ ${file}:${frame.lineNumber}${envTag}`);
    } else {
      lines.push(`  ${name} (#${owner.id})${envTag}`);
    }
  }

  // Root type (e.g., "hydrateRoot()", "createRoot()")
  if (rootType) {
    lines.push(`  ${rootType}`);
  }

  // Renderer info
  if (rendererInfo) {
    lines.push(`  ${rendererInfo}`);
  }

  return lines.join('\n');
}

/**
 * Format source location
 */
function formatSource(
  source: {fileName: string; lineNumber: number; columnNumber?: number} | null
): string {
  if (!source || !source.fileName) {
    return 'source: (unknown)';
  }

  // Extract just the filename from the path
  const fileName = source.fileName.split('/').pop() ?? source.fileName;
  const location = source.columnNumber
    ? `${fileName}:${source.lineNumber}:${source.columnNumber}`
    : `${fileName}:${source.lineNumber}`;

  return `source:\n  ${location}`;
}

/**
 * Format context section
 */
function formatContext(context: Record<string, unknown> | null): string {
  if (!context || Object.keys(context).length === 0) {
    return '';
  }

  const lines: string[] = ['context:'];
  for (const [key, value] of Object.entries(context)) {
    lines.push(`  ${key}: ${formatValue(value, 1)}`);
  }
  return lines.join('\n');
}

/**
 * Format DOM path section
 */
function formatDomPath(domPath: DomPathInfo | null): string {
  if (!domPath) {
    return 'dom: (none)';
  }

  return `dom:\n  selector: ${domPath.selector}`;
}

/**
 * Format an inspected element as text output
 */
export function formatInspectedElement(result: InspectElementResult): string {
  const lines: string[] = [];

  // Header: ComponentName (#id)
  const name = result.name ?? 'Unknown';
  const envTag = result.env ? ` [${result.env}]` : '';
  lines.push(`${name} (#${result.id})${envTag}`);

  // Suspension status (show prominently if suspended)
  if (result.isSuspended === true) {
    lines.push('Status: SUSPENDED');
  }
  lines.push('');

  // Suspended by (BEFORE props — most important for debugging)
  if (result.suspendedBy && result.suspendedBy.length > 0) {
    lines.push(formatSuspendedBy(result.suspendedBy, result.unknownSuspendersReason));
    lines.push('');
  } else if (result.unknownSuspendersReason) {
    lines.push(formatSuspendedBy([], result.unknownSuspendersReason));
    lines.push('');
  }

  // Props section
  lines.push(formatProps(result.props));
  lines.push('');

  // Hooks section
  lines.push(formatHooks(result.hooks));
  lines.push('');

  // Context section (only if not empty)
  const contextSection = formatContext(result.context);
  if (contextSection) {
    lines.push(contextSection);
    lines.push('');
  }

  // Rendered-by chain (enriched)
  const rendererInfo = result.rendererPackageName && result.rendererVersion
    ? `${result.rendererPackageName}@${result.rendererVersion}`
    : null;
  lines.push(formatRenderedBy(result.owners, result.rootType, rendererInfo));
  lines.push('');

  // Source location
  lines.push(formatSource(result.source));
  lines.push('');

  // DOM path
  lines.push(formatDomPath(result.domPath));

  return lines.join('\n');
}

import type {InspectElementResult, HookInfo, OwnerInfo, DomPathInfo} from '../types';

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
 * Format rendered-by chain (owners)
 */
function formatRenderedBy(owners: OwnerInfo[]): string {
  if (owners.length === 0) {
    return 'rendered by: (root)';
  }

  const chain = owners
    .map((owner) => {
      const name = owner.displayName ?? 'Anonymous';
      return `${name} (#${owner.id})`;
    })
    .join(' > ');

  return `rendered by:\n  ${chain}`;
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
  lines.push(`${name} (#${result.id})`);
  lines.push('');

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

  // Rendered-by chain
  lines.push(formatRenderedBy(result.owners));
  lines.push('');

  // Source location
  lines.push(formatSource(result.source));
  lines.push('');

  // DOM path
  lines.push(formatDomPath(result.domPath));

  return lines.join('\n');
}

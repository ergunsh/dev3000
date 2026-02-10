import type {TreeNode, InspectedElementData} from '../types';

/**
 * Options for tree formatting
 */
export interface TreeFormatOptions {
  /** Map of element ID to inspected element data for inline props/hooks */
  inspectionData?: Map<number, InspectedElementData>;
}

/**
 * Format inline props as {key: value, ...} string
 */
function formatInlineProps(
  props: Record<string, unknown> | null,
  maxLength = 60
): string {
  if (!props || Object.keys(props).length === 0) {
    return '';
  }

  const entries: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    // Skip children prop as it's usually React elements
    if (key === 'children') continue;

    const formattedValue = formatValue(value);
    entries.push(`${key}: ${formattedValue}`);
  }

  if (entries.length === 0) {
    return '';
  }

  let result = `{${entries.join(', ')}}`;
  if (result.length > maxLength) {
    result = result.slice(0, maxLength - 3) + '...}';
  }
  return result;
}

/**
 * Format a single value for inline display
 */
function formatValue(value: unknown, maxLength = 20): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';

  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return `"${value.slice(0, maxLength - 3)}..."`;
    }
    return `"${value}"`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length > 3) {
      return `Array(${value.length})`;
    }
    const formatted = value.map((v) => formatValue(v, 10)).join(', ');
    return `[${formatted}]`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    if (keys.length > 2) return '{...}';
    const entries = keys.map((k) => `${k}: ${formatValue((value as Record<string, unknown>)[k], 10)}`);
    return `{${entries.join(', ')}}`;
  }

  if (typeof value === 'function') {
    return '() => {}';
  }

  return String(value).slice(0, maxLength);
}

/**
 * Get type badge for special component types
 */
function getTypeBadge(type: string): string {
  switch (type) {
    case 'Memo':
      return '[Memo]';
    case 'ForwardRef':
      return '[ForwardRef]';
    case 'Suspense':
      return '[Suspense]';
    case 'Context':
      return '[Context]';
    default:
      return '';
  }
}

/**
 * Render the ASCII tree structure
 */
function renderTree(
  nodes: TreeNode[],
  prefix: string,
  isLast: boolean[],
  options: TreeFormatOptions,
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

    // Get component info
    const name = node.name ?? 'Anonymous';
    const id = `(#${node.id})`;
    const typeBadge = getTypeBadge(node.type);

    // Get inline data if available
    let inlineProps = '';

    if (options.inspectionData) {
      const data = options.inspectionData.get(node.id);
      if (data) {
        inlineProps = formatInlineProps(
          data.props as Record<string, unknown> | null
        );
      }
    }

    // Build the line
    let line = `${prefix}${connector}${name} ${id}`;
    if (typeBadge) line += ` ${typeBadge}`;
    if (inlineProps) line += ` ${inlineProps}`;

    lines.push(line);

    // Recurse for children
    if (node.children.length > 0) {
      const newIsLast = [...isLast, isLastNode];
      renderTree(node.children, '', newIsLast, options, lines);
    }
  }
}

/**
 * Format a component tree as ASCII text output
 */
export function formatComponentTree(
  roots: TreeNode[],
  options: TreeFormatOptions = {}
): string {
  const lines: string[] = [];

  lines.push('=== Component Tree ===');
  lines.push('');

  // Render each root
  for (const root of roots) {
    const name = root.name ?? 'Root';
    const id = `(#${root.id})`;
    const typeBadge = getTypeBadge(root.type);

    let line = `${name} ${id}`;
    if (typeBadge) line += ` ${typeBadge}`;

    lines.push(line);

    if (root.children.length > 0) {
      renderTree(root.children, '', [], options, lines);
    }
  }

  return lines.join('\n');
}

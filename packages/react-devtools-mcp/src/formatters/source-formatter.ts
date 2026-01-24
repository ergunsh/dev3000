import type {FindComponentSourceResult} from '../types';

export function formatFindComponentSource(
  result: FindComponentSourceResult & {error?: string}
): string {
  const lines: string[] = [];

  // Handle error case
  if (result.error) {
    lines.push(`## Component Source`);
    lines.push(``);
    lines.push(`**Selector:** \`${result.selector}\``);
    lines.push(``);
    lines.push(`**Error:** ${result.error}`);
    return lines.join('\n');
  }

  lines.push(`## Component Source`);
  lines.push(``);
  lines.push(`**Selector:** \`${result.selector}\``);
  lines.push(`**Component:** ${result.componentName || 'Unknown'}`);
  lines.push(`**Element ID:** ${result.componentId}`);

  // Check if source has valid fileName and lineNumber
  const hasValidSource = result.source &&
    result.source.fileName !== undefined &&
    result.source.fileName !== null &&
    result.source.lineNumber !== undefined &&
    result.source.lineNumber !== null;

  if (hasValidSource) {
    const col = result.source!.columnNumber !== undefined ? `:${result.source!.columnNumber}` : '';
    lines.push(`**Source:** \`${result.source!.fileName}:${result.source!.lineNumber}${col}\``);
  } else {
    lines.push(`**Source:** Not available (production build?)`);
    // Fallback grep patterns for production builds
    if (result.componentName && result.componentName !== 'Unknown') {
      lines.push(``);
      lines.push(`### Search patterns:`);
      lines.push(`Since source maps are not available, try searching for the component:`);
      lines.push('```');
      lines.push(`grep -r "function ${result.componentName}" .`);
      lines.push(`grep -r "const ${result.componentName}" .`);
      lines.push(`grep -r "class ${result.componentName}" .`);
      lines.push('```');
    }
  }

  if (result.owners.length > 0) {
    lines.push(``);
    lines.push(`### Owner chain:`);
    lines.push(`\`${result.owners.join(' -> ')}\``);
  }

  return lines.join('\n');
}

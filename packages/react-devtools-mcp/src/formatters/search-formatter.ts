import type {SearchMatch} from '../types';

/**
 * Format search results as text output
 */
export function formatSearchResults(
  matches: SearchMatch[],
  totalCount: number,
  query: string
): string {
  if (totalCount === 0) {
    return `No components found matching "${query}".`;
  }

  const lines: string[] = [];

  // Summary line
  if (totalCount === 1) {
    lines.push(`Found 1 component matching "${query}":`);
  } else if (matches.length < totalCount) {
    lines.push(
      `Found ${totalCount} components matching "${query}" (showing first ${matches.length}):`
    );
  } else {
    lines.push(`Found ${totalCount} components matching "${query}":`);
  }

  lines.push('');

  // Numbered list of results
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const name = match.name ?? 'Anonymous';
    const id = `(#${match.id})`;

    // Build the path string
    const pathStr = match.path.length > 0 ? match.path.join(' > ') : 'root';

    lines.push(`${i + 1}. ${name} ${id} at ${pathStr}`);
  }

  lines.push('');
  lines.push('Use inspect(id) for details.');

  return lines.join('\n');
}

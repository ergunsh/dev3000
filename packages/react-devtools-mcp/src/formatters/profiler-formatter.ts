import type {ProfilingDataBackend, CommitDataBackend} from '../types';
import type {RendererBridge} from '../core/renderer-bridge';
import type {TreeStore} from '../core/tree-store';

/**
 * Format a duration in milliseconds to a human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 0.01) {
    return '<0.01ms';
  }
  if (ms < 1) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 10) {
    return `${ms.toFixed(1)}ms`;
  }
  return `${Math.round(ms)}ms`;
}

interface FiberDurationInfo {
  id: number;
  name: string;
  actualDuration: number;
  selfDuration: number;
  children: FiberDurationInfo[];
}

/**
 * Build a tree of fiber durations with parent-child relationships
 * using the TreeStore to determine hierarchy
 */
function buildDurationTree(
  commit: CommitDataBackend,
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): FiberDurationInfo[] {
  // Create a map of fiber ID to duration info
  const actualDurations = new Map<number, number>(commit.fiberActualDurations);
  const selfDurations = new Map<number, number>(commit.fiberSelfDurations);

  // Get all fiber IDs that have durations
  const fiberIds = new Set<number>();
  for (const [id] of commit.fiberActualDurations) {
    fiberIds.add(id);
  }
  for (const [id] of commit.fiberSelfDurations) {
    fiberIds.add(id);
  }

  // Build duration info for each fiber
  const durationInfoMap = new Map<number, FiberDurationInfo>();

  for (const id of fiberIds) {
    const name = rendererBridge.getDisplayName(id) ?? `Component #${id}`;
    const actualDuration = actualDurations.get(id) ?? 0;
    const selfDuration = selfDurations.get(id) ?? 0;

    durationInfoMap.set(id, {
      id,
      name,
      actualDuration,
      selfDuration,
      children: [],
    });
  }

  // Build tree structure using TreeStore
  const roots: FiberDurationInfo[] = [];
  const processed = new Set<number>();

  for (const id of fiberIds) {
    if (processed.has(id)) continue;

    const info = durationInfoMap.get(id)!;
    const element = treeStore.getElement(id);

    if (!element) {
      // Element not in tree store, add as root
      roots.push(info);
      processed.add(id);
      continue;
    }

    // Check if parent is in our duration set
    const parentId = element.parentID;
    if (parentId && fiberIds.has(parentId)) {
      // Parent is in the set, will be added as child later
      continue;
    }

    // This is a root in our duration tree
    buildChildrenRecursive(id, info, fiberIds, durationInfoMap, treeStore, processed);
    roots.push(info);
  }

  return roots;
}

function buildChildrenRecursive(
  parentId: number,
  parentInfo: FiberDurationInfo,
  fiberIds: Set<number>,
  durationInfoMap: Map<number, FiberDurationInfo>,
  treeStore: TreeStore,
  processed: Set<number>
): void {
  processed.add(parentId);

  const element = treeStore.getElement(parentId);
  if (!element) return;

  for (const childId of element.children) {
    if (!fiberIds.has(childId)) {
      // Child doesn't have duration data, but check its children
      const childElement = treeStore.getElement(childId);
      if (childElement) {
        // Recursively look for descendants with duration data
        for (const grandchildId of childElement.children) {
          if (fiberIds.has(grandchildId) && !processed.has(grandchildId)) {
            const grandchildInfo = durationInfoMap.get(grandchildId)!;
            buildChildrenRecursive(
              grandchildId,
              grandchildInfo,
              fiberIds,
              durationInfoMap,
              treeStore,
              processed
            );
            parentInfo.children.push(grandchildInfo);
          }
        }
      }
      continue;
    }

    if (processed.has(childId)) continue;

    const childInfo = durationInfoMap.get(childId)!;
    buildChildrenRecursive(
      childId,
      childInfo,
      fiberIds,
      durationInfoMap,
      treeStore,
      processed
    );
    parentInfo.children.push(childInfo);
  }
}

/**
 * Render duration tree as indented text
 */
function renderDurationTree(
  nodes: FiberDurationInfo[],
  indent: string,
  lines: string[]
): void {
  // Sort by actual duration descending
  const sorted = [...nodes].sort((a, b) => b.actualDuration - a.actualDuration);

  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    const isLast = i === sorted.length - 1;
    const connector = isLast ? '└─ ' : '├─ ';

    // Format duration info
    let durationStr = '';
    if (node.selfDuration > 0 && node.selfDuration !== node.actualDuration) {
      durationStr = `(self: ${formatDuration(node.selfDuration)}, total: ${formatDuration(node.actualDuration)})`;
    } else if (node.actualDuration > 0) {
      durationStr = `(${formatDuration(node.actualDuration)})`;
    }

    lines.push(`${indent}${connector}${node.name} ${durationStr}`.trimEnd());

    // Render children
    if (node.children.length > 0) {
      const childIndent = indent + (isLast ? '   ' : '│  ');
      renderDurationTree(node.children, childIndent, lines);
    }
  }
}

/**
 * Format profiling data as human-readable text output
 */
export function formatProfilingData(
  data: ProfilingDataBackend,
  treeStore: TreeStore,
  rendererBridge: RendererBridge
): string {
  const lines: string[] = [];

  // Count total commits across all roots
  let totalCommits = 0;
  for (const root of data.dataForRoots) {
    totalCommits += root.commitData.length;
  }

  if (totalCommits === 0) {
    return 'Profiling Results (0 commits captured)\n\nNo renders were recorded during the profiling session.\nTry interacting with the application to trigger re-renders.';
  }

  lines.push(`=== Profiling Results (${totalCommits} commit${totalCommits === 1 ? '' : 's'} captured) ===`);
  lines.push('');

  // Process each root
  for (const rootData of data.dataForRoots) {
    if (rootData.commitData.length === 0) continue;

    if (rootData.displayName) {
      lines.push(`Root: ${rootData.displayName}`);
      lines.push('');
    }

    // Process each commit
    for (let i = 0; i < rootData.commitData.length; i++) {
      const commit = rootData.commitData[i];
      const commitNum = i + 1;

      // Commit header
      let headerParts = [`Commit ${commitNum}`];
      if (commit.duration > 0) {
        headerParts.push(`${formatDuration(commit.duration)} total`);
      }
      if (commit.priorityLevel) {
        headerParts.push(`priority: ${commit.priorityLevel}`);
      }

      lines.push(headerParts.join(' | '));

      // Build and render duration tree
      const durationTree = buildDurationTree(commit, treeStore, rendererBridge);

      if (durationTree.length > 0) {
        renderDurationTree(durationTree, '', lines);
      } else if (commit.fiberActualDurations.length > 0) {
        // Fallback: if tree building failed, show flat list
        lines.push('  Components rendered:');
        const sorted = [...commit.fiberActualDurations].sort(
          (a, b) => b[1] - a[1]
        );
        for (const [fiberId, duration] of sorted.slice(0, 10)) {
          const name = rendererBridge.getDisplayName(fiberId) ?? `#${fiberId}`;
          const selfDuration = commit.fiberSelfDurations.find(
            ([id]) => id === fiberId
          )?.[1];

          let durationStr = formatDuration(duration);
          if (selfDuration !== undefined && selfDuration !== duration) {
            durationStr = `self: ${formatDuration(selfDuration)}, total: ${durationStr}`;
          }

          lines.push(`    ${name} (${durationStr})`);
        }
        if (sorted.length > 10) {
          lines.push(`    ... and ${sorted.length - 10} more`);
        }
      }

      lines.push('');
    }
  }

  // Add summary
  lines.push('=== Summary ===');
  lines.push(`Total commits: ${totalCommits}`);

  // Calculate total render time
  let totalTime = 0;
  for (const root of data.dataForRoots) {
    for (const commit of root.commitData) {
      totalTime += commit.duration;
    }
  }
  lines.push(`Total render time: ${formatDuration(totalTime)}`);

  return lines.join('\n');
}

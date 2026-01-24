import {ElementTypeRoot} from '../types';

// Tree operation constants from react-devtools-shared/src/constants.js
const TREE_OPERATION_ADD = 1;
const TREE_OPERATION_REMOVE = 2;
const TREE_OPERATION_REORDER_CHILDREN = 3;
const TREE_OPERATION_UPDATE_TREE_BASE_DURATION = 4;
const TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS = 5;
const TREE_OPERATION_REMOVE_ROOT = 6;
const TREE_OPERATION_SET_SUBTREE_MODE = 7;
const SUSPENSE_TREE_OPERATION_ADD = 8;
const SUSPENSE_TREE_OPERATION_REMOVE = 9;
const SUSPENSE_TREE_OPERATION_REORDER_CHILDREN = 10;
const SUSPENSE_TREE_OPERATION_RESIZE = 11;
const SUSPENSE_TREE_OPERATION_SUSPENDERS = 12;
const TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE = 13;

export interface AddOperation {
  type: 'add';
  id: number;
  elementType: number;
  parentID: number;
  ownerID: number;
  displayName: string | null;
  key: string | number | null;
  hocDisplayNames: string[] | null;
  compiledWithForget: boolean;
}

export interface RemoveOperation {
  type: 'remove';
  ids: number[];
}

export interface RemoveRootOperation {
  type: 'removeRoot';
  id: number;
}

export interface ReorderChildrenOperation {
  type: 'reorderChildren';
  id: number;
  children: number[];
}

export interface UpdateErrorsWarningsOperation {
  type: 'updateErrorsWarnings';
  id: number;
  errorCount: number;
  warningCount: number;
}

export type ParsedOperation =
  | AddOperation
  | RemoveOperation
  | RemoveRootOperation
  | ReorderChildrenOperation
  | UpdateErrorsWarningsOperation;

export interface ParsedOperations {
  rendererID: number;
  rootID: number;
  stringTable: (string | null)[];
  operations: ParsedOperation[];
}

/**
 * Decode a UTF-16 string from operations array with range handling
 */
function utfDecodeStringWithRanges(
  operations: number[],
  start: number,
  end: number
): string {
  let result = '';
  for (let i = start; i <= end; i++) {
    result += String.fromCodePoint(operations[i]);
  }
  return result;
}

/**
 * Parse element display name to extract HOC wrappers and Forget compilation
 */
function parseElementDisplayName(
  displayName: string | null,
  _type: number
): {
  formattedDisplayName: string | null;
  hocDisplayNames: string[] | null;
  compiledWithForget: boolean;
} {
  if (displayName === null) {
    return {
      formattedDisplayName: null,
      hocDisplayNames: null,
      compiledWithForget: false,
    };
  }

  let formattedDisplayName = displayName;
  let hocDisplayNames: string[] | null = null;
  let compiledWithForget = false;

  // Check for Forget compilation marker
  if (formattedDisplayName.startsWith('Forget(')) {
    compiledWithForget = true;
    formattedDisplayName = formattedDisplayName.slice(7, -1);
  }

  // Extract HOC display names (e.g., "Memo(ForwardRef(Component))")
  const hocMatches: string[] = [];
  let current = formattedDisplayName;

  while (true) {
    const match = /^(\w+)\((.*)\)$/.exec(current);
    if (match && match[1] !== current) {
      const wrapper = match[1];
      // Known HOC wrappers
      if (['Memo', 'ForwardRef', 'Lazy'].includes(wrapper)) {
        hocMatches.push(wrapper);
        current = match[2];
      } else {
        break;
      }
    } else {
      break;
    }
  }

  if (hocMatches.length > 0) {
    hocDisplayNames = hocMatches;
    formattedDisplayName = current;
  }

  return {
    formattedDisplayName,
    hocDisplayNames,
    compiledWithForget,
  };
}

/**
 * Parse operations array from DevTools hook into structured operations
 */
export function parseOperations(operations: number[]): ParsedOperations {
  const result: ParsedOperations = {
    rendererID: operations[0],
    rootID: operations[1],
    stringTable: [null],
    operations: [],
  };

  let i = 2;

  // Parse string table
  const stringTableSize = operations[i];
  i++;

  const stringTableEnd = i + stringTableSize;

  while (i < stringTableEnd) {
    const nextLength = operations[i];
    i++;

    const nextString = utfDecodeStringWithRanges(
      operations,
      i,
      i + nextLength - 1
    );
    result.stringTable.push(nextString);
    i += nextLength;
  }

  // Parse operations
  while (i < operations.length) {
    const operation = operations[i];

    switch (operation) {
      case TREE_OPERATION_ADD: {
        const id = operations[i + 1];
        const elementType = operations[i + 2];

        i += 3;

        if (elementType === ElementTypeRoot) {
          // Root element has different structure
          // const isStrictModeCompliant = operations[i] > 0;
          i++;

          // const profilerFlags = operations[i];
          i++;

          // Protocol version 2+ fields
          // const supportsStrictMode = operations[i] > 0;
          i++;

          // const hasOwnerMetadata = operations[i] > 0;
          i++;

          result.operations.push({
            type: 'add',
            id,
            elementType,
            parentID: 0,
            ownerID: 0,
            displayName: null,
            key: null,
            hocDisplayNames: null,
            compiledWithForget: false,
          });
        } else {
          const parentID = operations[i];
          i++;

          const ownerID = operations[i];
          i++;

          const displayNameStringID = operations[i];
          const displayName = result.stringTable[displayNameStringID];
          i++;

          const keyStringID = operations[i];
          const key = result.stringTable[keyStringID];
          i++;

          // nameProp (for Activity/Suspense boundaries)
          // const namePropStringID = operations[i];
          i++;

          const {formattedDisplayName, hocDisplayNames, compiledWithForget} =
            parseElementDisplayName(displayName, elementType);

          result.operations.push({
            type: 'add',
            id,
            elementType,
            parentID,
            ownerID,
            displayName: formattedDisplayName,
            key,
            hocDisplayNames,
            compiledWithForget,
          });
        }
        break;
      }

      case TREE_OPERATION_REMOVE: {
        const removeLength = operations[i + 1];
        i += 2;

        const ids: number[] = [];
        for (let j = 0; j < removeLength; j++) {
          ids.push(operations[i]);
          i++;
        }

        result.operations.push({
          type: 'remove',
          ids,
        });
        break;
      }

      case TREE_OPERATION_REMOVE_ROOT: {
        i++;
        result.operations.push({
          type: 'removeRoot',
          id: result.rootID,
        });
        break;
      }

      case TREE_OPERATION_REORDER_CHILDREN: {
        const id = operations[i + 1];
        const numChildren = operations[i + 2];
        i += 3;

        const children: number[] = [];
        for (let j = 0; j < numChildren; j++) {
          children.push(operations[i + j]);
        }
        i += numChildren;

        result.operations.push({
          type: 'reorderChildren',
          id,
          children,
        });
        break;
      }

      case TREE_OPERATION_UPDATE_TREE_BASE_DURATION:
        // Skip profiling data: id, baseDuration
        i += 3;
        break;

      case TREE_OPERATION_UPDATE_ERRORS_OR_WARNINGS: {
        const id = operations[i + 1];
        const errorCount = operations[i + 2];
        const warningCount = operations[i + 3];
        i += 4;

        result.operations.push({
          type: 'updateErrorsWarnings',
          id,
          errorCount,
          warningCount,
        });
        break;
      }

      case TREE_OPERATION_SET_SUBTREE_MODE:
        // Skip subtree mode: id, mode
        i += 3;
        break;

      case SUSPENSE_TREE_OPERATION_ADD: {
        // Skip Suspense tree add operation
        // Format: id, parentID, nameStringID, isSuspended, numRects
        const numRects = operations[i + 5];
        i += 6;
        // Skip rect data if present (4 values per rect: x, y, width, height)
        if (numRects !== -1) {
          i += numRects * 4;
        }
        break;
      }

      case SUSPENSE_TREE_OPERATION_REMOVE: {
        // Skip Suspense tree remove operation
        // Format: removeLength, then removeLength ids
        const removeLength = operations[i + 1];
        i += 2 + removeLength;
        break;
      }

      case SUSPENSE_TREE_OPERATION_REORDER_CHILDREN: {
        // Skip Suspense tree reorder operation
        // Format: id, numChildren, then numChildren ids
        const numChildren = operations[i + 2];
        i += 3 + numChildren;
        break;
      }

      case SUSPENSE_TREE_OPERATION_RESIZE: {
        // Skip Suspense tree resize operation
        // Format: id, numRects, then numRects * 4 values
        const numRects = operations[i + 2];
        i += 3;
        if (numRects !== -1) {
          i += numRects * 4;
        }
        break;
      }

      case SUSPENSE_TREE_OPERATION_SUSPENDERS: {
        // Skip Suspense tree suspenders operation
        // Format: changeLength, then for each change:
        //   id, hasUniqueSuspenders, endTime, isSuspended, environmentNamesLength, environmentNames...
        i++;
        const changeLength = operations[i++];

        for (let changeIndex = 0; changeIndex < changeLength; changeIndex++) {
          i++; // id
          i++; // hasUniqueSuspenders
          i++; // endTime
          i++; // isSuspended
          const environmentNamesLength = operations[i++];
          i += environmentNamesLength; // skip environment name string IDs
        }
        break;
      }

      case TREE_OPERATION_APPLIED_ACTIVITY_SLICE_CHANGE:
        // Skip activity slice change: nextActivitySliceID
        i += 2;
        break;

      default:
        // Unknown operation - this should not happen if we've implemented all operations
        // Log but don't break the parser - just skip one value and hope for the best
        console.warn(
          `[react-devtools-mcp] Unknown operation type: ${operation} at index ${i}`
        );
        i++;
        break;
    }
  }

  return result;
}

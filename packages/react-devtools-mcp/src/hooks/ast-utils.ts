/**
 * AST utilities for extracting hook variable names from source code.
 *
 * This module is ported from React DevTools' astUtils.js and provides
 * the core logic for finding hook declarations in an AST and extracting
 * the variable names they're assigned to.
 */

import traverse from '@babel/traverse';
import type {HookSource} from '../types';

// AST node types we care about
const AST_NODE_TYPES = {
  PROGRAM: 'Program',
  CALL_EXPRESSION: 'CallExpression',
  MEMBER_EXPRESSION: 'MemberExpression',
  ARRAY_PATTERN: 'ArrayPattern',
  IDENTIFIER: 'Identifier',
  NUMERIC_LITERAL: 'NumericLiteral',
  VARIABLE_DECLARATOR: 'VariableDeclarator',
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NodePath = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

/**
 * Check if line number matches the AST node location
 */
function checkNodeLocation(
  path: NodePath,
  line: number,
  column: number | null = null
): boolean {
  const {start, end} = path.node.loc;

  if (line !== start.line) {
    return false;
  }

  if (column !== null) {
    // Column numbers: AST is 0-based, Error stack is 1-based
    // Adjust for this difference
    const adjustedColumn = column - 1;
    if (
      (line === start.line && adjustedColumn < start.column) ||
      (line === end.line && adjustedColumn > end.column)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a hook name identifier matches React Hook naming convention
 */
function isHookName(name: string): boolean {
  return /^use[A-Z0-9]/.test(name);
}

/**
 * Check if a node represents a Hook call
 */
function isHook(node: Node): boolean {
  if (node.type === AST_NODE_TYPES.IDENTIFIER) {
    return isHookName(node.name);
  }

  if (
    node.type === AST_NODE_TYPES.MEMBER_EXPRESSION &&
    !node.computed &&
    isHook(node.property)
  ) {
    const obj = node.object;
    // Allow React.useState, etc.
    const isPascalCaseNamespace = /^[A-Z]/;
    return (
      obj.type === AST_NODE_TYPES.IDENTIFIER &&
      isPascalCaseNamespace.test(obj.name)
    );
  }

  return false;
}

/**
 * Check if path contains a hook declaration
 */
function isConfirmedHookDeclaration(path: NodePath): boolean {
  const nodeInit = path.node.init;
  if (nodeInit == null || nodeInit.type !== AST_NODE_TYPES.CALL_EXPRESSION) {
    return false;
  }
  const callee = nodeInit.callee;
  return isHook(callee);
}

/**
 * Check if the declaration is a potential hook (could be hook-related)
 */
function isPotentialHookDeclaration(path: NodePath): boolean {
  const nodePathInit = path.node.init;
  if (nodePathInit != null) {
    if (nodePathInit.type === AST_NODE_TYPES.CALL_EXPRESSION) {
      const callee = nodePathInit.callee;
      return isHook(callee);
    }

    if (
      nodePathInit.type === AST_NODE_TYPES.MEMBER_EXPRESSION ||
      nodePathInit.type === AST_NODE_TYPES.IDENTIFIER
    ) {
      // Could be referencing a hook result: const [a, b] = hookResult
      return true;
    }
  }
  return false;
}

/**
 * Check if this is React.useState, React.useReducer, or React.useTransition
 */
function isReactFunction(node: Node, functionName: string): boolean {
  return (
    node.name === functionName ||
    (node.type === 'MemberExpression' &&
      node.object.name === 'React' &&
      node.property.name === functionName)
  );
}

/**
 * Check if path is a built-in hook that returns a tuple
 */
function isBuiltInHookThatReturnsTuple(path: NodePath): boolean {
  const callee = path.node.init.callee;
  return (
    isReactFunction(callee, 'useState') ||
    isReactFunction(callee, 'useReducer') ||
    isReactFunction(callee, 'useTransition') ||
    isReactFunction(callee, 'useActionState') ||
    isReactFunction(callee, 'useFormState')
  );
}

/**
 * Check if the hook node contains an obvious variable name
 */
function nodeContainsHookVariableName(hookNode: NodePath): boolean {
  const node = hookNode.node.id;
  if (
    node.type === AST_NODE_TYPES.ARRAY_PATTERN ||
    (node.type === AST_NODE_TYPES.IDENTIFIER &&
      !isBuiltInHookThatReturnsTuple(hookNode))
  ) {
    return true;
  }
  return false;
}

/**
 * Extract variable name from a hook declaration path
 */
function getHookVariableName(
  hook: NodePath,
  isCustomHook: boolean = false
): string | null {
  const nodeType = hook.node.id.type;
  switch (nodeType) {
    case AST_NODE_TYPES.ARRAY_PATTERN:
      // const [count, setCount] = useState(0) -> extract "count"
      // For custom hooks, we don't extract from array patterns
      return !isCustomHook ? (hook.node.id.elements[0]?.name ?? null) : null;

    case AST_NODE_TYPES.IDENTIFIER:
      // const count = useSomething() -> extract "count"
      return hook.node.id.name;

    default:
      return null;
  }
}

/**
 * Check if hookNode is accessing a member of targetHookNode
 */
function filterMemberNodesOfTargetHook(
  targetHookNode: NodePath,
  hookNode: NodePath
): boolean {
  const targetHookName = targetHookNode.node.id.name;
  return (
    targetHookName != null &&
    (targetHookName ===
      (hookNode.node.init.object && hookNode.node.init.object.name) ||
      targetHookName === hookNode.node.init.name)
  );
}

/**
 * Check if hook is accessing the first element (index 0)
 */
function filterMemberWithHookVariableName(hook: NodePath): boolean {
  return (
    hook.node.init.property.type === AST_NODE_TYPES.NUMERIC_LITERAL &&
    hook.node.init.property.value === 0
  );
}

/**
 * Get AST nodes associated with a hook declaration
 */
function getFilteredHookASTNodes(
  potentialReactHookASTNode: NodePath,
  potentialHooksFound: NodePath[]
): NodePath[] {
  if (nodeContainsHookVariableName(potentialReactHookASTNode)) {
    // Direct hook declaration: const [count, setCount] = useState(0)
    return [potentialReactHookASTNode];
  }

  // Indirect: const state = useState(0); const count = state[0];
  return potentialHooksFound.filter((hookNode) =>
    filterMemberNodesOfTargetHook(potentialReactHookASTNode, hookNode)
  );
}

/**
 * Get all potential hook declarations from an AST
 */
function getPotentialHookDeclarationsFromAST(sourceAST: unknown): NodePath[] {
  const potentialHooksFound: NodePath[] = [];

  traverse(sourceAST as Node, {
    enter(path: NodePath) {
      if (path.isVariableDeclarator() && isPotentialHookDeclaration(path)) {
        potentialHooksFound.push(path);
      }
    },
  });

  return potentialHooksFound;
}

/**
 * Extract hook name from associated AST nodes
 */
function getHookNameFromNode(
  originalHook: {name: string; hookSource: HookSource},
  nodesAssociatedWithReactHookASTNode: NodePath[],
  potentialReactHookASTNode: NodePath
): string | null {
  // Custom hooks have id === null in the DevTools representation
  // We determine this based on whether it's a built-in hook name
  const isCustomHook = !['State', 'Reducer', 'Ref', 'Memo', 'Callback', 'Context', 'Effect', 'LayoutEffect', 'ImperativeHandle', 'DebugValue', 'DeferredValue', 'Transition', 'Id', 'SyncExternalStore', 'InsertionEffect', 'Optimistic', 'FormState', 'ActionState'].includes(originalHook.name);

  switch (nodesAssociatedWithReactHookASTNode.length) {
    case 1:
      // Direct declaration or single reference
      if (
        isCustomHook &&
        nodesAssociatedWithReactHookASTNode[0] === potentialReactHookASTNode
      ) {
        return getHookVariableName(potentialReactHookASTNode, isCustomHook);
      }
      return getHookVariableName(nodesAssociatedWithReactHookASTNode[0]);

    case 2:
      // Two references: const state = useState(0); const a = state[0]; const b = state[1];
      const filtered = nodesAssociatedWithReactHookASTNode.filter((hookPath) =>
        filterMemberWithHookVariableName(hookPath)
      );

      if (filtered.length !== 1) {
        return getHookVariableName(potentialReactHookASTNode);
      }
      return getHookVariableName(filtered[0]);

    default:
      // 0 or > 2 references - use the original declaration
      return getHookVariableName(potentialReactHookASTNode);
  }
}

/**
 * Get the hook variable name from source code.
 *
 * @param hook - The hook data from DevTools
 * @param originalSourceAST - Parsed AST of the source file
 * @param _originalSourceCode - Source code string (unused, kept for API compatibility)
 * @param originalSourceLineNumber - Line number in the original source (1-based)
 * @param originalSourceColumnNumber - Column number in the original source (0-based)
 * @returns The extracted variable name, or null if not found
 */
export function getHookName(
  hook: {name: string; hookSource: HookSource},
  originalSourceAST: unknown,
  _originalSourceCode: string,
  originalSourceLineNumber: number,
  originalSourceColumnNumber: number
): string | null {
  // Get all potential hook declarations from the AST
  const hooksFromAST = getPotentialHookDeclarationsFromAST(originalSourceAST);

  let potentialReactHookASTNode: NodePath | null = null;

  if (originalSourceColumnNumber === 0) {
    // Column 0 might indicate source maps without column info
    // Try to find a unique match on this line
    const matchingNodes = hooksFromAST.filter((node) => {
      const nodeLocationCheck = checkNodeLocation(node, originalSourceLineNumber);
      const hookDeclarationCheck = isConfirmedHookDeclaration(node);
      return nodeLocationCheck && hookDeclarationCheck;
    });

    if (matchingNodes.length === 1) {
      potentialReactHookASTNode = matchingNodes[0];
    }
  } else {
    // Find the hook declaration at this specific location
    potentialReactHookASTNode =
      hooksFromAST.find((node) => {
        const nodeLocationCheck = checkNodeLocation(
          node,
          originalSourceLineNumber,
          originalSourceColumnNumber
        );
        const hookDeclarationCheck = isConfirmedHookDeclaration(node);
        return nodeLocationCheck && hookDeclarationCheck;
      }) ?? null;
  }

  if (!potentialReactHookASTNode) {
    return null;
  }

  try {
    // Get associated AST nodes
    const nodesAssociatedWithReactHookASTNode = getFilteredHookASTNodes(
      potentialReactHookASTNode,
      hooksFromAST
    );

    // Extract the hook name
    return getHookNameFromNode(
      hook,
      nodesAssociatedWithReactHookASTNode,
      potentialReactHookASTNode
    );
  } catch (error) {
    console.warn('[getHookName] Error extracting hook name:', error);
    return null;
  }
}

/**
 * Babel parser wrapper for parsing JavaScript/TypeScript source code.
 *
 * This module provides a thin wrapper around @babel/parser for use
 * in hook name parsing. It handles common source formats and error cases.
 */

import {parse, ParserOptions} from '@babel/parser';

/**
 * Parse source code to an AST.
 * Automatically detects Flow vs TypeScript based on source content.
 */
export function parseSource(sourceCode: string): unknown {
  // Detect if source uses Flow (via @flow pragma)
  const isFlow = sourceCode.includes('@flow');
  const plugin = isFlow ? 'flow' : 'typescript';

  const options: ParserOptions = {
    sourceType: 'unambiguous',
    plugins: [
      'jsx',
      plugin,
      // Common additional syntax
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'decorators-legacy',
      'dynamicImport',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'nullishCoalescingOperator',
      'numericSeparator',
      'objectRestSpread',
      'optionalCatchBinding',
      'optionalChaining',
    ],
    errorRecovery: true,
  };

  try {
    return parse(sourceCode, options);
  } catch (error) {
    // Try without TypeScript/Flow plugin if it fails
    try {
      return parse(sourceCode, {
        ...options,
        plugins: ['jsx'],
      });
    } catch {
      // Return the original error
      throw error;
    }
  }
}

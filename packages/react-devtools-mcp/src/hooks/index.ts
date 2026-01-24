/**
 * Hook name parsing module
 *
 * This module provides functionality to parse hook variable names from source code.
 * It fetches source files, parses source maps, and uses AST traversal to extract
 * the variable names assigned to hook calls.
 */

export {parseHookNames, clearSourceCache} from './parse-hook-names';
export {createSourceMapConsumer} from './source-map-consumer';
export type {SourceMapConsumer} from './source-map-consumer';
export {parseSource} from './babel-parser';
export {getHookName} from './ast-utils';

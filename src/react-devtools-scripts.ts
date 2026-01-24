/**
 * React DevTools MCP Scripts Loader
 *
 * This module provides the React DevTools injection scripts that enable
 * component tree inspection, element inspection, and error tracking.
 *
 * Two scripts are required:
 * 1. Prepend script - Must be injected BEFORE React loads (installs the DevTools hook)
 * 2. Main script - Injected AFTER React mounts (provides the tools API)
 */

import { existsSync, readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Store error for debugging
let lastScriptError: string | null = null

export function getLastScriptError(): string | null {
  return lastScriptError
}

// Cache for the loaded scripts
let prependScriptCache: string | null = null
let mainScriptCache: string | null = null

/**
 * Get the path to the react-devtools-mcp dist directory.
 *
 * In development: Uses __dirname relative path
 * In compiled binary: Uses process.execPath to find the binary location,
 * then navigates to packages/react-devtools-mcp/dist relative to that.
 */
function getReactDevToolsDistPath(): string {
  // First try: relative to __dirname (works in development)
  const devPath = join(__dirname, "..", "packages", "react-devtools-mcp", "dist")
  if (existsSync(devPath)) {
    return devPath
  }

  // Second try: relative to the compiled binary location
  // In Bun compiled binaries, process.execPath points to the actual binary on disk
  // The packages directory is a sibling to the bin directory
  const execDir = dirname(process.execPath)
  const binParentDir = dirname(execDir) // Go up from bin/ to the package root
  const prodPath = join(binParentDir, "packages", "react-devtools-mcp", "dist")
  if (existsSync(prodPath)) {
    return prodPath
  }

  // Return dev path for error messaging (will fail with clear path)
  return `${devPath} (also tried: ${prodPath})`
}

/**
 * Load the prepend script that installs the React DevTools hook.
 * This script MUST be injected before React loads using
 * Page.addScriptToEvaluateOnNewDocument CDP command.
 *
 * @returns The prepend script content as a string
 * @throws Error if the script file cannot be read
 */
export function getReactDevToolsPrependScript(): string {
  if (prependScriptCache) {
    return prependScriptCache
  }

  const scriptPath = join(getReactDevToolsDistPath(), "react-devtools-mcp-prepend.iife.js")

  try {
    prependScriptCache = readFileSync(scriptPath, "utf-8")
    return prependScriptCache
  } catch (error) {
    throw new Error(
      `Failed to load React DevTools prepend script from ${scriptPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Load the main script that provides the React DevTools tools API.
 * This script should be injected AFTER React has mounted using
 * Runtime.evaluate CDP command.
 *
 * After injection, tools are available at:
 * - globalThis.__REACT_DEVTOOLS_MCP__.tools.react_get_component_tree
 * - globalThis.__REACT_DEVTOOLS_MCP__.tools.react_inspect_element
 * - globalThis.__REACT_DEVTOOLS_MCP__.tools.react_search_components
 * - globalThis.__REACT_DEVTOOLS_MCP__.tools.react_find_component_source
 *
 * @returns The main script content as a string
 * @throws Error if the script file cannot be read
 */
export function getReactDevToolsMainScript(): string {
  if (mainScriptCache) {
    return mainScriptCache
  }

  const scriptPath = join(getReactDevToolsDistPath(), "react-devtools-mcp.iife.js")

  try {
    mainScriptCache = readFileSync(scriptPath, "utf-8")
    return mainScriptCache
  } catch (error) {
    throw new Error(
      `Failed to load React DevTools main script from ${scriptPath}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Check if the React DevTools scripts are available
 *
 * @returns true if both scripts can be loaded, false otherwise
 */
export function areReactDevToolsScriptsAvailable(): boolean {
  try {
    lastScriptError = null
    getReactDevToolsPrependScript()
    getReactDevToolsMainScript()
    return true
  } catch (error) {
    lastScriptError = error instanceof Error ? error.message : String(error)
    return false
  }
}

/**
 * Clear the script cache (useful for testing or hot reloading)
 */
export function clearReactDevToolsScriptCache(): void {
  prependScriptCache = null
  mainScriptCache = null
}

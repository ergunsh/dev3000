#!/usr/bin/env npx tsx
/**
 * Development script to test react-devtools-mcp in Chrome DevTools console.
 *
 * Usage:
 *   npx tsx scripts/run.ts
 *   # or
 *   npm run start
 *
 * This script:
 * 1. Builds the project (both prepend and main scripts)
 * 2. Starts the sample React app
 * 3. Launches Chrome with Playwright
 * 4. Injects the prepend script (before React loads)
 * 5. Navigates to the sample app
 * 6. Injects the main script (after React loads)
 * 7. Leaves the browser open for you to interact with DevTools
 */

import {spawn, execSync} from 'child_process';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {chromium} from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const sampleAppDir = path.join(rootDir, 'sample-app');

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logStep(step: number, message: string) {
  log(`\n[${step}] ${message}`, COLORS.cyan + COLORS.bright);
}

function logSuccess(message: string) {
  log(`✓ ${message}`, COLORS.green);
}

async function build() {
  logStep(1, 'Building react-devtools-mcp...');

  try {
    execSync('npm run build', {
      cwd: rootDir,
      stdio: 'pipe',
    });
    logSuccess('Build completed');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

function readScript(filename: string): string {
  const filepath = path.join(distDir, filename);
  if (!fs.existsSync(filepath)) {
    console.error(`Script not found: ${filepath}`);
    process.exit(1);
  }
  return fs.readFileSync(filepath, 'utf-8');
}

function startSampleApp(): Promise<ReturnType<typeof spawn>> {
  return new Promise((resolve, reject) => {
    logStep(2, 'Starting sample React app...');

    const child = spawn('npm', ['run', 'dev'], {
      cwd: sampleAppDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let resolved = false;

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Local:') && !resolved) {
        resolved = true;
        logSuccess('Sample app started at http://localhost:5173');
        resolve(child);
      }
    };

    child.stdout?.on('data', handleOutput);
    child.stderr?.on('data', handleOutput);

    child.on('error', (err) => {
      if (!resolved) {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (!resolved && code !== 0) {
        reject(new Error(`Sample app exited with code ${code}`));
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        logSuccess('Sample app should be starting at http://localhost:5173');
        resolve(child);
      }
    }, 10000);
  });
}

async function launchBrowser() {
  logStep(3, 'Launching Chrome with Playwright...');

  const prependScript = readScript('react-devtools-mcp-prepend.iife.js');
  const mainScript = readScript('react-devtools-mcp.iife.js');

  // Launch browser with devtools open
  const browser = await chromium.launch({
    headless: false,
    devtools: true,
    args: [
      '--auto-open-devtools-for-tabs',
    ],
  });

  const context = await browser.newContext({
    viewport: {width: 1280, height: 800},
  });

  const page = await context.newPage();

  // Inject prepend script BEFORE page loads (this installs the DevTools hook)
  await page.addInitScript(prependScript);
  logSuccess('Prepend script injected (DevTools hook installed)');

  // Navigate to the sample app
  logStep(4, 'Navigating to sample app...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#root');
  logSuccess('Sample app loaded');

  // Inject main script AFTER React has mounted
  logStep(5, 'Injecting main script...');
  await page.evaluate(mainScript);

  // Wait for tools to be available
  await page.waitForFunction(
    () => (globalThis as unknown as {tools?: {react_inspect_element?: unknown}}).tools?.react_inspect_element
  );
  logSuccess('Main script injected - tools are ready!');

  return {browser, context, page};
}

function printInstructions() {
  log('\n' + '='.repeat(70), COLORS.yellow);
  log('  READY! Tools are available in the Console', COLORS.yellow + COLORS.bright);
  log('='.repeat(70), COLORS.yellow);

  log('\nThe browser is ready with react-devtools-mcp loaded.', COLORS.bright);
  log('Open the Console tab in DevTools and try these commands:\n', COLORS.dim);

  log('  // Get the component tree', COLORS.dim);
  log('  await tools.react_get_component_tree.handler({})', COLORS.green);

  log('\n  // Search for components by name', COLORS.dim);
  log('  await tools.react_search_components.handler({ query: "Counter" })', COLORS.green);

  log('\n  // Inspect a specific component (use ID from search/tree)', COLORS.dim);
  log('  await tools.react_inspect_element.handler({ id: 3 })', COLORS.green);

  log('\n  // Find source file for a DOM element', COLORS.dim);
  log('  await tools.react_find_component_source.handler({ selector: ".my-button" })', COLORS.green);

  log('\n' + '-'.repeat(70), COLORS.dim);
  log('  QUICK START - paste this in Console:', COLORS.yellow + COLORS.bright);
  log('-'.repeat(70), COLORS.dim);

  const quickStart = `
// Find all Counter components and inspect the first one
const search = await tools.react_search_components.handler({ query: "Counter" });
console.log("Found:", search.matches.map(m => m.name));

const details = await tools.react_inspect_element.handler({ id: search.matches[0].id });
console.log("Props:", details.props);
console.log("Hooks:", details.hooks);
`;

  log(quickStart, COLORS.cyan);

  log('='.repeat(70), COLORS.yellow);
  log('\nClose the browser window or press Ctrl+C to exit\n', COLORS.dim);
}

async function main() {
  log('\n' + '='.repeat(70), COLORS.blue);
  log('  REACT DEVTOOLS MCP - Development Runner', COLORS.blue + COLORS.bright);
  log('='.repeat(70), COLORS.blue);

  // Build the project
  await build();

  // Start the sample app
  const serverProcess = await startSampleApp();

  // Launch browser and inject scripts
  const {browser} = await launchBrowser();

  // Print instructions
  printInstructions();

  // Handle cleanup
  const cleanup = () => {
    log('\nShutting down...', COLORS.dim);
    serverProcess.kill();
    browser.close().catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Wait for browser to close
  browser.on('disconnected', () => {
    log('\nBrowser closed', COLORS.dim);
    cleanup();
  });

  // Keep the script running
  await new Promise(() => {});
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

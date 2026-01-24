import {defineConfig} from 'vite';
import {resolve} from 'path';

// Support building different entry points via environment variable
const entry = process.env.VITE_ENTRY || 'main';

const entries: Record<string, {entry: string; name: string; fileName: string}> =
  {
    main: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ReactDevToolsMCP',
      fileName: 'react-devtools-mcp',
    },
    prepend: {
      entry: resolve(__dirname, 'src/prepend.ts'),
      name: 'ReactDevToolsMCPPrepend',
      fileName: 'react-devtools-mcp-prepend',
    },
  };

const config = entries[entry] || entries.main;

export default defineConfig({
  define: {
    // Polyfill process.env for browser environment (needed by @babel/traverse)
    'process.env': JSON.stringify({}),
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: config.entry,
      name: config.name,
      fileName: config.fileName,
      formats: ['iife'],
    },
    rollupOptions: {
      // React is used by react-devtools-inline but should come from the page
      external: ['react'],
      output: {
        extend: true,
        // For prepend: use empty stub (React not loaded yet)
        // For main: use window.React (React is loaded by the app)
        globals: {
          react: entry === 'prepend' ? '{}' : 'window.React',
        },
      },
    },
    minify: true,
    sourcemap: true,
    outDir: 'dist',
    // Don't empty outDir when building prepend (to keep main build)
    emptyOutDir: entry === 'main',
  },
});

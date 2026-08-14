import { defineConfig } from 'tsdown'

/**
 * The Electron app ships two Node bundles: the main-process entry and the
 * preload bridge. `electron` stays external because the Electron runtime
 * provides it; everything else (node builtins and the tiny launcher module)
 * bundles into dist.
 */
export default defineConfig({
  entry: ['lib/types/main.js', 'lib/types/preload.js'],
  outDir: 'dist',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: true,
  deps: {
    neverBundle: ['electron'],
  },
})

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  outDir: 'dist-electron',
  clean: true,
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  splitting: false,
  external: ['electron'],
})

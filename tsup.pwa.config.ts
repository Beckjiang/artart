import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    pwaServer: 'server/pwaServer.ts',
  },
  outDir: 'dist-server',
  clean: true,
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  splitting: false,
})


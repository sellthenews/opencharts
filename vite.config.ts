import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'lightweight-charts': resolve(
        root,
        'vendor/lightweight-charts@5.3.0/lightweight-charts.standalone.production.mjs',
      ),
    },
  },
  build: {
    outDir: 'site',
    emptyOutDir: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});

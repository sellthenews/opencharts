import { readdirSync, writeFileSync } from 'node:fs';
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
  plugins: [
    {
      name: 'version-json',
      closeBundle() {
        const dir = resolve(root, 'site/assets');
        try {
          const files = readdirSync(dir);
          const js = files.find((f) => /^index-.*\.js$/.test(f));
          const css = files.find((f) => /^index-.*\.css$/.test(f));
          if (!js) return;
          writeFileSync(resolve(root, 'site/version.json'), `${JSON.stringify({ js, css, t: Date.now() })}\n`);
        } catch {
          /* preview without a prior build */
        }
      },
    },
  ],
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

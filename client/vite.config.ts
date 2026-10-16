import { fileURLToPath } from 'node:url';
import { foldkit } from '@foldkit/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [foldkit(), tailwindcss()],
  build: {
    outDir: '../public/app',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        entry: fileURLToPath(new URL('./src/entry.ts', import.meta.url)),
        welcome: fileURLToPath(new URL('./src/welcome.ts', import.meta.url)),
        site: fileURLToPath(new URL('./src/site.css', import.meta.url)),
      },
    },
  },
});

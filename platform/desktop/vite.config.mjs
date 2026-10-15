import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const repository = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root,
  base: './',
  clearScreen: false,
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { preserveSymlinks: true, alias: { '/platform': `${repository}/platform` } },
  server: { host: '127.0.0.1', port: 1420, strictPort: true, fs: { allow: [repository] } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'safari15' },
});

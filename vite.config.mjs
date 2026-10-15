import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: 'platform/web',
  resolve: { alias: { '@': fileURLToPath(new URL('./platform/web/src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/dashboard': 'http://127.0.0.1:3100', '/api': 'http://127.0.0.1:3100', '/healthz': 'http://127.0.0.1:3100' } }
});

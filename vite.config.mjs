import { defineConfig } from 'vite';
import { ainsUiI18n } from './platform/web/i18n-transform.mjs';
export default defineConfig({
  root: 'platform/web',
  plugins: [ainsUiI18n()],
  oxc: { jsx: { runtime: 'automatic' } },
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/dashboard': 'http://127.0.0.1:3100', '/api': 'http://127.0.0.1:3100', '/healthz': 'http://127.0.0.1:3100' } }
});

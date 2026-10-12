import { defineConfig } from 'vite';

// The Referee's browser UI. In development it proxies /api to the local service on 4242.
// `npm run build:app` writes dist-app/, which the service serves at http://127.0.0.1:4242.
export default defineConfig({
  root: 'app',
  base: './',
  build: { outDir: '../dist-app', emptyOutDir: true },
  server: { port: 5174, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:4242', ws: false } } },
});

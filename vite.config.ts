import { defineConfig } from 'vite';

// Relative asset paths, so the build works at any URL (GitHub Pages serves it under /mytradepilot/).
export default defineConfig({
  base: './',
});

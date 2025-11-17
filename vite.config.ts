import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@game': fileURLToPath(new URL('./src/game', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@types': fileURLToPath(new URL('./src/types.ts', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/game/ai', import.meta.url)),
    },
  },
});

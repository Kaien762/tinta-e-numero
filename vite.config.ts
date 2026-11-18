import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5173 },
  preview: { port: 4173 },
  // o three.js sozinho passa de 500 kB; o jogo é uma página só
  build: { chunkSizeWarningLimit: 800 },
});

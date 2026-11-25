import { defineConfig } from 'vite';
// viz-sandbox.html es el entorno aislado de las visualizaciones (iframe sin allow-same-origin):
// su origen es opaco, así que sus scripts se piden con CORS.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', rollupOptions: { input: { main: 'index.html', sandbox: 'viz-sandbox.html' } } },
  server: { cors: true },
  preview: { cors: true }
});

import { defineConfig } from 'vite';

export default defineConfig({
  // En GitHub Pages la app vive en /nombre-del-repo/
  // En local usamos rutas relativas (./)
  base: process.env.BASE_PATH || './',
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    // En desarrollo, `npm run dev:api` arranca el Worker en el puerto 8787
    proxy: { '/api': 'http://localhost:8787' },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    // The publisher serves this directory as-is at apps.charliekrug.com/darwins-garage/.
    outDir: 'site',
  },
});

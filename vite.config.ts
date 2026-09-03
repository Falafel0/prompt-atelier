import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

const edition = process.env.PROMPT_ATELIER_EDITION === 'public' ? 'public' : 'owner'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __ATELIER_EDITION__: JSON.stringify(edition),
  },
  build: {
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), packStudio: resolve(__dirname, 'pack-studio.html') },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/zustand')) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('packStudio') || id.includes('studioExtras') || id.includes('packStudioResponsive') || id.includes('doll-silhouette')) return 'pack-studio-tools';
        },
      },
    },
  },
})

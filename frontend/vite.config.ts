import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'charts';
            if (id.includes('leaflet') || id.includes('react-leaflet')) return 'map';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
            if (id.includes('@tanstack') || id.includes('axios')) return 'query';
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});

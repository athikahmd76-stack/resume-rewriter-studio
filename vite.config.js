import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base so the built app works from any static host
  // (GitHub Pages sub-paths, Netlify, Vercel, Cloudflare Pages, local previews).
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 2400,
    rollupOptions: {
      output: {
        // Heavy, lazily loaded libraries get their own chunk so the first paint
        // stays small. `onlyExplicitManualChunks` keeps every module a chunk
        // pulls in inside that same chunk - splitting a CommonJS package away
        // from its interop helpers breaks at runtime in the browser.
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('pdfjs-dist') || id.includes('pdfjs')) return 'pdfjs';
          if (id.includes('tesseract.js') || id.includes('@tesseract.js-')) return 'tesseract';
          if (id.includes('html2canvas')) return 'html2canvas';
          if (id.includes('jspdf')) return 'jspdf';
          if (id.includes('mammoth')) return 'mammoth';
          if (id.includes('/docx/')) return 'docx';
          if (id.includes('lucide-react')) return 'icons';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  worker: {
    format: 'es',
  },
});

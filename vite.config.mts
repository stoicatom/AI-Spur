import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        overlay: path.resolve(__dirname, 'overlay.html'),
        settings: path.resolve(__dirname, 'settings.html'),
      },
      output: {
        // Split heavy runtime dependencies into their own chunks so the main
        // bundle can be re-downloaded without pulling React/Framer Motion along.
        manualChunks: {
          'react-runtime': ['react', 'react-dom'],
          'framer-motion': ['framer-motion'],
        },
      },
    },
  },
});

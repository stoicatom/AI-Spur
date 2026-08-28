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
        // Keep the settings runtime independent from the overlay and split
        // the heavy Three family layers by their stable domain prefix. This
        // lets a material family be cached independently and keeps a future
        // family addition from inflating one monolithic `three-effects` file.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three-runtime';
          if (id.includes('node_modules/react')) return 'react-runtime';
          if (id.includes('node_modules/framer-motion')) return 'framer-motion';
          const family = id.match(/three-family-(cosmic|impact|natural|rhythm|weapon)/)?.[1];
          if (family) return `three-effect-family-${family}`;
          if (id.endsWith('/src/overlay/three-effects.ts')) return 'three-effect-core';
          if (id.includes('/src/overlay/effects-')) return 'canvas-effect-presets';
          return undefined;
        },
      },
    },
  },
});

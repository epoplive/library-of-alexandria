import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// For GitHub Pages: build with VITE_BASE_PATH=/repo-name/ npm run build
// Default '/' works for local dev + custom-domain deployments.
const base = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    // Required for ONNX Runtime Web multi-threaded WASM (used by kokoro-js).
    // Without these, WASM runs single-threaded on the main thread and freezes the UI.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
  },
  optimizeDeps: {
    exclude: ['kokoro-js', 'onnxruntime-web'],
  },
});

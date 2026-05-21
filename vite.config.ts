
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
  server: {
    host: '0.0.0.0',
    port: 10617,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:10618',
        changeOrigin: true,
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // В dev-режиме запросы к API проксируются на сервер
    proxy: {
      '/students': 'http://localhost:3000',
      '/payments': 'http://localhost:3000',
      '/debtors': 'http://localhost:3000',
    },
  },
});

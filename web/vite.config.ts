import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// В dev-режиме запросы к API проксируются на сервер
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/students': apiUrl,
      '/payments': apiUrl,
      '/debtors': apiUrl,
      '/subjects': apiUrl,
      '/groups': apiUrl,
      '/analytics': apiUrl,
    },
  },
});

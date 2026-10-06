import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { setupFiles: ['./src/test-setup.tsx'] },
  server: { port: 5173, proxy: { '/api': { target: 'http://localhost:2301', rewrite: (path) => path.replace(/^\/api(?=\/|\?|$)/, '') || '/' } } },
});

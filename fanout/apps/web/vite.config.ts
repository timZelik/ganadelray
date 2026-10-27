import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiOrigin = process.env.FANOUT_API_ORIGIN ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, proxy: { '/api': apiOrigin, '/admin': apiOrigin } },
  preview: { port: 4173 },
  build: { chunkSizeWarningLimit: 700 },
});

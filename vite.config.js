import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact()],
  server: {
    host: true, // expose on LAN so you can open it on a real phone
    port: 5173,
  },
});

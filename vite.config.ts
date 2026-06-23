import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {},
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        // Allow Firebase Auth redirect to communicate back after OAuth.
        // 'same-origin' blocks window.closed and breaks signInWithPopup/Redirect.
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'unsafe-none',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },
  };
});

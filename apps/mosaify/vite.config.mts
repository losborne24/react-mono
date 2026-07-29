/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/mosaify',
  // GitHub Pages serves this app from a project subpath
  // (<user>.github.io/react-mono/mosaify/). Only apply the base for the
  // production build so local dev + the Spotify OAuth 127.0.0.1:4200 origin
  // stay at '/'.
  base: command === 'build' ? '/react-mono/mosaify/' : '/',
  server: {
    port: 4200,
    // Match the Spotify OAuth redirect URI origin (127.0.0.1, not localhost).
    // sessionStorage is per-origin; a localhost/127.0.0.1 split loses the PKCE
    // verifier + state across the redirect, breaking the token exchange.
    host: '127.0.0.1',
  },
  preview: {
    port: 4200,
    // Match the Spotify OAuth redirect URI origin (127.0.0.1, not localhost).
    // sessionStorage is per-origin; a localhost/127.0.0.1 split loses the PKCE
    // verifier + state across the redirect, breaking the token exchange.
    host: '127.0.0.1',
  },
  plugins: [react(), tailwindcss()],
  // The mosaic match runs in an ES module worker (mosaic-match.worker.ts) that imports a
  // shared module, so it must be emitted as ESM for the production build.
  worker: {
    format: 'es',
  },
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'mosaify',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}));

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Tests must never use your real .env or touch the real Supabase project: the two values are forced empty here.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'scripts/**/*.test.mjs'],
    // every database-rule test file starts its own in-memory Postgres (WebAssembly); on a machine with many cores, starting a dozen at once crashed workers at random
    maxWorkers: 6,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_ALLOW_DEMO: '' },
  },
});

// Runs only the known-gap checks (they are expected to fail today). Use: npm run test:gaps
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['scripts/known-gaps.check.mjs'], env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' } },
});

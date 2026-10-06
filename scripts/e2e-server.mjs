// Starts the website for the browser tests: builds it in DEMO mode (mock data, no Supabase) into dist-e2e and serves that build.
// Demo mode is used on purpose: the browser tests must never touch a real database or create real accounts.
import { spawn, spawnSync } from 'node:child_process';

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', VITE_ALLOW_DEMO: 'true' };
const build = spawnSync('npx', ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], { env, stdio: 'inherit', shell: true });
if (build.status !== 0) process.exit(build.status || 1);
spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', '4189', '--strictPort', '--host', '127.0.0.1'], { env, stdio: 'inherit', shell: true });

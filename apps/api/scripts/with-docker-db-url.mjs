import { spawn } from 'node:child_process';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node apps/api/scripts/with-docker-db-url.mjs <command> [args...]');
  process.exit(64);
}

const user = process.env.DB_USER || 'cinehorizon';
const password = process.env.DB_PASSWORD || 'changeme_db';
const host = process.env.DB_HOST || 'db';
const port = process.env.DB_PORT || '5432';
const database = process.env.DB_NAME || 'cinehorizon';

const databaseUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;

const child = spawn(args[0], args.slice(1), {
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});

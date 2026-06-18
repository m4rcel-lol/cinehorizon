// Single-service launcher for Render: the API and the BullMQ worker run in the
// same container so they can share one persistent disk (media + JWT keys).
//
// Order: ensure JWT keys exist on the disk -> push schema + seed -> run
// server.js and worker.js together, forwarding signals and exiting if either
// child dies so Render restarts the whole service.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || '/var/data/keys/private.pem';
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || '/var/data/keys/public.pem';
const mediaDir = process.env.LOCAL_MEDIA_DIR || '/var/data/media';

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

// 1. Persisted JWT keys. The disk survives deploys, so we generate once and
//    reuse. (The app's ensure-jwt-keys.mjs refuses to generate in production;
//    here we do it explicitly because the disk is durable, not ephemeral.)
fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });
fs.mkdirSync(mediaDir, { recursive: true });
if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
  console.log('[start-render] generating JWT keys on persistent disk');
  run('openssl', ['genrsa', '-out', privateKeyPath, '4096']);
  run('openssl', ['rsa', '-in', privateKeyPath, '-pubout', '-out', publicKeyPath]);
}

// 2. Schema + seed. db:push/seed read DATABASE_URL, which Render injects from
//    the managed Postgres. Seeding is idempotent and provisions the admin from
//    ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD.
console.log('[start-render] applying schema and seeding');
run('pnpm', ['--filter', '@cinehorizon/db', 'db:push']);
run('pnpm', ['--filter', '@cinehorizon/db', 'db:seed']);

// 3. Run server + worker together.
const children = [];
let shuttingDown = false;

function startChild(name, file) {
  const child = spawn('node', [file], { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[start-render] ${name} exited (code=${code} signal=${signal}); shutting down`);
    shutdown(signal || 'SIGTERM');
  });
  children.push(child);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill(signal);
  }
  // Give children a moment to clean up, then exit non-zero so Render restarts.
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[start-render] launching api server + transcode worker');
startChild('api', 'apps/api/dist/server.js');
startChild('worker', 'apps/api/dist/worker.js');

// Keep the Discord bot showing "Online" by holding a gateway connection open
// for the life of this always-on container. No-ops if no token is configured.
if (process.env.DISCORD_BOT_TOKEN) {
  startChild('presence', 'apps/api/scripts/bot-presence.mjs');
}

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const privateKeyPath = process.env.JWT_PRIVATE_KEY_PATH || './keys/private.pem';
const publicKeyPath = process.env.JWT_PUBLIC_KEY_PATH || './keys/public.pem';
const isProduction = process.env.NODE_ENV === 'production';

function exists(filePath) {
  return fs.existsSync(filePath);
}

function runOpenSsl(args) {
  const result = spawnSync('openssl', args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`openssl ${args.join(' ')} failed with exit code ${result.status ?? 1}`);
  }
}

async function main() {
  const hasPrivateKey = exists(privateKeyPath);
  const hasPublicKey = exists(publicKeyPath);
  if (hasPrivateKey && hasPublicKey) return;

  if (isProduction) {
    console.error(`JWT keys are missing. Expected ${privateKeyPath} and ${publicKeyPath}. Generate and mount keys before production startup.`);
    process.exit(1);
  }

  await Promise.all([
    fsp.mkdir(path.dirname(privateKeyPath), { recursive: true }),
    fsp.mkdir(path.dirname(publicKeyPath), { recursive: true })
  ]);

  if (!hasPrivateKey) {
    runOpenSsl(['genrsa', '-out', privateKeyPath, '4096']);
  }
  runOpenSsl(['rsa', '-in', privateKeyPath, '-pubout', '-out', publicKeyPath]);

  await Promise.all([
    fsp.chmod(privateKeyPath, 0o600).catch(() => undefined),
    fsp.chmod(publicKeyPath, 0o644).catch(() => undefined)
  ]);

  console.log(`Generated local development JWT keys at ${privateKeyPath} and ${publicKeyPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

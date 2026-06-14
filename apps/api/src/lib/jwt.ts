import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
}

function readKey(path: string) {
  if (!fs.existsSync(path)) {
    throw new Error(`JWT key not found at ${path}. Run infra/scripts/setup.sh or let docker compose generate local development keys before starting the API.`);
  }
  return fs.readFileSync(path, 'utf8');
}

export function assertJwtKeys() {
  readKey(env.JWT_PRIVATE_KEY_PATH);
  readKey(env.JWT_PUBLIC_KEY_PATH);
}

export function signAccessToken(payload: AccessTokenPayload) {
  const privateKey = readKey(env.JWT_PRIVATE_KEY_PATH);
  return jwt.sign(payload, privateKey, { algorithm: 'RS256', expiresIn: env.ACCESS_TOKEN_TTL });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const publicKey = readKey(env.JWT_PUBLIC_KEY_PATH);
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as AccessTokenPayload;
}

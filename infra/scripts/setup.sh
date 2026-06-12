#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ ! -f .env ]; then cp .env.example .env; fi
mkdir -p keys
if [ ! -f keys/private.pem ]; then
  openssl genrsa -out keys/private.pem 4096
  openssl rsa -in keys/private.pem -pubout -out keys/public.pem
fi
echo "Fill .env if needed, then run: docker compose up --build"
